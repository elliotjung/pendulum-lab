import { expectLegacyPanelScreenshot } from './legacy-layout';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import type { PlanarAnalysisResult } from '../../src/product/adapters/analysis/planar';

const systems = ['double', 'compound-double'] as const;
const browserErrors = new WeakMap<Page, string[]>();

async function openSystem(page: Page, slug: (typeof systems)[number]) {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
}

async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}

async function elapsedTime(page: Page) {
  return Number(await page.locator('#lab-time').getAttribute('data-time'));
}

async function downloadText(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, 'utf8') };
}

async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual(
    []
  );
}

async function withinViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function setRuntime(page: Page, duration: string, step: string) {
  await panel(page, '조건');
  await page.getByLabel('관찰 시간 · duration (s)', { exact: true }).fill(duration);
  await page.getByText('상세 조건 펼치기', { exact: true }).click();
  await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill(step);
}

async function observeAnalysisProgress(page: Page) {
  await page.locator('#lab-analysis-progress').evaluate((progress) => {
    const container = progress.parentElement!;
    const observed: string[] = [];
    const observer = new MutationObserver(() => observed.push(container.textContent ?? ''));
    observer.observe(container, { attributes: true, childList: true, subtree: true, characterData: true });
    Object.assign(progress, { s07ObservedProgress: { observed, observer } });
  });
}

async function readAnalysisProgress(page: Page) {
  return page.locator('#lab-analysis-progress').evaluate((progress) => {
    const state = (
      progress as HTMLProgressElement & {
        s07ObservedProgress: { observed: string[]; observer: MutationObserver };
      }
    ).s07ObservedProgress;
    state.observer.disconnect();
    return state.observed;
  });
}

