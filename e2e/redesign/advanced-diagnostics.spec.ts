import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ADVANCED_DIAGNOSTIC_KINDS } from '../../src/product/adapters/analysis/advanced/contracts';

const families = {
  planar: ['double', 'compound-double'],
  chain: ['triple', 'chain'],
  constraint: ['spring', 'rope', 'double-string'],
  spatial: ['spherical', 'spherical-chain', 'spherical-embedded', 'spherical-embedded-chain'],
  driven: ['driven', 'coupled', 'inverted', 'cartpole', 'parametric'],
  nonlinear: ['duffing', 'van-der-pol', 'kapitza', 'mathieu', 'friction', 'pyragas'],
  network: ['magnetic', 'pendulum-network', 'huygens-phase-pair', 'kuramoto', 'chimera-exploration'],
  field: ['langevin', 'fput', 'lattice-fk-limit', 'sine-gordon', 'frenkel-kontorova'],
  discrete: ['standard-map', 'quantum-kicked-rotor', 'unitary-floquet']
};
async function open(page: Page, slug = 'double') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function dock(page: Page) {
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#advanced-diagnostics > summary').click();
  await expect(page.locator('#advanced-diagnostic-kind option')).toHaveCount(12);
}
async function calculate(page: Page, kind: string) {
  await page.locator('#advanced-diagnostic-kind').selectOption(kind);
  await page.getByRole('button', { name: '고급 분석 계산', exact: true }).click();
  await expect(page.locator('#advanced-diagnostics')).toHaveAttribute('data-advanced-diagnostic-status', 'completed');
  await expect(page.locator('#advanced-diagnostic-progress')).toHaveAttribute('value', '100');
  return JSON.parse((await page.locator('.advanced-diagnostic-json').textContent())!);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '고급 분석 artifact JSON 다운로드', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function audit(page: Page) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(report.violations.map((x) => ({ id: x.id, targets: x.nodes.map((n) => n.target) }))).toEqual([]);
}
async function reflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function shortRun(page: Page) {
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await page.getByLabel('관찰 시간 · duration (s)', { exact: true }).fill('0.256');
  await page.getByText('상세 조건 펼치기', { exact: true }).click();
  await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.001');
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
}

