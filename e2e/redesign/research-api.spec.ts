import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../src/product/adapters/physics/planar';
import { encodeShareToken } from '../../src/product/persistence/share';
import { executeBatchRun } from '../../src/product/lab/experiments/execute';
import { parseZip } from '../../src/research/zipBundle';
import type { createProductResearchApi } from '../../src/product/app/research-api-runtime';
import type { BatchRunResult } from '../../src/product/lab/experiments/contracts';

const numericalBaseline = JSON.parse(
  readFileSync(new URL('../../tests/characterization/numerical-golden.fixture.json', import.meta.url), 'utf8')
) as { tolerance: { numeric: { absolute: number; relative: number } } };

function compareNativeSummary(actual: BatchRunResult, expected: BatchRunResult) {
  const { summary: actualSummary, ...actualIdentity } = actual;
  const { summary: expectedSummary, ...expectedIdentity } = expected;
  expect(actualIdentity).toEqual(expectedIdentity);
  const { metrics: actualMetrics, energy: actualEnergy, ...actualMetadata } = actualSummary;
  const { metrics: expectedMetrics, energy: expectedEnergy, ...expectedMetadata } = expectedSummary;
  // IDs, requested inputs, counts, axes, units and warnings remain exact. Only
  // computed floating summaries cross Node/Chromium's Math implementation.
  expect(actualMetadata).toEqual(expectedMetadata);
  expect(actualMetrics).toHaveLength(expectedMetrics.length);
  let maximumAbsolute = 0;
  const compare = (observed: number, reference: number) => {
    expect(Number.isFinite(observed) && Number.isFinite(reference)).toBe(true);
    const difference = Math.abs(observed - reference);
    maximumAbsolute = Math.max(maximumAbsolute, difference);
    expect(difference).toBeLessThanOrEqual(
      numericalBaseline.tolerance.numeric.absolute + numericalBaseline.tolerance.numeric.relative * Math.abs(reference)
    );
  };
  actualMetrics.forEach((metric, index) => {
    const reference = expectedMetrics[index]!;
    expect({ key: metric.key, label: metric.label, unit: metric.unit }).toEqual({
      key: reference.key,
      label: reference.label,
      unit: reference.unit
    });
    for (const key of ['initial', 'final', 'min', 'max', 'mean', 'rms'] as const) compare(metric[key], reference[key]);
  });
  expect(!!actualEnergy).toBe(!!expectedEnergy);
  if (actualEnergy && expectedEnergy) {
    expect(actualEnergy.unit).toBe(expectedEnergy.unit);
    for (const key of ['initial', 'final', 'change'] as const) compare(actualEnergy[key], expectedEnergy[key]);
  }
  return maximumAbsolute;
}

