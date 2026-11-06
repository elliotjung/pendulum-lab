import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { FIELD_STOCHASTIC_SCHEMES } from '../../src/product/adapters/physics/field-stochastic';
import { createFieldSimulation, fromCanonicalField } from '../../src/product/adapters/physics/field';
import { stochasticResonanceCurve } from '../../src/physics/stochasticResonance';
import type { FieldResonanceResult } from '../../src/product/adapters/physics/field-resonance';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';

const numeric = (
  JSON.parse(
    readFileSync(new URL('../../tests/characterization/numerical-golden.fixture.json', import.meta.url), 'utf8')
  ) as { tolerance: { numeric: { absolute: number; relative: number } } }
).tolerance.numeric;
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!, 'utf8');
}
async function open(page: Page) {
  await page.goto('/next.html#/lab/langevin');
  await expect(page.locator('.field-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
function equalNumbers(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) =>
    expect(Math.abs(value - expected[index]!)).toBeLessThanOrEqual(
      numeric.absolute + numeric.relative * Math.abs(expected[index]!)
    )
  );
}
test.describe('S28 stochastic schemes and independent native resonance', () => {
  for (const scheme of FIELD_STOCHASTIC_SCHEMES) {
    test(`${scheme}: real worker execution, explicit interpretation and complete state/export round trip`, async ({
      page
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await open(page);
      await panel(page, '조건');
      await page.getByText('확률 scheme·곱셈 잡음·확산 행렬', { exact: true }).click();
      await page.locator('#field-stochastic-scheme').selectOption(scheme);
      await page.locator('#field-diffusion-offset').fill('[0.2,1]');
      await page.locator('#field-diffusion-slope').fill('[0.1,-0.2]');
      if (scheme === 'heun-stratonovich' || scheme === 'commutative-milstein')
        await page.locator('#field-diffusion-matrix').fill('[1,0.3,-0.2,0.8]');
      await page.locator('#field-members').fill('2');
      await page.locator('#field-duration').fill('0.02');
      await page.getByRole('button', { name: '조건 적용', exact: true }).click();
      const started = page.waitForEvent('worker');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      expect((await started).url()).toMatch(/field\.worker/);
      await expect(page.locator('.field-workspace')).toHaveAttribute('data-busy', 'false');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.01');
      await panel(page, '내보내기');
      const original = await download(page, '상태 JSON 다운로드'),
        state = JSON.parse(original) as ExperimentStateV1;
      expect(state.integrator.options).toEqual({ scheme, diffusionModel: 'row-affine-v1' });
      const parsed = fromCanonicalField(state);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      expect(parsed.value.stochastic).toMatchObject({ scheme, offset: [0.2, 1], slope: [0.1, -0.2] });
      const provenance = JSON.parse(await download(page, 'provenance JSON 다운로드')) as {
        configuration: unknown;
        memberStates: number[][];
      };
      expect(provenance.configuration).toEqual(parsed.value);
      const native = createFieldSimulation(parsed.value).step();
      provenance.memberStates.forEach((row, index) => equalNumbers(row, native.memberStates[index]!));
      await page
        .locator('#field-import')
        .setInputFiles({ name: 'sde.json', mimeType: 'application/json', buffer: Buffer.from(original) });
      await expect(
        page.getByText('상태 파일을 복원했습니다. 처음부터 다시 실행하세요.', { exact: true })
      ).toBeVisible();
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await page.reload();
      await panel(page, '조건');
      await page.getByText('확률 scheme·곱셈 잡음·확산 행렬', { exact: true }).click();
      await expect(page.locator('#field-stochastic-scheme')).toHaveValue(scheme);
      await expect(page.locator('#field-diffusion-offset')).toHaveValue('[0.2,1]');
      await expect(page.locator('#field-diffusion-slope')).toHaveValue('[0.1,-0.2]');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (scheme === 'heun-stratonovich') {
        await expect(
          page.locator('#field-inspector .lab-preview-note').filter({ hasText: 'Stratonovich 해석입니다' })
        ).toBeVisible();
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(audit.violations.map((entry) => entry.id)).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
  test('standalone quartic resonance runs in a native worker, exports its full curve and cancels a later run', async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await panel(page, '분석');
    for (const [key, value] of Object.entries({
      driveOmega: 3,
      dt: 0.05,
      periods: 1,
      transientPeriods: 0,
      sigmaCount: 3,
      realizations: 2
    }))
      await page.locator(`#field-resonance-${key}`).fill(String(value));
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '확률 공명 곡선 계산', exact: true }).click();
    expect((await started).url()).toMatch(/field-resonance\.worker/);
    await expect(page.getByText('확률 공명 곡선 계산 완료 · 독립 native 진단', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /^정규화 잡음 σ에 따른 native 확률 공명/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const original = await download(page, '확률 공명 JSON 다운로드'),
      artifact = JSON.parse(original) as FieldResonanceResult;
    expect(artifact.scope).toBe('independent-overdamped-quartic');
    expect(artifact.source).toBe('stochasticResonanceCurve');
    const c = artifact.settings;
    const expected = stochasticResonanceCurve(
      {
        amplitude: c.amplitude,
        driveOmega: c.driveOmega,
        dt: c.dt,
        periods: c.periods,
        transientPeriods: c.transientPeriods,
        seed: c.seed,
        x0: c.x0
      },
      artifact.sigmas,
      c.realizations
    );
    const metrics = ['sigma', 'responseAmplitude', 'signalPower', 'rightWellFraction', 'transitions'] as const;
    artifact.rows.forEach((row, index) =>
      equalNumbers(
        metrics.map((key) => row[key]),
        metrics.map((key) => expected[index]![key])
      )
    );
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(audit.violations.map((entry) => entry.id)).toEqual([]);
    for (const [key, value] of Object.entries({
      driveOmega: 1,
      dt: 0.02,
      periods: 4,
      transientPeriods: 2,
      sigmaCount: 32,
      realizations: 16
    }))
      await page.locator(`#field-resonance-${key}`).fill(String(value));
    await page.getByRole('button', { name: '확률 공명 곡선 계산', exact: true }).click();
    await page.getByRole('button', { name: '확률 공명 계산 취소', exact: true }).click();
    await expect(
      page.getByText('확률 공명 계산 취소됨 · 마지막 완료 결과를 유지합니다.', { exact: true })
    ).toBeVisible();
    expect(await download(page, '확률 공명 JSON 다운로드')).toBe(original);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    expect(errors).toEqual([]);
  });
  test('malformed diffusion preview preserves the applied settings and allows explicit recovery', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.getByText('확률 scheme·곱셈 잡음·확산 행렬', { exact: true }).click();
    await page.locator('#field-stochastic-scheme').selectOption('commutative-milstein');
    await page.locator('#field-diffusion-matrix').fill('[1,2,3]');
    await page.getByRole('button', { name: '조건 적용', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '마지막 유효한 설정을 보존했습니다.' })).toBeVisible();
    await page.getByRole('button', { name: '편집 취소', exact: true }).click();
    await expect(page.locator('#field-stochastic-scheme')).toHaveValue('legacy-additive');
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드')) as ExperimentStateV1;
    expect(state.integrator.options).toBeUndefined();
    expect(state.integrator.settings).toEqual({});
  });
});
