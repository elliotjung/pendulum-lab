import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarSimulation,
  type PlanarState
} from '../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain } from '../../src/product/adapters/physics/chain';
import { buildPerturbedStates, PERTURBATION_PATTERNS } from '../../src/app/ensemblePerturbation';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import { MAX_SHARE_TOKEN_LENGTH } from '../../src/product/contracts/routes';
import {
  createExperimentRoute,
  createProductSetupRoute,
  resolveProductRoute
} from '../../src/product/persistence/share-route';
import {
  PRODUCT_SETUP_SCHEMA,
  MAX_PRODUCT_SETUP_FILE_BYTES,
  serializeProductSetup,
  type ProductSetupV1
} from '../../src/product/persistence/product-setup';

const read = promisify(readFile);
const pageErrors = new WeakMap<Page, string[]>();
const bounds = JSON.parse(readFileSync('tests/characterization/numerical-golden.fixture.json', 'utf8')).tolerance
  .numeric as { absolute: number; relative: number };
const controls: ProductSetupV1['controls'] = {
  angleUnit: 'deg',
  playback: { timingMode: 'deterministic', speed: 1.7, stepsPerFrame: 11, mode: 'research' },
  render: {
    trailMode: 'ice',
    trailLength: 2500,
    phaseAxis: 'both',
    qualityMode: 'cinematic',
    glow: true,
    longExposure: true,
    interpolate: false,
    autoQuality: false
  },
  ensemble: {
    count: 3,
    spec: { variable: 'iw2', pattern: 'random', epsilon: 0.00012345678901234567, seed: 0xffff_ffff }
  },
  workflow: { goal: 'periodic-vs-chaotic', step: 'measure', trajectoryStage: 'ensemble' }
};
const basePlanar = {
  ...defaultPlanarConfig(),
  parameters: { m1: 1.3, m2: 0.7, l1: 0.8, l2: 1.1, g: 9.7 },
  gamma: 0.04,
  initialState: [9 * Math.PI, -8 * Math.PI, 0.125, -0.0625] as PlanarState,
  integratorId: 'integrator:gauss2' as const,
  tolerance: 1e-9,
  step: 0.002,
  duration: 0.02,
  startTime: 3.5,
  seed: { value: '-9007199254740991', generator: 'legacy-session-seed', generatorVersion: 'unversioned' }
};
function experiment(system: 'double' | 'compound-double' | 'triple' = 'double') {
  const converted =
    system === 'triple'
      ? toCanonicalChain({
          ...defaultChainConfig('system:triple'),
          parameters: { masses: [1.3, 0.7, 2.1], lengths: [0.8, 1.1, 0.65], g: 9.7 },
          gamma: basePlanar.gamma,
          initialState: [9 * Math.PI, -8 * Math.PI, 0.15, 0.125, -0.0625, 0.02],
          integratorId: basePlanar.integratorId,
          tolerance: basePlanar.tolerance,
          step: basePlanar.step,
          duration: basePlanar.duration,
          startTime: basePlanar.startTime,
          seed: basePlanar.seed
        })
      : toCanonicalPlanar({ ...basePlanar, systemId: `system:${system}` });
  if (!converted.ok) throw new Error(JSON.stringify(converted.issues));
  return converted.value;
}
function setup(system: 'double' | 'compound-double' | 'triple' = 'double'): ProductSetupV1 {
  return { schema: PRODUCT_SETUP_SCHEMA, experiment: experiment(system), controls: structuredClone(controls) };
}
async function ready(page: Page) {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await expect(page.locator('.core-workspace,.chain-workspace')).toHaveAttribute('data-lab-status', 'ready');
}
async function expand(page: Page, id: string) {
  if ((await page.locator(id).getAttribute('open')) === null) await page.locator(`${id} > summary`).click();
}
async function storage(page: Page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    ),
    session: Object.fromEntries(
      Object.keys(sessionStorage)
        .sort()
        .map((key) => [key, sessionStorage.getItem(key)])
    )
  }));
}
async function open(page: Page, system: 'double' | 'compound-double' | 'triple' = 'double', query = '') {
  const route = createExperimentRoute(experiment(system));
  if (!route.ok) throw new Error('fixture');
  await page.goto(`/next.html${query}${route.value}`);
  await ready(page);
}
async function download(page: Page, label: string, suffix = '') {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  const bytes = await read((await file.path())!);
  await test.info().attach(`${suffix}${file.suggestedFilename()}`, { body: bytes, contentType: 'application/json' });
  return bytes;
}
async function assertControls(page: Page, expected = controls) {
  await expect(page.locator('#core-speed,#chain-speed')).toHaveValue(String(expected.playback.speed));
  await expand(page, '#legacy-playback');
  await expect(page.locator('#playback-timing')).toHaveValue(expected.playback.timingMode);
  await expect(page.locator('#playback-mode')).toHaveValue(expected.playback.mode);
  await expect(page.locator('#playback-speed')).toHaveValue(String(expected.playback.speed));
  await expect(page.locator('#playback-budget')).toHaveValue(String(expected.playback.stepsPerFrame));
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  const units = await page
    .locator('#core-inspector select[id$="-display-unit"],#chain-inspector select[id$="-display-unit"]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).value));
  expect(units.length).toBeGreaterThan(1);
  expect(new Set(units)).toEqual(new Set([expected.angleUnit]));
  await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
  await expand(page, '#native-display');
  await expect(page.locator('#trailMode')).toHaveValue(expected.render.trailMode);
  await expect(page.locator('#qualityMode')).toHaveValue(expected.render.qualityMode);
  await expect(page.locator('#phaseAxis')).toHaveValue(expected.render.phaseAxis);
  await expect(page.locator('#trailLen')).toHaveValue(String(expected.render.trailLength));
  for (const [id, key] of [
    ['glowMode', 'glow'],
    ['longExpose', 'longExposure'],
    ['interpolateRender', 'interpolate'],
    ['autoQual', 'autoQuality']
  ] as const)
    await expect(page.locator(`#${id}`)).toBeChecked({ checked: expected.render[key] });
  await expand(page, '#native-setup');
  await expect(page.locator('#setup-ensemble-count')).toHaveValue(String(expected.ensemble.count));
  for (const key of ['variable', 'pattern', 'epsilon', 'seed'] as const)
    await expect(page.locator(`#setup-perturbation-${key}`)).toHaveValue(String(expected.ensemble.spec[key]));
  await expect(page.locator('#current-workflow-goal')).toHaveValue(expected.workflow.goal);
  await expect(page.locator('#current-workflow-step')).toHaveValue(expected.workflow.step);
  await expect(page.locator('#current-workflow-stage')).toHaveValue(expected.workflow.trajectoryStage);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('s28-setup-original', '{"read-only":"preserve"}');
    sessionStorage.setItem('s28-setup-original-session', 'preserve');
    (window as unknown as { setupAudioStarts: number }).setupAudioStarts = 0;
    class BlockedAudio {
      constructor() {
        (window as unknown as { setupAudioStarts: number }).setupAudioStarts++;
        throw new Error('Unexpected automatic audio activation');
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: BlockedAudio });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: BlockedAudio });
  });
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page)).toEqual([]));

