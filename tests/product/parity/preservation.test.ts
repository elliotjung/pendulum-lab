/** Synthetic validator fixtures only; these are never actual S28 exception attestations. */
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { captureSourceTree, digestFingerprint, sourceHash } from '../../../scripts/redesign/parity-capture';
import { validatePreservationCases } from '../../../scripts/redesign/parity-certificate';
import {
  locationOnlyObservation,
  requiredPreservationCases,
  validatePreservationLedger,
  type PreservationException
} from '../../../scripts/redesign/parity-preservation';
import type { Inventory, InventoryItem } from '../../../scripts/redesign/inventory';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';
afterEach(cleanEvidenceFixtures);
function fixture() {
  const f = evidenceFixture(),
    file = 'src/app/SimulationClock.ts';
  f.write(file, '// Synthetic native characterization fixture only.\n');
  const requirements = requiredPreservationCases(file);
  for (const required of requirements)
    f.write(required.file, '// Synthetic case identity fixture only; not actual clock characterization.\n');
  f.rewriteReport('unit', (report) => {
    const suites = report.testResults as {
      name: string;
      status: string;
      message: string;
      endTime: number;
      assertionResults: { fullName: string; status: string; failureMessages: string[] }[];
    }[];
    for (const name of new Set(requirements.map((required) => required.file)))
      suites.push({
        ...structuredClone(suites[0]!),
        name: path.join(f.root, name),
        assertionResults: requirements
          .filter((required) => required.file === name)
          .map((required) => ({ fullName: required.title, status: 'passed', failureMessages: [] }))
      });
    Reflect.set(report, 'numTotalTests', 1 + requirements.length);
    Reflect.set(report, 'numPassedTests', 1 + requirements.length);
  });
  f.rewriteCapture('unit', (capture) => {
    const sources = captureSourceTree(f.root, ['src', 'tests']);
    Reflect.set(capture, 'sources', sources);
    Reflect.set(capture, 'sourceFingerprint', digestFingerprint(sources));
  });
  const reference = f.bundle.captures.find((capture) => capture.id === 'unit')!;
  const original = f.bundle.rows[0]!.evidence.find((item) => item.facet === 'comparison')!;
  const binding = {
    file: original.file,
    title: original.title,
    project: null,
    sourcePaths: [file, ...original.sourcePaths],
    assertion: 'Synthetic characterization compares the exact preserved native contract and rejects altered state.'
  } as const;
  const baseline = { files: [{ ownerFile: file, sha256: 'c'.repeat(64) }], facts: [] } as unknown as Inventory;
  const entry: PreservationException = {
    id: 'synthetic-clock-exception',
    path: file,
    stage: 28,
    kind: 'additive-native-clock-api/v1',
    baselineSha256: 'c'.repeat(64),
    before: { gitCommit: 'a'.repeat(40), gitBlob: 'b'.repeat(40), sourceSha256: 'c'.repeat(64) },
    currentSha256: sourceHash(f.root, file),
    reason:
      'Synthetic validator fixture only. An explicit additive contract is characterized without replacing or rewriting any frozen baseline identity.',
    preservedContract: [
      'The exact original deterministic inputs and outputs stay unchanged in this synthetic characterization fixture.'
    ],
    addedFactIds: [],
    locationOnlyFactIds: [],
    requiredSources: [file],
    capture: reference,
    cases: requirements.map((required) => ({ ...binding, file: required.file, title: required.title }))
  };
  const ledger = { schema: 'pendulum-preservation-exceptions/v1', stage: 28, exceptions: [entry] };
  return { ...f, file, reference, binding, baseline, entry, ledger };
}
describe('S28 explicit preservation exception validation', () => {
  it('requires real source-bound native characterization without granting UI/capability certification', () => {
    const f = fixture();
    expect(validatePreservationCases(f.root, f.reference, [f.binding], [f.file])).toEqual({ valid: true, errors: [] });
    const result = validatePreservationLedger(f.root, f.ledger, f.baseline);
    expect(result.errors).toEqual([]);
    expect(result.entries[0]!.status).toBe('verified');
    expect(result.entries[0]!.baselineSha256).not.toBe(result.entries[0]!.currentSha256);
  });
  it('keeps declared byte drift unverified until the final capture exists', () => {
    const f = fixture();
    Reflect.set(f.entry, 'capture', null);
    Reflect.set(f.entry, 'cases', []);
    const result = validatePreservationLedger(f.root, f.ledger, f.baseline);
    expect(result.errors).toEqual([]);
    expect(result.entries[0]!.status).toBe('declared-unverified');
    expect(result.entries[0]!.proofErrors.join(' ')).toContain('not yet available');
  });
  it('refuses a passing unrelated validator case in place of required old-native and new-API characterization', () => {
    const f = fixture();
    Reflect.set(f.entry, 'cases', [f.binding]);
    const result = validatePreservationLedger(f.root, f.ledger, f.baseline);
    expect(result.entries[0]!.status).toBe('declared-unverified');
    expect(result.entries[0]!.proofErrors.join(' ')).toContain('Missing required native/default characterization case');
  });
  it.each(['source', 'test', 'report', 'capture', 'case', 'closure'] as const)(
    'rejects changed %s characterization provenance',
    (kind) => {
      const f = fixture();
      if (kind === 'source') f.write(f.file, 'changed native source');
      if (kind === 'test') f.write(f.binding.file, 'changed assertion');
      if (kind === 'report') f.rewriteReport('unit', (report) => Reflect.set(report, 'numPendingTests', 1));
      if (kind === 'capture') f.rewriteCapture('unit', (capture) => Reflect.set(capture, 'exitCode', 9));
      if (kind === 'case') Reflect.set(f.binding, 'title', 'invented native characterization');
      if (kind === 'closure') Reflect.set(f.binding, 'sourcePaths', []);
      expect(validatePreservationCases(f.root, f.reference, [f.binding], [f.file]).valid).toBe(false);
    }
  );
  it.each(['path', 'baseline', 'before', 'current', 'kind', 'duplicate', 'added-fact'] as const)(
    'rejects an unsupported %s exception instead of projecting away the difference',
    (kind) => {
      const f = fixture();
      if (kind === 'path') Reflect.set(f.entry, 'path', 'src/physics/double.ts');
      if (kind === 'baseline') Reflect.set(f.entry, 'baselineSha256', 'd'.repeat(64));
      if (kind === 'before') Reflect.set(f.entry.before, 'sourceSha256', 'e'.repeat(64));
      if (kind === 'current') Reflect.set(f.entry, 'currentSha256', 'f'.repeat(64));
      if (kind === 'kind') Reflect.set(f.entry, 'kind', 'unreviewed-whole-physics-rewrite');
      if (kind === 'duplicate') f.ledger.exceptions.push(f.entry);
      if (kind === 'added-fact')
        Reflect.set(f.entry, 'addedFactIds', ['exported-declaration:src/physics/double.ts#rhsDouble']);
      expect(validatePreservationLedger(f.root, f.ledger, f.baseline).errors.length).toBeGreaterThan(0);
    }
  );
  it('permits only location drift of explicitly listed observations, never changed declaration meaning', () => {
    const original = {
      id: 'synthetic',
      ownerFile: 'src/app/SimulationClock.ts',
      category: 'exported-declaration',
      label: 'SimulationClock',
      futureStage: 7,
      line: 34,
      evidence: 'ClassDeclaration',
      assignment: 'module-family'
    } as InventoryItem;
    expect(locationOnlyObservation(original, { ...original, line: 89 })).toBe(true);
    expect(locationOnlyObservation(original, { ...original, line: 89, evidence: 'changed API' })).toBe(false);
    expect(locationOnlyObservation(original, undefined)).toBe(false);
  });
});
