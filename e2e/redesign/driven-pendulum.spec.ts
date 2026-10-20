import { expectLegacyPanelScreenshot } from './legacy-layout';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['driven', 'coupled', 'inverted', 'cartpole', 'parametric'];
const workspace = (page: Page) => page.locator('.driven-workspace');
async function open(page: Page, slug = 'driven') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function settled(page: Page) {
  await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
}
async function apply(page: Page) {
  await page.getByRole('button', { name: '조건 적용', exact: true }).click();
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!, 'utf8');
}
async function importState(page: Page, json: string) {
  await page.locator('#driven-import').setInputFiles({
    name: 'state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json)
  });
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) }))).toEqual(
    []
  );
}
async function viewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S13 driven and controlled systems laboratory', () => {
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

  for (const slug of slugs) {
    test(`${slug}: worker run, pause, step, progress, cancel and numerical exports`, async ({ page }) => {
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
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'running');
      await panel(page, '조건');
      await expect(page.locator('#driven-length')).toBeDisabled();
      await panel(page, '내보내기');
      await expect(page.locator('#driven-import')).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
      await panel(page, '분석');
      const kinds = ['state', 'energy', 'phase'];
      if (slug !== 'coupled') kinds.push('input');
      if (['inverted', 'cartpole'].includes(slug)) kinds.push('error');
      for (const kind of kinds) {
        await page.locator('#driven-plot-kind').selectOption(kind);
        await expect(workspace(page)).not.toContainText(/NaN|Infinity/);
      }
      await panel(page, '내보내기');
      const csv = await download(page, '궤적 CSV 다운로드');
      expect(csv).toContain('time_s');
      expect(csv).not.toMatch(/NaN|Infinity/);
      expect(csv.trim().split(/\r?\n/).length).toBeGreaterThan(2);
      expect(await download(page, '그림 SVG 다운로드')).toContain('<svg');
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });

    test(`${slug}: atomic edits, save, reload, share and canonical state import`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#driven-length').fill('1.25');
      await page.locator('#driven-state-0').fill('0.3');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await panel(page, '조건');
      await expect(page.locator('#driven-length')).toHaveValue('1.25');
      await expect(page.locator('#driven-state-0')).toHaveValue('0.3');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      expect(JSON.parse(json).systemId).toBe(`system:${slug}`);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '조건');
      await expect(page.locator('#driven-length')).toHaveValue('1.25');
      await page.locator('#driven-length').fill('-1');
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await panel(page, '내보내기');
      await importState(page, json);
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(JSON.parse(json));
      await panel(page, '조건');
      await expect(page.locator('#driven-length')).toHaveValue('1.25');
    });
  }

  for (const slug of ['driven', 'parametric', 'cartpole']) {
    test(`${slug}: forcing waveform, angular frequency and phase survive save/share/import`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#driven-waveform').selectOption('triangle');
      await page.locator('#driven-amplitude').fill('0.4');
      await page.locator('#driven-frequency').fill('2.75');
      await page.locator('#driven-phase').fill('0.42');
      await apply(page);
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await page.reload();
      await panel(page, '조건');
      await expect(page.locator('#driven-waveform')).toHaveValue('triangle');
      await expect(page.locator('#driven-frequency')).toHaveValue('2.75');
      await expect(page.locator('#driven-phase')).toHaveValue('0.42');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '내보내기');
      expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(JSON.parse(json));
      await importState(page, json);
      await panel(page, '조건');
      await expect(page.locator('#driven-frequency')).toHaveValue('2.75');
      await expect(page.locator('#driven-phase')).toHaveValue('0.42');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'paused');
    });
  }

  test('controller is offered only for compatible inverted and cart-pole plants', async ({ page }) => {
    for (const slug of slugs) {
      await open(page, slug);
      await panel(page, '조건');
      if (['inverted', 'cartpole'].includes(slug)) {
        await expect(page.locator('#driven-controller-enabled')).toBeVisible();
        await expect(page.locator('#driven-controller-enabled')).not.toBeChecked();
      } else await expect(page.locator('#driven-controller-enabled')).toHaveCount(0);
    }
  });

  for (const slug of ['inverted', 'cartpole']) {
    test(`${slug}: separate controller settings, saturated output and invalid gain recovery`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#driven-controller-enabled').check();
      await page.locator('#driven-kp').fill('100');
      await page.locator('#driven-maxOutput').fill('0.01');
      await apply(page);
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      await panel(page, '작업 공간');
      await expect(page.locator('#driven-warnings')).toContainText('포화');
      expect(Math.abs(Number(await page.locator('#driven-control').getAttribute('data-control')))).toBeCloseTo(
        0.01,
        12
      );
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      const csv = await download(page, '궤적 CSV 다운로드');
      const [header, ...rows] = csv.trim().split(/\r?\n/);
      const controlColumn = header!.split(',').indexOf(slug === 'cartpole' ? 'control_N' : 'control_rad_s2');
      expect(controlColumn).toBeGreaterThan(0);
      expect(rows.every((row) => Math.abs(Number(row.split(',')[controlColumn])) <= 0.01)).toBe(true);
      expect(csv).not.toMatch(/NaN|Infinity/);
      await panel(page, '조건');
      await page.locator('#driven-kp').fill('-1');
      await apply(page);
      await expect(page.getByRole('button', { name: /^실행(?: 계속)?$/ })).toBeDisabled();
      await panel(page, '내보내기');
      await importState(page, json);
      await panel(page, '조건');
      await expect(page.locator('#driven-controller-enabled')).toBeChecked();
      await expect(page.locator('#driven-kp')).toHaveValue('100');
      await expect(page.locator('#driven-maxOutput')).toHaveValue('0.01');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
    });
  }

  test('closed-loop safe limit stops at the last finite state and can be corrected', async ({ page }) => {
    await open(page, 'inverted');
    await panel(page, '조건');
    await page.locator('#driven-controller-enabled').check();
    await page.locator('#driven-state-0').fill('1.5');
    await page.locator('#driven-state-1').fill('10');
    await page.locator('#driven-maxOutput').fill('0.01');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await settled(page);
    await expect(page.getByRole('alert')).toContainText(/제어|안전|범위/);
    const stoppedAt = Number(await page.locator('#lab-time').getAttribute('data-time'));
    expect(stoppedAt).toBeGreaterThanOrEqual(0);
    expect(stoppedAt).toBeLessThan(0.1);
    await panel(page, '내보내기');
    expect(await download(page, '궤적 CSV 다운로드')).not.toMatch(/NaN|Infinity/);
    await panel(page, '조건');
    await page.locator('#driven-state-0').fill('0.02');
    await page.locator('#driven-state-1').fill('0');
    await page.locator('#driven-maxOutput').fill('10');
    await apply(page);
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'paused');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
  });

  test('bounded resonance sweep runs and cancels without changing the experiment', async ({ page }) => {
    await open(page);
    await panel(page, '내보내기');
    const expected = JSON.parse(await download(page, '상태 JSON 다운로드'));
    await panel(page, '분석');
    await page.locator('#driven-sweep-start').fill('0.5');
    await page.locator('#driven-sweep-end').fill('1.5');
    await page.locator('#driven-sweep-count').fill('3');
    await page.getByRole('button', { name: '실행 주파수 스윕', exact: true }).click();
    await expect(page.getByRole('button', { name: '스윕 취소', exact: true })).toBeDisabled();
    await expect(page.locator('#driven-sweep-results')).toContainText('0.5');
    await expect(page.locator('#driven-sweep-results')).not.toContainText(/NaN|Infinity/);
    await panel(page, '조건');
    await page.locator('#driven-amplitude').fill('0.5');
    await apply(page);
    expected.parameters.forcingAmplitude.value = 0.5;
    await panel(page, '분석');
    await expect(page.locator('#driven-sweep-results')).toContainText('완료된 주파수 결과가 없습니다.');
    await expect(page.locator('#driven-sweep-status')).toContainText('준비 완료');
    await page.locator('#driven-sweep-count').fill('6');
    await page.getByRole('button', { name: '실행 주파수 스윕', exact: true }).click();
    await page.getByRole('button', { name: '스윕 취소', exact: true }).click();
    await expect(page.locator('#driven-sweep-status')).toContainText('취소');
    await page.locator('#driven-sweep-count').fill('7');
    await page.getByRole('button', { name: '실행 주파수 스윕', exact: true }).click();
    await expect(page.locator('#driven-sweep-error')).toContainText('2–6');
    await panel(page, '내보내기');
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(expected);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  test('unsupported, unsafe and oversized imports preserve the valid experiment', async ({ page }) => {
    await open(page);
    await panel(page, '내보내기');
    const valid = JSON.parse(await download(page, '상태 JSON 다운로드'));
    for (const raw of [
      '{"__proto__":{"polluted":true}}',
      ' '.repeat(200001),
      JSON.stringify({ ...valid, modelVersion: 'future' }),
      JSON.stringify({ ...valid, analyses: [{ id: 'analysis:lyapunov', parameters: {} }] })
    ]) {
      await importState(page, raw);
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
    }
    expect(JSON.parse(await download(page, '상태 JSON 다운로드'))).toEqual(valid);
  });

  test('corrupt saved settings remain intact when saving is attempted', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pendulum-product/driven/v1/system:driven', 'future-original'));
    await open(page);
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/driven/v1/system:driven'))).toBe(
      'future-original'
    );
  });

  test('worker startup error recovers and leaving the route terminates execution', async ({ page }) => {
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
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.goBack();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard, accessibility and 320px preserve control access: ${name}`, async ({ page }) => {
      await open(page, 'cartpole');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      await audit(page);
    });
  }

  test('accessibility and 200% zoom preserve forcing and controller access', async ({ page }) => {
    await open(page, 'cartpole');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await page.locator('#driven-controller-enabled').check();
    await viewport(page);
    await audit(page);
  });

  test('full rotations keep downward and upright plant bobs within the scene', async ({ page }) => {
    for (const slug of ['driven', 'inverted']) {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#driven-state-0').fill(String(Math.PI));
      await apply(page);
      await panel(page, '작업 공간');
      const circles = await page.locator('.driven-scene svg circle').evaluateAll((bobs) =>
        bobs.map((bob) => ({
          x: Number(bob.getAttribute('cx')),
          y: Number(bob.getAttribute('cy')),
          radius: Number(bob.getAttribute('r'))
        }))
      );
      expect(circles).toHaveLength(1);
      for (const bob of circles) {
        expect(bob.x - bob.radius).toBeGreaterThanOrEqual(0);
        expect(bob.x + bob.radius).toBeLessThanOrEqual(640);
        expect(bob.y - bob.radius).toBeGreaterThanOrEqual(0);
        expect(bob.y + bob.radius).toBeLessThanOrEqual(320);
      }
    }
  });

  test('frozen driven workspace, cart-pole controller and response layouts', async ({ page }) => {
    await open(page);
    await expectLegacyPanelScreenshot(page, 's13-driven-workspace-light.png');
    await open(page, 'cartpole');
    await panel(page, '조건');
    await page.locator('#driven-controller-enabled').check();
    await apply(page);
    await page.getByLabel('화면 테마', { exact: true }).selectOption('dark');
    await expectLegacyPanelScreenshot(page, 's13-cartpole-controller-dark.png');
    await page.locator('#driven-duration').fill('0.2');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '분석');
    await page.locator('#driven-plot-kind').selectOption('error');
    await expectLegacyPanelScreenshot(page, 's13-response-analysis-dark.png');
  });
});
