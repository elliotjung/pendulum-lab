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

describe('S28 honest exhaustive parity audit', () => {
  it('pins the S01 inventory bytes rather than accepting a regenerated baseline', () => {
    const text = readFileSync('documents/redesign/baseline/inventory.json', 'utf8').replaceAll('\r\n', '\n');
    expect(createHash('sha256').update(text).digest('hex')).toBe(S01_INVENTORY_SHA256);
    expect(audit.baseline.inventorySha256).toBe(S01_INVENTORY_SHA256);
    expect(audit.integrityErrors).toEqual([]);
  });

  it('accounts for every baseline file, semantic capability, AST observation and registered method', () => {
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
      preservedFiles: 883,
      baselineCapabilities: 118,
      preservedCapabilities: 118,
      baselineFacts: 6825,
      preservedFacts: 6825,
      executableRows: 134,
      verifiedExecutableRows: 0,
      parityPercent: 0,
      cutoverAllowed: false
    });
    expect(audit.executable.every((row) => row.catalogId !== null)).toBe(true);
    expect(audit.facts.every((row) => row.futureStage !== null)).toBe(true);
  });

  it('separates candidate routes and catalog registration from result/test/export evidence', () => {
    const double = audit.executable.find((row) => row.id === 'system:double')!;
    expect(double.candidateRoute).toBe('./next.html#/lab/double');
    expect(double.catalogId).toBe('system:double');
    expect(double.status).toBe('unverified');
    expect(double.requiredEvidence).toEqual({
      newUiAction: null,
      resultComparison: null,
      migrationOrRoundTrip: null,
      testResults: [],
      exportArtifact: null
    });
    expect(certificationErrors(audit).join('\n')).toContain('without complete runtime evidence');
    expect(audit.summary.knownGapRows + audit.summary.unverifiedRows).toBe(134);
  });

  it.each(['files', 'capabilities', 'facts', 'executable'] as const)(
    'rejects omitted and duplicated %s rows',
    (key) => {
      const missing = copy();
      missing[key].splice(0, 1);
      expect(validateParityAudit(missing, audit).join('\n')).toContain(`audit rows: ${key}`);
      const duplicate = copy();
      // Mutate JSON data, never the typed production ledger.
      const rows = duplicate[key] as unknown[];
      rows.push(structuredClone(rows[0]));
      expect(validateParityAudit(duplicate, audit).join('\n')).toContain(`Duplicate audit rows: ${key}`);
    }
  );

  it('rejects stale inventory/source fingerprints, forged counts and invented route evidence', () => {
    const stale = copy();
    stale.baseline.inventorySha256 = '0'.repeat(64);
    stale.sourceFingerprint = '1'.repeat(64);
    expect(validateParityAudit(stale, audit).join('\n')).toContain('audit field: baseline');
    expect(validateParityAudit(stale, audit).join('\n')).toContain('audit field: sourceFingerprint');
    const invented = copy();
    invented.executable[0]!.candidateRoute = './next.html#/invented';
    expect(validateParityAudit(invented, audit).join('\n')).toContain('audit rows: executable');
    const summary = copy();
    (summary.summary as unknown as { parityPercent: number }).parityPercent = 100;
    expect(validateParityAudit(summary, audit).join('\n')).toContain('audit field: summary');
    expect(certificationErrors(summary).join('\n')).toContain('Unsupported cutover/parity claim');
  });

  it('cannot certify catalog-only pass statuses or test file names without runtime attestations', () => {
    const forged = copy();
    const rows = forged.executable as unknown as { status: string; requiredEvidence: unknown }[];
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

  it('records concrete gaps with local line evidence and keeps S29 blocked', () => {
    for (const id of [
      'control:audio',
      'control:forcing-and-feedback',
      'control:precision',
      'control:run-and-history',
      'importer:imu',
      'importer:video',
      'runtime:gpu',
      'runtime:wasm',
      'runtime:public-globals',
      'integrator:sde-matrix',
      'integrator:sde-multiplicative',
      'analysis:stochastic-resonance',
      'route:share',
      'route:tabs',
      'route:deep-link',
      'importer:workspace',
      'importer:saved-run',
      'storage-schema:workspace',
      'storage-schema:research-db',
      'storage-schema:session'
    ]) {
      const gap = audit.gaps.find((entry) => entry.id === id)!;
      expect(gap, id).toBeDefined();
      expect(gap.inspected.length).toBeGreaterThan(0);
      for (const reference of gap.inspected) {
        const lines = readFileSync(reference.path, 'utf8').split('\n');
        expect(reference.line).toBeGreaterThan(0);
        expect(reference.line).toBeLessThanOrEqual(lines.length);
      }
      expect(audit.executable.find((row) => row.id === id)?.status, id).toBe('gap');
    }
    expect(certificationErrors(audit).join('\n')).toMatch(/known gap rows/);
    expect(audit.gaps.find((entry) => entry.id === 'route:share')?.reason).toContain('recovery-required');
    expect(audit.gaps.find((entry) => entry.id === 'storage-schema:session')?.reason).toContain('Euler/RK2/RK4');
    expect(audit.summary.cutoverAllowed).toBe(false);
  });

  it('preserves individual source drift instead of hiding it behind unchanged source counts', () => {
    const inventoryText = readFileSync('documents/redesign/baseline/inventory.json', 'utf8');
    const baseline = JSON.parse(inventoryText) as Inventory;
    const changed = structuredClone(baseline);
    changed.files[0]!.sha256 = '2'.repeat(64);
    changed.facts[0]!.evidence = 'changed behavior';
    const drift = buildParityAudit(process.cwd(), baseline, changed, inventoryText);
    expect(drift.summary.preservedFiles).toBe(882);
    expect(drift.summary.preservedFacts).toBe(6824);
    expect(certificationErrors(drift)).toContain('Legacy source or observation preservation is incomplete');
    const replaced = buildParityAudit(process.cwd(), baseline, baseline, `${inventoryText} `);
    expect(replaced.integrityErrors).toContain('Frozen S01 inventory SHA-256 mismatch');
  });

  it('serializes deterministically and rejects malformed or additional fields', () => {
    const serialized = serializeParityAudit(audit);
    expect(serializeParityAudit(JSON.parse(serialized) as ParityAudit)).toBe(serialized);
    expect(validateParityAudit(JSON.parse(serialized), audit)).toEqual([]);
    expect(validateParityAudit(null, audit)).toEqual(['Parity audit must be an object']);
    expect(validateParityAudit({ ...audit, shortcut: 'approved' }, audit)).toContain('Unknown audit field: shortcut');
  });
});
