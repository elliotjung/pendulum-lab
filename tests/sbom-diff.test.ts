import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { diffSboms, newHighCriticalVulnerabilities, parseSbomDiffArgs, runSbomDiff } from '../scripts/sbom-diff';

async function inTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'pendulum-sbom-diff-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function sbom(name: string, version: string): string {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    components: [{ type: 'library', name, version, purl: `pkg:npm/${name}@${version}` }]
  });
}

const emptyAudit = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} });

describe('SBOM dependency review', () => {
  it('reports added, removed, and upgraded components deterministically', () => {
    const base = {
      components: [
        { type: 'library', name: 'alpha', version: '1.0.0', purl: 'pkg:npm/alpha@1.0.0' },
        { type: 'library', name: 'removed', version: '2.0.0', purl: 'pkg:npm/removed@2.0.0' }
      ]
    };
    const head = {
      components: [
        { type: 'library', name: 'alpha', version: '1.1.0', purl: 'pkg:npm/alpha@1.1.0' },
        { type: 'library', name: 'new', version: '3.0.0', purl: 'pkg:npm/new@3.0.0' }
      ]
    };

    expect(diffSboms(base, head)).toEqual([
      { component: 'pkg:npm/alpha@1.1.0', before: '1.0.0', after: '1.1.0', kind: 'changed' },
      { component: 'pkg:npm/new@3.0.0', before: null, after: '3.0.0', kind: 'added' },
      { component: 'pkg:npm/removed@2.0.0', before: '2.0.0', after: null, kind: 'removed' }
    ]);
  });

  it('blocks only newly introduced high and critical advisories', () => {
    const existing = {
      vulnerabilities: {
        alpha: {
          severity: 'high',
          via: [{ source: 7, title: 'existing', url: 'https://example.test/7', severity: 'high' }]
        }
      }
    };
    const head = {
      vulnerabilities: {
        alpha: {
          severity: 'high',
          via: [{ source: 7, title: 'existing', url: 'https://example.test/7', severity: 'high' }]
        },
        beta: {
          severity: 'critical',
          via: [{ source: 9, title: 'new', url: 'https://example.test/9', severity: 'critical' }],
          range: '<2.0.0',
          nodes: ['node_modules/beta'],
          fixAvailable: true
        },
        gamma: { severity: 'moderate', via: [{ source: 10, title: 'not blocking', severity: 'moderate' }] }
      }
    };

    expect(newHighCriticalVulnerabilities(existing, head)).toEqual([
      {
        package: 'beta',
        severity: 'critical',
        advisory: 'https://example.test/9',
        range: '<2.0.0',
        nodes: ['node_modules/beta'],
        fixAvailable: true
      }
    ]);
  });

  it('treats absent CI snapshots as a fail-closed, actionable gate failure and writes a diagnostic report', async () => {
    await inTemporaryDirectory(async (directory) => {
      const report = join(directory, 'nested', 'sbom-diff.md');
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const exitCode = await runSbomDiff([
          '--base-sbom',
          join(directory, 'base.cdx.json'),
          '--head-sbom',
          join(directory, 'head.cdx.json'),
          '--base-audit',
          join(directory, 'base-audit.json'),
          '--head-audit',
          join(directory, 'head-audit.json'),
          '--output',
          report
        ]);

        expect(exitCode).toBe(2);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('This gate is fail-closed.'));
        const markdown = await readFile(report, 'utf8');
        expect(markdown).toContain('Status: **BLOCKED**');
        expect(markdown).toContain('file does not exist');
        expect(markdown).toContain('supply complete snapshots explicitly');
      } finally {
        error.mockRestore();
      }
    });
  });

  it('does not convert a failed npm audit response into a clean dependency result', async () => {
    await inTemporaryDirectory(async (directory) => {
      const baseSbom = join(directory, 'base.cdx.json');
      const headSbom = join(directory, 'head.cdx.json');
      const baseAudit = join(directory, 'base-audit.json');
      const headAudit = join(directory, 'head-audit.json');
      const report = join(directory, 'sbom-diff.md');
      await Promise.all([
        writeFile(baseSbom, sbom('alpha', '1.0.0'), 'utf8'),
        writeFile(headSbom, sbom('alpha', '1.0.0'), 'utf8'),
        writeFile(baseAudit, emptyAudit, 'utf8'),
        writeFile(headAudit, JSON.stringify({ error: { summary: 'registry unavailable' } }), 'utf8')
      ]);

      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        expect(
          await runSbomDiff([
            '--base-sbom',
            baseSbom,
            '--head-sbom',
            headSbom,
            '--base-audit',
            baseAudit,
            '--head-audit',
            headAudit,
            '--output',
            report
          ])
        ).toBe(2);
        expect(await readFile(report, 'utf8')).toContain('registry unavailable');
      } finally {
        error.mockRestore();
      }
    });
  });

  it('writes a passing report only after every snapshot validates', async () => {
    await inTemporaryDirectory(async (directory) => {
      const baseSbom = join(directory, 'base.cdx.json');
      const headSbom = join(directory, 'head.cdx.json');
      const baseAudit = join(directory, 'base-audit.json');
      const headAudit = join(directory, 'head-audit.json');
      const report = join(directory, 'nested', 'sbom-diff.md');
      await Promise.all([
        writeFile(baseSbom, sbom('alpha', '1.0.0'), 'utf8'),
        writeFile(headSbom, sbom('alpha', '1.1.0'), 'utf8'),
        writeFile(baseAudit, emptyAudit, 'utf8'),
        writeFile(headAudit, emptyAudit, 'utf8')
      ]);

      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        expect(
          await runSbomDiff([
            '--base-sbom',
            baseSbom,
            '--head-sbom',
            headSbom,
            '--base-audit',
            baseAudit,
            '--head-audit',
            headAudit,
            '--output',
            report
          ])
        ).toBe(0);
        expect(await readFile(report, 'utf8')).toContain('Status: **PASS**');
      } finally {
        log.mockRestore();
      }
    });
  });

  it('parses explicit paths and rejects an option without its file argument', () => {
    expect(parseSbomDiffArgs(['--base-sbom', 'base.json', '--head-audit'])).toMatchObject({
      help: false,
      paths: { baseSbom: 'base.json' },
      problems: [{ label: 'command line', path: '--head-audit', reason: 'requires a file path value' }]
    });
  });
});
