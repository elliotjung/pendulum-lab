import { expect, type Page } from '@playwright/test';

/** Compare the pre-S18 panels against their frozen PNGs. The added dock has its
 * own visible light/dark, mobile and accessibility coverage in core-diagnostics.spec.ts.
 */
export async function expectLegacyPanelScreenshot(page: Page, name: string) {
  const dock = await page.locator('#core-diagnostics').elementHandle();
  if (!dock) {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
    return;
  }
  // Production CSP rejects injected inline screenshot styles. Move only the
  // added dock during the old-panel comparison, then restore the same node.
  const placeholder = await dock.evaluateHandle((node) => {
    const marker = node.ownerDocument.createComment('S18 diagnostic dock snapshot placeholder');
    node.replaceWith(marker);
    return marker;
  });
  try {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  } finally {
    await placeholder.evaluate((marker, original) => marker.replaceWith(original), dock);
    await placeholder.dispose();
    await dock.dispose();
  }
}
