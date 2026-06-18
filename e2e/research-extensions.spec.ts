import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * E2E coverage for the v10.33 research extensions wired into the UI:
 * the FTLE LCS ridge overlay, the codim-2 Melnikov threshold overlay, and the
 * spherical-chain full-spectrum / Noether / energy-shell analyses.
 */

test('FTLE tab: LCS ridge overlay reports ridge cells alongside the field', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await page.locator('#rail-panel-chaos .tab[data-tab="ftle"]').click();
  await expect(page.locator('#ftleCanvas')).toBeVisible();

  // Smaller grid keeps the worker job quick; the ridge overlay is on by default.
  await page.locator('#ftleRes').fill('40');
  await expect(page.locator('#ftleRidges')).toBeChecked();
  await page.locator('#ftleStart').click();
  await expect(page.locator('#ftleStatus')).toContainText('LCS ridge cells', { timeout: 60_000 });
  await expect(page.locator('#ftleRidgeInfo')).toContainText('σ_T ≥');
});

test('codim-2 regime map overlays the Melnikov A_c(γ) threshold curve', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await openModernTab(page, 'research', '#researchSuperpackCard');

  await page.locator('#rwSpCodim2').click();
  await expect(page.locator('#rwSuperpackResults')).toContainText('Codim-2 Regime Map (A × γ)', { timeout: 120_000 });
  await expect(page.locator('#rwSuperpackResults')).toContainText('Melnikov threshold');
});

test('3D chain: full Lyapunov spectrum, Noether scan, and energy-shell monitor', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await openModernTab(page, 'lab3d', '#lab3dChainCard');

  // Conserved-quantity scan is pure + fast (no worker): with gravity, energy
  // and the vertical angular momentum are conserved, the horizontal ones not.
  await page.locator('#d3Conserved').click();
  await expect(page.locator('#d3Analysis')).toContainText('Conserved:', { timeout: 30_000 });
  await expect(page.locator('#d3Analysis')).toContainText('angular-momentum-vertical');

  // Energy-shell monitor integrates a fresh trajectory and plots E/L drift.
  await page.locator('#d3ExportT').fill('8');
  await page.locator('#d3Shell').click();
  await expect(page.locator('#d3ShellInfo')).toContainText('relative |ΔE|', { timeout: 60_000 });

  // Full Lyapunov spectrum on the worker (all 4N exponents + KY dimension).
  await page.locator('#d3Spectrum').click();
  await expect(page.locator('#d3Analysis')).toContainText('KY dim=', { timeout: 120_000 });
  await expect(page.locator('#d3Analysis')).toContainText('Σλ=');
});
