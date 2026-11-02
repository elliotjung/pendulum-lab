import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultDrivenConfig, toCanonicalDriven } from '../../src/product/adapters/physics/driven';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../src/product/adapters/physics/discrete';
import { defaultFieldConfig, toCanonicalField } from '../../src/product/adapters/physics/field';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import { encodeShareToken } from '../../src/product/persistence/share';

function fixture(slug: string): ExperimentStateV1 {
  const result =
    slug === 'standard-map'
      ? toCanonicalDiscrete({ ...defaultDiscreteConfig(), iterations: 1 })
      : slug === 'langevin'
        ? toCanonicalField({ ...defaultFieldConfig(), duration: 0.04, step: 0.01, ensemble: { members: 2 } })
        : toCanonicalDriven({ ...defaultDrivenConfig(), duration: 0.04, step: 0.01 });
  if (!result.ok) throw new Error('S21 physical browser fixture');
  return result.value;
}
async function open(page: Page, slug = 'driven') {
  const token = encodeShareToken(fixture(slug));
  if (!token.ok) throw new Error('S21 share fixture');
  await page.goto(`/next.html#/lab/${slug}?state=${token.value}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.getByRole('tab', { name: '보관함', exact: true }).click();
  await page.locator('#batch-experiments > summary').click();
  await expect(page.locator('#batch-kind option')).toHaveCount(6);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 실험 JSON 다운로드', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function prepare(page: Page, kind = 'paired') {
  await page.locator('#batch-kind').selectOption(kind);
  if (kind !== 'integrators' && kind !== 'ensemble') {
    await page.locator('#batch-axis-0-field').selectOption('parameters:damping');
    await page.locator('#batch-axis-0-end').fill('0.3');
    if (kind !== 'paired') {
      await page.locator('#batch-axis-0-start').fill('0.1');
      if (kind !== 'lhs') await page.locator('#batch-axis-0-count').fill('3');
    }
  }
  if (kind === 'lhs' || kind === 'ensemble') await page.locator('#batch-count').fill('4');
  await page.getByRole('button', { name: '다중 실험 준비', exact: true }).click();
  await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'ready');
}
async function run(page: Page) {
  await page.getByRole('button', { name: '다중 실험 실행', exact: true }).click();
  await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'completed');
  return JSON.parse(await download(page));
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((node) => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S21 comparison, sweep and ensemble experiments', () => {
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

  for (const kind of ['paired', 'grid', 'log', 'lhs', 'integrators'])
    test(`${kind} builder executes native runs with complete source and aggregate lineage`, async ({ page }) => {
      await open(page);
      await prepare(page, kind);
      const ready = JSON.parse(await download(page));
      expect(ready.schema).toBe('pendulum-batch/v1');
      expect(ready.plan.source).toEqual(fixture('driven'));
      expect(ready.plan.settings.kind).toBe(kind);
      const artifact = await run(page);
      expect(artifact.plan).toEqual(ready.plan);
      expect(artifact.runs.length).toBeGreaterThanOrEqual(2);
      expect(artifact.runs.every((entry: { status: string }) => entry.status === 'completed')).toBe(true);
      await expect(page.locator('#batch-output [data-run-id]')).toHaveCount(artifact.runs.length);
      await expect(page.locator('#batch-output')).toContainText(/집계|aggregate/);
      if (kind === 'integrators') {
        expect(artifact.plan.runs.map((entry: { experiment: ExperimentStateV1 }) => entry.experiment.runtime)).toEqual(
          artifact.plan.runs.map(() => fixture('driven').runtime)
        );
        await expect(page.locator('#batch-output')).toContainText(/오차|보존|감쇠/);
        expect(artifact.aggregate.comparisons).toHaveLength(artifact.plan.runs.length - 1);
        await expect(
          page.getByRole('region', { name: '첫 적분기를 기준으로 한 종점 차이', exact: true })
        ).toBeVisible();
      }
    });

  test('a seeded stochastic ensemble repeats exactly after export, reload and import', async ({ page }) => {
    await open(page, 'langevin');
    await expect(page.locator('#batch-source')).toContainText('정규화');
    await page.locator('#batch-kind').selectOption('ensemble');
    await page.locator('#batch-count').fill('4');
    await page.locator('#batch-seed').fill('browser-s21');
    await page.getByRole('button', { name: '다중 실험 준비', exact: true }).click();
    const planned = await download(page);
    const first = await run(page);
    await page.reload();
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    await page.locator('#batch-experiments > summary').click();
    await page.locator('#batch-import').setInputFiles({
      name: 'ensemble-plan.json',
      mimeType: 'application/json',
      buffer: Buffer.from(planned)
    });
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'ready');
    const second = await run(page);
    expect(second).toEqual(first);
    expect(
      new Set(first.plan.runs.map((entry: { experiment: ExperimentStateV1 }) => entry.experiment.seed?.value)).size
    ).toBe(4);
    await expect(page.locator('#batch-output')).toContainText(/seed|시드/);
    await audit(page);
  });

  test('two hundred runs remain responsive, cancel, reload and resume without repeating completed runs', async ({
    page
  }) => {
    await open(page, 'standard-map');
    await page.locator('#batch-kind').selectOption('grid');
    await page.locator('#batch-axis-0-field').selectOption('parameters:kickStrength');
    await page.locator('#batch-axis-0-start').fill('0.1');
    await page.locator('#batch-axis-0-end').fill('2');
    await page.locator('#batch-axis-0-count').fill('200');
    await page.locator('#batch-concurrency').fill('2');
    await page.getByRole('button', { name: '다중 실험 준비', exact: true }).click();
    const started = page.waitForEvent('worker');
    await page.getByRole('button', { name: '다중 실험 실행', exact: true }).click();
    expect((await started).url()).toContain('batch.worker');
    await expect
      .poll(async () => page.locator('#batch-output [data-run-status="completed"]').count())
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: '대기열 취소', exact: true }).click();
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'cancelled');
    const partialText = await download(page),
      partial = JSON.parse(partialText);
    const completeBefore = partial.runs.filter((entry: { status: string }) => entry.status === 'completed');
    expect(completeBefore.length).toBeGreaterThan(0);
    expect(completeBefore.length).toBeLessThan(200);
    await page.reload();
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    await page.locator('#batch-experiments > summary').click();
    await page.locator('#batch-import').setInputFiles({
      name: 'paused-200.json',
      mimeType: 'application/json',
      buffer: Buffer.from(partialText)
    });
    await page.getByRole('button', { name: '중단한 실행 재개', exact: true }).click();
    // The download action becomes available when the queue settles. Waiting on
    // that real action retains the suite's 30s journey budget for all 200 runs.
    const completed = JSON.parse(await download(page));
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'completed');
    expect(completed.status).toBe('completed');
    expect(completed.runs).toHaveLength(200);
    for (const entry of completeBefore)
      expect(completed.runs.find((next: { id: string }) => next.id === entry.id)).toEqual(entry);
    await expect(page.locator('#batch-output')).toContainText('전체 200 run · 완료 200');
    await expect(page.locator('#batch-output [data-run-status="completed"]')).toHaveCount(64);
    await page.locator('#batch-page').selectOption('3');
    await expect(page.locator('#batch-output [data-run-status="completed"]')).toHaveCount(8);
  });

  test('one failed worker is identified and retried while successful runs remain intact', async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Worker;
      let fail = true;
      window.Worker = new Proxy(Native, {
        construct(target, args) {
          if (fail && String(args[0]).includes('batch.worker')) {
            fail = false;
            throw new DOMException('S21 single failed run fixture', 'SecurityError');
          }
          return Reflect.construct(target, args);
        }
      });
    });
    await open(page);
    await prepare(page, 'grid');
    await page.getByRole('button', { name: '다중 실험 실행', exact: true }).click();
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'partial');
    const partial = JSON.parse(await download(page));
    expect(partial.runs.filter((entry: { status: string }) => entry.status === 'failed')).toHaveLength(1);
    const successful = partial.runs.filter((entry: { status: string }) => entry.status === 'completed');
    await page.getByRole('button', { name: '실패 run 재실행', exact: true }).click();
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'completed');
    const completed = JSON.parse(await download(page));
    for (const entry of successful)
      expect(completed.runs.find((next: { id: string }) => next.id === entry.id)).toEqual(entry);
  });

  test('malformed import and invalid logarithmic range preserve the completed artifact', async ({ page }) => {
    await open(page);
    await prepare(page);
    const completed = await run(page);
    const saved = await download(page);
    await page.locator('#batch-import').setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved.replace('pendulum-batch/v1', 'pendulum-batch/v99'))
    });
    await expect(page.locator('#batch-error')).toContainText(/실패|지원|schema|버전/);
    expect(JSON.parse(await download(page))).toEqual(completed);
    await page.locator('#batch-kind').selectOption('log');
    await page.locator('#batch-axis-0-start').fill('0');
    await page.getByRole('button', { name: '다중 실험 준비', exact: true }).click();
    await expect(page.locator('#batch-error')).not.toBeEmpty();
    expect(JSON.parse(await download(page))).toEqual(completed);
  });

  test('native internal steppers explain why integrator comparison is unavailable', async ({ page }) => {
    await open(page, 'standard-map');
    await page.locator('#batch-kind').selectOption('integrators');
    await page.getByRole('button', { name: '다중 실험 준비', exact: true }).click();
    await expect(page.locator('#batch-error')).toContainText(/적분기|stepper|내부/);
    await expect(page.getByRole('button', { name: '다중 실험 실행', exact: true })).toBeDisabled();
  });

  test('an imported ready plan runs independently while the live inspector remains invalid', async ({ page }) => {
    await open(page);
    await prepare(page);
    const planned = await download(page);
    await page.getByRole('tab', { name: '조건', exact: true }).click();
    await page.locator('#driven-duration').fill('0');
    await expect(page.locator('#driven-duration')).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    await page.locator('#batch-import').setInputFiles({
      name: 'independent-ready.json',
      mimeType: 'application/json',
      buffer: Buffer.from(planned)
    });
    await expect(page.getByRole('button', { name: '다중 실험 실행', exact: true })).toBeEnabled();
    const completed = await run(page);
    expect(completed.plan.source.runtime).toEqual(fixture('driven').runtime);
    await page.getByRole('tab', { name: '조건', exact: true }).click();
    await expect(page.locator('#driven-duration')).toHaveValue('0');
  });

  test('keyboard and 320px themes retain accessible experiment controls and results', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const token = encodeShareToken(fixture('driven'));
    if (!token.ok) throw new Error('S21 share fixture');
    await page.goto(`/next.html#/lab/driven?state=${token.value}`);
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await page.getByRole('tab', { name: '보관함', exact: true }).click();
    await page.locator('#batch-experiments > summary').focus();
    await page.keyboard.press('Enter');
    await prepare(page);
    await run(page);
    await audit(page);
    await expect(page.locator('#batch-experiments')).toHaveScreenshot('s21-batch-light.png');
    await page.locator('#product-theme').selectOption('dark');
    await audit(page);
    await expect(page.locator('#batch-experiments')).toHaveScreenshot('s21-batch-dark.png');
  });

  test('200 percent zoom retains queue controls and complete input records', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await prepare(page);
    await run(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await audit(page);
  });
});
