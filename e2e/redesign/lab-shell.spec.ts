import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const browserErrors = new WeakMap<Page, string[]>();

async function openSystem(page: Page, slug = 'double') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
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

test.describe('S06 system-first laboratory', () => {
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
  test('filters systems, handles empty results, favorites and recent selection in two choices', async ({ page }) => {
    await page.goto('/next.html#/lab');
    await page.getByLabel('시스템 검색', { exact: true }).fill('double point');
    await expect(page.locator('.lab-system-grid article')).toHaveCount(1);
    await page.getByRole('button', { name: '점질량 이중 진자 즐겨찾기', exact: true }).click();
    await page.getByLabel('목록 보기').selectOption('favorites');
    await expect(page.locator('.lab-system-grid article')).toHaveCount(1);
    await page.getByRole('link', { name: '점질량 이중 진자 선택하고 설정하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.getByLabel('목록 보기').selectOption('recent');
    await expect(page.locator('.lab-system-grid article')).toHaveCount(1);
    await page.getByLabel('시스템 검색', { exact: true }).fill('no-such-system');
    await expect(page.getByRole('heading', { name: '조건에 맞는 시스템이 없습니다' })).toBeVisible();
    await page.getByRole('button', { name: '필터 초기화' }).click();
    await page.getByLabel('시스템 패밀리').selectOption('discrete-quantum');
    await expect(page.locator('.lab-system-grid article')).toHaveCount(3);
    await page.reload();
    await page.getByLabel('목록 보기').selectOption('favorites');
    await expect(page.locator('.lab-system-grid article')).toHaveCount(0);
  });

  test('edits schema fields, prevents invalid execution and restricts system-specific controls', async ({ page }) => {
    await openSystem(page);
    await panel(page, '조건');
    const mass = page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true });
    await mass.fill('-1');
    await expect(mass).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await audit(page);
    await mass.fill('2');
    await expect(mass).toHaveAttribute('aria-invalid', 'false');
    await page.getByText('상세 조건 펼치기', { exact: true }).click();
    await page.getByLabel('시간 간격 · step (s)', { exact: true }).fill('0.02');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
    await panel(page, '작업 공간');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.02');
    await openSystem(page, 'standard-map');
    await panel(page, '조건');
    await expect(page.getByLabel('반복 횟수 · iterations (회)', { exact: true })).toBeVisible();
    await expect(page.locator('#lab-field-m1, #lab-field-step, #lab-field-duration, #lab-integrator')).toHaveCount(0);
    await openSystem(page, 'spherical');
    await panel(page, '조건');
    await expect(page.locator('#lab-field-step, #lab-integrator')).toHaveCount(0);
  });

  test('runs, pauses, steps, cancels, resets and recovers a mock error without physical output', async ({ page }) => {
    await openSystem(page, 'spherical');
    await page.getByRole('button', { name: '시험 실행', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'running');
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
    await page.getByRole('button', { name: '처음으로', exact: true }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
    await page.getByText('오류 복구 체험', { exact: true }).click();
    await page.getByRole('button', { name: '시험 오류 재현' }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'error');
    await expect(page.getByRole('alert')).toContainText('오류');
    await audit(page);
    await page.getByRole('button', { name: '시험 실행', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'completed');
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '12');
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('selects only compatible analyses and exports a restorable tray snapshot as explicit mock JSON', async ({
    page
  }) => {
    await openSystem(page, 'standard-map');
    await panel(page, '분석');
    const first = page.locator('.lab-analysis-choice button').first();
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.lab-selected-analyses > div')).toHaveCount(1);
    await panel(page, '조건');
    await page.getByLabel('반복 횟수 · iterations (회)', { exact: true }).fill('3');
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 보관', exact: true }).click();
    await expect(page.locator('.lab-tray-entry')).toHaveCount(1);
    await panel(page, '조건');
    await page.getByLabel('반복 횟수 · iterations (회)', { exact: true }).fill('4');
    await panel(page, '보관함');
    await page.getByRole('button', { name: /설정 복원$/ }).click();
    await panel(page, '조건');
    await expect(page.getByLabel('반복 횟수 · iterations (회)', { exact: true })).toHaveValue('3');
    await panel(page, '내보내기');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '모의 설정 JSON 다운로드' }).click();
    const download = await pending;
    const payload = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(payload).toMatchObject({
      schema: 'pendulum-lab-mock/v1',
      mode: 'mock',
      scientificResults: false,
      settings: { systemId: 'system:standard-map', fields: { iterations: '3' } }
    });
    expect(payload.settings.analysisIds).toHaveLength(1);
    await panel(page, '보관함');
    await page.getByRole('button', { name: /보관 해제$/ }).click();
    await expect(page.locator('.lab-tray-entry')).toHaveCount(0);
    await openSystem(page, 'quantum-kicked-rotor');
    await panel(page, '분석');
    await expect(page.locator('.lab-analysis-choice')).toHaveCount(0);
    await expect(page.getByText('검색 조건과 호환되는 분석이 없습니다.', { exact: true })).toBeVisible();
  });

  test('preserves each system draft and cancels execution when navigating away', async ({ page }) => {
    await openSystem(page);
    await panel(page, '조건');
    await page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true }).fill('7');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.getByRole('link', { name: '균일 막대 복합 이중 진자 선택하고 설정하기', exact: true }).click();
    await panel(page, '조건');
    await expect(page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true })).toHaveValue('1');
    await page.goBack();
    await page.getByRole('link', { name: '점질량 이중 진자 선택하고 설정하기', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
    await panel(page, '조건');
    await expect(page.getByLabel('첫 번째 질량 · m1 (kg)', { exact: true })).toHaveValue('7');
  });

  test('supports keyboard panel navigation and 320px/200% reflow with no axe violations', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openSystem(page, 'spherical');
    const workspace = page.getByRole('tab', { name: '작업 공간', exact: true });
    await workspace.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
    for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
      await panel(page, name);
      await withinViewport(page);
      await audit(page);
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await withinViewport(page);
    await audit(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '';
    });
    await page.setViewportSize({ width: 640, height: 900 });
    await withinViewport(page);
    await audit(page);
  });

  test('keeps the library baseline and reviews retained mock workspace light/dark visuals', async ({ page }) => {
    await page.goto('/next.html#/lab');
    await page.getByLabel('시스템 패밀리').selectOption('classical');
    await audit(page);
    await expect(page).toHaveScreenshot('s10-lab-library-light.png', { fullPage: true });
    // S07 promotes double/compound to real engines. The original S06 double
    // images remain historical evidence; retained mock visuals get distinct names.
    await openSystem(page, 'spherical');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page).toHaveScreenshot('lab-mock-workspace-light.png', { fullPage: true });
    await page.locator('#product-theme').selectOption('dark');
    await panel(page, '조건');
    await audit(page);
    await expect(page).toHaveScreenshot('lab-mock-inspector-dark.png', { fullPage: true });
  });
});
