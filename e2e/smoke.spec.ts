import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

function runtimeStateHash(state: readonly number[]): string {
  let hash = 2166136261 >>> 0;
  for (const value of state) {
    hash ^= Math.trunc(value * 1e9);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

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
  const liveSnapshot = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: {
          runtimeSnapshot(): { state: number[]; simTime: number; hash: string };
        };
      }
    ).__modernLab.runtimeSnapshot()
  );
  expect(liveSnapshot.simTime).toBeGreaterThan(0);
  expect(liveSnapshot.state).not.toEqual([2, 2.5, 0, 0]);
  expect(liveSnapshot.hash).toBe(runtimeStateHash(liveSnapshot.state));
  await expect(page.locator('#dPoinc')).toContainText('rising');

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
  await expect(pauseButton).toHaveText('▶ Resume');
  await expect(pauseButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modeLabel')).toHaveText('paused');
  await activatePause();
  await page.waitForFunction(() =>
    (window as unknown as { __modernLab: { isRunning(): boolean } }).__modernLab.isRunning()
  );
  await expect(pauseButton).toHaveText('⏸ Pause');
  await expect(pauseButton).toHaveAttribute('aria-pressed', 'false');
  await activatePause();
  await expect(pauseButton).toHaveText('▶ Resume');
  await page.locator('#resetBtn').click();
  await page.waitForFunction(() =>
    (window as unknown as { __modernLab: { isRunning(): boolean } }).__modernLab.isRunning()
  );
  await expect(pauseButton).toHaveText('⏸ Pause');
  await expect(page.locator('#modeLabel')).toContainText('running');

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

test('replay scrubber has a stable live sentinel and rewinds synchronously', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  const scrubber = page.locator('#scrubber');
  const scrubValue = page.locator('#scrubVal');
  await expect.poll(async () => Number(await scrubber.getAttribute('max'))).toBeGreaterThan(3);
  const liveSentinel = Number(await scrubber.getAttribute('max'));

  const seek = async (value: number): Promise<void> => {
    await scrubber.evaluate((element, next) => {
      const input = element as HTMLInputElement;
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };

  await seek(Math.min(2, liveSentinel - 1));
  await expect(page.locator('#modeLabel')).toHaveText('replay');
  await expect(page.locator('#pauseBtn')).toHaveText('▶ Resume');
  await expect(page.locator('#pauseBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(() => {
    const app = (window as unknown as { __modernLab?: { isRunning(): boolean } }).__modernLab;
    return Boolean(app && !app.isRunning());
  });

  await page.locator('#rewindBtn').click();
  await expect(scrubber).toHaveValue('0');
  await expect(scrubValue).not.toHaveText('live');
  await expect(page.locator('#tStat')).toHaveText(/^0\.\d{2} s$/);

  const replayLiveSentinel = Number(await scrubber.getAttribute('max'));
  await seek(replayLiveSentinel);
  await expect(scrubValue).toHaveText('live');
  await expect
    .poll(async () => {
      const [value, max] = await Promise.all([scrubber.inputValue(), scrubber.getAttribute('max')]);
      return value === max;
    })
    .toBe(true);
  const resumedSentinel = Number(await scrubber.getAttribute('max'));
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernLab?: { isRunning(): boolean } }).__modernLab?.isRunning())
  );
  await expect(page.locator('#pauseBtn')).toHaveText('⏸ Pause');
  await expect.poll(async () => Number(await scrubber.getAttribute('max'))).toBeGreaterThan(resumedSentinel);
});
