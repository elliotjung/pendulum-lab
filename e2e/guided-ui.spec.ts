import { expect, test } from '@playwright/test';

/**
 * The guided-UI layer: command-palette launcher, keyboard-opened rail
 * sections, the Korean guide locale, and the first-run onboarding tour.
 */

test('rail palette launcher opens the command palette', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const launcher = page.locator('.rail-palette-launcher');
  const width = page.viewportSize()?.width ?? 1280;
  if (width <= 560) {
    // The bottom-bar rail has no room for the launcher; the palette stays
    // reachable via Ctrl+K and the Export menu.
    await expect(launcher).toBeHidden();
    return;
  }
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAttribute('title', /Ctrl\+K/);
  await launcher.click();
  await expect(page.locator('#rgv8Cmd')).toHaveClass(/show/);
  await expect(page.locator('#rgv7Palette')).not.toHaveClass(/show/);
  await page.keyboard.press('Escape');
});

test('command palette uses one modal and closes from search actions', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="govern"]')).toBeVisible();

  await page.keyboard.press('Control+K');
  await expect(page.locator('#rgv8Cmd')).toHaveClass(/show/);
  await expect(page.locator('#rgv7Palette')).not.toHaveClass(/show/);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.locator('#rgv8CmdInput').fill('research');
  await expect(page.locator('#rgv8CmdList [data-command-id]')).not.toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#rgv8Cmd')).not.toHaveClass(/show/);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.keyboard.press('Control+K');
  await expect(page.locator('#rgv8Cmd')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#rgv8Cmd')).not.toHaveClass(/show/);

  await page.keyboard.press('Control+K');
  await expect(page.locator('#rgv8Cmd')).toHaveClass(/show/);
  await page.mouse.click(16, 16);
  await expect(page.locator('#rgv8Cmd')).not.toHaveClass(/show/);
});

test('rail search and mode controls do not overlap', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        display: cs.display
      };
    };
    const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
      Boolean(
        a &&
        b &&
        a.display !== 'none' &&
        b.display !== 'none' &&
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      );
    const rail = box('.rail');
    const search = box('.rail-palette-launcher');
    const mode = box('#audienceMode');
    const guide = box('#navLocale');
    const audience = box('.audience-select');
    return {
      rail,
      search,
      mode,
      guide,
      audience,
      searchAudienceOverlap: overlap(search, audience),
      modeGuideOverlap: overlap(mode, guide),
      searchInsideRail: Boolean(rail && search && search.left >= rail.left && search.right <= rail.right),
      audienceInsideRail: Boolean(rail && audience && audience.left >= rail.left && audience.right <= rail.right)
    };
  });

  expect(layout.searchAudienceOverlap).toBe(false);
  expect(layout.modeGuideOverlap).toBe(false);
  expect(layout.searchInsideRail).toBe(true);
  expect(layout.audienceInsideRail).toBe(true);
});

test('focusing a rail section button opens its submenu for keyboard users', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="analysis"]').focus();
  await expect(page.locator('.rail-section.open[data-rail-section="analysis"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.rail-section.open')).toHaveCount(0);
});

test('the guide locale switch rewrites descriptions, hints, and tooltips in Korean', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const labDesc = page.locator('#rail-panel-sim .tab[data-tab="lab"] .tab-desc');
  await expect(labDesc).toContainText('Run the live simulation');

  await page.locator('#navLocale').selectOption('ko');
  await expect(labDesc).toContainText('실시간 시뮬레이션');
  await expect(page.locator('#rail-panel-sim .rail-submenu-hint')).toContainText('진자를 돌리고');
  await expect(page.locator('#rail-panel-sim .tab[data-tab="lab"]')).toHaveAttribute(
    'title',
    /Simulation Lab — 실시간/
  );

  // Persists across reloads, and English restores cleanly.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(labDesc).toContainText('실시간 시뮬레이션');
  await page.locator('#navLocale').selectOption('en');
  await expect(labDesc).toContainText('Run the live simulation');
});

test('first real visit walks through the onboarding tour once', async ({ page, browserName }) => {
  // Chromium engines only. The walkthrough is proven to work on WebKit in a
  // plain headless run, but under the Playwright runner on software-rendered
  // WebKit/Firefox the element-stability heuristic fights the app's continuous
  // simulation rAF and flakes on the final click — the same software-rendering
  // limitation that scopes visual-regression.spec.ts to chromium. The tour's
  // data/logic is unit-tested cross-cutting in tests/onboarding-tour.test.ts.
  test.skip(
    browserName === 'webkit' || browserName === 'firefox',
    'tour walkthrough is chromium-only (software-render rAF stability)'
  );
  // The tour (like the every-launch chooser) only greets real sessions, so
  // mask navigator.webdriver and clear the tour flag. Init scripts rerun on
  // every navigation, so the flag reset is guarded by a window.name sentinel —
  // otherwise the reload below would wipe the just-finished tour's done flag.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => false });
    } catch {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    }
    if (!window.name.includes('tour-cleared')) {
      window.name += ' tour-cleared';
      window.localStorage.removeItem('pendulum-lab/ui/tour-done');
    }
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
  });
  // Masking webdriver re-enables the hud-fx ambience (particles, cursor glow);
  // on WebKit/Firefox software rendering those continuous animations starve the
  // compositor and destabilize clicks. Reduced-motion keeps the tour and
  // chooser visible while disabling ambience AND the card's position
  // transition, so the walkthrough is stable on every engine.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  // Real sessions get the chooser first; dismissing it hands over to the tour.
  await page.locator('.audience-chooser-close').click();
  const card = page.locator('#onboardingTour .tour-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('The live pendulum');

  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('One-click starts');
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Everything lives here');
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Mission: find A_PD');
  await expect(card).toContainText('1.0663');
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Grow at your pace');
  await card.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.locator('#onboardingTour')).toHaveCount(0);

  // Done flag persists: the next launch shows the chooser but no tour.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.locator('.audience-chooser-close').click();
  await page.waitForTimeout(1400);
  await expect(page.locator('#onboardingTour')).toHaveCount(0);
});
