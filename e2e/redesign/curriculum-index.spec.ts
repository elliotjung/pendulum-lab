import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
async function ready(page: Page) {
  await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test.describe('S27 complete learning index', () => {
  test('offers independent recommended routes and a searchable source-linked complete index', async ({ page }) => {
    await page.goto('/next.html#/learn');
    await ready(page);
    await page.evaluate(() => localStorage.setItem('s27-original-user-data', 'original'));
    const index = page.getByRole('region', { name: '추천 경로와 학습 색인' });
    await expect(index.getByRole('heading', { name: '질문에 맞는 추천 경로' })).toBeVisible();
    await expect(index.locator('article')).toHaveCount(3);
    await index.locator('summary').click();
    await expect(index.locator('dl dt')).toHaveCount(94);
    await expect(index.locator('ul li').first()).toBeVisible();
    await index.getByLabel('색인 검색').fill('8.12');
    const unit = index.locator('dt a[href="#/learn/course-8/8.12"]');
    await expect(unit).toHaveCount(1);
    await expect(index.locator('ul a[href^="https:"]').first()).toBeVisible();
    await audit(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await audit(page);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.locator('body').evaluate((node) => {
      node.style.zoom = '2';
    });
    await audit(page);
    await page.locator('body').evaluate((node) => {
      node.style.zoom = '1';
    });
    await index.getByLabel('색인 검색').fill('s27-no-such-term-987654');
    await expect(index).toContainText('일치하는 항목이 없습니다');
    await index.getByLabel('색인 검색').fill('8.12');
    await unit.click();
    await ready(page);
    await expect(page.locator('.learn-unit')).toHaveAttribute('data-content-state', 'ready');
    await expect(page.locator('.focus-experiment')).toHaveAttribute('data-focus-status', 'idle');
    expect(await page.evaluate(() => localStorage.getItem('s27-original-user-data'))).toBe('original');
  });
  test('cancels an unfinished index import and retries without writing progress', async ({ page }) => {
    let release!: () => void, requested!: () => void;
    const pending = new Promise<void>((r) => {
        release = r;
      }),
      intercepted = new Promise<void>((r) => {
        requested = r;
      });
    const match = /(?:\/assets\/8\.12-[^/]+\.js|\/content\/learn\/course-8\/8\.12(?:\.ts)?)(?:\?.*)?$/;
    await page.route(match, async (route) => {
      requested();
      await pending;
      await route.continue();
    });
    try {
      await page.goto('/next.html#/learn');
      await ready(page);
      const details = page.locator('.learn-index details');
      await details.locator('summary').click();
      await intercepted;
      await page.getByRole('button', { name: '색인 불러오기 취소', exact: true }).click();
      await expect(details).toContainText('취소했습니다');
      await details.locator('summary').click();
      await expect(details).not.toHaveAttribute('open', '');
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await details.locator('summary').click();
      await expect(details.locator('#learn-index-search')).toBeVisible();
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith('pendulum-product/learn-progress'))
        )
      ).toEqual([]);
      await audit(page);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
  test('recovers a failed index chunk through reload while preserving original progress data', async ({ page }) => {
    const match = /(?:\/assets\/8\.12-[^/]+\.js|\/content\/learn\/course-8\/8\.12(?:\.ts)?)(?:\?.*)?$/;
    await page.route(match, (route) => route.abort('failed'));
    await page.goto('/next.html#/learn');
    await ready(page);
    await page.evaluate(() => localStorage.setItem('s27-original-progress-data', 'preserved'));
    await page.locator('.learn-index summary').click();
    await expect(page.locator('.learn-index')).toContainText('색인을 불러오지 못했습니다');
    await page.unroute(match);
    await page.getByRole('button', { name: '페이지 다시 읽기', exact: true }).click();
    await ready(page);
    await page.locator('.learn-index summary').click();
    await expect(page.locator('.learn-index dl dt')).toHaveCount(94);
    expect(await page.evaluate(() => localStorage.getItem('s27-original-progress-data'))).toBe('preserved');
  });
  test('ignores a queued toggle on a disposed index instead of starting detached imports', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/assets\/[1-8]\.\d+-[^/]+\.js|\/content\/learn\/course-[1-8]\/[1-8]\.\d+(?:\.ts)?/.test(r.url()))
        requests.push(r.url());
    });
    await page.goto('/next.html#/learn');
    await ready(page);
    const detached = await page.locator('.learn-index details').elementHandle();
    await page
      .getByRole('navigation', { name: '주요 공간' })
      .getByRole('link', { name: '실험실', exact: true })
      .click();
    await ready(page);
    await expect(page.locator('.learn-index')).toHaveCount(0);
    await detached!.evaluate((node) => {
      (node as HTMLDetailsElement).open = true;
      node.dispatchEvent(new Event('toggle'));
    });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    expect(requests).toEqual([]);
    await detached!.dispose();
  });
});
