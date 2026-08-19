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
  const labBtn = page.locator('.rail-menu-button[data-rail-section-button="lab"]').first();
  if (await labBtn.isVisible()) await labBtn.click();
  // The parity layer installs this floating overlay asynchronously. Wait for
  // its completed audit result so it cannot appear midway through capture.
  const integrityBadge = page.locator('#figBadge');
  // Compact layouts intentionally hide the floating badge, but the completed
  // text still provides a renderer-independent readiness signal.
  await integrityBadge.waitFor({ state: 'attached' });
  await expect(integrityBadge).toContainText('DOM/API checks 22/22');
  // Keep fixed global surfaces out of this component crop. Otherwise they
  // move through a tall mobile element screenshot as Playwright scrolls it.
  await page.locator('.rail, #figBadge, #stats').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
  });
  const controls = page.getByRole('region', { name: 'controls' });
  await pinLabControlAccordions(page, controls);
  await expect(controls).toHaveScreenshot('lab-controls.png', {
    // Runtime diagnostics update every frame. Their stable container remains
    // in layout but was hidden above, avoiding locator-mask scroll side
    // effects while keeping the accordion frame and labels in scope.
    // The mobile panel is a ~4000-CSS-px element captured at dpr 2.75; at
    // device scale its fractional top rounds differently run-to-run and the
    // whole capture ghosts by one device pixel. CSS-pixel scale removes the
    // rounding entirely (and shrinks the baseline bytes).
    scale: 'css',
    // The tall mobile element screenshot can differ at a subpixel scrollbar
    // edge while Playwright scrolls it into view. Keep that tolerance below
    // 0.25% of the captured panel and stricter on desktop.
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
