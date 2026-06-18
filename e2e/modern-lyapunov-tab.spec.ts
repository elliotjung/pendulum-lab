import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * Stage-3: the modern Lyapunov-spectrum tab takeover. Switching to the λ tab and
 * pressing Start must compute the full spectrum (via the chaos worker / fallback)
 * and fill the result fields + draw the spectrum canvas.
 */
test('modern Lyapunov tab computes and renders the full spectrum', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'lyap', '#tab-lyap');

  // Start the computation and wait for results to populate.
  await page.evaluate(() => document.getElementById('lyapStart')?.click());
  await page.waitForFunction(() => {
    const l1 = document.getElementById('L1')?.textContent ?? '—';
    return l1 !== '—' && l1.length > 0;
  }, undefined, { timeout: 20000 });

  // L1 now reads "<lambda> ± <stdError>"; parseFloat takes the leading value.
  const l1 = await page.evaluate(() => Number.parseFloat(document.getElementById('L1')?.textContent ?? ''));
  const ky = await page.evaluate(() => document.getElementById('KY')?.textContent ?? '');
  expect(Number.isFinite(l1)).toBe(true);
  expect(l1).toBeGreaterThan(0); // chaotic default → positive λ1
  expect(ky).not.toBe('—');

  // The spectrum canvas was drawn (non-blank).
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('lyapSpecCanvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 311) sum += d[i]!;
    return sum;
  });
  expect(drawn).toBeGreaterThan(0);

  // Status reflects completion.
  await expect(page.locator('#lyapStatus')).toContainText(/done|Σλ/);
});
