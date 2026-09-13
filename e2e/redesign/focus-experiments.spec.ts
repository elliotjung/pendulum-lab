import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';

const unitIds = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8'] as const;
const focusDraftKey = (id: string) => `pendulum-product/focus/v1/course-1/${id}`;
const focusChunk = (url: URL): boolean =>
  url.pathname === '/src/product/experiments/view.ts' || /\/assets\/view-[^/]+\.js$/.test(url.pathname);

async function ready(page: Page): Promise<void> {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

async function openUnit(page: Page, id: string): Promise<void> {
  await page.goto(`/next.html#/learn/course-1/${id}`);
  await ready(page);
  await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'ready');
  await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
  await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
}

async function audit(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
    }))
  ).toEqual([]);
}

async function withinViewport(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function runFocus(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실험 실행', exact: true }).click();
  await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
  expect(Number(await page.locator('#focus-time').getAttribute('data-time'))).toBeGreaterThan(0);
}

async function exportCanonical(page: Page): Promise<ExperimentStateV1> {
  await page.getByRole('tab', { name: '내보내기', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '상태 JSON 다운로드', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as ExperimentStateV1;
}

async function savedCanonical(page: Page, id: string): Promise<ExperimentStateV1> {
  const draft = await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey(id));
  expect(draft).not.toBeNull();
  return (JSON.parse(draft!) as { experiment: ExperimentStateV1 }).experiment;
}

async function labReady(page: Page, id: string): Promise<void> {
  await expect(page).toHaveURL(/#\/lab\/double\?state=/);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await expect(page.locator('.lab-workspace')).toContainText(`출처 단원 ${id}`);
  await expect(page.getByRole('link', { name: '단원으로 돌아가기', exact: true })).toHaveAttribute(
    'href',
    `#/learn/course-1/${id}`
  );
}

test.describe('S09 course one Focus Experiment journeys', () => {
  for (const id of unitIds) {
    test(`${id}: executes its real experiment and preserves edited settings through Lab, back and reload`, async ({
      page
    }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await openUnit(page, id);
      const focus = page.locator('.focus-experiment');
      await expect(focus.getByRole('button', { name: '실험 실행', exact: true })).toBeEnabled();
      await expect(focus.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeEnabled();
      await expect(page.locator('#focus-time')).toHaveAttribute('data-time', '0');
      await expect(focus).not.toContainText(/준비 중|샘플 단원/);
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith('pendulum-product/learn-progress/'))
        )
      ).toEqual([]);
      const theta = page.locator('#focus-theta1');
      const editedTheta = (Number(await theta.inputValue()) + 0.01).toString();
      await theta.fill(editedTheta);
      await expect(theta).toHaveAttribute('aria-invalid', 'false');
      await expect(focus.locator('#focus-g')).toHaveCount(0);
      await expect(focus.locator('#focus-step')).toHaveCount(0);
      const expected = await savedCanonical(page, id);
      await runFocus(page);
      await expect(focus.getByRole('img').first()).toBeVisible();
      await expect(focus.locator('[data-focus-results]')).not.toBeEmpty();
      await withinViewport(page);
      await audit(page);
      const completedTime = await page.locator('#focus-time').getAttribute('data-time');
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await labReady(page, id);
      expect(await exportCanonical(page)).toEqual(expected);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#/learn/course-1/${id.replace('.', '\\.')}$`));
      await expect(theta).toHaveValue(editedTheta);
      await expect(page.locator('#focus-time')).toHaveAttribute('data-time', completedTime!);
      await page.reload();
      await ready(page);
      await expect(theta).toHaveValue(editedTheta);
      await expect(page.locator('#focus-time')).toHaveAttribute('data-time', '0');
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await labReady(page, id);
      expect(await exportCanonical(page)).toEqual(expected);
      expect(errors).toEqual([]);
    });
  }

  test('carries edited SI settings and unit provenance to Lab, browser back and reload', async ({ page }) => {
    await openUnit(page, '1.2');
    await page.evaluate(() => {
      localStorage.setItem('pendulum-lab/s09-original', '{"opaque":"original"}');
      sessionStorage.setItem('pendulum-lab/s09-original-session', 'keep-original');
    });
    await page.locator('#focus-l1').fill('1.7');
    await page.locator('#focus-l2').fill('0.8');
    await runFocus(page);
    const focusTime = await page.locator('#focus-time').getAttribute('data-time');
    const draft = await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'));
    expect(draft).not.toBeNull();
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
    await expect(page).toHaveURL(/#\/lab\/double\?state=/);
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await expect(page.locator('.lab-workspace')).toContainText('출처 단원 1.2');
    await expect(page.getByRole('link', { name: '단원으로 돌아가기', exact: true })).toHaveAttribute(
      'href',
      '#/learn/course-1/1.2'
    );
    await page.getByRole('tab', { name: '조건', exact: true }).click();
    await expect(page.getByLabel('첫 번째 길이 · l1 (m)', { exact: true })).toHaveValue('1.7');
    await expect(page.getByLabel('두 번째 길이 · l2 (m)', { exact: true })).toHaveValue('0.8');
    const canonical = await exportCanonical(page);
    expect(canonical).toMatchObject({
      schema: 'pendulum-experiment/v1',
      systemId: 'system:double',
      parameters: { l1: { value: 1.7, unit: 'm' }, l2: { value: 0.8, unit: 'm' } },
      initialConditions: {
        theta1: { unit: 'rad' },
        theta2: { unit: 'rad' },
        omega1: { unit: 'rad/s' },
        omega2: { unit: 'rad/s' }
      },
      runtime: { domain: 'time', start: { value: 0, unit: 's' }, duration: { unit: 's' }, step: { unit: 's' } },
      provenance: { source: { kind: 'derived' } }
    });
    expect(canonical.provenance?.source.id).toContain('1.2');
    expect(canonical.analyses.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    expect(await exportCanonical(page)).toEqual(canonical);
    await page.goBack();
    await ready(page);
    await expect(page).toHaveURL(/#\/learn\/course-1\/1\.2$/);
    await expect(page.locator('#focus-l1')).toHaveValue('1.7');
    await expect(page.locator('#focus-l2')).toHaveValue('0.8');
    // Reloading Lab creates a new document, so the Focus draft restores initial replay settings.
    await expect(page.locator('#focus-time')).toHaveAttribute('data-time', '0');
    await runFocus(page);
    await expect(page.locator('#focus-time')).toHaveAttribute('data-time', focusTime!);
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    expect(await exportCanonical(page)).toEqual(canonical);
    await page.goBack();
    await expect(page.locator('#focus-time')).toHaveAttribute('data-time', focusTime!);
    await expect(page.locator('#focus-l1')).toHaveValue('1.7');
    await page.reload();
    await ready(page);
    await expect(page.locator('#focus-l1')).toHaveValue('1.7');
    await expect(page.locator('#focus-l2')).toHaveValue('0.8');
    expect(await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'))).toBe(draft);
    expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/s09-original'))).toBe('{"opaque":"original"}');
    expect(await page.evaluate(() => sessionStorage.getItem('pendulum-lab/s09-original-session'))).toBe(
      'keep-original'
    );
  });

  test('moves the configuration point with each angle and preserves periodic geometry with unwrapped text', async ({
    page
  }) => {
    await openUnit(page, '1.1');
    const first = page.locator('#focus-theta1');
    const second = page.locator('#focus-theta2');
    const configuration = page.locator('[data-focus-plot="configuration"]');
    const dot = configuration.locator('svg circle');
    await first.fill('0');
    await second.fill('0');
    const origin = [Number(await dot.getAttribute('cx')), Number(await dot.getAttribute('cy'))];
    await first.fill('0.5');
    expect(Number(await dot.getAttribute('cx'))).toBeGreaterThan(origin[0]!);
    expect(Number(await dot.getAttribute('cy'))).toBeCloseTo(origin[1]!, 8);
    await second.fill('0.4');
    const changed = [Number(await dot.getAttribute('cx')), Number(await dot.getAttribute('cy'))];
    expect(changed[1]).toBeLessThan(origin[1]!);
    const fullTurn = 0.5 + 2 * Math.PI;
    await first.fill(String(fullTurn));
    expect(Number(await dot.getAttribute('cx'))).toBeCloseTo(changed[0]!, 8);
    expect(Number(await dot.getAttribute('cy'))).toBeCloseTo(changed[1]!, 8);
    await expect(configuration.locator('dd')).toContainText(fullTurn.toFixed(5));
    await expect(first).toHaveValue(String(fullTurn));
  });

  test('retains selected Lagrange terms through Lab and back without announcing every solver update', async ({
    page
  }) => {
    await openUnit(page, '1.4');
    const terms = page.locator('.focus-derivation');
    const gravity = terms.getByRole('checkbox', { name: '중력항', exact: true });
    const velocity = terms.getByRole('checkbox', { name: '속도 결합항', exact: true });
    const damping = terms.getByRole('checkbox', { name: '감쇠항', exact: true });
    const result = terms.locator('output');
    await expect(result).toHaveAttribute('aria-live', 'off');
    await expect(result).toHaveAccessibleName('선택한 유도 항의 순간 가속도 기여');
    await gravity.uncheck();
    await damping.uncheck();
    await runFocus(page);
    const observed = await result.textContent();
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
    await labReady(page, '1.4');
    await page.goBack();
    await expect(gravity).not.toBeChecked();
    await expect(damping).not.toBeChecked();
    await expect(velocity).toBeChecked();
    await expect(result).toHaveText(observed!);
    await expect(result).toHaveAttribute('aria-live', 'off');
    await audit(page);
  });

  test('rejects invalid drafts before execution or transfer and recovers the same unit', async ({ page }) => {
    await openUnit(page, '1.2');
    const length = page.locator('#focus-l1');
    await length.fill('1.5');
    const original = await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'));
    await length.fill('-1');
    await expect(length).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '실험 실행', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeDisabled();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'))).toBe(original);
    await audit(page);
    await length.fill('1.5');
    await expect(length).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByRole('button', { name: '실험실에서 계속', exact: true })).toBeEnabled();
    await runFocus(page);
  });

  test('cancels a running experiment and starts again from its valid initial conditions', async ({ page }) => {
    await openUnit(page, '1.8');
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'running');
    await page.getByRole('button', { name: '실험 취소', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'cancelled');
    await expect(page.getByRole('button', { name: '실험 실행', exact: true })).toBeEnabled();
    await audit(page);
    await page.getByRole('button', { name: '실험 처음으로', exact: true }).click();
    await expect(page.locator('#focus-time')).toHaveAttribute('data-time', '0');
    await runFocus(page);
  });

  test('reports a scheduler failure and recovers without losing valid settings', async ({ page }) => {
    await openUnit(page, '1.2');
    await page.locator('#focus-l1').fill('1.6');
    const original = await savedCanonical(page, '1.2');
    await page.getByRole('button', { name: '실험 실행', exact: true }).evaluate((button) => {
      button.addEventListener(
        'click',
        () => {
          const originalTimeout = window.setTimeout;
          window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
            if (delay === 16) throw new Error('S09 scheduler failure fixture');
            return originalTimeout(handler, delay, ...args);
          }) as typeof window.setTimeout;
          // A microtask checkpoint can occur between event listeners. Keep the
          // injected fault until the next task so the click handler encounters it.
          originalTimeout(() => {
            window.setTimeout = originalTimeout;
          }, 0);
        },
        { capture: true, once: true }
      );
    });
    await page.getByRole('button', { name: '실험 실행', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'error');
    await expect(page.locator('.focus-experiment').getByRole('alert')).toContainText('S09 scheduler failure fixture');
    await expect(page.locator('#focus-l1')).toHaveValue('1.6');
    expect(await savedCanonical(page, '1.2')).toEqual(original);
    await audit(page);
    await page.getByRole('button', { name: '실험 처음으로', exact: true }).click();
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
    await expect(page.locator('.focus-experiment').getByRole('alert')).not.toBeVisible();
    await runFocus(page);
  });

  for (const [kind, original] of [
    ['malformed', '{not-json'],
    ['future-version', '{"schema":"pendulum-focus-session/v9","contentVersion":1,"experiment":{}}'],
    [
      'unknown-field',
      '{"schema":"pendulum-focus-session/v1","contentVersion":1,"experiment":{},"privateNote":"keep-me"}'
    ]
  ] as const) {
    test(`preserves ${kind} Focus storage while allowing unsaved experiment and transfer`, async ({ page }) => {
      await page.goto('/next.html#/learn');
      await ready(page);
      await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
        key: focusDraftKey('1.2'),
        value: original
      });
      await openUnit(page, '1.2');
      await expect(page.locator('.focus-storage-status')).toHaveAttribute('role', 'status');
      await expect(page.locator('.focus-storage-status')).toContainText(/저장|원본/);
      await page.locator('#focus-l1').fill('1.6');
      await runFocus(page);
      expect(await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'))).toBe(original);
      await audit(page);
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await labReady(page, '1.2');
      expect((await exportCanonical(page)).parameters.l1).toMatchObject({ value: 1.6, unit: 'm' });
      await page.goBack();
      await expect(page.locator('#focus-l1')).toHaveValue('1.6');
      expect(await page.evaluate((key) => sessionStorage.getItem(key), focusDraftKey('1.2'))).toBe(original);
    });
  }

  for (const kind of ['unavailable', 'quota'] as const) {
    test(`keeps Focus runnable and transferable when session storage is ${kind}`, async ({ page }) => {
      await page.addInitScript(
        ({ key, failure }) => {
          const method = failure === 'unavailable' ? 'getItem' : 'setItem';
          const getItem = Storage.prototype.getItem;
          const setItem = Storage.prototype.setItem;
          Object.defineProperty(Storage.prototype, method, {
            configurable: true,
            value(this: Storage, candidate: string, value?: string) {
              if (candidate === key)
                throw new DOMException(
                  'S09 Focus storage fixture',
                  failure === 'unavailable' ? 'SecurityError' : 'QuotaExceededError'
                );
              return method === 'getItem' ? getItem.call(this, candidate) : setItem.call(this, candidate, value!);
            }
          });
        },
        { key: focusDraftKey('1.2'), failure: kind }
      );
      await openUnit(page, '1.2');
      await page.locator('#focus-l1').fill('1.6');
      await expect(page.locator('.focus-storage-status')).toHaveAttribute('role', 'status');
      await expect(page.locator('.focus-storage-status')).toContainText(/저장/);
      await runFocus(page);
      await page.getByRole('button', { name: '실험실에서 계속', exact: true }).click();
      await labReady(page, '1.2');
      expect((await exportCanonical(page)).parameters.l1).toMatchObject({ value: 1.6, unit: 'm' });
      await page.goBack();
      await expect(page.locator('#focus-l1')).toHaveValue('1.6');
      await page.reload();
      await ready(page);
      await expect(page.locator('#focus-l1')).toHaveValue('1');
      await runFocus(page);
    });
  }

  test('contains a failed Focus chunk while retaining theory and recovers the requested unit', async ({ page }) => {
    await page.route(focusChunk, (route) => route.abort('failed'));
    await page.goto('/next.html#/learn/course-1/1.1', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expect(page.locator('.learn-unit')).toHaveAttribute('data-content-state', 'ready');
    await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'error');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('math').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '실험 다시 시도', exact: true })).toBeVisible();
    await audit(page);
    await page.unroute(focusChunk);
    await page.getByRole('button', { name: '실험 다시 시도', exact: true }).click();
    await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
    await expect(page).toHaveURL(/#\/learn\/course-1\/1\.1$/);
    await runFocus(page);
  });

  for (const action of ['cancel', 'navigate'] as const) {
    test(`keeps delayed Focus code from mounting after ${action}`, async ({ page }) => {
      let release = (): void => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let requested = (): void => {};
      const intercepted = new Promise<void>((resolve) => {
        requested = resolve;
      });
      await page.route(focusChunk, async (route) => {
        requested();
        await released;
        await route.continue();
      });
      try {
        await page.goto('/next.html#/learn/course-1/1.1', { waitUntil: 'domcontentloaded' });
        await intercepted;
        const cancel = page.getByRole('button', { name: '실험 불러오기 취소', exact: true });
        await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'loading');
        await expect(cancel).toBeVisible();
        await expect(page.getByRole('math').first()).toBeVisible();
        if (action === 'cancel') {
          await cancel.click();
          await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'cancelled');
          await expect(page.getByRole('button', { name: '실험 다시 시도', exact: true })).toBeVisible();
        } else {
          await page
            .getByRole('navigation', { name: '주요 공간' })
            .getByRole('link', { name: '실험실', exact: true })
            .click();
          await ready(page);
        }
        const response = page.waitForResponse((item) => focusChunk(new URL(item.url())));
        release();
        await response;
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        );
        await expect(page.locator('.focus-experiment')).toHaveCount(0);
        if (action === 'cancel') {
          await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'cancelled');
          await audit(page);
          await page.getByRole('button', { name: '실험 다시 시도', exact: true }).click();
          await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
          await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
        } else await expect(page).toHaveURL(/#\/lab$/);
      } finally {
        release();
        await page.unroute(focusChunk);
      }
    });
  }

  test('supports keyboard edits, execution and transfer with 320px and 200% reflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openUnit(page, '1.2');
    const length = page.locator('#focus-l1');
    await length.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('1.4');
    await page.keyboard.press('Tab');
    await expect(length).toHaveValue('1.4');
    await expect(length).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: '실험 실행', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'completed');
    const chart = page.locator('[data-focus-plot="cartesian"] .focus-chart');
    await expect(chart.locator('.focus-chart__title')).toHaveText('두 질점의 궤적');
    await expect(chart.locator('.focus-chart__legend')).toContainText('질점 1 · 실선');
    await expect(chart.locator('.focus-chart__legend')).toContainText('질점 2 · 파선');
    await expect(chart.locator('.focus-chart__axes')).toContainText('가로축 x (m):');
    await expect(chart.locator('.focus-chart__axes')).toContainText('세로축 y (m):');
    const caption = chart.locator('.focus-chart__caption');
    await expect(caption).toBeVisible();
    expect(await caption.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(
      12
    );
    await withinViewport(page);
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.locator('html').evaluate((node) => {
      node.style.zoom = '2';
    });
    await withinViewport(page);
    await audit(page);
    await page.getByRole('button', { name: '실험실에서 계속', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
    await withinViewport(page);
    await page.getByRole('link', { name: '단원으로 돌아가기', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#focus-l1')).toHaveValue('1.4');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`reviews Focus geometry, contributions and sensitivity in ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      for (const id of ['1.2', '1.5', '1.8']) {
        await openUnit(page, id);
        await page.getByLabel('화면 테마').selectOption(theme);
        await runFocus(page);
        await page.locator('.focus-experiment').scrollIntoViewIfNeeded();
        await withinViewport(page);
        await audit(page);
        await expect(page.locator('.focus-experiment')).toHaveScreenshot(`s09-focus-${id}-${theme}.png`);
      }
    });
  }
});
