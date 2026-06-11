import type { ImportValidationResult, RuntimeSnapshot } from '../types/domain';
import { StateStore } from '../state/StateStore';

const MAX_JSON_BYTES = 5_000_000;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function findDangerousKey(value: unknown, path = '$'): string | null {
  if (value === null || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (DANGEROUS_KEYS.has(key)) return childPath;
    const nested = findDangerousKey(child, childPath);
    if (nested) return nested;
  }
  return null;
}

export function parseStrictJsonImport(text: string): ImportValidationResult<RuntimeSnapshot> {
  const problems: string[] = [];
  if (text.length > MAX_JSON_BYTES) return { ok: false, problems: ['JSON import exceeds 5 MB'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return { ok: false, problems: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const dangerousPath = findDangerousKey(parsed);
  if (dangerousPath) problems.push(`prototype-pollution key is not allowed at ${dangerousPath}`);
  const validation = StateStore.validate(parsed);
  const mergedProblems = [...problems, ...validation.problems];
  if (problems.length === 0 && validation.ok && validation.value) {
    return { ok: true, problems: [], value: validation.value };
  }
  return { ok: false, problems: mergedProblems };
}

export function installJsonImportGuard(inputId = 'jsonFile'): void {
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener(
    'change',
    (event) => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_JSON_BYTES) {
        event.stopImmediatePropagation();
        if (typeof window.toast === 'function') window.toast('Import rejected: JSON file is too large', 2400);
        input.value = '';
      }
    },
    { capture: true }
  );
}