test.describe('S19 advanced chaos geometry', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on('pageerror', (error) => list.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') list.push(message.text());
    });
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

  test('loads advanced tools on demand and discards a late route load', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await open(page, 'triple');
    expect(requested.some((url) => /advanced-diagnostics-panel|advanced\.worker/.test(url))).toBe(false);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes('advanced-diagnostics-panel'),
      async (route) => {
        await delayed;
        await route.continue();
      }
    );
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#advanced-diagnostics > summary').click();
    await expect(page.locator('#advanced-diagnostics')).toContainText('도구를 불러옵니다');
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    release();
    await expect(page.locator('.lab-library')).toBeVisible();
    await expect(page.locator('#advanced-diagnostics')).toHaveCount(0);
    await expect.poll(() => requested.some((url) => url.includes('advanced-diagnostics-panel'))).toBe(true);
  });
  for (const [family, slugs] of Object.entries(families)) {
    test(`${family}: tools are discoverable with explained source compatibility on every route`, async ({ page }) => {
      for (const slug of slugs) {
        await open(page, slug);
        await dock(page);
        await expect(page.locator('#advanced-diagnostic-compatibility li')).toHaveCount(12);
        for (const kind of ADVANCED_DIAGNOSTIC_KINDS) {
          const entry = page.locator(`#advanced-diagnostic-compatibility li[data-diagnostic-kind="${kind}"]`);
          expect((await entry.textContent())!.trim().length).toBeGreaterThan(10);
        }
      }
    });
  }
  test('all twelve native tools execute in a dedicated worker with provenance and strict artifact reload', async ({
    page
  }) => {
    await open(page);
    await shortRun(page);
    await dock(page);
    for (const kind of ADVANCED_DIAGNOSTIC_KINDS) {
      const started = page.waitForEvent('worker');
      const artifact = await calculate(page, kind);
      expect((await started).url()).toMatch(/advanced\.worker/);
      expect(artifact.schema).toBe('pendulum-advanced-diagnostic/v1');
      expect(artifact.algorithmVersion).toBe('advanced-diagnostics-v1');
      expect(artifact.request.experiment.systemId).toBe('system:double');
      expect(artifact.request.series.times).toHaveLength(257);
      expect(artifact.result.kind).toBe(kind);
      expect(artifact.result.rows.length).toBeGreaterThan(0);
      expect(artifact.result.rows.every((row: number[]) => row.every(Number.isFinite))).toBe(true);
      expect(artifact.result.columns.length).toBe(artifact.result.units.length);
      expect(artifact.inputRunId.length).toBeGreaterThan(0);
      expect(artifact.result.warnings.length).toBeGreaterThan(0);
      expect(JSON.parse(await download(page))).toEqual(artifact);
    }
    const exported = await download(page);
    await page.reload();
    await dock(page);
    await page
      .locator('#advanced-diagnostic-import')
      .setInputFiles({ name: 'advanced.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await expect(page.locator('#advanced-diagnostic-status')).toContainText('다시 표시');
    expect(JSON.parse(await download(page))).toEqual(JSON.parse(exported));
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0');
    await page.locator('#advanced-diagnostic-import').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exported.replace('pendulum-advanced-diagnostic/v1', 'pendulum-advanced-diagnostic/v99'))
    });
    await expect(page.locator('#advanced-diagnostic-error')).toContainText('가져오기 실패');
    expect(JSON.parse(await download(page))).toEqual(JSON.parse(exported));
    await audit(page);
  });
  test('independent scalar benchmarks state their source and never imply standard-map entropy', async ({ page }) => {
    await open(page, 'standard-map');
    await dock(page);
    const artifact = await calculate(page, 'topological-entropy');
    expect(artifact.request.settings.source).toBe('tent');
    await expect(page.locator('#advanced-diagnostics')).toContainText('현재 진자');
    await page.locator('#advanced-diagnostic-kind').selectOption('transfer-operator');
    await page.locator('#advanced-diagnostic-source').selectOption('logistic');
    await page.locator('#advanced-diagnostic-mapParameter').fill('4');
    await page.getByRole('button', { name: '고급 분석 계산', exact: true }).click();
    await expect(page.locator('#advanced-diagnostics')).toHaveAttribute('data-advanced-diagnostic-status', 'completed');
    const logistic = JSON.parse(await download(page));
    expect(logistic.request.settings.source).toBe('logistic');
    expect(logistic.request.settings.mapParameter).toBe(4);
    await page.locator('#advanced-diagnostic-kind').selectOption('clv');
    await expect(page.locator('#advanced-diagnostic-rejection')).toBeVisible();
    await expect(page.getByRole('button', { name: '고급 분석 계산', exact: true })).toBeDisabled();
  });
  test('empty invalid and resource conditions refuse calculation with recovery instructions', async ({ page }) => {
    await open(page);
    await dock(page);
    await expect(page.locator('#advanced-diagnostic-rejection')).toContainText(/표본|관측/);
    await expect(page.getByRole('button', { name: '고급 분석 계산', exact: true })).toBeDisabled();
    await page.locator('#advanced-diagnostic-coordinate').fill('invalid');
    await expect(page.locator('#advanced-diagnostic-coordinate')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#advanced-diagnostic-kind').selectOption('basin');
    await page.locator('#advanced-diagnostic-resolution').fill('32');
    await page.locator('#advanced-diagnostic-duration').fill('100');
    await expect(page.locator('#advanced-diagnostic-rejection')).toContainText(/예산|step|계산/);
    await expect(page.getByRole('button', { name: '고급 분석 계산', exact: true })).toBeDisabled();
    for (const slug of ['rope', 'friction', 'pyragas', 'langevin', 'quantum-kicked-rotor']) {
      await open(page, slug);
      await dock(page);
      await page.locator('#advanced-diagnostic-kind').selectOption('clv');
      await expect(page.locator('#advanced-diagnostic-rejection')).toBeVisible();
      await expect(page.getByRole('button', { name: '고급 분석 계산', exact: true })).toBeDisabled();
      await page.locator('#advanced-diagnostic-kind').selectOption('basin');
      await expect(page.locator('#advanced-diagnostic-rejection')).toContainText('이중');
    }
  });
  test('worker startup errors recover and cancellation never publishes partial artifacts', async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      let fail = true;
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          if (fail && String(args[0]).includes('advanced.worker')) {
            fail = false;
            throw new DOMException('fixture', 'SecurityError');
          }
          return Reflect.construct(target, args);
        }
      });
    });
    await open(page);
    await dock(page);
    await page.locator('#advanced-diagnostic-kind').selectOption('clv');
    await page.getByRole('button', { name: '고급 분석 계산', exact: true }).click();
    await expect(page.locator('#advanced-diagnostics')).toHaveAttribute('data-advanced-diagnostic-status', 'error');
    await expect(page.locator('#advanced-diagnostic-error')).toContainText('worker');
    // The default CLV is intentionally short and can finish before Playwright's
    // next action. Use a valid bounded native job to exercise in-flight cancel.
    await page.locator('#advanced-diagnostic-forwardTransient').fill('1000');
    await page.locator('#advanced-diagnostic-window').fill('1000');
    await page.locator('#advanced-diagnostic-backwardTransient').fill('100');
    await page.locator('#advanced-diagnostic-renormEvery').fill('60');
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '고급 분석 계산', exact: true }).click();
    await started;
    await page.getByRole('button', { name: '고급 분석 취소', exact: true }).click();
    await expect(page.locator('#advanced-diagnostics')).toHaveAttribute('data-advanced-diagnostic-status', 'cancelled');
    await expect(page.locator('.advanced-diagnostic-json')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '고급 분석 artifact JSON 다운로드', exact: true })).toBeDisabled();
    await calculate(page, 'topological-entropy');
  });
  test('keyboard, 320 px, zoom, light and dark advanced tools stay readable and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#advanced-diagnostics > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#advanced-diagnostic-kind option')).toHaveCount(12);
    await calculate(page, 'topological-entropy');
    await reflow(page);
    await audit(page);
    await expect(page.locator('#advanced-diagnostics')).toHaveScreenshot('s19-advanced-light.png');
    await page.locator('#product-theme').selectOption('dark');
    await reflow(page);
    await audit(page);
    await expect(page.locator('#advanced-diagnostics')).toHaveScreenshot('s19-advanced-dark.png');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await reflow(page);
    await audit(page);
  });
});
