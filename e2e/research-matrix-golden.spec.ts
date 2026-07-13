import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('research matrix compares experiments and renders diagnostic maps', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
  });
  await page.goto('/');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { matrix?: unknown } }).__modernTabs?.matrix)
  );

  await openModernTab(page, 'matrix', '#tab-matrix');
  await page.locator('#matrixPreset').selectOption('cartpole-open-loop');
  await page.locator('#matrixHorizon').fill('2');
  await page.locator('#matrixGrid').fill('4');
  await page.locator('#matrixRun').click();

  await expect(page.locator('#matrixStatus')).toContainText('done', { timeout: 30_000 });
  await expect(page.locator('#matrixHash')).toContainText(/^exp-[0-9a-f]{8}$/);
  await expect(page.locator('#matrixComparisonBody tr')).toHaveCount(7);
  await expect(page.locator('#matrixMetrics')).toContainText('dt / t0');

  const nonBlank = await page.evaluate(() => {
    const ids = [
      'matrixSweepCanvas',
      'matrixPoincareCanvas',
      'matrixLyapCanvas',
      'matrixBasinCanvas',
      'matrixEnergyCanvas'
    ];
    return ids.every((id) => {
      const canvas = document.getElementById(id) as HTMLCanvasElement | null;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return false;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < pixels.length; i += 4) {
        if ((pixels[i] ?? 0) > 20 || (pixels[i + 1] ?? 0) > 20 || (pixels[i + 2] ?? 0) > 35) return true;
      }
      return false;
    });
  });
  expect(nonBlank).toBe(true);
});

test('golden center runs integrator threshold checks in its own tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
  });
  await page.goto('/');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { golden?: unknown } }).__modernTabs?.golden)
  );

  await openModernTab(page, 'golden', '#tab-golden');
  await page.evaluate(() => {
    document.querySelectorAll<HTMLInputElement>('input[data-golden-preset]').forEach((input) => {
      input.checked = input.value === 'cartpole-open-loop';
    });
  });
  await page.locator('#goldenRun').click();

  await expect(page.locator('#goldenStatus')).toContainText('done', { timeout: 30_000 });
  await expect(page.locator('#goldenHash')).toContainText(/^exp-[0-9a-f]{8}$/);
  await expect(page.locator('#goldenResultsBody tr')).toHaveCount(5);
  await expect(page.locator('.golden-table thead')).toContainText('Regression');
  await expect(page.locator('#goldenResultsBody')).toContainText(/exp-[0-9a-f]{8}/);
});
