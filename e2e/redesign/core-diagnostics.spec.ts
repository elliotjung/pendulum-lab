import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { CORE_DIAGNOSTIC_KINDS } from '../../src/product/adapters/analysis/core/contracts';

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
} as const;

async function open(page: Page, slug = 'double') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function dock(page: Page) {
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#core-diagnostics > summary').click();
  await expect(page.locator('#core-diagnostic-compatibility li')).toHaveCount(11);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '진단 artifact JSON 다운로드', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function calculate(page: Page, kind: string) {
  await page.locator('#core-diagnostic-kind').selectOption(kind);
  await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
  await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'completed');
  await expect(page.locator('#core-diagnostic-progress')).toHaveAttribute('value', '100');
  return JSON.parse((await page.locator('.core-diagnostic-json').textContent())!);
}
async function audit(page: Page) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(report.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual(
    []
  );
}
async function reflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function runShortPlanar(page: Page) {
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await page.getByLabel('관찰 시간 · duration (s)', { exact: true }).fill('0.128');
  await page.getByText('상세 조건 펼치기', { exact: true }).click();
  await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.001');
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
}

test.describe('S18 common core diagnostics', () => {
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

  test('loads the diagnostic chunk only on demand and ignores a late load after route disposal', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await open(page, 'triple');
    expect(requested.some((url) => /diagnostics-panel|core\.worker/.test(url))).toBe(false);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes('diagnostics-panel'),
      async (route) => {
        await delayed;
        await route.continue();
      }
    );
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#core-diagnostics > summary').click();
    await expect(page.locator('#core-diagnostics')).toContainText('도구를 불러옵니다');
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    release();
    await expect(page.locator('.lab-library')).toBeVisible();
    await expect(page.locator('#core-diagnostics')).toHaveCount(0);
    await expect.poll(() => requested.some((url) => url.includes('diagnostics-panel'))).toBe(true);
  });

  for (const [family, slugs] of Object.entries(families)) {
    test(`${family}: every route exposes all eleven diagnostics and an explicit compatibility reason`, async ({
      page
    }) => {
      for (const slug of slugs) {
        await open(page, slug);
        await dock(page);
        await expect(page.locator('#core-diagnostic-kind option')).toHaveCount(11);
        for (const kind of CORE_DIAGNOSTIC_KINDS) {
          const entry = page.locator(`#core-diagnostic-compatibility li[data-diagnostic-kind="${kind}"]`);
          await expect(entry).toHaveCount(1);
          expect((await entry.textContent())!.split(': ').slice(1).join(': ').trim().length).toBeGreaterThan(0);
        }
        if (['unitary-floquet', 'lattice-fk-limit', 'frenkel-kontorova'].includes(slug)) {
          await expect(page.locator('#core-diagnostic-rejection')).toBeVisible();
          await expect(page.getByRole('button', { name: '핵심 진단 계산', exact: true })).toBeDisabled();
        }
      }
    });
  }

  for (const slug of [
    'double',
    'triple',
    'spring',
    'spherical',
    'driven',
    'duffing',
    'pendulum-network',
    'fput',
    'standard-map'
  ]) {
    test(`${slug}: a real recorded trajectory produces a worker artifact with declared axes and units`, async ({
      page
    }) => {
      await open(page, slug);
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
      await expect(page.locator('.lab-workspace')).not.toHaveAttribute('data-busy', 'true');
      await dock(page);
      const started = page.waitForEvent('worker');
      const artifact = await calculate(page, 'state-time');
      expect((await started).url()).toMatch(/core\.worker/);
      expect(artifact.schema).toBe('pendulum-core-diagnostic/v1');
      expect(artifact.request.experiment.systemId).toBe(`system:${slug}`);
      expect(artifact.result.rows.length).toBeGreaterThanOrEqual(2);
      expect(artifact.request.series.axisUnit).toBe(
        slug === 'standard-map' ? 'iteration' : ['duffing', 'fput'].includes(slug) ? 'normalized-time' : 's'
      );
      expect(artifact.result.units).toEqual([artifact.request.series.axisUnit, artifact.request.series.units[0]]);
      expect(artifact.result.rows.every((row: number[]) => row.every(Number.isFinite))).toBe(true);
      await expect(page.locator('#core-diagnostic-output svg')).toHaveAttribute('role', 'img');
      expect(JSON.parse(await download(page))).toEqual(artifact);
    });
  }

  test('all eleven diagnostics execute through the common worker and artifact reload preserves the current experiment', async ({
    page
  }) => {
    await open(page);
    await runShortPlanar(page);
    await dock(page);
    for (const kind of CORE_DIAGNOSTIC_KINDS) {
      const artifact = await calculate(page, kind);
      expect(artifact.result.kind).toBe(kind);
      expect(artifact.result.columns.length).toBe(artifact.result.units.length);
      expect(artifact.result.rows.every((row: number[]) => row.every(Number.isFinite))).toBe(true);
      expect(artifact.algorithmVersion).toBe('core-diagnostics-v1');
      expect(artifact.request.series.times).toHaveLength(129);
    }
    const exported = await download(page);
    const sourceTime = await page.locator('#lab-time').getAttribute('data-time');
    await page.reload();
    await dock(page);
    await page
      .locator('#core-diagnostic-import')
      .setInputFiles({ name: 'diagnostic.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await expect(page.locator('#core-diagnostic-status')).toContainText('다시 표시');
    expect(JSON.parse(await download(page))).toEqual(JSON.parse(exported));
    expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0');
    expect(sourceTime).toBe('0.128');
    await page.locator('#core-diagnostic-import').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exported.replace('pendulum-core-diagnostic/v1', 'pendulum-core-diagnostic/v99'))
    });
    await expect(page.locator('#core-diagnostic-error')).toContainText('가져오기 실패');
    expect(JSON.parse(await download(page))).toEqual(JSON.parse(exported));
    await audit(page);
  });

  test('invalid sampling settings explain refusal and noisy hybrid delay or discrete flows remain incompatible', async ({
    page
  }) => {
    await open(page);
    await dock(page);
    await page.locator('#core-diagnostic-kind').selectOption('fft');
    await expect(page.locator('#core-diagnostic-rejection')).toContainText(/표본|관측/);
    await expect(page.getByRole('button', { name: '핵심 진단 계산', exact: true })).toBeDisabled();
    await page.locator('#core-diagnostic-coordinate').fill('invalid');
    await expect(page.locator('#core-diagnostic-coordinate')).toHaveAttribute('aria-invalid', 'true');
    for (const slug of ['rope', 'friction', 'pyragas', 'langevin', 'standard-map', 'quantum-kicked-rotor']) {
      await open(page, slug);
      await dock(page);
      for (const kind of ['poincare', 'lyapunov', 'sali', 'fli', 'shadowing']) {
        await page.locator('#core-diagnostic-kind').selectOption(kind);
        await expect(page.locator('#core-diagnostic-rejection')).toBeVisible();
        await expect(page.getByRole('button', { name: '핵심 진단 계산', exact: true })).toBeDisabled();
      }
    }
  });

  test('reports real progress, cancels without artifacts, and retries after worker startup failure', async ({
    page
  }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      let fail = true;
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          if (fail && String(args[0]).includes('core.worker')) {
            fail = false;
            throw new DOMException('worker fixture', 'SecurityError');
          }
          return Reflect.construct(target, args);
        }
      });
    });
    await open(page);
    await dock(page);
    await page.locator('#core-diagnostic-kind').selectOption('lyapunov');
    await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'error');
    await expect(page.locator('#core-diagnostic-error')).toContainText('worker');
    await expect(page.getByRole('button', { name: '진단 artifact JSON 다운로드', exact: true })).toBeDisabled();
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
    await started;
    await page.getByRole('button', { name: '핵심 진단 취소', exact: true }).click();
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'cancelled');
    await expect(page.locator('.core-diagnostic-json')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '진단 artifact JSON 다운로드', exact: true })).toBeDisabled();
    await page.locator('#core-diagnostic-duration').fill('0.1');
    await page.locator('#core-diagnostic-progress').evaluate((node) => {
      const events: string[] = [];
      const observer = new MutationObserver(() => events.push(node.parentElement!.textContent ?? ''));
      observer.observe(node.parentElement!, { childList: true, subtree: true, characterData: true, attributes: true });
      Object.assign(node, { diagnosticObserved: { events, observer } });
    });
    await page.getByRole('button', { name: '핵심 진단 계산', exact: true }).click();
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('data-core-diagnostic-status', 'completed');
    const observed = await page.locator('#core-diagnostic-progress').evaluate((node) => {
      const state = (
        node as HTMLProgressElement & { diagnosticObserved: { events: string[]; observer: MutationObserver } }
      ).diagnosticObserved;
      state.observer.disconnect();
      return state.events;
    });
    expect(observed.some((text) => /실제 계산 작업 [1-9][0-9]*회/.test(text))).toBe(true);
  });

  test('keyboard, 320 px, zoom, light and dark diagnostics remain readable and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    const summary = page.locator('#core-diagnostics > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#core-diagnostics')).toHaveAttribute('open', '');
    await page.locator('#core-diagnostic-kind').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await calculate(page, 'state-time');
    await reflow(page);
    await audit(page);
    await expect(page.locator('#core-diagnostics')).toHaveScreenshot('s18-core-diagnostics-light.png');
    await page.locator('#product-theme').selectOption('dark');
    await reflow(page);
    await audit(page);
    await expect(page.locator('#core-diagnostics')).toHaveScreenshot('s18-core-diagnostics-dark.png');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await reflow(page);
    await audit(page);
  });
});
