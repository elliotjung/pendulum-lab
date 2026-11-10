import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import {
  runDoublePendulumEnsemble,
  ensembleStatistics,
  compareEnsembleStatistics
} from '../../src/runtime/gpuEnsemble';
import { runDoublePendulumEnsembleWasm } from '../../src/runtime/wasmEnsemble';
import { buildNChainJacobianTapeWasm } from '../../src/runtime/wasmNChain';
import { fromCanonicalPlanar } from '../../src/product/adapters/physics/planar';
import { fromCanonicalChain } from '../../src/product/adapters/physics/chain';
import type { RuntimeAccelerationResult } from '../../src/product/adapters/physics/runtime-acceleration';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
const numeric = (
  JSON.parse(
    readFileSync(new URL('../../tests/characterization/numerical-golden.fixture.json', import.meta.url), 'utf8')
  ) as { tolerance: { numeric: { absolute: number; relative: number } } }
).tolerance.numeric;
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const item = await pending;
  expect(await item.failure()).toBeNull();
  return readFile((await item.path())!, 'utf8');
}
function compare(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  let max = 0;
  actual.forEach((value, index) => {
    const error = Math.abs(value - expected[index]!);
    max = Math.max(max, error);
    expect(error).toBeLessThanOrEqual(numeric.absolute + numeric.relative * Math.abs(expected[index]!));
  });
  return max;
}
function difference(a: readonly number[], b: readonly number[]) {
  return Math.max(0, ...a.map((value, index) => Math.abs(value - b[index]!)));
}
test.describe('S28 actual native runtime capability and backend execution', () => {
  for (const system of ['double', 'triple', 'chain', 'compound-double'] as const)
    test(`${system}: actual backend, independent native oracle, explicit fallback and cancellation`, async ({
      page
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/next.html#/lab/${system}`);
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      const sourceText = await download(page, '상태 JSON 다운로드'),
        source = JSON.parse(sourceText) as ExperimentStateV1;
      await page.getByRole('tab', { name: '분석', exact: true }).click();
      const panel = page.locator('#runtime-acceleration');
      await expect(panel).toBeVisible();
      await panel.locator('#runtime-dt').fill('0.0015');
      if (system === 'double') {
        await panel.locator('#runtime-gridSize').fill('2');
        await panel.locator('#runtime-steps').fill('2');
      }
      if (system === 'chain' || system === 'triple') {
        await panel.locator('#runtime-renormEvery').fill('1');
        await panel.locator('#runtime-forwardTransient').fill('0');
        await panel.locator('#runtime-window').fill('2');
      }
      await panel.getByRole('button', { name: 'native backend 실행·CPU 비교', exact: true }).click();
      let maxOracleAbsolute = 0,
        backend = 'unsupported-model',
        wasmBackend = 'unsupported-model';
      if (system === 'compound-double') {
        await expect(panel.getByRole('alert')).toContainText('점질량 이중진자');
        await expect(panel.getByRole('button', { name: 'backend 비교 JSON 다운로드', exact: true })).toBeDisabled();
      } else {
        await expect(panel.getByRole('status')).toHaveText(
          'native backend 비교 완료 · 실제 반환 backend를 확인하세요.'
        );
        const result = JSON.parse(await download(page, 'backend 비교 JSON 다운로드')) as RuntimeAccelerationResult;
        expect(result.experiment).toEqual(source);
        expect(result.settings.forceCpu).toBe(false);
        expect(result.warnings.join(' ')).toContain('물리 GPU·속도 향상을 인증하지 않습니다');
        if (result.kind === 'double-ensemble') {
          const checked = fromCanonicalPlanar(source);
          if (!checked.ok) throw new Error('config');
          const c = checked.value,
            oracle = await runDoublePendulumEnsemble(
              c.parameters,
              result.initialStates,
              { dt: result.settings.dt, steps: result.settings.steps, forceCpu: true },
              c.gamma
            );
          maxOracleAbsolute = compare(result.cpuOracle.states, [...oracle.states]);
          backend = result.gpu.backend;
          wasmBackend = result.wasm.backend;
          expect(['webgpu', 'cpu']).toContain(backend);
          expect(['wasm', 'cpu']).toContain(wasmBackend);
          expect(result.gpuStateDifference.maxAbsolute).toBe(difference(result.gpu.states, result.cpuOracle.states));
          expect(result.wasmStateDifference.maxAbsolute).toBe(difference(result.wasm.states, result.cpuOracle.states));
          const stats = compareEnsembleStatistics(
            ensembleStatistics(Float64Array.from(result.gpu.states)),
            ensembleStatistics(Float64Array.from(result.cpuOracle.states))
          );
          expect(result.gpuStatisticsComparison.tolerances).toEqual(stats.tolerances);
          expect(result.gpuStatisticsComparison.passed).toBe(stats.passed);
          if (backend === 'cpu') expect(result.gpu.states).toEqual(result.cpuOracle.states);
          if (wasmBackend === 'wasm') {
            const native = await runDoublePendulumEnsembleWasm(c.parameters, c.gamma, result.initialStates, {
              dt: result.settings.dt,
              steps: result.settings.steps
            });
            expect(native.backend).toBe('wasm');
            maxOracleAbsolute = Math.max(maxOracleAbsolute, compare(result.wasm.states, [...native.states]));
          } else expect(result.wasm.states).toEqual(result.cpuOracle.states);
          await expect(panel.getByRole('region', { name: '실제 native backend 비교 결과' })).toContainText(
            `GPU 요청 실제 backend: ${backend}`
          );
        } else {
          const checked = fromCanonicalChain(source);
          if (!checked.ok) throw new Error('config');
          const c = checked.value;
          backend = result.backend;
          wasmBackend = result.backend;
          expect(result.promoted).toBe(false);
          expect(result.tapeDifference.maxAbsolute).toBe(difference(result.tape, result.cpuTape));
          if (backend === 'wasm-simd') {
            const native = await buildNChainJacobianTapeWasm(c.parameters, c.initialState, c.gamma, result.settings);
            expect(native.backend).toBe('wasm-simd');
            expect(result.abiVersion).toBe(2);
            maxOracleAbsolute = compare(result.tape, [...native.tape]);
          } else {
            expect(result.tape).toEqual(result.cpuTape);
            expect(result.abiVersion).toBeNull();
          }
          await expect(panel.getByRole('region', { name: '실제 native backend 비교 결과' })).toContainText(
            'promoted:false'
          );
        }
        await panel.locator('#runtime-force-cpu').check();
        await panel.getByRole('button', { name: 'native backend 실행·CPU 비교', exact: true }).click();
        await expect(panel.getByRole('status')).toHaveText(
          'native backend 비교 완료 · 실제 반환 backend를 확인하세요.'
        );
        const forcedText = await download(page, 'backend 비교 JSON 다운로드'),
          forced = JSON.parse(forcedText) as RuntimeAccelerationResult;
        expect(forced.settings.forceCpu).toBe(true);
        expect(forced.experiment).toEqual(source);
        if (forced.kind === 'double-ensemble') {
          expect(forced.gpu.backend).toBe('cpu');
          expect(forced.wasm.backend).toBe('cpu');
          expect(forced.gpuStateDifference).toMatchObject({ maxAbsolute: 0, exactEqual: true });
          expect(forced.wasmStateDifference).toMatchObject({ maxAbsolute: 0, exactEqual: true });
        } else {
          expect(forced.backend).toBe('cpu');
          expect(forced.tapeDifference).toMatchObject({ maxAbsolute: 0, exactEqual: true });
          expect(forced.promoted).toBe(false);
        }
        await panel.evaluate((node) => {
          const buttons = [...node.querySelectorAll('button')],
            start = buttons.find((button) => button.textContent === 'native backend 실행·CPU 비교'),
            cancel = buttons.find((button) => button.textContent === 'backend 비교 취소');
          if (!start || !cancel) throw new Error('buttons');
          start.click();
          cancel.click();
        });
        await expect(panel.getByRole('status')).toHaveText('backend 비교 취소됨 · 마지막 완료 결과를 유지합니다.');
        expect(await download(page, 'backend 비교 JSON 다운로드')).toBe(forcedText);
        await panel.locator('#runtime-dt').fill('0');
        await panel.getByRole('button', { name: 'native backend 실행·CPU 비교', exact: true }).click();
        await expect(panel.getByRole('alert')).toContainText('범위의 유한한 수');
        expect(await download(page, 'backend 비교 JSON 다운로드')).toBe(forcedText);
      }
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(audit.violations.map((entry) => entry.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      expect(await download(page, '상태 JSON 다운로드')).toBe(sourceText);
      expect(errors).toEqual([]);
      test.info().annotations.push({
        type: 'native-runtime-backend',
        description: JSON.stringify({ backend, wasmBackend, maxOracleAbsolute })
      });
    });
});