for (const system of ['double', 'compound-double', 'triple'] as const) {
  test(`S28 public setup ${system} shares actual current controls and exact physical inputs across open/reload without storage writes`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, system, '?s28-private-query=do-not-share');
    const before = await storage(page);
    await page.getByRole('tab', { name: '조건', exact: true }).click();
    const units = page.locator(
      '#core-inspector select[id$="-display-unit"],#chain-inspector select[id$="-display-unit"]'
    );
    await units.first().selectOption('deg');
    await units.nth(1).selectOption('rad');
    await units.first().selectOption('deg');
    expect(new Set(await units.evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).value)))).toEqual(
      new Set(['deg'])
    );
    await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
    await expand(page, '#legacy-playback');
    await page.locator('#playback-timing').selectOption(controls.playback.timingMode);
    await page.locator('#playback-mode').selectOption(controls.playback.mode);
    await page.locator('#playback-speed').fill(String(controls.playback.speed));
    await page.locator('#playback-speed').press('Tab');
    await page.locator('#playback-budget').fill(String(controls.playback.stepsPerFrame));
    await page.locator('#playback-budget').press('Tab');
    await expand(page, '#native-display');
    await page.locator('#trailMode').selectOption(controls.render.trailMode);
    await page.locator('#qualityMode').selectOption(controls.render.qualityMode);
    await page.locator('#phaseAxis').selectOption(controls.render.phaseAxis);
    await page.locator('#trailLen').fill(String(controls.render.trailLength));
    await page.locator('#trailLen').press('Tab');
    for (const [id, checked] of [
      ['glowMode', true],
      ['longExpose', true],
      ['interpolateRender', false],
      ['autoQual', false]
    ] as const)
      await page.locator(`#${id}`).setChecked(checked);
    await expand(page, '#native-setup');
    await page.locator('#setup-ensemble-count').fill(String(controls.ensemble.count));
    await page.locator('#setup-perturbation-variable').selectOption(controls.ensemble.spec.variable);
    await page.locator('#setup-perturbation-pattern').selectOption(controls.ensemble.spec.pattern);
    await page.locator('#setup-perturbation-epsilon').fill(String(controls.ensemble.spec.epsilon));
    await page.locator('#setup-perturbation-seed').fill(String(controls.ensemble.spec.seed));
    await page.locator('#current-workflow-goal').selectOption(controls.workflow.goal);
    await page.locator('#current-workflow-step').selectOption(controls.workflow.step);
    await page.locator('#current-workflow-stage').selectOption(controls.workflow.trajectoryStage);
    await page.locator('#current-workflow-notes').fill('PRIVATE_NOTE_DO_NOT_SHARE https://private.example.test/source');
    const originalBytes = await download(page, '전체 설정 JSON 다운로드', 'before-');
    const actual = JSON.parse(originalBytes.toString('utf8')) as ProductSetupV1;
    expect(actual).toEqual(setup(system));
    expect(originalBytes.toString('utf8')).not.toContain('PRIVATE_NOTE');
    expect(originalBytes.toString('utf8')).not.toContain('private.example.test');
    await page.getByRole('button', { name: '전체 설정 공유 링크 만들기', exact: true }).click();
    const full = await page.getByRole('link', { name: '전체 설정 공유 링크 열기', exact: true }).getAttribute('href');
    const url = new URL(full!, page.url());
    expect(url.search).toBe('');
    expect(url.hash).toMatch(/^#\/lab\/.+\?state=ps1\./);
    const resolved = resolveProductRoute(url.hash);
    expect(resolved.ok && resolved.value.setup).toEqual(actual);
    await page.getByRole('tab', { name: '내보내기', exact: true }).click();
    await page.getByRole('button', { name: '공유 링크 만들기', exact: true }).click();
    const existing = new URL(
      (await page.getByRole('link', { name: '공유 설정 열기', exact: true }).getAttribute('href'))!,
      page.url()
    );
    expect(existing.search).toBe('');
    expect(existing.hash).toBe(url.hash);
    await page.goto(url.href);
    await ready(page);
    await assertControls(page);
    await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '3.5');
    expect(await download(page, '전체 설정 JSON 다운로드', 'reopened-')).toEqual(originalBytes);
    await page.reload();
    await ready(page);
    await assertControls(page);
    expect(await storage(page)).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { setupAudioStarts: number }).setupAudioStarts)).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const pattern of PERTURBATION_PATTERNS) {
  test(`S28 public setup current ${pattern} queue preserves every native member and executes real worker results`, async ({
    page
  }) => {
    await open(page);
    await expand(page, '#native-setup');
    await page.locator('#setup-ensemble-count').fill('3');
    await page.locator('#setup-perturbation-variable').selectOption('iw2');
    await page.locator('#setup-perturbation-pattern').selectOption(pattern);
    await page.locator('#setup-perturbation-epsilon').fill(String(controls.ensemble.spec.epsilon));
    await page.locator('#setup-perturbation-seed').fill(String(controls.ensemble.spec.seed));
    await page.getByRole('button', { name: '현재 기준·근접 궤적 목록 준비', exact: true }).click();
    const queue = page.locator('#native-setup .legacy-run-list');
    await expect(queue).toHaveAttribute('data-queue-status', 'ready');
    await queue.getByRole('button', { name: '선택 part 실행·재개', exact: true }).click();
    await expect(queue).toHaveAttribute('data-queue-status', 'completed');
    const exported = JSON.parse(
      (await download(page, '선택 part 입력·결과·재개 JSON 저장', `${pattern}-`)).toString('utf8')
    );
    const spec = { ...controls.ensemble.spec, pattern };
    const members = [
      Array.from(basePlanar.initialState),
      ...buildPerturbedStates(basePlanar.initialState, 4, 3, 3, 'double', spec).members.map((member) =>
        Array.from(member)
      )
    ];
    expect(exported.plan.entries.map((entry: { sourceId: string }) => entry.sourceId)).toEqual([
      'reference',
      'perturbed-1',
      'perturbed-2',
      'perturbed-3'
    ]);
    expect(exported.runs).toHaveLength(4);
    let maxAbsoluteError = 0;
    exported.plan.entries.forEach((entry: { experiment: ExperimentStateV1 }, index: number) => {
      const actual = entry.experiment;
      expect(
        ['theta1', 'theta2', 'omega1', 'omega2'].map((key) =>
          actual.initialConditions[key]?.kind === 'scalar' ? actual.initialConditions[key].value : NaN
        )
      ).toEqual(members[index]);
      expect(actual.parameters).toEqual(experiment().parameters);
      expect(actual.integrator).toEqual(experiment().integrator);
      expect(actual.runtime).toEqual(experiment().runtime);
      expect(actual.seed).toEqual(experiment().seed);
      const run = exported.runs[index];
      expect(run.status).toBe('completed');
      expect(run.attempts).toBe(1);
      const simulation = createPlanarSimulation({
        ...basePlanar,
        initialState: members[index] as unknown as PlanarState
      });
      let expected = simulation.snapshot();
      for (let step = 0; step < 10; step++) expected = simulation.step();
      expect(run.result.summary.steps).toBe(10);
      expect(run.result.summary.sampleCount).toBe(11);
      expect(run.result.summary.axisStart).toBe(3.5);
      expect(run.result.summary.axisEnd).toBe(expected.time);
      expected.state.forEach((value, variable) => {
        const final = run.result.summary.metrics[variable].final as number;
        const error = Math.abs(final - value);
        maxAbsoluteError = Math.max(maxAbsoluteError, error);
        expect(error).toBeLessThanOrEqual(
          bounds.absolute + bounds.relative * Math.max(Math.abs(final), Math.abs(value))
        );
      });
    });
    test
      .info()
      .annotations.push({ type: 'native-cross-runtime-max-absolute-error', description: String(maxAbsoluteError) });
  });
}

