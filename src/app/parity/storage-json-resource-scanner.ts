/** Limits enforced by the lexical pass before a whole JSON document is parsed. */
export interface JsonResourceLimits {
  depth: number;
  nodes: number;
  arrayItems: number;
  objectProperties: number;
  stringCodeUnits: number;
  totalStringCodeUnits: number;
  keyCodeUnits: number;
}

export interface JsonResourceScanStats {
  nodes: number;
  maxDepth: number;
  maxArrayItems: number;
  maxObjectProperties: number;
  stringCodeUnits: number;
}

export type JsonResourceScanResult =
  | { ok: true; stats: JsonResourceScanStats }
  | {
      ok: false;
      code: 'IMPORT_COMPLEXITY_LIMIT' | 'IMPORT_DUPLICATE_KEY' | 'IMPORT_DANGEROUS_KEY';
      message: string;
    };

type JsonScanFailure = Extract<JsonResourceScanResult, { ok: false }>;
type JsonScanFrame =
  | {
      kind: 'object';
      state: 'keyOrEnd' | 'colon' | 'value' | 'commaOrEnd';
      keys: Set<string>;
      properties: number;
    }
  | { kind: 'array'; state: 'valueOrEnd' | 'commaOrEnd'; items: number };

const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Scan JSON iteratively before JSON.parse allocates the complete object graph.
 * The full parser remains the syntax authority; this pass bounds resources and
 * detects decoded duplicate/dangerous keys while their provenance is intact.
 */
