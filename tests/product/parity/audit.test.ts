import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildParityAudit,
  certificationErrors,
  readParityAudit,
  serializeParityAudit,
  S01_INVENTORY_SHA256,
  validateParityAudit,
  type ParityAudit
} from '../../../scripts/redesign/parity-audit';
import type { Inventory } from '../../../scripts/redesign/inventory';
let audit: ParityAudit;
beforeAll(() => {
  audit = readParityAudit(process.cwd());
}, 30_000);
const copy = () => structuredClone(audit);
describe('S28 exhaustive preservation and actual source-bound facets', () => {
  it('pins the original S01 inventory instead of regenerating its byte identities', () => {
    const text = readFileSync('documents/redesign/baseline/inventory.json', 'utf8').replaceAll('\r\n', '\n');
    expect(createHash('sha256').update(text).digest('hex')).toBe(S01_INVENTORY_SHA256);
    expect(audit.baseline.inventorySha256).toBe(S01_INVENTORY_SHA256);
    expect(audit.integrityErrors).toEqual([]);
  });
  it('retains every baseline file/capability/fact and all134 executable IDs with derived counts', () => {
    const baseline = JSON.parse(readFileSync('documents/redesign/baseline/inventory.json', 'utf8')) as Inventory;
    expect(audit.files.map((row) => row.path)).toEqual(baseline.files.map((row) => row.ownerFile));
    expect(audit.capabilities.map((row) => row.id)).toEqual(baseline.capabilities.map((row) => row.id));
    expect(audit.facts.map((row) => row.id)).toEqual(baseline.facts.map((row) => row.id));
    expect(new Set(audit.executable.map((row) => row.id))).toEqual(
      new Set([
        ...baseline.capabilities.map((row) => row.id),
        ...baseline.facts.filter((row) => row.category === 'integrator').map((row) => row.id)
      ])
    );
    expect(audit.summary).toMatchObject({
      baselineFiles: 883,
      baselineCapabilities: 118,
      baselineFacts: 6825,
      executableRows: 134
    });
    expect(audit.summary.preservedFiles).toBe(audit.files.filter((row) => row.preserved).length);
    expect(audit.summary.preservationCoveredFiles).toBe(
      audit.files.filter((row) => row.preserved || row.exceptionCovered).length
    );
    expect(audit.summary.preservedFacts).toBe(audit.facts.filter((row) => row.preserved).length);
    expect(audit.summary.verifiedExecutableRows).toBe(
      audit.executable.filter((row) => row.status === 'verified').length
    );
    expect(audit.summary.unverifiedRows + audit.summary.verifiedExecutableRows).toBe(134);
    expect(audit.executable.every((row) => row.catalogId !== null)).toBe(true);
  });
  it('keeps changed clock/copier bytes separate from tested exception coverage and added AST observations', () => {
    for (const file of ['src/app/SimulationClock.ts', 'scripts/copy-legacy-assets.mjs']) {
      const row = audit.files.find((item) => item.path === file)!;
      const exception = audit.preservation.entries.find((item) => item.path === file)!;
      expect(exception, file).toBeDefined();
      expect(row.preserved, file).toBe(false);
      expect(row.baselineSha256).toBe(exception.baselineSha256);
      expect(row.currentProjectedSha256).toBe(exception.currentSha256);
      expect(row.exceptionCovered).toBe(exception.status === 'verified');
      expect(exception.before.sourceSha256).toBe(exception.baselineSha256);
      if (exception.status === 'declared-unverified') expect(exception.proofErrors.length).toBeGreaterThan(0);
    }
    expect(audit.summary.preservedFiles).toBeLessThan(audit.summary.baselineFiles);
    expect(audit.addedObservations.every((row) => row.exceptionId !== null)).toBe(true);
    expect(audit.addedObservations.map((row) => row.item.id)).toContain(
      'exported-declaration:src/app/SimulationClock.ts#SimulationClockCheckpoint'
    );
    expect(audit.sources.some((item) => item.path === 'src/physics/double.ts')).toBe(true);
    expect(audit.sources.some((item) => item.path === 'scripts/copy-legacy-assets.mjs')).toBe(true);
  });
  it('publishes actual unit/build/browser case facets only for validated executable rows', () => {
    expect(audit.certification.mode).toBe('live-source-build-report-validation');
    expect(audit.certification.replayNote).toContain('fresh clone');
    expect(audit.certification.replayNote).toContain('archived hashes alone never certify');
    const ids = new Set(audit.certification.result.verifiedIds);
    for (const row of audit.executable) {
      expect(row.status).toBe(ids.has(row.id) ? 'verified' : 'unverified');
      for (const [key, facet] of [
        ['newUiAction', 'ui'],
        ['resultComparison', 'comparison'],
        ['migrationOrRoundTrip', 'roundtrip'],
        ['exportArtifact', 'export']
      ] as const) {
        if (row.status === 'verified') {
          expect(row.requiredEvidence[key].length).toBeGreaterThan(0);
          expect(row.requiredEvidence[key].every((item) => item.facet === facet)).toBe(true);
        } else expect(row.requiredEvidence[key]).toEqual([]);
      }
    }
    expect(audit.summary.parityPercent).toBe(Number(((100 * ids.size) / 134).toFixed(6)));
    if (!audit.certification.result.valid || audit.preservation.entries.some((entry) => entry.status !== 'verified'))
      expect(audit.summary.cutoverAllowed).toBe(false);
    const double = audit.executable.find((row) => row.id === 'system:double')!;
    expect(double.candidateRoute).toBe('./next.html#/lab/double');
    expect(double.catalogId).toBe('system:double');
  });
  it.each(['files', 'capabilities', 'facts', 'executable'] as const)(
    'rejects omitted/duplicate %s ledger rows',
    (key) => {
      const missing = copy();
      missing[key].splice(0, 1);
      expect(validateParityAudit(missing, audit).join('\n')).toContain('audit rows: ' + key);
      const duplicate = copy(),
        rows = duplicate[key] as unknown[];
      rows.push(structuredClone(rows[0]));
      expect(validateParityAudit(duplicate, audit).join('\n')).toContain('Duplicate audit rows: ' + key);
    }
  );
  it('rejects stale source/input fingerprints, invented routes and manually promoted summaries', () => {
    const stale = copy();
    stale.baseline.inventorySha256 = '0'.repeat(64);
    stale.sourceFingerprint = '1'.repeat(64);
    expect(validateParityAudit(stale, audit).join('\n')).toContain('audit field: baseline');
    expect(validateParityAudit(stale, audit).join('\n')).toContain('audit field: sourceFingerprint');
    const invented = copy();
    invented.executable[0]!.candidateRoute = './next.html#/invented';
    expect(validateParityAudit(invented, audit).join('\n')).toContain('audit rows: executable');
    const summary = copy();
    summary.summary.parityPercent = 100;
    summary.summary.cutoverAllowed = true;
    expect(validateParityAudit(summary, audit).join('\n')).toContain('audit field: summary');
    expect(certificationErrors(summary).join('\n')).toContain('Unsupported cutover/parity claim');
  });
  it('cannot certify catalog-only statuses, test filenames or a serialized positive claim', () => {
    const forged = copy(),
      rows = forged.executable as unknown as { status: string; requiredEvidence: unknown }[];
    rows.forEach((row) => {
      row.status = 'passed';
      row.requiredEvidence = {
        newUiAction: '#lab-run-bar',
        resultComparison: 'equal',
        migrationOrRoundTrip: 'passed',
        testResults: ['tests/product/catalog/coverage.test.ts'],
        exportArtifact: 'output.csv'
      };
    });
    expect(validateParityAudit(forged, audit).join('\n')).toContain('audit rows: executable');
    expect(certificationErrors(forged).join('\n')).toContain('Unsupported executable pass claim');
  });
  it('preserves individual unapproved source/fact drift even when source counts match', () => {
    const inventoryText = readFileSync('documents/redesign/baseline/inventory.json', 'utf8'),
      baseline = JSON.parse(inventoryText) as Inventory,
      changed = structuredClone(baseline);
    changed.files[0]!.sha256 = '2'.repeat(64);
    changed.facts[0]!.evidence = 'changed behavior';
    const drift = buildParityAudit(process.cwd(), baseline, changed, inventoryText);
    expect(drift.summary.preservedFiles).toBe(882);
    expect(drift.summary.preservedFacts).toBe(6824);
    expect(certificationErrors(drift).join('\n')).toContain('Legacy source or observation preservation is incomplete');
    const replaced = buildParityAudit(process.cwd(), baseline, baseline, inventoryText + ' ');
    expect(replaced.integrityErrors).toContain('Frozen S01 inventory SHA-256 mismatch');
  });
  it('serializes deterministically and rejects malformed/additional fields', () => {
    const serialized = serializeParityAudit(audit);
    expect(serializeParityAudit(JSON.parse(serialized) as ParityAudit)).toBe(serialized);
    expect(validateParityAudit(JSON.parse(serialized), audit)).toEqual([]);
    expect(validateParityAudit(null, audit)).toEqual(['Parity audit must be an object']);
    expect(validateParityAudit({ ...audit, shortcut: 'approved' }, audit)).toContain('Unknown audit field: shortcut');
  });
});
