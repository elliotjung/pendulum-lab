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
  'ensembleRequestedCount',
  'ensEps',
  'ensVariable',
  'ensPattern',
  'ensSeed',
  'angleUnit',
  'experimentGoal',
  'workflowStep',
  'trajectoryStage',
  'trailMode',
  'trailLen',
  'phaseAxis',
  'qualityMode',
  'glowMode',
  'longExpose',
  'interpolateRender',
  'autoQual'
] as const;

test('V4 setup link restores exact perturbation and workflow state in a fresh context through one semantic commit', async ({
  browser,
  page
}) => {
  const exactEpsilon = 0.00012345678901234567;
  expect(Object.is(exactEpsilon, 10 ** Math.log10(exactEpsilon))).toBe(false);
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
    value('ensembleRequestedCount', '17');
    value('ensEps', '-4.5');
    value('ensVariable', 'th3');
    value('ensPattern', 'random');
    value('ensSeed', '20260826');
    value('angleUnit', 'deg');
    value('experimentGoal', 'sensitive-dependence');
    value('workflowStep', 'measure');
    value('trajectoryStage', 'ensemble');
    value('trailMode', 'ice');
    value('trailLen', '1450');
    value('phaseAxis', 'both');
    value('qualityMode', 'cinematic');
    const glow = document.getElementById('glowMode') as HTMLInputElement | null;
    if (glow) glow.checked = true;
    const autoQuality = document.getElementById('autoQual') as HTMLInputElement | null;
    if (autoQuality) autoQuality.checked = false;
  });
  await page.getByTestId('precision-ensEps').evaluate((input, epsilon) => {
    const exact = input as HTMLInputElement;
    exact.value = epsilon;
    exact.dispatchEvent(new Event('change', { bubbles: true }));
    exact.dispatchEvent(new FocusEvent('blur'));
  }, String(exactEpsilon));

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
    execution: {
      seed: number;
      timingMode: string;
      speed: number;
      stepsPerFrame: number;
      ensemble: { count: number; epsilon: number; variable: string; pattern: string; seed: number };
    };
    preferences: { angleUnit: string };
    workflow: { goal: string; step: string; trajectoryStage: string };
  };
  expect(payload.v).toBe(4);
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
  expect(payload.execution.ensemble).toMatchObject({
    count: 17,
    epsilon: exactEpsilon,
    variable: 'th3',
    pattern: 'random',
    seed: 20260826
  });
  expect(payload.preferences).toEqual({ angleUnit: 'deg' });
  expect(payload.workflow).toEqual({
    goal: 'sensitive-dependence',
    step: 'measure',
    trajectoryStage: 'ensemble'
  });

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
    const staleQueryShare = new URL(shareHref);
    staleQueryShare.searchParams.set('sysType', 'double');
    staleQueryShare.searchParams.set('th1', '-1');
    staleQueryShare.searchParams.set('trajectoryStage', 'reference');
    await restored.goto(staleQueryShare.href, { waitUntil: 'domcontentloaded' });
    await expect(restored.locator('#sysType')).toHaveValue('triple');
    await expect(restored.locator('#th1')).toHaveAttribute('data-precision-canonical', '2');
    await expect(restored.locator('#seed')).toHaveValue('4242');
    await expect(restored.locator('#timeMode')).toHaveValue('deterministic');
    await expect(restored.locator('#speed')).toHaveValue('1.7');
    await expect(restored.locator('#spf')).toHaveValue('11');
    await expect(restored.locator('#trailMode')).toHaveValue('ice');
    await expect(restored.locator('#qualityMode')).toHaveValue('cinematic');
    await expect(restored.locator('#ensVariable')).toHaveValue('th3');
    await expect(restored.locator('#ensVariable option[value="th3"]')).toBeEnabled();
    await expect(restored.locator('#ensPattern')).toHaveValue('random');
    await expect(restored.locator('#ensSeed')).toHaveValue('20260826');
    await expect(restored.locator('#ensembleRequestedCount')).toHaveValue('17');
    await expect(restored.locator('#ensN')).toHaveValue('17');
    await expect(restored.getByTestId('precision-ensEps')).toHaveValue(String(exactEpsilon));
    await expect(restored.locator('#ensEps')).toHaveAttribute('data-precision-epsilon-canonical', String(exactEpsilon));
    await expect(restored.locator('#angleUnit')).toHaveValue('deg');
    await expect(restored.locator('#workflowStep')).toHaveValue('measure');
    await expect(restored.locator('#trajectoryStage')).toHaveValue('ensemble');
    await expect(restored.locator('#glowMode')).toBeChecked();
    await expect(restored.locator('#autoQual')).not.toBeChecked();
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
