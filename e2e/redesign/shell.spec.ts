import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createExperimentRoute } from '../../src/product/persistence/share-route';
import { experimentFixture } from '../../tests/product/contracts/fixtures';

function productChunk(name: 'application' | 'learn' | 'lab'): (url: URL) => boolean {
  const source = name === 'application' ? 'application' : `views/${name}`;
  return (url) =>
    url.pathname === `/src/product/app/${source}.ts` || new RegExp(`/assets/${name}-[^/]+\\.js$`).test(url.pathname);
}

async function ready(page: Page, space: 'learn' | 'lab'): Promise<void> {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('navigation', { name: '주요 공간' }).getByRole('link', {
      name: space === 'learn' ? '배우기' : '실험실',
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page');
}

async function chooseSpace(page: Page, space: 'learn' | 'lab'): Promise<void> {
  await page
    .getByRole('navigation', { name: '주요 공간' })
    .getByRole('link', { name: space === 'learn' ? '배우기' : '실험실', exact: true })
    .click();
  await ready(page, space);
}

async function audit(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      targets: item.nodes.map((node) => node.target)
    }))
  ).toEqual([]);
}

test.describe('S04 parallel application shell', () => {
  test('retains a deep URL and recovery guidance when the entry script cannot load', async ({ page }) => {
    const entry = (url: URL) =>
      url.pathname === '/src/product/app/entry.ts' || /\/assets\/next-[^/]+\.js$/.test(url.pathname);
    await page.route(entry, (route) => route.abort('failed'));
    const hash = '#/lab/double';
    await page.goto(`/next.html${hash}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#product-root')).toHaveAttribute('data-bootstrap-state', 'loading');
    await expect(page.getByRole('status')).toContainText('브라우저에서 새로고침');
    await expect(page.getByRole('link', { name: '기존 앱 열기' })).toBeVisible();
    await expect(page.getByRole('link')).toHaveCount(1);
    expect(new URL(page.url()).hash).toBe(hash);
    await page.unroute(entry);
    await page.reload();
    await ready(page, 'lab');
    expect(new URL(page.url()).hash).toBe(hash);
  });

  test('opens Learn by default and preserves browser back, forward and reload', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/next.html');
    await ready(page, 'learn');
    await expect(page.locator('#product-root')).toHaveCSS('display', 'flex');
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(246, 247, 242)');
    await expect(page).toHaveURL(/\/next\.html#\/learn$/);
    await expect(page).toHaveTitle('배우기 | Pendulum Lab');
    await chooseSpace(page, 'lab');
    await expect(page).toHaveURL(/#\/lab$/);
    await expect(page).toHaveTitle('실험실 | Pendulum Lab');
    await page.reload();
    await ready(page, 'lab');
    await page.goBack();
    await ready(page, 'learn');
    await expect(page).toHaveURL(/#\/learn$/);
    await page.goForward();
    await ready(page, 'lab');
    await expect(page).toHaveURL(/#\/lab$/);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('opens and reloads every route family without pretending future content is available', async ({ page }) => {
    for (const [hash, space] of [
      ['#/learn', 'learn'],
      ['#/learn/course-1', 'learn'],
      ['#/learn/course-8/8.12', 'learn'],
      ['#/lab', 'lab'],
      ['#/lab/double', 'lab'],
      ['#/lab/quantum-kicked-rotor', 'lab']
    ] as const) {
      await test.step(hash, async () => {
        await page.goto(`/next.html${hash}`);
        await ready(page, space);
        const heading = await page.getByRole('heading', { level: 1 }).textContent();
        await page.reload();
        await ready(page, space);
        expect(new URL(page.url()).hash).toBe(hash);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading!);
        if (hash !== '#/learn' && hash !== '#/lab') {
          await expect(page.locator('#product-main')).toContainText(/준비|예정|아직|제공/);
          await expect(page.locator('#product-main canvas')).toHaveCount(0);
        }
      });
    }
  });

  test('validates shared experiment routes without starting or persisting an experiment', async ({ page }) => {
    const shared = createExperimentRoute(experimentFixture());
    if (!shared.ok) throw new Error('The existing S03 fixture must produce a valid share.');
    await page.goto(`/next.html${shared.value}`);
    await ready(page, 'lab');
    await expect(page.locator('#product-main')).toContainText(/공유/);
    expect(new URL(page.url()).hash).toBe(shared.value);
    await page.reload();
    await ready(page, 'lab');
    expect(new URL(page.url()).hash).toBe(shared.value);

    const mismatch = shared.value.replace('#/lab/double?', '#/lab/compound-double?');
    await page.goto(`/next.html${mismatch}`);
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
    expect(new URL(page.url()).hash).toBe(mismatch);
    await expect(page.locator('#product-main')).not.toContainText(shared.value.split('state=')[1]!);
  });

  test('keeps unknown and malformed URLs intact and offers working navigation', async ({ page }) => {
    for (const hash of ['#/missing', '#/learn/course-9', '#/lab/%64ouble', '#/lab/double?state=pe1.bm90LWpzb24']) {
      await test.step(hash, async () => {
        await page.goto(`/next.html${hash}`);
        await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
        expect(new URL(page.url()).hash).toBe(hash);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.locator('#product-main')).not.toContainText(hash);
        await chooseSpace(page, 'learn');
        await expect(page).toHaveURL(/#\/learn$/);
      });
    }
  });

  test('keeps user storage unchanged and never loads the legacy runtime', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pendulum-lab/s04-preservation-fixture', '{"opaque":"keep-original"}');
      sessionStorage.setItem('pendulum-lab/s04-session-fixture', 'keep-original-session');
      (window as unknown as { __s04StorageBefore: unknown }).__s04StorageBefore = {
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
      };
    });
    const requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto('/next.html#/learn');
    await ready(page, 'learn');
    const snapshot = () =>
      page.evaluate(() => ({
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
    const before = await page.evaluate(() => (window as unknown as { __s04StorageBefore: unknown }).__s04StorageBefore);
    expect(await snapshot()).toEqual(before);
    await chooseSpace(page, 'lab');
    await chooseSpace(page, 'learn');
    await page.reload();
    await ready(page, 'learn');
    expect(await snapshot()).toEqual(before);
    expect(
      await page.evaluate(() =>
        ['__modernLab', '__modernShell', 'PendulumRuntime', 'PendulumLabIndex'].filter((key) => key in window)
      )
    ).toEqual([]);
    expect(
      requests.filter((path) => /\/src\/(main\.ts|app\/|physics\/|chaos\/|runtime\/|workers\/|research\/)/.test(path))
    ).toEqual([]);
    // Curriculum declarations share the research/chaos prefix but contain no
    // runtime kernels. Keep every original runtime/worker-prefix prohibition,
    // exempting only these two exact data chunks. Imported engines still get
    // separate physics/chaos/research chunks from Vite's manualChunks policy.
    expect(
      requests.filter(
        (path) =>
          /\/assets\/(?:app|physics|chaos|research|.*worker)-/.test(path) &&
          !/\/assets\/(?:research|chaos)-focus-definitions-[A-Za-z0-9_-]{8}\.js$/.test(path)
      )
    ).toEqual([]);
  });

  test('supports skip navigation and keyboard space changes with route focus', async ({ page }) => {
    await page.goto('/next.html#/learn');
    await ready(page, 'learn');
    const skip = page.getByRole('link', { name: /본문/ });
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#product-main')).toBeFocused();
    await expect(page).toHaveURL(/#\/learn$/);
    const lab = page.getByRole('navigation', { name: '주요 공간' }).getByRole('link', { name: '실험실', exact: true });
    await lab.focus();
    await page.keyboard.press('Enter');
    await ready(page, 'lab');
    const focusedWithinMain = await page.evaluate(() =>
      document.querySelector('#product-main')?.contains(document.activeElement)
    );
    expect(focusedWithinMain).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/A|BUTTON/);
  });

  test('passes full axe checks on both spaces and invalid route recovery', async ({ page }, testInfo) => {
    await page.goto('/next.html#/learn');
    await ready(page, 'learn');
    await audit(page);
    const learnScreenshot = testInfo.outputPath('learn.png');
    await page.screenshot({ path: learnScreenshot, fullPage: true });
    await testInfo.attach('Learn shell', { path: learnScreenshot, contentType: 'image/png' });
    await chooseSpace(page, 'lab');
    await audit(page);
    const labScreenshot = testInfo.outputPath('lab.png');
    await page.screenshot({ path: labScreenshot, fullPage: true });
    await testInfo.attach('Lab shell', { path: labScreenshot, contentType: 'image/png' });
    await page.goto('/next.html#/missing');
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
    await audit(page);
  });

  test('keeps navigation and content within a 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const space of ['learn', 'lab'] as const) {
      await page.goto(`/next.html#/${space}`);
      await ready(page, space);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const link of await page.getByRole('navigation', { name: '주요 공간' }).getByRole('link').all()) {
        await expect(link).toBeInViewport();
      }
      await audit(page);
    }
  });

  test('contains bootstrap chunk failure and recovers through a real reload', async ({ page }) => {
    const chunk = productChunk('application');
    await page.route(chunk, (route) => route.abort('failed'));
    await page.goto('/next.html', { waitUntil: 'domcontentloaded' });
    const failure = page.locator('[data-bootstrap-state="error"]');
    await expect(failure).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(failure.getByRole('link', { name: /기존/ })).toBeVisible();
    await audit(page);
    await page.unroute(chunk);
    await failure.getByRole('button', { name: /다시/ }).click();
    await ready(page, 'learn');
  });

  test('contains lazy chunk failure while keeping the common navigation usable', async ({ page }) => {
    const chunk = productChunk('lab');
    await page.route(chunk, (route) => route.abort('failed'));
    await page.goto('/next.html#/lab', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'chunk-error');
    await expect(page.getByRole('alert')).toBeVisible();
    await audit(page);
    await chooseSpace(page, 'learn');
    await page.unroute(chunk);
    await page.goto('/next.html#/lab');
    await page.reload();
    await ready(page, 'lab');
  });

  test('contains an application initialization exception before the shell mounts', async ({ page }) => {
    const chunk = productChunk('application');
    await page.route(chunk, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function mountApplication() { throw new Error("S04 injected initialization failure"); }'
      })
    );
    await page.goto('/next.html#/learn', { waitUntil: 'domcontentloaded' });
    const failure = page.locator('[data-bootstrap-state="error"]');
    await expect(failure).toBeVisible();
    await expect(failure).not.toContainText('S04 injected');
    await page.unroute(chunk);
    await failure.getByRole('button', { name: /다시/ }).click();
    await ready(page, 'learn');
  });

  test('contains a view rendering exception and allows navigation to the other space', async ({ page }) => {
    const chunk = productChunk('lab');
    await page.route(chunk, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function createView() { throw new Error("S04 injected render failure"); }'
      })
    );
    await page.goto('/next.html#/lab', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'render-error');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#product-main')).not.toContainText('S04 injected');
    await chooseSpace(page, 'learn');
    await page.unroute(chunk);
    await page.goto('/next.html#/lab');
    await page.reload();
    await ready(page, 'lab');
  });

  test('shows loading and ignores a late chunk after the user changes spaces', async ({ page }) => {
    const chunk = productChunk('learn');
    let release = (): void => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = (): void => {};
    const intercepted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(chunk, async (route) => {
      requested();
      await released;
      await route.continue();
    });
    try {
      await page.goto('/next.html#/learn', { waitUntil: 'domcontentloaded' });
      await intercepted;
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'loading');
      await expect(page.getByRole('status')).toBeVisible();
      await chooseSpace(page, 'lab');
      const response = page.waitForResponse((item) => chunk(new URL(item.url())));
      release();
      await response;
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      await ready(page, 'lab');
      await expect(page).toHaveURL(/#\/lab$/);
      await expect(page).toHaveTitle('실험실 | Pendulum Lab');
      await chooseSpace(page, 'learn');
    } finally {
      release();
      await page.unroute(chunk);
    }
  });

  test('cancels a pending view without allowing its late completion to replace the cancellation screen', async ({
    page
  }) => {
    const chunk = productChunk('lab');
    let release = (): void => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = (): void => {};
    const intercepted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(chunk, async (route) => {
      requested();
      await released;
      await route.continue();
    });
    try {
      await page.goto('/next.html#/lab', { waitUntil: 'domcontentloaded' });
      await intercepted;
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'loading');
      await page.getByRole('button', { name: '불러오기 취소' }).click();
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'cancelled');
      await expect(page.getByRole('heading', { name: '화면 불러오기를 취소했습니다' })).toBeFocused();
      await expect(page).toHaveURL(/#\/lab$/);
      const response = page.waitForResponse((item) => chunk(new URL(item.url())));
      release();
      await response;
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'cancelled');
      await audit(page);
      await chooseSpace(page, 'learn');
      await chooseSpace(page, 'lab');
    } finally {
      release();
      await page.unroute(chunk);
    }
  });

  test('contains uncaught browser errors and rejected event work after mounting', async ({ page }) => {
    for (const type of ['error', 'unhandledrejection'] as const) {
      await page.goto('/next.html#/learn');
      await ready(page, 'learn');
      await page.evaluate((eventType) => {
        const event =
          eventType === 'error'
            ? new ErrorEvent('error', { message: 'S04 private diagnostic fixture' })
            : new PromiseRejectionEvent('unhandledrejection', {
                promise: Promise.resolve(),
                reason: new Error('S04 private diagnostic fixture')
              });
        window.dispatchEvent(event);
      }, type);
      await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'render-error');
      await expect(page.locator('#product-main')).not.toContainText('S04 private diagnostic fixture');
      await chooseSpace(page, 'lab');
    }
  });

  test('continues to open the existing application alongside the new entrypoint', async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.goto('/next.html#/learn');
    await ready(page, 'learn');
    const legacy = await context.newPage();
    await legacy.goto('/app.html', { waitUntil: 'domcontentloaded' });
    await expect(legacy.getByRole('heading', { name: /Pendulum Lab/i })).toBeVisible();
    await legacy.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
    await expect(legacy.locator('#pauseBtn')).toBeVisible();
    await ready(page, 'learn');
    await legacy.close();
  });
});
