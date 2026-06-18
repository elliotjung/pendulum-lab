import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * Stage-3: the modern Bifurcation tab. Sweeping g must build the diagram in
 * cancellable chunks and render it to #bifCanvas.
 */
test('modern Bifurcation tab sweeps g and renders the diagram', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'bifurc', '#tab-bifurc');

  // Small/fast sweep for the test.
  await page.evaluate(() => {
    (document.getElementById('bifSteps') as HTMLInputElement).value = '40';
    (document.getElementById('bifT') as HTMLInputElement).value = '20';
  });
  await page.evaluate(() => document.getElementById('bifStart')?.click());
  await page.waitForFunction(() => (document.getElementById('bifStatus')?.textContent ?? '').includes('done'), undefined, { timeout: 30000 });

  // The bifurcation canvas is non-blank.
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('bifCanvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 297) s += d[i]!;
    return s;
  });
  expect(drawn).toBeGreaterThan(0);
});

test('Bifurcation tab: driven-orbit Floquet & symmetry-breaking pitchfork', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'bifurc', '#tab-bifurc');

  // Floquet: trace the branch to the default A and report stability + multipliers.
  await page.evaluate(() => document.getElementById('bifFloquet')?.click());
  await page.waitForFunction(
    () => (document.getElementById('bifDrivenStatus')?.textContent ?? '').includes('stable'),
    undefined,
    { timeout: 30000 }
  );
  const floquetOut = await page.evaluate(() => document.getElementById('bifDrivenOut')?.textContent ?? '');
  expect(floquetOut).toContain('Floquet');
  expect(floquetOut).toContain('orbit');

  // Pitchfork: locate the +1 crossing and follow the two mirror-image branches.
  await page.evaluate(() => document.getElementById('bifPitchfork')?.click());
  await page.waitForFunction(
    () => (document.getElementById('bifDrivenStatus')?.textContent ?? '').includes('branches'),
    undefined,
    { timeout: 30000 }
  );
  const status = await page.evaluate(() => document.getElementById('bifDrivenStatus')?.textContent ?? '');
  const pitchforkOut = await page.evaluate(() => document.getElementById('bifDrivenOut')?.textContent ?? '');
  expect(status).toContain('pitchfork');
  expect(pitchforkOut).toContain('branch A');
  expect(pitchforkOut).toContain('branch B');
  expect(pitchforkOut).toContain('residual');
});

test('Bifurcation tab: Neimark–Sacker invariant circle is continued and drawn', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'bifurc', '#tab-bifurc');

  await page.evaluate(() => document.getElementById('bifTorus')?.click());
  await page.waitForFunction(
    () => (document.getElementById('bifTorusStatus')?.textContent ?? '').includes('circles'),
    undefined,
    { timeout: 30000 }
  );

  // ρ approaches 1/6 at onset and the parameter table is reported.
  const status = await page.evaluate(() => document.getElementById('bifTorusStatus')?.textContent ?? '');
  expect(status).toContain('ρ→0.16');
  const out = await page.evaluate(() => document.getElementById('bifTorusOut')?.textContent ?? '');
  expect(out).toContain('a=2.01');
  expect(out).toContain('ρ=');

  // The invariant-circle canvas is non-blank (the curves were actually drawn).
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('bifTorusCanvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 211) s += d[i]!;
    return s;
  });
  expect(drawn).toBeGreaterThan(0);
});
