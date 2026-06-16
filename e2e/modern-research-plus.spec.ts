import { expect, test } from '@playwright/test';

/**
 * The Research+ tab surfaces three previously library/CLI-only solvers as Lab UI:
 * a stochastic (Langevin) ensemble, the inverse parameter-estimation problem, and
 * the polynomial-chaos surrogate with its analytic Sobol decomposition.
 */
test('Research+ tab runs the SDE ensemble, parameter fit, and PCE surrogate', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernTabs?: unknown }).__modernTabs));
  await page.evaluate(() => (document.querySelector('[role="tab"][data-tab="research"]') as HTMLButtonElement | null)?.click());
  await expect(page.locator('#tab-research')).toBeVisible();

  // 1) Stochastic ensemble — variance reported and the canvas drawn.
  await page.evaluate(() => document.getElementById('rpSdeRun')?.click());
  await page.waitForFunction(() => (document.getElementById('rpSdeStatus')?.textContent ?? '').includes('realisations'), undefined, { timeout: 30000 });
  const sdeDrawn = await page.evaluate(() => {
    const c = document.getElementById('rpSdeCanvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 199) s += d[i]!;
    return s;
  });
  expect(sdeDrawn).toBeGreaterThan(0);

  // 2) Inverse problem — recovered g is close to the truth 9.81.
  await page.evaluate(() => document.getElementById('rpFitRun')?.click());
  await page.waitForFunction(() => (document.getElementById('rpFitStatus')?.textContent ?? '').includes('ĝ'), undefined, { timeout: 30000 });
  const fitStatus = await page.evaluate(() => document.getElementById('rpFitStatus')?.textContent ?? '');
  expect(fitStatus).toContain('ĝ = 9.8');

  // 3) PCE surrogate — high R² and a Sobol decomposition reported.
  await page.evaluate(() => document.getElementById('rpPceRun')?.click());
  await page.waitForFunction(() => (document.getElementById('rpPceStatus')?.textContent ?? '').includes('R²'), undefined, { timeout: 30000 });
  const pceOut = await page.evaluate(() => document.getElementById('rpOut')?.textContent ?? '');
  expect(pceOut).toContain('Sobol');
  // Additive f ⇒ the first-order Sobol indices sum to ≈ 1 — a robust, meaningful signature.
  expect(pceOut).toContain('ΣS = 1.0000');
});
