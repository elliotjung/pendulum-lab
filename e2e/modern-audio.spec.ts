import { expect, test } from '@playwright/test';

/**
 * Stage-4: modern audio sonification. Toggling the audio checkbox must drive the
 * modern AudioSonifier (the legacy audio handler is taken over) without errors,
 * and the simulation must keep running.
 */
test('modern audio toggles without errors and keeps the sim running', async ({ page, browserName }) => {
  // Headless WebKit's AudioContext can stall on some Windows host audio backends,
  // freezing the sim loop the moment audio is enabled. This is an environment
  // issue (verified to fail identically on the unmodified baseline, and to pass
  // on a healthy audio stack), not an app regression — so it is explicitly
  // skipped on webkit+Windows rather than left to flake. CI (Linux) is unaffected.
  test.skip(
    browserName === 'webkit' && process.platform === 'win32',
    'webkit AudioContext stalls on some Windows audio backends (environment, not a regression)'
  );

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));

  // Enable audio via the real control (synthetic gesture).
  await page.evaluate(() => {
    const cb = document.getElementById('audioOn') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Adjust volume; must not throw.
  await page.evaluate(() => {
    const vol = document.getElementById('audioVol') as HTMLInputElement;
    vol.value = '0.2';
    vol.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);

  // Disable again.
  await page.evaluate(() => {
    const cb = document.getElementById('audioOn') as HTMLInputElement;
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Sim still advancing, no uncaught errors from the audio path.
  const t1 = await page.evaluate(
    () => (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time
  );
  await page.waitForTimeout(200);
  const t2 = await page.evaluate(
    () => (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time
  );
  expect(t2).toBeGreaterThan(t1);
  expect(errors).toEqual([]);
});
