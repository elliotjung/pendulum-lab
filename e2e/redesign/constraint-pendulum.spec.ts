import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(page: Page, slug = 'rope') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function settled(page: Page) {
  await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-busy', 'false');
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

test.describe('S11 spring, rope and double-string laboratory', () => {
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

  for (const slug of ['spring', 'rope', 'double-string']) {
    test(`${slug}: worker run/pause/step/cancel and numeric exports`, async ({ page }) => {
      await open(page, slug);
      await expect(page.getByRole('button', { name: '다음 사건', exact: true })).toBeHidden();
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
      await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'running');
      await panel(page, '조건');
      await expect(page.locator('#constraint-preset')).toBeDisabled();
      await panel(page, '내보내기');
      await expect(page.locator('#constraint-import')).toBeDisabled();
      await expect(page.getByRole('button', { name: '상태 JSON 다운로드', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'cancelled');
      await panel(page, '내보내기');
      const csv = await download(page, '궤적 CSV 다운로드');
      expect(csv).toContain('time_s');
      expect(csv).toContain('tension');
      expect(csv).toContain('length');
      expect(csv).not.toMatch(/NaN|Infinity/);
      expect(csv.trim().split('\r\n').length).toBeGreaterThan(2);
      const svg = await download(page, '그림 SVG 다운로드');
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/NaN|Infinity/);
      // These low-amplitude defaults have no unilateral-constraint transitions.
      // Spring has no rope events at all; event exports are exercised with release presets below.
      await expect(page.getByRole('button', { name: '사건 CSV 다운로드', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });

    test(`${slug}: edit/save/reload/share/import preserve initial conditions`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      const mass = slug === 'double-string' ? 'm1' : 'mass';
      const theta = slug === 'double-string' ? 'theta1' : 'theta';
      const omega = slug === 'double-string' ? 'omega1' : 'omega';
      await page.locator(`#constraint-${mass}`).fill('2.5');
      await page.locator(`#constraint-${theta}`).fill('0.7');
      await page.locator(`#constraint-${omega}`).fill('0.4');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await panel(page, '조건');
      await expect(page.locator(`#constraint-${mass}`)).toHaveValue('2.5');
      await expect(page.locator(`#constraint-${omega}`)).toHaveValue('0.4');
      await panel(page, '내보내기');
      const json = await download(page, '상태 JSON 다운로드');
      const state = JSON.parse(json);
      expect(state.parameters[mass].value).toBe(2.5);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      await panel(page, '조건');
      await expect(page.locator(`#constraint-${theta}`)).toHaveValue('0.7');
      await panel(page, '내보내기');
      await page.locator('#constraint-import').setInputFiles({
        name: 'state.json',
        mimeType: 'application/json',
        buffer: Buffer.from(json)
      });
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
    });

    test(`${slug}: comparison settings survive route return and remain isolated`, async ({ page }) => {
      await open(page, slug);
      const mass = slug === 'double-string' ? 'm1' : 'mass';
      await panel(page, '조건');
      await page.locator(`#constraint-${mass}`).fill('2.5');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 보관', exact: true }).click();
      await panel(page, '조건');
      await page.locator(`#constraint-${mass}`).fill('3.5');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
      await page.evaluate(
        (other) => {
          location.hash = `#/lab/${other}`;
        },
        slug === 'spring' ? 'rope' : 'spring'
      );
      await panel(page, '보관함');
      await expect(page.getByText('보관한 설정이 없습니다.', { exact: true })).toBeVisible();
      await page.goBack();
      await page.goBack();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
      await panel(page, '조건');
      await expect(page.locator(`#constraint-${mass}`)).toHaveValue('3.5');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '설정 1 설정 복원', exact: true }).click();
      await panel(page, '조건');
      await expect(page.locator(`#constraint-${mass}`)).toHaveValue('2.5');
      await page.reload();
      await panel(page, '보관함');
      await expect(page.getByText('보관한 설정이 없습니다.', { exact: true })).toBeVisible();
    });
  }

  for (const [slug, preset, phase, link] of [
    ['rope', 'rope-release', 'slack', 'inner'],
    ['double-string', 'double-outer-release', 'outer-slack', 'outer']
  ]) {
    test(`${slug}: release preset, capture timeline, compatible analyses and event exports`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await expect(page.locator('#constraint-integrator')).toHaveCount(0);
      await page.locator('#constraint-preset').selectOption(preset!);
      await page.getByRole('button', { name: '프리셋 적용', exact: true }).click();
      await page.locator('#constraint-duration').fill('0.8');
      await panel(page, '작업 공간');
      await expect(page.locator('#constraint-phase')).toHaveAttribute('data-phase', phase!);
      await expect(page.locator('[data-link-phase="slack"]')).toHaveCount(1);
      await expect(page.locator('#constraint-event-rows tr')).toHaveCount(1);
      await expect(page.locator('#constraint-event-rows tr')).toHaveAttribute('data-time', '0');
      await expect(page.locator('#constraint-event-rows tr')).toHaveAttribute('data-event-type', 'slack');
      await page.locator('#constraint-speed').selectOption('4');
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'completed');
      await expect(page.locator('#constraint-event-rows tr[data-event-type="capture"]')).toHaveCount(1);
      await expect(page.locator('#constraint-event-rows')).not.toContainText(/NaN|Infinity/);
      await panel(page, '분석');
      await expect(page.locator('#constraint-plot-kind option')).toHaveText([
        '길이 / 시간',
        '장력 / 시간',
        '에너지',
        'Cartesian 궤적'
      ]);
      await page.locator('#constraint-plot-kind').selectOption('energy');
      await expect(page.locator('#constraint-plot-link')).toBeDisabled();
      await expect(page.locator('.constraint-plot-description')).toContainText('누적 포획 손실');
      await page.locator('#constraint-plot-kind').selectOption('tension');
      await expect(page.locator('#constraint-plot-link')).toBeEnabled();
      await page.locator('#constraint-plot-link').selectOption(slug === 'double-string' ? '1' : '0');
      await panel(page, '내보내기');
      const events = await download(page, '사건 CSV 다운로드');
      const [header, ...rows] = events.trim().split('\r\n');
      expect(header).toBe('sequence,time_s,type,link,source,energy_loss_J,residual,residual_unit');
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const cells = rows.map((row) => row.split(','));
      expect(cells[0]).toEqual(['0', '0', 'slack', link, 'initial-condition', '0', expect.any(String), 'N']);
      expect(cells.some((row) => row[2] === 'capture' && row[4] === 'integration' && Number(row[5]) > 0)).toBe(true);
      for (let index = 0; index < cells.length; index++) {
        const row = cells[index]!;
        expect(Number(row[0])).toBe(index);
        expect([1, 5, 6].every((column) => Number.isFinite(Number(row[column])))).toBe(true);
        expect(Number(row[1])).toBeGreaterThanOrEqual(index ? Number(cells[index - 1]![1]) : 0);
        expect(row[7]).toBe(row[2] === 'slack' ? 'N' : 'm');
      }
      const svg = await download(page, '그림 SVG 다운로드');
      const metadata = await page.evaluate(
        (source) =>
          JSON.parse(new DOMParser().parseFromString(source, 'image/svg+xml').querySelector('metadata')!.textContent!),
        svg
      );
      expect(metadata).toMatchObject({
        schema: 'pendulum-constraint-figure/v1',
        kind: 'tension',
        selectedLink: slug === 'double-string' ? 1 : 0
      });
      expect(svg).not.toMatch(/NaN|Infinity/);
    });
  }

  test('spring canonical near-origin settings import, reload and remain editable', async ({ page }) => {
    await open(page, 'spring');
    await panel(page, '내보내기');
    const state = JSON.parse(await download(page, '상태 JSON 다운로드'));
    state.initialConditions.r.value = 0.00001;
    state.initialConditions.theta.value = 0;
    state.initialConditions.rDot.value = 0;
    state.initialConditions.omega.value = 0;
    await page.locator('#constraint-import').setInputFiles({
      name: 'small-radius.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(state))
    });
    await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
    await panel(page, '조건');
    await expect(page.locator('#constraint-r')).toHaveValue('0.00001');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await page.reload();
    await panel(page, '조건');
    await expect(page.locator('#constraint-r')).toHaveValue('0.00001');
    await page.locator('#constraint-r').fill('1.3');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'paused');
  });

  test('plots refresh when initial conditions change and reset discards computed samples', async ({ page }) => {
    await open(page, 'spring');
    await panel(page, '분석');
    await expect(page.locator('.constraint-plot-description')).toContainText('1.3000–1.3000 m');
    await panel(page, '조건');
    await page.locator('#constraint-r').fill('1.7');
    await panel(page, '분석');
    await expect(page.locator('.constraint-plot-description')).toContainText('1.7000–1.7000 m');
    await expect(page.locator('.core-plot')).toContainText('1.200');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('.core-plot path[stroke="#075985"]')).toHaveAttribute('d', /L/);
    await page.getByRole('button', { name: '처음으로', exact: true }).click();
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    await expect(page.locator('.constraint-plot-description')).toContainText('1.7000–1.7000 m');
    await expect(page.locator('.core-plot path[stroke="#075985"]')).not.toHaveAttribute('d', /L/);
  });

  test('invalid form edits can recover from JSON or retained comparison settings', async ({ page }) => {
    await open(page);
    await panel(page, '내보내기');
    const original = await download(page, '상태 JSON 다운로드');
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 보관', exact: true }).click();
    await panel(page, '조건');
    await page.locator('#constraint-mass').fill('-1');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await panel(page, '내보내기');
    await expect(page.locator('#constraint-import')).toBeEnabled();
    await expect(page.getByRole('button', { name: '상태 JSON 다운로드', exact: true })).toBeDisabled();
    await page
      .locator('#constraint-import')
      .setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(original) });
    await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
    await panel(page, '조건');
    await expect(page.locator('#constraint-mass')).toHaveValue('1');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
    await page.locator('#constraint-mass').fill('-1');
    await panel(page, '보관함');
    await page.getByRole('button', { name: '설정 1 설정 복원', exact: true }).click();
    await panel(page, '조건');
    await expect(page.locator('#constraint-mass')).toHaveValue('1');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  });

  test('invalid edits and unsafe, oversized or unsupported imports preserve valid settings', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#constraint-mass').fill('-1');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await expect(page.locator('#constraint-mass')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#constraint-mass').fill('2');
    await panel(page, '내보내기');
    const valid = JSON.parse(await download(page, '상태 JSON 다운로드'));
    for (const raw of [
      '{"__proto__":{"polluted":true}}',
      ' '.repeat(200001),
      JSON.stringify({ ...valid, modelVersion: 'future' }),
      JSON.stringify({ ...valid, systemId: 'system:spring' }),
      JSON.stringify({ ...valid, analyses: [{ id: 'analysis:lyapunov', parameters: {} }] })
    ]) {
      await page.locator('#constraint-import').setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(raw)
      });
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
    }
    const final = JSON.parse(await download(page, '상태 JSON 다운로드'));
    expect(final).toEqual(valid);
  });

  test('corrupt saved settings remain intact and cannot be overwritten', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/constraint/v1/system:rope', 'future-original')
    );
    await open(page);
    await expect(page.getByText('원본은 보존되며', { exact: false })).toBeVisible();
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/constraint/v1/system:rope'))).toBe(
      'future-original'
    );
  });

  test('worker startup failure recovers and route departure stops active work', async ({ page }) => {
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
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'error');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await page.goBack();
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  test('spring singularity stops at the last valid sample and a preset recovers execution', async ({ page }) => {
    await open(page, 'spring');
    await panel(page, '조건');
    for (const [id, value] of Object.entries({
      stiffness: '0',
      g: '0',
      r: '0.051',
      theta: '0',
      rDot: '-1',
      omega: '0',
      step: '0.05',
      duration: '1'
    })) {
      await page.locator(`#constraint-${id}`).fill(value);
    }
    await page.locator('#constraint-integrator').selectOption('integrator:euler');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'error');
    await settled(page);
    await expect(page.getByRole('alert')).toContainText('특이점');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.05');
    await panel(page, '내보내기');
    const csv = await download(page, '궤적 CSV 다운로드');
    expect(csv).not.toMatch(/NaN|Infinity/);
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(Number(rows.at(-1)!.split(',')[0])).toBe(0.05);
    await panel(page, '조건');
    await page.locator('#constraint-preset').selectOption('default');
    await page.getByRole('button', { name: '프리셋 적용', exact: true }).click();
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await expect(page.locator('.constraint-workspace')).toHaveAttribute('data-lab-status', 'paused');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0.002');
  });

  test('keyboard, axe, 320px and 200% zoom retain numeric and event access', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 320, height: 850 });
    await viewport(page);
    await audit(page);
    await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
    await panel(page, '조건');
    await viewport(page);
    await audit(page);
    await page.locator('#constraint-mass').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#constraint-length')).toBeFocused();
    await page.locator('#constraint-theta').fill('0.2');
    await page.getByRole('button', { name: '한 단계', exact: true }).click();
    await settled(page);
    await panel(page, '분석');
    await page.locator('#constraint-plot-kind').selectOption('tension');
    await viewport(page);
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    await viewport(page);
    await panel(page, '내보내기');
    await expect(page.getByRole('button', { name: '사건 CSV 다운로드' })).toBeVisible();
    await audit(page);
    await panel(page, '조건');
    await page.locator('#constraint-preset').selectOption('rope-release');
    await page.getByRole('button', { name: '프리셋 적용', exact: true }).click();
    await panel(page, '작업 공간');
    const events = page.getByRole('region', { name: '이완과 포획 사건 목록', exact: true });
    await events.focus();
    await expect(events).toBeFocused();
    await expect(page.locator('#constraint-event-rows')).toContainText('초기조건');
    await viewport(page);
    await audit(page);
  });

  test('frozen light/dark spring and slack rope layouts', async ({ page }) => {
    await open(page, 'spring');
    await expect(page).toHaveScreenshot('s11-spring-workspace-light.png', { fullPage: true });
    await panel(page, '조건');
    await page.getByLabel('화면 테마', { exact: true }).selectOption('dark');
    await expect(page).toHaveScreenshot('s11-spring-inspector-dark.png', { fullPage: true });
    await open(page);
    await panel(page, '조건');
    await page.locator('#constraint-theta').fill('2.5');
    await page.locator('#constraint-omega').fill('0');
    await panel(page, '작업 공간');
    await expect(page).toHaveScreenshot('s11-rope-slack-dark.png', { fullPage: true });
    await open(page, 'double-string');
    await panel(page, '조건');
    await page.locator('#constraint-preset').selectOption('double-outer-release');
    await page.getByRole('button', { name: '프리셋 적용', exact: true }).click();
    await panel(page, '작업 공간');
    await expect(page).toHaveScreenshot('s11-double-string-outer-slack-dark.png', { fullPage: true });
  });
});
