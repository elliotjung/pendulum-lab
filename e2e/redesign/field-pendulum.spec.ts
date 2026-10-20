import { expectLegacyPanelScreenshot } from './legacy-layout';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['langevin', 'fput', 'lattice-fk-limit', 'sine-gordon', 'frenkel-kontorova'];
const evolving = ['langevin', 'fput', 'sine-gordon'];
const workspace = (page: Page) => page.locator('.field-workspace');
async function open(page: Page, slug = 'langevin') {
  await page.goto(`/next.html#/lab/${slug}`);
  await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
}
async function panel(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
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
async function canonical(page: Page) {
  await panel(page, '내보내기');
  return JSON.parse(await download(page, '상태 JSON 다운로드'));
}
async function importState(page: Page, json: string) {
  await page.locator('#field-import').setInputFiles({
    name: 'field-state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json)
  });
}
async function shortRun(page: Page) {
  await panel(page, '조건');
  await page.locator('#field-duration').fill('0.2');
  await apply(page);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}
async function viewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('S16 stochastic lattice and field laboratory', () => {
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
    test(`${slug}: canonical settings save reload share and atomic import`, async ({ page }) => {
      await open(page, slug);
      const original = await canonical(page);
      expect(original.systemId).toBe(`system:${slug}`);
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
      expect(await canonical(page)).toEqual(original);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      expect(await canonical(page)).toEqual(original);
      await importState(page, JSON.stringify({ ...original, modelVersion: 'future' }));
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      expect(await canonical(page)).toEqual(original);
      await importState(page, JSON.stringify(original));
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      expect(await canonical(page)).toEqual(original);
    });
  }

  for (const slug of evolving) {
    test(`${slug}: worker pause step resume cancel and finite data`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      const step = Number(await page.locator('#field-step').inputValue());
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
      const before = Number(await page.locator('#lab-time').getAttribute('data-time'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(before + step, 10);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'running');
      await panel(page, '내보내기');
      await expect(page.locator('#field-import')).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
      const csv = await download(page, '기록 원본 CSV 다운로드');
      expect(csv).not.toMatch(/NaN|Infinity/);
      expect(csv.trim().split(/\r?\n/).length).toBeGreaterThan(2);
      expect(await download(page, '그림 SVG 다운로드')).toContain('<svg');
      const stopped = await page.locator('#lab-time').getAttribute('data-time');
      await panel(page, '분석');
      await page.locator('#field-plot-kind').selectOption('profile');
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', stopped!);
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });
  }

  test('seeded ensemble repeats exactly and exports member provenance', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#field-seed').fill('s16-browser-seed');
    await page.locator('#field-members').fill('4');
    await apply(page);
    await shortRun(page);
    await panel(page, '내보내기');
    const first = await download(page, '기록 원본 CSV 다운로드');
    const lineage = JSON.parse(await download(page, 'provenance JSON 다운로드'));
    expect(JSON.stringify(lineage)).toContain('s16-browser-seed');
    await page.getByRole('button', { name: '처음으로', exact: true }).click();
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    expect(await download(page, '기록 원본 CSV 다운로드')).toBe(first);
    await panel(page, '조건');
    await page.locator('#field-seed').fill('s16-other-seed');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '내보내기');
    expect(await download(page, '기록 원본 CSV 다운로드')).not.toBe(first);
  });

  test('sine-Gordon fixed and periodic boundaries survive canonical round trips', async ({ page }) => {
    await open(page, 'sine-gordon');
    for (const boundary of ['periodic', 'fixed']) {
      await panel(page, '조건');
      await page.locator('#field-boundary').selectOption(boundary);
      await apply(page);
      const original = await canonical(page);
      expect(original.modelOptions.boundary).toBe(boundary);
      await importState(page, JSON.stringify(original));
      expect(await canonical(page)).toEqual(original);
      await shortRun(page);
      await panel(page, '분석');
      await page.locator('#field-plot-kind').selectOption('heatmap');
      await expect(page.locator('#field-analysis')).toContainText(/가로축.+세로축/);
      await expect(page.locator('#field-analysis svg')).toBeVisible();
    }
  });

  test('invalid grids and CFL settings preserve applied state', async ({ page }) => {
    await open(page, 'sine-gordon');
    const original = await canonical(page);
    await panel(page, '조건');
    await page.locator('#field-points').fill('1000000');
    await apply(page);
    await expect(page.locator('#field-points')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '편집 취소', exact: true }).click();
    expect(await canonical(page)).toEqual(original);
    await panel(page, '조건');
    await page.locator('#field-length').fill('0.01');
    await apply(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: '편집 취소', exact: true }).click();
    expect(await canonical(page)).toEqual(original);
  });

  test('retained raw and downsampled exports disclose different sample counts and preserve endpoints', async ({
    page
  }) => {
    await open(page, 'fput');
    await panel(page, '조건');
    await page.locator('#field-step').fill('0.005');
    await page.locator('#field-duration').fill('2');
    await apply(page);
    await page.locator('#field-speed').selectOption('4');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '내보내기');
    const raw = (await download(page, '기록 원본 CSV 다운로드')).trim().split(/\r?\n/);
    const small = (await download(page, '축약 CSV 다운로드')).trim().split(/\r?\n/);
    expect(raw.length).toBeGreaterThan(small.length);
    expect(raw[0]).toContain('source_stride_steps');
    expect(raw[1]).toMatch(/^retained-raw,/);
    expect(small[1]).toMatch(/^downsampled,/);
    expect(raw[1]!.split(',').slice(1)).toEqual(small[1]!.split(',').slice(1));
    expect(raw.at(-1)!.split(',').slice(1)).toEqual(small.at(-1)!.split(',').slice(1));
    const provenance = JSON.parse(await download(page, 'provenance JSON 다운로드'));
    expect(provenance.recordedSamples).toBe(401);
    expect(provenance.lastStep).toBe(400);
    expect(provenance.sourceStrideSteps).toBe(1);
    await expect(page.locator('#field-export')).toContainText('미기록');
  });

  test('64-member worker stays responsive and cancellation prevents late samples', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#field-members').fill('64');
    await page.locator('#field-step').fill('0.001');
    await page.locator('#field-duration').fill('30');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await panel(page, '분석');
    await page.locator('#field-plot-kind').selectOption('ensemble');
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
    const stopped = await page.locator('#lab-time').getAttribute('data-time');
    expect(Number(stopped)).toBeLessThan(30);
    await page.locator('#field-plot-kind').selectOption('state');
    await panel(page, '작업 공간');
    await page.locator('#field-display-mode').selectOption('individual');
    await page.locator('#field-member-select').selectOption('63');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', stopped!);
    await panel(page, '내보내기');
    const provenance = JSON.parse(await download(page, 'provenance JSON 다운로드'));
    expect(provenance.memberSeeds).toHaveLength(64);
    expect(provenance.sourceStrideSteps).toBeGreaterThan(1);
  });

  test('unsafe imports and corrupt stored data preserve originals', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/field/v1/system:langevin', 'future-original')
    );
    await open(page);
    const original = await canonical(page);
    for (const raw of ['{"__proto__":{"polluted":true}}', ' '.repeat(262145), '{broken']) {
      await importState(page, raw);
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      expect(await canonical(page)).toEqual(original);
    }
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/field/v1/system:langevin'))).toBe(
      'future-original'
    );
    expect(await page.evaluate(() => Object.hasOwn(Object.prototype, 'polluted'))).toBe(false);
  });

  test('worker failure recovers and route disposal terminates active computation', async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      let fail = true;
      const counts = { terminated: 0 };
      Object.assign(window, { fieldWorkers: counts });
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) {
            fail = false;
            throw new Error('fixture worker unavailable');
          }
          super(url, options);
        }
        override terminate() {
          counts.terminated++;
          super.terminate();
        }
      };
    });
    await open(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await expect(page.locator('.lab-library')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { fieldWorkers: { terminated: number } }).fieldWorkers.terminated)
    ).toBe(1);
  });

  for (const scene of [
    { slug: 'langevin', id: 'arrhenius', title: 'Arrhenius 탈출 시간', key: 'kT' },
    { slug: 'lattice-fk-limit', id: 'diatomic', title: '이원자 조화 분산', key: 'massA' },
    { slug: 'frenkel-kontorova', id: 'pinning', title: 'FK 정적 pinning 에너지 비교', key: 'coupling' }
  ]) {
    test(`${scene.slug}: independent native diagnostic validates inputs and exports settings`, async ({ page }) => {
      await open(page, scene.slug);
      const initial = await canonical(page);
      await panel(page, '분석');
      const diagnostic = page.locator(`#field-diagnostic-${scene.id}`);
      await expect(diagnostic).toBeVisible();
      const result = diagnostic.getByLabel(`${scene.title} 결과`, { exact: true });
      const before = await result.textContent();
      expect(before).toBeTruthy();
      const input = page.locator(`#field-diagnostic-${scene.id}-${scene.key}`);
      const value = await input.inputValue();
      await input.fill('-1');
      await diagnostic.getByRole('button', { name: `${scene.title} 계산`, exact: true }).click();
      await expect(diagnostic.getByRole('alert')).toContainText('마지막 유효 결과');
      await expect(result).toHaveText(before!);
      await input.fill(value);
      await diagnostic.getByRole('button', { name: `${scene.title} 계산`, exact: true }).click();
      await expect(diagnostic.getByRole('alert')).toBeHidden();
      const artifact = JSON.parse(await download(page, `${scene.title} JSON 다운로드`));
      expect(JSON.stringify(artifact)).toContain(scene.key);
      expect(JSON.stringify(artifact)).toMatch(/schema|version/);
      expect(await canonical(page)).toEqual(initial);
    });
  }

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard axe and 320px preserve controls: ${name}`, async ({ page }) => {
      await open(page, 'sine-gordon');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      await audit(page);
    });
  }

  test('200% zoom preserves seed and ensemble settings', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await page.locator('#field-seed').fill('zoom-seed');
    await page.locator('#field-members').fill('4');
    await apply(page);
    await viewport(page);
    await audit(page);
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  });

  test('frozen spatial heatmaps ensemble and static diagnostic layouts', async ({ page }) => {
    const scenes = [
      { slug: 'langevin', kind: 'ensemble', theme: 'light' },
      { slug: 'fput', kind: 'heatmap', theme: 'dark' },
      { slug: 'sine-gordon', kind: 'heatmap', theme: 'light' },
      { slug: 'lattice-fk-limit', kind: 'modes', theme: 'dark' },
      { slug: 'frenkel-kontorova', kind: 'profile', theme: 'light' }
    ];
    for (const scene of scenes) {
      await open(page, scene.slug);
      if (evolving.includes(scene.slug)) await shortRun(page);
      await panel(page, '분석');
      await page.locator('#field-plot-kind').selectOption(scene.kind);
      await page.getByLabel('화면 테마', { exact: true }).selectOption(scene.theme);
      await expect(page.locator('#field-analysis svg')).toBeVisible();
      await expectLegacyPanelScreenshot(page, `s16-${scene.slug}-${scene.kind}-${scene.theme}.png`);
    }
  });
});
