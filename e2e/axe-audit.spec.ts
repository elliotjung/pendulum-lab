import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Full-page axe-core audits. Contract: no critical/serious WCAG 2.0/2.1 A/AA
 * violations on each audited surface — i.e. *every* visible control carries an
 * accessible name, not merely "at least one control somewhere".
 *
 * color-contrast is excluded here: the theme's muted-on-glass palette is
 * tracked as a separate visual-design pass and would otherwise drown the
 * name/role/focus signal this gate protects.
 */

async function auditCurrentSurface(page: import('@playwright/test').Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s) — e.g. ${violation.nodes[0]?.target.join(' ')}`
    );
}

test('axe: default lab surface has no critical/serious violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200); // parity layer + idle tab mounts settle
  expect(await auditCurrentSurface(page)).toEqual([]);
});

test('axe: validation tab has no critical/serious violations', async ({ page }) => {
  await page.goto('/?tab=validate');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200);
  expect(await auditCurrentSurface(page)).toEqual([]);
});

test('axe: research workspace has no critical/serious violations', async ({ page }) => {
  await page.goto('/?audience=research&tab=research');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200);
  expect(await auditCurrentSurface(page)).toEqual([]);
});

test('axe: open trust drawer has no critical/serious violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200);
  await page.locator('#trustDrawerToggle').click();
  await expect(page.locator('#trustDrawer')).toBeVisible();
  expect(await auditCurrentSurface(page)).toEqual([]);
});
