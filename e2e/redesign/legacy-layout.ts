import { expect, type Page } from '@playwright/test';

/** Compare the historical panels against their frozen PNGs. The added docks have
 * dedicated light/dark, mobile and accessibility coverage in their own specs.
 */
export async function expectLegacyPanelScreenshot(page: Page, name: string) {
  const docks = await page.locator('.lab-diagnostics').elementHandles();
  if (!docks.length) {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
    return;
  }
  // Production CSP rejects injected inline screenshot styles. Move only the
  // added dock during the old-panel comparison, then restore the same node.
  const placeholders = [];
  for (const dock of docks) {
    placeholders.push(
      await dock.evaluateHandle((node) => {
        const marker = document.createComment('diagnostic dock snapshot placeholder');
        node.parentNode!.replaceChild(marker, node);
        return marker;
      })
    );
  }
  try {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  } finally {
    for (let i = 0; i < docks.length; i++) {
      await placeholders[i]!.evaluate((marker, original) => marker.replaceWith(original), docks[i]!);
      await placeholders[i]!.dispose();
      await docks[i]!.dispose();
    }
  }
}
