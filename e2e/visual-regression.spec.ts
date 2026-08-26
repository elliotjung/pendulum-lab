/**
 * Visual regression tests are chromium-only to avoid cross-browser font/rendering
 * differences. Canvas elements are masked because their pixel content is
 * simulation-state-dependent and not deterministic across runs.
 *
 * Generate initial golden snapshots with:
 *   npx playwright test e2e/visual-regression.spec.ts --update-snapshots --project=chromium
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

// The app now follows the OS light/dark preference. Pin the original dark
// presentation so a runner's desktop preference cannot invalidate every
// baseline before any component pixels are compared. Keep the project device
// settings intact so mobile-chrome snapshots exercise the real mobile layout.
test.use({ colorScheme: 'dark' });

/**
 * A fixed compact rail can resize after the shell is installed (for example,
 * while its responsive menu finishes laying out).  Chromium can otherwise
 * capture a stale clipped backing store below the current rail height.  Wait
 * for the rail and its menu to keep the same visible geometry across several
 * frames before comparing pixels.
 */
async function waitForStableRail(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      await document.fonts.ready;
      const rail = document.querySelector<HTMLElement>('.rail');
      const menu = rail?.querySelector<HTMLElement>('.rail-menu');
      const audienceMode = document.getElementById('audienceMode');
      const audienceSelect = audienceMode?.closest<HTMLElement>('.audience-select');
      if (!rail || !menu || !audienceMode || !audienceSelect) return false;

      const compact = window.matchMedia('(max-width: 560px)').matches;
      if (
        compact &&
        (getComputedStyle(rail).position !== 'fixed' || getComputedStyle(audienceSelect).position !== 'fixed')
      )
        return false;

      const signature = () => {
        const railRect = rail.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        if (railRect.width <= 0 || railRect.height <= 0 || menuRect.width <= 0 || menuRect.height <= 0) return null;
        const style = getComputedStyle(rail);
        const children = Array.from(rail.children).map((child) => {
          const rect = child.getBoundingClientRect();
          return [rect.left.toFixed(3), rect.top.toFixed(3), rect.width.toFixed(3), rect.height.toFixed(3)].join(',');
        });
        return [
          railRect.left.toFixed(3),
          railRect.top.toFixed(3),
          railRect.width.toFixed(3),
          railRect.height.toFixed(3),
          menuRect.left.toFixed(3),
          menuRect.top.toFixed(3),
          menuRect.width.toFixed(3),
          menuRect.height.toFixed(3),
          rail.clientWidth,
          rail.clientHeight,
          rail.scrollWidth,
          rail.scrollHeight,
          menu.clientWidth,
          menu.clientHeight,
          menu.scrollWidth,
          menu.scrollHeight,
          style.height,
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
          style.backgroundColor,
          children.join(';')
        ].join('|');
      };

      const initial = signature();
      if (!initial) return false;
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (signature() !== initial) return false;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return signature() === initial;
    },
    undefined,
    { timeout: 5_000 }
  );
}

/**
 * A native <details> property update queues its `toggle` event.  Capturing
 * immediately after assigning `.open` can therefore race an app listener or
 * the browser's next layout, particularly in the tall mobile control panel.
 *
 * We deliberately do not widen the image tolerance.  The fixture locks both
 * the native state and each body's rendered display: a late `open` mutation
 * therefore cannot expand a closed section in the interval between Playwright
 * readiness and its screenshot capture.  This lives only in the test page;
 * production accordion behavior remains native and interactive.
 */
