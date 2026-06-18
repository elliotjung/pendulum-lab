import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openModernTab } from './shell';

async function openWorkbench(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');
}

test('IndexedDB store mirrors experiments and recovers them after localStorage loss', async ({ page }) => {
  // Wipe storage on the FIRST load only — addInitScript re-runs on reload, and
  // the whole point of this test is that IndexedDB survives the reload.
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('idb-test-wiped')) {
      window.sessionStorage.setItem('idb-test-wiped', '1');
      window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
      void window.indexedDB?.deleteDatabase('pendulum-lab-research');
    }
  });
  await openWorkbench(page);

  await page.locator('#rwExperimentName').fill('IDB persistence check');
  await page.locator('#rwSaveExperiment').click();
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment');

  // Wait for the debounced IndexedDB mirror, then verify the storage panel sees it.
  await page.locator('#rwDbRefresh').click();
  await expect(page.locator('#rwStorageSummary')).toContainText('1 experiments', { timeout: 10_000 });

  // Simulate localStorage loss: the long-term IndexedDB archive must recover.
  await page.evaluate(() => window.localStorage.removeItem('pendulum-lab/research-workbench/v1'));
  await page.reload();
  await openModernTab(page, 'research', '#researchWorkbench');
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment', { timeout: 10_000 });
  await expect(page.locator('#rwExperimentSelect')).toContainText('IDB persistence check');
});

test('full DB archive exports as validated JSON', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
    void window.indexedDB?.deleteDatabase('pendulum-lab-research');
  });
  await openWorkbench(page);

  await page.locator('#rwExperimentName').fill('Archive roundtrip');
  await page.locator('#rwSaveExperiment').click();
  await page.locator('#rwDbRefresh').click();
  await expect(page.locator('#rwStorageSummary')).toContainText('1 experiments', { timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rwDbExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pendulum_research_db_archive.json');
  const archive = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(archive.schemaVersion).toBe('pendulum-research-db/v1');
  expect(Array.isArray(archive.stores.experiments)).toBe(true);
  expect(archive.stores.experiments.length).toBeGreaterThanOrEqual(1);
  expect(archive.stores.experiments[0].id).toBeTruthy();
});
