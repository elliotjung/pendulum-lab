import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function oscillator() {
  const times = Array.from({ length: 160 }, (_, i) => i * 0.04);
  return {
    times,
    values: times.map((t) => [Math.cos(t), t === 0 ? 0 : -Math.sin(t)]),
    labels: ['q0', 'p0'],
    units: ['1', '1'],
    axisUnit: 'normalized-time',
    provenance: {
      kind: 'analytic-test-signal',
      canonical: true,
      coordinateOrder: 'q,p',
      canonicalUnits: ['1', '1'],
      description: 'Unit harmonic oscillator q=cos(t), p=-sin(t); this fixture is not a measured device.'
    }
  };
}
async function open(page: Page) {
  await page.goto('/next.html#/lab/double');
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#data-driven-research > summary').click();
  await expect(page.locator('#data-method')).toBeVisible();
}
async function upload(page: Page, input: unknown, name = 'learning.json') {
  await page.locator('#data-import').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
  });
}
async function confirm(page: Page) {
  const button = page.getByRole('button', { name: '미리보기 확인 · 데이터 또는 결과 채택', exact: true });
  await button.click();
}
async function dataset(page: Page) {
  await upload(page, oscillator());
  await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'preview');
  await expect(page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true })).toBeDisabled();
  await confirm(page);
  await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'confirmed');
}
async function download(page: Page) {
  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: '데이터·모델·평가 JSON 다운로드', exact: true }).click();
  const file = await started;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function run(page: Page, button = '모델 학습 · 고유해석 실행') {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'completed');
  return JSON.parse(await download(page));
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S23 data-driven models and Krylov tools', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const found: string[] = [];
    errors.set(page, found);
    page.on('pageerror', (error) => found.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') found.push(message.text());
    });
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

  for (const method of ['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'])
    test(`${method}: real native fitting retains split, model and validation lineage`, async ({ page }) => {
      await open(page);
      await dataset(page);
      await page.locator('#data-method').selectOption(method);
      if (method === 'hamiltonian') await page.locator('#data-degree').fill('2');
      const result = await run(page);
      expect(result.request.input.kind).toBe('learning');
      expect(result.request.input.settings.method).toBe(method);
      expect(result.request.input.data).toEqual(oscillator());
      expect(result.request.input.settings.splitIndex).toBe(112);
      expect(result.output.model.method).toBe(method);
      expect(Object.values(result.output.metrics).every((value) => Number.isFinite(value))).toBe(true);
      expect(result.output.rows.length).toBeGreaterThan(0);
      await expect(page.locator('#data-result svg')).toHaveAttribute('role', 'img');
      if (method === 'havok') await expect(page.locator('#data-result')).toContainText(/조건부|forcing/);
      await audit(page);
    });

  for (const method of ['arnoldi', 'lanczos', 'general-eigensolver'])
    test(`${method}: serialized operator produces independently checked spectral output`, async ({ page }) => {
      await open(page);
      if (method === 'arnoldi') await dataset(page);
      await page.locator('#data-method').selectOption(method);
      if (method === 'lanczos')
        await page.getByRole('button', { name: '64차 희소 Laplacian 예제', exact: true }).click();
      if (method === 'general-eigensolver') {
        await page.locator('#data-operator').fill(
          JSON.stringify({
            kind: 'dense',
            matrix: [
              [0, -1],
              [1, 0]
            ]
          })
        );
        await expect(page.getByRole('button', { name: '64차 희소 Laplacian 예제', exact: true })).toBeHidden();
      }
      const result = await run(page);
      expect(result.request.input.kind).toBe('eigen');
      expect(result.request.input.settings.method).toBe(method);
      expect(result.output.rows.length).toBeGreaterThan(0);
      expect(result.output.rows.flat().every(Number.isFinite)).toBe(true);
      if (method === 'general-eigensolver') {
        expect(result.output.rows).toHaveLength(2);
        expect(result.output.rows.map((row: number[]) => Math.abs(row[2]!))).toEqual([1, 1]);
      }
      if (method !== 'general-eigensolver')
        expect(result.output.rows.every((row: number[]) => row[3]! <= 1e-7)).toBe(true);
      if (method === 'arnoldi') {
        await upload(page, result, 'eigen-result.json');
        await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'preview');
        await confirm(page);
        await expect(page.locator('#data-confirmed')).toContainText('기존에 채택한 학습 데이터');
        await page.locator('#data-method').selectOption('dmd');
        const repeated = await run(page);
        expect(repeated.request.input.data).toEqual(oscillator());
      }
      await audit(page);
    });

  test('download, preview, adoption, retraining and fixed-model reevaluation preserve the saved source', async ({
    page
  }) => {
    await open(page);
    await dataset(page);
    await page.locator('#data-method').selectOption('dmd');
    const original = await run(page);
    const saved = await download(page);
    await page.reload();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#data-driven-research > summary').click();
    await upload(page, saved, 'saved-model.json');
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'preview');
    await expect(page.getByRole('button', { name: '저장 모델 재평가', exact: true })).toBeDisabled();
    await confirm(page);
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'restored');
    expect(JSON.parse(await download(page))).toEqual(original);
    await page.locator('#data-split').fill('100');
    const refit = await run(page, '저장 입력으로 재학습');
    expect(refit.request.input).toEqual(original.request.input);
    expect(refit.output).toEqual(original.output);
    const evaluated = await run(page, '저장 모델 재평가');
    expect(evaluated.request.mode).toBe('evaluate');
    expect(evaluated.request.parentId).toBe(refit.id);
    expect(evaluated.output).toEqual(original.output);
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0');
  });

  test('invalid split, unsafe files and nonsymmetric Lanczos input preserve previous result', async ({ page }) => {
    await open(page);
    await dataset(page);
    await page.locator('#data-method').selectOption('dmd');
    await run(page);
    const saved = await download(page);
    await page.locator('#data-split').fill('159');
    await page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true }).click();
    await expect(page.locator('#data-error')).toBeVisible();
    expect(await download(page)).toBe(saved);
    for (const text of ['null', '{broken', '{"schema":"pendulum-learning-data/v99"}']) {
      await upload(page, text);
      await expect(page.locator('#data-error')).toBeVisible();
      expect(await download(page)).toBe(saved);
    }
    await page.locator('#data-method').selectOption('lanczos');
    await page.locator('#data-operator').fill(
      JSON.stringify({
        kind: 'dense',
        matrix: [
          [1, 2, 0],
          [0, 3, 1],
          [0, 1, 4]
        ]
      })
    );
    await page.locator('#data-krylov').fill('3');
    await page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true }).click();
    await expect(page.locator('#data-error')).toContainText(/대칭|symmetr/);
    expect(await download(page)).toBe(saved);
  });

  test('current recorded Lab data is copied through preview without changing the live experiment', async ({ page }) => {
    await page.goto('/next.html#/lab/double');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await page.getByRole('tab', { name: '조건', exact: true }).click();
    await page.getByLabel('관찰 시간 · duration (s)', { exact: true }).fill('0.128');
    await page.getByText('상세 조건 펼치기', { exact: true }).click();
    await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.001');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#data-driven-research > summary').click();
    await page.getByRole('button', { name: '현재 실험 기록 미리보기', exact: true }).click();
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'preview');
    await expect(page.locator('#data-preview')).toContainText('129표본');
    await confirm(page);
    await page.locator('#data-method').selectOption('dmd');
    const result = await run(page);
    expect(result.request.input.data.provenance.experiment.systemId).toBe('system:double');
    expect(result.request.input.data.provenance.retainedSlice).toEqual({ start: 0, end: 129, total: 129 });
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0.128');
  });

  test('worker startup failure and pending-job cancellation preserve confirmed data', async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      let fail = true;
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          if (fail && String(args[0]).includes('data-driven.worker')) {
            fail = false;
            throw new DOMException('S23 startup fixture', 'SecurityError');
          }
          const worker = Reflect.construct(target, args) as Worker;
          if (String(args[0]).includes('data-driven.worker')) {
            const send = worker.postMessage.bind(worker);
            // Hold submission briefly so cancellation is tested before a tiny native fit can finish.
            Object.defineProperty(worker, 'postMessage', {
              value(message: unknown) {
                setTimeout(() => send(message), 1500);
              }
            });
          }
          return worker;
        }
      });
    });
    await open(page);
    await dataset(page);
    await page.locator('#data-method').selectOption('reservoir');
    await page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true }).click();
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'error');
    await expect(page.locator('#data-error')).toContainText('worker');
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true }).click();
    await started;
    await page.getByRole('button', { name: '데이터 모델 계산 취소', exact: true }).click();
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'cancelled');
    await expect(page.locator('#data-confirmed')).toContainText('160표본');
    await expect(page.getByRole('button', { name: '데이터·모델·평가 JSON 다운로드', exact: true })).toBeDisabled();
    await page.locator('#data-method').selectOption('dmd');
    await run(page);
  });

  test('keyboard, 320px, 200 percent zoom and light/dark result views remain accessible', async ({ page }) => {
    await open(page);
    await dataset(page);
    await page.locator('#data-method').selectOption('dmd');
    const execute = page.getByRole('button', { name: '모델 학습 · 고유해석 실행', exact: true });
    await execute.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#data-driven-research')).toHaveAttribute('data-data-model-status', 'completed');
    await page.setViewportSize({ width: 320, height: 800 });
    await audit(page);
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('화면 테마', { exact: true }).selectOption(theme);
      await expect(page.locator('#data-result')).toHaveScreenshot(`s23-data-model-${theme}.png`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await audit(page);
  });
});