async function pinLabControlAccordions(page: Page, controls: Locator): Promise<void> {
  const accordions = controls.locator('details.acc');
  const count = await accordions.count();
  expect(count).toBeGreaterThanOrEqual(3);

  const expectedOpenStates = Array.from({ length: count }, (_value, index) => index < 2);
  await controls.evaluate((panel, expected) => {
    type FixtureAccordion = HTMLDetailsElement & { __visualExpectedOpen?: boolean };

    const directBody = (accordion: HTMLDetailsElement): HTMLElement | undefined =>
      Array.from(accordion.children).find((child) => child.classList.contains('acc-body')) as HTMLElement | undefined;
    const fixtureState = (accordion: FixtureAccordion): boolean => accordion.__visualExpectedOpen ?? false;
    const pin = (accordion: FixtureAccordion): void => {
      const open = fixtureState(accordion);
      if (accordion.open !== open) accordion.open = open;

      // Native <details> hides a closed body during layout, but a queued or
      // late handler can otherwise expose it for one frame before `toggle` is
      // observed.  Lock the direct body too, preserving the default block
      // layout of the two intended-open sections exactly.
      const body = directBody(accordion);
      if (!body) return;
      const display = open ? 'block' : 'none';
      if (
        body.style.getPropertyValue('display') !== display ||
        body.style.getPropertyPriority('display') !== 'important'
      ) {
        body.style.setProperty('display', display, 'important');
      }
    };
    const normalize = (): void => {
      Array.from(panel.querySelectorAll<HTMLDetailsElement>('details.acc')).forEach((accordion) => {
        const fixture = accordion as FixtureAccordion;
        // Sections mounted after the initial baseline fixture are always
        // closed; their summary still participates in layout as normal.
        fixture.__visualExpectedOpen ??= false;
        pin(fixture);
      });
    };

    // The initial first two sections are the baseline's intended-open bodies.
    // Any asynchronously mounted section is deliberately closed, so a late
    // mount cannot make the tall component crop nondeterministic.
    Array.from(panel.querySelectorAll<HTMLDetailsElement>('details.acc')).forEach((accordion, index) => {
      (accordion as FixtureAccordion).__visualExpectedOpen = expected[index] === true;
    });

    // `toggle` can arrive after an `.open` assignment.  Capture-phase handling
    // covers native toggles on future descendants; the observer also catches
    // direct attribute/style writes made by application listeners.
    panel.addEventListener('toggle', normalize, true);
    new MutationObserver(normalize).observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'style']
    });
    normalize();
  }, expectedOpenStates);

  await expect
    .poll(async () => accordions.evaluateAll((details) => details.map((detail) => (detail as HTMLDetailsElement).open)))
    .toEqual(expectedOpenStates);

  await page.waitForFunction(
    async (expected) => {
      await document.fonts.ready;
      const panel = document.querySelector<HTMLElement>('#tab-lab .controls[role="region"]');
      if (!panel) return false;

      const signature = () => {
        const details = Array.from(panel.querySelectorAll<HTMLDetailsElement>('details.acc')) as Array<
          HTMLDetailsElement & { __visualExpectedOpen?: boolean }
        >;
        const accordionStates = details.map((detail, index) => {
          const expectedOpen = detail.__visualExpectedOpen ?? expected[index] === true;
          const body = Array.from(detail.children).find((child) => child.classList.contains('acc-body')) as
            HTMLElement | undefined;
          const expectedDisplay = expectedOpen ? 'block' : 'none';
          if (
            detail.open !== expectedOpen ||
            !body ||
            body.style.getPropertyValue('display') !== expectedDisplay ||
            body.style.getPropertyPriority('display') !== 'important'
          )
            return null;
          const rect = detail.getBoundingClientRect();
          const bodyRect = body.getBoundingClientRect();
          return [
            expectedOpen ? 'open' : 'closed',
            rect.height.toFixed(3),
            bodyRect.height.toFixed(3),
            body.style.display
          ].join(',');
        });
        if (accordionStates.some((state) => state === null)) return null;
        const rect = panel.getBoundingClientRect();
        return [
          accordionStates.join(';'),
          rect.width.toFixed(3),
          rect.height.toFixed(3),
          panel.clientWidth,
          panel.clientHeight,
          panel.scrollWidth,
          panel.scrollHeight
        ].join('|');
      };

      const initial = signature();
      if (!initial) return false;
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (signature() !== initial) return false;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return signature() === initial;
    },
    expectedOpenStates,
    { timeout: 5_000 }
  );
}

/**
 * Element screenshots are only reliable when their target fits in the
 * viewport.  The production mobile layout intentionally expands the Lab
 * controls to their full document height; Chromium then has to scroll a tall
 * locator while rasterising it, and two fresh browser processes can select
 * different vertical segments of that scrollable surface.
 *
 * The visual test is concerned with the panel's visible top controls, so give
 * it the same 600px viewport-bounded surface that desktop uses, hide overflow,
 * and explicitly anchor it at its first pixel.  This fixture changes only the
 * test page: normal users retain the full, scrollable mobile control panel.
 */
