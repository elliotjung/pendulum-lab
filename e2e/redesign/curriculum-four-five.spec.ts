import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import { researchFocusDeclaration } from '../../src/product/experiments/research-focus-definitions';

const ids = [
  ...Array.from({ length: 10 }, (_, i) => `4.${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `5.${i + 1}`)
];
const draftKey = (id: string) => `pendulum-product/research-focus/v1/course-${id[0]}/${id}`;
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
  charts: unknown[];
  warnings: string[];
  fields: Readonly<Record<string, number>>;
}

test.describe('S26 nonlinear control and chaos measurement curricula', () => {
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
      const declaration = researchFocusDeclaration(id);
      const fieldId = declaration.exposed[0]!;
      const metadata = declaration.fields.find((field) => field.id === fieldId)!;
      const editedValue = metadata.integer
        ? Math.min(metadata.max, metadata.value + 1)
        : fieldId === 'step'
          ? metadata.value / 2
          : Math.min(metadata.max, metadata.value === 0 ? 0.01 : metadata.value * 1.05);
      const edited = page.locator(`#focus-${fieldId}`);
      await edited.fill(String(editedValue));
      await expect(edited).toHaveAttribute('aria-invalid', 'false');
      await page.evaluate(() => localStorage.setItem('pendulum-lab/s26-original', '{"original":true}'));
      await run(page);
      const report = await downloadJson<FocusReport>(page, '실험 결과 JSON 내보내기');
      expect(report.schema).toBe('pendulum-research-focus/v1');
      expect(report.unitId).toBe(id);
      expect(report.fields[fieldId]).toBe(editedValue);
      expect(report.metrics.length).toBeGreaterThan(0);
      expect(report.metrics.every((metric) => Number.isFinite(metric.value) && metric.unit.length > 0)).toBe(true);
      expect(report.canonical.provenance?.source.id).toBe(`learn:course-${id[0]}:${id}:v1`);
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
      expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/s26-original'))).toBe('{"original":true}');
      expect(errors).toEqual([]);
    });
  }

  test('preserves invalid and corrupt drafts, supports cancellation and restart', async ({ page }) => {
    await page.goto('/next.html#/learn');
    await page.evaluate((key) => sessionStorage.setItem(key, '{original-corrupt'), draftKey('4.7'));
    await openUnit(page, '4.7');
    await expect(page.locator('.focus-storage-status')).toContainText('원본');
    const input = page.locator('.focus-controls input').first(),
      before = await input.inputValue();
    await input.fill('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '실험 실행', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeDisabled();
    await input.fill(before);
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await page.getByRole('button', { name: '실험 취소', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'cancelled');
    await page.getByRole('button', { name: '실험 처음으로', exact: true }).click();
    await run(page);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey('4.7'))).toBe('{original-corrupt');
    await audit(page);
  });
  test('shows recoverable worker start failure without losing inputs', async ({ page }) => {
    await page.addInitScript(() => {
      window.Worker = class {
        constructor() {
          throw new Error('fixture-worker-denied');
        }
      } as unknown as typeof Worker;
    });
    await openUnit(page, '5.2');
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'error');
    await expect(page.getByRole('alert')).toContainText('worker');
    await audit(page);
  });
  test('keeps controls keyboard accessible at320px and200percent zoom', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openUnit(page, '5.10');
    const input = page.locator('.focus-controls input').first();
    await input.focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    await run(page);
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.locator('body').evaluate((el) => {
      el.style.zoom = '2';
    });
    await audit(page);
    await expect(page.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeEnabled();
  });
  test('renders known-empty section without inventing crossings', async ({ page }) => {
    await openUnit(page, '5.4');
    await page.locator('#focus-sectionValue').fill('2');
    await run(page);
    const report = await downloadJson<FocusReport>(page, '실험 결과 JSON 내보내기');
    expect(report.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
    expect(report.metrics.find((m) => m.id === 'crossings-rising')?.value).toBe(0);
    expect(report.metrics.find((m) => m.id === 'crossings-falling')?.value).toBe(0);
    await expect(page.locator('[data-focus-visual]')).toContainText('없습니다');
    await audit(page);
  });
  for (const id of ['4.3', '4.7', '5.10', '5.13'])
    for (const theme of ['light', 'dark']) {
      test(`visual ${id} ${theme}`, async ({ page }) => {
        await page.goto('/next.html#/learn');
        await page.getByLabel('화면 테마').selectOption(theme);
        await openUnit(page, id);
        await run(page);
        const clipped = await page.locator('[data-focus-visual] svg').evaluateAll((svgs) =>
          svgs.flatMap((svg) => {
            const box = (svg as SVGSVGElement).viewBox.baseVal;
            return [...svg.querySelectorAll('text')]
              .filter((text) => {
                const r = text.getBBox();
                return (
                  r.x < box.x || r.y < box.y || r.x + r.width > box.x + box.width || r.y + r.height > box.y + box.height
                );
              })
              .map((text) => text.textContent);
          })
        );
        expect(clipped).toEqual([]);
        await expect(page.locator('[data-focus-visual]')).toHaveScreenshot(
          `s26-focus-${id.replace('.', '-')}-${theme}.png`
        );
      });
    }
});
