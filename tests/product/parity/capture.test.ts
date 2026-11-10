import { afterEach, describe, expect, it } from 'vitest';
import { symlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  captureBuildTree,
  captureSourceTree,
  digestFingerprint,
  evidenceHash,
  evidencePath,
  sourceHash
} from '../../../scripts/redesign/parity-capture';
import { parseRunnerReport, runnerCaseKey } from '../../../scripts/redesign/parity-runner-report';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';

afterEach(cleanEvidenceFixtures);
describe('S28 execution capture and runner parsing', () => {
  it('uses LF-normalized source hashes but exact artifact-byte hashes', () => {
    const f = evidenceFixture();
    f.write('src/product/feature.ts', 'first\r\nsecond\r\n');
    const before = sourceHash(f.root, 'src/product/feature.ts');
    f.write('src/product/feature.ts', 'first\nsecond\n');
    expect(sourceHash(f.root, 'src/product/feature.ts')).toBe(before);
    f.write('tmp/result.bin', 'first\r\n');
    const bytes = evidenceHash(readFileSync(path.join(f.root, 'tmp/result.bin')));
    f.write('tmp/result.bin', 'first\n');
    expect(evidenceHash(readFileSync(path.join(f.root, 'tmp/result.bin')))).not.toBe(bytes);
  });
  it('makes canonical path order independent of locale/case sorting and file traversal', () => {
    const f = evidenceFixture();
    const files = captureBuildTree(f.root, 'tmp/build');
    expect(files.map((item) => item.path)).toEqual(['assets/Audio.js', 'assets/advanced.js']);
    expect(digestFingerprint(captureSourceTree(f.root, ['src', 'e2e']))).toBe(
      digestFingerprint(captureSourceTree(f.root, ['e2e', 'src']))
    );
  });
  it.each(['../file', 'tmp/../../file', '/absolute', 'tmp\\file', 'tmp//file', 'tmp/./file', ''])(
    'rejects unsafe repository-relative path %s',
    (relative) => {
      const f = evidenceFixture();
      expect(() => evidencePath(f.root, relative)).toThrow();
    }
  );
  it('rejects a report/source path through an escaping junction and build symlinks', () => {
    const f = evidenceFixture(),
      outside = evidenceFixture();
    symlinkSync(outside.root, path.join(f.root, 'linked'), 'junction');
    expect(() => evidencePath(f.root, 'linked/src/product/feature.ts')).toThrow('outside repository');
    expect(() => captureSourceTree(f.root, ['linked/src/product/feature.ts'])).toThrow();
    symlinkSync(outside.root, path.join(f.root, 'tmp/build/linked'), 'junction');
    expect(() => captureBuildTree(f.root, 'tmp/build')).toThrow('symbolic links');
  });
  it('extracts exact file/describe/title/project and actual attached export paths', () => {
    const f = evidenceFixture();
    const parsed = parseRunnerReport(f.root, 'playwright', f.read('tmp/browser-report.json'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]).toMatchObject({
      file: 'e2e/feature.spec.ts',
      title: 'synthetic validator fixture › uses native inputs, roundtrips settings and reads exported bytes',
      project: 'chromium',
      status: 'passed',
      attachments: [{ name: 'synthetic-export', path: 'tmp/export.json' }]
    });
    expect(runnerCaseKey(parsed.cases[0]!)).toBe(
      JSON.stringify([parsed.cases[0]!.file, parsed.cases[0]!.title, 'chromium'])
    );
  });
  it('refuses runner paths outside the source root, empty suites and impossible execution times', () => {
    const f = evidenceFixture();
    const report = f.read('tmp/unit-report.json');
    const results = report.testResults as { name: string; endTime: number }[];
    results[0]!.name = path.resolve(f.root, '../outside.test.ts');
    expect(parseRunnerReport(f.root, 'vitest', report).errors.join('\n')).toContain('escapes repository');
    expect(parseRunnerReport(f.root, 'playwright', {}).errors.join('\n')).toContain('empty cases');
    const other = f.read('tmp/unit-report.json');
    Reflect.set(other, 'startTime', Number.NaN);
    expect(parseRunnerReport(f.root, 'vitest', other).errors.join('\n')).toContain('times are invalid');
  });
});
