import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['standard-map', 'quantum-kicked-rotor', 'unitary-floquet'];
const workspace = (page: Page) => page.locator('.discrete-workspace');
async function open(page: Page, slug = 'standard-map') {
  const path = `/next.html#/lab/${slug}`;
  // Revisiting the same fragment is not navigation; explicitly reload repeated
  // visual scenes so a completed run cannot masquerade as a fresh workspace.
  if (page.url().endsWith(path)) await page.reload();
  else await page.goto(path);
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
async function importState(page: Page, text: string) {
  await page.locator('#discrete-import').setInputFiles({
    name: 'discrete-state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text)
  });
}
async function shortRun(page: Page, iterations = 8) {
  await panel(page, '조건');
  await page.locator('#discrete-iterations').fill(String(iterations));
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

test.describe('S17 discrete and quantum laboratory', () => {
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
    test(`${slug}: canonical save reload share and atomic import preserve the model`, async ({ page }) => {
      await open(page, slug);
      const initial = await canonical(page);
      expect(initial.systemId).toBe(`system:${slug}`);
      expect(initial.integrator.kind).toBe('internal');
      expect(initial.runtime.domain).toBe(slug === 'unitary-floquet' ? 'evaluation' : 'iteration');
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
      expect(await canonical(page)).toEqual(initial);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      expect(await canonical(page)).toEqual(initial);
      await importState(page, JSON.stringify({ ...initial, modelVersion: 'future' }));
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      expect(await canonical(page)).toEqual(initial);
      await importState(page, JSON.stringify(initial));
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      expect(await canonical(page)).toEqual(initial);
    });

    test(`${slug}: ODE time controls and continuous analyses cannot be applied`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await expect(page.locator('#lab-integrator, #lab-field-step, #discrete-step, #discrete-duration')).toHaveCount(0);
      await expect(page.locator('#discrete-inspector')).toContainText(/내부|stepper|스텝/);
      const initial = await canonical(page);
      for (const analysis of ['analysis:poincare', 'analysis:lyapunov', 'analysis:sali-fli', 'analysis:shadowing']) {
        await importState(
          page,
          JSON.stringify({ ...initial, analyses: [{ id: analysis, algorithmVersion: '1', settings: {} }] })
        );
        await expect(page.getByRole('alert')).toContainText('가져오기 실패');
        expect(await canonical(page)).toEqual(initial);
      }
      await importState(
        page,
        JSON.stringify({
          ...initial,
          integrator: { kind: 'selectable', id: 'integrator:rk4', version: '1', settings: {} }
        })
      );
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      expect(await canonical(page)).toEqual(initial);
    });
  }

  for (const slug of slugs.slice(0, 2)) {
    test(`${slug}: worker pause single iteration resume cancel and deterministic replay`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      await page.locator('#discrete-iterations').fill('2048');
      await apply(page);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#discrete-iteration').getAttribute('data-iteration')))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
      const paused = Number(await page.locator('#discrete-iteration').getAttribute('data-iteration'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
      expect(Number(await page.locator('#discrete-iteration').getAttribute('data-iteration'))).toBe(paused + 1);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'running');
      await panel(page, '내보내기');
      await expect(page.locator('#discrete-import')).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
      const stopped = await page.locator('#discrete-iteration').getAttribute('data-iteration');
      await panel(page, '분석');
      await page.locator('#discrete-plot-kind').selectOption(slug === 'standard-map' ? 'phase' : 'wavephase');
      await expect(page.locator('#discrete-iteration')).toHaveAttribute('data-iteration', stopped!);
      await expect(page.locator('#discrete-analysis svg')).toBeVisible();
      await shortRun(page);
      await panel(page, '내보내기');
      const first = await download(page, '기록 원본 CSV 다운로드');
      expect(first).not.toMatch(/NaN|Infinity/);
      expect(first.trim().split(/\r?\n/).length).toBeGreaterThan(2);
      expect(await download(page, '그림 SVG 다운로드')).toContain('<svg');
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
      expect(await download(page, '기록 원본 CSV 다운로드')).toBe(first);
    });
  }

  test('custom complex wavefunction survives save share import and gives identical evolution', async ({ page }) => {
    await open(page, 'quantum-kicked-rotor');
    const amplitude = Math.SQRT1_2;
    const wavefunction = { re: [amplitude, 0, 0, 0], im: [0, amplitude, 0, 0] };
    await panel(page, '조건');
    await page.locator('#discrete-gridSize').fill('4');
    await page.locator('#discrete-wavefunction').fill(JSON.stringify(wavefunction));
    await page.locator('#discrete-iterations').fill('12');
    await apply(page);
    const initial = await canonical(page);
    expect(initial.initialConditions.wavefunction).toEqual({ kind: 'complex-vector', ...wavefunction, unit: '1' });
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await page.reload();
    expect(await canonical(page)).toEqual(initial);
    await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
    await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
    expect(await canonical(page)).toEqual(initial);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    const first = await download(page, '기록 원본 CSV 다운로드');
    await importState(page, JSON.stringify(initial));
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    expect(await download(page, '기록 원본 CSV 다운로드')).toBe(first);
    await panel(page, '작업 공간');
    expect(Number(await page.locator('#discrete-summary').getAttribute('data-norm'))).toBeCloseTo(1, 10);
    expect(Math.abs(Number(await page.locator('#discrete-summary').getAttribute('data-norm-drift')))).toBeLessThan(
      1e-10
    );
  });

  test('zero-kick standard map wraps the angle while preserving unwrapped momentum', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#discrete-kickStrength').fill('0');
    await page.locator('#discrete-initialState').fill('[0.1,-10]');
    await page.locator('#discrete-iterations').fill('3');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    await panel(page, '내보내기');
    const artifact = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
    const expectedAngle = (((0.1 - 30) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(artifact.state[0]).toBeCloseTo(expectedAngle, 12);
    expect(artifact.state[1]).toBe(-10);
    expect(artifact.iteration).toBe(3);
    await panel(page, '분석');
    await expect(page.locator('#discrete-plot-kind')).toHaveValue('phase');
    await expect(page.locator('#discrete-analysis')).toContainText(/θ|위상|원통/);
  });

  test('invalid complex dimensions normalization and grid drafts preserve applied data', async ({ page }) => {
    await open(page, 'quantum-kicked-rotor');
    const initial = await canonical(page);
    for (const wavefunction of [
      { re: [1, 0], im: [0] },
      { re: [0, 0], im: [0, 0] }
    ]) {
      await panel(page, '조건');
      await page.locator('#discrete-wavefunction').fill(JSON.stringify(wavefunction));
      await apply(page);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '편집 취소', exact: true }).click();
      expect(await canonical(page)).toEqual(initial);
    }
    await panel(page, '조건');
    await page.locator('#discrete-gridSize').fill('7');
    await apply(page);
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '편집 취소', exact: true }).click();
    expect(await canonical(page)).toEqual(initial);
  });

  test('known unitary matrix retains complex entries and reports physical quasi-energy convention', async ({
    page
  }) => {
    await open(page, 'unitary-floquet');
    await panel(page, '조건');
    await page.locator('#discrete-gridSize').fill('2');
    await page.locator('#discrete-hbar').fill('2');
    await page.locator('#discrete-period').fill('4');
    await page.locator('#discrete-matrix').fill(
      JSON.stringify({
        re: [
          [1, 0],
          [0, 0]
        ],
        im: [
          [0, 0],
          [0, -1]
        ]
      })
    );
    await apply(page);
    const initial = await canonical(page);
    await importState(page, JSON.stringify(initial));
    expect(await canonical(page)).toEqual(initial);
    await panel(page, '분석');
    await expect(page.locator('#discrete-plot-kind')).toHaveValue('spectrum');
    await expect(page.locator('#discrete-analysis svg')).toBeVisible();
    await expect(page.locator('#discrete-analysis')).toContainText(/준에너지|quasi|Floquet/);
    await panel(page, '내보내기');
    const artifact = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
    expect(JSON.stringify(artifact)).not.toMatch(/NaN|Infinity/);
    const spectrum = artifact.sample?.spectrum ?? artifact.spectrum ?? artifact.current?.spectrum;
    expect(spectrum.phases).toHaveLength(2);
    expect(spectrum.phases[0]).toBeCloseTo(-Math.PI / 2, 9);
    expect(spectrum.phases[1]).toBeCloseTo(0, 9);
    expect(spectrum.quasiEnergies[0]).toBeCloseTo(Math.PI / 4, 9);
    expect(spectrum.unitarityDefect).toBeLessThan(1e-12);
    expect(spectrum.maxUnitCircleDrift).toBeLessThan(1e-10);
  });

  test('nonunitary operator preserves raw eigenvalue drift without projecting the input', async ({ page }) => {
    await open(page, 'unitary-floquet');
    await panel(page, '조건');
    await page.locator('#discrete-gridSize').fill('2');
    const matrix = {
      re: [
        [1, 0],
        [0, 2]
      ],
      im: [
        [0, 0],
        [0, 0]
      ]
    };
    await page.locator('#discrete-matrix').fill(JSON.stringify(matrix));
    await apply(page);
    await panel(page, '내보내기');
    const artifact = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
    expect(artifact.configuration.matrix).toEqual(matrix);
    expect(artifact.rawProjection).toBe(false);
    expect(artifact.spectrum.unitarityDefect).toBeCloseTo(3 / Math.sqrt(2), 9);
    expect(artifact.spectrum.maxUnitCircleDrift).toBeCloseTo(1, 9);
    expect(
      Math.max(...artifact.spectrum.eigenvalues.map((z: { re: number; im: number }) => Math.hypot(z.re, z.im)))
    ).toBeCloseTo(2, 9);
    await panel(page, '작업 공간');
    await expect(page.locator('#discrete-warnings')).toContainText('비유니터리');
  });

  for (const slug of slugs.slice(0, 2)) {
    test(`${slug}: current complex state export restores an exact continuation`, async ({ page }) => {
      await open(page, slug);
      await shortRun(page, 12);
      await panel(page, '내보내기');
      const saved = await download(page, '복소 상태 JSON 다운로드');
      expect(JSON.parse(saved).iteration).toBe(12);
      await shortRun(page, 13);
      await panel(page, '내보내기');
      const direct = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
      await importState(page, saved);
      await expect(page.locator('#discrete-iteration')).toHaveAttribute('data-iteration', '12');
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-busy', 'false');
      await expect(page.locator('#discrete-iteration')).toHaveAttribute('data-iteration', '13');
      const continued = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
      expect(continued.wavefunction).toEqual(direct.wavefunction);
      expect(continued.state).toEqual(direct.state);
      expect(continued.norm).toBe(direct.norm);
      expect(continued.meanSquareMomentum).toBe(direct.meanSquareMomentum);
      expect(continued.restartConfiguration.startIteration).toBe(13);
    });
  }

  test('retained raw and downsampled iteration exports preserve both endpoints and disclose their stride', async ({
    page
  }) => {
    await open(page);
    await shortRun(page, 400);
    await panel(page, '내보내기');
    const raw = (await download(page, '기록 원본 CSV 다운로드')).trim().split(/\r?\n/);
    const reduced = (await download(page, '축약 CSV 다운로드')).trim().split(/\r?\n/);
    expect(raw.length).toBe(402);
    expect(reduced.length).toBe(122);
    expect(raw[0]).toContain('source_stride_iterations');
    expect(raw[1]).toMatch(/^retained-raw,/);
    expect(reduced[1]).toMatch(/^downsampled,/);
    expect(raw[1]!.split(',').slice(1)).toEqual(reduced[1]!.split(',').slice(1));
    expect(raw.at(-1)!.split(',').slice(1)).toEqual(reduced.at(-1)!.split(',').slice(1));
    const artifact = JSON.parse(await download(page, '복소 상태 JSON 다운로드'));
    expect(artifact.retainedRecords).toBe(401);
    expect(artifact.sourceStrideIterations).toBe(1);
    expect(artifact.iteration).toBe(400);
    await expect(page.locator('#discrete-export')).toContainText('미기록');
  });

  test('unsafe imports and corrupt local storage preserve originals and remain recoverable', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/discrete/v1/system:standard-map', 'future-original')
    );
    await open(page);
    const initial = await canonical(page);
    for (const text of ['{"__proto__":{"polluted":true}}', ' '.repeat(262145), '{broken']) {
      await importState(page, text);
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      expect(await canonical(page)).toEqual(initial);
    }
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/discrete/v1/system:standard-map'))).toBe(
      'future-original'
    );
    expect(await page.evaluate(() => Object.hasOwn(Object.prototype, 'polluted'))).toBe(false);
  });

  test('route disposal terminates the real worker and late computation cannot replace the library', async ({
    page
  }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      const counts = { terminated: 0 };
      Object.assign(window, { discreteWorkers: counts });
      window.Worker = class extends Original {
        override terminate() {
          counts.terminated++;
          super.terminate();
        }
      };
    });
    await open(page, 'quantum-kicked-rotor');
    await panel(page, '조건');
    await page.locator('#discrete-iterations').fill('2048');
    await apply(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect
      .poll(async () => Number(await page.locator('#discrete-iteration').getAttribute('data-iteration')))
      .toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await expect(page.locator('.lab-library')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { discreteWorkers: { terminated: number } }).discreteWorkers.terminated
      )
    ).toBe(1);
    await expect(page.locator('.discrete-workspace')).toHaveCount(0);
  });

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard axe and 320px retain quantum controls: ${name}`, async ({ page }) => {
      await open(page, 'quantum-kicked-rotor');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      await audit(page);
    });
  }

  test('200% zoom retains editable complex conditions without horizontal overflow', async ({ page }) => {
    await open(page, 'quantum-kicked-rotor');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await page.locator('#discrete-kickStrength').fill('2');
    await apply(page);
    await viewport(page);
    await audit(page);
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  });

  for (const [family, count] of [
    ['classical', 4],
    ['flexible', 3],
    ['spatial', 4],
    ['driven-control', 5],
    ['nonlinear', 6],
    ['network', 5],
    ['stochastic-field', 5],
    ['discrete-quantum', 3]
  ] as const) {
    test(`complete family ${family}: every catalog card opens actual conditions`, async ({ page }) => {
      await page.goto('/next.html#/lab');
      await page.getByLabel('시스템 패밀리').selectOption(family);
      await expect(page.locator('.lab-system-grid article')).toHaveCount(count);
      const links = await page
        .locator('.lab-system-grid article a')
        .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute('href')!));
      expect(new Set(links).size).toBe(count);
      for (const href of links) {
        await page.goto(`/next.html${href}`);
        await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
        await expect(page.getByText('시험 실행 미리보기', { exact: false })).toHaveCount(0);
        await panel(page, '조건');
        await expect(page.getByRole('button', { name: '시험 실행', exact: true })).toHaveCount(0);
        await expect(page.getByRole('tab', { name: '분석', exact: true })).toBeVisible();
      }
    });
  }

  test('phase cylinder wavefunction phase and quasi-energy figures have frozen distinct layouts', async ({ page }) => {
    for (const scene of [
      { slug: 'standard-map', kind: 'phase', theme: 'light' },
      { slug: 'quantum-kicked-rotor', kind: 'probability', theme: 'dark' },
      { slug: 'quantum-kicked-rotor', kind: 'wavephase', theme: 'light' },
      { slug: 'unitary-floquet', kind: 'spectrum', theme: 'dark' }
    ]) {
      await open(page, scene.slug);
      if (scene.slug !== 'unitary-floquet') await shortRun(page, 12);
      await panel(page, '분석');
      await page.locator('#discrete-plot-kind').selectOption(scene.kind);
      await page.getByLabel('화면 테마', { exact: true }).selectOption(scene.theme);
      await expect(page.locator('#discrete-analysis svg')).toBeVisible();
      await expect(page).toHaveScreenshot(`s17-${scene.slug}-${scene.kind}-${scene.theme}.png`, { fullPage: true });
    }
  });
});