test.describe('S07 real planar pendulum laboratory', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    browserErrors.set(page, errors);
  });

  test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page)).toEqual([]);
  });

  for (const slug of systems) {
    test(`${slug}: runs, pauses, steps, cancels and resets a real trajectory with finite CSV and SVG exports`, async ({
      page
    }) => {
      await openSystem(page, slug);
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      await setRuntime(page, '10', '0.01');
      await panel(page, '작업 공간');
      const scene = page.getByRole('img', { name: '진자 애니메이션', exact: true });
      const initialRods = await scene.locator('path').getAttribute('d');
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'running');
      await expect.poll(() => elapsedTime(page)).toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
      expect(await scene.locator('path').getAttribute('d')).not.toBe(initialRods);
      const pausedTime = await elapsedTime(page);
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      expect(await elapsedTime(page)).toBeCloseTo(pausedTime + 0.01, 10);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect.poll(() => elapsedTime(page)).toBeGreaterThan(pausedTime + 0.01);
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'cancelled');

      await panel(page, '내보내기');
      const csv = await downloadText(page, '궤적 CSV 다운로드');
      expect(csv.name).toMatch(/\.csv$/);
      const rows = csv.text.trim().split(/\r?\n/);
      expect(rows.length).toBeGreaterThan(2);
      expect(rows[0]).toBe('time_s,theta1_rad,theta2_rad,omega1_rad_s,omega2_rad_s,kinetic_J,potential_J,total_J');
      for (const row of rows.slice(1)) {
        expect(row.split(',').every((value) => value.trim() !== '' && Number.isFinite(Number(value)))).toBe(true);
      }
      const svg = await downloadText(page, '그림 SVG 다운로드');
      expect(svg.name).toMatch(/\.svg$/);
      expect(svg.text).toContain('<svg');
      expect(svg.text).not.toMatch(/NaN|Infinity|<script|javascript:/);
      const validSvg = await page.evaluate((source) => {
        const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
        return parsed.documentElement.localName === 'svg' && parsed.querySelector('parsererror') === null;
      }, svg.text);
      expect(validSvg).toBe(true);

      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await panel(page, '작업 공간');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.01');
      await audit(page);
    });

    test(`${slug}: computes trajectory projections and genuine Poincare/Lyapunov worker results`, async ({ page }) => {
      await openSystem(page, slug);
      await setRuntime(page, '8', '0.002');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await panel(page, '분석');
      for (const [kind, name] of [
        ['state-time', '상태 / 시간'],
        ['energy', '에너지'],
        ['phase', '위상공간']
      ]) {
        await page.getByLabel('분석 도구', { exact: true }).selectOption(kind!);
        await page.getByRole('button', { name: '분석 계산', exact: true }).click();
        await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'completed');
        await expect(page.locator('#core-analysis').getByRole('img', { name: new RegExp(`^${name}`) })).toBeVisible();
      }
      for (const kind of ['poincare', 'lyapunov']) {
        await page.getByLabel('분석 도구', { exact: true }).selectOption(kind);
        if (kind === 'poincare') {
          const duration = page.getByLabel('분석 기간 (s)', { exact: true });
          await duration.fill('invalid');
          await expect(duration).toHaveAttribute('aria-invalid', 'true');
          await expect(page.getByRole('button', { name: '분석 계산', exact: true })).toBeDisabled();
          await panel(page, '내보내기');
          await expect(page.getByRole('button', { name: '상태 JSON 다운로드', exact: true })).toBeDisabled();
          await panel(page, '보관함');
          await expect(page.getByRole('button', { name: '현재 설정 저장', exact: true })).toBeDisabled();
          await panel(page, '분석');
          await duration.fill('8');
          await expect(duration).toHaveAttribute('aria-invalid', 'false');
          await expect(page.getByRole('button', { name: '분석 계산', exact: true })).toBeEnabled();
        }
        await observeAnalysisProgress(page);
        const workerStarted = page.waitForEvent('worker');
        await page.getByRole('button', { name: '분석 계산', exact: true }).click();
        const worker = await workerStarted;
        expect(worker.url()).toMatch(/planar\.worker/);
        await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'completed');
        await expect(page.locator('#lab-analysis-progress')).toHaveAttribute('value', '100');
        const progress = await readAnalysisProgress(page);
        expect(progress.some((message) => /운동방정식 평가 [1-9][0-9]*회/.test(message))).toBe(true);
        const result = JSON.parse((await page.locator('.core-result-json').textContent())!) as PlanarAnalysisResult;
        expect(result.kind).toBe(kind);
        if (result.kind === 'poincare') {
          expect(result.data.points.length).toBeGreaterThan(0);
          expect(result.data.points.every((point) => point.every(Number.isFinite))).toBe(true);
          expect(result.data.rootResiduals.every((value) => Number.isFinite(value) && Math.abs(value) < 1e-7)).toBe(
            true
          );
        } else {
          expect(Number.isFinite(result.data.lambdaMax)).toBe(true);
          expect(result.data.convergence.length).toBeGreaterThan(1);
          expect(result.data.convergence.every(Number.isFinite)).toBe(true);
        }
        await audit(page);
      }
      await expectLegacyPanelScreenshot(page, `${slug}-analysis-light.png`);
      // The long analyses use their own initial-state integration and preserve the animation cursor.
      await panel(page, '작업 공간');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
      await panel(page, '내보내기');
      const saved = JSON.parse((await downloadText(page, '상태 JSON 다운로드')).text) as ExperimentStateV1;
      expect(saved.analyses.map((analysis) => analysis.id)).toEqual(['analysis:poincare', 'analysis:lyapunov']);
    });

    test(`${slug}: preserves canonical settings through save, reload, tray restore and JSON round trip`, async ({
      page
    }) => {
      await openSystem(page, slug);
      await setRuntime(page, '2', '0.005');
      const mass = page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true });
      await mass.fill('2.5');
      await page.getByLabel('첫 번째 시작 각도 · theta1 (rad)', { exact: true }).fill('0.75');
      await page.locator('#lab-integrator').selectOption('integrator:rk2');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 보관', exact: true }).click();
      await expect(page.locator('.lab-tray-entry')).toHaveCount(1);
      await panel(page, '조건');
      await mass.fill('4');
      await panel(page, '보관함');
      await page.getByRole('button', { name: /설정 복원$/ }).click();
      await panel(page, '조건');
      await expect(mass).toHaveValue('2.5');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await panel(page, '조건');
      await mass.fill('5');
      await page.reload();
      await panel(page, '조건');
      await expect(mass).toHaveValue('2.5');
      await expect(page.getByLabel('첫 번째 시작 각도 · theta1 (rad)', { exact: true })).toHaveValue('0.75');
      await expect(page.locator('#lab-integrator')).toHaveValue('integrator:rk2');
      await panel(page, '내보내기');
      const original = await downloadText(page, '상태 JSON 다운로드');
      const canonical = JSON.parse(original.text) as ExperimentStateV1;
      expect(canonical).toMatchObject({
        schema: 'pendulum-experiment/v1',
        systemId: `system:${slug}`,
        parameters: { m1: { value: 2.5, unit: 'kg' } },
        initialConditions: { theta1: { value: 0.75, unit: 'rad' } },
        integrator: { kind: 'selectable', id: 'integrator:rk2' },
        runtime: { domain: 'time', duration: { value: 2, unit: 's' }, step: { value: 0.005, unit: 's' } }
      });
      expect(canonical.modelVersion).toBeTruthy();

      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await page.getByLabel('상태 JSON 가져오기', { exact: true }).setInputFiles({
        name: original.name,
        mimeType: 'application/json',
        buffer: Buffer.from(original.text)
      });
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await panel(page, '작업 공간');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      await panel(page, '내보내기');
      const restored = await downloadText(page, '상태 JSON 다운로드');
      expect(JSON.parse(restored.text)).toEqual(canonical);

      await page.getByLabel('상태 JSON 가져오기', { exact: true }).setInputFiles({
        name: 'invalid-state.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"schema":"unsupported/v99","parameters":{"m1":-1}}')
      });
      await expect(page.getByRole('alert')).toBeVisible();
      const afterInvalidImport = await downloadText(page, '상태 JSON 다운로드');
      expect(JSON.parse(afterInvalidImport.text)).toEqual(canonical);
      await audit(page);
    });

    test(`${slug}: rejects invalid SI values and incompatible time steps before execution`, async ({ page }) => {
      await openSystem(page, slug);
      await panel(page, '조건');
      const mass = page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true });
      await mass.fill('-1');
      await expect(mass).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '한 단계', exact: true })).toBeDisabled();
      await audit(page);
      await mass.fill('2');
      await setRuntime(page, '0.01', '0.02');
      await expect(page.getByLabel('시간 간격 · step (s)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.001');
      await page.locator('#lab-integrator').selectOption('integrator:euler');
      await expect(page.getByText(/명시적 오일러는 비교용이며 큰 에너지 오차/)).toBeVisible();
      await page.getByLabel('힌지 감쇠 계수 · gamma (kg*m^2/s)', { exact: true }).fill('0.1');
      await expect(page.getByText(/감쇠 중 총역학에너지는 보존되지 않습니다/)).toBeVisible();
      await page.locator('#lab-integrator').selectOption('integrator:rk4');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
      await panel(page, '작업 공간');
      expect(await elapsedTime(page)).toBeCloseTo(0.01, 12);
    });

    test(`${slug}: supports keyboard operation, 320px and 200% reflow with accessible panels`, async ({ page }) => {
      // Ten axe passes each open a result page; allow their combined setup time.
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 320, height: 800 });
      await openSystem(page, slug);
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
        await panel(page, name);
        await expect(page.getByRole('tabpanel')).toHaveCount(1);
        await withinViewport(page);
        await audit(page);
      }
      await panel(page, '작업 공간');
      await page.getByRole('button', { name: '한 단계', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
      await expect.poll(() => elapsedTime(page)).toBeGreaterThan(0);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
      for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
        await panel(page, name);
        await withinViewport(page);
        await audit(page);
      }
    });

    test(`${slug}: reviews a deterministic real workspace and dark inspector`, async ({ page }) => {
      await openSystem(page, slug);
      await audit(page);
      await expectLegacyPanelScreenshot(page, `${slug}-workspace-light.png`);
      await page.locator('#product-theme').selectOption('dark');
      await panel(page, '조건');
      await audit(page);
      await expectLegacyPanelScreenshot(page, `${slug}-inspector-dark.png`);
    });
  }

  test('cancels a long worker analysis, discards partial results and permits a new calculation', async ({ page }) => {
    await openSystem(page, 'double');
    await setRuntime(page, '10', '0.0001');
    await panel(page, '분석');
    await page.getByLabel('분석 도구', { exact: true }).selectOption('lyapunov');
    const workerStarted = page.waitForEvent('worker');
    await page.getByRole('button', { name: '분석 계산', exact: true }).click();
    await workerStarted;
    await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'running');
    await expect(page.getByRole('button', { name: '한 단계', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '분석 취소', exact: true }).click();
    await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'cancelled');
    await expect(page.locator('.core-result-json')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '분석 계산', exact: true })).toBeEnabled();
    await audit(page);
    await page.getByLabel('분석 기간 (s)', { exact: true }).fill('0.1');
    await page.getByRole('button', { name: '분석 계산', exact: true }).click();
    await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'completed');
    const result = JSON.parse((await page.locator('.core-result-json').textContent())!) as PlanarAnalysisResult;
    expect(result.settings.duration).toBe(0.1);
    expect(result.kind).toBe('lyapunov');
  });

  test('contains a worker startup failure and retries with the same valid settings', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      let failNext = true;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, argumentsList) {
          if (failNext) {
            failNext = false;
            throw new DOMException('S07 worker policy failure fixture', 'SecurityError');
          }
          return Reflect.construct(target, argumentsList);
        }
      });
    });
    await openSystem(page, 'compound-double');
    await panel(page, '분석');
    await page.getByLabel('분석 도구', { exact: true }).selectOption('lyapunov');
    await page.getByLabel('분석 기간 (s)', { exact: true }).fill('0.2');
    await page.getByRole('button', { name: '분석 계산', exact: true }).click();
    await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'error');
    await expect(page.getByRole('alert')).toContainText('worker');
    await expect(page.locator('#core-analysis')).not.toContainText('S07 worker policy failure fixture');
    await expect(page.locator('.core-result-json')).toHaveCount(0);
    await audit(page);
    const workerStarted = page.waitForEvent('worker');
    await page.getByRole('button', { name: '분석 계산', exact: true }).click();
    await workerStarted;
    await expect(page.locator('[data-analysis-status]')).toHaveAttribute('data-analysis-status', 'completed');
    await expect(page.getByRole('alert')).not.toBeVisible();
    const result = JSON.parse((await page.locator('.core-result-json').textContent())!) as PlanarAnalysisResult;
    expect(result.settings.duration).toBe(0.2);
  });
});
