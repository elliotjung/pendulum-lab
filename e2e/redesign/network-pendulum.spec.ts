import { expectLegacyPanelScreenshot } from './legacy-layout';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const slugs = ['magnetic', 'pendulum-network', 'huygens-phase-pair', 'kuramoto', 'chimera-exploration'];
const workspace = (page: Page) => page.locator('.network-workspace');
async function open(page: Page, slug = 'kuramoto') {
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
async function canonical(page: Page) {
  await panel(page, '내보내기');
  return JSON.parse(await download(page, '상태 JSON 다운로드'));
}
async function topology(page: Page) {
  await panel(page, '내보내기');
  return JSON.parse(await download(page, '노드·간선 JSON 다운로드'));
}
async function importState(page: Page, json: string) {
  await page.locator('#network-import').setInputFiles({
    name: 'network-state.json',
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
async function caption(page: Page) {
  const text = page.locator('#network-analysis .network-plot-caption');
  await expect(text).toBeVisible();
  await expect(text).toContainText(/가로축.+세로축/);
  await expect(text).toHaveText((await page.locator('#network-analysis svg').getAttribute('aria-label'))!);
}
async function shortRun(page: Page, duration = '0.2') {
  await panel(page, '조건');
  await page.locator('#network-duration').fill(duration);
  await apply(page);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
}

test.describe('S15 magnetic and synchronization network laboratory', () => {
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
    test(`${slug}: real worker run, pause, step, progress, cancel and finite exports`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      const step = Number(await page.locator('#network-step').inputValue());
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect
        .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await settled(page);
      const before = Number(await page.locator('#lab-time').getAttribute('data-time'));
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await settled(page);
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(before + step, 10);
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'running');
      await expect(page.locator('#network-topology-input')).toBeDisabled();
      await panel(page, '내보내기');
      await expect(page.locator('#network-import')).toBeDisabled();
      await page.getByRole('button', { name: '실행 취소', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
      const csv = await download(page, '궤적 CSV 다운로드');
      expect(csv).toContain(slug === 'magnetic' ? 'time_normalized' : 'time_s');
      expect(csv).not.toMatch(/NaN|Infinity/);
      const rows = csv
        .trim()
        .split(/\r?\n/)
        .map((row) => row.split(','));
      const header = rows.shift()!;
      const firstNode = rows.filter((row) => row[header.indexOf('node_index')] === '0');
      expect(firstNode.length).toBeGreaterThan(1);
      const stateColumn = header.indexOf(slug === 'magnetic' ? 'x_normalized' : 'phase_rad');
      expect(Number(firstNode.at(-1)![stateColumn])).not.toBe(Number(firstNode[0]![stateColumn]));
      expect(Number(rows.at(-1)![0])).toBeCloseTo(
        Number(await page.locator('#lab-time').getAttribute('data-time')),
        10
      );
      expect(await download(page, '그림 SVG 다운로드')).toContain('<svg');
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
    });

    test(`${slug}: atomic graph/state edits, save, reload, share and canonical import`, async ({ page }) => {
      await open(page, slug);
      await panel(page, '조건');
      const graph = JSON.parse(await page.locator('#network-topology-input').inputValue());
      graph.initialState[0] = 0.37;
      await page.locator('#network-topology-input').fill(JSON.stringify(graph));
      await page.locator('#network-duration').fill('0.2');
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
      await panel(page, '보관함');
      await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
      await expect(page.getByText('저장했습니다.', { exact: false })).toBeVisible();
      await page.reload();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
      await panel(page, '조건');
      expect(JSON.parse(await page.locator('#network-topology-input').inputValue())).toEqual(graph);
      await expect(page.locator('#network-duration')).toHaveValue('0.2');
      const json = await canonical(page);
      expect(json.systemId).toBe(`system:${slug}`);
      await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
      await page.getByRole('link', { name: '공유 설정 열기', exact: true }).click();
      expect(await canonical(page)).toEqual(json);
      await panel(page, '조건');
      await page.locator('#network-step').fill('-1');
      await apply(page);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await panel(page, '내보내기');
      await importState(page, JSON.stringify(json));
      await expect(page.getByText('상태 파일을 복원했습니다.', { exact: false })).toBeVisible();
      expect(await canonical(page)).toEqual(json);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
      expect(Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeCloseTo(0.2, 10);
    });
  }

  test('invalid graph drafts and topology files cannot mutate the applied experiment', async ({ page }) => {
    await open(page);
    const original = await canonical(page);
    const valid = await topology(page);
    for (const mutation of ['self', 'unknown', 'parallel', 'duplicate-node', 'negative-weight']) {
      const invalid = structuredClone(valid);
      const first = invalid.graph.edges[0];
      if (mutation === 'self') first.target = first.source;
      if (mutation === 'unknown') first.target = 'missing-node';
      if (mutation === 'parallel') invalid.graph.edges.push({ ...first, id: 'duplicate-edge' });
      if (mutation === 'duplicate-node') invalid.graph.nodes[1].id = invalid.graph.nodes[0].id;
      if (mutation === 'negative-weight') first.weight = -1;
      await panel(page, '조건');
      await page.locator('#network-topology-input').fill(JSON.stringify(invalid));
      await apply(page);
      await expect(page.getByRole('alert')).toContainText(/노드|간선|graph|edge|weight|중복|자기/i);
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '편집 취소', exact: true }).click();
      expect(await canonical(page)).toEqual(original);
    }
    const changed = structuredClone(valid);
    changed.initialState[0] = 0.6;
    await panel(page, '조건');
    await page.locator('#network-topology-import').setInputFiles({
      name: 'graph.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(changed))
    });
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    expect(JSON.parse(await page.locator('#network-topology-input').inputValue())).toEqual(changed);
    await page.getByRole('button', { name: '편집 취소', exact: true }).click();
    expect(await canonical(page)).toEqual(original);
    await panel(page, '조건');
    await page.locator('#network-topology-import').setInputFiles({
      name: 'graph.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(changed))
    });
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
    await apply(page);
    expect(await topology(page)).toEqual(changed);
    await panel(page, '조건');
    await page.locator('#network-topology-import').setInputFiles({
      name: 'bad-graph.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"__proto__":{"polluted":true}}')
    });
    await expect(page.getByRole('alert')).toContainText(/가져오기 실패|노드·간선|위상 구조|파일/);
    expect(await topology(page)).toEqual(changed);
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'))).toBe(false);
  });

  test('seed regeneration repeats exactly while explicit imported phases remain authoritative', async ({ page }) => {
    await open(page, 'chimera-exploration');
    await panel(page, '조건');
    await page.locator('#network-seed').fill('s15-repeatability');
    await page.getByRole('button', { name: 'seed 초기조건 적용', exact: true }).click();
    const seeded = await topology(page);
    const seededState = await canonical(page);
    expect(seededState.seed).toEqual({
      value: 's15-repeatability',
      generator: 'fnv1a-mulberry32',
      generatorVersion: '1'
    });
    await panel(page, '조건');
    await page.locator('#network-seed').fill('other-seed');
    await page.getByRole('button', { name: 'seed 초기조건 적용', exact: true }).click();
    expect((await topology(page)).initialState).not.toEqual(seeded.initialState);
    await panel(page, '조건');
    await page.locator('#network-seed').fill('s15-repeatability');
    await page.getByRole('button', { name: 'seed 초기조건 적용', exact: true }).click();
    expect(await topology(page)).toEqual(seeded);
    await shortRun(page);
    await panel(page, '내보내기');
    const trajectory = await download(page, '궤적 CSV 다운로드');
    const config = await canonical(page);
    await importState(page, JSON.stringify(config));
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'completed');
    expect(await download(page, '궤적 CSV 다운로드')).toBe(trajectory);
    const explicit = await topology(page);
    explicit.initialState[0] = 0.123;
    await panel(page, '조건');
    await page.locator('#network-topology-input').fill(JSON.stringify(explicit));
    await apply(page);
    const canonicalExplicit = await canonical(page);
    await importState(page, JSON.stringify(canonicalExplicit));
    expect((await topology(page)).initialState[0]).toBe(0.123);
  });

  test('aggregate and individual views expose selected-node state and native coherence diagnostics', async ({
    page
  }) => {
    for (const slug of slugs) {
      await open(page, slug);
      await shortRun(page);
      await panel(page, '내보내기');
      const records = (await download(page, '궤적 CSV 다운로드'))
        .trim()
        .split(/\r?\n/)
        .map((row) => row.split(','));
      const header = records.shift()!;
      const selected = slug === 'magnetic' ? '0' : '1';
      const last = records.filter((row) => row[header.indexOf('node_index')] === selected).at(-1)!;
      const coordinate = Number(last[header.indexOf(slug === 'magnetic' ? 'x_normalized' : 'phase_rad')]);
      await panel(page, '작업 공간');
      await page.locator('#network-display-mode').selectOption('individual');
      await page.locator('#network-node-select').selectOption({ index: 1 });
      const selectedId =
        slug === 'magnetic' ? 'bob' : await page.locator('#network-node-select option:checked').textContent();
      await expect(page.locator('#network-selected-state')).toHaveAttribute('data-node-id', selectedId!);
      await expect(page.locator('#network-selected-state')).toContainText(coordinate.toPrecision(6));
      await expect(workspace(page)).not.toContainText(/NaN|Infinity/);
      await page.locator('#network-display-mode').selectOption('aggregate');
      await expect(page.locator('#network-summary')).toBeVisible();
      await expect(page.locator('#network-selected-state')).toBeHidden();
      if (slug !== 'magnetic')
        await expect(page.locator('#network-summary')).toContainText(
          Number(last[header.indexOf('order_1')]).toFixed(6)
        );
      await panel(page, '분석');
      await page.locator('#network-plot-kind').selectOption(slug === 'magnetic' ? 'phase' : 'order');
      await caption(page);
      if (slug !== 'magnetic') {
        await page.locator('#network-plot-kind').selectOption('local');
        await caption(page);
      }
    }
  });

  test('128-node execution shows its cost, remains interactive and cancels without late frames', async ({ page }) => {
    await open(page);
    await panel(page, '조건');
    await page.locator('#network-node-count').fill('128');
    await page.locator('#network-ring-radius').fill('2');
    await page.getByRole('button', { name: '노드 수로 링 생성', exact: true }).click();
    await page.locator('#network-duration').fill('10');
    await page.locator('#network-step').fill('0.001');
    await apply(page);
    await expect(workspace(page)).toContainText(/128/);
    await expect(workspace(page)).toContainText(/O\(N|규모|비용|성능/);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await panel(page, '작업 공간');
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'cancelled');
    const stopped = await page.locator('#lab-time').getAttribute('data-time');
    expect(Number(stopped)).toBeLessThan(10);
    await panel(page, '분석');
    await page.locator('#network-plot-kind').selectOption('local');
    await caption(page);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', stopped!);
  });

  test('magnetic seed grid cancels within a cell and exports deterministic nearest labels with convergence masks', async ({
    page
  }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      const observed = { advancedInsideFirstCell: false };
      Object.assign(window, { networkBasinObserved: observed });
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', (event) => {
            if (event.data.type === 'progress' && event.data.advanced > 0 && event.data.basin?.completed === 0)
              observed.advancedInsideFirstCell = true;
          });
        }
      };
    });
    await open(page, 'magnetic');
    await panel(page, '조건');
    await page.locator('#network-basin-size').fill('16');
    await page.locator('#network-basin-maxSteps').fill('10000');
    await apply(page);
    await panel(page, '분석');
    await page.locator('#network-basin-run').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { networkBasinObserved: { advancedInsideFirstCell: boolean } }).networkBasinObserved
              .advancedInsideFirstCell
        )
      )
      .toBe(true);
    await expect(page.locator('#network-basin-cancel')).toBeEnabled();
    await page.locator('#network-basin-cancel').click();
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-basin-status', 'cancelled');
    await expect(page.locator('#network-basin-progress')).not.toHaveAttribute('value', '100');
    await panel(page, '조건');
    await page.locator('#network-basin-size').fill('2');
    await page.locator('#network-basin-maxSteps').fill('64');
    await apply(page);
    await panel(page, '분석');
    await page.locator('#network-basin-run').click();
    await expect(page.locator('#network-basin-progress')).toHaveAttribute('value', '100');
    await settled(page);
    await expect(workspace(page)).toHaveAttribute('data-basin-status', 'completed');
    const csv = await download(page, '격자 CSV 다운로드');
    expect(csv).toMatch(/converged/);
    expect(csv).not.toMatch(/NaN|Infinity/);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(5);
    await expect(workspace(page)).toContainText(/미수렴|수렴하지|최근접|nearest/);
    await page.locator('#network-basin-run').click();
    await expect(page.locator('#network-basin-progress')).toHaveAttribute('value', '100');
    await settled(page);
    expect(await download(page, '격자 CSV 다운로드')).toBe(csv);
    await page.locator('#network-plot-kind').selectOption('basin');
    await caption(page);
  });

  test('unsafe, future and malformed state imports preserve the applied experiment', async ({ page }) => {
    await open(page);
    const valid = await canonical(page);
    for (const raw of [
      '{"__proto__":{"polluted":true}}',
      ' '.repeat(262145),
      JSON.stringify({ ...valid, modelVersion: 'future' }),
      JSON.stringify({ ...valid, analyses: [{ id: 'analysis:lyapunov', parameters: {} }] }),
      '{broken network'
    ]) {
      await importState(page, raw);
      await expect(page.getByRole('alert')).toContainText('가져오기 실패');
      if (raw.length > 262144) await expect(page.getByRole('alert')).toContainText('256 KiB');
      expect(await canonical(page)).toEqual(valid);
    }
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'))).toBe(false);
  });

  test('corrupt saved network settings remain intact after a save attempt', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('pendulum-product/network/v1/system:kuramoto', 'future-original')
    );
    await open(page);
    await panel(page, '보관함');
    await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
    await expect(page.getByText('저장하지 못했습니다.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pendulum-product/network/v1/system:kuramoto'))).toBe(
      'future-original'
    );
  });

  test('worker startup errors recover and leaving a running route terminates its worker', async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      let fail = true;
      const state = { created: 0, terminated: 0 };
      Object.assign(window, { networkWorkers: state });
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) {
            fail = false;
            throw new Error('test worker unavailable');
          }
          super(url, options);
          state.created++;
        }
        override terminate() {
          state.terminated++;
          super.terminate();
        }
      };
    });
    await open(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'error');
    await expect(page.getByRole('alert')).toContainText(/worker|작업자/i);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
    await page.getByRole('link', { name: '시스템 라이브러리', exact: true }).click();
    await expect(page.locator('.lab-library')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { networkWorkers: { terminated: number } }).networkWorkers.terminated
      )
    ).toBe(1);
    await page.goBack();
    await expect(workspace(page)).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '0');
  });

  for (const name of ['작업 공간', '조건', '분석', '보관함', '내보내기']) {
    test(`keyboard, accessibility and 320px preserve network controls: ${name}`, async ({ page }) => {
      await open(page, 'magnetic');
      await page.setViewportSize({ width: 320, height: 850 });
      await page.getByRole('tab', { name: '작업 공간', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: '조건', exact: true })).toBeFocused();
      await panel(page, name);
      await viewport(page);
      if (name === '분석') await caption(page);
      await audit(page);
    });
  }

  test('200% zoom preserves graph, seed and physical parameter editing', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await panel(page, '조건');
    await page.locator('#network-seed').fill('zoom-seed');
    await page.getByRole('button', { name: 'seed 초기조건 적용', exact: true }).click();
    await page.locator('#network-step').fill('0.005');
    await apply(page);
    await viewport(page);
    await audit(page);
    await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  });

  test('frozen network topology and selected-node workspace layout', async ({ page }) => {
    await open(page, 'pendulum-network');
    await shortRun(page);
    await panel(page, '작업 공간');
    await page.locator('#network-display-mode').selectOption('individual');
    await page.locator('#network-node-select').selectOption('1');
    await expect(page.locator('#network-selected-state')).toHaveAttribute('data-node-id', 'n2');
    await expect(page.locator('#network-preview svg circle')).toHaveCount(8);
    await expect(page.locator('#network-preview svg line')).toHaveCount(8);
    await page.getByLabel('화면 테마', { exact: true }).selectOption('light');
    await expectLegacyPanelScreenshot(page, 's15-pendulum-topology-workspace-light.png');
  });

  test('frozen magnetic graph and parameter inspector dark layout', async ({ page }) => {
    await open(page, 'magnetic');
    await panel(page, '조건');
    await expect(page.locator('#network-node-meaning')).toBeVisible();
    await expect(page.locator('#network-restoring')).toHaveValue('0.5');
    await expect(page.locator('#network-height')).toHaveValue('0.25');
    await expect(page.locator('#network-topology-input')).toHaveValue(/pendulum-network-graph-file\/v1/);
    await page.getByLabel('화면 테마', { exact: true }).selectOption('dark');
    await expectLegacyPanelScreenshot(page, 's15-magnetic-inspector-dark.png');
  });

  test('frozen topology, aggregate order, individual phase, local coherence and basin layouts', async ({ page }) => {
    const scenes = [
      { slug: 'pendulum-network', kind: 'state', file: 's15-pendulum-network-state-light.png', theme: 'light' },
      { slug: 'huygens-phase-pair', kind: 'phase', file: 's15-huygens-phase-light.png', theme: 'light' },
      { slug: 'kuramoto', kind: 'order', file: 's15-kuramoto-order-dark.png', theme: 'dark' },
      { slug: 'chimera-exploration', kind: 'local', file: 's15-chimera-local-dark.png', theme: 'dark' },
      { slug: 'magnetic', kind: 'basin', file: 's15-magnetic-basin-resolved-light.png', theme: 'light' }
    ];
    for (const scene of scenes) {
      await open(page, scene.slug);
      await shortRun(page);
      if (scene.slug === 'magnetic') {
        await panel(page, '조건');
        await page.locator('#network-basin-size').fill('2');
        await page.locator('#network-basin-maxSteps').fill('10000');
        await page.locator('#network-basin-xMin').fill(String(-Math.sqrt(3) / 2));
        await page.locator('#network-basin-xMax').fill(String(Math.sqrt(3) / 2));
        await page.locator('#network-basin-yMin').fill('-0.5');
        await page.locator('#network-basin-yMax').fill('1');
        await apply(page);
        await panel(page, '분석');
        await page.locator('#network-basin-run').click();
        await expect(page.locator('#network-basin-progress')).toHaveAttribute('value', '100');
        await settled(page);
        const cells = (await download(page, '격자 CSV 다운로드'))
          .trim()
          .split(/\r?\n/)
          .map((row) => row.split(','));
        const header = cells.shift()!;
        const converged = header.indexOf('converged_1');
        expect(cells.filter((row) => row[converged] === '1')).toHaveLength(2);
        expect(cells.filter((row) => row[converged] === '0')).toHaveLength(2);
      }
      await panel(page, '분석');
      await page.locator('#network-plot-kind').selectOption(scene.kind);
      await page.getByLabel('화면 테마', { exact: true }).selectOption(scene.theme);
      await caption(page);
      await expectLegacyPanelScreenshot(page, scene.file);
    }
  });
});
