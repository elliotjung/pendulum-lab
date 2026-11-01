import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { STABILITY_KINDS } from '../../src/product/adapters/analysis/stability/contracts';
import { defaultDrivenConfig, toCanonicalDriven } from '../../src/product/adapters/physics/driven';
import { encodeShareToken } from '../../src/product/persistence/share';

async function open(page: Page, slug = 'driven', stablePhysical = false) {
  let query = '';
  if (stablePhysical) {
    const config = toCanonicalDriven({
      ...defaultDrivenConfig(),
      parameters: { g: 1, length: 1, damping: 0.5 },
      initialState: [0.1, 0, 0],
      forcing: { waveform: 'sine', amplitude: 0.3, frequency: 2 / 3, phase: Math.PI / 2 }
    });
    if (!config.ok) throw new Error('stable physical fixture');
    const token = encodeShareToken(config.value);
    if (!token.ok) throw new Error('stable share fixture');
    query = `?state=${token.value}`;
  }
  await page.goto(`/next.html#/lab/${slug}${query}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#stability-workflow > summary').click();
  await expect(page.locator('#stability-kind option')).toHaveCount(11);
}
async function compute(page: Page, kind: string) {
  await page.locator('#stability-kind').selectOption(kind);
  await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
  await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'completed');
  return JSON.parse(await download(page));
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '안정성 결과 JSON 다운로드', exact: true }).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!, 'utf8');
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test.describe('S20 stability and bifurcation workflows', () => {
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
  for (const [family, slugs] of Object.entries(families))
    test(`${family}: every workspace discovers stability tools with explained source requirements`, async ({
      page
    }) => {
      for (const slug of slugs) {
        await open(page, slug);
        await expect(page.locator('#stability-workflow')).toContainText(/분석 대상|source|기준/);
        for (const kind of STABILITY_KINDS) {
          await page.locator('#stability-kind').selectOption(kind);
          if (
            slug !== 'driven' &&
            ['fixed-point', 'periodic-shooting', 'melnikov', 'continuation', 'codim-two'].includes(kind)
          )
            await expect(page.getByRole('button', { name: '안정성 계산', exact: true })).toBeDisabled();
        }
      }
    });

  test('loads the numerical workflow lazily and discards a late route load', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/next.html#/lab/triple');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    expect(requests.some((url) => /stability-panel|stability\.worker/.test(url))).toBe(false);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes('stability-panel'),
      async (route) => {
        await hold;
        await route.continue();
      }
    );
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#stability-workflow > summary').click();
    await expect(page.locator('#stability-workflow')).toContainText('불러옵니다');
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    release();
    await expect(page.locator('.lab-library')).toBeVisible();
    await expect(page.locator('#stability-workflow')).toHaveCount(0);
    await expect.poll(() => requests.some((url) => url.includes('stability-panel'))).toBe(true);
  });

  for (const kinds of [STABILITY_KINDS.slice(0, 4), STABILITY_KINDS.slice(4, 8), STABILITY_KINDS.slice(8)])
    test(`native tools ${kinds.join(', ')} execute in workers with explicit sources and complete input lineage`, async ({
      page
    }) => {
      await open(page, 'driven', true);
      for (const kind of kinds) {
        const started = page.waitForEvent('worker');
        const artifact = await compute(page, kind);
        expect((await started).url()).toContain('stability.worker');
        expect(artifact.schema).toBe('pendulum-stability-workflow/v1');
        expect(artifact.request.experiment.systemId).toBe('system:driven');
        expect(artifact.result.kind).toBe(kind);
        expect(artifact.result.source).toBe(artifact.request.settings.source);
        expect(artifact.result.rows.length).toBeGreaterThan(0);
        expect(artifact.result.warnings.length).toBeGreaterThan(0);
      }
      await audit(page);
    });

  test('saved fold branch reloads, restarts in the same direction and preserves original experiment/run', async ({
    page
  }) => {
    await open(page);
    const parent = await compute(page, 'pseudo-arclength');
    const endpoint = parent.result.branch.at(-1);
    const text = await download(page);
    await page.reload();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#stability-workflow > summary').click();
    await page
      .locator('#stability-import')
      .setInputFiles({ name: 'branch.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByRole('button', { name: '수렴 끝점에서 이어 계산', exact: true })).toBeEnabled();
    expect(JSON.parse(await download(page))).toEqual(parent);
    await page.getByRole('button', { name: '수렴 끝점에서 이어 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'completed');
    const child = JSON.parse(await download(page));
    expect(child.inputRunId).toBe(parent.inputRunId);
    expect(child.request.experiment).toEqual(parent.request.experiment);
    expect(child.request.restart.artifactId).toBe(parent.artifactId);
    expect(child.result.branch[0].parameter).toBeCloseTo(endpoint.parameter, 9);
    expect(child.result.branch[1].state[0]).toBeLessThan(endpoint.state[0]);
    const before = await download(page);
    await page.locator('#stability-import').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text.replace('pendulum-stability-workflow/v1', 'pendulum-stability-workflow/v99'))
    });
    await expect(page.locator('#stability-error')).toContainText(/실패/);
    expect(await download(page)).toBe(before);
    await audit(page);
  });

  test('a converged physical solution flows into Floquet and continuation with preserved source lineage', async ({
    page
  }) => {
    await open(page, 'driven', true);
    const parent = await compute(page, 'fixed-point');
    await page.locator('#stability-next-tool').selectOption('floquet');
    await page.getByRole('button', { name: '이 해로 다음 도구 준비', exact: true }).click();
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'completed');
    const floquet = JSON.parse(await download(page));
    expect(floquet.request.kind).toBe('floquet');
    expect(floquet.request.restart.artifactId).toBe(parent.artifactId);
    expect(floquet.inputRunId).toBe(parent.inputRunId);
    expect(floquet.request.experiment).toEqual(parent.request.experiment);
    await page.locator('#stability-next-tool').selectOption('continuation');
    await page.getByRole('button', { name: '이 해로 다음 도구 준비', exact: true }).click();
    await page.locator('#stability-end').fill(String(parent.result.branch[0].parameter + 0.01));
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'completed');
    const branch = JSON.parse(await download(page));
    expect(branch.request.kind).toBe('continuation');
    expect(branch.request.settings.parameter).toBe('forcingAmplitude');
    expect(branch.request.restart.artifactId).toBe(floquet.artifactId);
    expect(branch.inputRunId).toBe(parent.inputRunId);
    expect(branch.request.experiment).toEqual(parent.request.experiment);
  });

  test('source compatibility and invalid inputs explain recovery without corrupting a result', async ({ page }) => {
    await open(page, 'quantum-kicked-rotor');
    await expect(page.getByRole('button', { name: '안정성 계산', exact: true })).toBeDisabled();
    await expect(page.locator('#stability-rejection')).toContainText(/구동|driven/);
    const saved = await compute(page, 'pseudo-arclength');
    await page.locator('#stability-ds').fill('0');
    await expect(page.getByRole('button', { name: '안정성 계산', exact: true })).toBeDisabled();
    expect(JSON.parse(await download(page))).toEqual(saved);
    await page.locator('#stability-kind').selectOption('floquet');
    await page.locator('#stability-source').selectOption('linear-oscillator');
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'completed');
    const linear = JSON.parse(await download(page));
    expect(linear.result.source).toBe('linear-oscillator');
    expect(linear.request.experiment.systemId).toBe('system:quantum-kicked-rotor');
  });

  test('worker startup errors recover on the next calculation', async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      let fail = true;
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          if (fail && String(args[0]).includes('stability.worker')) {
            fail = false;
            throw new DOMException('fixture', 'SecurityError');
          }
          return Reflect.construct(target, args);
        }
      });
    });
    await open(page);
    await page.locator('#stability-kind').selectOption('pseudo-arclength');
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'error');
    await compute(page, 'pseudo-arclength');
  });

  test('nonconvergence preserves the last completed artifact', async ({ page }) => {
    await open(page);
    const saved = await compute(page, 'pseudo-arclength');
    await page.locator('#stability-kind').selectOption('periodic-shooting');
    await page.locator('#stability-guess0').fill('2');
    await page.locator('#stability-guess1').fill('2');
    await page.locator('#stability-maxIterations').fill('1');
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'nonconverged');
    // A wide failed-attempt table must stay in its own scroll region. Mobile
    // layout-viewport expansion otherwise shifts footer hit targets under cells.
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(JSON.parse(await download(page))).toEqual(saved);
  });

  test('cancellation preserves the last completed artifact', async ({ page }) => {
    await open(page);
    const saved = await compute(page, 'pseudo-arclength');
    await page.locator('#stability-kind').selectOption('codim-two');
    await page.locator('#stability-resolution').fill('12');
    await page.locator('#stability-lyapunovSteps').fill('500');
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '안정성 계산', exact: true }).click();
    await started;
    await page.getByRole('button', { name: '안정성 계산 취소', exact: true }).click();
    await expect(page.locator('#stability-workflow')).toHaveAttribute('data-stability-status', 'cancelled');
    expect(JSON.parse(await download(page))).toEqual(saved);
  });

  test('keyboard, narrow layout and themes retain an accessible branch graph and convergence table', async ({
    page
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-31T00:00:00.000Z'));
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/next.html#/lab/driven');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#stability-workflow > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#stability-kind option')).toHaveCount(11);
    await compute(page, 'pseudo-arclength');
    await audit(page);
    await expect(page.locator('#stability-workflow')).toHaveScreenshot('s20-stability-light.png');
    await page.locator('#product-theme').selectOption('dark');
    await audit(page);
    await expect(page.locator('#stability-workflow')).toHaveScreenshot('s20-stability-dark.png');
  });

  test('200 percent zoom retains branch controls and accessible result tables', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await compute(page, 'pseudo-arclength');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await audit(page);
  });
});
