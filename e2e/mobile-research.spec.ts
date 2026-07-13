import { expect, test } from '@playwright/test';

/**
 * Mobile-viewport coverage for the Govern > Research workbench: the rail and
 * the workbench must stay reachable and fit a phone-sized screen regardless of
 * which desktop project runs the suite (the viewport is forced here, so this
 * spec is mobile-shaped even on the chromium project).
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('mobile: Check > Research+ is reachable and fits the viewport', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  // The Check rail section opens and exposes the Research+ tab on a phone
  // (data-tab="research" lives in #rail-panel-check, alongside Validate/Floquet).
  const checkButton = page.locator('.rail-menu-button[data-rail-section-button="check"]');
  await expect(checkButton).toBeVisible();
  await checkButton.click();
  const researchTab = page.locator('#rail-panel-check .tab[data-tab="research"]');
  await expect(researchTab).toBeVisible();
  await researchTab.click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();

  // The workbench collapses to a single column: each card fits the screen width.
  const cardBox = await page.locator('#researchExperimentCard').boundingBox();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.width).toBeLessThanOrEqual(390);

  // No horizontal page overflow (the classic mobile regression).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);

  // The workbench is functional, not just visible: generate a study.
  await page.locator('#rwStudyCount').fill('3');
  await page.locator('#rwGenerateStudy').click();
  await expect(page.locator('#rwStudySummary')).toContainText('3 points');
});