test('S28 public setup JSON preview requires confirmation and preserves current state on cancellation and invalid files', async ({
  page
}) => {
  await open(page);
  const before = await storage(page),
    original = page.url();
  await expand(page, '#native-setup');
  const target = setup('triple'),
    serialized = serializeProductSetup(target);
  if (!serialized.ok) throw new Error('fixture');
  const file = page.locator('#product-setup-file'),
    region = page.getByRole('heading', { name: '전체 설정 JSON 미리보기', exact: true }).locator('..');
  const openFile = page.getByRole('button', { name: '확인한 전체 설정을 새 실험으로 열기', exact: true });
  const select = (name: string, buffer: Buffer) => file.setInputFiles({ name, mimeType: 'application/json', buffer });
  await select('target-triple.json', Buffer.from(serialized.value));
  await expect(openFile).toBeEnabled();
  await expect(region.locator('pre')).toContainText('system:triple');
  expect(page.url()).toBe(original);
  await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '3.5');
  expect(await storage(page)).toEqual(before);
  await page.getByRole('button', { name: '전체 설정 미리보기 취소', exact: true }).click();
  await expect(openFile).toBeDisabled();
  await expect(region.locator('pre')).toBeEmpty();
  for (const [name, buffer, message] of [
    ['bad.json', Buffer.from('{broken'), 'JSON'],
    ['duplicate.json', Buffer.from('{"schema":"x","schema":"x"}'), 'JSON'],
    [
      'private.json',
      Buffer.from(JSON.stringify({ ...target, rawLegacyUrl: 'https://private.example.test/original' })),
      '필드'
    ],
    ['utf8.json', Buffer.from([0xc3, 0x28]), 'UTF-8'],
    ['oversize.json', Buffer.alloc(MAX_PRODUCT_SETUP_FILE_BYTES + 1, 32), '256KiB']
  ] as const) {
    await select(name, buffer);
    await expect(region.getByRole('status')).toContainText(message);
    await expect(openFile).toBeDisabled();
    expect(page.url()).toBe(original);
  }
  await select('target-triple.json', Buffer.from(serialized.value));
  await expect(openFile).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('#native-setup')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page
    .locator('#native-setup')
    .screenshot({ path: `test-results/s28-public-setup-${test.info().project.name}.png` });
  await openFile.click();
  await ready(page);
  expect(new URL(page.url()).hash).toMatch(/^#\/lab\/triple\?state=ps1\./);
  await assertControls(page);
  expect(JSON.parse((await download(page, '전체 설정 JSON 다운로드', 'file-opened-')).toString('utf8'))).toEqual(
    target
  );
  expect(await storage(page)).toEqual(before);
});

