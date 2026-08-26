import { expect, test } from '@playwright/test';

test('Theory deep link runs the bounded Euler-Lagrange/Hamiltonian comparison', async ({ page }) => {
  await page.goto('/?audience=student&tab=theory');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#tab-theory')).toHaveClass(/active/);
  await expect(page.locator('#theoryTitle')).toHaveText('Double-pendulum theory');
  await page.locator('#theoryCompareRun').click();

  await expect(page.locator('#theoryCompareStatus')).toHaveAttribute('data-verdict', 'agreement');
  await expect(page.locator('#theoryCompareAngles')).not.toHaveText('—');
  await expect(page.locator('#theoryComparePolicy')).toContainText('shared-fixed-rk4');
  await expect(page.locator('#theoryCompareElState')).toContainText('θ₁');
  await expect(page.locator('#theoryCompareHState')).toContainText('p₁');
  await expect(page.locator('#theoryCompareStatus')).toContainText('short-horizon');

  await page.locator('#theoryCompareVerdictPolicy').selectOption('reference');
  await page.locator('#theoryCompareRun').click();
  await expect(page.locator('#theoryComparePolicy')).toContainText('reference≤1.0e-7');
  await expect(page.locator('[data-theory-figure="point-mass-geometry"]')).toHaveCount(1);

  await expect(page.locator('[data-theory-model="double"]')).toContainText('Point-mass double');
  await expect(page.locator('[data-theory-model="compound-double"]')).toContainText('Uniform-rod compound double');
  await page.locator('[data-select-system="compound-double"]').click();
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  await expect(page.locator('#sysType')).toHaveValue('compound-double');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __modernLab?: { runtimeSnapshot(): { systemType: string; state: number[] } } }
        ).__modernLab?.runtimeSnapshot()
      )
    )
    .toMatchObject({
      systemType: 'compound-double',
      state: [expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]
    });
});

test('Lab controls link directly to the governing theory and measured-order evidence', async ({ page }) => {
  await page.goto('/?audience=student&tab=lab&lang=en');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#m2TheoryLink')).toHaveAttribute('href', '?tab=theory#theory-mass-matrix-eom');
  await expect(page.locator('#methodGuidance')).toContainText('declared order 4');
  await expect(page.locator('#methodEvidenceLink')).toHaveAttribute('href', '?tab=validate#runConvergence');

  await page.locator('#m2TheoryLink').click();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page).toHaveURL(/tab=theory.*#theory-mass-matrix-eom$/);
  await expect(page.locator('#theory-mass-matrix-eom')).toHaveAttribute('open', '');
});
