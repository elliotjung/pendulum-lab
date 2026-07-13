import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openModernTab } from './shell';

test('multi-variable design generates, runs with adaptive refinement, and exports CSV', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
    window.localStorage.removeItem('pendulum-lab/design-study/v1');
  });
  await page.goto('/');
  await openModernTab(page, 'research', '#researchDesignCard');

  await page.locator('#rwDesignVars').fill('theta1,1.4,2.6\ndamping,0,0.3');
  await page.locator('#rwDesignStrategy').selectOption('sobol');
  await page.locator('#rwDesignCount').fill('3');
  await page.locator('#rwDesignMaxPoints').fill('6');
  await page.locator('#rwDesignMaxTime').fill('90');
  await page.locator('#rwGenerateDesign').click();
  await expect(page.locator('#rwDesignSummary')).toContainText('3 points');
  await expect(page.locator('#rwDesignSummary')).toContainText('theta1, damping');

  await page.locator('#rwRunDesign').click();
  await expect(page.locator('#rwDesignSummary')).toContainText(/Status: (complete|budget-stopped)/, {
    timeout: 100_000
  });
  await expect(page.locator('#rwDesignResults table')).toBeVisible();
  // Lambda column filled for at least the first row.
  await expect(page.locator('#rwDesignResults td').nth(2)).not.toHaveText('-');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rwExportDesignCsv').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pendulum_design_study_results.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('# schemaVersion=pendulum-design-study-results/v1');
  expect(csv).toContain('# uncertainty=lambda block std error');
  expect(csv).toContain('lambda_max');
  expect(csv.split('\n').filter((line) => !line.startsWith('#')).length).toBeGreaterThan(3);
});
