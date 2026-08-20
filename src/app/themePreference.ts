import { announceUiPreference } from './modalSurface';
import { currentNavLocale } from './navGuide';

export type ColorTheme = 'dark' | 'light';

const STORAGE_KEY = 'pendulum-lab/ui/color-theme';
const SELECT_ID = 'colorTheme';

function normalizeTheme(value: unknown): ColorTheme {
  return value === 'light' ? 'light' : 'dark';
}

function storedTheme(): ColorTheme {
  try {
    return normalizeTheme(window.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function copy(theme: ColorTheme): { label: string; option: string; announcement: string } {
  const korean = currentNavLocale() === 'ko';
  return {
    label: korean ? '화면' : 'Theme',
    option: theme === 'dark' ? (korean ? '다크' : 'Dark') : korean ? '라이트' : 'Light',
    announcement: korean
      ? `화면 테마: ${theme === 'dark' ? '다크' : '라이트'}`
      : `Color theme: ${theme === 'dark' ? 'Dark' : 'Light'}`
  };
}

function updateCopy(): void {
  const select = document.getElementById(SELECT_ID);
  const label = document.querySelector<HTMLLabelElement>(`label[for="${SELECT_ID}"]`);
  const hint = document.getElementById('colorThemeHint');
  if (!(select instanceof HTMLSelectElement)) return;
  if (label) label.textContent = copy('dark').label;
  const dark = select.querySelector<HTMLOptionElement>('option[value="dark"]');
  const light = select.querySelector<HTMLOptionElement>('option[value="light"]');
  if (dark) dark.textContent = copy('dark').option;
  if (light) light.textContent = copy('light').option;
  select.setAttribute('aria-label', currentNavLocale() === 'ko' ? '화면 테마' : 'Color theme');
  if (hint) {
    hint.textContent =
      currentNavLocale() === 'ko'
        ? '작업공간의 색상 테마를 바꿉니다. 기본값은 다크입니다.'
        : 'Changes the workspace color theme. Dark is the default.';
  }
}

export function applyColorTheme(theme: ColorTheme, persist = true, announce = persist): void {
  document.documentElement.dataset.colorTheme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#070910' : '#f4f6fa');
  const select = document.getElementById(SELECT_ID);
  if (select instanceof HTMLSelectElement && select.value !== theme) select.value = theme;
  if (persist) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, theme);
    } catch {
      // Persistence is best-effort; the selected theme remains active.
    }
  }
  document.dispatchEvent(new CustomEvent('pendulum:color-theme-changed', { detail: { theme } }));
  if (announce) announceUiPreference(copy(theme).announcement);
}

/** Add an explicit dark/light preference beside the audience and locale fields. */
export function installThemePreference(): void {
  if (typeof document === 'undefined' || document.getElementById(SELECT_ID)) return;
  const host = document.querySelector('.audience-preference-fields') ?? document.querySelector('.audience-select');
  if (!host) return;

  const field = document.createElement('div');
  field.className = 'audience-field audience-field-theme';
  const label = document.createElement('label');
  label.className = 'audience-field-label';
  label.htmlFor = SELECT_ID;
  const select = document.createElement('select');
  select.id = SELECT_ID;
  select.name = 'color-theme';
  select.autocomplete = 'off';
  select.setAttribute('aria-describedby', 'colorThemeHint');
  for (const value of ['dark', 'light'] as const) {
    const option = document.createElement('option');
    option.value = value;
    select.append(option);
  }
  select.addEventListener('change', () => applyColorTheme(normalizeTheme(select.value)));
  const hint = document.createElement('span');
  hint.id = 'colorThemeHint';
  hint.className = 'v10-sr';
  hint.textContent = 'Changes the workspace color theme. Dark is the default.';
  field.append(label, select, hint);
  host.append(field);

  updateCopy();
  applyColorTheme(storedTheme(), false, false);
  document.addEventListener('pendulum:ui-locale-changed', updateCopy);
}
