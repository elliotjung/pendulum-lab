import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('S28 command search reaches lessons, systems, exact analysis selectors and current actions', async ({ page }) => {
  await page.goto('/next.html#/learn');
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: '명령 검색 · Command search' })).toBeVisible();
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('unit:8.12');
  // Stable IDs are searchable as well as bilingual names.
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('8.12');
  await page.getByRole('button', { name: /^8\.12 ·/ }).click();
  await expect(page).toHaveURL(/#\/learn\/course-8\/8\.12$/);
  await page.keyboard.press('Control+k');
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('system:double');
  await page.getByRole('button', { name: /점질량 이중 진자 ·/ }).click();
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.keyboard.press('Control+k');
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('analysis:fft');
  await page.getByRole('button', { name: /^푸리에 스펙트럼 ·/ }).click();
  await expect(page.locator('#core-diagnostic-kind')).toHaveValue('fft');
  await expect(page.locator('#core-diagnostic-kind')).toBeFocused();
  await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('현재 행동 한 단계');
  await page.getByRole('button', { name: '현재 행동 · 한 단계', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time'))).toBeGreaterThan(0);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('S28 command export preserves changed canonical physics while palette query DOM and handlers stay ephemeral', async ({
  page
}) => {
  await page.goto('/next.html#/lab/double');
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  async function canonicalDownload() {
    await page.getByRole('tab', { name: '내보내기', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '상태 JSON 다운로드', exact: true }).click();
    const file = await pending;
    expect(await file.failure()).toBeNull();
    return JSON.parse(await readFile((await file.path())!, 'utf8'));
  }
  const before = await canonicalDownload();
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await page.getByLabel('첫 번째 시작 각도 · theta1 (rad)', { exact: true }).fill('pi/7');
  await page.getByRole('tab', { name: '보관함', exact: true }).click();
  await page.getByRole('button', { name: '현재 설정 저장', exact: true }).click();
  await page.getByRole('tab', { name: '내보내기', exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('현재 행동 상태 JSON');
  const marker = 's28-live-search-dom-handler-marker';
  await page.evaluate((marker) => {
    const input = document.getElementById('product-command-query')!;
    input.setAttribute('data-s28-live-dom-marker', marker);
    const handler = () => marker;
    input.addEventListener('change', handler);
    Object.assign(window, { __s28LiveSearchHandler: handler });
  }, marker);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '현재 행동 · 상태 JSON 다운로드', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  const changedText = await readFile((await file.path())!, 'utf8');
  const changed = JSON.parse(changedText);
  await test.info().attach('s28-search-changed-canonical.json', { body: changedText, contentType: 'application/json' });
  const expected = structuredClone(before);
  expected.initialConditions.theta1.value = Math.PI / 7;
  expect(changed).toEqual(expected);
  expect(changed).not.toEqual(before);
  expect(JSON.stringify(changed)).not.toContain(marker);
  expect(JSON.stringify(changed)).not.toContain('현재 행동 상태 JSON');
  expect(JSON.stringify(changed)).not.toMatch(
    /"[^"\n]*(?:commandQuery|palette|handler|domElement|searchQuery)[^"\n]*"\s*:/i
  );
  await page.keyboard.press('Control+k');
  await page.getByLabel('시스템·분석·단원·현재 행동 검색').fill('s28-unsaved-palette-query');
  await page.reload();
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await expect(page.getByRole('dialog', { name: '명령 검색 · Command search' })).not.toBeVisible();
  await expect(page.locator('#product-command-query')).toHaveValue('');
  expect(await page.evaluate(() => '__s28LiveSearchHandler' in window)).toBe(false);
  expect(await canonicalDownload()).toEqual(changed);
  test.info().annotations.push({
    type: 's28-search-state-omission',
    description: JSON.stringify({
      theta1: Math.PI / 7,
      exactCanonicalChanged: true,
      reloadedPaletteClosed: true,
      reloadedQuery: '',
      domAndHandlersOmitted: true
    })
  });
});

test('S28 scientific entry and degree display preserve exact canonical values through unit changes and JSON', async ({
  page
}) => {
  await page.goto('/next.html#/lab/double');
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  const angle = page.getByLabel('첫 번째 시작 각도 · theta1 (rad)', { exact: true });
  await angle.fill('pi/7');
  await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  const unit = page.getByLabel('표시 단위 · theta1', { exact: true });
  for (let i = 0; i < 5; i++) {
    await unit.selectOption('deg');
    await unit.selectOption('rad');
  }
  await page.getByRole('tab', { name: '내보내기', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '상태 JSON 다운로드', exact: true }).click();
  const downloaded = await pending;
  const state = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(state.initialConditions.theta1).toEqual({ kind: 'scalar', unit: 'rad', value: Math.PI / 7 });
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await unit.selectOption('deg');
  await page.getByLabel('첫 번째 시작 각도 · theta1 (deg)', { exact: true }).fill('90');
  await unit.selectOption('rad');
  expect(Number(await angle.inputValue())).toBe(Math.PI / 2);
  await angle.fill('Math.PI');
  await expect(angle).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: '실행', exact: true })).toBeDisabled();
  await angle.fill('pi/2');
  await expect(page.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
});

