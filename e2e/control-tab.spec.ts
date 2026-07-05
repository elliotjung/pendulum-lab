import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * Control tab: the live swing-up/balance showcase of the optimal-control
 * module. Pins that the tab mounts, the animation canvas is present, the
 * hybrid run engages the energy pump, the strategy/actuation controls follow
 * the documented coupling (hybrid forces full actuation), and the LQR-only
 * strategy reports its underactuated mode.
 */

test('control tab mounts with canvas, readouts, and an idle status', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'control', '#ctlCanvas');
  await expect(page.locator('#tab-control')).toHaveClass(/active/);
  await expect(page.locator('#ctlStatus')).toContainText('idle');
  await expect(page.locator('#ctlPhase')).toHaveText('idle');
  // Rail entry is part of the Sim group with the proper label.
  await expect(page.locator('#rail-panel-sim .tab[data-tab="control"] .tab-label')).toHaveText('Control');
});

test('hybrid run engages the energy pump and streams live readouts', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'control', '#ctlCanvas');
  await page.locator('#ctlRun').click();
  await expect(page.locator('#ctlStatus')).toContainText('energy pump');
  await expect(page.locator('#ctlPhase')).toHaveText('pump');
  // Readouts leave their idle placeholders once the run starts.
  await expect(page.locator('#ctlEnergyGap')).not.toHaveText('—');
  await expect(page.locator('#ctlLyapLevel')).toContainText('/');
  // Pause freezes the run without resetting it.
  await page.locator('#ctlPause').click();
  await expect(page.locator('#ctlStatus')).toContainText('paused');
  await page.locator('#ctlReset').click();
  await expect(page.locator('#ctlPhase')).toHaveText('idle');
});

test('strategy coupling: hybrid forces full actuation, LQR exposes acrobot mode', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'control', '#ctlCanvas');
  // Hybrid (default) disables the actuation select at "full".
  await expect(page.locator('#ctlMode')).toBeDisabled();
  await page.locator('#ctlStrategy').selectOption('lqr');
  await expect(page.locator('#ctlMode')).toBeEnabled();
  await page.locator('#ctlMode').selectOption('acrobot');
  await page.locator('#ctlRun').click();
  await expect(page.locator('#ctlStatus')).toContainText('LQR balancing (acrobot)');
  await expect(page.locator('#ctlPhase')).toHaveText('balance');
});