test('S28 public setup invalid, mismatched and oversized routes stay intact without loading a native runtime', async ({
  page
}) => {
  const valid = createProductSetupRoute(setup());
  if (!valid.ok) throw new Error('fixture');
  for (const route of [
    '#/lab/double?state=ps1.A',
    valid.value.replace('/lab/double?', '/lab/triple?'),
    `#/lab/double?state=ps1.${'A'.repeat(MAX_SHARE_TOKEN_LENGTH)}`
  ]) {
    const requests: string[] = [];
    const collect = (request: { url(): string }) => requests.push(new URL(request.url()).pathname);
    page.on('request', collect);
    await page.goto(`/next.html${route}`);
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
    expect(new URL(page.url()).hash).toBe(route);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#product-main')).not.toContainText('ps1.');
    expect(
      requests.filter((path) =>
        /\/src\/(?:main\.ts|physics\/|chaos\/|runtime\/|workers\/|research\/)|\/assets\/(?:app|physics|chaos|research|.*worker)-/.test(
          path
        )
      )
    ).toEqual([]);
    page.off('request', collect);
  }
});

test('S28 public setup canceled, replaced and disposed file reads cannot restore a stale confirmation', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const pending = new Map<string, () => void>();
    (window as unknown as { pendingSetupFiles: Map<string, () => void> }).pendingSetupFiles = pending;
    (window as unknown as { releaseSetupFile(name: string): void }).releaseSetupFile = (name) => {
      pending.get(name)?.();
      pending.delete(name);
    };
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      const read = original.call(this);
      return this.name.startsWith('deferred-')
        ? new Promise<ArrayBuffer>((resolve, reject) => {
            read.then((bytes) => pending.set(this.name, () => resolve(bytes)), reject);
          })
        : read;
    };
  });
  await open(page);
  await expand(page, '#native-setup');
  const region = () => page.getByRole('heading', { name: '전체 설정 JSON 미리보기', exact: true }).locator('..');
  const openFile = () => page.getByRole('button', { name: '확인한 전체 설정을 새 실험으로 열기', exact: true });
  async function select(name: string, system: 'triple' | 'compound-double' = 'triple') {
    const text = serializeProductSetup(setup(system));
    if (!text.ok) throw new Error('fixture');
    await page
      .locator('#product-setup-file')
      .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text.value) });
  }
  async function pending(name: string) {
    await expect
      .poll(() =>
        page.evaluate(
          (key) => (window as unknown as { pendingSetupFiles: Map<string, () => void> }).pendingSetupFiles.has(key),
          name
        )
      )
      .toBe(true);
  }
  async function release(name: string) {
    await page.evaluate(
      (key) => (window as unknown as { releaseSetupFile(name: string): void }).releaseSetupFile(key),
      name
    );
  }
  await select('deferred-cancel.json');
  await pending('deferred-cancel.json');
  await expect(openFile()).toBeDisabled();
  await page.getByRole('button', { name: '전체 설정 미리보기 취소', exact: true }).click();
  await release('deferred-cancel.json');
  await expect(openFile()).toBeDisabled();
  await expect(region().locator('pre')).toBeEmpty();
  await select('deferred-replaced.json');
  await pending('deferred-replaced.json');
  await select('replacement.json', 'compound-double');
  await expect(region().locator('pre')).toContainText('system:compound-double');
  await release('deferred-replaced.json');
  await expect(region().locator('pre')).toContainText('system:compound-double');
  await expect(region().locator('pre')).not.toContainText('system:triple');
  await select('deferred-disposed.json');
  await pending('deferred-disposed.json');
  await page.evaluate(() => {
    location.hash = '#/lab/triple';
  });
  await ready(page);
  await release('deferred-disposed.json');
  await expand(page, '#native-setup');
  await expect(openFile()).toBeDisabled();
  await expect(region().locator('pre')).toBeEmpty();
  expect(errors).toEqual([]);
});

