import { expect, test } from '@playwright/test';
import { openWorkspacePreferences } from './shell';

async function visibleInteractiveCount(page: import('@playwright/test').Page, rootSelector: string): Promise<number> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return 0;
    const visible = (element: Element): boolean => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    return Array.from(root.querySelectorAll('button,input,select,textarea,canvas')).filter(visible).length;
  }, rootSelector);
}

test('first visit offers a mode chooser with visual choices', async ({ page }) => {
  // On a cold Firefox dev-server transform the application can take longer
  // than the generic E2E budget before its real shell is ready. This test
  // verifies that shell explicitly below, so reserve time for that startup
  // rather than treating an unrelated document load event as a chooser
  // failure.
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/ui/audience-mode');
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell),
    undefined,
    { timeout: 45_000 }
  );

  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await expect(page.locator('[data-audience-choice]')).toHaveCount(3);
  await expect(page.locator('[data-audience-choice="beginner"] svg')).toBeVisible();

  await page.locator('[data-audience-choice="student"]').click();
  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  await openWorkspacePreferences(page);
  await expect(page.locator('#audienceMode')).toHaveValue('student');
});

test('invalid URL and stored modes are quarantined as an unselected first visit', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'corrupt-mode');
  });
  await page.goto('/?audience=garbage');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'research');
  expect(await page.evaluate(() => window.localStorage.getItem('pendulum-lab/ui/audience-mode'))).toBeNull();
});

test('the active mode survives when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key === 'pendulum-lab/ui/audience-mode') throw new DOMException('blocked', 'SecurityError');
      original.call(this, key, value);
    };
  });
  await page.goto('/?audience=beginner');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await openWorkspacePreferences(page);
  await page.locator('#audienceMode').selectOption('student');
  await page.locator('#navLocale').selectOption('ko');
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  await expect(page.locator('#audienceMode')).toHaveValue('student');
});

test('returning sessions open the saved mode and can reopen the chooser from Home', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => false });
    } catch {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    }
    if (!window.sessionStorage.getItem('audience-mode-test-seeded')) {
      window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'student');
      // This test is about the chooser only; mark the onboarding tour done so it
      // never races in after the chooser closes (masking webdriver also arms it).
      window.localStorage.setItem('pendulum-lab/ui/tour-done', '1');
      window.sessionStorage.setItem('audience-mode-test-seeded', '1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#audienceModeChooser')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');

  await page.locator('#railHome').click();
  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await expect(page.locator('[data-audience-choice]')).toHaveCount(3);
  await expect(page.locator('.audience-choice-current')).toHaveAttribute('data-audience-choice', 'student');

  await page.locator('[data-audience-choice="research"]').click();
  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'research');

  // The saved choice persists without another modal interruption.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#audienceModeChooser')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'research');
});

test('pendulum Home chooser Explore mode enters the real Lab and canonicalizes its URL', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
    window.localStorage.setItem('pendulum-lab/ui/tour-done', '1');
  });
  await page.goto('/?ref=landing&lang=en&tab=compare#motion');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#tab-compare')).toHaveClass(/active/);

  await page.locator('#railHome').click();
  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await page.locator('[data-audience-choice="beginner"]').click();

  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'beginner');
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page.locator('#workspace-tab-lab')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\?ref=landing&lang=en&tab=lab#motion$/);
  await expect(page.locator('#tab-lab canvas').first()).toBeVisible();
});

test('tab routes follow rail navigation and browser back/forward', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'research');
    window.localStorage.setItem('pendulum-lab/ui/tour-done', '1');
  });
  await page.goto('/?ref=landing&tab=lab#motion');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await page.locator('#rail-panel-sim .tab[data-tab="compare"]').click();
  await expect(page.locator('#tab-compare')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?ref=landing&tab=compare#motion$/);

  await page.evaluate(() => window.history.back());
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?ref=landing&tab=lab#motion$/);

  await page.evaluate(() => window.history.forward());
  await expect(page.locator('#tab-compare')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?ref=landing&tab=compare#motion$/);
});

