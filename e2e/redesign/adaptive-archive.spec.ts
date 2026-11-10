import { expect, test } from '@playwright/test';
import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { replayAcceptedSteps } from '../../src/physics/adaptive';
import { createPlanarSimulation } from '../../src/product/adapters/physics/planar';
import { extendedConfig } from '../../src/product/experiments/extended-config';
import type { ExtendedResult } from '../../src/product/experiments/extended-results';

const read = promisify(readFile);
const nativeReferenceBundle = buildSync({
  entryPoints: [resolve(import.meta.dirname, './fixtures/adaptive-native-reference.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022'
}).outputFiles[0]!.text;
const bounds = JSON.parse(readFileSync('tests/characterization/numerical-golden.fixture.json', 'utf8')).tolerance
  .numeric as {
  absolute: number;
  relative: number;
};
/** Node replay retains S01 bounds; controller schedules are compared exactly within the browser. */
function compareNative(actual: unknown, expected: unknown): number {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    const value = actual as number,
      error = Math.abs(value - expected);
    expect(error).toBeLessThanOrEqual(
      bounds.absolute + bounds.relative * Math.max(Math.abs(value), Math.abs(expected))
    );
    return error;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    return Math.max(0, ...expected.map((value, i) => compareNative((actual as unknown[])[i], value)));
  }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
    return Math.max(
      0,
      ...Object.entries(expected).map(([key, value]) => compareNative((actual as Record<string, unknown>)[key], value))
    );
  }
  expect(actual).toBe(expected);
  return 0;
}

test.describe('S28 complete adaptive controller export', () => {
  for (const unitId of ['2.3', '2.7']) {
    test(`${unitId}: exports every accepted native step beyond400 and replays every adaptive call`, async ({
      page
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/adaptive-native-reference.js', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/javascript',
          body: nativeReferenceBundle
        })
      );
      await page.goto(`/next.html#/learn/course-2/${unitId}`);
      const focus = page.locator('.focus-experiment');
      await expect(focus).toHaveAttribute('data-focus-status', 'idle');
      await page.locator('#focus-duration').fill('8');
      await page.locator('#focus-tolerance').fill('0.000000001');
      await page.getByRole('button', { name: '실험 실행', exact: true }).click();
      await expect(focus).toHaveAttribute('data-focus-status', 'completed');
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: '실험 결과 JSON 내보내기', exact: true }).click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      const bytes = await read((await download.path())!);
      await testInfo.attach(download.suggestedFilename(), { body: bytes, contentType: 'application/json' });
      await testInfo.attach('adaptive-native-reference.js', {
        body: nativeReferenceBundle,
        contentType: 'text/javascript'
      });
      const result = JSON.parse(bytes.toString('utf8')) as ExtendedResult,
        archive = result.adaptiveArchive!;
      expect(result.unitId).toBe(unitId);
      expect(result.fields.duration).toBe(8);
      expect(result.fields.tolerance).toBe(1e-9);
      expect(archive.schema).toBe('pendulum-adaptive-replay/v1');
      expect(archive.scope).toBe('all-adaptive-calls');
      expect(archive.runs.map((run) => run.id)).toEqual(
        unitId === '2.3' ? ['main'] : ['main', 'reference', 'tolerance-0', 'tolerance-1', 'tolerance-2']
      );
      const source = extendedConfig(unitId, result.fields);
      if (source.family !== 'planar') throw new Error('Expected original planar RHS.');
      const browserReference = await page.evaluate(
        async ({ archive, parameters, gamma }) => {
          const url = '/adaptive-native-reference.js',
              native = (await import(url)) as typeof import('./fixtures/adaptive-native-reference'),
            rhs = native.createDoublePendulumDerivative(parameters, gamma);
          return archive.runs.map((run) => {
            const direct = native.integrateAdaptive(Float64Array.from(run.initialState), 8, rhs, run.options),
              replay = native.replayAcceptedSteps(Float64Array.from(run.initialState), rhs, run.result.acceptedSteps);
            return {
              direct: { ...direct, y: Array.from(direct.y) },
              replay: { y: Array.from(replay.y), finalTime: replay.finalTime }
            };
          });
        },
        { archive, parameters: source.config.parameters, gamma: source.config.gamma }
      );
      const mainOptions = {
          absTol: 1e-9,
          relTol: 1e-9,
          initialDt: result.fields.step!,
          maxDt: 0.1,
          minDt: 1e-8,
          maxIterations: 20000
        },
        options = [
          mainOptions,
          ...(unitId === '2.7'
            ? [
                { ...mainOptions, absTol: 1e-11, relTol: 1e-11, maxDt: 0.05, minDt: 1e-9 },
                ...[Math.min(1e-3, 1e-9 * 10), 1e-9, Math.max(1e-10, 1e-9 / 10)].map((tolerance) => ({
                  ...mainOptions,
                  absTol: tolerance,
                  relTol: tolerance
                }))
              ]
            : [])
        ];
      let maximumAbsolute = 0;
      for (const [i, run] of archive.runs.entries()) {
        expect(run.initialState).toEqual(source.config.initialState);
        expect(run.options).toEqual(options[i]);
        const native = createPlanarSimulation(source.config),
          replay = replayAcceptedSteps(
            Float64Array.from(run.initialState),
            native.derivative,
            run.result.acceptedSteps
          );
        expect(run.result).toEqual(browserReference[i]!.direct);
        expect(browserReference[i]!.replay).toEqual({ y: run.result.y, finalTime: run.result.finalTime });
        maximumAbsolute = Math.max(maximumAbsolute, compareNative(Array.from(replay.y), run.result.y));
        expect(replay.finalTime).toBe(8);
        expect(run.result.acceptedSteps.at(-1)?.endTime).toBe(8);
      }
      const main = archive.runs[0]!.result,
        projection = result.tables.find((table) => table.id === 'adaptive-steps')!;
      expect(main.acceptedSteps.length).toBeGreaterThan(400);
      expect(projection.rows).toHaveLength(400);
      expect(projection.rows).toEqual(
        main.acceptedSteps
          .slice(0, 400)
          .map((step) => [step.index, step.startTime, step.endTime, step.dt, step.errorNorm])
      );
      await expect(
        focus.getByText('실제 수락된 adaptive 단계 (최대 400개 표시) · 400행', { exact: true })
      ).toBeVisible();
      expect(result.canonical.integrator).toMatchObject({ kind: 'selectable', id: 'integrator:rk4' });
      testInfo.annotations.push({
        type: 'cross-runtime-numeric-error',
        description: JSON.stringify({
          maximumAbsolute,
          bounds,
          accepted: archive.runs.map((run) => ({ id: run.id, count: run.result.accepted }))
        })
      });
      expect(errors).toEqual([]);
    });
  }
});
