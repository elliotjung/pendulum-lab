import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('simulation runs, switches tabs, exports, and runs validation', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Pendulum Lab/i })).toBeVisible();

  // The modern Lab drives the simulation (no legacy runtime).
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  const before = await page.evaluate(
    () => (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time
  );
  await page.waitForFunction(
    (start) =>
      (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time >
      start,
    before,
    { timeout: 5000 }
  );
  const after = await page.evaluate(
    () => (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time
  );
  expect(after).toBeGreaterThan(before);

  // Pause / resume via the control.
  const pauseButton = page.locator('#pauseBtn');
  await expect(pauseButton).toBeVisible();
  // Exercise the control as two distinct activations. Besides verifying the
  // observable paused state, this gives mobile WebKit a rendering turn between
  // cancelling and scheduling its animation frame. In this workload, headless
  // desktop WebKit can terminate its renderer during Playwright pointer
  // synthesis; HTMLButtonElement.click() dispatches the same control listener
  // while Chromium and mobile WebKit retain native-pointer coverage.
  const activatePause = async (): Promise<void> => {
    if (testInfo.project.name === 'webkit') {
      await pauseButton.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('pause control must remain a button');
        button.click();
      });
      return;
    }
    await pauseButton.click();
  };
  await activatePause();
  await page.waitForFunction(
    () => !(window as unknown as { __modernLab: { isRunning(): boolean } }).__modernLab.isRunning()
  );
  await activatePause();
  await page.waitForFunction(() =>
    (window as unknown as { __modernLab: { isRunning(): boolean } }).__modernLab.isRunning()
  );

  // Tab switching (modern shell).
  await openModernTab(page, 'validate', '#tab-validate');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { validation?: unknown } }).__modernTabs?.validation)
  );

  // Validation (modern ValidationTab).
  await expect(page.locator('#runValidation')).toBeVisible();
  await page.evaluate(() => document.getElementById('runValidation')?.click());
  await page.waitForFunction(
    () => (document.getElementById('validateResults')?.childElementCount ?? 0) >= 5,
    undefined,
    { timeout: 15000 }
  );

  // The modern runtime surface is installed.
  const runtime = await page.evaluate(() => {
    const r = (window as unknown as { PendulumRuntime?: { describe(): { services: string[] } } }).PendulumRuntime;
    return r ? r.describe() : null;
  });
  expect(runtime).not.toBeNull();
  expect(runtime?.services).toContain('state');

  // Submission-manifest export downloads.
  await page.waitForFunction(() => Boolean((window as unknown as { PendulumLabIndex?: unknown }).PendulumLabIndex));
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const r = (window as unknown as { PendulumLabIndex: { commands: { run(id: string): Promise<void> } } })
      .PendulumLabIndex;
    return r.commands.run('index.exportSubmissionManifest');
  });
  expect((await downloadPromise).suggestedFilename()).toContain('pendulum');
});
