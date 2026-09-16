import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultChainConfig, toCanonicalChain } from '../../src/product/adapters/physics/chain';
import { serializeChainConfig } from '../../src/product/lab/views/chain-storage';

async function open(page: Page, slug = 'chain') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function settled(page: Page) {
  await expect(page.locator('.chain-workspace')).toHaveAttribute('data-busy', 'false');
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}
async function viewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test.describe('S10 triple and N-chain laboratory', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on('pageerror', (e) => list.push(e.message));
  });
  test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
  for (const slug of ['triple', 'chain']) {
    test(`${slug}: worker run/pause/step/cancel and full variable-DOF CSV/SVG`, async ({ page }) => {
      await open(page, slug);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await settled(page);
      const before = Number(await page.locator('#lab-time').getAttribute('data-time'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(before + 0.002, 10);
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
      await panel(page, '내보내기');
      const csv = await download(page, '궤적 CSV 다운로드');
      const n = slug === 'triple' ? 3 : 4;
      expect(csv.split('\r\n')[0]!.split(',')).toHaveLength(2 * n + 4);
      expect(csv).toContain(`omega${n}_rad_s`);
      const svg = await download(page, '그림 SVG 다운로드');
      expect(svg).toContain('pendulum-chain-figure/v1');
      expect(svg).not.toContain('NaN');
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });
    test(`${slug}: comparison settings survive route return and stay isolated`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#chain-mass').fill('2.5');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 보관', exact: true }).click();
      await panel(page, '조건');
      await page.locator('#chain-mass').fill('3.5');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
      await page.evaluate(
        (other) => {
          location.hash = `#/lab/${other}`;
        },
        slug === 'triple' ? 'chain' : 'triple'
      );
      await panel(page, '보관함');
      await expect(page.getByText('보관한 설정이 없습니다.', { exact: true })).toBeVisible();
      await page.goBack();
      await page.goBack();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      await panel(page, '조건');
      await expect(page.locator('#chain-mass')).toHaveValue('3.5');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '설정 1 설정 복원', exact: true }).click();
      await panel(page, '조건');
      await expect(page.locator('#chain-mass')).toHaveValue('2.5');
      await page.reload();
      await panel(page, '보관함');
      await expect(page.getByText('보관한 설정이 없습니다.', { exact: true })).toBeVisible();
    });
    test(`${slug}: edit/save/reload/share/import preserve SI vectors`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#chain-selected-link').selectOption('1');
      await page.locator('#chain-mass').fill('2.5');
      await page.locator('#chain-theta').fill('0.7');
      await page.locator('#chain-omega').fill('0.4');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('초기조건과 분석 설정을 저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await panel(page, '조건');
      await page.locator('#chain-selected-link').selectOption('1');
      await expect(page.locator('#chain-mass')).toHaveValue('2.5');
      await expect(page.locator('#chain-omega')).toHaveValue('0.4');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      const state = JSON.parse(json);
      expect(state.parameters.masses.values[1]).toBe(2.5);
      expect(state.initialConditions.theta.values[1]).toBe(0.7);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '조건');
      await page.locator('#chain-selected-link').selectOption('1');
      await expect(page.locator('#chain-theta')).toHaveValue('0.7');
      await panel(page, '내보내기');
      await page
        .locator('#chain-import')
        .setInputFiles({ name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
    });
  }
  test('middle insertion/deletion and bulk preserve all matching link values', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#chain-selected-link').selectOption('1');
    await page.locator('#chain-mass').fill('2');
    await page.locator('#chain-theta').fill('0.8');
    await page.locator('#chain-omega').fill('0.3');
    await page.getByRole('button', { name: '선택한 링크 뒤에 추가' }).click();
    await expect(page.locator('#chain-count')).toHaveValue('5');
    await expect(page.locator('#chain-selected-link')).toBeFocused();
    await page.getByRole('button', { name: '선택한 링크 삭제' }).click();
    await expect(page.locator('#chain-count')).toHaveValue('4');
    await page.locator('#chain-selected-link').selectOption('1');
    await expect(page.locator('#chain-mass')).toHaveValue('2');
    await expect(page.locator('#chain-omega')).toHaveValue('0.3');
    await page.locator('#chain-bulk-field').selectOption('length');
    await page.locator('#chain-bulk-value').fill('0.5');
    await page.getByRole('button', { name: '모든 링크에 일괄 적용' }).click();
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    expect(state.parameters.lengths.values).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(state.parameters.masses.values[1]).toBe(2);
    expect(state.initialConditions.omega.values[1]).toBe(0.3);
  });
  test('N boundaries run in worker, responsive cancellation and preset recovery', async ({ page }, info) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#chain-count').selectOption('1');
    await expect(page.getByRole('button', { name: '선택한 링크 삭제' })).toBeDisabled();
    await page.locator('#chain-count').selectOption('128');
    await expect(page.getByRole('button', { name: '선택한 링크 뒤에 추가' })).toBeDisabled();
    await expect(page.getByText('링크가 많아 계산이 느려질 수 있습니다.', { exact: false })).toBeVisible();
    await panel(page, '작업 공간');
    const started = Date.now();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    const firstSampleMs = Date.now() - started;
    expect(firstSampleMs).toBeLessThan(5000);
    const cancelStarted = Date.now();
    await page.getByRole('button', { name: '실행 취소' }).click();
    await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
    const cancelMs = Date.now() - cancelStarted;
    expect(cancelMs).toBeLessThan(2000);
    await info.attach('N128 UI timing', {
      body: JSON.stringify({ firstSampleMs, cancelMs }),
      contentType: 'application/json'
    });
    await panel(page, '조건');
    await page.locator('#chain-preset').selectOption('chain-cascade');
    await page.getByRole('button', { name: '프리셋 적용' }).click();
    await expect(page.locator('#chain-count')).toHaveValue('4');
    await expect(page.locator('#chain-step')).toHaveValue('0.003');
  });
  test('invalid edits and malicious/oversized/wrong-system imports preserve source settings', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#chain-mass').fill('-1');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await expect(page.locator('#chain-mass')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#chain-mass').fill('2');
    await panel(page, '내보내기');
    for (const raw of [
      '{"__proto__":{"x":true}}',
      ' '.repeat(200001),
      serializeChainConfig(defaultChainConfig('system:triple'))
    ]) {
      await page
        .locator('#chain-import')
        .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
    }
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    expect(state.parameters.masses.values[0]).toBe(2);
  });
  test('corrupt saved configuration remains intact and refuses overwrite', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pendulum-product/chain/v1/system:chain', 'future-original'));
    await open(page);
    await expect(page.getByText('원본은 보존되며', { exact: false })).toBeVisible();
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/chain/v1/system:chain'))).toBe(
      'future-original'
    );
  });
  test('worker startup failure is recoverable and route departure terminates active work', async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      let fail = true;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) {
            fail = false;
            throw new Error('test worker unavailable');
          }
          super(url, options);
        }
      };
    });
    await open(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'error');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.goBack();
    await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });
  test('unsupported canonical version has a recoverable error view', async ({ page }) => {
    // Valid transport structure reaches the versioned adapter's error boundary.
    const canonical = toCanonicalChain(defaultChainConfig());
    expect(canonical.ok).toBe(true);
    await open(page);
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    state.modelVersion = 'future';
    await page
      .locator('#chain-import')
      .setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await expect(page.getByRole('alert')).toContainText('지원하지 않는');
  });
  test('keyboard, axe, 320px and 200% zoom preserve editing and numeric access', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 320, height: 850 });
    await viewport(page);
    await audit(page);
    await panel(page, '조건');
    await viewport(page);
    await audit(page);
    await page.locator('#chain-selected-link').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.locator('#chain-count')).toBeFocused();
    await page.locator('#chain-theta').fill('0.2');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await panel(page, '분석');
    await page.locator('#chain-plot-link').selectOption('3');
    await page.locator('#chain-plot-kind').selectOption('phase');
    await viewport(page);
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    await viewport(page);
    await panel(page, '내보내기');
    await expect(page.getByRole('button', { name: '상태 JSON 다운로드' })).toBeVisible();
    await audit(page);
  });
  test('frozen light/dark workspace, inspector and selected-link plots', async ({ page }) => {
    await open(page, 'triple');
    await expect(page).toHaveScreenshot('s10-triple-workspace-light.png', { fullPage: true });
    await panel(page, '조건');
    await page.getByLabel('화면 테마', { exact: true }).selectOption('dark');
    await expect(page).toHaveScreenshot('s10-triple-inspector-dark.png', { fullPage: true });
    await page.locator('#chain-duration').fill('0.02');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.chain-workspace')).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '분석');
    await page.locator('#chain-plot-link').selectOption('2');
    await expect(page).toHaveScreenshot('s10-triple-analysis-dark.png', { fullPage: true });
  });
  test('frozen N-chain workspace and maximum-link inspector', async ({ page }) => {
    await open(page);
    await expect(page).toHaveScreenshot('s10-chain-workspace-light.png', { fullPage: true });
    await panel(page, '조건');
    await page.locator('#chain-count').selectOption('128');
    await page.locator('#chain-selected-link').selectOption('127');
    await expect(page).toHaveScreenshot('s10-chain-128-inspector-light.png', { fullPage: true });
  });
});
