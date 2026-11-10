import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { runAllValidationChecks } from '../../src/validation/validationSuite';

interface Destination {
  tab: string;
  label: string;
  route?: string;
  panel?: string;
  selector?: string;
  value?: string;
  plainSection?: boolean;
  action?: 'compare' | 'expansion' | 'validation';
}
// Independent semantic expectations for every preserved native tab identifier.
const destinations: readonly Destination[] = [
  { tab: 'lab', label: '작업 공간' },
  { tab: 'compare', label: '기준·근접 궤적 비교', action: 'compare' },
  {
    tab: 'lyap',
    label: 'Lyapunov 분석',
    panel: 'core-diagnostics',
    selector: 'core-diagnostic-kind',
    value: 'lyapunov'
  },
  { tab: 'sweep', label: '매개변수 sweep', panel: 'batch-experiments', selector: 'batch-kind', value: 'grid' },
  {
    tab: 'bifurc',
    label: '분기·연속추적',
    panel: 'stability-workflow',
    selector: 'stability-kind',
    value: 'continuation'
  },
  { tab: 'phase3d', label: '3D 위상공간', panel: 'native-phase-space' },
  { tab: 'density', label: '위상 방문 누적', panel: 'native-phase-density' },
  { tab: 'expansion', label: '확장 모델 전체 suite', action: 'expansion' },
  { tab: 'matrix', label: '실험 조건·결과 행렬', panel: 'batch-experiments', selector: 'batch-kind', value: 'grid' },
  { tab: 'validate', label: '수치 검증', action: 'validation' },
  { tab: 'golden', label: '기준 수치 검증', action: 'validation' },
  {
    tab: 'zeroone',
    label: '0–1 chaos test',
    panel: 'core-diagnostics',
    selector: 'core-diagnostic-kind',
    value: 'zero-one'
  },
  {
    tab: 'clv',
    label: '공변 Lyapunov 벡터',
    panel: 'advanced-diagnostics',
    selector: 'advanced-diagnostic-kind',
    value: 'clv'
  },
  {
    tab: 'basin',
    label: '인력권 분석',
    panel: 'advanced-diagnostics',
    selector: 'advanced-diagnostic-kind',
    value: 'basin'
  },
  {
    tab: 'rqa',
    label: '재귀 정량화',
    panel: 'advanced-diagnostics',
    selector: 'advanced-diagnostic-kind',
    value: 'rqa'
  },
  {
    tab: 'ftle',
    label: '유한시간 Lyapunov',
    panel: 'advanced-diagnostics',
    selector: 'advanced-diagnostic-kind',
    value: 'ftle'
  },
  { tab: 'architecture', label: '실행 backend와 구조', panel: 'runtime-acceleration', plainSection: true },
  { tab: 'research', label: '연구 프로젝트', panel: 'research-project-workflow' },
  { tab: 'lab3d', label: '3D 구속 진자', route: '#/lab/spherical-chain' },
  { tab: 'canonical', label: '정준 좌표 진단', panel: 'structure-diagnostics', plainSection: true },
  { tab: 'aplus', label: '추가 수치 검증', action: 'validation' },
  { tab: 'docs', label: '배우기 문서', route: '#/learn' },
  { tab: 'theory', label: '식과 이론', route: '#/learn' }
];
const bounds = JSON.parse(readFileSync('tests/characterization/numerical-golden.fixture.json', 'utf8')).tolerance
  .numeric as { absolute: number; relative: number };
function compareNative(actual: unknown, expected: unknown) {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    expect(Math.abs(Number(actual) - expected)).toBeLessThanOrEqual(
      bounds.absolute + bounds.relative * Math.max(Math.abs(Number(actual)), Math.abs(expected))
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    expected.forEach((entry, i) => compareNative((actual as unknown[])[i], entry));
  } else if (expected && typeof expected === 'object') {
    expect(actual && typeof actual === 'object').toBeTruthy();
    expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected))
      compareNative((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]);
  } else expect(actual).toEqual(expected);
}
for (const destination of destinations) {
  test(`S28 legacy tab ${destination.tab} preserves its source and opens ${destination.label}`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const source = `?tab=${destination.tab}&th1=0.125&workflowStep=measure&ensembleCount=2`;
    await page.goto('/next.html#/lab');
    await page.evaluate((text) => localStorage.setItem('s28-original-tab-source', text), source);
    await page.locator('#legacy-migration > summary').click();
    await page.getByLabel('기존 JSON 또는 공유 링크', { exact: true }).fill(source);
    await page.locator('#legacy-query-base').check();
    await page.getByLabel('새 관찰 시간 (s)', { exact: true }).fill('0.02');
    await page.getByRole('button', { name: '가져오기 미리보기', exact: true }).click();
    await page.getByRole('button', { name: '호환 작업공간에서 전달 설정 확인', exact: true }).click();
    await expect(page.locator('#legacy-link-context')).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '원본과 전체 호환 설정 다운로드', exact: true }).click();
    const file = await pending;
    expect(await file.failure()).toBeNull();
    const bytes = await readFile((await file.path())!);
    const envelope = JSON.parse(bytes.toString('utf8'));
    expect(envelope.sourceText).toBe(source);
    expect(envelope.sourceKind).toBe('legacy-url');
    expect(envelope.decoded.tab).toBe(destination.tab);
    await info.attach(`tab-${destination.tab}-original-envelope`, { body: bytes, contentType: 'application/json' });
    await page.reload();
    const navigation = page.locator('#legacy-navigation');
    await expect(navigation).toBeVisible();
    await navigation.getByRole('button', { name: `이동 목적 열기 · ${destination.label}`, exact: true }).click();
    if (destination.route) {
      await expect(page).toHaveURL((url) => url.hash === destination.route);
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
    } else if (destination.action === 'compare') {
      await expect(page.locator('#legacy-link-context .legacy-run-list')).toHaveAttribute('data-queue-status', 'ready');
    } else if (destination.action === 'expansion') {
      await expect(page.locator('#legacy-link-context .legacy-expansion-native')).toHaveAttribute(
        'data-suite-status',
        'ready'
      );
      await expect(page.locator('#legacy-link-context [role=status]').first()).toContainText('기본값');
    } else if (destination.action === 'validation') {
      const compute = navigation.getByRole('button', { name: '수치 검증 실행', exact: true });
      await expect(compute).toBeVisible();
      expect(await navigation.locator('pre').textContent()).toBe('');
      await compute.click();
      await expect(navigation.locator('pre')).toContainText('"problems"');
      const download = page.waitForEvent('download');
      await navigation.getByRole('button', { name: '수치 검증 보고서 JSON 다운로드', exact: true }).click();
      const result = await download;
      const reportBytes = await readFile((await result.path())!);
      const report = JSON.parse(reportBytes.toString('utf8'));
      compareNative(report, runAllValidationChecks());
      expect(report.ok).toBe(true);
      await info.attach('actual-native-validation-report', { body: reportBytes, contentType: 'application/json' });
    } else if (destination.panel) {
      const panel = page.locator(`#${destination.panel}`);
      if (destination.plainSection) {
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('heading').first()).toBeFocused();
      } else await expect(panel).toHaveAttribute('open', '');
      if (destination.selector) await expect(page.locator(`#${destination.selector}`)).toHaveValue(destination.value!);
    } else
      await expect(page.getByRole('tab', { name: '작업 공간', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => localStorage.getItem('s28-original-tab-source'))).toBe(source);
    expect(errors).toEqual([]);
  });
}
