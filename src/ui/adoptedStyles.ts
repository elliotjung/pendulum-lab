/**
 * CSP-safe dynamic styles. `style-src 'self'` (no `'unsafe-inline'`) blocks
 * runtime-injected `<style>` elements, but Constructable Stylesheets adopted
 * via `document.adoptedStyleSheets` are exempt from style-src — they never
 * pass through the CSS parser as inline markup. Every module that needs
 * dynamic CSS registers it here, keyed by id (idempotent, replace-on-repeat).
 */

const registry = new Map<string, CSSStyleSheet>();

/** Whether Constructable Stylesheets are available (all evergreen browsers). */
function supported(): boolean {
  return (
    typeof document !== 'undefined' &&
    'adoptedStyleSheets' in Document.prototype &&
    typeof CSSStyleSheet !== 'undefined' &&
    'replaceSync' in CSSStyleSheet.prototype
  );
}

/**
 * Install (or replace) a dynamic stylesheet under `id`. Falls back to a
 * `<style>` element only where Constructable Stylesheets are missing (legacy
 * engines / some test DOMs) — those environments do not enforce the CSP.
 */
export function installAdoptedStyle(id: string, cssText: string): void {
  if (typeof document === 'undefined') return;
  if (!supported()) {
    let el = document.getElementById(`adopted-${id}`);
    if (!el) {
      el = document.createElement('style');
      el.id = `adopted-${id}`;
      document.head.append(el);
    }
    el.textContent = cssText;
    return;
  }
  let sheet = registry.get(id);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    registry.set(id, sheet);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(cssText);
}

/** Whether a dynamic stylesheet with this id has been installed. */
export function hasAdoptedStyle(id: string): boolean {
  return registry.has(id) || Boolean(typeof document !== 'undefined' && document.getElementById(`adopted-${id}`));
}
