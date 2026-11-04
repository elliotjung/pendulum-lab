import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import { extendedFocusDeclaration } from '../../src/product/experiments/extended-definitions';

const ids = [2, 3].flatMap((course) => Array.from({ length: 9 }, (_, i) => `${course}.${i + 1}`));
const draftKey = (id: string) => `pendulum-product/extended-focus/v1/course-${id[0]}/${id}`;
const extendedChunk = (url: URL) =>
  url.pathname === '/src/product/experiments/extended-view.ts' ||
  /\/assets\/extended-view-[^/]+\.js$/.test(url.pathname);

async function openUnit(page: Page, id: string) {
  await page.goto(`/next.html#/learn/course-${id[0]}/${id}`);
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await expect(page.locator('.learn-unit')).toHaveAttribute('data-content-state', 'ready');
  await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
  await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
}
async function run(page: Page) {
  await page.getByRole('button', { name: '실험 실행', exact: true }).click();
  await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
  await expect(page.locator('[data-focus-results]')).not.toBeEmpty();
}
async function downloadJson<T>(page: Page, button: string): Promise<T> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as T;
}
async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
interface FocusReport {
  schema: string;
  unitId: string;
  canonical: ExperimentStateV1;
  metrics: { id: string; value: number; unit: string }[];
  tables: unknown[];
  companions: unknown[];
  warnings: string[];
  fields: Readonly<Record<string, number>>;
}

