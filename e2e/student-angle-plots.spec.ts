import { expect, test } from '@playwright/test';

async function openWorkspacePreferences(page: import('@playwright/test').Page): Promise<void> {
  const fields = page.locator('#audiencePreferenceFields');
  if (await fields.isHidden()) await page.locator('#audiencePreferencesToggle').click();
  await expect(fields).toBeVisible();
}

test('student Lab renders dedicated angle projection and time-history plots with localized alternatives', async ({
  page
}) => {
  await page.goto('/?audience=student&tab=lab&lang=en');
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');

  const row = page.locator('.student-angle-plots');
  const projection = page.locator('#thetaProjection');
  const timeSeries = page.locator('#angleTime');
  await expect(row).toBeVisible();
  await expect(projection).toBeVisible();
  await expect(projection).toHaveAccessibleName('θ₁–θ₂ angle projection (wrapped)');
  await expect(timeSeries).toHaveAccessibleName('Angles over time — θ₁(t), θ₂(t)');

  await expect
    .poll(
      () =>
        projection.evaluate((canvas) => {
          const context = (canvas as HTMLCanvasElement).getContext('2d');
          if (!context) return 0;
          const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, 1).data;
          let checksum = 0;
          for (let index = 0; index < pixels.length; index += 29) checksum += pixels[index] ?? 0;
          return checksum;
        }),
      { timeout: 8_000 }
    )
    .toBeGreaterThan(0);
  await expect(projection).toHaveAttribute('aria-describedby', /thetaProjectionLiveSummary/);
  await expect(page.locator('#thetaProjectionLiveSummary')).toContainText('time samples');

  await openWorkspacePreferences(page);
  await page.locator('#navLocale').selectOption('ko');
  await expect(page.locator('#thetaProjectionCanvasLabel')).toHaveText('θ₁–θ₂ 각도 투영 (래핑)');
  await expect(page.locator('#angleTimeCanvasLabel')).toHaveText('시간에 따른 각도 — θ₁(t), θ₂(t)');
});

test('angle plots stay out of beginner mode and remain available in research mode', async ({ page }) => {
  await page.goto('/?audience=beginner&tab=lab');
  await expect(page.locator('.student-angle-plots')).toBeHidden();

  await openWorkspacePreferences(page);
  await page.locator('#audienceMode').selectOption('research');
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'research');
  await expect(page.locator('.student-angle-plots')).toBeVisible();
});
