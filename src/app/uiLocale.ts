/**
 * uiLocale — the menu-guide language switcher (EN / 한국어).
 *
 * Scope is deliberately the guide layer only: the description lines, section
 * hints, and tooltips that first-time visitors read. Structural labels the
 * automated suites pin (Explore/Analyze/…, mode-chooser copy) stay English.
 * The dictionaries live in navGuide.ts; this module owns persistence and the
 * <select> in the rail foot, and asks the caller to re-decorate on change.
 */

import {
  NAV_LOCALE_STORAGE_KEY,
  normalizeNavLocale,
  resolveInitialNavLocale,
  setNavLocale,
  type NavLocale
} from './navGuide';

const SELECT_ID = 'navLocale';

function storedNavLocale(): NavLocale | null {
  try {
    const value = window.localStorage?.getItem(NAV_LOCALE_STORAGE_KEY);
    return value === null ? null : normalizeNavLocale(value);
  } catch {
    return null;
  }
}

/**
 * Load the initial locale into navGuide state. Call before decorating.
 * A `?lang=ko|en` URL parameter (the landing page's Korean mode adds it to
 * every app link) overrides and persists; otherwise the stored choice wins.
 */
export function initNavLocale(): void {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const resolved = resolveInitialNavLocale(search, storedNavLocale());
  setNavLocale(resolved.locale);
  if (resolved.fromUrl) {
    try {
      window.localStorage?.setItem(NAV_LOCALE_STORAGE_KEY, resolved.locale);
    } catch {
      /* persistence is best-effort */
    }
  }
}

/**
 * Install the language select under the rail's Mode select.
 * `refresh` re-runs the navigation decoration in the new locale.
 */
export function installLocaleSelect(refresh: () => void): void {
  if (typeof document === 'undefined' || document.getElementById(SELECT_ID)) return;
  const host = document.querySelector('.audience-select');
  if (!host) return;
  const label = document.createElement('label');
  label.htmlFor = SELECT_ID;
  label.textContent = 'Guide';
  const select = document.createElement('select');
  select.id = SELECT_ID;
  select.setAttribute('aria-label', 'Menu guide language');
  for (const [value, text] of [['en', 'English'], ['ko', '한국어']] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = storedNavLocale() ?? 'en';
  select.addEventListener('change', () => {
    const locale = normalizeNavLocale(select.value);
    setNavLocale(locale);
    try {
      window.localStorage?.setItem(NAV_LOCALE_STORAGE_KEY, locale);
    } catch {
      /* persistence is best-effort */
    }
    refresh();
  });
  host.append(label, select);
}
