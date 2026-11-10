import { element } from '../app/dom';

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'pendulum-product/theme/v1';

export function resolveThemePreference(value: unknown): ThemePreference | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

/** A view preference only. Never reads or writes legacy user storage. */
export function createThemeControl(document: Document, id: string) {
  const wrapper = element(document, 'div', 'ds-theme');
  const label = element(document, 'label', '', '화면 테마');
  label.htmlFor = id;
  const select = element(document, 'select', 'ds-input');
  select.id = id;
  for (const [value, text] of [
    ['light', '밝게'],
    ['dark', '어둡게'],
    ['system', '기기 설정']
  ] as const) {
    const option = element(document, 'option', '', text);
    option.value = value;
    select.append(option);
  }
  let preference = resolveThemePreference(document.documentElement.dataset.theme) ?? 'light';
  try {
    preference = resolveThemePreference(document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY)) ?? preference;
  } catch {
    /* Storage availability does not prevent a view choice. */
  }
  select.value = preference;
  document.documentElement.dataset.theme = preference;
  const apply = () => {
    const next = resolveThemePreference(select.value);
    if (!next) return;
    document.documentElement.dataset.theme = next;
    try {
      document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Keep the active choice when persistence is unavailable. */
    }
  };
  select.addEventListener('change', apply);
  wrapper.append(label, select);
  return { element: wrapper, dispose: () => select.removeEventListener('change', apply) };
}
