/**
 * uiLocale — the menu-guide language switcher (EN / 한국어).
 *
 * The dictionaries in navGuide own the navigation copy. This module also
 * localizes the stable structural layer (key Lab controls and Trust Inspector)
 * while data-testid selectors keep browser tests independent of visible text.
 */

import {
  NAV_LOCALE_STORAGE_KEY,
  normalizeNavLocale,
  resolveInitialNavLocale,
  setNavLocale,
  type NavLocale
} from './navGuide';

const SELECT_ID = 'navLocale';

const CONTROL_LABELS_KO: Record<string, string> = {
  speed: '속도',
  timeMode: '시간 진행',
  sysType: '진자 종류',
  seed: '시드',
  th1: 'θ₁ 초기각 (rad)',
  th2: 'θ₂ 초기각 (rad)',
  th3: 'θ₃ 초기각 (rad)',
  iw1: 'ω₁ 초기 각속도',
  iw2: 'ω₂ 초기 각속도',
  iw3: 'ω₃ 초기 각속도',
  g: '중력가속도 g (m/s²)',
  gamma: '감쇠 γ',
  trailMode: '궤적 색상',
  phaseAxis: '위상 축',
  method: '적분기',
  dt: '시간 간격 dt (s)',
  tol: '허용오차',
  spf: '프레임당 스텝',
  qualityMode: '품질 모드',
  audioVol: '음량'
};

const STRUCTURAL_TEXT_KO: Record<string, string> = {
  Simulation: '시뮬레이션',
  'System & Initial Conditions': '시스템과 초기조건',
  'Physical Parameters': '물리 매개변수',
  Visualization: '시각화',
  'Numerical Methods': '수치해석 방법',
  Ensemble: '앙상블',
  'Audio Sonification': '소리 변환',
  'Export & Record': '내보내기와 기록',
  'Live Diagnostics': '실시간 진단',
  'Keyboard Shortcuts': '키보드 단축키'
};

const TRUST_LABELS: Record<string, { en: string; ko: string }> = {
  health: { en: 'Numerical health', ko: '수치적 건전성' },
  validation: { en: 'Validation', ko: '검증' },
  provenance: { en: 'Provenance', ko: '출처' },
  performance: { en: 'Performance', ko: '성능' },
  faults: { en: 'Fault log', ko: '오류 기록' }
};

function localizeText(element: HTMLElement | null, koreanText: string, korean: boolean): void {
  if (!element) return;
  element.dataset.localeEn ??= element.textContent ?? '';
  element.textContent = korean ? koreanText : element.dataset.localeEn;
}

function replaceTrailingText(element: HTMLElement | null, text: string): void {
  if (!element) return;
  const trailing = Array.from(element.childNodes)
    .reverse()
    .find((node) => node.nodeType === Node.TEXT_NODE);
  if (trailing) trailing.textContent = ` ${text}`;
  else element.append(document.createTextNode(` ${text}`));
}

/** Apply visible localization and stable selectors to the already-mounted shell. */
export function applyStructuralLocale(): void {
  if (typeof document === 'undefined') return;
  const korean =
    normalizeNavLocale(
      document.getElementById(SELECT_ID) instanceof HTMLSelectElement
        ? (document.getElementById(SELECT_ID) as HTMLSelectElement).value
        : storedNavLocale()
    ) === 'ko';
  document.documentElement.lang = korean ? 'ko' : 'en';

  for (const [id, text] of Object.entries(CONTROL_LABELS_KO)) {
    const control = document.getElementById(id);
    if (control) control.dataset.testid = `control-${id}`;
    localizeText(document.querySelector<HTMLElement>(`label[for="${id}"]`), text, korean);
  }
  document.querySelectorAll<HTMLElement>('#tab-lab .ctrl-sticky-title, #tab-lab .acc-label').forEach((element) => {
    element.dataset.localeEn ??= element.textContent ?? '';
    const translated = STRUCTURAL_TEXT_KO[element.dataset.localeEn];
    element.textContent = korean && translated ? translated : element.dataset.localeEn;
  });

  const mode = document.getElementById('audienceMode') as HTMLSelectElement | null;
  if (mode) {
    mode.dataset.testid = 'audience-mode';
    mode.setAttribute('aria-label', korean ? '사용자 모드' : 'Audience mode');
    const labels = korean ? ['초보', '학생', '연구'] : ['Beginner', 'Student', 'Research'];
    Array.from(mode.options).forEach((option, index) => {
      option.textContent = labels[index] ?? option.textContent;
    });
  }
  localizeText(document.querySelector<HTMLElement>('label[for="audienceMode"]'), '모드', korean);
  localizeText(document.querySelector<HTMLElement>('label[for="navLocale"]'), '언어', korean);

  const trustToggle = document.getElementById('trustDrawerToggle');
  trustToggle?.setAttribute('data-testid', 'trust-inspector-toggle');
  trustToggle?.setAttribute('aria-label', korean ? '신뢰 및 진단 열기' : 'Open Trust and Diagnostics');
  replaceTrailingText(trustToggle, korean ? '신뢰 및 진단' : 'Trust & Diagnostics');
  localizeText(document.querySelector<HTMLElement>('.trust-drawer-title'), '신뢰 및 진단', korean);
  const trustDrawer = document.getElementById('trustDrawer');
  trustDrawer?.setAttribute('aria-label', korean ? '신뢰 및 진단' : 'Trust and diagnostics');
  for (const [section, labels] of Object.entries(TRUST_LABELS)) {
    const tab = document.querySelector<HTMLElement>(`[data-trust-tab="${section}"]`);
    if (!tab) continue;
    tab.dataset.testid = `trust-tab-${section}`;
    tab.textContent = korean ? labels.ko : labels.en;
  }
  const close = document.getElementById('trustDrawerClose');
  close?.setAttribute('aria-label', korean ? '진단 창 닫기' : 'Close the diagnostics drawer');
}

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
  for (const [value, text] of [
    ['en', 'English'],
    ['ko', '한국어']
  ] as const) {
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
    applyStructuralLocale();
    refresh();
  });
  host.append(label, select);
  applyStructuralLocale();
}
