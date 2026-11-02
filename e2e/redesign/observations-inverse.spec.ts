import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../src/product/adapters/physics/planar';
import { encodeShareToken } from '../../src/product/persistence/share';

function fixture(duration = 1, step = 0.01, g = 8.5) {
  const config = {
    ...defaultPlanarConfig(),
    duration,
    step,
    sampleEvery: 1,
    parameters: { ...defaultPlanarConfig().parameters, g },
    initialState: [0.4, -0.2, 0.1, -0.05] as const
  };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('S22 canonical fixture');
  return { config, canonical: canonical.value };
}
function observations() {
  const { config } = fixture(1, 0.01, 9.81);
  const simulation = createPlanarSimulation(config);
  const rows = ['time,theta1,theta2'];
  let sample = simulation.snapshot();
  rows.push(`${sample.time},${sample.state[0]},${sample.state[1]}`);
  while (!simulation.done) {
    sample = simulation.step();
    if (simulation.done || Math.round(sample.time / config.step) % 5 === 0)
      rows.push(`${sample.time},${sample.state[0]},${sample.state[1]}`);
  }
  return rows.join('\n');
}
async function open(page: Page, duration = 1, step = 0.01) {
  const token = encodeShareToken(fixture(duration, step).canonical);
  if (!token.ok) throw new Error('S22 share fixture');
  await page.goto(`/next.html#/lab/double?state=${token.value}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#observation-research > summary').click();
  await expect(page.locator('#research-source-kind')).toBeVisible();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function previewAndConfirm(page: Page, text = observations()) {
  await page.locator('#research-source-text').fill(text);
  await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
  await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
  await expect(page.getByRole('button', { name: '원본·변환 관측 JSON 다운로드', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
  await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'confirmed');
}
async function run(page: Page) {
  await page.getByRole('button', { name: '역문제 · UQ 실행', exact: true }).click();
  await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'completed');
  return JSON.parse(await download(page, '원본·추정·UQ 결과 JSON 다운로드'));
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S22 observations, inverse problems and uncertainty', () => {
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
  test('preview confirmation recovers gravity and restores original observation lineage', async ({ page }) => {
    await open(page);
    await previewAndConfirm(page);
    const original = JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'));
    expect(original.original.text).toBe(observations());
    const result = await run(page);
    expect(result.kind).toBe('estimate');
    expect(result.rows[0][1]).toBeCloseTo(9.81, 3);
    expect(result.observationId).toBe(original.id);
    expect(result.request.settings.observation).toEqual(original);
    expect(result.request.experiment).toEqual(fixture().canonical);
    await page.reload();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#observation-research > summary').click();
    await page.locator('#research-import-artifact').setInputFiles({
      name: 'inverse-result.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(result))
    });
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'restored');
    expect(JSON.parse(await download(page, '원본·추정·UQ 결과 JSON 다운로드'))).toEqual(result);
    await expect(page.getByRole('button', { name: '원본·변환 관측 JSON 다운로드', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    expect(JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'))).toEqual(original);
    await audit(page);
  });
  test('changed transformation invalidates pending preview and malformed input preserves confirmed original', async ({
    page
  }) => {
    await open(page);
    await previewAndConfirm(page, 'time,theta1,theta2\n0,0.2,0.1\n0.1,0.18,0.09');
    const original = await download(page, '원본·변환 관측 JSON 다운로드');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#research-preview')).toContainText('확정 전 미리보기');
    await page.locator('.research-import > details > summary').click();
    await page.locator('#research-time-offset').fill('1');
    await expect(page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true })).toBeDisabled();
    await page.locator('#research-source-text').fill('time,theta1,theta2\n0,=IMPORTXML("evil"),0.1\n1,0.2,0.1');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#research-error')).toBeVisible();
    expect(await download(page, '원본·변환 관측 JSON 다운로드')).toBe(original);
  });
  test('sensor unit, time alignment and missing-data preview are explicit before import', async ({ page }) => {
    await open(page);
    await page.locator('#research-source-kind').selectOption('sensor');
    await page.locator('#research-source-text').fill('time,theta1,theta2\n1000,90,0\n1100,,10\n1200,45,20');
    await page.locator('.research-import > details > summary').click();
    await page.locator('#research-time-unit').selectOption('ms');
    await page.locator('#research-angle-unit').selectOption('deg');
    await page.locator('#research-time-offset').fill('-1');
    await page.locator('#research-missing').selectOption('interpolate');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const artifact = JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'));
    expect(artifact.original.kind).toBe('sensor');
    expect(artifact.data.times[0]).toBe(0);
    expect(artifact.data.angles[0][0]).toBeCloseTo(Math.PI / 2, 12);
    expect(artifact.data.angles[1][0]).toBeCloseTo((3 * Math.PI) / 8, 12);
    expect(artifact.transform.interpolatedValues).toBe(1);
    await audit(page);
  });
  test('coordinate CSV exposes physical unit and pivot calibration in its retained history', async ({ page }) => {
    await open(page);
    await page.locator('#research-representation').selectOption('coordinates');
    await page.locator('#research-coordinate-unit').selectOption('cm');
    await page.locator('#research-coordinate-pivot-x').fill('10');
    await page.locator('#research-coordinate-pivot-y').fill('20');
    await page.locator('#research-source-text').fill('time,x1,y1,x2,y2\n0,10,120,10,220\n0.1,110,20,110,120');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const saved = JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'));
    expect(saved.transform.options.coordinateUnit).toBe('cm');
    expect(saved.transform.options.pivot).toEqual({ x: 10, y: 20 });
    expect(saved.data.angles[0]).toEqual([0, 0]);
    expect(saved.data.angles[1][0]).toBeCloseTo(Math.PI / 2, 12);
  });
  test('saved observation alone needs a new preview confirmation before parameter estimation', async ({ page }) => {
    await open(page);
    await previewAndConfirm(page);
    const saved = await download(page, '원본·변환 관측 JSON 다운로드');
    await page.reload();
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#observation-research > summary').click();
    await page
      .locator('#research-import-artifact')
      .setInputFiles({ name: 'observations.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await expect(page.getByRole('button', { name: '원본·변환 관측 JSON 다운로드', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    expect(await download(page, '원본·변환 관측 JSON 다운로드')).toBe(saved);
    const result = await run(page);
    expect(result.rows[0][1]).toBeCloseTo(9.81, 3);
  });
  test('malformed and unsupported saved JSON preserve an existing confirmed observation', async ({ page }) => {
    await open(page);
    await previewAndConfirm(page);
    const saved = await download(page, '원본·변환 관측 JSON 다운로드');
    for (const text of ['null', '{broken', '{"schema":"untrusted"}']) {
      await page
        .locator('#research-import-artifact')
        .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      await expect(page.locator('#research-error')).toBeVisible();
      expect(await download(page, '원본·변환 관측 JSON 다운로드')).toBe(saved);
    }
  });
  test('CSV upload preserves a UTF-8 BOM and rejects malformed encoding before confirmation', async ({ page }) => {
    await open(page);
    const text = '\uFEFFtime,theta1,theta2\n0,0.2,0.1\n0.1,0.18,0.09';
    await page
      .locator('#research-source-file')
      .setInputFiles({ name: 'bom.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const saved = await download(page, '원본·변환 관측 JSON 다운로드');
    expect(JSON.parse(saved).original.text).toBe(text);
    await page.locator('#research-source-file').setInputFiles({
      name: 'invalid-utf8.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([0x74, 0x69, 0x6d, 0x65, 0xff, 0xff])
    });
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#research-error')).toContainText('UTF-8');
    expect(await download(page, '원본·변환 관측 JSON 다운로드')).toBe(saved);
  });
  test('light and dark observation previews retain explicit units and source lineage', async ({ page }) => {
    await open(page);
    await page.locator('#research-source-text').fill('time,theta1,theta2\n0,0.2,0.1\n0.1,0.18,0.09');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('화면 테마', { exact: true }).selectOption(theme);
      await expect(page.locator('#research-preview')).toHaveScreenshot(`s22-observation-preview-${theme}.png`);
    }
  });
  for (const kind of ['sobol', 'pce'])
    test(`${kind} executes native runs and exports its design and diagnostics`, async ({ page }) => {
      await open(page, 0.1);
      await page.locator('#research-kind').selectOption(kind);
      await page.locator('#research-uq-count').fill('1');
      await page.locator('#research-uq-samples').fill('16');
      const result = await run(page);
      expect(result.kind).toBe(kind);
      expect(result.request.settings.samples).toBe(16);
      expect(result.request.settings.variables).toHaveLength(1);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      if (kind === 'pce') {
        await page.locator('#research-kind').selectOption('sobol');
        await page.locator('#research-import-artifact').setInputFiles({
          name: 'pce-result.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(result))
        });
        await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'restored');
        await expect(page.locator('#research-kind')).toHaveValue('pce');
        await expect(page.locator('#research-uq-count')).toHaveValue('1');
        await expect(page.locator('#research-uq-samples')).toHaveValue('16');
        const repeated = await run(page);
        expect(repeated.request.settings).toEqual(result.request.settings);
        expect(repeated.request.experiment).toEqual(result.request.experiment);
        expect(repeated.rows).toEqual(result.rows);
      }
      await audit(page);
    });
  test('long native uncertainty computation cancels without losing the confirmed observation', async ({ page }) => {
    await open(page, 0.5, 0.001);
    await previewAndConfirm(page, 'time,theta1,theta2\n0,0.4,-0.2\n0.1,0.39,-0.19');
    const original = await download(page, '원본·변환 관측 JSON 다운로드');
    await page.locator('#research-kind').selectOption('sobol');
    await page.locator('#research-uq-samples').fill('256');
    await page.locator('#research-uq-count').fill('3');
    await page.locator('#research-uq-field-2').selectOption('parameters:g');
    await page.getByRole('button', { name: '역문제 · UQ 실행', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'running');
    await page.getByRole('button', { name: '관측·계산 취소', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'cancelled');
    expect(await download(page, '원본·변환 관측 JSON 다운로드')).toBe(original);
  });
  test('local recorded video extracts actual colour markers and retains original media bytes', async ({ page }) => {
    await open(page);
    const encoded = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const context = canvas.getContext('2d')!;
      const draw = () => {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, 320, 240);
        context.fillStyle = '#ff0000';
        context.fillRect(156, 96, 9, 9);
        context.fillStyle = '#00ffff';
        context.fillRect(156, 176, 9, 9);
      };
      draw();
      const stream = canvas.captureStream(10);
      // Let the canvas capture track acquire its first painted frame before recording.
      draw();
      (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      const done = new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      recorder.start();
      const timer = setInterval(draw, 50);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      recorder.stop();
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      const bytes = new Uint8Array(await (await done).arrayBuffer());
      let binary = '';
      for (const value of bytes) binary += String.fromCharCode(value);
      return btoa(binary);
    });
    await page.locator('#research-source-kind').selectOption('video');
    await page
      .locator('#research-source-file')
      .setInputFiles({ name: 'two-markers.webm', mimeType: 'video/webm', buffer: Buffer.from(encoded, 'base64') });
    await page.locator('#research-pivot-x').fill('160');
    await page.locator('#research-pivot-y').fill('20');
    await page.locator('#research-video-samples').fill('4');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const artifact = JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'));
    expect(artifact.original.kind).toBe('video');
    expect(artifact.original.media.base64).toBe(encoded);
    expect(artifact.data.times).toHaveLength(4);
    expect(artifact.data.angles.flat().every((angle: number) => Math.abs(angle) < 0.02)).toBe(true);
  });
  test('keyboard, narrow layout and 200 percent zoom preserve the complete import flow', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#research-source-text').fill('time,theta1,theta2\n0,0.2,0.1\n0.1,0.18,0.09');
    const preview = page.getByRole('button', { name: '관측 미리보기', exact: true });
    await preview.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    const confirm = page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'confirmed');
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await audit(page);
    const saved = JSON.parse(await download(page, '원본·변환 관측 JSON 다운로드'));
    expect(saved.original.text).toBe('time,theta1,theta2\n0,0.2,0.1\n0.1,0.18,0.09');
  });
});
