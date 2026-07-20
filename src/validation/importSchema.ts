import type { ImportValidationResult, RuntimeSnapshot } from '../types/domain';
import { StateStore } from '../state/StateStore';

export const MAX_JSON_BYTES = 5_000_000;
export const MAX_JSON_DEPTH = 100;
export const MAX_JSON_NODES = 100_000;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const utf8Encoder = new TextEncoder();

interface JsonNode {
  value: unknown;
  path: string;
  depth: number;
}

type JsonScanFrame =
  | { kind: 'object'; state: 'keyOrEnd' | 'colon' | 'value' | 'commaOrEnd'; keys: Set<string> }
  | { kind: 'array'; state: 'valueOrEnd' | 'commaOrEnd' };

/** Detect duplicate decoded object keys before JSON.parse can overwrite them. */
function duplicateJsonKey(text: string): string | null {
  const stack: JsonScanFrame[] = [];
  let rootConsumed = false;
  let index = 0;
  const whitespace = (): void => {
    while (/\s/.test(text[index] ?? '')) index += 1;
  };
  const stringToken = (): string | null => {
    const start = index++;
    let escaped = false;
    while (index < text.length) {
      const character = text[index++]!;
      if (character === '"' && !escaped) {
        try {
          return JSON.parse(text.slice(start, index)) as string;
        } catch {
          return null;
        }
      }
      if (character === '\\' && !escaped) escaped = true;
      else escaped = false;
    }
    return null;
  };
  const consumeParentValue = (): boolean => {
    const parent = stack.at(-1);
    if (!parent) {
      if (rootConsumed) return false;
      rootConsumed = true;
      return true;
    }
    if (parent.kind === 'object' && parent.state === 'value') {
      parent.state = 'commaOrEnd';
      return true;
    }
    if (parent.kind === 'array' && parent.state === 'valueOrEnd') {
      parent.state = 'commaOrEnd';
      return true;
    }
    return false;
  };
  const consumeValue = (): boolean => {
    whitespace();
    const character = text[index];
    if (!consumeParentValue() || character === undefined) return false;
    if (character === '{') {
      index += 1;
      stack.push({ kind: 'object', state: 'keyOrEnd', keys: new Set() });
      return stack.length <= MAX_JSON_DEPTH + 1;
    }
    if (character === '[') {
      index += 1;
      stack.push({ kind: 'array', state: 'valueOrEnd' });
      return stack.length <= MAX_JSON_DEPTH + 1;
    }
    if (character === '"') return stringToken() !== null;
    const start = index;
    while (index < text.length && !/[\s,\]}]/.test(text[index]!)) index += 1;
    return index > start;
  };

  while (index < text.length) {
    whitespace();
    if (index >= text.length) break;
    const frame = stack.at(-1);
    if (!frame) {
      if (!consumeValue()) return null;
      continue;
    }
    const character = text[index];
    if (frame.kind === 'object') {
      if (frame.state === 'keyOrEnd') {
        if (character === '}') {
          index += 1;
          stack.pop();
          continue;
        }
        if (character !== '"') return null;
        const key = stringToken();
        if (key === null) return null;
        if (frame.keys.has(key)) return key;
        frame.keys.add(key);
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (character !== ':') return null;
        index += 1;
        frame.state = 'value';
      } else if (frame.state === 'value') {
        if (!consumeValue()) return null;
      } else if (character === ',') {
        index += 1;
        frame.state = 'keyOrEnd';
      } else if (character === '}') {
        index += 1;
        stack.pop();
      } else return null;
    } else if (frame.state === 'valueOrEnd') {
      if (character === ']') {
        index += 1;
        stack.pop();
      } else if (!consumeValue()) return null;
    } else if (character === ',') {
      index += 1;
      frame.state = 'valueOrEnd';
    } else if (character === ']') {
      index += 1;
      stack.pop();
    } else return null;
  }
  return null;
}

function asLegacyRunSnapshot(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const run = value as Record<string, unknown>;
  if (run.schemaVersion !== 2 || run.generator !== 'pendulum-lab-modern-lab') return value;

  // New v2 exports carry an exact nested session while preserving the public
  // numeric envelope version. Prefer it and let StateStore perform all schema
  // and numerical validation.
  if (run.runtimeSnapshot !== undefined) return run.runtimeSnapshot;

  // Migration for historical v2 files created before exact session metadata
  // was embedded. Defaults match that exporter and remain explicit here so
  // old reproducibility artifacts continue to load after the format upgrade.
  return {
    schemaVersion: 'pendulum-session/v10-ts',
    systemType: run.system,
    method: run.method,
    mode: 'demo',
    dt: run.dt,
    tolerance: 1e-7,
    stepsPerFrame: 6,
    damping: run.gamma,
    parameters: run.parameters,
    state: run.finalState,
    simTime: run.simTime,
    seed: null
  };
}

/** Inspect an already-parsed JSON graph without consuming the JavaScript call stack. */
function inspectJsonTree(root: unknown): string | null {
  const stack: JsonNode[] = [{ value: root, path: '$', depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop()!;
    visited += 1;
    if (visited > MAX_JSON_NODES) return `JSON import exceeds ${MAX_JSON_NODES.toLocaleString()} nodes`;
    if (node.value === null || typeof node.value !== 'object') continue;

    const record = node.value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 0 && node.depth >= MAX_JSON_DEPTH) {
      return `JSON import exceeds maximum depth ${MAX_JSON_DEPTH} at ${node.path}`;
    }
    // Every direct child is necessarily another JSON node. Reject before
    // allocating an oversized work stack when a single container exceeds the cap.
    if (visited + stack.length + keys.length > MAX_JSON_NODES) {
      return `JSON import exceeds ${MAX_JSON_NODES.toLocaleString()} nodes`;
    }
    for (let i = keys.length - 1; i >= 0; i -= 1) {
      const key = keys[i]!;
      const childPath = Array.isArray(node.value) ? `${node.path}[${key}]` : `${node.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) return `prototype-pollution key is not allowed at ${childPath}`;
      stack.push({ value: record[key], path: childPath, depth: node.depth + 1 });
    }
  }
  return null;
}

export function parseStrictJsonImport(text: string): ImportValidationResult<RuntimeSnapshot> {
  if (text.length > MAX_JSON_BYTES || utf8Encoder.encode(text).byteLength > MAX_JSON_BYTES) {
    return { ok: false, problems: ['JSON import exceeds 5 MB in UTF-8'] };
  }
  const duplicateKey = duplicateJsonKey(text);
  if (duplicateKey !== null) return { ok: false, problems: [`duplicate JSON key is not allowed: ${duplicateKey}`] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return { ok: false, problems: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const structuralProblem = inspectJsonTree(parsed);
  if (structuralProblem) return { ok: false, problems: [structuralProblem] };
  const validation = StateStore.validate(asLegacyRunSnapshot(parsed));
  if (validation.ok && validation.value) {
    return { ok: true, problems: [], value: validation.value };
  }
  return { ok: false, problems: validation.problems };
}