test('S28 recorded native samples scrub, replay, export and restart as a new exact physical state', async ({
  page
}) => {
  await page.goto('/next.html#/lab/double');
  await page.locator('#run-history > summary').click();
  await page.getByRole('button', { name: '새 기록 시작', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '한 단계', exact: true }).click();
  await page.getByRole('button', { name: '기록 중지', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 JSON 다운로드', exact: true }).click();
  const result = await pending;
  const record = JSON.parse(await readFile((await result.path())!, 'utf8'));
  expect(record.schema).toBe('pendulum-recording/v1');
  expect(record.samples).toHaveLength(4);
  await page.locator('#run-history-cursor').fill('1');
  await page.getByRole('button', { name: '선택한 기록에서 새 실험 시작', exact: true }).click();
  await expect(page.locator('#lab-time')).toHaveAttribute('data-time', String(record.samples[1].time));
  await page.getByRole('tab', { name: '내보내기', exact: true }).click();
  const statePending = page.waitForEvent('download');
  await page.getByRole('button', { name: '상태 JSON 다운로드', exact: true }).click();
  const stateFile = await statePending;
  const state = JSON.parse(await readFile((await stateFile.path())!, 'utf8'));
  expect(state.runtime.start.value).toBe(record.samples[1].time);
  expect(['theta1', 'theta2', 'omega1', 'omega2'].map((key) => state.initialConditions[key].value)).toEqual(
    record.samples[1].state
  );
  await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
  await page.getByRole('button', { name: '기록 재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '기록 재생', exact: true })).toBeVisible();
});

test('S28 native renderer consumes display controls and exports settings without changing canonical physics', async ({
  page
}) => {
  await page.goto('/next.html#/lab/double');
  await page.locator('#native-display > summary').click();
  await expect(page.locator('#native-display')).toHaveAttribute('data-trail-points', /\d+/);
  await page.getByLabel('표시 품질', { exact: true }).selectOption('cinematic');
  await page.getByLabel('궤적 색', { exact: true }).selectOption('ice');
  await page.getByLabel('빛 번짐', { exact: true }).check();
  await page.getByLabel('긴 노출', { exact: true }).check();
  await page.getByLabel('궤적 길이', { exact: true }).fill('2500');
  await page.getByLabel('궤적 길이', { exact: true }).press('Tab');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '한 단계', exact: true }).click();
  await expect
    .poll(async () => Number(await page.locator('#native-display').getAttribute('data-trail-points')))
    .toBeGreaterThanOrEqual(3);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '표시 설정 JSON 다운로드', exact: true }).click();
  const file = await pending;
  const settings = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(settings).toMatchObject({
    schema: 'pendulum-display/v1',
    qualityMode: 'cinematic',
    trailMode: 'ice',
    trailLength: 2500,
    glow: true,
    longExposure: true
  });
  expect(await page.locator('#lab-time').getAttribute('data-time')).toBe('0.006');
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('S28 query handoff restores exact display/time settings and runs every native perturbation input after reload', async ({
  page
}) => {
  await page.goto('/next.html#/lab');
  await page.locator('#legacy-migration > summary').click();
  await page
    .getByLabel('기존 JSON 또는 공유 링크', { exact: true })
    .fill(
      '?th1=0.125&workflowStep=measure&ensembleCount=3&perturbationPattern=symmetric&epsilon=0.00012345678901234567&speed=1.7&spf=11&angleUnit=deg'
    );
  await page.locator('#legacy-query-base').check();
  await page.getByLabel('새 관찰 시간 (s)', { exact: true }).fill('0.02');
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  await page.getByRole('button', { name: '호환 작업공간에서 전달 설정 확인', exact: true }).click();
  await expect(page.locator('#legacy-link-context')).toBeVisible();
  await page.reload();
  await expect(page.locator('#legacy-link-context')).toBeVisible();
  await page.locator('#legacy-playback > summary').click();
  await expect(page.locator('#playback-speed')).toHaveValue('1.7');
  await expect(page.locator('#core-speed')).toHaveValue('1.7');
  await expect(page.locator('#playback-budget')).toHaveValue('11');
  await page.getByRole('tab', { name: '조건', exact: true }).click();
  await expect(page.getByLabel('표시 단위 · theta1', { exact: true })).toHaveValue('deg');
  await page.getByRole('tab', { name: '작업 공간', exact: true }).click();
  await page.getByRole('button', { name: '기준과 근접 궤적 조건 목록 준비', exact: true }).click();
  await page.getByRole('button', { name: '선택 part 실행·재개', exact: true }).click();
  await expect(page.locator('.legacy-run-list')).toHaveAttribute('data-queue-status', 'completed');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '선택 part 입력·결과·재개 JSON 저장', exact: true }).click();
  const file = await pending;
  const queue = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(queue.plan.entries).toHaveLength(4);
  expect(queue.runs.every((run: { status: string }) => run.status === 'completed')).toBe(true);
  expect(queue.plan.entries[0].experiment.initialConditions.theta1.value).toBe(0.125);
});
