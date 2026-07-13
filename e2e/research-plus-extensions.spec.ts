import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test.use({ viewport: { width: 390, height: 844 } });

test('Research+ exposes sensor capture and deterministic physics surfaces on a narrow viewport', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'research', '#tab-research');

  await expect(page.getByTestId('research-camera-card')).toBeVisible();
  await expect(page.getByLabel('First bob marker colour')).toBeVisible();
  await expect(page.getByTestId('research-camera-preview')).toHaveAttribute('aria-label', /tracking preview/i);
  await expect(page.getByTestId('research-imu-start')).toHaveAccessibleName('Start motion sensor');

  await page.getByTestId('research-magnetic-run').click();
  await expect(page.locator('#rpMagneticStatus')).toContainText('deterministic fingerprint', { timeout: 30_000 });
  await expect(page.getByTestId('research-magnetic-canvas')).toHaveAttribute('data-fingerprint', /^[0-9a-f]{8}$/);
  await expect(page.getByTestId('research-magnetic-csv')).toBeEnabled();

  await page.getByTestId('research-qkr-run').click();
  await expect(page.locator('#rpQkrStatus')).toContainText('16 quasi-energies');
  await expect(page.getByTestId('research-qkr-canvas')).toHaveAttribute('data-band-count', '16');

  await page.getByTestId('research-sync-run').click();
  await expect(page.locator('#rpSyncStatus')).toContainText('Kc=1.000');
  await expect(page.locator('#rpSyncStatus')).toContainText('finite-size diagnostic');
  await expect(page.getByTestId('research-sync-canvas')).toHaveAttribute('data-final-order', /^0\.\d{6}$/);
});