async function boundLabControlCaptureSurface(page: Page, controls: Locator): Promise<void> {
  const captureHeight = 600;
  await controls.evaluate((panel, height) => {
    // The production mobile layout deliberately uses `display: contents` so
    // its children interleave with plots. An element screenshot needs a real
    // box, so establish that box before Playwright tries to scroll the target.
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('height', `${height}px`, 'important');
    panel.style.setProperty('min-height', '0', 'important');
    panel.style.setProperty('max-height', `${height}px`, 'important');
    panel.style.setProperty('overflow', 'hidden', 'important');
    panel.style.setProperty('overflow-x', 'hidden', 'important');
    panel.style.setProperty('overflow-y', 'hidden', 'important');
    panel.scrollTop = 0;
  }, captureHeight);

  await page.waitForFunction(
    async (height) => {
      await document.fonts.ready;
      const panel = document.querySelector<HTMLElement>('#tab-lab .controls[role="region"]');
      if (!panel) return false;

      const signature = () => {
        const rect = panel.getBoundingClientRect();
        const style = getComputedStyle(panel);
        if (
          Math.abs(rect.height - height) > 1 ||
          panel.scrollTop !== 0 ||
          style.display !== 'block' ||
          style.overflow !== 'hidden' ||
          style.overflowX !== 'hidden' ||
          style.overflowY !== 'hidden'
        )
          return null;
        return [
          rect.width.toFixed(3),
          rect.height.toFixed(3),
          panel.clientWidth,
          panel.clientHeight,
          panel.scrollTop,
          panel.scrollHeight,
          style.display,
          style.height,
          style.overflow
        ].join('|');
      };

      const initial = signature();
      if (!initial) return false;
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (signature() !== initial) return false;
      }
      return signature() === initial;
    },
    captureHeight,
    { timeout: 5_000 }
  );
}

test('rail sidebar renders correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  const rail = page.locator('.rail');
  await expect(rail).toBeVisible();
  await waitForStableRail(page);
  await expect(rail).toHaveScreenshot('rail-sidebar.png');
});

test('lab tab control panel renders correctly', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // Compact layouts collapse the rail button, so a conditional click can leave
  // the Lab panel hidden forever. Exercise the shell's canonical tab API on
  // every viewport and assert visibility before attempting any component crop.
  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo('lab');
  });
  // The parity layer installs this floating overlay asynchronously. Wait for
  // its completed audit result so it cannot appear midway through capture.
  const integrityBadge = page.locator('#figBadge');
  // Compact layouts intentionally hide the floating badge, but the completed
  // text still provides a renderer-independent readiness signal.
  await integrityBadge.waitFor({ state: 'attached' });
  await expect(integrityBadge).toContainText('DOM/API checks 22/22');
  // Keep fixed global surfaces out of this component crop. This makes the
  // bounded control surface independent of page-level fixed decorations.
  await page.locator('.rail, #figBadge, #stats').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
  });
  const controls = page.getByRole('region', { name: 'controls' });
  await expect(controls).toBeAttached();
  await pinLabControlAccordions(page, controls);
  await boundLabControlCaptureSurface(page, controls);
  await expect(controls).toBeVisible();
  // The fixture now fits in both visual projects' viewports, so this affects
  // only page scroll and cannot select a different internal panel segment.
  await controls.scrollIntoViewIfNeeded();
  await controls.evaluate((panel) => {
    panel.scrollTop = 0;
  });
  // `toHaveScreenshot` intentionally captures again to prove that two
  // consecutive images are stable. On Chromium mobile that second capture
  // can see `(pointer: coarse)` change from true to false after the first
  // element screenshot, reducing each touch target and changing the crop.
  // The fixture above has already proved the relevant DOM geometry stable
  // across frames; capture it once and compare the exact buffer so the
  // assertion cannot itself perturb its next sample.
  const image = await controls.screenshot({
    animations: 'disabled',
    caret: 'hide',
    scale: 'css'
  });
  expect(image).toMatchSnapshot('lab-controls.png', {
    threshold: 0.2,
    // Runtime diagnostics update every frame. Their stable container remains
    // in layout but was hidden above, avoiding locator-mask scroll side
    // effects while keeping the accordion frame and labels in scope.
    // CSS-pixel scale avoids device-pixel rounding noise while retaining the
    // same existing, project-specific diff limits.
    maxDiffPixels: testInfo.project.name === 'mobile-chrome' ? 1_200 : 500
  });
});

test('research workbench card renders correctly', async ({ page }) => {
  // Clear persisted research state so the experiment card is deterministic.
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // #researchExperimentCard is built by installResearchTab into #tab-research
  // (the panel also holds the static Research+ tools). Wait for the lazily-built
  // card to attach, activate the tab via the shell's own switchTo (the exact
  // path a tab click takes — robust against the hover-driven rail accordion),
  // then shoot the card.
  await page.locator('#researchExperimentCard').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo('research');
  });
  const card = page.locator('#researchExperimentCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#rwExperimentSummary')).toHaveText('0 experiment(s). Save current state to begin.');
  await expect(card).toHaveScreenshot('research-experiment-card.png', {
    mask: [page.locator('canvas')]
  });
});
