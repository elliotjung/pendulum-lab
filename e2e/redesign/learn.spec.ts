import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const sampleHash = '#/learn/course-1/1.1';
const progressKey = 'pendulum-product/learn-progress/v1/1.1';
const sampleChunk = (url: URL): boolean =>
  url.pathname === '/content/learn/course-1/1.1.ts' || /\/assets\/1\.1-[^/]+\.js$/.test(url.pathname);

interface SavedProgress {
  schema: string;
  unitId: string;
  versions: {
    contentVersion: number;
    checks: { checkpointId: string; selectedOptionId: string | null; attempts: number; correct: boolean }[];
  }[];
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

async function openSample(page: Page): Promise<void> {
  await page.goto(`/next.html${sampleHash}`);
  await ready(page);
  await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'ready');
  await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
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

async function storedProgress(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), progressKey);
}

async function answer(page: Page, checkpointId: string, label: string): Promise<void> {
  const checkpoint = page.locator(`[data-learn-check="${checkpointId}"]`);
  await checkpoint.getByRole('radio', { name: label, exact: true }).check();
  await checkpoint.getByRole('button', { name: '답 확인', exact: true }).click();
}

async function savedCheck(page: Page, checkpointId: string) {
  const raw = await storedProgress(page);
  expect(raw).not.toBeNull();
  const saved = JSON.parse(raw!) as SavedProgress;
  expect(saved.schema).toBe('pendulum-learn-progress/v1');
  expect(saved.unitId).toBe('1.1');
  return saved.versions
    .find((version) => version.contentVersion === 1)
    ?.checks.find((check) => check.checkpointId === checkpointId);
}

async function unrelatedStorage(page: Page) {
  return page.evaluate(
    (learnKey) => ({
      local: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key !== learnKey)
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      ),
      session: Object.fromEntries(
        Object.keys(sessionStorage)
          .sort()
          .map((key) => [key, sessionStorage.getItem(key)])
      )
    }),
    progressKey
  );
}

async function seedUnrelatedStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('pendulum-lab/s08-original', '{"opaque":"keep-original"}');
    localStorage.setItem('pendulum-product/planar/v1/double', 'opaque-saved-lab-state');
    localStorage.setItem('pendulum-product/learn-progress/v1/8.12', 'opaque-other-unit');
    sessionStorage.setItem('pendulum-lab/s08-session', 'keep-original-session');
  });
}

async function finishFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}

