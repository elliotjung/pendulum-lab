import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { energyDriftProfile } from '../../src/research/structurePreservation';
import { createDoublePendulumDerivative, energyDouble } from '../../src/physics/double';
import { createCompoundDoublePendulumDerivative, energyCompoundDouble } from '../../src/physics/compoundDouble';
import { createTripleRhsWorkspace, rhsTriple } from '../../src/physics/triple';
import { energyTriple } from '../../src/physics/energy';
import { createChainWorkspace, energyChain, rhsChain } from '../../src/physics/nPendulum';
import {
  canonicalRhs,
  implicitMidpointCanonical,
  canonicalStepThetaOmega,
  omegaToMomentum
} from '../../src/physics/canonical';
import { compareDoublePendulumFormulations } from '../../src/validation/formulationEquivalence';
import type { Derivative } from '../../src/physics/types';
import { fromCanonicalPlanar, type PlanarConfig } from '../../src/product/adapters/physics/planar';
import { fromCanonicalChain, type ChainConfig } from '../../src/product/adapters/physics/chain';
import { nativeOdeMethod } from '../../src/product/adapters/physics/planar-integrators';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import type {
  StructureEnergyResult,
  StructureCanonicalResult
} from '../../src/product/adapters/physics/structure-diagnostics';

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
function config(source: ExperimentStateV1) {
  const checked =
    source.systemId === 'system:double' || source.systemId === 'system:compound-double'
      ? fromCanonicalPlanar(source)
      : fromCanonicalChain(source);
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  return checked.value;
}
function nativeEnergy(source: ExperimentStateV1, settings: StructureEnergyResult['settings']) {
  const input = config(source);
  let rhs: Derivative, energy: (state: Float64Array) => number;
  if (input.systemId === 'system:double' || input.systemId === 'system:compound-double') {
    const p = input as PlanarConfig;
    rhs = (p.systemId === 'system:double' ? createDoublePendulumDerivative : createCompoundDoublePendulumDerivative)(
      p.parameters,
      0
    );
    energy = (state) =>
      (p.systemId === 'system:double' ? energyDouble : energyCompoundDouble)(state, p.parameters).total;
  } else {
    const c = input as ChainConfig;
    if (c.systemId === 'system:triple') {
      const { masses: m, lengths: l, g } = c.parameters,
        p = { m1: m[0]!, m2: m[1]!, m3: m[2]!, l1: l[0]!, l2: l[1]!, l3: l[2]!, g },
        workspace = createTripleRhsWorkspace();
      rhs = (state, out) => rhsTriple(state, p, 0, out, workspace);
      energy = (state) => energyTriple(state, p).total;
    } else {
      const workspace = createChainWorkspace(c.parameters.masses.length);
      rhs = (state, out) => rhsChain(state, c.parameters, 0, out, workspace);
      energy = (state) => energyChain(state, c.parameters).total;
    }
  }
  return energyDriftProfile({
    ...settings,
    method: nativeOdeMethod(input.integratorId),
    initialState: input.initialState,
    rhs,
    energy
  });
}
function close(actual: unknown, expected: unknown): number {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    const error = Math.abs((actual as number) - expected);
    expect(error).toBeLessThanOrEqual(numeric.absolute + numeric.relative * Math.abs(expected));
    return error;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect(actual).toHaveLength(expected.length);
    return Math.max(0, ...expected.map((value, i) => close((actual as unknown[])[i], value)));
  }
  if (expected !== null && typeof expected === 'object') {
    expect(actual).not.toBeNull();
    expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
    return Math.max(
      0,
      ...Object.entries(expected).map(([key, value]) => close((actual as Record<string, unknown>)[key], value))
    );
  }
  expect(actual).toEqual(expected);
  return 0;
}
test.describe('S28 native structure diagnostic production worker', () => {
  for (const [system, method] of [
    ['double', 'hmidpoint'],
    ['compound-double', 'gauss2'],
    ['triple', 'verlet'],
    ['chain', 'bdf2']
  ] as const)
    test(`${system}: exact native energy profile, independent source and guarded canonical scope`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/next.html#/lab/${system}`);
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await page.getByRole('tab', { name: '조건', exact: true }).click();
      await page
        .locator(system === 'double' || system === 'compound-double' ? '#lab-integrator' : '#chain-integrator')
        .selectOption(`integrator:${method}`);
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      const sourceText = await download(page, '상태 JSON 다운로드'),
        source = JSON.parse(sourceText) as ExperimentStateV1;
      expect(source.integrator).toMatchObject({ id: `integrator:${method}` });
      await page.getByRole('tab', { name: '분석', exact: true }).click();
      const section = page.locator('#structure-diagnostics');
      await expect(section).toBeVisible();
      await section.locator('#structure-dt').fill('0.001');
      await section.locator('#structure-totalTime').fill('0.03');
      await section.locator('#structure-samples').fill('3');
      await section.locator('#structure-tolerance').fill('1e-10');
      await section.getByRole('button', { name: '에너지 드리프트 프로필 계산', exact: true }).click();
      await expect(section.getByRole('status')).toHaveText('에너지 프로필 계산 완료 · 독립 native 진단');
      const resultText = await download(page, '에너지 프로필 JSON 다운로드'),
        result = JSON.parse(resultText) as StructureEnergyResult;
      expect(result.experiment).toEqual(source);
      expect(result.settings).toEqual({ dt: 0.001, totalTime: 0.03, samples: 3, tolerance: 1e-10 });
      expect(result.acceptance).toEqual({
        policy: 'raw-native-no-retry',
        steps: 30,
        acceptedSteps: 30,
        rejectedSteps: 0
      });
      const maximumEnergyAbsolute = close(result.profile, nativeEnergy(source, result.settings));
      expect(result.warnings.join(' ')).toContain('증명하지 않습니다');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      let maximumCanonicalAbsolute = 0;
      await section.getByRole('button', { name: '정준 RHS·한 단계·좌표 비교', exact: true }).click();
      if (system === 'double') {
        await expect(section.getByRole('status')).toHaveText('정준 함수·좌표 비교 계산 완료 · 독립 native 진단');
        const canonical = JSON.parse(await download(page, '정준 비교 JSON 다운로드')) as StructureCanonicalResult,
          c = config(source) as PlanarConfig,
          settings = canonical.settings,
          initial = omegaToMomentum(c.initialState, c.parameters),
          midpoint = implicitMidpointCanonical(
            initial,
            settings.dt,
            c.parameters,
            0,
            settings.tolerance,
            settings.maxIterations
          ),
          theta = canonicalStepThetaOmega(c.initialState, settings.dt, c.parameters, 0),
          compared = compareDoublePendulumFormulations({
            parameters: c.parameters,
            initialState: c.initialState,
            dt: settings.dt,
            horizon: settings.horizon,
            gamma: 0,
            comparisonPolicy: settings.comparisonPolicy
          });
        expect(canonical.experiment).toEqual(source);
        expect(canonical.rhs.source).toBe('canonicalRhs');
        maximumCanonicalAbsolute = Math.max(
          close(canonical.rhs.value, [...canonicalRhs(initial, c.parameters, 0)]),
          close(canonical.midpoint, {
            source: 'implicitMidpointCanonical',
            state: [...midpoint.state],
            stats: midpoint.stats
          }),
          close(canonical.thetaOmegaStep, {
            source: 'canonicalStepThetaOmega',
            state: [...theta.state],
            stats: theta.stats,
            tolerance: 1e-10,
            maxIterations: 12
          }),
          close(canonical.coordinateComparison.result, {
            ...compared,
            finalThetaOmega: [...compared.finalThetaOmega],
            finalCanonical: [...compared.finalCanonical],
            finalCanonicalAsThetaOmega: [...compared.finalCanonicalAsThetaOmega]
          })
        );
        await section.locator('#structure-maxIterations').fill('1');
        await section.locator('#structure-tolerance').fill('1e-15');
        await section.getByRole('button', { name: '정준 RHS·한 단계·좌표 비교', exact: true }).click();
        await expect(section.getByRole('alert')).toContainText('미수렴');
        expect(JSON.parse(await download(page, '정준 비교 JSON 다운로드'))).toEqual(canonical);
      } else {
        await expect(section.getByRole('alert')).toContainText('점질량 이중진자');
        await expect(section.getByRole('button', { name: '정준 비교 JSON 다운로드', exact: true })).toBeDisabled();
      }
      await section.evaluate((node) => {
        const buttons = [...node.querySelectorAll('button')],
          calculate = buttons.find((button) => button.textContent === '에너지 드리프트 프로필 계산'),
          cancel = buttons.find((button) => button.textContent === '구조 진단 취소');
        if (!calculate || !cancel) throw new Error('buttons');
        calculate.click();
        cancel.click();
      });
      await expect(section.getByRole('status')).toHaveText('구조 진단 취소됨 · 마지막 완료 결과를 유지합니다.');
      expect(await download(page, '에너지 프로필 JSON 다운로드')).toBe(resultText);
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(audit.violations.map((entry) => entry.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      expect(await download(page, '상태 JSON 다운로드')).toBe(sourceText);
      expect(errors).toEqual([]);
      test.info().annotations.push({
        type: 'cross-runtime-structure-error',
        description: JSON.stringify({ maximumEnergyAbsolute, maximumCanonicalAbsolute })
      });
    });
});
