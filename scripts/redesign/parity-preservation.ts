/** Explicit S28 exceptions never rewrite the frozen S01 source or AST inventory. */
import { existsSync, readFileSync } from 'node:fs';
import type { Inventory, InventoryItem } from './inventory';
import { evidencePath, sourceHash, type EvidenceDigest } from './parity-capture';
import { validatePreservationCases, type PreservationCaseBinding } from './parity-certificate';

export const PRESERVATION_LEDGER_PATH = 'documents/redesign/parity/S28-preservation-exceptions.json';
const allowed = new Map([
  ['src/app/SimulationClock.ts', 'additive-native-clock-api/v1'],
  ['scripts/copy-legacy-assets.mjs', 'additive-generated-output-option/v1']
]);
export interface PreservationException {
  readonly id: string;
  readonly path: string;
  readonly stage: 28;
  readonly kind: string;
  readonly baselineSha256: string;
  readonly before: { readonly gitCommit: string; readonly gitBlob: string; readonly sourceSha256: string };
  readonly currentSha256: string;
  readonly reason: string;
  readonly preservedContract: readonly string[];
  readonly addedFactIds: readonly string[];
  readonly locationOnlyFactIds: readonly string[];
  readonly requiredSources: readonly string[];
  readonly capture: EvidenceDigest | null;
  readonly cases: readonly PreservationCaseBinding[];
}
export interface PreservationExceptionResult extends PreservationException {
  readonly status: 'declared-unverified' | 'verified';
  readonly proofErrors: readonly string[];
  readonly characterizationRequirements: readonly { readonly file: string; readonly title: string }[];
}
export interface PreservationLedgerResult {
  readonly path: string;
  readonly entries: readonly PreservationExceptionResult[];
  readonly errors: readonly string[];
}
const sha = /^[a-f0-9]{64}$/,
  git = /^[a-f0-9]{40}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function requiredPreservationCases(file: string): readonly { readonly file: string; readonly title: string }[] {
  if (file === 'src/app/SimulationClock.ts')
    return [
      ...(['deterministic', 'wall-clock'] as const).flatMap((mode) =>
        [0.1, 1, 1.7, 4].map((speed) => ({
          file: 'tests/product/lab/clock-legacy-differential.test.ts',
          title: `S28 immutable pre-extension clock differential ${mode} ${speed}x preserves old frame counts, real native states, debt/drop and both reset modes`
        }))
      ),
      ...[
        'restores finite versioned primitive state atomically without aliases or invoking accessors',
        'accounts zero actual worker steps without weakening old advance zero-budget validation',
        'rejects impossible accounting atomically and retains native dropped-time bounds'
      ].map((title) => ({
        file: 'tests/product/lab/playback-transaction.test.ts',
        title: `S28 additive native clock checkpoint boundary ${title}`
      }))
    ];
  if (file === 'scripts/copy-legacy-assets.mjs')
    return [
      'matches every default output byte of the immutable pre-S28 native copier on identical inputs',
      'copies every legacy supporting asset into the selected frozen build without touching another dist',
      'rejects traversal, source directories and a junction before any copy'
    ].map((title) => ({
      file: 'tests/product/parity/packaging.test.ts',
      title: `S28 packaged build evidence ${title}`
    }));
  return [];
}
export function validatePreservationLedger(
  root: string,
  input: unknown,
  baseline: Inventory
): PreservationLedgerResult {
  const entries: PreservationExceptionResult[] = [],
    errors: string[] = [];
  if (
    !record(input) ||
    input.schema !== 'pendulum-preservation-exceptions/v1' ||
    input.stage !== 28 ||
    !Array.isArray(input.exceptions)
  )
    return { path: PRESERVATION_LEDGER_PATH, entries, errors: ['Unsupported explicit preservation exception ledger.'] };
  const seen = new Set<string>();
  for (const raw of input.exceptions) {
    try {
      if (!record(raw)) throw new Error('Exception must be plain versioned data.');
      const entry = raw as unknown as PreservationException;
      if (
        !allowed.has(entry.path) ||
        entry.kind !== allowed.get(entry.path) ||
        entry.stage !== 28 ||
        typeof entry.id !== 'string' ||
        !entry.id.length ||
        seen.has(entry.path)
      )
        throw new Error('Unknown, duplicate or unsupported S28 preservation exception.');
      seen.add(entry.path);
      const original = baseline.files.find((file) => file.ownerFile === entry.path);
      if (
        !original ||
        entry.baselineSha256 !== original.sha256 ||
        !sha.test(entry.currentSha256) ||
        sourceHash(root, entry.path) !== entry.currentSha256 ||
        !entry.before ||
        !git.test(entry.before.gitCommit) ||
        !git.test(entry.before.gitBlob) ||
        entry.before.sourceSha256 !== entry.baselineSha256
      )
        throw new Error(`Exception baseline/before/current source identities are invalid: ${entry.path}`);
      if (
        typeof entry.reason !== 'string' ||
        entry.reason.length < 50 ||
        !Array.isArray(entry.preservedContract) ||
        !entry.preservedContract.length ||
        entry.preservedContract.some((contract) => typeof contract !== 'string' || contract.length < 30) ||
        !Array.isArray(entry.addedFactIds) ||
        !Array.isArray(entry.locationOnlyFactIds) ||
        !Array.isArray(entry.requiredSources) ||
        !entry.requiredSources.includes(entry.path) ||
        new Set([...entry.addedFactIds, ...entry.locationOnlyFactIds]).size !==
          entry.addedFactIds.length + entry.locationOnlyFactIds.length
      )
        throw new Error(
          `Exception needs a specific preserved contract and unique exact AST/source scope: ${entry.path}`
        );
      for (const id of entry.locationOnlyFactIds)
        if (!baseline.facts.some((fact) => fact.id === id && fact.ownerFile === entry.path))
          throw new Error(`Unknown baseline fact in exception: ${id}`);
      for (const id of entry.addedFactIds)
        if (baseline.facts.some((fact) => fact.id === id) || !id.includes(`:${entry.path}#`))
          throw new Error(`Invalid added fact in exception: ${id}`);
      const characterizationRequirements = requiredPreservationCases(entry.path);
      const missing = characterizationRequirements.filter(
        (required) =>
          !Array.isArray(entry.cases) ||
          !entry.cases.some(
            (binding) => binding.file === required.file && binding.title === required.title && binding.project === null
          )
      );
      const proof = !entry.capture
        ? { valid: false, errors: ['Final source-bound characterization capture is not yet available.'] }
        : missing.length
          ? {
              valid: false,
              errors: missing.map(
                (required) =>
                  `Missing required native/default characterization case: ${required.file} / ${required.title}`
              )
            }
          : validatePreservationCases(root, entry.capture, entry.cases, entry.requiredSources);
      entries.push({
        ...entry,
        status: proof.valid ? 'verified' : 'declared-unverified',
        proofErrors: proof.errors,
        characterizationRequirements
      });
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : 'Malformed preservation exception.');
    }
  }
  return { path: PRESERVATION_LEDGER_PATH, entries, errors };
}
export function readPreservationLedger(root: string, baseline: Inventory): PreservationLedgerResult {
  const file = evidencePath(root, PRESERVATION_LEDGER_PATH);
  if (!existsSync(file)) return { path: PRESERVATION_LEDGER_PATH, entries: [], errors: [] };
  try {
    return validatePreservationLedger(root, JSON.parse(readFileSync(file, 'utf8')), baseline);
  } catch (cause) {
    return {
      path: PRESERVATION_LEDGER_PATH,
      entries: [],
      errors: [cause instanceof Error ? cause.message : 'Malformed exception ledger.']
    };
  }
}
export function locationOnlyObservation(before: InventoryItem, after: InventoryItem | undefined): boolean {
  if (!after) return false;
  const original = { ...before },
    current = { ...after };
  Reflect.deleteProperty(original, 'line');
  Reflect.deleteProperty(current, 'line');
  return JSON.stringify(original) === JSON.stringify(current);
}