test.describe('S25 numerical and extended-pendulum curricula', () => {
  for (const id of ids) {
    test(`${id}: real calculation, scientific report, exact Lab transfer, back and reload`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await openUnit(page, id);
      const focus = page.locator('.focus-experiment');
      await expect(page.getByRole('math').first()).toBeVisible();
      await expect(page.locator('.learn-check')).toHaveCount(2);
      await expect(focus.locator('.focus-controls input').first()).toBeEnabled();
      const declaration = extendedFocusDeclaration(id);
      const fieldId = declaration.exposed[0]!;
      const metadata = declaration.fields.find((field) => field.id === fieldId)!;
      const editedValue =
        fieldId === 'links'
          ? metadata.value + 1
          : Math.min(metadata.max, metadata.value === 0 ? 0.01 : metadata.value * 1.05);
      const edited = page.locator(`#focus-${fieldId}`);
      await edited.fill(String(editedValue));
      await expect(edited).toHaveAttribute('aria-invalid', 'false');
      await page.evaluate(() => localStorage.setItem('pendulum-lab/s25-original', '{"original":true}'));
      await run(page);
      const report = await downloadJson<FocusReport>(page, '실험 결과 JSON 내보내기');
      expect(report.schema).toBe('pendulum-learn-diagnostics/v1');
      expect(report.unitId).toBe(id);
      expect(report.fields[fieldId]).toBe(editedValue);
      expect(report.metrics.length).toBeGreaterThan(0);
      expect(report.metrics.every((metric) => Number.isFinite(metric.value) && metric.unit.length > 0)).toBe(true);
      if (id === '3.8') {
        await expect(page.locator('[data-focus-visual] svg polyline')).toHaveCount(report.fields.links!);
        await expect(page.locator('[data-focus-visual] figcaption')).toContainText(`질점 ${report.fields.links}`);
      }
      expect(report.canonical.provenance?.source.id).toBe(`learn:course-${id[0]}:${id}:v1`);
      if (report.canonical.systemId.startsWith('system:spherical')) expect(report.canonical.analyses).toEqual([]);
      else expect(report.canonical.analyses.length).toBeGreaterThan(0);
      expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey(id))).not.toBeNull();
      await audit(page);
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await expect(page.getByRole('link', { name: '단원으로 돌아가기', exact: true })).toHaveAttribute(
        'href',
        `#/learn/course-${id[0]}/${id}`
      );
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      expect(await downloadJson<ExperimentStateV1>(page, '상태 JSON 다운로드')).toEqual(report.canonical);
      await page.goBack();
      await expect(focus).toHaveAttribute('data-focus-status', 'completed');
      expect(await downloadJson<FocusReport>(page, '실험 결과 JSON 내보내기')).toEqual(report);
      await page.reload();
      await expect(focus).toHaveAttribute('data-focus-status', 'idle');
      await expect(edited).toHaveValue(String(editedValue));
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
      await page.getByRole('tab', { name: '내보내기', exact: true }).click();
      expect(await downloadJson<ExperimentStateV1>(page, '상태 JSON 다운로드')).toEqual(report.canonical);
      expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/s25-original'))).toBe('{"original":true}');
      expect(errors).toEqual([]);
    });
  }

  test('rejects invalid edits, terminates work on cancellation and restarts safely', async ({ page }) => {
    await openUnit(page, '2.9');
    const focus = page.locator('.focus-experiment');
    const input = focus.locator('.focus-controls input').first();
    const before = await input.inputValue();
    const saved = await page.evaluate((key) => sessionStorage.getItem(key), draftKey('2.9'));
    await input.fill('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '실험 실행', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeDisabled();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey('2.9'))).toBe(saved);
    await input.fill(before);
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(focus).toHaveAttribute('data-focus-status', 'running');
    await page.getByRole('button', { name: '실험 취소', exact: true }).click();
    await expect(focus).toHaveAttribute('data-focus-status', 'cancelled');
    await audit(page);
    await page.getByRole('button', { name: '실험 처음으로', exact: true }).click();
    await expect(focus).toHaveAttribute('data-focus-status', 'idle');
    await run(page);
  });

  test('preserves a corrupt draft while allowing unsaved calculations and transfer', async ({ page }) => {
    await page.goto('/next.html#/learn');
    await page.evaluate((key) => sessionStorage.setItem(key, '{s25-original-corrupt'), draftKey('3.7'));
    await openUnit(page, '3.7');
    await expect(page.locator('.focus-storage-status')).toContainText(/原本|원본|복원/);
    await run(page);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey('3.7'))).toBe('{s25-original-corrupt');
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  });

  test('shows an empty crossing result without inventing an event', async ({ page }) => {
    await openUnit(page, '2.6');
    await page.locator('#focus-duration').fill('0.1');
    await run(page);
    const report = await downloadJson<FocusReport>(page, '실험 결과 JSON 내보내기');
    expect(report.metrics.find((metric) => metric.id === 'crossing-count')?.value).toBe(0);
    await expect(page.locator('[data-focus-results]')).toContainText(/없|0/);
    await audit(page);
  });

  test('contains worker startup failure and recovers with the same valid conditions', async ({ page }) => {
    await openUnit(page, '2.3');
    const tolerance = page.locator('#focus-tolerance');
    await tolerance.fill('0.00001');
    await page.evaluate(() => {
      const original = window.Worker;
      Object.defineProperty(window, '__s25OriginalWorker', { value: original, configurable: true });
      window.Worker = class extends original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (String(url).includes('extended')) throw new Error('S25 worker startup fixture');
          super(url, options);
        }
      };
    });
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'error');
    await expect(page.locator('.focus-experiment').getByRole('alert')).toBeVisible();
    await expect(tolerance).toHaveValue('0.00001');
    await audit(page);
    await page.evaluate(() => {
      window.Worker = (window as unknown as { __s25OriginalWorker: typeof Worker }).__s25OriginalWorker;
    });
    await page.getByRole('button', { name: '실험 처음으로', exact: true }).click();
    await run(page);
  });

  test('preserves theory during a failed experiment chunk and recovers the requested unit', async ({ page }) => {
    await page.route(extendedChunk, (route) => route.abort('failed'));
    await page.goto('/next.html#/learn/course-2/2.3', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.learn-unit')).toHaveAttribute('data-content-state', 'ready');
    await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'error');
    await expect(page.getByRole('math').first()).toBeVisible();
    await page.unroute(extendedChunk);
    await page.getByRole('button', { name: '실험 다시 시도', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
    await run(page);
  });

  test('discards a delayed experiment chunk after loading is cancelled', async ({ page }) => {
    let release = () => {};
    let requested = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const intercepted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(extendedChunk, async (route) => {
      requested();
      await released;
      await route.continue();
    });
    try {
      await page.goto('/next.html#/learn/course-3/3.9', { waitUntil: 'domcontentloaded' });
      await intercepted;
      await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'loading');
      await expect(page.getByRole('math').first()).toBeVisible();
      await page.getByRole('button', { name: '실험 불러오기 취소', exact: true }).click();
      const response = page.waitForResponse((item) => extendedChunk(new URL(item.url())));
      release();
      await response;
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'cancelled');
      await expect(page.locator('.focus-experiment')).toHaveCount(0);
      await page.getByRole('button', { name: '실험 다시 시도', exact: true }).click();
      await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
      await audit(page);
    } finally {
      release();
      await page.unroute(extendedChunk);
    }
  });

  test('supports keyboard execution and 320px plus 200 percent reflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openUnit(page, '3.9');
    const input = page.locator('.focus-experiment .focus-controls input').first();
    await input.focus();
    await expect(input).toBeFocused();
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: '실험 실행', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.locator('html').evaluate((node) => {
      node.style.zoom = '2';
    });
    await audit(page);
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  });

  for (const theme of ['light', 'dark']) {
    test(`shows numerical and spatial scientific results in ${theme}`, async ({ page }) => {
      for (const id of ['2.3', '3.1', '3.5', '3.8', '3.9']) {
        await openUnit(page, id);
        await page.getByLabel('화면 테마').selectOption(theme);
        await run(page);
        await page.locator('.focus-experiment').scrollIntoViewIfNeeded();
        const clippedLabels = await page.locator('[data-focus-visual] svg text').evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              if (getComputedStyle(node).display === 'none') return false;
              const bounds = (node as SVGTextElement).getBBox();
              return bounds.x < 0 || bounds.x + bounds.width > 640 || bounds.y < 0 || bounds.y + bounds.height > 270;
            })
            .map((node) => node.textContent)
        );
        expect(clippedLabels).toEqual([]);
        await expect(page.locator('[data-focus-visual]')).toHaveScreenshot(`s25-focus-${id}-${theme}.png`);
      }
    });
  }
});
