import { expect, test } from '@playwright/test';

test('repeated routing stays resource- and event-loop-bounded without Chromium heap APIs', async ({ page }) => {
  // This deliberately measures a full lazy-mount cycle on emulated mobile
  // engines. Vite's first development transform can exceed the generic E2E
  // budget, so reserve time for the measured work without weakening any
  // resource or timer assertion below.
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
    localStorage.setItem('pendulum-lab/ui/tour-done', '1');
  });
  // Background Service Worker activity and a deferred module graph can delay
  // document lifecycle events on a first mobile visit. The contract below
  // waits for the actual shell readiness marker, which is the meaningful
  // application-ready condition for this routing test.
  await page.goto('/?tab=lab', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell),
    undefined,
    { timeout: 45_000 }
  );

  const pressure = await page.evaluate(async () => {
    const shell = (window as unknown as { __modernShell: { switchTo(tab: string): void } }).__modernShell;
    let maxTimerDriftMs = 0;
    let previousTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      maxTimerDriftMs = Math.max(maxTimerDriftMs, now - previousTick - 50);
      previousTick = now;
    }, 50);
    const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, 120));
    const cycle = async (): Promise<void> => {
      for (const tab of ['compare', 'lab', 'validate', 'lab']) {
        shell.switchTo(tab);
        await settle();
      }
    };

    await cycle();
    // Compare and Validation are lazy controllers. A fixed short delay is
    // enough on a fast desktop, but can put the first measurement *before*
    // their DOM installation on a mobile/browser engine. Establish the
    // post-mount baseline only after both controllers have completed their
    // synchronous install transaction, then test the next routing cycle for
    // genuine accumulation.
    await new Promise<void>((resolve) => {
      const ready = (): boolean => {
        const tabs = (window as unknown as { __modernTabs?: { compare?: unknown; validation?: unknown } }).__modernTabs;
        // A persisted research audience also starts the independently lazy
        // parity/research layer. Its public runtime marker is published only
        // after all of that layer's panel installation completes, so include
        // it in the warm-up barrier rather than mistake first-mount DOM for
        // a repeated-route leak on slower mobile engines.
        const research = (window as unknown as { PendulumResearchWorkspace?: unknown }).PendulumResearchWorkspace;
        // Check representative panel, command, and status nodes as well as
        // the public API. They are installed synchronously before the API is
        // published, making the reference count unambiguously post-mount.
        const parityDomInstalled = ['researchWorkbench', 'rgv8Cmd', 'figBadge'].every((id) =>
          Boolean(document.getElementById(id))
        );
        return Boolean(tabs?.compare && tabs?.validation && research && parityDomInstalled);
      };
      if (ready()) {
        resolve();
        return;
      }
      const timer = window.setInterval(() => {
        if (!ready()) return;
        window.clearInterval(timer);
        resolve();
      }, 16);
    });
    // Let DOM insertion and its browser-side style/layout work commit before
    // collecting the reference count. This is intentionally frame based—not
    // another arbitrary wall-clock delay—so every engine uses the same state.
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    );
    const baseline = {
      nodes: document.querySelectorAll('*').length,
      canvases: document.querySelectorAll('canvas').length,
      resources: performance.getEntriesByType('resource').length
    };
    await cycle();
    await settle();
    window.clearInterval(timer);
    const after = {
      nodes: document.querySelectorAll('*').length,
      canvases: document.querySelectorAll('canvas').length,
      resources: performance.getEntriesByType('resource').length
    };
    return { baseline, after, maxTimerDriftMs };
  });

  expect(pressure.after.nodes - pressure.baseline.nodes).toBeLessThanOrEqual(40);
  expect(pressure.after.canvases).toBeLessThanOrEqual(pressure.baseline.canvases + 1);
  expect(pressure.after.resources - pressure.baseline.resources).toBeLessThanOrEqual(2);
  expect(pressure.maxTimerDriftMs).toBeLessThan(750);
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
});
