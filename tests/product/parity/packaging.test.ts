import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { packagedBuildCommands } from '../../../scripts/redesign/parity-build';
import { captureBuildTree } from '../../../scripts/redesign/parity-capture';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';

afterEach(cleanEvidenceFixtures);
const copier = path.resolve('scripts/copy-legacy-assets.mjs');
function fixture() {
  const f = evidenceFixture();
  f.write('css/native.css', '/* synthetic packaging fixture */');
  f.write(
    'config/public-report-inventory.json',
    JSON.stringify({ schemaVersion: 'pendulum-public-report-inventory/v1', reports: ['fixture.json'] })
  );
  f.write('reports/fixture.json', '{"synthetic":true}');
  f.write('config/claim-registry.json', '{"synthetic":true}');
  return f;
}
describe('S28 packaged build evidence', () => {
  it('copies every legacy supporting asset into the selected frozen build without touching another dist', () => {
    const f = fixture();
    f.write('tmp/packaged/app.html', '<p>synthetic built app</p>');
    f.write('dist/keep.txt', 'other build');
    const result = spawnSync(process.execPath, [copier, '--out-dir', 'tmp/packaged'], {
      cwd: f.root,
      encoding: 'utf8',
      shell: false
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(f.root, 'tmp/packaged/index.html'), 'utf8')).toBe('<p>synthetic built app</p>');
    expect(readFileSync(path.join(f.root, 'tmp/packaged/css/native.css'), 'utf8')).toContain(
      'synthetic packaging fixture'
    );
    expect(readFileSync(path.join(f.root, 'tmp/packaged/reports/fixture.json'), 'utf8')).toBe('{"synthetic":true}');
    expect(readFileSync(path.join(f.root, 'dist/keep.txt'), 'utf8')).toBe('other build');
  });
  it('keeps the original default deployment destination when no argument is supplied', () => {
    const f = fixture();
    f.write('dist/app.html', 'default deployment');
    const result = spawnSync(process.execPath, [copier], { cwd: f.root, encoding: 'utf8', shell: false });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(f.root, 'dist/index.html'), 'utf8')).toBe('default deployment');
  });
  it('matches every default output byte of the immutable pre-S28 native copier on identical inputs', () => {
    const blob = spawnSync('git', ['cat-file', 'blob', '1e31f46f77a649e9d518f9015cc74ccba4a2bfe8'], {
      cwd: process.cwd(),
      shell: false
    });
    expect(blob.status, blob.stderr.toString()).toBe(0);
    expect(createHash('sha256').update(blob.stdout).digest('hex')).toBe(
      '160fbc530dc74ba35c40c83f483c03f0833bb9b2bbaa077708b8c83a799c4e17'
    );
    const original = fixture(),
      current = fixture();
    for (const f of [original, current]) {
      f.write(
        'config/public-report-inventory.json',
        JSON.stringify({
          schemaVersion: 'pendulum-public-report-inventory/v1',
          reports: ['fixture.json', 'missing-optional.json']
        })
      );
      f.write('css/nested/테마.css', '/* exact Unicode CSS bytes */');
      f.write('paper/index.html', '<p>exact paper shell</p>');
      writeFileSync(path.join(f.root, 'paper/paper.pdf'), Buffer.from([37, 80, 68, 70, 0, 255, 13, 10]));
      f.write('dist/app.html', '<html>same built legacy shell</html>');
      f.write('dist/assets/keep.js', '/* same compiled asset */');
    }
    const oldScript = path.join(original.root, 'old-copier.mjs');
    writeFileSync(oldScript, blob.stdout);
    for (const [script, f] of [
      [oldScript, original],
      [copier, current]
    ] as const) {
      const result = spawnSync(process.execPath, [script], { cwd: f.root, encoding: 'utf8', shell: false });
      expect(result.status, result.stderr).toBe(0);
    }
    const expected = captureBuildTree(original.root, 'dist');
    expect(expected.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        'assets/keep.js',
        'css/native.css',
        'css/nested/테마.css',
        'index.html',
        'paper/index.html',
        'paper/paper.pdf',
        'reports/claim-registry.json',
        'reports/fixture.json'
      ])
    );
    expect(captureBuildTree(current.root, 'dist')).toEqual(expected);
  });
  it('rejects traversal, source directories and a junction before any copy', () => {
    const f = fixture();
    for (const target of ['../outside', 'src', 'tmp/../src', 'tmp//ambiguous']) {
      const result = spawnSync(process.execPath, [copier, '--out-dir', target], {
        cwd: f.root,
        encoding: 'utf8',
        shell: false
      });
      expect(result.status).not.toBe(0);
    }
    f.write('kept/marker.txt', 'untouched');
    mkdirSync(path.join(f.root, 'tmp'), { recursive: true });
    symlinkSync(path.join(f.root, 'kept'), path.join(f.root, 'tmp/junction'), 'junction');
    const result = spawnSync(process.execPath, [copier, '--out-dir', 'tmp/junction'], {
      cwd: f.root,
      encoding: 'utf8',
      shell: false
    });
    expect(result.status).not.toBe(0);
    expect(readFileSync(path.join(f.root, 'kept/marker.txt'), 'utf8')).toBe('untouched');
    expect(existsSync(path.join(f.root, 'kept/css'))).toBe(false);
  });
  it('protects an existing frozen build and records catalogue, compile, supporting assets and privacy as one pipeline', () => {
    const f = fixture();
    f.write('tmp/frozen/keep.txt', 'evidence');
    expect(() => packagedBuildCommands(f.root, 'tmp/frozen')).toThrow('nonempty');
    for (const target of ['src', 'tmp/../src', '../outside'])
      expect(() => packagedBuildCommands(f.root, target)).toThrow();
    const commands = packagedBuildCommands(f.root, 'tmp/fresh', ['--minify=false']);
    expect(commands).toHaveLength(4);
    expect(commands[0]!.some((arg) => arg.endsWith('validate-catalog.ts'))).toBe(true);
    expect(commands[1]).toContain('--minify=false');
    expect(commands[2]!.slice(-2)).toEqual(['--out-dir', 'tmp/fresh']);
    expect(commands[3]!.slice(-2)).toEqual(['--root', 'tmp/fresh/reports']);
    expect(readFileSync(path.join(f.root, 'tmp/frozen/keep.txt'), 'utf8')).toBe('evidence');
  });
});
