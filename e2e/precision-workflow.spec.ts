import { expect, test } from '@playwright/test';

test('IME composition does not commit an intermediate scientific value', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const before = await page.locator('#th1').getAttribute('data-precision-canonical');
  await page.getByTestId('precision-th1').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '2' }));
    input.value = '2';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', isComposing: true })
    );
  });
  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', before ?? '2');

  await page.getByTestId('precision-th1').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '2π/3';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '2π/3' }));
    input.blur();
  });
  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', String((2 * Math.PI) / 3));
});

test('fresh guided Lab progresses from reference to one perturbation to the remembered ensemble', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', '2');
  await expect(page.locator('#th2')).toHaveAttribute('data-precision-canonical', '2.5');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __modernLab: { readConfig(): { initialState: number[] } } }).__modernLab
        .readConfig()
        .initialState.slice(0, 2)
    )
  ).toEqual([2, 2.5]);
  const draggedTheta = (2 * Math.PI) / 3;
  await page.evaluate((theta) => {
    (
      window as unknown as {
        __modernLab: { setAngles(angles: number[], resume: boolean): void };
      }
    ).__modernLab.setAngles([theta, 1.25], false);
  }, draggedTheta);
  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', String(draggedTheta));
  await expect(page.getByTestId('precision-th1')).toHaveValue(String(draggedTheta));
  await page.evaluate(() => {
    const range = document.getElementById('th1');
    const counters = { input: 0, change: 0 };
    range?.addEventListener('input', () => (counters.input += 1));
    range?.addEventListener('change', () => (counters.change += 1));
    (window as unknown as { __precisionCommitCounters: typeof counters }).__precisionCommitCounters = counters;
  });
  await page.getByTestId('precision-th1').fill('1.2345678901234567');
  await page.getByTestId('precision-th1').press('Tab');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __precisionCommitCounters: { input: number; change: number } })
            .__precisionCommitCounters
      )
    )
    .toEqual({ input: 1, change: 1 });
  const exactEpsilon = 0.00012345678901234567;
  expect(Object.is(exactEpsilon, 10 ** Math.log10(exactEpsilon))).toBe(false);
  await page.getByTestId('precision-ensEps').evaluate((input, value) => {
    const exact = input as HTMLInputElement;
    exact.value = value;
    exact.dispatchEvent(new Event('change', { bubbles: true }));
    exact.dispatchEvent(new FocusEvent('blur'));
  }, String(exactEpsilon));
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __modernLab: { ensemble: { description(): { spec: { epsilon: number } } } };
          }
        ).__modernLab.ensemble.description().spec.epsilon
    )
  ).toBe(exactEpsilon);
  await expect(page.locator('#ensEps')).toHaveAttribute('data-precision-epsilon-canonical', String(exactEpsilon));
  expect(await page.locator('#workflowMeasurement').getAttribute('data-en')).toContain(`Δθ₁=${exactEpsilon} rad`);
  await page.evaluate(() => {
    (
      window as unknown as {
        __modernLab: { setAngles(angles: number[], resume: boolean): void };
      }
    ).__modernLab.setAngles([2, 2.5], false);
  });
  await expect(page.locator('#ensVariable option[value="th3"]')).toBeDisabled();
  await expect(page.locator('#ensVariable option[value="iw3"]')).toBeDisabled();
  await page.locator('#sysType').selectOption('triple', { force: true });
  await expect(page.locator('#ensVariable option[value="th3"]')).toBeEnabled();
  await page.locator('#ensVariable').selectOption('th3', { force: true });
  await page.evaluate(() => {
    let changes = 0;
    document.getElementById('ensEps')?.addEventListener('change', () => (changes += 1));
    (window as unknown as { __systemNormalizationEpsilonChanges: () => number }).__systemNormalizationEpsilonChanges =
      () => changes;
  });
  await page.locator('#sysType').selectOption('double', { force: true });
  await expect(page.locator('#ensVariable')).toHaveValue('th1');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __systemNormalizationEpsilonChanges: () => number }).__systemNormalizationEpsilonChanges()
    )
  ).toBe(0);
  await expect(page.getByTestId('trajectory-stage')).toHaveValue('reference');
  await expect(page.locator('#ensN')).toHaveValue('0');
  await expect(page.locator('[data-trajectory-stage-button="reference"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-trajectory-stage-button="perturbed"]').click();
  await expect(page.getByTestId('trajectory-stage')).toHaveValue('perturbed');
  await expect(page.locator('#ensN')).toHaveValue('1');

  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  await expect(page.getByTestId('trajectory-stage')).toHaveValue('ensemble');
  await expect(page.locator('#ensN')).toHaveValue('12');

  await page.locator('[data-trajectory-stage-button="reference"]').click();
  await expect(page.locator('#ensN')).toHaveValue('0');
  await expect(page.locator('#ensembleRequestedCount')).toHaveValue('12');
});

