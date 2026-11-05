import { expect, test, type Page } from '@playwright/test';
async function ready(page: Page) {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
}
import { readFile } from 'node:fs/promises';
import { importResearchPackage, readResearchZip } from '../../src/product/provenance/package';
import type { ResearchFocusResult } from '../../src/product/experiments/research-focus-contracts';
test.describe('S27 reproducible research packages', () => {
  test('8.11 refuses a stale ZIP after an input becomes invalid while hashing', async ({ page }) => {
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.goto('/next.html#/learn/course-8/8.11');
    await ready(page);
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
    await page.evaluate(() => {
      const state = window as unknown as { s27DigestStarted: boolean; s27ReleaseDigest: () => void };
      const original = crypto.subtle.digest.bind(crypto.subtle);
      let release!: () => void,
        first = true;
      const gate = new Promise<void>((done) => {
        release = done;
      });
      state.s27DigestStarted = false;
      state.s27ReleaseDigest = release;
      Object.defineProperty(crypto.subtle, 'digest', {
        configurable: true,
        value: (...args: Parameters<SubtleCrypto['digest']>) => {
          if (first) {
            first = false;
            state.s27DigestStarted = true;
            return gate.then(() => original(...args));
          }
          return original(...args);
        }
      });
    });
    await page.getByRole('button', { name: '연구 ZIP 내보내기', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { s27DigestStarted: boolean }).s27DigestStarted))
      .toBe(true);
    await page.locator('.focus-controls input').first().fill('');
    await expect(page.getByRole('button', { name: '연구 ZIP 내보내기', exact: true })).toBeDisabled();
    await page.evaluate(() => (window as unknown as { s27ReleaseDigest: () => void }).s27ReleaseDigest());
    await expect(page.locator('.focus-package-status')).toContainText('설정이 바뀌어');
    expect(downloads).toEqual([]);
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
  });
  for (const id of ['8.11', '8.12'])
    test(`${id} downloads the actual source-bound verified ZIP and preserves displayed hashes`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/next.html#/learn/course-8/${id}`);
      await ready(page);
      await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
      await page.getByRole('button', { name: '실험 실행', exact: true }).click();
      await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
      const reportPending = page.waitForEvent('download');
      await page.getByRole('button', { name: '실험 결과 JSON 내보내기', exact: true }).click();
      const report = JSON.parse(await readFile((await (await reportPending).path())!, 'utf8')) as ResearchFocusResult;
      if (id === '8.12') {
        await page.evaluate(() => {
          const original = crypto.subtle.digest.bind(crypto.subtle);
          let fail = true;
          Object.defineProperty(crypto.subtle, 'digest', {
            configurable: true,
            value: (...args: Parameters<SubtleCrypto['digest']>) => {
              if (fail) {
                fail = false;
                return Promise.reject(new Error('fixture-package-digest-failure'));
              }
              return original(...args);
            }
          });
        });
        await page.getByRole('button', { name: '연구 ZIP 내보내기', exact: true }).click();
        await expect(page.locator('.focus-package-status')).toContainText('만들지 못했습니다');
        await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
      }
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: '연구 ZIP 내보내기', exact: true }).click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toBe(`learn-${id}-research.zip`);
      const bytes = new Uint8Array(await readFile((await download.path())!)),
        bundle = await importResearchPackage(bytes);
      expect(bundle.project.runs).toHaveLength(2);
      expect(bundle.project.runs.every((r) => r.status === 'completed')).toBe(true);
      for (const run of bundle.project.runs) expect(run.experiment).toEqual(report.canonical);
      expect(bundle.project.artifacts.map((a) => a.sha256).sort()).toEqual(
        report.tables
          .find((t) => t.id === 'lineage')!
          .rows.map((r) => r[4])
          .sort()
      );
      const entries = readResearchZip(bytes);
      if (id === '8.12') {
        expect(entries.map((e) => e.path)).toEqual(
          expect.arrayContaining([
            'reviewer.html',
            'report.md',
            'notebook.json',
            'figures/figure-s27.svg',
            'figures/figure-s27.csv'
          ])
        );
        const html = new TextDecoder().decode(entries.find((e) => e.path === 'reviewer.html')!.data);
        await page.route('**/s27-teaching-reviewer.html', (route) =>
          route.fulfill({ contentType: 'text/html', body: html })
        );
        await page.context().setOffline(true);
        try {
          await page.goto('/s27-teaching-reviewer.html');
          await expect(page.locator('body')).toContainText('과정8');
          await expect(page.locator('body')).toContainText('원본');
        } finally {
          await page.context().setOffline(false);
        }
      }
      expect(errors).toEqual([]);
    });
});
