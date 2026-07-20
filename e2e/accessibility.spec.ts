import { expect, test } from '@playwright/test';

test('core controls and canvases expose accessible names', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas[role="img"]').first()).toBeVisible();
  await expect(page.locator('button[aria-label]').first()).toBeVisible();
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toContain('user-scalable=no');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
});

test('dynamic canvases and rail controls receive stable accessible names', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="analysis"]').click();
  await page.locator('.tab[data-tab="expansion"]').click();
  await expect(page.locator('#expReplayCanvas')).toHaveAttribute('role', 'img');
  await expect(page.locator('#expReplayCanvas')).toHaveAttribute('aria-label', /Expansion lab replay/i);

  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { switchTo(tab: string): void } }).__modernShell?.switchTo('research');
  });
  await expect(page.locator('#rwDesignPreview')).toHaveAttribute('role', 'img');
  await expect(page.locator('#rwDesignPreview')).toHaveAttribute('aria-label', /design-space/i);

  await expect(page.locator('#hudParticles')).toHaveCount(0);
  const railLabel = await page.locator('.rail-menu-button[data-rail-section-button="sim"]').getAttribute('aria-label');
  expect(railLabel).toBeTruthy();
  expect(railLabel).not.toBe('SSim');
});

test('the 3D workspace deep link exposes an accessible canvas', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?audience=research&tab=lab3d', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#r3Canvas')).toHaveAttribute('role', 'img');
  await expect(page.locator('#r3Canvas')).toHaveAttribute('aria-label', /Rope pendulum/i);
});

test('diagnostics drawer manages keyboard focus and system accessibility preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/?audience=student');
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

  await page.locator('#trustDrawerToggle').click();
  await expect(page.locator('#trustDrawer')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('trustDrawer');
  await page.keyboard.press('Escape');
  await expect(page.locator('#trustDrawer')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('trustDrawerToggle');
});
