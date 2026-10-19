import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['duffing', 'van-der-pol', 'kapitza', 'mathieu', 'friction', 'pyragas'];
const workspace = (page: Page) => page.locator('.nonlinear-workspace');
async function open(page: Page, slug = 'duffing') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function settled(page: Page) {
  await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
}
async function apply(page: Page) {
  await page.getByRole('button', { name: '조건 적용', exact: true }).click();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function importState(page: Page, json: string) {
  await page.locator('#nonlinear-import').setInputFiles({
    name: 'nonlinear-state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json)
  });
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) }))).toEqual(
    []
  );
}
async function viewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function mobileCaption(page: Page, host: string, units: RegExp) {
  if ((await page.evaluate(() => innerWidth)) > 600) return;
  const caption = page.locator(`${host} .nonlinear-plot-caption`);
  await expect(caption).toBeVisible();
  await expect(caption).toContainText(/가로축.+세로축/);
  await expect(caption).toContainText(units);
  await expect(caption).toHaveText((await page.locator(`${host} svg`).getAttribute('aria-label'))!);
}

test.describe('S14 nonlinear and delay systems laboratory', () => {
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

  for (const slug of slugs) {
    test(`${slug}: real worker run, pause, step, progress, cancel and finite exports`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      const step = Number(await page.locator('#nonlinear-step').inputValue());
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
        .toBeGreaterThan(slug === 'pyragas' ? 0.4 : 0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await settled(page);
      const before = Number(await page.locator('#lab-time').getAttribute('data-time'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(before + step, 10);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'running');
      await expect(page.locator('#nonlinear-state-0')).toBeDisabled();
      await panel(page, '내보내기');
      await expect(page.locator('#nonlinear-import')).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
      const csv = await download(page, '궤적 CSV 다운로드');
      expect(csv).toContain(['duffing', 'van-der-pol', 'mathieu'].includes(slug) ? 'time_normalized' : 'time_s');
      expect(csv).not.toMatch(/NaN|Infinity/);
      expect(csv.trim().split(/\r?\n/).length).toBeGreaterThan(2);
      expect(await download(page, '그림 SVG 다운로드')).toContain('<svg');
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });

    test(`${slug}: atomic edits, save, reload, share and canonical import`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#nonlinear-state-0').fill('0.3');
      await page.locator('#nonlinear-duration').fill('0.2');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
      await panel(page, '조건');
      await expect(page.locator('#nonlinear-state-0')).toHaveValue('0.3');
      await expect(page.locator('#nonlinear-duration')).toHaveValue('0.2');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      expect(JSON.parse(json).systemId).toBe(`system:${slug}`);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '내보내기');
      expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(JSON.parse(json));
      await panel(page, '조건');
      await page.locator('#nonlinear-step').fill('-1');
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await panel(page, '내보내기');
      await importState(page, json);
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(JSON.parse(json));
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(0.2, 10);
    });
  }

  test('each model applies its own phenomenon preset and exposes compatible diagnostics', async ({ page }) => {
    const kinds = new Map([
      ['duffing', 'potential'],
      ['van-der-pol', 'phase'],
      ['kapitza', 'potential'],
      ['mathieu', 'stability'],
      ['friction', 'friction'],
      ['pyragas', 'history']
    ]);
    for (const [slug, kind] of kinds) {
      await open(page, slug);
      await panel(page, '조건');
      const presets = page.locator('#nonlinear-preset');
      expect(await presets.locator('option').count()).toBeGreaterThan(1);
      await presets.selectOption({ index: 1 });
      await page.getByRole('button', { name: '예제 적용', exact: true }).click();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      await panel(page, '작업 공간');
      await expect(page.locator('#nonlinear-phenomenon')).toBeVisible();
      await expect(workspace(page)).not.toContainText(/NaN|Infinity/);
      await panel(page, '분석');
      await page.locator('#nonlinear-plot-kind').selectOption(kind);
      await expect(page.locator('#nonlinear-plot-kind')).toHaveValue(kind);
      await mobileCaption(
        page,
        '#nonlinear-analysis',
        ['duffing', 'van-der-pol', 'mathieu'].includes(slug) ? /정규화/ : slug === 'friction' ? /\(s\)/ : /rad/
      );
      if (slug !== 'pyragas')
        expect(await page.locator('#nonlinear-plot-kind option[value="history"]').count()).toBe(0);
      if (slug !== 'friction')
        expect(await page.locator('#nonlinear-plot-kind option[value="friction"]').count()).toBe(0);
    }
  });

  test('Pyragas linear prehistory and continued delay tape survive save, share and import exactly', async ({
    page
  }) => {
    await open(page, 'pyragas');
    await panel(page, '조건');
    await page.locator('#nonlinear-history-kind').selectOption('linear');
    await page.locator('#nonlinear-history-theta').fill('0.4');
    await page.locator('#nonlinear-history-omega').fill('-0.2');
    await page.locator('#nonlinear-state-0').fill('0.4');
    await page.locator('#nonlinear-state-1').fill('-0.2');
    await page.locator('#nonlinear-duration').fill('0.2');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '작업 공간');
    await page.getByRole('button', { name: '현재 상태·이력으로 계속', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
    await panel(page, '내보내기');
    const json = await download(page, '상태 JSON 다운로드');
    const canonical = JSON.parse(json);
    expect(canonical.modelOptions.historyKind).toBe('linear');
    expect(canonical.initialConditions.historyTheta).toEqual({ kind: 'scalar', value: 0.4, unit: 'rad' });
    expect(canonical.initialConditions.historyOmega).toEqual({ kind: 'scalar', value: -0.2, unit: 'rad/s' });
    const times: number[] = canonical.initialConditions.delayTimes.values;
    const theta: number[] = canonical.initialConditions.delayTheta.values;
    const omega: number[] = canonical.initialConditions.delayOmega.values;
    expect(times.length).toBeGreaterThan(2);
    expect(times.length).toBe(theta.length);
    expect(times.length).toBe(omega.length);
    expect(times.at(-1)).toBe(0);
    expect(theta.at(-1)).toBe(canonical.initialConditions.theta.value);
    expect(omega.at(-1)).toBe(canonical.initialConditions.omega.value);
    expect(canonical.runtime.start.value).toBeCloseTo(0.2, 10);
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await page.reload();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
    await panel(page, '조건');
    await expect(page.locator('#nonlinear-history-kind')).toHaveValue('linear');
    await expect(page.locator('#nonlinear-history-theta')).toHaveValue('0.4');
    await expect(page.locator('#nonlinear-history-omega')).toHaveValue('-0.2');
    await panel(page, '내보내기');
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(canonical);
    await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
    await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
    await panel(page, '내보내기');
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(canonical);
    await importState(page, json);
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(canonical);
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'paused');
    const continued = await download(page, '궤적 CSV 다운로드');
    await importState(page, json);
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    expect(await download(page, '궤적 CSV 다운로드')).toBe(continued);
    await panel(page, '분석');
    await page.locator('#nonlinear-plot-kind').selectOption('history');
    await expect(workspace(page)).not.toContainText(/NaN|Infinity/);
  });

  test('unsafe, future, unsupported and malformed delay imports preserve the current experiment', async ({ page }) => {
    await open(page, 'pyragas');
    await panel(page, '내보내기');
    const valid = JSON.parse(await download(page, '상태 JSON 다운로드'));
    for (const raw of [
      '{"__proto__":{"polluted":true}}',
      ' '.repeat(262145),
      JSON.stringify({ ...valid, modelVersion: 'future' }),
      JSON.stringify({ ...valid, analyses: [{ id: 'analysis:lyapunov', parameters: {} }] }),
      JSON.stringify({
        ...valid,
        initialConditions: {
          ...valid.initialConditions,
          delayTimes: { kind: 'vector', values: [-0.2, 0], unit: 's' },
          delayTheta: { kind: 'vector', values: [0.3], unit: 'rad' },
          delayOmega: { kind: 'vector', values: [0, 0], unit: 'rad/s' }
        }
      }),
      JSON.stringify({
        ...valid,
        initialConditions: {
          ...valid.initialConditions,
          delayTimes: { kind: 'vector', values: [-0.2, 0, -0.1], unit: 's' },
          delayTheta: { kind: 'vector', values: [0.3, 0.3, 0.3], unit: 'rad' },
          delayOmega: { kind: 'vector', values: [0, 0, 0], unit: 'rad/s' }
        }
      }),
      '{broken delay history'
    ]) {
      await importState(page, raw);
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      if (raw.length > 262144) await expect(page.getByRole('alert')).toContainText('256 KiB');
      expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(valid);
    }
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'))).toBe(false);
  });

  test('corrupt saved settings remain intact when a save is attempted', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/nonlinear/v1/system:pyragas', 'future-original')
    );
    await open(page, 'pyragas');
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/nonlinear/v1/system:pyragas'))).toBe(
      'future-original'
    );
  });

  test('an unconfined Duffing trajectory stops at its last finite state and recovers after correction', async ({
    page
  }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#nonlinear-cubicStiffness').fill('-1');
    await page.locator('#nonlinear-damping').fill('0');
    await page.locator('#nonlinear-driveAmplitude').fill('0');
    await page.locator('#nonlinear-state-0').fill('20');
    await page.locator('#nonlinear-duration').fill('0.5');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await settled(page);
    await expect(page.getByRole('alert')).toContainText('마지막 유효 상태');
    const stoppedAt = Number(await page.locator('#lab-time').getAttribute('data-time'));
    expect(stoppedAt).toBeGreaterThan(0);
    expect(stoppedAt).toBeLessThan(0.5);
    await panel(page, '내보내기');
    expect(await download(page, '궤적 CSV 다운로드')).not.toMatch(/NaN|Infinity/);
    await panel(page, '조건');
    await page.locator('#nonlinear-cubicStiffness').fill('1');
    await page.locator('#nonlinear-state-0').fill('0.3');
    await apply(page);
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'paused');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
  });

  test('worker startup errors recover and leaving a running route terminates its worker', async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      let fail = true;
      const state = { created: 0, terminated: 0 };
      Object.assign(window, { nonlinearWorkers: state });
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) {
            fail = false;
            throw new Error('test worker unavailable');
          }
          super(url, options);
          state.created++;
        }
        override terminate() {
          state.terminated++;
          super.terminate();
        }
      };
    });
    await open(page, 'pyragas');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await expect(page.getByRole('alert')).toContainText(/worker|작업자/i);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect
      .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
      .toBeGreaterThan(0.4);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await expect(page.locator('.lab-library')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { nonlinearWorkers: { terminated: number } }).nonlinearWorkers.terminated
      )
    ).toBe(1);
    await page.goBack();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard, accessibility and 320px preserve nonlinear control access: ${name}`, async ({ page }) => {
      await open(page, 'pyragas');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      if (name === '작업 공간') await mobileCaption(page, '#nonlinear-phenomenon', /rad/);
      if (name === '분석') await mobileCaption(page, '#nonlinear-analysis', /rad/);
      await audit(page);
    });
  }

  test('200% zoom preserves prehistory and model-specific parameter editing', async ({ page }) => {
    await open(page, 'pyragas');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await page.locator('#nonlinear-history-kind').selectOption('linear');
    await page.locator('#nonlinear-history-omega').fill('0.25');
    await apply(page);
    await viewport(page);
    await audit(page);
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  });

  test('frozen nonlinear potential, limit cycle, friction and delay-history layouts', async ({ page }) => {
    const scenes = [
      { slug: 'duffing', kind: 'potential', file: 's14-duffing-potential-light.png', theme: 'light', duration: '0.2' },
      { slug: 'van-der-pol', kind: 'phase', file: 's14-vanderpol-phase-dark.png', theme: 'dark', duration: '24' },
      { slug: 'friction', kind: 'friction', file: 's14-friction-events-dark.png', theme: 'dark', duration: '8' },
      { slug: 'pyragas', kind: 'history', file: 's14-pyragas-history-light.png', theme: 'light', duration: '0.4' }
    ];
    for (const scene of scenes) {
      await open(page, scene.slug);
      await panel(page, '조건');
      await page.locator('#nonlinear-duration').fill(scene.duration);
      await apply(page);
      await page.getByLabel('재생 속도', { exact: true }).selectOption('4');
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed', { timeout: 15000 });
      await panel(page, '분석');
      await page.locator('#nonlinear-plot-kind').selectOption(scene.kind);
      await page.getByLabel('화면 테마', { exact: true }).selectOption(scene.theme);
      await mobileCaption(
        page,
        '#nonlinear-analysis',
        ['duffing', 'van-der-pol'].includes(scene.slug) ? /정규화/ : scene.slug === 'friction' ? /\(s\)/ : /rad/
      );
      await expect(page).toHaveScreenshot(scene.file, { fullPage: true });
    }
  });
});