test('lazy workspace replacement does not manufacture a history entry', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'student');
    window.localStorage.setItem('pendulum-lab/ui/tour-done', '1');
  });
  await page.goto('/?audience=student&ref=landing&tab=lab#motion');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  const historyLength = await page.evaluate(() => window.history.length);

  await page.evaluate(() => {
    (
      window as unknown as {
        __modernShell?: { switchTo(tab: string, mode: 'replace'): void };
      }
    ).__modernShell?.switchTo('expansion', 'replace');
  });

  await expect(page.locator('#tab-expansion')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?audience=student&ref=landing&tab=expansion#motion$/);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
});

test('lazy workspace push commits only after mount and supports back/forward', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'student');
    window.localStorage.setItem('pendulum-lab/ui/tour-done', '1');
  });
  await page.goto('/?audience=student&ref=landing&tab=lab#motion');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  const historyLength = await page.evaluate(() => window.history.length);

  await page.locator('.rail-menu-button[data-rail-section-button="analysis"]').click();
  await page.locator('.tab[data-tab="expansion"]').click();
  await expect(page.locator('#tab-expansion')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?audience=student&ref=landing&tab=expansion#motion$/);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength + 1);

  await page.goBack();
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?audience=student&ref=landing&tab=lab#motion$/);

  await page.goForward();
  await expect(page.locator('#tab-expansion')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\?audience=student&ref=landing&tab=expansion#motion$/);
});

test('rail uses task-centered labels and icons', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('.rail-section[data-rail-section="sim"] .rail-menu-label')).toHaveText('Explore');
  await expect(page.locator('.rail-section[data-rail-section="analysis"] .rail-menu-label')).toHaveText('Analyze');
  await expect(page.locator('.rail-section[data-rail-section="check"] .rail-menu-label')).toHaveText('Validate');
  await expect(page.locator('.rail-section[data-rail-section="govern"] .rail-menu-label')).toHaveText('Export');
  await expect(page.locator('.rail-menu-button .rail-icon-svg').first()).toBeVisible();
  await expect(page.locator('#rail-panel-sim .rail-submenu-hint')).toContainText('Run the pendulum');

  // Every menu entry carries a plain-language description line and an
  // enriched "Full name — what it does" tooltip (see src/app/navGuide.ts).
  await expect(page.locator('#rail-panel-sim .tab[data-tab="lab"] .tab-desc')).toContainText('Run the live simulation');
  await expect(page.locator('#rail-panel-check .tab[data-tab="research"] .tab-desc')).toContainText('Fit parameters');
  await expect(page.locator('#rail-panel-sim .tab[data-tab="lab"]')).toHaveAttribute(
    'title',
    /Simulation Lab — Run the live simulation/
  );
});

test('beginner mode turns the lab into a focused simulator', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await openWorkspacePreferences(page);
  await page.locator('#audienceMode').selectOption('beginner');

  await expect(page.locator('.rail-section[data-rail-section="analysis"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="chaos"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="govern"]')).toBeHidden();
  await expect(page.locator('#stableIntuitivePanel')).toBeHidden();
  await expect(page.locator('#v10StatusCard')).toBeHidden();
  await expect(page.locator('#tab-lab .plots-row').first()).toBeHidden();
  await expect(page.locator('#tab-lab details[data-audience-min="student"]').first()).toBeHidden();
  await expect(page.locator('[data-workflow-tab="bifurc"]')).toBeHidden();
  await expect(page.locator('[data-workflow-tab="research"]')).toBeHidden();

  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { switchTo(tab: string): void } }).__modernShell?.switchTo('research');
  });
  await page.keyboard.press('0');
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page.locator('#tab-research')).not.toHaveClass(/active/);

  const count = await visibleInteractiveCount(page, '#tab-lab');
  expect(count).toBeLessThanOrEqual(28);
});

test('student mode keeps analysis and validation without research governance', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await openWorkspacePreferences(page);
  await page.locator('#audienceMode').selectOption('student');

  await expect(page.locator('.rail-section[data-rail-section="analysis"]')).toBeVisible();
  await expect(page.locator('.rail-section[data-rail-section="check"]')).toBeVisible();
  await expect(page.locator('.rail-section[data-rail-section="chaos"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="govern"]')).toBeHidden();
  await expect(page.locator('#rgv7ControlCard')).toBeHidden();
  await expect(page.locator('#rgv8GovCard')).toBeHidden();
  await expect(page.locator('#tab-lab details[data-audience-min="research"]').first()).toBeHidden();
});
