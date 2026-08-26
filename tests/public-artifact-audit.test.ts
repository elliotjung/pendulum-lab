import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditPublicArtifacts, scanPublicArtifactText } from '../scripts/audit-public-artifacts';

describe('public artifact privacy audit', () => {
  it('detects local absolute paths without returning their sensitive values', () => {
    const privateValues = [
      'C:/Users/reviewer/private/report.json',
      String.raw`D:\build\pendulum\report.json`,
      String.raw`\\private-host\share\report.json`,
      '/home/runner/work/pendulum-lab/report.json',
      '/Users/reviewer/Desktop/report.json',
      'file:///tmp/private/report.json'
    ];
    const findings = scanPublicArtifactText(privateValues.join('\n'), 'report.json');
    expect(new Set(findings.map(({ rule }) => rule))).toEqual(
      expect.objectContaining(new Set(['windows-absolute-path', 'unc-absolute-path', 'posix-home-path', 'file-uri']))
    );
    expect(JSON.stringify(findings)).not.toContain('reviewer');
    expect(JSON.stringify(findings)).not.toContain('private-host');
  });

  it('detects credential material while allowing redacted fields, public URLs, hashes, and relative paths', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const unsafe = JSON.stringify({
      source: 'reports/gpu-benchmark-ladder.json',
      authorization: `Authorization: Bearer ${'b'.repeat(24)}`,
      api_key: 'super-secret-production-value',
      token
    });
    const findings = scanPublicArtifactText(unsafe, 'unsafe.json');
    expect(findings.map(({ rule }) => rule)).toEqual(
      expect.arrayContaining(['authorization-bearer', 'credential-assignment', 'provider-token'])
    );
    expect(JSON.stringify(findings)).not.toContain(token);

    expect(
      scanPublicArtifactText(
        JSON.stringify({
          source: 'reports/gpu-benchmark-ladder.json',
          url: 'https://example.test/home/reviewer/report.json',
          api_key: '[redacted]',
          sha256: 'a'.repeat(64)
        })
      )
    ).toEqual([]);
  });

  it('recursively scans staged public text reports and skips binary assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pendulum-public-audit-'));
    try {
      await mkdir(join(root, 'nested'));
      await writeFile(join(root, 'safe.json'), '{"source":"reports/safe.json"}\n', 'utf8');
      await writeFile(join(root, 'nested', 'unsafe.svg'), '<text>/home/runner/private.svg</text>\n', 'utf8');
      await writeFile(join(root, 'preview.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

      const result = await auditPublicArtifacts({ publicRoot: root });
      expect(result.filesChecked).toBe(2);
      expect(result.binaryFilesSkipped).toBe(1);
      expect(result.findings).toEqual([
        expect.objectContaining({ file: 'nested/unsafe.svg', rule: 'posix-home-path', line: 1 })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed when a declared text artifact cannot be completely inspected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pendulum-public-audit-'));
    try {
      await writeFile(join(root, 'invalid.json'), new Uint8Array([0xc3, 0x28]));
      await writeFile(join(root, 'oversize.txt'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x61));
      const result = await auditPublicArtifacts({ publicRoot: root });
      expect(result.findings.map(({ rule }) => rule)).toEqual([
        'invalid-utf8-text-artifact',
        'text-artifact-too-large-to-scan'
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is a fail-closed source, build, and Mainline gate without refreshing evidence', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readFile('.github/workflows/main.yml', 'utf8');
    const scanner = await readFile('scripts/audit-public-artifacts.ts', 'utf8');

    expect(packageJson.scripts?.verify).toContain('npm run audit:public-artifacts');
    expect(packageJson.scripts?.verify).not.toContain('evidence:refresh');
    expect(packageJson.scripts?.build).toContain('npm run audit:public-artifacts -- --root dist/reports');
    expect(workflow).toContain('npm run audit:public-artifacts -- --root dist/reports');
    expect(scanner).toContain('process.exitCode = 1');
  });
});