test.describe('S08 Learn content platform', () => {
  test('keeps course and planned-unit routes independent of learning completion', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/next.html#/learn');
    await ready(page);
    const main = page.locator('#product-main');
    await expect(main.locator('.learn-grid a[href^="#/learn/course-"]')).toHaveCount(8);
    await expect(main.locator('.learn-grid')).toHaveCSS('display', 'grid');
    await main.locator('a[href="#/learn/course-1"]').click();
    await ready(page);
    await expect(main.locator('a[href^="#/learn/course-1/"]')).toHaveCount(8);
    await main.locator(`a[href="${sampleHash}"]`).click();
    await ready(page);
    expect(await storedProgress(page)).toBeNull();
    await page
      .getByRole('navigation', { name: '주요 공간' })
      .getByRole('link', { name: '실험실', exact: true })
      .click();
    await ready(page);
    await expect(page).toHaveURL(/#\/lab$/);
    await page.goto('/next.html#/learn/course-8/8.12');
    await ready(page);
    await expect(main).toContainText(/준비|예정|아직/);
    await expect(main.locator('canvas')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: '학습 경로' }).locator('a[href="#/learn/course-8"]')
    ).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page).toHaveURL(/#\/learn\/course-8\/8\.12$/);
    expect(errors).toEqual([]);
  });

  test('offers all 86 unit routes through eight courses without preloading sample content', async ({ page }) => {
    const requests: URL[] = [];
    page.on('request', (request) => requests.push(new URL(request.url())));
    await page.goto('/next.html#/learn');
    await ready(page);
    const ids: string[] = [];
    const expectedCounts = [8, 9, 9, 10, 13, 12, 13, 12];
    for (let index = 0; index < expectedCounts.length; index += 1) {
      const course = `course-${index + 1}`;
      await page.locator(`#product-main a[href="#/learn/${course}"]`).click();
      await ready(page);
      const units = page.locator(`#product-main a[href^="#/learn/${course}/"]`);
      await expect(units).toHaveCount(expectedCounts[index]!);
      for (const unit of await units.all()) {
        await expect(unit).not.toHaveAttribute('aria-disabled', 'true');
        ids.push((await unit.getAttribute('href'))!);
      }
      await page
        .getByRole('navigation', { name: '주요 공간' })
        .getByRole('link', { name: '배우기', exact: true })
        .click();
      await ready(page);
    }
    expect(ids).toHaveLength(86);
    expect(new Set(ids).size).toBe(86);
    expect(requests.filter(sampleChunk)).toEqual([]);
    expect(await storedProgress(page)).toBeNull();
  });

  test('opens every unit in course order with working previous and next navigation', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const expectedCounts = [8, 9, 9, 10, 13, 12, 13, 12];
    let visited = 0;
    await page.goto('/next.html#/learn');
    await ready(page);
    for (let index = 0; index < expectedCounts.length; index += 1) {
      const course = `course-${index + 1}`;
      await page.locator(`#product-main a[href="#/learn/${course}"]`).click();
      await ready(page);
      await page.locator(`#product-main a[href="#/learn/${course}/${index + 1}.1"]`).click();
      for (let order = 1; order <= expectedCounts[index]!; order += 1) {
        await ready(page);
        await expect(page).toHaveURL(new RegExp(`#/learn/${course}/${index + 1}\\.${order}$`));
        await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute(
          'data-content-state',
          index === 0 ? 'ready' : 'planned'
        );
        const navigation = page.getByRole('navigation', { name: '단원 이동' });
        await expect(navigation.getByRole('link', { name: '과정 목차', exact: true })).toHaveAttribute(
          'href',
          `#/learn/${course}`
        );
        const previous = navigation.getByRole('link', { name: /^이전 단원/ });
        if (order === 1) await expect(previous).toHaveCount(0);
        else await expect(previous).toHaveAttribute('href', `#/learn/${course}/${index + 1}.${order - 1}`);
        visited += 1;
        const next = navigation.getByRole('link', { name: /^다음 단원/ });
        if (order === expectedCounts[index]) await expect(next).toHaveCount(0);
        else {
          await expect(next).toHaveAttribute('href', `#/learn/${course}/${index + 1}.${order + 1}`);
          await next.click();
        }
      }
      await page
        .getByRole('navigation', { name: '학습 경로' })
        .getByRole('link', { name: '전체 과정', exact: true })
        .click();
      await ready(page);
    }
    expect(visited).toBe(86);
    expect(await storedProgress(page)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('persists wrong and correct answers across reload while keeping other user data intact', async ({ page }) => {
    await openSample(page);
    await seedUnrelatedStorage(page);
    const before = await unrelatedStorage(page);
    expect(await storedProgress(page)).toBeNull();
    await answer(page, 'coordinates', '한 개');
    await expect(page.locator('[data-learn-check="coordinates"]')).toContainText('한 각도만 정하면');
    expect(await savedCheck(page, 'coordinates')).toMatchObject({
      selectedOptionId: 'one',
      attempts: 1,
      correct: false
    });
    await page.reload();
    await ready(page);
    await expect(
      page.locator('[data-learn-check="coordinates"]').getByRole('radio', { name: '한 개', exact: true })
    ).toBeChecked();
    await answer(page, 'coordinates', '두 개');
    await answer(page, 'downward-position', 'x1 = 0 m, y1 = -1 m');
    expect(await savedCheck(page, 'coordinates')).toMatchObject({
      selectedOptionId: 'two',
      attempts: 2,
      correct: true
    });
    expect(await savedCheck(page, 'downward-position')).toMatchObject({
      selectedOptionId: 'below',
      attempts: 1,
      correct: true
    });
    await expect(page.locator('.learn-progress-text')).toContainText(/2\s*\/\s*2/);
    await page.reload();
    await ready(page);
    await expect(
      page.locator('[data-learn-check="coordinates"]').getByRole('radio', { name: '두 개', exact: true })
    ).toBeChecked();
    await expect(
      page
        .locator('[data-learn-check="downward-position"]')
        .getByRole('radio', { name: 'x1 = 0 m, y1 = -1 m', exact: true })
    ).toBeChecked();
    await expect(page.locator('.learn-progress-text')).toContainText(/2\s*\/\s*2/);
    await page
      .getByRole('navigation', { name: '주요 공간' })
      .getByRole('link', { name: '실험실', exact: true })
      .click();
    await ready(page);
    await expect(page).toHaveURL(/#\/lab$/);
    expect(await unrelatedStorage(page)).toEqual(before);
  });

  test('preserves unsubmitted choices through another answer and cross-tab storage changes', async ({ page }) => {
    await openSample(page);
    const first = page.locator('[data-learn-check="coordinates"]');
    const second = page.locator('[data-learn-check="downward-position"]');
    const draft = second.getByRole('radio', { name: 'x1 = 0 m, y1 = -1 m', exact: true });
    await first.getByRole('radio', { name: '두 개', exact: true }).check();
    await draft.check();
    await first.getByRole('button', { name: '답 확인', exact: true }).click();
    await expect(draft).toBeChecked();
    expect(await savedCheck(page, 'downward-position')).toMatchObject({ attempts: 0, selectedOptionId: null });
    const peer = await page.context().newPage();
    try {
      await openSample(peer);
      await answer(peer, 'coordinates', '한 개');
      await expect(page.locator('.learn-storage-status')).toContainText('다른 화면에서 변경한 진도');
      await expect(first.getByRole('radio', { name: '한 개', exact: true })).toBeChecked();
      await expect(draft).toBeChecked();
      const notice = await page.locator('.learn-storage-status').textContent();
      await page.evaluate((key) => {
        for (const candidate of [key, null])
          window.dispatchEvent(new StorageEvent('storage', { key: candidate, storageArea: sessionStorage }));
      }, progressKey);
      await expect(page.locator('.learn-storage-status')).toHaveText(notice!);
      await expect(draft).toBeChecked();
      await peer.evaluate((key) => localStorage.setItem(key, '{cross-tab-corruption'), progressKey);
      await expect(page.locator('.learn-progress-text')).toContainText('저장되지 않은 진도');
      await expect(draft).toBeChecked();
      await second.getByRole('button', { name: '답 확인', exact: true }).click();
      await expect(second).toContainText('맞습니다');
      expect(await storedProgress(page)).toBe('{cross-tab-corruption');
    } finally {
      await peer.close();
    }
  });

  for (const [kind, original] of [
    ['malformed', '{not-json'],
    ['future-version', '{"schema":"pendulum-learn-progress/v9","unitId":"1.1","versions":[]}'],
    ['unknown-field', '{"schema":"pendulum-learn-progress/v1","unitId":"1.1","versions":[],"privateNote":"keep-me"}']
  ] as const) {
    test(`preserves ${kind} progress until an explicit confirmed unit reset`, async ({ page }) => {
      await page.goto('/next.html#/learn');
      await ready(page);
      await seedUnrelatedStorage(page);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: progressKey, value: original });
      const before = await unrelatedStorage(page);
      await openSample(page);
      await expect(page.locator('.learn-storage-status')).toHaveAttribute('role', 'status');
      await expect(page.locator('.learn-storage-status')).toContainText(/원본|지원/);
      expect(await storedProgress(page)).toBe(original);
      await answer(page, 'coordinates', '두 개');
      await expect(page.locator('[data-learn-check="coordinates"]')).toContainText('맞습니다');
      expect(await storedProgress(page)).toBe(original);
      await page.getByRole('button', { name: '이 단원 진도 초기화', exact: true }).click();
      const confirmation = page.locator('.learn-reset-confirm');
      await expect(confirmation).toBeVisible();
      await expect(confirmation.getByRole('button', { name: '초기화', exact: true })).toBeFocused();
      await confirmation.getByRole('button', { name: '초기화 취소', exact: true }).click();
      await expect(confirmation).not.toBeVisible();
      await expect(page.getByRole('button', { name: '이 단원 진도 초기화', exact: true })).toBeFocused();
      expect(await storedProgress(page)).toBe(original);
      await page.getByRole('button', { name: '이 단원 진도 초기화', exact: true }).click();
      await confirmation.getByRole('button', { name: '초기화', exact: true }).click();
      await expect(confirmation).not.toBeVisible();
      expect(await storedProgress(page)).toBeNull();
      await answer(page, 'coordinates', '두 개');
      expect(await savedCheck(page, 'coordinates')).toMatchObject({
        selectedOptionId: 'two',
        attempts: 1,
        correct: true
      });
      expect(await unrelatedStorage(page)).toEqual(before);
    });
  }

  for (const kind of ['unavailable', 'quota'] as const) {
    test(`keeps answers usable but explicitly unsaved when storage is ${kind}`, async ({ page }) => {
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
                  'S08 storage fixture',
                  failure === 'unavailable' ? 'SecurityError' : 'QuotaExceededError'
                );
              return method === 'getItem' ? getItem.call(this, candidate) : setItem.call(this, candidate, value!);
            }
          });
        },
        { key: progressKey, failure: kind }
      );
      await openSample(page);
      await answer(page, 'coordinates', '두 개');
      await expect(page.locator('[data-learn-check="coordinates"]')).toContainText('맞습니다');
      await expect(page.locator('.learn-storage-status')).toHaveAttribute('role', 'status');
      await expect(page.locator('.learn-storage-status')).toContainText('저장');
      await expect(page.locator('.learn-progress-text')).toContainText(/저장되지|저장 안|저장하지|화면에서만/);
      if (kind === 'quota') expect(await storedProgress(page)).toBeNull();
      await page.reload();
      await ready(page);
      await expect(
        page.locator('[data-learn-check="coordinates"]').getByRole('radio', { name: '두 개', exact: true })
      ).not.toBeChecked();
      await page
        .getByRole('navigation', { name: '주요 공간' })
        .getByRole('link', { name: '실험실', exact: true })
        .click();
      await ready(page);
      await expect(page).toHaveURL(/#\/lab$/);
    });
  }

  test('contains a failed unit chunk and recovers without losing the requested URL', async ({ page }) => {
    await page.route(sampleChunk, (route) => route.abort('failed'));
    await page.goto(`/next.html${sampleHash}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'error');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/#\/learn\/course-1\/1\.1$/);
    await audit(page);
    await page.unroute(sampleChunk);
    await page.getByRole('button', { name: /다시/ }).click();
    await ready(page);
    await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'ready');
    await expect(page.getByRole('math').first()).toBeVisible();
  });

  test('rejects malformed unit content before rendering it or writing progress', async ({ page }) => {
    await page.route(sampleChunk, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export default { schema: "invalid", id: "1.1", title: "S08 private invalid-content fixture" };'
      })
    );
    await page.goto(`/next.html${sampleHash}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'error');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#product-main')).not.toContainText('S08 private invalid-content fixture');
    await expect(page.getByRole('radio')).toHaveCount(0);
    expect(await storedProgress(page)).toBeNull();
    await page
      .getByRole('navigation', { name: '주요 공간' })
      .getByRole('link', { name: '실험실', exact: true })
      .click();
    await ready(page);
    await expect(page).toHaveURL(/#\/lab$/);
  });

  for (const action of ['cancel', 'navigate'] as const) {
    test(`ignores a late unit chunk after ${action}`, async ({ page }) => {
      let release = (): void => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let requested = (): void => {};
      const intercepted = new Promise<void>((resolve) => {
        requested = resolve;
      });
      await page.route(sampleChunk, async (route) => {
        requested();
        await released;
        await route.continue();
      });
      try {
        await page.goto(`/next.html${sampleHash}`, { waitUntil: 'domcontentloaded' });
        await intercepted;
        await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'loading');
        await expect(page.getByRole('status')).toContainText(/불러오/);
        if (action === 'cancel') {
          await page.getByRole('button', { name: '단원 불러오기 취소', exact: true }).click();
          await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute(
            'data-content-state',
            'cancelled'
          );
        } else {
          await page
            .getByRole('navigation', { name: '주요 공간' })
            .getByRole('link', { name: '실험실', exact: true })
            .click();
          await ready(page);
          await expect(page).toHaveURL(/#\/lab$/);
        }
        const response = page.waitForResponse((item) => sampleChunk(new URL(item.url())));
        release();
        await response;
        await finishFrames(page);
        if (action === 'cancel') {
          await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute(
            'data-content-state',
            'cancelled'
          );
          await expect(page.getByRole('math')).toHaveCount(0);
          await audit(page);
          await page.getByRole('button', { name: /다시/ }).click();
          await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'ready');
        } else {
          await ready(page);
          await expect(page).toHaveURL(/#\/lab$/);
          await expect(page).toHaveTitle('실험실 | Pendulum Lab');
          await expect(page.getByRole('math')).toHaveCount(0);
        }
      } finally {
        release();
        await page.unroute(sampleChunk);
      }
    });
  }

  test('shows accessible equation descriptions and keyboard navigation at 320px and 200% zoom', async ({ page }) => {
    await openSample(page);
    const equation = page.getByRole('math').first();
    await expect(equation).toHaveAccessibleName(/가로 위치 x1.*theta1의 사인.*세로 위치 y1/);
    await expect(equation.locator('[aria-hidden="true"]')).toContainText('x1 = l1');
    await expect(page.locator('.learn-symbols').first()).toContainText('x1 [m]');
    await expect(page.locator('.learn-symbols').first()).toContainText('theta1 [rad]');
    await expect(page.getByRole('img', { name: /첫 질점.*두 번째 질점/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('link', { name: /본문으로/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await page.setViewportSize({ width: 320, height: 800 });
    const prerequisite = page.locator('summary').filter({ hasText: '필요한 개념과 좌표 약속' });
    await prerequisite.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details').filter({ has: prerequisite })).toHaveAttribute('open', '');
    const firstChoice = page
      .locator('[data-learn-check="coordinates"]')
      .getByRole('radio', { name: '한 개', exact: true });
    await firstChoice.focus();
    await page.keyboard.press('ArrowDown');
    await expect(
      page.locator('[data-learn-check="coordinates"]').getByRole('radio', { name: '두 개', exact: true })
    ).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(
      page.locator('[data-learn-check="coordinates"]').getByRole('button', { name: '답 확인', exact: true })
    ).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await savedCheck(page, 'coordinates')).toMatchObject({ correct: true });
    await withinViewport(page);
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.locator('html').evaluate((node) => {
      node.style.zoom = '2';
    });
    await withinViewport(page);
    await audit(page);
    await expect(page.getByRole('navigation', { name: '주요 공간' })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`renders Learn visual baselines and full accessibility in ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/next.html#/learn');
      await ready(page);
      await page.getByLabel('화면 테마').selectOption(theme);
      await audit(page);
      await withinViewport(page);
      await expect(page).toHaveScreenshot(`s09-learn-courses-${theme}.png`, { fullPage: true });
      await page.locator('#product-main a[href="#/learn/course-1"]').click();
      await ready(page);
      await audit(page);
      await withinViewport(page);
      await expect(page).toHaveScreenshot(`s09-learn-course-one-${theme}.png`, { fullPage: true });
      await page.locator(`#product-main a[href="${sampleHash}"]`).click();
      await ready(page);
      await expect(page.locator('.learn-unit[data-content-state]')).toHaveAttribute('data-content-state', 'ready');
      await expect(page.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
      await audit(page);
      await withinViewport(page);
      await expect(page).toHaveScreenshot(`s09-learn-unit-one-${theme}.png`, { fullPage: true });
    });
  }
});
