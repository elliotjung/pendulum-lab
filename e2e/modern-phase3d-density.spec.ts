import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

function canvasSum(id: string): number {
  const c = document.getElementById(id) as HTMLCanvasElement | null;
  if (!c) return -1;
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 281) s = (s + d[i]!) % 2147483647;
  return s;
}

test('modern 3D phase tab renders a rotatable point cloud', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'phase3d', '#tab-phase3d');

  await page.waitForTimeout(500);
  const a = await page.evaluate(canvasSum, 'p3dCanvas');
  await page.waitForTimeout(400);
  const b = await page.evaluate(canvasSum, 'p3dCanvas');
  expect(a).toBeGreaterThan(0); // non-blank
  expect(b).not.toBe(a); // animating / accumulating
});

test('modern density tab accumulates a phase-density field', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'density', '#tab-density');

  await page.waitForTimeout(700);
  expect(await page.evaluate(canvasSum, 'gpuCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#gpuStatus')).toContainText('Canvas2D');
});