const workspaceModule =
  /\/(?:src\/product\/persistence\/legacy-workspace-panel\.ts|assets\/legacy-workspace-panel-[^/]+\.js)(?:\?.*)?$/;
test('S28 public setup library importer loads only on explicit expansion and cancellation ignores its late module', async ({
  page
}) => {
  let resume: (() => Promise<void>) | undefined;
  let moduleUrl = '';
  await page.route(workspaceModule, async (route) => {
    moduleUrl = route.request().url();
    await new Promise<void>((resolve) => {
      resume = async () => {
        await route.continue();
        resolve();
      };
    });
  });
  await page.goto('/next.html#/lab');
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  const before = await storage(page);
  expect(resume).toBeUndefined();
  await expect(page.locator('#legacy-workspace-file')).toHaveCount(0);
  await page.locator('#legacy-workspace-import > summary').click();
  await expect.poll(() => Boolean(resume)).toBe(true);
  await page.getByRole('button', { name: '작업공간 도구 불러오기 취소', exact: true }).click();
  await resume!();
  // Await the same already-authorized real module's completion so the negative
  // stale-render assertion does not pass before its import continuation runs.
  await page.evaluate(async (url) => {
    await import(url);
  }, moduleUrl);
  await expect(page.locator('#legacy-workspace-file')).toHaveCount(0);
  await expect(page.locator('#legacy-workspace-import [role=status]')).toContainText('취소');
  await page.getByRole('button', { name: '작업공간 도구 다시 불러오기', exact: true }).click();
  await expect(page.locator('#legacy-workspace-file')).toBeVisible();
  await expect(page.locator('#legacy-workspace-import')).toHaveCount(1);
  expect(await storage(page)).toEqual(before);
});

test('S28 public setup library importer exposes a recoverable load error and retries without losing current input', async ({
  page
}) => {
  await page.route(workspaceModule, (route) => route.abort('failed'));
  await page.goto('/next.html#/lab');
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await page.locator('#legacy-migration > summary').click();
  await page.locator('#legacy-migration-source').fill('original source kept while another importer loads');
  const before = await storage(page);
  await page.locator('#legacy-workspace-import > summary').click();
  await expect(page.locator('#legacy-workspace-import [role=alert]')).toContainText('불러오지 못했습니다');
  await page.unroute(workspaceModule);
  await page.getByRole('button', { name: '작업공간 도구 다시 불러오기', exact: true }).click();
  await expect(page.locator('#legacy-workspace-file')).toBeVisible();
  await expect(page.locator('#legacy-migration-source')).toHaveValue(
    'original source kept while another importer loads'
  );
  expect(await storage(page)).toEqual(before);
});
