import { expect, test } from '@playwright/test';

test('reviewer console loads report JSON and exposes rich evidence', async ({ page }) => {
  await page.goto('/reviewer.html');
  await expect(page.getByRole('heading', { name: 'Evidence overview' })).toBeVisible();
  await expect(page.locator('[data-evidence-id="flagship"]')).toContainText('gamma =');
  await expect(page.locator('[data-evidence-id="matrix"]')).toContainText('/3 vendors');

  const inspect = page.locator('[data-evidence-id="flagship"]').getByRole('button', { name: 'Inspect evidence' });
  await inspect.click();
  const dialog = page.getByTestId('evidence-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Source');
  await expect(dialog).toContainText('Parameters');
  await expect(dialog).toContainText('Validation / Error');
  await expect(dialog).toContainText('Reproduce');
  await expect(dialog).toContainText('Caveat');
  await dialog.getByRole('button', { name: 'Close evidence' }).click();
  await expect(dialog).not.toBeVisible();
});

test('reviewer console tabs expose vendor matrix and artifact ledger', async ({ page }) => {
  await page.goto('/reviewer.html');
  await page.getByRole('tab', { name: 'GPU Matrix' }).click();
  await expect(page.getByRole('heading', { name: 'WebGPU adapter matrix' })).toBeVisible();
  const matrix = page.locator('#panel-gpu .data-table');
  await expect(matrix.getByRole('row').filter({ hasText: 'intel' })).toBeVisible();
  await expect(matrix.getByRole('row').filter({ hasText: 'nvidia' })).toBeVisible();
  await expect(matrix.getByRole('row').filter({ hasText: 'amd' })).toBeVisible();

  await page.getByRole('tab', { name: 'Artifacts' }).click();
  await expect(page.getByRole('heading', { name: 'Artifact ledger' })).toBeVisible();
  await expect(page.getByText('flagship-study-json')).toBeVisible();
  await expect(page.getByText('https://elliot-jung-17.github.io/pendulum-lab/reports/paper-study.json')).toBeVisible();
});

test('reviewer console exposes mutation heatmap and CI evidence links', async ({ page }) => {
  await page.goto('/reviewer.html');
  await page.getByRole('tab', { name: 'Mutation' }).click();
  await expect(page.getByRole('heading', { name: 'Mutation survivor heatmap' })).toBeVisible();
  await expect(page.getByTestId('mutation-heatmap')).toContainText('src/physics/doubleString.ts');

  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.locator('[data-evidence-id="mutation"]').getByRole('button', { name: 'Inspect evidence' }).click();
  const dialog = page.getByTestId('evidence-dialog');
  await expect(dialog).toContainText('Actions Run');
  await expect(dialog).toContainText('Aggregate Artifact');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('reviewer console supports keyboard tab navigation', async ({ page }) => {
  await page.goto('/reviewer.html');
  const overview = page.getByRole('tab', { name: 'Overview' });
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'WebGPU adapter matrix' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Mutation survivor heatmap' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('heading', { name: 'Artifact ledger' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByRole('heading', { name: 'Evidence overview' })).toBeVisible();
});

test('reviewer console remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/reviewer.html');
  await expect(page.locator('[data-evidence-id="publication"]')).toContainText('npm');
  await page.getByRole('tab', { name: 'Mutation' }).click();
  await expect(page.getByTestId('mutation-heatmap')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
