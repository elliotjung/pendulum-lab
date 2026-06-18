import { expect, test } from '@playwright/test';
import { waitForModernShell } from './shell';

/**
 * Exercises the Stage-2 parity features now wired into the default modern Lab:
 * presets, data export (JSON/CSV download), and live Poincaré accumulation.
 */
test('modern Lab presets, export, and Poincaré work by default', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));

  // Preset application: clicking "periodic" sets θ1 ≈ 0.5 (the legacy app adds a
  // tiny seed perturbation) and the modern sim rebuilds from it.
  const th1Before = await page.evaluate(() => Number((document.getElementById('th1') as HTMLInputElement).value));
  await waitForModernShell(page);
  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { applyPreset(name: string): void } }).__modernShell?.applyPreset('periodic');
  });
  await page.waitForFunction(() => Math.abs(Number((document.getElementById('th1') as HTMLInputElement).value) - 0.5) < 0.01);
  const th1After = await page.evaluate(() => Number((document.getElementById('th1') as HTMLInputElement).value));
  expect(th1Before).toBeGreaterThan(1); // was the chaotic default (~2.0)
  expect(Math.abs(th1After - 0.5)).toBeLessThan(0.01);

  // Run JSON export downloads a file.
  const jsonDownload = page.waitForEvent('download');
  await page.evaluate(() => document.getElementById('dlJsonBtn')?.click());
  expect((await jsonDownload).suggestedFilename()).toContain('pendulum');

  // Let the trajectory accumulate, then CSV export downloads.
  await page.waitForTimeout(400);
  const csvDownload = page.waitForEvent('download');
  await page.evaluate(() => document.getElementById('dlTrajBtn')?.click());
  expect((await csvDownload).suggestedFilename()).toContain('.csv');

  // Poincaré section accumulates crossings for the chaotic default over time.
  await page.waitForFunction(
    () => (window as unknown as { __modernLab: { diagnostics(): { poincarePoints: number } } }).__modernLab.diagnostics().poincarePoints > 0,
    undefined,
    { timeout: 8000 }
  );
  const diag = await page.evaluate(() => (window as unknown as { __modernLab: { diagnostics(): { poincarePoints: number; lambdaMax: number } } }).__modernLab.diagnostics());
  expect(diag.poincarePoints).toBeGreaterThan(0);
});
