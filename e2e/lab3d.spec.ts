import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openModernTab } from './shell';

test('3D lab: rope pendulum goes slack with warnings and tension readout', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'lab3d', '#lab3dRopeCard');

  // θ0 = 2.5 rad above horizontal at rest: string cannot hold — slack immediately.
  await page.locator('#r3Theta0').fill('2.5');
  await page.locator('#r3Reset').click();
  await expect(page.locator('#r3Readout')).toContainText('phase=SLACK');
  await expect(page.locator('#r3Readout')).toContainText('tension T/m=0.000');
  await expect(page.locator('#r3Warning')).toContainText('SLACK');

  // Run: the bob falls, gets recaptured, and the hybrid keeps integrating.
  await page.locator('#r3Run').click();
  await expect(page.locator('#r3Readout')).toContainText('captures', { timeout: 15_000 });
  await page.locator('#r3Pause').click();

  // Small-angle start stays taut with healthy tension; rod/wire toggle works.
  await page.locator('#r3Theta0').fill('0.3');
  await page.locator('#r3Reset').click();
  await expect(page.locator('#r3Readout')).toContainText('phase=TAUT');
  await page.locator('#r3Style').selectOption('rod');
  await expect(page.locator('#r3Readout')).toContainText('rod rendering');
});

test('3D lab: double string pendulum exposes tension-gated hybrid dynamics', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'lab3d', '#lab3dDoubleStringCard');

  await page.locator('#ds3Reset').click();
  await expect(page.locator('#ds3Readout')).toContainText('phase=TAUT');
  await expect(page.locator('#ds3Readout')).toContainText('T1=');
  await expect(page.locator('#ds3Readout')).toContainText('T2=');

  await page.locator('#ds3Theta2').fill('2.5');
  await page.locator('#ds3Omega1').fill('0');
  await page.locator('#ds3Omega2').fill('0');
  await page.locator('#ds3Reset').click();
  await expect(page.locator('#ds3Readout')).toContainText('phase=OUTER-SLACK');
  await expect(page.locator('#ds3Warning')).toContainText('slack');
});

test('3D lab: spherical double pendulum runs in 3D and conserves E and Lz', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openModernTab(page, 'lab3d', '#lab3dChainCard');

  await page.locator('#d3Reset').click();
  await expect(page.locator('#d3Readout')).toContainText('E=');
  await page.locator('#d3Run').click();
  await page.waitForTimeout(3000);
  await page.locator('#d3Pause').click();

  const readout = await page.locator('#d3Readout').textContent();
  expect(readout).toContain('E=');
  expect(readout).toContain('Lz=');
  expect(readout).toContain('Conservative');
  // The default initial condition has both azimuths active: φ angles move.
  const phi1 = Number.parseFloat(/φ₁=([0-9.e+-]+)/.exec(readout ?? '')?.[1] ?? '0');
  expect(Math.abs(phi1)).toBeGreaterThan(0.01);
  // Conservative run: drifts stay tiny (RK4 at dt=1ms over ~3s).
  const driftMatches = [...(readout ?? '').matchAll(/drift ([0-9.e+-]+)/gi)].map((match) => Number.parseFloat(match[1]!));
  expect(driftMatches.length).toBeGreaterThanOrEqual(2);
  for (const drift of driftMatches) expect(drift).toBeLessThan(1e-4);

  // The 3D scene inked (sphere wireframe + two bobs + trails).
  const inked = await page.locator('#d3Canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 24 || (data[i + 1] ?? 0) > 28 || (data[i + 2] ?? 0) > 44) lit += 1;
    }
    return lit;
  });
  expect(inked).toBeGreaterThan(500);
});

test('3D lab: spherical pendulum conserves E and Lz, orbit camera rotates, snapshot exports', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openModernTab(page, 'lab3d', '#lab3dSphereCard');

  await page.locator('#s3Reset').click();
  await page.locator('#s3Run').click();
  // Let it integrate a few seconds of real 3D dynamics.
  await page.waitForTimeout(3000);
  await page.locator('#s3Pause').click();

  const readout = await page.locator('#s3Readout').textContent();
  expect(readout).toContain('E/m=');
  expect(readout).toContain('Lz/m=');
  // Conservative run: drifts stay tiny (RK4 at dt=2ms over ~3s).
  const driftMatches = [...(readout ?? '').matchAll(/drift ([0-9.e+-]+)/gi)].map((match) => Number.parseFloat(match[1]!));
  expect(driftMatches.length).toBeGreaterThanOrEqual(2);
  for (const drift of driftMatches) expect(drift).toBeLessThan(1e-4);

  // Orbit the camera by dragging; the scene re-renders without errors.
  const canvas = page.locator('#s3Canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40, { steps: 8 });
  await page.mouse.up();

  // String-mode tension collapse warning for over-the-top regimes.
  await page.locator('#s3Theta0').fill('2.9');
  await page.locator('#s3ThetaDot0').fill('0');
  await page.locator('#s3PhiDot0').fill('0');
  await page.locator('#s3Reset').click();
  await page.locator('#s3Style').selectOption('rope');
  await expect(page.locator('#s3Warning')).toContainText('TENSION COLLAPSE');

  // Export the 3D diagnostic snapshot (PNG + JSON fire back-to-back from one click).
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.locator('#s3Export').click();
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const names = downloads.map((download) => download.suggestedFilename());
  expect(names).toContain('pendulum_3d_snapshot.png');
  expect(names).toContain('pendulum_3d_diagnostics.json');
  const jsonDownload = downloads.find((download) => download.suggestedFilename() === 'pendulum_3d_diagnostics.json')!;
  const diagnostics = JSON.parse(await readFile((await jsonDownload.path())!, 'utf8'));
  expect(diagnostics.schemaVersion).toBe('pendulum-3d-diagnostics/v1');
  expect(diagnostics.system).toBe('spherical-pendulum');
  expect(diagnostics.diagnostics.method).toBe('rk4');
  expect(diagnostics.reproducibilityHash).toMatch(/^[0-9a-f]+$/);
});
