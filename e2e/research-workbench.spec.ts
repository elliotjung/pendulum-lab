import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openModernTab } from './shell';

test('research workbench saves experiments and prepares study exports', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');

  await page.locator('#rwExperimentName').fill('E2E research experiment');
  await page.locator('#rwExperimentNotes').fill('baseline reproducibility check');
  await page.locator('#rwSaveExperiment').click();
  await expect(page.locator('#rwExperimentSummary')).toContainText('1 experiment');

  await page.locator('#rwStudyVariable').selectOption('theta1');
  await page.locator('#rwStudyMin').fill('-0.5');
  await page.locator('#rwStudyMax').fill('0.5');
  await page.locator('#rwStudyCount').fill('4');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('4 points');

  await page.locator('#rwRebuildComparison').click();
  await expect(page.locator('#rwComparisonMatrix')).toContainText('E2E research experiment');
  await expect(page.locator('#rwPaperSummary')).toContainText('ready');
});

test('research storage recovers from invalid persisted entries', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/research-workbench/v1', JSON.stringify({
      experiments: [{ id: 'bad-exp', name: 'bad', snapshot: { state: [Number.NaN] } }],
      runLog: [{ id: 'bad-log', type: 'unknown' }],
      comparisonRows: [{ id: 'bad-row', method: 'nope' }],
      selectedExperimentId: 'missing'
    }));
  });
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');
  await expect(page.locator('#rwExperimentSummary')).toContainText('0 experiment');

  const savedSchema = await page.evaluate(() => {
    const raw = window.localStorage.getItem('pendulum-lab/research-workbench/v1');
    return raw ? JSON.parse(raw).schemaVersion : null;
  });
  expect(savedSchema).toBe('pendulum-research-workbench/v4');
});

test('study batch fills lambda/RQA/FTLE per point on the chaos worker', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');

  await page.locator('#rwStudyVariable').selectOption('theta1');
  await page.locator('#rwStudyMin').fill('1.5');
  await page.locator('#rwStudyMax').fill('2.5');
  await page.locator('#rwStudyCount').fill('3');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3 points');

  await page.locator('#rwRunStudyBatch').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3/3 points have batch results', { timeout: 60_000 });
  // The results table shows all three diagnostics for the first point.
  await expect(page.locator('#rwStudyResults table')).toBeVisible();
  await expect(page.locator('#rwStudyResults')).toContainText('theta1=1.5');
  await expect(page.locator('#rwStudyInsights')).toContainText('Plan hash');
  await expect(page.locator('#rwStudyCheckpoint')).toContainText('complete');
  await expect(page.locator('#rwStudyResults th').nth(1)).toContainText('lambda max');
  await expect(page.locator('#rwStudyResults th').nth(4)).toContainText('FTLE');
});

test('advanced research exports include bundle, LaTeX, notebook, and study data', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await openModernTab(page, 'research', '#researchWorkbench');

  await page.locator('#rwStudyStrategy').selectOption('sobol');
  await page.locator('#rwStudyCount').fill('5');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('sobol');

  const texDownloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportPaperTex').click();
  expect((await texDownloadPromise).suggestedFilename()).toBe('pendulum_methods_export.tex');

  const notebookDownloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportNotebook').click();
  const notebookDownload = await notebookDownloadPromise;
  expect(notebookDownload.suggestedFilename()).toBe('pendulum_research_notebook.ipynb');
  const notebookPath = await notebookDownload.path();
  expect(notebookPath).toBeTruthy();
  const notebook = JSON.parse(await readFile(notebookPath!, 'utf8'));
  expect(notebook.nbformat).toBe(4);

  const bundleDownloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportBundle').click();
  const bundleDownload = await bundleDownloadPromise;
  expect(bundleDownload.suggestedFilename()).toBe('pendulum_research_bundle.json');
  const bundlePath = await bundleDownload.path();
  expect(bundlePath).toBeTruthy();
  const bundle = JSON.parse(await readFile(bundlePath!, 'utf8'));
  expect(bundle.schemaVersion).toBe('pendulum-research-bundle/v1');
  expect(bundle.files.some((file: { path: string }) => file.path === 'paper/methods.tex')).toBe(true);
  expect(bundle.files.some((file: { path: string }) => file.path === 'paper/notebook.ipynb')).toBe(true);
  expect(bundle.files.some((file: { path: string }) => file.path === 'data/parameter-study-results.csv')).toBe(true);
  const bundledNotebook = bundle.files.find((file: { path: string }) => file.path === 'paper/notebook.ipynb');
  expect(JSON.parse(bundledNotebook.content).nbformat).toBe(4);
});

test('periodic-orbit finder converges and the branch trace reports stability', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'research', '#researchOrbitCard');

  await page.locator('#rwFindOrbit').click();
  await expect(page.locator('#rwOrbitSummary')).toContainText('period-1 orbit');
  await expect(page.locator('#rwOrbitSummary')).toContainText('STABLE');

  await page.locator('#rwOrbitSweepTo').fill('0.6');
  await page.locator('#rwTraceBranch').click();
  await expect(page.locator('#rwOrbitSummary')).toContainText('Branch traced', { timeout: 30_000 });
  await expect(page.locator('#rwOrbitBranch table')).toBeVisible();
  await expect(page.locator('#rwOrbitBranch')).toContainText('stable');
});

test('figure pack export downloads a captioned HTML gallery', async ({ page }) => {
  await page.goto('/');
  // Let the lab draw a few frames so the main canvas has content to capture.
  await page.waitForTimeout(600);

  await openModernTab(page, 'research', '#researchWorkbench');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportFigures').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pendulum_paper_figures.html');
  const path = await download.path();
  expect(path).toBeTruthy();
  const html = await readFile(path!, 'utf8');
  expect(html).toContain('pendulum-figure-manifest');
  expect(html).toContain('pendulum-paper-figures/v2');
});
