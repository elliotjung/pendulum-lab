import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateActionsRuntime } from '../scripts/validate-actions-runtime';
import { validateQualityRiskRegister } from '../scripts/validate-quality-risk-register';

describe('quality policy contracts', () => {
  it('keeps priority failure-mode tests traceable to their source areas', async () => {
    expect(await validateQualityRiskRegister()).toEqual([]);
  });

  it('keeps Node and third-party Actions pins under one checked policy', async () => {
    expect(await validateActionsRuntime()).toEqual([]);
  });

  it('keeps visual promotion useful under read-only bot policy and binds native fingerprints', async () => {
    const workflow = await readFile('.github/workflows/visual-baselines.yml', 'utf8');
    expect(workflow).toContain('default: review-artifact');
    expect(workflow).toMatch(/permissions:\r?\n  contents: read/u);
    expect(workflow).toContain('scripts/visual-baseline-fingerprint.mjs');
    expect(workflow).toContain('--require-metadata');
    expect(workflow).toContain('visual-baseline-review-${{ github.run_id }}');
    expect(workflow).toContain("if: ${{ inputs.promotion_mode == 'pull-request' }}");
  });

  it('writes a post-deployment publication probe separately from source snapshots', async () => {
    const pages = await readFile('.github/workflows/pages.yml', 'utf8');
    expect(pages).toContain('probe-deployed-publication:');
    expect(pages).toContain('PENDULUM_PUBLICATION_REPORT_KIND: deployment-probe');
    expect(pages).toContain('PENDULUM_PUBLICATION_REQUIRE_DEPLOYMENT_BINDING');
    expect(pages).toContain('reports/deployment-publication-status.json');
  });
});
