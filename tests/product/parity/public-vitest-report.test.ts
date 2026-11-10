import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditPublicArtifacts } from '../../../scripts/audit-public-artifacts';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';

afterEach(cleanEvidenceFixtures);
const script = path.resolve('scripts/public-vitest-report.mjs');
function originalScript(root: string) {
  const original = spawnSync('git', ['cat-file', 'blob', '396bf1b6a5ab27b9a81588156a519daea68a70aa'], {
    cwd: process.cwd(),
    shell: false
  });
  expect(original.status, original.stderr.toString()).toBe(0);
  expect(createHash('sha256').update(original.stdout).digest('hex')).toBe(
    'da24ac815b49997ee79d4278ec6f26f0e8d508dc2895655b6b2269630beb45e8'
  );
  const target = path.join(root, 'original-public-report.mjs');
  writeFileSync(target, original.stdout);
  return target;
}
function report(titles: string[]) {
  return {
    startTime: 1_800_000_000_000,
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: titles.length,
    numPassedTests: titles.length,
    numFailedTests: 0,
    numPendingTests: 0,
    testResults: [
      {
        name: '/runner/project/tests/fixture.test.ts',
        status: 'passed',
        startTime: 1,
        endTime: 2,
        assertionResults: titles.map((title) => ({
          ancestorTitles: ['Public fixture', title],
          title,
          status: 'passed'
        }))
      }
    ]
  };
}
function run(root: string, executable: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [executable, ...args], { cwd: root, encoding: 'utf8', shell: false });
  expect(result.status, result.stderr).toBe(0);
}
describe('S28 public Vitest label privacy adapter', () => {
  it('preserves every benign default output byte of the immutable original CLI', () => {
    const old = evidenceFixture(),
      current = evidenceFixture();
    const input = JSON.stringify(
      report([
        'ordinary Unicode θ test',
        'relative src\\app\\main.ts',
        'relative doubled src\\\\app\\\\main.ts',
        'public https://example.invalid/docs/reference?section=2',
        'actual whitespace \t\n stays escaped by JSON',
        'one \\segment stays literal',
        'redacts C:/runner/private/fixture.txt already'
      ])
    );
    for (const fixture of [old, current]) fixture.write('reports/vitest-results.json', input);
    run(old.root, originalScript(old.root));
    run(current.root, script);
    expect(readFileSync(path.join(current.root, 'reports/vitest-public-results.json'))).toEqual(
      readFileSync(path.join(old.root, 'reports/vitest-public-results.json'))
    );
    expect(readFileSync(path.join(current.root, 'reports/vitest-results.json'), 'utf8')).toBe(input);
  });
  it('redacts UNC and escaped-whitespace fixtures before the unchanged public privacy audit', async () => {
    const old = evidenceFixture(),
      current = evidenceFixture();
    const input = JSON.stringify(
      report([String.raw`rejects (\\server\private\state.json)`, String.raw`rejects "\t\n"`])
    );
    for (const fixture of [old, current]) fixture.write('reports/vitest-results.json', input);
    const args = ['reports/vitest-results.json', 'public/output.json'];
    run(old.root, originalScript(old.root), args);
    run(current.root, script, args);
    const oldAudit = await auditPublicArtifacts({ publicRoot: path.join(old.root, 'public') });
    expect(oldAudit.findings.filter((finding) => finding.rule === 'unc-absolute-path')).toHaveLength(4);
    const audit = await auditPublicArtifacts({ publicRoot: path.join(current.root, 'public') });
    expect(audit.filesChecked).toBe(1);
    expect(audit.findings).toEqual([]);
    const output = JSON.parse(readFileSync(path.join(current.root, 'public/output.json'), 'utf8'));
    expect(output.testResults[0].assertionResults.map((assertion: { title: string }) => assertion.title)).toEqual([
      'rejects ([absolute-path]',
      'rejects "[absolute-path]"'
    ]);
    expect(output.numPassedTests).toBe(2);
    expect(output.success).toBe(true);
    expect(readFileSync(path.join(current.root, 'reports/vitest-results.json'), 'utf8')).toBe(input);
  });
});
