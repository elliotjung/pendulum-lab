import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('evidence command boundaries', () => {
  it('keeps mutable local documentation sync separate from immutable release evidence', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string | undefined>;
    };
    expect(packageJson.scripts?.['docs:sync']).toBe('tsx scripts/sync-test-counts.ts');
    expect(packageJson.scripts?.['release:evidence:check']).toBe('npm run evidence:summary');
    expect(packageJson.scripts?.verify).toContain('npm run docs:sync');
    expect(packageJson.scripts?.verify).toContain('npm run audit:public-artifacts');
    expect(packageJson.scripts?.verify).not.toContain('evidence:refresh');
    expect(packageJson.scripts?.verify).not.toContain('evidence:bindings');

    const releaseWorkflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(releaseWorkflow).toContain('npm run release:evidence:check');

    const evidenceScript = await readFile('scripts/evidence-summary.ts', 'utf8');
    expect(evidenceScript).toContain('Refusing to refresh public evidence from a dirty worktree');
    expect(evidenceScript).toContain("PENDULUM_EVIDENCE_CI_ARTIFACT === '1'");
    expect(evidenceScript).toContain('CI evidence source commit must equal both the checked-out HEAD and GITHUB_SHA.');
    expect(evidenceScript).toContain('CI evidence artifact requires a clean tracked source checkout.');
    expect(evidenceScript).toContain('if (!checkOnly && !ciArtifactMode)');
    expect(evidenceScript.match(/await validateEvidenceBindings\(bindingOptions\(\)\)/g)).toHaveLength(2);

    const bindingScript = await readFile('scripts/validate-evidence-bindings.ts', 'utf8');
    expect(bindingScript).toContain('.update(await readFile(join(options.reportRoot, path)))');
    expect(bindingScript).toContain('sourceReportSha256 keys must exactly match sourceReports paths');

    const copyScript = await readFile('scripts/copy-legacy-assets.mjs', 'utf8');
    const publicInventory = JSON.parse(await readFile('config/public-report-inventory.json', 'utf8')) as {
      reports?: string[];
    };
    expect(copyScript).toContain("readFile('config/public-report-inventory.json', 'utf8')");
    for (const report of [
      'vitest-public-results.json',
      'energy-benchmark.json',
      'cross-validation.json',
      'literature-anchors.json'
    ]) {
      expect(publicInventory.reports).toContain(report);
    }
    expect(copyScript).toContain("copyFile('config/claim-registry.json', 'dist/reports/claim-registry.json')");

    const mainlineWorkflow = await readFile('.github/workflows/main.yml', 'utf8');
    expect(mainlineWorkflow).toContain('npm run evidence:bindings');
    expect(mainlineWorkflow).toContain('PENDULUM_EVIDENCE_BINDING_ROOT=validated/dist');
    expect(mainlineWorkflow).toContain('PENDULUM_CLAIM_EVIDENCE=validated/dist/reports/evidence-summary.json');

    const claimGate = await readFile('scripts/validate-claim-registry.ts', 'utf8');
    expect(claimGate).toContain('const evidence = strictEvidencePath');
    expect(claimGate).toContain('requireEvidenceBindings: strictEvidencePath !== undefined');

    const pagesWorkflow = await readFile('.github/workflows/pages.yml', 'utf8');
    expect(pagesWorkflow).toContain('deployed evidence SHA-256 mismatch');
  });
});