export function scanJsonResources(text: string, limits: JsonResourceLimits): JsonResourceScanResult {
  const stack: JsonScanFrame[] = [];
  let rootConsumed = false;
  let index = 0;
  let nodes = 0;
  let maxDepth = 0;
  let maxArrayItems = 0;
  let maxObjectProperties = 0;
  let stringCodeUnits = 0;

  const whitespace = (): void => {
    while (/\s/.test(text[index] ?? '')) index += 1;
  };

  const stringToken = (): string | null => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const character = text[index];
      index += 1;
      if (character === '"' && !escaped) {
        const rawLength = index - start;
        // An escaped JSON code unit can occupy at most six source characters.
        if (rawLength > limits.stringCodeUnits * 6 + 2) return null;
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

  const consumeParentValue = (): JsonScanFailure | null => {
    const parent = stack.at(-1);
    if (!parent) {
      if (rootConsumed) return null;
      rootConsumed = true;
    } else if (parent.kind === 'object' && parent.state === 'value') {
      parent.state = 'commaOrEnd';
    } else if (parent.kind === 'array' && parent.state === 'valueOrEnd') {
      parent.items += 1;
      maxArrayItems = Math.max(maxArrayItems, parent.items);
      if (parent.items > limits.arrayItems) {
        return {
          ok: false,
          code: 'IMPORT_COMPLEXITY_LIMIT',
          message: `JSON array exceeds the ${limits.arrayItems.toLocaleString()} item limit`
        };
      }
      parent.state = 'commaOrEnd';
    } else return null;

    nodes += 1;
    if (nodes > limits.nodes) {
      return {
        ok: false,
        code: 'IMPORT_COMPLEXITY_LIMIT',
        message: `JSON document exceeds the ${limits.nodes.toLocaleString()} node limit`
      };
    }
    return null;
  };

  const consumeValue = (): JsonScanFailure | null => {
    whitespace();
    const character = text[index];
    const parentFailure = consumeParentValue();
    if (parentFailure) return parentFailure;
    if (character === undefined) return null;
    if (character === '{') {
      index += 1;
      stack.push({ kind: 'object', state: 'keyOrEnd', keys: new Set(), properties: 0 });
      maxDepth = Math.max(maxDepth, stack.length);
      if (stack.length > limits.depth) {
        return {
          ok: false,
          code: 'IMPORT_COMPLEXITY_LIMIT',
          message: `JSON document exceeds the maximum depth ${limits.depth}`
        };
      }
      return null;
    }
    if (character === '[') {
      index += 1;
      stack.push({ kind: 'array', state: 'valueOrEnd', items: 0 });
      maxDepth = Math.max(maxDepth, stack.length);
      if (stack.length > limits.depth) {
        return {
          ok: false,
          code: 'IMPORT_COMPLEXITY_LIMIT',
          message: `JSON document exceeds the maximum depth ${limits.depth}`
        };
      }
      return null;
    }
    if (character === '"') {
      const token = stringToken();
      if (token === null || token.length > limits.stringCodeUnits) {
        return {
          ok: false,
          code: 'IMPORT_COMPLEXITY_LIMIT',
          message: `JSON string exceeds the ${limits.stringCodeUnits.toLocaleString()} code-unit limit or is unterminated`
        };
      }
      stringCodeUnits += token.length;
      if (stringCodeUnits > limits.totalStringCodeUnits) {
        return {
          ok: false,
          code: 'IMPORT_COMPLEXITY_LIMIT',
          message: `JSON strings exceed the ${limits.totalStringCodeUnits.toLocaleString()} aggregate code-unit limit`
        };
      }
      return null;
    }
    const start = index;
    while (index < text.length && !/[\s,\]}]/.test(text[index]!)) index += 1;
    // JSON.parse performs grammar validation. This scanner only needs to make
    // forward progress while enforcing resource limits before that parse.
    if (index === start) index += 1;
    return null;
  };

  while (index < text.length) {
    whitespace();
    if (index >= text.length) break;
    const frame = stack.at(-1);
    if (!frame) {
      const failure = consumeValue();
      if (failure) return failure;
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
        if (character !== '"') {
          index += 1;
          continue;
        }
        const key = stringToken();
        if (key === null) continue;
        if (key.length > limits.keyCodeUnits) {
          return {
            ok: false,
            code: 'IMPORT_COMPLEXITY_LIMIT',
            message: `JSON object key exceeds the ${limits.keyCodeUnits.toLocaleString()} code-unit limit`
          };
        }
        if (frame.keys.has(key)) {
          return { ok: false, code: 'IMPORT_DUPLICATE_KEY', message: `Duplicate JSON key is not allowed: ${key}` };
        }
        if (DANGEROUS_JSON_KEYS.has(key)) {
          return {
            ok: false,
            code: 'IMPORT_DANGEROUS_KEY',
            message: `Prototype-pollution key is not allowed: ${key}`
          };
        }
        frame.keys.add(key);
        frame.properties += 1;
        maxObjectProperties = Math.max(maxObjectProperties, frame.properties);
        if (frame.properties > limits.objectProperties) {
          return {
            ok: false,
            code: 'IMPORT_COMPLEXITY_LIMIT',
            message: `JSON object exceeds the ${limits.objectProperties.toLocaleString()} property limit`
          };
        }
        stringCodeUnits += key.length;
        if (stringCodeUnits > limits.totalStringCodeUnits) {
          return {
            ok: false,
            code: 'IMPORT_COMPLEXITY_LIMIT',
            message: `JSON strings exceed the ${limits.totalStringCodeUnits.toLocaleString()} aggregate code-unit limit`
          };
        }
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (character === ':') {
          index += 1;
          frame.state = 'value';
        } else index += 1;
      } else if (frame.state === 'value') {
        const failure = consumeValue();
        if (failure) return failure;
      } else if (character === ',') {
        index += 1;
        frame.state = 'keyOrEnd';
      } else if (character === '}') {
        index += 1;
        stack.pop();
      } else index += 1;
    } else if (frame.state === 'valueOrEnd') {
      if (character === ']') {
        index += 1;
        stack.pop();
      } else {
        const failure = consumeValue();
        if (failure) return failure;
      }
    } else if (character === ',') {
      index += 1;
      frame.state = 'valueOrEnd';
    } else if (character === ']') {
      index += 1;
      stack.pop();
    } else index += 1;
  }

  return { ok: true, stats: { nodes, maxDepth, maxArrayItems, maxObjectProperties, stringCodeUnits } };
}
