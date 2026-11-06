import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { LabSimulation, type LabConfig } from '../../src/app/LabSimulation';
import { fromCanonicalPlanar } from '../../src/product/adapters/physics/planar';
import { fromCanonicalChain } from '../../src/product/adapters/physics/chain';
import { LEGACY_ODE_INTEGRATOR_IDS, nativeOdeMethod } from '../../src/product/adapters/physics/planar-integrators';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
const numericalBaseline = JSON.parse(
  readFileSync(new URL('../../tests/characterization/numerical-golden.fixture.json', import.meta.url), 'utf8')
) as {
  tolerance: { numeric: { absolute: number; relative: number } };
};

async function download(page: Page, label: string): Promise<string> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}

function nativeConfig(experiment: ExperimentStateV1): LabConfig {
  if (experiment.systemId === 'system:triple') {
    const checked = fromCanonicalChain(experiment);
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
    const c = checked.value,
      p = c.parameters;
    return {
      system: 'triple',
      method: nativeOdeMethod(c.integratorId),
      dt: c.step,
      parameters: {
        m1: p.masses[0]!,
        m2: p.masses[1]!,
        m3: p.masses[2]!,
        l1: p.lengths[0]!,
        l2: p.lengths[1]!,
        l3: p.lengths[2]!,
        g: p.g
      },
      gamma: c.gamma,
      initialState: c.initialState,
      ...(c.tolerance === undefined ? {} : { tolerance: c.tolerance })
    };
  }
  const checked = fromCanonicalPlanar(experiment);
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  const c = checked.value;
  return {
    system: c.systemId === 'system:double' ? 'double' : 'compound-double',
    method: nativeOdeMethod(c.integratorId),
    dt: c.step,
    parameters: c.parameters,
    gamma: c.gamma,
    initialState: c.initialState,
    ...(c.tolerance === undefined ? {} : { tolerance: c.tolerance })
  };
}

test.describe('S28 all sixteen native ODE methods through the real free laboratory UI', () => {
  for (const system of ['double', 'compound-double', 'triple'] as const) {
    for (const integratorId of LEGACY_ODE_INTEGRATOR_IDS) {
      test(`${system} ${integratorId}: selects, steps and exports the exact native restart and result`, async ({
        page
      }) => {
        const errors: string[] = [];
        page.on('pageerror', (cause) => errors.push(cause.message));
        await page.goto(`/next.html#/lab/${system}`);
        await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
        await page.getByRole('tab', { name: '조건', exact: true }).click();
        const triple = system === 'triple',
          prefix = triple ? 'chain' : 'lab';
        if (triple) {
          await page.locator('#chain-duration').fill('0.02');
          await page.locator('#chain-step').fill('0.001');
        } else {
          await page.locator('#lab-field-duration').fill('0.02');
          await page.getByText('상세 조건 펼치기', { exact: true }).click();
          await page.locator('#lab-field-step').fill('0.001');
        }
        const integrator = page.locator(`#${prefix}-integrator`);
        expect(
          await integrator
            .locator('option')
            .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).sort())
        ).toEqual([...LEGACY_ODE_INTEGRATOR_IDS].sort());
        await integrator.selectOption(integratorId);
        await page.locator(`#${prefix}-tolerance-enabled`).check();
        await page.locator(`#${prefix}-tolerance`).fill('1e-8');
        await expect(integrator).toHaveValue(integratorId);
        await page.getByRole('button', { name: '한 단계', exact: true }).click();
        await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
        if (triple) await expect(page.locator('.chain-workspace')).toHaveAttribute('data-busy', 'false');
        await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.001');
        if (integratorId === 'integrator:hmidpoint') {
          const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          expect(audit.violations.map((entry) => entry.id)).toEqual([]);
        }
        await page.getByRole('tab', { name: '내보내기', exact: true }).click();
        const canonical = JSON.parse(await download(page, '상태 JSON 다운로드')) as ExperimentStateV1;
        expect(canonical.systemId).toBe(`system:${system}`);
        expect(canonical.integrator).toMatchObject({
          kind: 'selectable',
          id: integratorId,
          settings: { tolerance: { kind: 'scalar', value: 1e-8, unit: '1' } }
        });
        expect(canonical.runtime).toEqual({
          domain: 'time',
          start: { value: 0, unit: 's' },
          duration: { value: 0.02, unit: 's' },
          step: { value: 0.001, unit: 's' },
          sampleEvery: 1
        });
        const csv = await download(page, '궤적 CSV 다운로드'),
          rows = csv.trim().split(/\r?\n/);
        expect(rows).toHaveLength(3);
        const initial = rows[1]!.split(',').map(Number),
          actual = rows[2]!.split(',').map(Number);
        expect(initial.every(Number.isFinite) && actual.every(Number.isFinite)).toBe(true);
        const native = new LabSimulation(nativeConfig(canonical));
        expect(initial.slice(1, 1 + native.getState().length)).toEqual(native.getState());
        native.step();
        expect(actual[0]).toBe(0.001);
        // Production Chromium and Node can differ in the final ULP of Math
        // trig functions. The unchanged S01 numerical contract bounds this
        // cross-runtime comparison; same-runtime unit tests remain bit-exact.
        const observed = actual.slice(1, 1 + native.getState().length),
          reference = native.getState();
        const numericErrors = observed.map((value, index) => Math.abs(value - reference[index]!));
        for (let index = 0; index < observed.length; index++)
          expect(numericErrors[index]).toBeLessThanOrEqual(
            numericalBaseline.tolerance.numeric.absolute +
              numericalBaseline.tolerance.numeric.relative * Math.abs(reference[index]!)
          );
        const energyError = Math.abs(actual.at(-1)! - native.energy());
        expect(energyError).toBeLessThanOrEqual(
          numericalBaseline.tolerance.numeric.absolute +
            numericalBaseline.tolerance.numeric.relative * Math.abs(native.energy())
        );
        test.info().annotations.push({
          type: 'cross-runtime-numeric-error',
          description: JSON.stringify({ maximumStateAbsolute: Math.max(...numericErrors), energyAbsolute: energyError })
        });
        expect(errors).toEqual([]);
      });
    }
  }
});
