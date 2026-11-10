import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { evidenceHash } from '../../../scripts/redesign/parity-capture';
import { validateParityCertificates, type ParityCaseEvidence } from '../../../scripts/redesign/parity-certificate';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';

afterEach(cleanEvidenceFixtures);
const validate = (fixture: ReturnType<typeof evidenceFixture>, input: unknown = fixture.bundle) =>
  validateParityCertificates(fixture.root, input, fixture.policy);

describe('S28 source-bound certificate validator (synthetic validator fixtures only)', () => {
  it('requires every requested row and all four facets bound to exact passed runner cases', () => {
    const f = evidenceFixture();
    expect(validate(f)).toEqual({ valid: true, verifiedIds: ['synthetic:feature'], missingIds: [], errors: [] });
    Reflect.set(
      f.bundle.rows[0]!,
      'evidence',
      f.bundle.rows[0]!.evidence.filter((item) => item.facet !== 'roundtrip')
    );
    expect(validate(f).errors.join('\n')).toContain('missing roundtrip');
    expect(validate(f).verifiedIds).toEqual([]);
  });
  it.each(['missing', 'duplicate', 'unknown'] as const)('rejects %s certificate rows', (kind) => {
    const f = evidenceFixture();
    if (kind === 'missing') Reflect.set(f.bundle, 'rows', []);
    else if (kind === 'duplicate') Reflect.set(f.bundle, 'rows', [f.bundle.rows[0], f.bundle.rows[0]]);
    else Reflect.set(f.bundle.rows[0]!, 'id', 'other:feature');
    expect(validate(f).valid).toBe(false);
    expect(validate(f).missingIds).toEqual(['synthetic:feature']);
  });
  it('pins the frozen inventory and rejects malformed records without throwing', () => {
    const f = evidenceFixture();
    Reflect.set(f.bundle, 'inventorySha256', 'b'.repeat(64));
    expect(validate(f).verifiedIds).toEqual([]);
    for (const rows of [[null], [{}], [{ id: 'synthetic:feature', evidence: [null] }]]) {
      const input = { ...f.bundle, inventorySha256: f.policy.inventorySha256, rows };
      expect(() => validate(f, input)).not.toThrow();
      expect(validate(f, input).valid).toBe(false);
    }
    expect(validate(f, { ...f.bundle, captures: [null] }).valid).toBe(false);
  });
  it.each(['exit', 'invalid', 'fingerprint', 'command', 'times'] as const)(
    'rejects a forged %s capture even after its outer hash is repinned',
    (kind) => {
      const f = evidenceFixture();
      f.rewriteCapture('unit', (capture) => {
        if (kind === 'exit') Reflect.set(capture, 'exitCode', 1);
        if (kind === 'invalid') Reflect.set(capture, 'valid', false);
        if (kind === 'fingerprint') Reflect.set(capture, 'sourceFingerprint', '0'.repeat(64));
        if (kind === 'command') Reflect.set(capture, 'command', ['node', 'invented-runner', 'run']);
        if (kind === 'times') Reflect.set(capture, 'finishedAt', 'not-a-time');
      });
      expect(validate(f).valid).toBe(false);
    }
  );
  it('rejects changed report bytes and changed source/test bytes', () => {
    const f = evidenceFixture();
    f.write('tmp/unit-report.json', '{}');
    expect(validate(f).errors.join('\n')).toContain('report bytes changed');
    const g = evidenceFixture();
    g.write('src/product/feature.ts', 'changed implementation');
    expect(validate(g).errors.join('\n')).toContain('Stale or uncaptured source');
    const h = evidenceFixture();
    h.write('e2e/feature.spec.ts', 'changed assertion');
    expect(validate(h).errors.join('\n')).toContain('Stale or uncaptured source');
  });
  it.each(['skipped', 'flaky', 'retried', 'runner-error', 'wrong-count'] as const)(
    'rejects %s browser reports rather than accepting aggregate pass labels',
    (kind) => {
      const f = evidenceFixture();
      f.rewriteReport('browser', (report) => {
        const stats = report.stats as Record<string, unknown>;
        const suites = report.suites as {
          suites: { specs: { tests: { status: string; results: Record<string, unknown>[] }[] }[] }[];
        }[];
        const test = suites[0]!.suites[0]!.specs[0]!.tests[0]!;
        if (kind === 'skipped') {
          Reflect.set(stats, 'skipped', 1);
          Reflect.set(test.results[0]!, 'status', 'skipped');
        }
        if (kind === 'flaky') {
          Reflect.set(stats, 'flaky', 1);
          Reflect.set(test, 'status', 'flaky');
        }
        if (kind === 'retried') Reflect.set(test.results[0]!, 'retry', 1);
        if (kind === 'runner-error') Reflect.set(report, 'errors', [{ message: 'worker crashed' }]);
        if (kind === 'wrong-count') Reflect.set(stats, 'expected', 99);
      });
      expect(validate(f).valid).toBe(false);
    }
  );
  it.each(['pending', 'failed', 'old-time', 'duplicate'] as const)('rejects %s unit reports', (kind) => {
    const f = evidenceFixture();
    f.rewriteReport('unit', (report) => {
      const suites = report.testResults as { assertionResults: Record<string, unknown>[]; endTime: number }[];
      if (kind === 'pending') Reflect.set(report, 'numPendingTests', 1);
      if (kind === 'failed') Reflect.set(suites[0]!.assertionResults[0]!, 'status', 'failed');
      if (kind === 'old-time') {
        Reflect.set(report, 'startTime', 0);
        Reflect.set(suites[0]!, 'endTime', 0);
      }
      if (kind === 'duplicate') {
        suites[0]!.assertionResults.push({ ...suites[0]!.assertionResults[0] });
        Reflect.set(report, 'numTotalTests', 2);
        Reflect.set(report, 'numPassedTests', 2);
      }
    });
    expect(validate(f).valid).toBe(false);
  });
  it('accepts unrelated duplicate parameterized titles while rejecting an ambiguous claimed identity', () => {
    const f = evidenceFixture();
    f.rewriteReport('unit', (report) => {
      const suites = report.testResults as { assertionResults: Record<string, unknown>[] }[];
      const unrelated = { ...suites[0]!.assertionResults[0], fullName: 'unclaimed parameterized legacy case' };
      suites[0]!.assertionResults.push(unrelated, { ...unrelated });
      Reflect.set(report, 'numTotalTests', 3);
      Reflect.set(report, 'numPassedTests', 3);
    });
    expect(validate(f).valid).toBe(true);
    f.rewriteReport('unit', (report) => {
      const suites = report.testResults as { assertionResults: Record<string, unknown>[] }[];
      suites[0]!.assertionResults.push({ ...suites[0]!.assertionResults[0] });
      Reflect.set(report, 'numTotalTests', 4);
      Reflect.set(report, 'numPassedTests', 4);
    });
    expect(validate(f).errors.join('\n')).toContain('ambiguous');
  });
  it.each(['file', 'title', 'project'] as const)('requires the exact %s identity of a passed case', (field) => {
    const f = evidenceFixture();
    Reflect.set(f.bundle.rows[0]!.evidence[0]!, field, 'wrong');
    expect(validate(f).errors.join('\n')).toContain('Exact test file/title/project');
  });
  it('rejects catalog-only claims and incomplete reviewed runtime dependency paths', () => {
    const f = evidenceFixture();
    Reflect.set(f.bundle.rows[0]!.evidence[0]!, 'sourcePaths', ['src/product/catalog/entries.ts']);
    expect(validate(f).errors.join('\n')).toContain('Catalog-only');
    const g = evidenceFixture();
    Reflect.set(g.bundle.rows[0]!.evidence[0]!, 'sourcePaths', ['src/product/feature.ts']);
    expect(validate(g).errors.join('\n')).toContain('runtime/dependency source policy');
  });
  it('rejects duplicate exact facet bindings and missing numerical tolerance contracts', () => {
    const f = evidenceFixture();
    Reflect.set(f.bundle.rows[0]!, 'evidence', [...f.bundle.rows[0]!.evidence, f.bundle.rows[0]!.evidence[0]]);
    expect(validate(f).errors.join('\n')).toContain('Duplicate exact facet');
    const g = evidenceFixture(),
      comparison = g.bundle.rows[0]!.evidence.find((item) => item.facet === 'comparison')!;
    Reflect.set(comparison, 'comparison', {
      reference: 'preserved-native',
      quantity: 'state',
      absoluteTolerance: -1,
      relativeTolerance: 0
    });
    expect(validate(g).errors.join('\n')).toContain('explicit tolerance');
  });
  it('checks current retained production bytes and exact compiled source identity', () => {
    const f = evidenceFixture();
    f.write('tmp/build/assets/Audio.js', 'changed bundle');
    expect(validate(f).errors.join('\n')).toContain('production build bytes changed');
    const g = evidenceFixture();
    g.rewriteBuild((build) => Reflect.set(build, 'command', ['node', 'fake', 'build', '--outDir', 'tmp/build']));
    expect(validate(g).errors.join('\n')).toContain('successful exact production build');
    const h = evidenceFixture();
    h.rewriteBuild((build) => Reflect.set(build, 'finishedAt', '2020-01-01T00:01:00.000Z'));
    expect(validate(h).errors.join('\n')).toContain('predates its production build');
  });
  it('accepts the real packaged pipeline and rejects alternate entrypoints/output overrides', () => {
    const f = evidenceFixture();
    const command = [
      process.execPath,
      path.resolve(f.root, 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(f.root, 'scripts/redesign/parity-build.ts'),
      '--out-dir',
      'tmp/build',
      '--'
    ];
    f.rewriteBuild((build) => Reflect.set(build, 'command', command));
    expect(validate(f).valid).toBe(true);
    f.rewriteBuild((build) => Reflect.set(build, 'command', [...command, '--outDir=tmp/other']));
    expect(validate(f).valid).toBe(false);
    const g = evidenceFixture();
    g.rewriteBuild((build) =>
      Reflect.set(build, 'command', [
        process.execPath,
        path.resolve(g.root, 'node_modules/tsx/dist/cli.mjs'),
        path.resolve(g.root, 'scripts/redesign/fake-build.ts'),
        '--out-dir',
        'tmp/build',
        '--'
      ])
    );
    expect(validate(g).valid).toBe(false);
  });
  it('distinguishes asserted export behavior from retained attached portable bytes', () => {
    const f = evidenceFixture();
    const item = f.bundle.rows[0]!.evidence.find((item) => item.facet === 'export')!;
    Reflect.set(item, 'exported', { schemaOrMime: 'synthetic-export/v1', assertionOnly: false });
    expect(validate(f).errors.join('\n')).toContain('retained export artifact is absent');
    Reflect.set(item, 'exported', {
      schemaOrMime: 'synthetic-export/v1',
      assertionOnly: false,
      retained: { path: 'tmp/export.json', sha256: evidenceHash('{"schema":"synthetic-export/v1","value":4}\n') }
    });
    expect(validate(f).valid).toBe(true);
    f.write('tmp/export.json', 'changed artifact');
    expect(validate(f).errors.join('\n')).toContain('Retained export was not attached');
  });
  it('allows no-export controls only with exact reviewed per-capability reason and real case evidence', () => {
    const f = evidenceFixture(),
      item = f.bundle.rows[0]!.evidence.find((item) => item.facet === 'export')!;
    const reason =
      'This original control never produced a standalone export; the exact case verifies its ephemeral/reload behavior.';
    Reflect.deleteProperty(item, 'exported');
    Reflect.set(item, 'exportNotApplicable', { reason });
    expect(validate(f).valid).toBe(false);
    const policy = { ...f.policy, exportNotApplicable: { 'synthetic:feature': reason } };
    expect(validateParityCertificates(f.root, f.bundle, policy).valid).toBe(true);
    Reflect.set(item, 'exportNotApplicable', { reason: 'blanket waiver' });
    expect(validateParityCertificates(f.root, f.bundle, policy).valid).toBe(false);
  });
  it('checks deduplicated reviewed native/shared closures even when case bindings list only the consumer root', () => {
    const f = evidenceFixture();
    for (const item of f.bundle.rows[0]!.evidence) Reflect.set(item, 'sourcePaths', ['src/product/feature.ts']);
    const policy = {
      ...f.policy,
      requiredSources: { 'synthetic:feature': ['src/product/feature.ts'] },
      sharedSources: ['src/product/feature.ts'],
      sourceGroups: { native: ['src/physics/reference.ts'] },
      rowSourceGroups: { 'synthetic:feature': ['native'] }
    };
    expect(validateParityCertificates(f.root, f.bundle, policy).valid).toBe(true);
    f.write('src/physics/reference.ts', 'changed reviewed dependency after prior validation');
    expect(validateParityCertificates(f.root, f.bundle, policy).errors.join(' ')).toContain('src/physics/reference.ts');
  });
  it.each(['unknown-group', 'unknown-row', 'duplicate-path', 'unassigned', 'unpaired'] as const)(
    'rejects malformed %s source-group policy',
    (kind) => {
      const f = evidenceFixture();
      const policy = {
        ...f.policy,
        sourceGroups: { native: ['src/physics/reference.ts'] },
        rowSourceGroups: { 'synthetic:feature': ['native'] },
        sharedSources: ['src/product/feature.ts']
      };
      if (kind === 'unknown-group') Reflect.set(policy.rowSourceGroups, 'synthetic:feature', ['invented']);
      if (kind === 'unknown-row') Reflect.set(policy.rowSourceGroups, 'invented:row', ['native']);
      if (kind === 'duplicate-path')
        Reflect.set(policy.sourceGroups, 'native', ['src/physics/reference.ts', 'src/physics/reference.ts']);
      if (kind === 'unassigned') Reflect.deleteProperty(policy.rowSourceGroups, 'synthetic:feature');
      if (kind === 'unpaired') Reflect.deleteProperty(policy, 'rowSourceGroups');
      expect(validateParityCertificates(f.root, f.bundle, policy).valid).toBe(false);
    }
  );
  it('rejects report/capture/artifact traversal and malformed source/facet records', () => {
    const f = evidenceFixture();
    Reflect.set(f.bundle.captures[0]!, 'path', '../outside.json');
    expect(validate(f).valid).toBe(false);
    const g = evidenceFixture();
    Reflect.set(g.bundle.rows[0]!.evidence[0]!, 'sourcePaths', ['../outside.ts']);
    expect(validate(g).valid).toBe(false);
    const h = evidenceFixture();
    const malformed = { ...h.bundle.rows[0]!.evidence[0], facet: 'invented' };
    Reflect.set(h.bundle.rows[0]!, 'evidence', [malformed as unknown as ParityCaseEvidence]);
    expect(validate(h).valid).toBe(false);
  });
});
