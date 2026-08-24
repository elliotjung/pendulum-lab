import { expect, test } from '@playwright/test';

const SHARE_CONTROL_IDS = [
  'sysType',
  'method',
  'dt',
  'gamma',
  'tol',
  'm1',
  'm2',
  'm3',
  'l1',
  'l2',
  'l3',
  'g',
  'th1',
  'th2',
  'th3',
  'iw1',
  'iw2',
  'iw3',
  'seed',
  'timeMode',
  'speed',
  'spf',
  'ensN',
  'ensEps',
  'trailMode',
  'trailLen',
  'phaseAxis',
  'qualityMode',
  'glowMode',
  'longExpose',
  'interpolateRender',
  'autoQual'
] as const;

test('V2 setup link restores in a fresh context through one semantic commit', async ({ browser, page }) => {
  await page.goto('/?audience=research&tab=lab', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.evaluate(() => {
    const value = (id: string, next: string): void => {
      const control = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (control) control.value = next;
    };
    value('sysType', 'triple');
    value('method', 'yoshida4');
    value('dt', '0.0015');
    value('gamma', '0.04');
    value('tol', '-9');
    value('seed', '4242');
    value('timeMode', 'deterministic');
    value('speed', '1.7');
    value('spf', '11');
    value('ensN', '17');
    value('ensEps', '-4.5');
    value('trailMode', 'ice');
    value('trailLen', '1450');
    value('phaseAxis', 'both');
    value('qualityMode', 'cinematic');
    const glow = document.getElementById('glowMode') as HTMLInputElement | null;
    if (glow) glow.checked = true;
  });

  await page.locator('#shareUrl').click();
  await expect.poll(() => new URL(page.url()).hash.startsWith('#experiment=')).toBe(true);
  const shareHref = page.url();
  const encoded = new URL(shareHref).hash.slice('#experiment='.length).replaceAll('-', '+').replaceAll('_', '/');
  const padded = `${encoded}${'='.repeat((4 - (encoded.length % 4)) % 4)}`;
  const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
    v: number;
    scope: { kind: string; includesResults: boolean; omittedUnsafeControls: string[] };
    provenance: {
      packageVersion: string;
      physicsVersion: string;
      sourceCommit: string | null;
      parameterHash: { value: string };
    };
    execution: { seed: number; timingMode: string; speed: number; stepsPerFrame: number };
  };
  expect(payload.v).toBe(2);
  expect(payload.scope).toEqual({
    kind: 'setup-only',
    includesResults: false,
    omittedUnsafeControls: ['audioOn', 'backgroundSim']
  });
  expect(payload.provenance.packageVersion).toBeTruthy();
  expect(payload.provenance.physicsVersion).toBeTruthy();
  expect(payload.provenance.sourceCommit).toBeNull();
  expect(payload.provenance.parameterHash.value).toMatch(/^[0-9a-f]{8}$/u);
  expect(payload.execution).toMatchObject({ seed: 4242, timingMode: 'deterministic', speed: 1.7, stepsPerFrame: 11 });

  const context = await browser.newContext();
  await context.addInitScript((ids) => {
    const tracked = new Set<string>(ids);
    const counters = { commits: 0, inputEvents: 0, changeEvents: 0 };
    (window as unknown as { __shareRestoreCounters: typeof counters }).__shareRestoreCounters = counters;
    document.addEventListener('pendulum:lab-controls-committed', (event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source === 'deep-link') counters.commits += 1;
    });
    document.addEventListener('input', (event) => {
      if (tracked.has((event.target as HTMLElement | null)?.id ?? '')) counters.inputEvents += 1;
    });
    document.addEventListener('change', (event) => {
      if (tracked.has((event.target as HTMLElement | null)?.id ?? '')) counters.changeEvents += 1;
    });
  }, SHARE_CONTROL_IDS);
  const restored = await context.newPage();
  try {
    await restored.goto(shareHref, { waitUntil: 'domcontentloaded' });
    await expect(restored.locator('#seed')).toHaveValue('4242');
    await expect(restored.locator('#timeMode')).toHaveValue('deterministic');
    await expect(restored.locator('#speed')).toHaveValue('1.7');
    await expect(restored.locator('#spf')).toHaveValue('11');
    await expect(restored.locator('#trailMode')).toHaveValue('ice');
    await expect(restored.locator('#qualityMode')).toHaveValue('cinematic');
    await expect(restored.locator('#glowMode')).toBeChecked();
    await expect
      .poll(() =>
        restored.evaluate(
          () =>
            (
              window as unknown as {
                __shareRestoreCounters: { commits: number; inputEvents: number; changeEvents: number };
              }
            ).__shareRestoreCounters
        )
      )
      .toEqual({ commits: 1, inputEvents: 0, changeEvents: 0 });
  } finally {
    await context.close();
  }
});