type ResearchApi = ReturnType<typeof createProductResearchApi>;
type ApiWindow = Window & {
  PendulumLab: { research: ResearchApi; commands: { run(id: string): Promise<void> } };
  PendulumResearchWorkspace: ResearchApi;
  __studyResult?: Promise<unknown>;
};
async function open(page: Page, research = true) {
  const canonical = toCanonicalPlanar({ ...defaultPlanarConfig(), duration: 0.04, step: 0.01 });
  if (!canonical.ok) throw new Error('research API canonical fixture');
  const token = encodeShareToken(canonical.value);
  if (!token.ok) throw new Error('research API share fixture');
  await page.goto(`/next.html#/lab/double?state=${token.value}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.locator('#product-browser-api > summary').click();
  await page.getByRole('button', { name: '스크립트 API 활성화', exact: true }).click();
  await expect(page.locator('#product-browser-api')).toHaveAttribute('data-browser-api-status', 'ready');
  if (research) await activateResearch(page);
}
async function activateResearch(page: Page) {
  await page.getByRole('button', { name: '연구 스크립트 API 별도 활성화 · v1', exact: true }).click();
  await expect(page.locator('#product-browser-api')).toHaveAttribute('data-research-api-status', 'ready');
}
async function batch(page: Page) {
  await page.getByRole('tab', { name: '보관함', exact: true }).click();
  await page.locator('#batch-experiments > summary').click();
  await expect(page.locator('#batch-kind')).toBeVisible();
  await page.locator('#batch-kind').selectOption('grid');
  await page.locator('#batch-axis-0-field').selectOption('parameters:g');
  await page.locator('#batch-axis-0-start').fill('9');
  await page.locator('#batch-axis-0-end').fill('10');
  await page.locator('#batch-axis-0-count').fill('3');
  await page.locator('#batch-concurrency').fill('1');
}
async function downloaded(
  page: Page,
  method:
    'exportPaperPack' | 'exportFigures' | 'exportFigureManifest' | 'exportLatex' | 'exportNotebook' | 'exportBundle'
) {
  const pending = page.waitForEvent('download');
  await page.evaluate((method) => (window as unknown as ApiWindow).PendulumLab.research[method](), method);
  const file = await pending;
  expect(await file.failure()).toBeNull();
  const bytes = await readFile((await file.path())!);
  await test.info().attach(file.suggestedFilename(), {
    body: bytes,
    contentType:
      method === 'exportBundle'
        ? 'application/zip'
        : method === 'exportFigures'
          ? 'text/html'
          : method === 'exportLatex'
            ? 'application/x-tex'
            : 'application/json'
  });
  return bytes;
}
async function errorMessage(page: Page, method: 'snapshot' | 'bundle' | 'saveCurrentExperiment') {
  return page.evaluate((method) => {
    try {
      (window as unknown as ApiWindow).PendulumLab.research[method]();
      return '';
    } catch (cause) {
      return String(cause);
    }
  }, method);
}
test.describe('S28 separately opted-in versioned research namespace over actual live providers', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const found: string[] = [];
    errors.set(page, found);
    page.on('pageerror', (cause) => found.push(cause.message));
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
  test('publishes only after separate opt-in and reads actual S22 preview and confirmed original provenance', async ({
    page
  }) => {
    await open(page, false);
    expect(await page.evaluate(() => 'PendulumResearchWorkspace' in window)).toBe(false);
    expect(await page.evaluate(() => 'research' in (window as unknown as ApiWindow).PendulumLab)).toBe(false);
    await activateResearch(page);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as ApiWindow).PendulumResearchWorkspace ===
          (window as unknown as ApiWindow).PendulumLab.research
      )
    ).toBe(true);
    expect(await errorMessage(page, 'snapshot')).toContain('먼저 여세요');
    const methods = await page.evaluate(() =>
      Object.entries((window as unknown as ApiWindow).PendulumLab.research)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name)
    );
    expect(methods).toHaveLength(15);
    await expect(page.locator('#product-research-api-notice')).toContainText('product-research-api/v1');
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#observation-research > summary').click();
    await page.locator('#research-source-text').fill('time,theta1,theta2\n0,0.1,0.2\n0.1,0.2,0.3');
    await page.getByRole('button', { name: '관측 미리보기', exact: true }).click();
    await expect(page.locator('#observation-research')).toHaveAttribute('data-research-status', 'preview');
    const before = await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.snapshot());
    expect(before.observation!.preview!.artifact.original.text).toContain('time,theta1,theta2');
    expect(before.observation!.confirmed).toBeUndefined();
    await page.getByRole('button', { name: '미리보기 확인 · 관측 가져오기 확정', exact: true }).click();
    const after = await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.snapshot());
    expect(after.observation!.confirmed!.original).toEqual(before.observation!.preview!.artifact.original);
    expect(after.observation!.preview).toBeUndefined();
  });
  test('uses displayed S21 settings and genuine native workers to prepare, run and compare the exact plan', async ({
    page
  }) => {
    await open(page);
    await batch(page);
    const planned = await page.evaluate(() =>
      (window as unknown as ApiWindow).PendulumLab.research.generateParameterStudy()
    );
    expect(planned.plan.settings.axes[0]).toMatchObject({ key: 'g', start: 9, end: 10, count: 3 });
    const result = await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.runStudyBatch());
    expect(result.status).toBe('completed');
    expect(result.plan).toEqual(planned.plan);
    let maximumAbsolute = 0;
    for (const run of result.runs) {
      expect(run.result).toBeDefined();
      maximumAbsolute = Math.max(
        maximumAbsolute,
        compareNativeSummary(
          run.result!,
          executeBatchRun({ batchId: result.plan.id, run: result.plan.runs[run.index]! })
        )
      );
    }
    test
      .info()
      .annotations.push({ type: 'cross-runtime-numeric-error', description: JSON.stringify({ maximumAbsolute }) });
    expect(
      await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.rebuildComparisonMatrix())
    ).toEqual(result.aggregate);
    const rejected = await page.evaluate(async () => {
      try {
        await (window as unknown as ApiWindow).PendulumLab.research.runStudyBatch({ bad: true });
        return '';
      } catch (cause) {
        return String(cause);
      }
    });
    expect(rejected).toContain('옵션');
    await expect(page.locator('#batch-experiments')).toHaveAttribute('data-batch-status', 'completed');
  });
  test('cancels real queue ownership, explicitly resumes with native results and rejects in-flight API work on navigation', async ({
    page
  }) => {
    await open(page);
    await batch(page);
    let held = 0;
    const hold = '**/assets/batch.worker-*.js';
    await page.route(hold, async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        headers: { 'cache-control': 'no-store' },
        body: 'self.onmessage = () => {};'
      });
      held++;
    });
    await page.evaluate(() => {
      const api = (window as unknown as ApiWindow).PendulumLab.research;
      api.generateParameterStudy();
      (window as unknown as ApiWindow).__studyResult = api.runStudyBatch();
    });
    await expect.poll(() => held).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.cancelStudyBatch());
    const cancelled = (await page.evaluate(() => (window as unknown as ApiWindow).__studyResult)) as { status: string };
    expect(cancelled.status).toBe('cancelled');
    await page.unroute(hold);
    const withoutResume = await page.evaluate(async () => {
      try {
        await (window as unknown as ApiWindow).PendulumLab.research.runStudyBatch();
        return '';
      } catch (cause) {
        return String(cause);
      }
    });
    expect(withoutResume).toContain('resume');
    const resumed = await page.evaluate(() =>
      (window as unknown as ApiWindow).PendulumLab.research.runStudyBatch({ resume: true })
    );
    expect(resumed.status).toBe('completed');
    expect(resumed.runs.every((run) => run.result?.summary.sampleCount === 5)).toBe(true);
    await page.route(hold, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        headers: { 'cache-control': 'no-store' },
        body: 'self.onmessage = () => {};'
      })
    );
    await page.evaluate(() => {
      const api = (window as unknown as ApiWindow).PendulumLab.research;
      api.generateParameterStudy();
      (window as unknown as ApiWindow).__studyResult = api.runStudyBatch().catch((cause) => String(cause));
    });
    await page.getByRole('link', { name: '배우기', exact: true }).first().click();
    expect(await page.evaluate(() => (window as unknown as ApiWindow).__studyResult)).toContain('화면을 떠나');
    expect(await errorMessage(page, 'snapshot')).toContain('먼저 여세요');
  });
  test('captures actual S24 recorded run bytes, guards busy work and exports all six genuine versioned artifacts', async ({
    page
  }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.commands.run('simulation.toggle'));
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
    await page.getByRole('tab', { name: '분석', exact: true }).click();
    await page.locator('#research-project-workflow > summary').click();
    await expect(page.locator('#project-title')).toBeVisible();
    expect(await errorMessage(page, 'saveCurrentExperiment')).toContain('프로젝트');
    await page.locator('#project-title').fill('Actual API project');
    await page.getByRole('button', { name: '연구 프로젝트 만들기', exact: true }).click();
    await page.locator('#project-run-label').fill('Native recorded run');
    const busy = await page.evaluate(() => {
      const api = (window as unknown as ApiWindow).PendulumLab.research;
      api.saveCurrentExperiment();
      let refused = '';
      try {
        api.bundle();
      } catch (cause) {
        refused = String(cause);
      }
      return { busy: api.snapshot().project!.busy, refused };
    });
    expect(busy.busy).toBe(true);
    expect(busy.refused).toContain('진행 중');
    await expect(page.locator('#research-project-workflow')).toHaveAttribute('data-project-status', 'ready');
    const bundle = await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.bundle());
    expect(bundle.project.runs[0]!.status).toBe('completed');
    expect(bundle.project.artifacts.map((artifact) => artifact.kind)).toEqual(['configuration', 'series']);
    const source = page.locator('#project-figure-source');
    const seriesId = bundle.project.artifacts.find((artifact) => artifact.kind === 'series')!.id;
    await source.selectOption(seriesId);
    await page.locator('#project-figure-title').fill('Actual theta1');
    await page.locator('#project-figure-x').selectOption('-1');
    await page.locator('#project-figure-y').selectOption('0');
    await page.getByRole('button', { name: '출처를 연결해 그림 저장', exact: true }).click();
    const figures = await page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.research.collectFigures());
    expect(figures[0]!.status).toBe('available');
    expect(figures[0]!.sourceArtifactId).toBe(seriesId);
    const paper = JSON.parse((await downloaded(page, 'exportPaperPack')).toString('utf8'));
    expect(paper.schema).toBe('pendulum-product-paper-pack/v1');
    expect(paper.project.runs).toEqual(bundle.project.runs);
    const manifest = JSON.parse((await downloaded(page, 'exportFigureManifest')).toString('utf8'));
    expect(manifest.figures[0].sourceArtifactId).toBe(seriesId);
    expect((await downloaded(page, 'exportFigures')).toString('utf8')).toContain("default-src 'none'");
    expect((await downloaded(page, 'exportLatex')).toString('utf8')).toContain('Native recorded run');
    const notebook = JSON.parse((await downloaded(page, 'exportNotebook')).toString('utf8'));
    expect(notebook.nbformat).toBe(4);
    expect(notebook.metadata.pendulumLab.projectId).toBe(bundle.project.id);
    const zip = parseZip(await downloaded(page, 'exportBundle'));
    expect(
      JSON.parse(new TextDecoder().decode(zip.find((entry) => entry.path === 'manifest/project.json')!.data)).id
    ).toBe(bundle.project.id);
    for (const artifact of bundle.project.artifacts)
      expect(zip.find((entry) => entry.path === artifact.path)?.data.length).toBe(artifact.bytes);
  });
  test('preserves an unknown legacy alias and exposes clear migration contracts with keyboard and full axe at 320px', async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, false);
    await page.evaluate(() =>
      Object.defineProperty(window, 'PendulumResearchWorkspace', { configurable: true, value: { user: 'preserve' } })
    );
    const button = page.getByRole('button', { name: '연구 스크립트 API 별도 활성화 · v1', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#product-browser-api')).toHaveAttribute('data-research-api-status', 'error');
    expect(
      await page.evaluate(
        () => (window as unknown as Window & { PendulumResearchWorkspace: unknown }).PendulumResearchWorkspace
      )
    ).toEqual({ user: 'preserve' });
    expect(await page.evaluate(() => 'research' in (window as unknown as ApiWindow).PendulumLab)).toBe(false);
    await page.evaluate(() => Reflect.deleteProperty(window, 'PendulumResearchWorkspace'));
    await activateResearch(page);
    await expect(page.locator('#product-research-api-notice')).toContainText('product-research-api/v1');
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(
      audit.violations.map((entry) => ({ id: entry.id, targets: entry.nodes.map((node) => node.target) }))
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
