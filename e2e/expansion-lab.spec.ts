import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('expansion lab runs a worker-backed model suite and records the result', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
  });
  await page.goto('/');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { expansion?: unknown } }).__modernTabs?.expansion)
  );

  await openModernTab(page, 'expansion', '#tab-expansion');
  await page.locator('#expPreset').selectOption('cartpole-open-loop');
  await expect(page.locator('#expModelDoc')).toContainText('Cart-Pole');
  await page.locator('#expModel').selectOption('cartpole');
  await page.locator('#expHorizon').fill('3');
  await page.locator('#expBifColumns').fill('5');
  await page.locator('#expRun').click();

  await expect(page.locator('#expStatus')).toContainText('done', { timeout: 20_000 });
  await expect(page.locator('#expHash')).toContainText(/^exp-[0-9a-f]{8}$/);
  await expect(page.locator('#expBest')).toContainText(/rk4|dopri5|leapfrog|symplectic|euler/);
  await expect(page.locator('#expMethodTable tr')).toHaveCount(5);
  await expect(page.locator('#expHistory')).toContainText('Cart-Pole');
  await page.locator('#expGolden').click();
  await expect(page.locator('#expBatchResults')).toContainText('Golden checks', { timeout: 20_000 });
  await page.locator('#expBatch').click();
  await expect(page.locator('#expBatchResults')).toContainText('Batch queue', { timeout: 20_000 });
  await page.locator('#expShare').click();
  await expect(page.locator('#expStatus')).toContainText('share hash applied');
  expect(page.url()).toContain('#expansion=');

  const nonBlank = await page.evaluate(() => {
    const canvas = document.getElementById('expHeatmapCanvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i] ?? 0) > 10 || (pixels[i + 1] ?? 0) > 10 || (pixels[i + 2] ?? 0) > 20) return true;
    }
    return false;
  });
  expect(nonBlank).toBe(true);
});

test('expansion lab restores a shared hash into controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
  });
  await page.goto(
    '/#expansion=eyJtb2RlbCI6ImNhcnRwb2xlIiwiaG9yaXpvbiI6NCwiZHQiOjAuMDA2LCJwYXJhbWV0ZXJPdmVycmlkZXMiOnsiZm9yY2UiOjAuNX19'
  );
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { expansion?: unknown } }).__modernTabs?.expansion)
  );
  await openModernTab(page, 'expansion', '#tab-expansion');
  await expect(page.locator('#expModel')).toHaveValue('cartpole');
  await expect(page.locator('#expHorizon')).toHaveValue('4');
  await expect(page.locator('#expSweepValue')).toHaveValue('0.5');
  await expect(page.locator('#expStatus')).toContainText('share hash restored');
});
