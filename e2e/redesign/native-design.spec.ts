import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../src/product/adapters/physics/planar';
import { encodeShareToken } from '../../src/product/persistence/share';
import { defaultNativeDesignSettings, validateNativeDesign } from '../../src/product/lab/experiments/native-design';
import {
  parseNativeDesignQueue,
  type NativeDesignSnapshot
} from '../../src/product/lab/experiments/native-design-queue';
import type { StudyPointResponse } from '../../src/workers/chaosProtocolSchema';

test.describe('actual native multi-variable design and studyPoint UI', () => {
  async function open(page: Page) {
    const canonical = toCanonicalPlanar({ ...defaultPlanarConfig(), gamma: 0, step: 0.01, duration: 0.04 });
    if (!canonical.ok) throw new Error('native design canonical fixture');
    const token = encodeShareToken(canonical.value);
    if (!token.ok) throw new Error('native design share fixture');
    await page.goto(`/next.html#/lab/double?state=${token.value}`);
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    const panel = page.locator('.native-design');
    await panel.locator(':scope > summary').click();
    const defaults = defaultNativeDesignSettings();
    await panel.getByRole('textbox', { name: 'native 생성·예산·독립 분석 설정 JSON', exact: true }).fill(
      JSON.stringify({
        ...defaults,
        variables: undefined,
        count: 2,
        evaluation: {
          lyapunov: { dt: 0.01, steps: 64, transientSteps: 8, renormEvery: 4, seed: 123, method: 'rk4' },
          rqa: { dt: 0.01, samples: 24, sampleEvery: 2, transientSteps: 8 },
          ftleHorizon: 0.05,
          ftleDt: 0.01
        }
      })
    );
    return { panel, canonical: canonical.value };
  }
  test('generates and refines actual native points, evaluates real workers and preserves full exported outputs', async ({
    page
  }, testInfo) => {
    let nativeWorkerUrl = '';
    page.on('worker', (worker) => {
      if (/\/assets\/chaos\.worker-[^/]+\.js$|\/src\/workers\/chaos\.worker\.ts$/.test(new URL(worker.url()).pathname))
        nativeWorkerUrl = worker.url();
    });
    const { panel, canonical } = await open(page);
    await panel.getByRole('button', { name: '현재 원본에서 native 설계 생성', exact: true }).click();
    await expect(panel).toHaveAttribute('data-design-status', 'ready');
    const evaluated = [
      { values: { theta1: 0.8 }, lambdaMax: -0.2, lambdaStdError: 0.01 },
      { values: { theta1: 1 }, lambdaMax: 0.2, lambdaStdError: 0.02 },
      { values: { theta1: 1.2 }, lambdaMax: 0.4, lambdaStdError: 0.2 }
    ];
    await panel
      .getByRole('textbox', { name: '외부 λ·SE 평가점 JSON (values, lambdaMax, lambdaStdError)', exact: true })
      .fill(JSON.stringify(evaluated));
    await panel
      .getByRole('textbox', { name: '외부 λ·SE 실제 출처', exact: true })
      .fill('Declared reference fixture: sign crossing and block-SE resampling');
    await panel.getByRole('textbox', { name: 'refinement 최대 추가 점 수', exact: true }).fill('2');
    for (const kind of ['adaptive', 'boundary', 'uncertainty'])
      await panel.getByRole('button', { name: `native ${kind} refinement 추가`, exact: true }).click();
    await expect(panel.getByRole('alert')).toBeHidden();
    await panel.getByRole('button', { name: 'native λ·RQA·FTLE 실행·재개', exact: true }).click();
    await expect(panel).toHaveAttribute('data-design-status', 'completed');
    await expect(panel.getByRole('status')).toContainText('native Worker');
    const downloading = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'native 설계 입력·전체 결과·재개 JSON 저장', exact: true }).click();
    const download = await downloading,
      path = await download.path();
    const saved = parseNativeDesignQueue(await readFile(path!, 'utf8'));
    expect(saved.plan.source).toEqual(canonical);
    expect(saved.plan.refinements.map((r) => r.kind)).toEqual(['adaptive', 'boundary', 'uncertainty']);
    expect(saved.plan.points.some((p) => p.origin === 'adaptive')).toBe(true);
    expect(saved.plan.points.some((p) => p.origin === 'boundary')).toBe(true);
    expect(saved.plan.points.some((p) => p.origin === 'uncertainty')).toBe(true);
    expect(validateNativeDesign(saved.plan)).toEqual(saved.plan);
    for (let i = 0; i < saved.runs.length; i++) {
      expect(nativeWorkerUrl).not.toBe('');
      const actual = saved.runs[i]!.result!;
      // V2 JobClient composition versus the unchanged bare native handler in
      // the same browser/libm. No cross-runtime Lyapunov tolerance is widened.
      const reference = await page.evaluate(
        ({ url, request }) =>
          new Promise<StudyPointResponse>((resolve, reject) => {
            const worker = new Worker(url, { type: 'module' });
            const timer = setTimeout(() => {
              worker.terminate();
              reject(new Error('bare native reference timed out'));
            }, 5000);
            worker.onmessage = (event) => {
              clearTimeout(timer);
              worker.terminate();
              resolve(event.data as StudyPointResponse);
            };
            worker.onerror = () => {
              clearTimeout(timer);
              worker.terminate();
              reject(new Error('bare native reference worker failed'));
            };
            worker.postMessage(request);
          }),
        { url: nativeWorkerUrl, request: saved.plan.points[i]!.request! }
      );
      expect(actual).toEqual(reference);
    }
    const retained = testInfo.outputPath('native-design-complete.json');
    await download.saveAs(retained);
    await testInfo.attach('native-design-complete-export', { path: retained, contentType: 'application/json' });
    await panel.getByRole('button', { name: '설계의 정확한 조건을 일반 요약 큐로 열기', exact: true }).click();
    await expect(panel.locator('.legacy-run-list')).toBeVisible();
    await expect(panel).toContainText('일반 표본 요약');
    await panel.getByRole('button', { name: '현재 원본에서 native 설계 생성', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'native 설계 실행 취소', exact: true })).toBeDisabled();
    await panel.getByLabel('native 설계 재개 JSON 가져오기', { exact: true }).setInputFiles(path!);
    await expect(panel).toHaveAttribute('data-design-status', 'completed');
    const reexport = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'native 설계 입력·전체 결과·재개 JSON 저장', exact: true }).click();
    expect(parseNativeDesignQueue(await readFile((await (await reexport).path())!, 'utf8'))).toEqual(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
  test('refuses damping substitution and corrupt resumed inputs while preserving the completed state', async ({
    page
  }) => {
    const { panel } = await open(page);
    await panel
      .getByRole('textbox', { name: 'native 설계 변수 JSON', exact: true })
      .fill('[{"key":"damping","min":0.1,"max":0.2}]');
    await panel.getByRole('button', { name: '현재 원본에서 native 설계 생성', exact: true }).click();
    await panel.getByRole('button', { name: 'native λ·RQA·FTLE 실행·재개', exact: true }).click();
    await expect(panel).toHaveAttribute('data-design-status', 'partial');
    await expect(panel.locator('pre')).toContainText('γ>0');
    const downloading = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'native 설계 입력·전체 결과·재개 JSON 저장', exact: true }).click();
    const raw = JSON.parse(await readFile((await (await downloading).path())!, 'utf8')) as NativeDesignSnapshot;
    expect(raw.workConsumed).toBe(0);
    expect(raw.plan.points.every((p) => p.request === null)).toBe(true);
    Reflect.set(raw.plan.points[0]!.experiment, 'parameters', {
      ...raw.plan.points[0]!.experiment.parameters,
      gamma: { kind: 'scalar', value: 0, unit: 'kg*m^2/s' }
    });
    await panel.getByLabel('native 설계 재개 JSON 가져오기', { exact: true }).setInputFiles({
      name: 'changed-native-design.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(raw))
    });
    await expect(panel.getByRole('alert')).toContainText('맞지 않습니다');
    await expect(panel).toHaveAttribute('data-design-status', 'partial');
  });
});
