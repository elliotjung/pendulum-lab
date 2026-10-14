import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['spherical', 'spherical-chain', 'spherical-embedded', 'spherical-embedded-chain'];
async function open(page: Page, slug = 'spherical') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function settled(page: Page) {
  await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-busy', 'false');
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}
async function viewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S12 spatial systems laboratory', () => {
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
    test(`${slug}: real worker run, pause, step, cancellation and numerical export`, async ({ page }) => {
      await open(page, slug);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await settled(page);
      const before = Number(await page.locator('#lab-time').getAttribute('data-time'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(before + 0.002, 10);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'running');
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
      await panel(page, '분석');
      for (const kind of ['momentum', 'residual', 'energy', 'trajectory']) {
        await page.locator('#spatial-plot-kind').selectOption(kind);
        await expect(page.locator('.spatial-workspace')).not.toContainText(/NaN|Infinity/);
      }
      await panel(page, '내보내기');
      const csv = await download(page, '궤적 CSV 다운로드');
      expect(csv).toContain('time_s');
      expect(csv).toContain('z');
      expect(csv).not.toMatch(/NaN|Infinity/);
      expect(csv.trim().split(/\r?\n/).length).toBeGreaterThan(2);
      const svg = await download(page, '그림 SVG 다운로드');
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/NaN|Infinity/);
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });

    test(`${slug}: atomic editing, save, reload, share and state import`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#spatial-mass').fill('2.5');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '조건 적용', exact: true }).click();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await panel(page, '조건');
      await expect(page.locator('#spatial-mass')).toHaveValue('2.5');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      expect(JSON.parse(json).systemId).toBe(`system:${slug}`);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '조건');
      await expect(page.locator('#spatial-mass')).toHaveValue('2.5');
      await page.locator('#spatial-mass').fill('-1');
      await page.getByRole('button', { name: '조건 적용', exact: true }).click();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await panel(page, '내보내기');
      await page
        .locator('#spatial-import')
        .setInputFiles({ name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      await panel(page, '조건');
      await expect(page.locator('#spatial-mass')).toHaveValue('2.5');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
    });
  }

  test('unsafe imports and unsupported versions preserve valid 3D conditions', async ({ page }) => {
    await open(page, 'spherical-embedded');
    await panel(page, '내보내기');
    const valid = JSON.parse(await download(page, '상태 JSON 다운로드'));
    for (const raw of [
      '{"__proto__":{"polluted":true}}',
      ' '.repeat(200001),
      JSON.stringify({ ...valid, modelVersion: 'future' }),
      JSON.stringify({ ...valid, analyses: [{ id: 'analysis:lyapunov', parameters: {} }] })
    ]) {
      await page
        .locator('#spatial-import')
        .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
    }
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(valid);
  });

  test('worker startup error recovers and route departure terminates the run', async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      let fail = true;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) {
            fail = false;
            throw new Error('test worker unavailable');
          }
          super(url, options);
        }
      };
    });
    await open(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'error');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.goBack();
    await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  test('camera keyboard, pointer touch and overlays preserve the experiment', async ({ page }) => {
    await open(page, 'spherical-chain');
    const scene = page.locator('.spatial-renderer-stage svg');
    const renderer = page.locator('.spatial-renderer');
    await scene.focus();
    await page.keyboard.press('ArrowRight');
    await expect(renderer).toHaveAttribute('data-camera-yaw', '50');
    await page.keyboard.press('ArrowUp');
    await expect(renderer).toHaveAttribute('data-camera-elevation', '30');
    await page.keyboard.press('+');
    await expect(renderer).toHaveAttribute('data-camera-zoom', '1.15');
    await page.keyboard.press('Home');
    await expect(renderer).toHaveAttribute('data-camera-yaw', '35');
    await page.getByRole('button', { name: '왼쪽 회전', exact: true }).click();
    await expect(renderer).toHaveAttribute('data-camera-yaw', '20');
    await page.getByRole('button', { name: '시점 초기화', exact: true }).click();
    await scene.dispatchEvent('pointerdown', {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 100,
      clientY: 100
    });
    await scene.dispatchEvent('pointermove', {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      clientX: 150,
      clientY: 120
    });
    await scene.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(renderer).toHaveAttribute('data-camera-yaw', '55');
    await expect(renderer).toHaveAttribute('data-camera-elevation', '28');
    await page.getByLabel('속도 벡터', { exact: true }).check();
    await page.getByLabel('각운동량 방향', { exact: true }).check();
    await expect(scene.locator('[data-spatial-overlay="vectors"]')).toContainText('v1');
    await expect(scene.locator('[data-spatial-overlay="vectors"]')).toContainText('L');
    await page.getByLabel('xz 평면', { exact: true }).uncheck();
    await expect(scene.locator('[data-spatial-overlay="plane"] polygon')).toHaveCount(0);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    expect(state.initialConditions.angles.values).toEqual([0.6, 0, 0.5, 0.35]);
    expect(state).not.toHaveProperty('camera');
  });

  test('no WebGL still runs the native engine and exports numerical results', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (/webgl/.test(kind)) return null;
        return Reflect.apply(original, this, [kind, ...args]);
      } as typeof original;
    });
    await open(page, 'spherical-embedded');
    await expect(page.locator('.spatial-renderer')).toHaveAttribute('data-renderer', 'svg');
    await expect(page.locator('.spatial-renderer-status')).toContainText('계산과 수치 결과');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
    await expect(page.locator('#spatial-state-rows')).not.toContainText(/NaN|Infinity/);
    await panel(page, '내보내기');
    expect(await download(page, '궤적 CSV 다운로드')).toContain('Ly_kg_m2_s');
  });

  test('browser touch input rotates the camera without moving physical state', async ({ page }) => {
    await open(page);
    const scene = page.locator('.spatial-renderer-stage svg');
    await scene.scrollIntoViewIfNeeded();
    const bounds = (await scene.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const x = bounds.x + bounds.width * 0.35,
      y = bounds.y + bounds.height * 0.4;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 40, y: y + 20, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => Number(await page.locator('.spatial-renderer').getAttribute('data-camera-yaw')))
      .toBeGreaterThan(35);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    await cdp.detach();
  });

  test('WebGL context loss retains scene controls and numerical execution', async ({ page }) => {
    await open(page);
    await page.locator('.spatial-renderer-stage canvas').dispatchEvent('webglcontextlost', { cancelable: true });
    await expect(page.locator('.spatial-renderer')).toHaveAttribute('data-renderer', 'svg');
    await page.getByRole('button', { name: '오른쪽 회전', exact: true }).click();
    await expect(page.locator('.spatial-renderer')).toHaveAttribute('data-camera-yaw', '50');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
  });

  test('native pole state is restored without angular conversion and warns clearly', async ({ page }) => {
    await open(page, 'spherical-embedded');
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    state.initialConditions.direction.values = [0, -1, 0];
    state.initialConditions.directionRate.values = [0.5, 0, 0.2];
    await page
      .locator('#spatial-import')
      .setInputFiles({ name: 'pole.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
    expect(JSON.parse(await download(page, '상태 JSON 다운로드')).initialConditions).toEqual(state.initialConditions);
    await panel(page, '작업 공간');
    await expect(page.locator('#spatial-warnings')).toContainText('극점');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'paused');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
  });

  test('corrupt saved state cannot be overwritten', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/spatial/v1/system:spherical', 'future-original')
    );
    await open(page);
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/spatial/v1/system:spherical'))).toBe(
      'future-original'
    );
  });

  test('chain resizing preserves surviving native links and completes at the supported boundary', async ({ page }) => {
    await open(page, 'spherical-embedded-chain');
    await panel(page, '조건');
    await page.locator('#spatial-selected-link').selectOption('1');
    await page.locator('#spatial-mass').fill('3');
    await page.getByRole('button', { name: '조건 적용', exact: true }).click();
    await page.locator('#spatial-count').selectOption('1');
    await page.getByRole('button', { name: '조건 적용', exact: true }).click();
    await expect(page.locator('#spatial-mass')).toHaveValue('1');
    await page.locator('#spatial-count').selectOption('16');
    await page.locator('#spatial-duration').fill('0.006');
    await page.getByRole('button', { name: '조건 적용', exact: true }).click();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-lab-status', 'completed');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.006');
    await panel(page, '작업 공간');
    await expect(page.locator('#spatial-state-rows > article')).toHaveCount(16);
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    expect(state.parameters.masses.values).toHaveLength(16);
    expect(state.initialConditions.direction.values).toHaveLength(48);
    expect(state.initialConditions.directionRate.values).toHaveLength(48);
    expect(await download(page, '궤적 CSV 다운로드')).not.toMatch(/NaN|Infinity/);
  });

  test('wide camera viewport keeps the WebGL and SVG coordinate frames aligned', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await open(page);
    const alignment = await page.locator('.spatial-renderer-stage').evaluate((stage) => {
      const canvas = stage.querySelector('canvas')!;
      const svg = stage.querySelector('svg')!;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / 600, rect.height / 430);
      const matrix = svg.getScreenCTM()!;
      return {
        fit: getComputedStyle(canvas).objectFit,
        projectedOrigin: { x: matrix.e, y: matrix.f },
        canvasOrigin: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        svgScale: matrix.a,
        scale
      };
    });
    expect(alignment.fit).toBe('contain');
    expect(alignment.projectedOrigin.x).toBeCloseTo(alignment.canvasOrigin.x, 3);
    expect(alignment.projectedOrigin.y).toBeCloseTo(alignment.canvasOrigin.y, 3);
    expect(alignment.svgScale).toBeCloseTo(alignment.scale, 3);
  });

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard, accessibility and 320px preserve numerical access: ${name}`, async ({ page }) => {
      await open(page, 'spherical-embedded-chain');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      await audit(page);
    });
  }

  test('accessibility and 200% zoom preserve numerical access', async ({ page }) => {
    await open(page, 'spherical-embedded-chain');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await viewport(page);
    await audit(page);
  });

  test('frozen spatial workspace, embedded inspector and numerical layouts', async ({ page }) => {
    await open(page);
    await expect(page).toHaveScreenshot('s12-spherical-workspace-light.png', { fullPage: true });
    await open(page, 'spherical-embedded-chain');
    await panel(page, '조건');
    await page.getByLabel('화면 테마', { exact: true }).selectOption('dark');
    await expect(page).toHaveScreenshot('s12-embedded-inspector-dark.png', { fullPage: true });
    await panel(page, '분석');
    await expect(page).toHaveScreenshot('s12-spatial-diagnostics-dark.png', { fullPage: true });
  });
});
