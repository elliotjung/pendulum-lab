import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface CaptureProbe {
  motionRequests: number;
  cameraRequests: number;
  stops: number;
  mode: 'granted' | 'denied' | 'pending';
  motionMode: 'granted' | 'pending';
  constraints?: MediaStreamConstraints;
  resolveCamera?(): void;
  resolveMotion?(): void;
}
type CaptureWindow = Window & { __s28Capture: CaptureProbe };
async function fixtures(page: Page) {
  await page.addInitScript(() => {
    const probe: CaptureProbe = {
      motionRequests: 0,
      cameraRequests: 0,
      stops: 0,
      mode: 'granted',
      motionMode: 'granted'
    };
    Object.assign(window, { __s28Capture: probe });
    Object.defineProperty(window, 'DeviceMotionEvent', {
      configurable: true,
      value: Object.assign(function FixtureDeviceMotionEvent() {}, {
        requestPermission: () => {
          probe.motionRequests++;
          return probe.motionMode === 'pending'
            ? new Promise<'granted'>((resolve) => {
                probe.resolveMotion = () => resolve('granted');
              })
            : Promise.resolve('granted');
        }
      })
    });
    function stream() {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d')!;
      function paint() {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, 16, 16);
        context.fillStyle = '#f0141e';
        context.fillRect(7, 6, 3, 3);
        context.fillStyle = '#0adce6';
        context.fillRect(7, 11, 3, 3);
      }
      paint();
      const stream = canvas.captureStream(30);
      const timer = setInterval(paint, 30);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          probe.stops++;
          clearInterval(timer);
          stop();
        };
      }
      return stream;
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: (constraints: MediaStreamConstraints) => {
        probe.cameraRequests++;
        probe.constraints = constraints;
        if (probe.mode === 'denied')
          return Promise.reject(new DOMException('fixture permission denied', 'NotAllowedError'));
        if (probe.mode === 'pending')
          return new Promise<MediaStream>((resolve) => {
            probe.resolveCamera = () => resolve(stream());
          });
        return Promise.resolve(stream());
      }
    });
  });
}
async function open(page: Page) {
  await page.goto('/next.html#/lab/double');
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '분석', exact: true }).click();
  await page.locator('#observation-research > summary').click();
  await page.locator('#research-live-capture > summary').click();
  await expect(page.locator('#research-capture-kind')).toBeVisible();
}
async function dispatch(page: Page, rows: readonly (readonly [number, number, number])[]) {
  await page.evaluate((rows) => {
    for (const [timeStamp, velocity, y] of rows) {
      const event = new Event('devicemotion');
      Object.defineProperties(event, {
        timeStamp: { value: timeStamp },
        accelerationIncludingGravity: { value: { x: 0, y, z: 1 } },
        rotationRate: { value: { alpha: 0, beta: velocity, gamma: velocity } }
      });
      window.dispatchEvent(event);
    }
  }, rows);
}
async function start(page: Page) {
  await page.getByRole('button', { name: '새 채집 시작 · 이전 채집 교체', exact: true }).click();
}
async function stop(page: Page) {
  await page.getByRole('button', { name: '장치 채집 중지 · 권한 대기 취소', exact: true }).click();
}
async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const artifact = await pending;
  expect(await artifact.failure()).toBeNull();
  return JSON.parse(await readFile((await artifact.path())!, 'utf8'));
}
async function cameraSettings(page: Page) {
  await page.locator('#research-capture-kind').selectOption('camera');
  await page.locator('#research-capture-pivot-x').fill('8');
  await page.locator('#research-capture-pivot-y').fill('2');
  await page.locator('#research-capture-color-first').fill('#f0141e');
  await page.locator('#research-capture-color-second').fill('#0adce6');
  await page.locator('#research-capture-tolerance').fill('20');
}
test.describe('S28 opt-in native live capture with deterministic permission and media fixtures', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on('pageerror', (error) => list.push(error.message));
    await fixtures(page);
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
  test('requests no hardware automatically and sends exact native IMU CSV through separate S22 preview and confirmation', async ({
    page
  }) => {
    await open(page);
    expect(await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.motionRequests)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.cameraRequests)).toBe(0);
    const mass = await page.locator('#lab-field-m1').inputValue();
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'streaming');
    await dispatch(page, [
      [1000, 10, 1],
      [1100, 20, 0.5],
      [1200, 30, 0]
    ]);
    await stop(page);
    const original = await download(page, '채집 원본 CSV·보정 JSON 다운로드');
    expect(original.source).toBe('native-imu');
    expect(original.metadata.schemaVersion).toBe('pendulum-imu-capture/v1');
    expect(original.metadata.sampling.samples).toBe(3);
    expect(original.csv.split('\n')[0]).toBe('time,angle,angular_velocity,angular_acceleration');
    await page.getByRole('button', { name: '채집 관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    await expect(page.getByRole('button', { name: '원본·변환 관측 JSON 다운로드', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const artifact = await download(page, '원본·변환 관측 JSON 다운로드');
    expect(artifact.original.text).toBe(original.csv);
    expect(artifact.original.capture.nativeMetadata).toEqual(original.metadata);
    expect(artifact.data.times).toEqual([0, 0.1, 0.2]);
    expect(artifact.data.angles.map((row: number[]) => row.length)).toEqual([1, 1, 1]);
    expect(await page.locator('#lab-field-m1').inputValue()).toBe(mass);
  });
  test('excludes calibration samples and cancels late IMU permission without attaching live listeners', async ({
    page
  }) => {
    await open(page);
    await start(page);
    await dispatch(page, [
      [1000, 10, 1],
      [1100, 10, 1]
    ]);
    await page.getByRole('button', { name: 'IMU 정지 자세 보정 · 이전 표본 제외', exact: true }).click();
    await dispatch(page, [
      [2000, 10, 1],
      [2100, 10, 1]
    ]);
    await stop(page);
    const original = await download(page, '채집 원본 CSV·보정 JSON 다운로드');
    expect(original.metadata.calibration.angleOffset).toBeCloseTo(Math.PI / 4, 12);
    expect(original.metadata.calibration.angularVelocityBias).toBeCloseTo(Math.PI / 18, 12);
    expect(original.csv.split('\n')).toHaveLength(3);
    expect(original.csv).toContain('0.00000000000,0.00000000000,0.00000000000');
    await page.evaluate(() => {
      (window as unknown as CaptureWindow).__s28Capture.motionMode = 'pending';
    });
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'requesting');
    await stop(page);
    await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.resolveMotion!());
    await dispatch(page, [
      [3000, 100, 0],
      [3100, 100, 0]
    ]);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'stopped');
    await expect(page.locator('#research-capture-count')).toContainText('현재 채집 0표본');
    expect((await download(page, '채집 원본 CSV·보정 JSON 다운로드')).csv).toBe(original.csv);
  });
  test('tracks actual Canvas MediaStream pixels through the native camera controller and preserves derived-source provenance', async ({
    page
  }) => {
    await open(page);
    await cameraSettings(page);
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'streaming');
    await expect
      .poll(async () =>
        Number((await page.locator('#research-capture-count').innerText()).match(/현재 채집 (\d+)/)![1])
      )
      .toBeGreaterThanOrEqual(2);
    await stop(page);
    const original = await download(page, '채집 원본 CSV·보정 JSON 다운로드');
    expect(original.source).toBe('native-camera-markers');
    expect(original.metadata.frame).toEqual({ width: 16, height: 16 });
    expect(original.metadata.quality.trackedFrames).toBeGreaterThanOrEqual(2);
    expect(
      original.csv
        .split('\n')
        .slice(1)
        .every((row: string) =>
          row
            .split(',')
            .slice(1)
            .every((angle) => Number(angle) === 0)
        )
    ).toBe(true);
    const probe = await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture);
    expect(probe.stops).toBe(1);
    expect(probe.constraints!.audio).toBe(false);
    await page.getByRole('button', { name: '채집 관측 미리보기', exact: true }).click();
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const artifact = await download(page, '원본·변환 관측 JSON 다운로드');
    expect(artifact.original.kind).toBe('sensor');
    expect(artifact.original.media).toBeUndefined();
    expect(artifact.original.capture).toMatchObject({
      source: 'native-camera-markers',
      nativeMetadata: original.metadata,
      originalVideoRecorded: false
    });
    expect(artifact.original.text).toBe(original.csv);
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'streaming');
    await page.getByRole('link', { name: '배우기', exact: true }).first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.stops)).toBe(2);
  });
  test('recovers from camera denial and releases late permission tracks after stop and route disposal', async ({
    page
  }) => {
    await open(page);
    await cameraSettings(page);
    await page.evaluate(() => {
      (window as unknown as CaptureWindow).__s28Capture.mode = 'denied';
    });
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'denied');
    await page.evaluate(() => {
      (window as unknown as CaptureWindow).__s28Capture.mode = 'pending';
    });
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'requesting');
    await stop(page);
    await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.resolveCamera!());
    await expect.poll(() => page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.stops)).toBe(1);
    await start(page);
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'requesting');
    await page.getByRole('link', { name: '배우기', exact: true }).first().click();
    await page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.resolveCamera!());
    await expect.poll(() => page.evaluate(() => (window as unknown as CaptureWindow).__s28Capture.stops)).toBe(2);
  });
  test('supports keyboard, narrow-screen access and full axe while closing the tool releases active sensors', async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    await start(page);
    await dispatch(page, [
      [1000, 10, 1],
      [1100, 10, 1]
    ]);
    const summary = page.locator('#research-live-capture > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'stopped');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '채집 관측 미리보기', exact: true })).toBeEnabled();
    await expect(page.locator('#research-live-capture')).toContainText('카메라 원본 영상·오디오는 녹화하지 않으며');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(
      result.violations.map((entry) => ({ id: entry.id, targets: entry.nodes.map((node) => node.target) }))
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await start(page);
    await dispatch(page, [
      [2000, 10, 1],
      [2100, 10, 1]
    ]);
    await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
    await expect(page.locator('[data-capture-state]')).toHaveAttribute('data-capture-state', 'stopped');
  });
});