test('reference-only goals skip invented ensemble steps and open their real diagnostic', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('experiment-goal').selectOption('energy-drift', { force: true });

  await expect(page.getByTestId('workflow-step')).toHaveValue('reference');
  await expect(page.getByTestId('trajectory-stage')).toHaveValue('reference');
  await expect(page.locator('#ensN')).toHaveValue('0');
  await expect(page.locator('.trajectory-role-panel')).toBeHidden();
  await expect(page.locator('[data-workflow-step-button="perturb"]')).toBeHidden();
  await expect(page.locator('#workflowMeasurement')).not.toContainText('n=0');
  await expect(page.locator('#workflowCurrentTitle')).toHaveText('Run the reference');
  await expect(page.locator('#workflowNextAction')).not.toContainText(/perturb|Δ|ensemble/iu);

  await page.getByTestId('workflow-primary-action').click();
  await expect(page.getByTestId('workflow-step')).toHaveValue('measure');
  await expect(page.locator('#workflowCurrentTitle')).toHaveText('Measure the result');
  await expect(page.getByTestId('workflow-primary-action')).toHaveText('Open independent validation');
  await page.getByTestId('workflow-primary-action').click();
  await expect(page.locator('.tab[data-tab="validate"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#runConvergence')).toBeFocused();
  await expect(page.getByTestId('workflow-step')).toHaveValue('explain');
});

