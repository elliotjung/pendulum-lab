import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { RuntimeSnapshot } from '../../src/types/domain';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';
import { waitForModernShell } from '../shell';

interface LegacyLab {
  stop(): void;
  restoreSnapshot(snapshot: RuntimeSnapshot): void;
  runtimeSnapshot(): RuntimeSnapshot;
}
const session: RuntimeSnapshot = {
  schemaVersion: 'pendulum-session/v11-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.003,
  tolerance: 1e-7,
  stepsPerFrame: 4,
  damping: 0.02,
  parameters: { m1: 1.1, m2: 0.9, l1: 1.2, l2: 0.8, g: 9.81 },
  state: [0.4, -0.2, 0.125, -0.25],
  simTime: 1.5,
  seed: 42,
  hash: 's28-synthetic-restart'
};

async function openMigration(page: Page) {
  await page.goto('/next.html#/lab');
  await page.getByText('기존 데이터 가져오기', { exact: true }).click();
  await expect(page.getByLabel('기존 JSON 또는 공유 링크', { exact: true })).toBeVisible();
}

async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!);
}

test('S28 previews exact UTF-8 backup, explicitly adopts a restart and restores the untouched legacy snapshot', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app.html?audience=research&tab=lab');
  await waitForModernShell(page);
  const original = await page.evaluate((snapshot) => {
    const lab = (window as unknown as { __modernLab: LegacyLab }).__modernLab;
    lab.stop();
    lab.restoreSnapshot(snapshot);
    lab.stop();
    return lab.runtimeSnapshot();
  }, session);
  expect(original.state).toEqual(session.state);
  const source = `\uFEFF${JSON.stringify(original, null, 2).replaceAll('\n', '\r\n')}\r\n`;
  const storedBefore = await page.evaluate((text) => {
    localStorage.setItem('s28-test-original-session', text);
    return { ...localStorage };
  }, source);
  await openMigration(page);
  await page.getByLabel('기존 저장 파일 선택', { exact: true }).setInputFiles({
    name: 'legacy-session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source, 'utf8')
  });
  await expect(page.getByRole('status').filter({ hasText: '파일을 읽었습니다' })).toBeVisible();
  await page.getByLabel('새 관찰 시간 (s)', { exact: true }).fill('0.06');
  const adopt = page.getByRole('button', { name: '확인하고 새 실험실에서 열기', exact: true });
  await expect(adopt).toBeDisabled();
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '새 실험 설정을 확인했습니다', exact: true })).toBeVisible();
  await expect(page.getByLabel('가져오기 미리보기', { exact: true })).toContainText('0.125 rad/s');
  expect(await download(page, '원본 백업 다운로드')).toEqual(Buffer.from(source, 'utf8'));
  const canonical = JSON.parse((await download(page, '새 설정 JSON 다운로드')).toString('utf8')) as ExperimentStateV1;
  expect(canonical.systemId).toBe('system:double');
  expect(canonical.initialConditions.theta1).toEqual({ kind: 'scalar', value: original.state[0], unit: 'rad' });
  expect(canonical.seed?.value).toBe(String(original.seed));
  expect(canonical.integrator.kind === 'selectable' && canonical.integrator.id).toBe('integrator:rk4');
  expect(canonical.runtime).toMatchObject({ start: { value: 1.5 }, duration: { value: 0.06 }, step: { value: 0.003 } });
  const audit = await new AxeBuilder({ page })
    .include('#legacy-migration')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('#legacy-migration')
    .screenshot({ path: `test-results/s28-migration-${test.info().project.name}.png` });
  await adopt.click();
  await expect(page).toHaveURL(/#\/lab\/double\?state=pe1\./);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await expect(page.locator('#lab-time')).toHaveAttribute('data-time', '1.5');
  await page.getByRole('button', { name: '한 단계', exact: true }).click();
  await expect
    .poll(async () => Number(await page.locator('#lab-time').getAttribute('data-time')))
    .toBeCloseTo(1.503, 10);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(storedBefore);
  await page.goto('/app.html?audience=research&tab=lab');
  await waitForModernShell(page);
  const restored = await page.evaluate(() => {
    const lab = (window as unknown as { __modernLab: LegacyLab }).__modernLab;
    const text = localStorage.getItem('s28-test-original-session')!;
    lab.stop();
    lab.restoreSnapshot(JSON.parse(text.replace(/^\uFEFF/, '')) as RuntimeSnapshot);
    lab.stop();
    return { snapshot: lab.runtimeSnapshot(), text };
  });
  expect(restored.text).toBe(source);
  expect(restored.snapshot).toEqual(original);
  expect(errors).toEqual([]);
});

test('S28 preserves unsupported and malicious input, invalidates edited previews and supports keyboard cancellation', async ({
  page
}) => {
  await openMigration(page);
  const source = page.getByLabel('기존 JSON 또는 공유 링크', { exact: true });
  const adopt = page.getByRole('button', { name: '확인하고 새 실험실에서 열기', exact: true });
  const unsupported = JSON.stringify({ ...session, method: 'yoshida4' });
  await source.fill(unsupported);
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '원본을 보존하고 복구가 필요합니다', exact: true })).toBeVisible();
  await expect(adopt).toBeDisabled();
  expect((await download(page, '원본 백업 다운로드')).toString('utf8')).toBe(unsupported);
  await source.fill('{"schemaVersion":"pendulum-session/v11-ts","__proto__":{"polluted":true}}');
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  await expect(adopt).toBeDisabled();
  expect(await page.evaluate(() => Object.hasOwn(Object.prototype, 'polluted'))).toBe(false);
  await source.fill(JSON.stringify(session));
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  await expect(adopt).toBeEnabled();
  await source.fill(JSON.stringify({ ...session, dt: 0.004 }));
  await expect(adopt).toBeDisabled();
  await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
  const cancel = page.getByRole('button', { name: '미리보기 취소', exact: true });
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(adopt).toBeDisabled();
  await expect(source).toHaveValue(JSON.stringify({ ...session, dt: 0.004 }));
  await expect(page).toHaveURL(/#\/lab$/);
});

test('S28 keeps legacy share, expansion and Landing links recoverable without redirecting or dropping options', async ({
  page
}) => {
  await openMigration(page);
  const source = page.getByLabel('기존 JSON 또는 공유 링크', { exact: true });
  for (const input of [
    `https://example.test/app.html?method=rk4#experiment=${Buffer.from(JSON.stringify({ v: 4, ensemble: { n: 17 } })).toString('base64url')}`,
    'https://example.test/app.html?goal=reproduce&method=yoshida4',
    '#expansion=original-unsupported'
  ]) {
    await source.fill(input);
    await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
    await expect(page.getByRole('button', { name: '확인하고 새 실험실에서 열기', exact: true })).toBeDisabled();
    expect((await download(page, '원본 백업 다운로드')).toString('utf8')).toBe(input);
    await expect(page.getByRole('link', { name: '기존 앱에서 원본 복구하기', exact: true })).toHaveAttribute(
      'href',
      './app.html'
    );
    await expect(page).toHaveURL(/#\/lab$/);
  }
});
