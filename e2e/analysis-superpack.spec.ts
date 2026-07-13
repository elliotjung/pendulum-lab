import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('analysis superpack: Wada convergence, Melnikov, fixed point, shadowing', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await openModernTab(page, 'research', '#researchSuperpackCard');

  // Melnikov: synchronous, instant.
  await page.locator('#rwSpMelnikov').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText('Melnikov Threshold');
  await expect(page.locator('#rwSuperpackResults')).toContainText('Critical amplitude');
  await expect(page.locator('#rwSuperpackResults')).toContainText('Reproducibility hash');

  // Fixed point + NS scan.
  await page.locator('#rwSpFixedPoint').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText(
    /Poincaré Fixed Point — (STABLE|UNSTABLE|SADDLE|CENTER|STABLE-NODE|STABLE-SPIRAL|UNSTABLE-NODE|UNSTABLE-SPIRAL|PERIOD-DOUBLING-CRITICAL|FOLD-CRITICAL|DEGENERATE)/i,
    { timeout: 30_000 }
  );
  await expect(page.locator('#rwSuperpackResults')).toContainText('Neimark–Sacker');

  // Shadowing reliability score.
  await page.locator('#rwSpShadowing').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText(/Shadowing Reliability — score \d+%/, {
    timeout: 60_000
  });

  // Wada resolution convergence — the headline multi-resolution analysis.
  await page.locator('#rwSpWada').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText(
    /Wada Resolution Convergence — (STABLE-WADA-EVIDENCE|STABLE-NON-WADA|UNSTABLE|INSUFFICIENT-DATA)/,
    { timeout: 120_000 }
  );
  await expect(page.locator('#rwSuperpackResults')).toContainText('Wada fraction by resolution');
  await expect(page.locator('#rwSuperpackResults')).toContainText('Adjacent deltas');
  await expect(page.locator('#rwSuperpackResults')).toContainText('grid hashes');
  await expect(page.locator('#rwSuperpackResults')).toContainText('does not prove');

  // Sobol global sensitivity of λ_max: first-order + total indices over (A, γ).
  await page.locator('#rwSpSobol').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText('Sobol Sensitivity of λ_max (A × γ)', {
    timeout: 120_000
  });
  await expect(page.locator('#rwSuperpackResults')).toContainText(/drive amplitude A: S=/);
  await expect(page.locator('#rwSuperpackResults')).toContainText(/damping .: S=/);
  await expect(page.locator('#rwSuperpackResults')).toContainText('first-order');
  await expect(page.locator('#rwSuperpackResults')).toContainText('total');
});