test('Landing handoff preserves off-step exact state, perturbation, unit, and workflow', async ({ browser, page }) => {
  const thetaOne = String((2 * Math.PI) / 3);
  const thetaTwo = '1.2345678901234567';
  const exactEpsilon = '0.00012345678901234567';
  const query = new URLSearchParams({
    experiment: 'sensitive-dependence',
    experimentSchema: 'pendulum-sensitive-dependence/v1',
    audience: 'beginner',
    lang: 'en',
    angleUnit: 'deg',
    sysType: 'double',
    th1: thetaOne,
    th2: thetaTwo,
    iw1: '0.125',
    iw2: '-0.375',
    m1: '1.73',
    m2: '0.84',
    l1: '1.41',
    l2: '0.67',
    g: '3.711',
    gamma: '0.123456',
    perturbationVar: 'th1',
    deltaTheta: exactEpsilon,
    workflowStep: 'measure',
    trajectoryStage: 'perturbed'
  });
  await page.goto(`/?${query.toString()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#handoffContinuity')).toContainText('Continuing your Landing experiment');
  await expect(page.getByTestId('experiment-goal')).toHaveValue('sensitive-dependence');
  await expect(page.getByTestId('angle-unit')).toHaveValue('deg');
  await expect(page.locator('label[for="th1"]')).toHaveText('θ₁ (deg)');
  await expect(page.locator('label[for="iw1"]')).toHaveText('ω₁ (deg/s)');
  await expect(page.getByTestId('workflow-step')).toHaveValue('measure');
  await expect(page.getByTestId('trajectory-stage')).toHaveValue('perturbed');
  await expect(page.getByTestId('perturbation-variable')).toHaveValue('th1');
  await expect(page.getByTestId('precision-ensEps')).toHaveValue(exactEpsilon);
  await expect(page.locator('#ensEps')).toHaveAttribute('data-precision-epsilon-canonical', exactEpsilon);

  // The canonical range is a storage surface, not a 0.001-rad quantizer.
  await expect(page.locator('#th1')).toHaveAttribute('step', 'any');
  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', thetaOne);
  await expect(page.locator('#th2')).toHaveAttribute('data-precision-canonical', thetaTwo);
  // Chromium shortens the display projection to about 15 significant digits;
  // the independent canonical store and Lab config retain the authored float.
  expect(Number(await page.locator('#th1').inputValue())).toBeCloseTo(Number(thetaOne), 13);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __modernLab: { readConfig(): { initialState: number[] } } }).__modernLab.readConfig()
          .initialState[0]
    )
  ).toBe(Number(thetaOne));
  const handedOffConfig = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: {
          readConfig(): {
            gamma: number;
            parameters: { m1: number; m2: number; l1: number; l2: number; g: number };
            initialState: number[];
          };
        };
      }
    ).__modernLab.readConfig()
  );
  expect(handedOffConfig).toMatchObject({
    gamma: 0.123456,
    parameters: { m1: 1.73, m2: 0.84, l1: 1.41, l2: 0.67, g: 3.711 }
  });
  expect(handedOffConfig.initialState).toEqual([Number(thetaOne), Number(thetaTwo), 0.125, -0.375]);
  await expect(page.locator('#trajectoryReadout')).toContainText('Δθ₁');
  await expect(page.locator('#trajectoryReadout')).toContainText('alternating');
  expect(await page.locator('#workflowMeasurement').getAttribute('data-en')).toContain(`Δθ₁=${exactEpsilon} rad`);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __modernLab: { ensemble: { description(): { spec: { epsilon: number } } } };
          }
        ).__modernLab.ensemble.description().spec.epsilon
    )
  ).toBe(Number(exactEpsilon));

  await page.getByTestId('precision-th1').fill('120°');
  await page.getByTestId('precision-th1').press('Enter');
  expect(Number(await page.locator('#th1').getAttribute('data-precision-canonical'))).toBe((2 * Math.PI) / 3);
  const beforeFineStep = Number(await page.locator('#th1').getAttribute('data-precision-canonical'));
  await page.getByTestId('precision-th1').press('Alt+ArrowUp');
  expect(Number(await page.locator('#th1').getAttribute('data-precision-canonical')) - beforeFineStep).toBeCloseTo(
    0.0001,
    15
  );

  await page.getByTestId('share-experiment').click();
  const shared = page.url();
  const context = await browser.newContext();
  const restored = await context.newPage();
  try {
    await restored.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(restored.locator('#th1')).toHaveAttribute('data-precision-canonical', String(beforeFineStep + 0.0001));
    await expect(restored.getByTestId('precision-ensEps')).toHaveValue(exactEpsilon);
    await expect(restored.locator('#ensEps')).toHaveAttribute('data-precision-epsilon-canonical', exactEpsilon);
    expect(
      await restored.evaluate(
        () =>
          (
            window as unknown as {
              __modernLab: { ensemble: { description(): { spec: { epsilon: number } } } };
            }
          ).__modernLab.ensemble.description().spec.epsilon
      )
    ).toBe(Number(exactEpsilon));
    await expect(restored.getByTestId('workflow-step')).toHaveValue('measure');
    await expect(restored.getByTestId('perturbation-pattern')).toHaveValue('alternating');
    await expect(restored.getByTestId('perturbation-seed')).toHaveValue('1');
  } finally {
    await context.close();
  }
});

test('invalid Landing handoff values remain visible as rejected instead of mutating the experiment', async ({
  page
}) => {
  const query = new URLSearchParams({
    experiment: 'sensitive-dependence',
    experimentSchema: 'pendulum-sensitive-dependence/v1',
    th1: String(Math.PI + 0.01),
    m1: '180deg',
    g: '21',
    deltaTheta: '0.0100001'
  });
  await page.goto(`/?${query.toString()}`, { waitUntil: 'domcontentloaded' });

  expect(Math.abs(Number(await page.locator('#th1').getAttribute('data-precision-canonical')))).toBeLessThanOrEqual(
    Math.PI
  );
  expect(Number(await page.locator('#m1').getAttribute('data-precision-canonical'))).toBe(1);
  expect(Number(await page.locator('#g').getAttribute('data-precision-canonical'))).toBe(9.81);
  await expect(page.getByTestId('precision-ensEps')).toHaveValue('0.0001');
  await expect(page.locator('#handoffContinuity')).toContainText('Invalid perturbation epsilon: 0.0100001');
});

test('an unknown Landing handoff schema is visible and fails closed', async ({ page }) => {
  const query = new URLSearchParams({
    experiment: 'sensitive-dependence',
    experimentSchema: 'pendulum-sensitive-dependence/v99',
    th1: '1.25',
    deltaTheta: '0.001'
  });
  await page.goto(`/?${query.toString()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#th1')).toHaveAttribute('data-precision-canonical', '2');
  await expect(page.locator('#ensN')).toHaveValue('0');
  await expect(page.locator('#handoffContinuity')).toContainText('Unsupported experiment schema');
});
