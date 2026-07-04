import { expect, test } from '@playwright/test';

async function visibleInteractiveCount(page: import('@playwright/test').Page, rootSelector: string): Promise<number> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return 0;
    const visible = (element: Element): boolean => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    return Array.from(root.querySelectorAll('button,input,select,textarea,canvas'))
      .filter(visible)
      .length;
  }, rootSelector);
}

test('first visit offers a mode chooser with visual choices', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/ui/audience-mode');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await expect(page.locator('[data-audience-choice]')).toHaveCount(3);
  await expect(page.locator('[data-audience-choice="beginner"] svg')).toBeVisible();

  await page.locator('[data-audience-choice="student"]').click();
  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  await expect(page.locator('#audienceMode')).toHaveValue('student');
});

test('real (non-automated) sessions re-open the chooser on every launch', async ({ page }) => {
  // The chooser suppresses its every-launch auto-show under automation so the
  // rest of the suite starts on the workspace; masking navigator.webdriver
  // exercises the path a real returning visitor takes.
  await page.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => false });
    window.localStorage.setItem('pendulum-lab/ui/audience-mode', 'student');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await expect(page.locator('[data-audience-choice]')).toHaveCount(3);
  await expect(page.locator('.audience-choice-current')).toHaveAttribute('data-audience-choice', 'student');

  // Dismissing keeps the stored mode active.
  await page.locator('.audience-chooser-close').click();
  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');

  // The chooser comes back on the next launch and can switch modes.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#audienceModeChooser')).toBeVisible();
  await page.locator('[data-audience-choice="research"]').click();
  await expect(page.locator('#audienceModeChooser')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'research');
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
});

test('beginner mode turns the lab into a focused simulator', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('#audienceMode').selectOption('beginner');

  await expect(page.locator('.rail-section[data-rail-section="analysis"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="chaos"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="govern"]')).toBeHidden();
  await expect(page.locator('#stableIntuitivePanel')).toBeHidden();
  await expect(page.locator('#v10StatusCard')).toBeHidden();
  await expect(page.locator('#tab-lab .plots-row').first()).toBeHidden();
  await expect(page.locator('#tab-lab details[data-audience-min="student"]').first()).toBeHidden();

  const count = await visibleInteractiveCount(page, '#tab-lab');
  expect(count).toBeLessThanOrEqual(28);
});

test('student mode keeps analysis and validation without research governance', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('#audienceMode').selectOption('student');

  await expect(page.locator('.rail-section[data-rail-section="analysis"]')).toBeVisible();
  await expect(page.locator('.rail-section[data-rail-section="check"]')).toBeVisible();
  await expect(page.locator('.rail-section[data-rail-section="chaos"]')).toBeHidden();
  await expect(page.locator('.rail-section[data-rail-section="govern"]')).toBeHidden();
  await expect(page.locator('#rgv7ControlCard')).toBeHidden();
  await expect(page.locator('#rgv8GovCard')).toBeHidden();
  await expect(page.locator('#tab-lab details[data-audience-min="research"]').first()).toBeHidden();
});
