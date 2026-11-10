import { expect, type Page } from '@playwright/test';

// S28 additions are tested in compatibility-tools/controls, product-setup,
// phase-views, structure-methods, runtime-parity, locale and browser-api.
// Keep every historical control and plot.
const additivePanels = [
  '.lab-diagnostics',
  '#legacy-playback',
  '#compatibility-tools',
  '#run-history',
  '#native-display',
  '#native-setup',
  '#native-phase-space',
  '#native-phase-density',
  '#structure-diagnostics',
  '#runtime-acceleration',
  '.product-footer > .product-command-host',
  '.product-footer > .product-locale-control',
  '.product-footer > #product-browser-api'
].join(',');

/** Compare the historical panels against their frozen PNGs. The added docks have
 * dedicated light/dark, mobile and accessibility coverage in their own specs.
 */
export async function expectLegacyPanelScreenshot(page: Page, name: string) {
  const docks = await page.locator(additivePanels).elementHandles();
  if (!docks.length) {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
    return;
  }
  // Production CSP rejects injected inline screenshot styles. Move only the
  // named additions during the old-panel comparison, then restore the same nodes.
  const placeholders = [];
  try {
    for (const dock of docks) {
      placeholders.push(
        await dock.evaluateHandle((node) => {
          const marker = document.createComment('additive panel snapshot placeholder');
          node.parentNode!.replaceChild(marker, node);
          return marker;
        })
      );
    }
    await expect(page).toHaveScreenshot(name, { fullPage: true });
  } finally {
    for (let i = 0; i < placeholders.length; i++) {
      await placeholders[i]!.evaluate((marker, original) => marker.replaceWith(original), docks[i]!);
      await placeholders[i]!.dispose();
    }
    for (const dock of docks) await dock.dispose();
  }
}
