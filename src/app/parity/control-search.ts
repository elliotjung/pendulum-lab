import { currentNavLocale } from '../navGuide';
import { $, append, button, html } from './shared';

const CONTROL_SEARCH_COPY = {
  en: {
    label: 'Search simulation controls',
    inputLabel: 'Search controls',
    placeholder: 'Search controls',
    clear: 'Clear control search',
    help: 'Filter settings by label, option, or control id.',
    status: (matches: number, total: number, filtering: boolean) =>
      filtering ? `${matches} of ${total} controls match.` : `${total} controls shown.`
  },
  ko: {
    label: '시뮬레이션 조절기 검색',
    inputLabel: '조절기 검색',
    placeholder: '조절기를 검색하세요',
    clear: '조절기 검색어 지우기',
    help: '라벨, 선택 항목 또는 조절기 ID로 설정을 필터링합니다.',
    status: (matches: number, total: number, filtering: boolean) =>
      filtering ? `조절기 ${total}개 중 ${matches}개가 일치합니다.` : `조절기 ${total}개를 표시합니다.`
  }
} as const;

export function filterControls(query: string): void {
  const normalize = (value: string): string =>
    value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
  const q = normalize(query.slice(0, 80));
  const rows = Array.from(document.querySelectorAll<HTMLElement>('#tab-lab .controls .row'));
  let matches = 0;
  rows.forEach((line) => {
    const controls = Array.from(line.querySelectorAll<HTMLElement>('input,select,textarea,button'));
    const metadata = controls
      .flatMap((control) => {
        const options =
          control instanceof HTMLSelectElement ? Array.from(control.options).map((option) => option.text) : [];
        return [control.id, control.getAttribute('name') ?? '', control.getAttribute('title') ?? '', ...options];
      })
      .join(' ');
    const searchable = normalize(`${line.textContent ?? ''} ${metadata}`);
    const visible = !q || q.split(' ').every((term) => searchable.includes(term));
    line.classList.toggle('si-row-hidden', !visible);
    if (visible) matches += 1;
  });
  const status = $('siSearchStatus');
  if (status) status.textContent = CONTROL_SEARCH_COPY[currentNavLocale()].status(matches, rows.length, Boolean(q));
}

function localizeControlSearch(): void {
  const copy = CONTROL_SEARCH_COPY[currentNavLocale()];
  const label = document.querySelector<HTMLLabelElement>('label[for="siControlSearch"]');
  const search = $('siControlSearch');
  const clearSearch = $('siControlSearchClear');
  const help = $('siSearchHelp');
  if (label) label.textContent = copy.label;
  if (search instanceof HTMLInputElement) {
    search.setAttribute('aria-label', copy.inputLabel);
    search.placeholder = copy.placeholder;
  }
  clearSearch?.setAttribute('aria-label', copy.clear);
  clearSearch?.setAttribute('title', copy.clear);
  if (help) help.textContent = copy.help;
  if (search instanceof HTMLInputElement) filterControls(search.value);
}

/** Build an IME-safe, localized search surface for the Lab controls. */
export function createControlSearch(): HTMLElement {
  const labControls = document.querySelector<HTMLElement>('#tab-lab .controls');
  if (labControls && !labControls.id) labControls.id = 'labControlSurface';
  const searchWrap = html('div', { className: 'si-search-wrap' });
  const copy = CONTROL_SEARCH_COPY[currentNavLocale()];
  const searchLabel = html('label', { className: 'v10-sr', text: copy.label });
  searchLabel.htmlFor = 'siControlSearch';
  const search = html('input', { id: 'siControlSearch', className: 'si-search', ariaLabel: copy.inputLabel });
  search.type = 'search';
  search.maxLength = 80;
  search.autocomplete = 'off';
  search.inputMode = 'search';
  search.enterKeyHint = 'search';
  search.setAttribute('aria-controls', labControls?.id ?? 'tab-lab');
  search.setAttribute('aria-describedby', 'siSearchHelp siSearchStatus');
  search.placeholder = copy.placeholder;
  const clearSearch = button(
    'siControlSearchClear',
    '×',
    () => {
      search.value = '';
      clearSearch.setAttribute('hidden', '');
      filterControls('');
      search.focus();
    },
    'si-search-clear'
  );
  clearSearch.setAttribute('aria-label', copy.clear);
  clearSearch.setAttribute('title', copy.clear);
  clearSearch.setAttribute('hidden', '');
  search.addEventListener('input', (event) => {
    clearSearch.toggleAttribute('hidden', search.value.length === 0);
    if (event instanceof InputEvent && event.isComposing) return;
    filterControls(search.value);
  });
  search.addEventListener('compositionend', () => filterControls(search.value));
  search.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    event.stopPropagation();
    search.value = '';
    clearSearch.setAttribute('hidden', '');
    filterControls('');
  });
  const searchControls = html('div', { className: 'si-search-controls' });
  append(searchControls, search, clearSearch);
  const help = html('div', { id: 'siSearchHelp', className: 'si-small', text: copy.help });
  const searchStatus = html('div', { id: 'siSearchStatus', className: 'v10-sr', role: 'status' });
  searchStatus.setAttribute('aria-live', 'polite');
  searchStatus.setAttribute('aria-atomic', 'true');
  append(searchWrap, searchLabel, searchControls, help, searchStatus);
  document.addEventListener('pendulum:ui-locale-changed', localizeControlSearch);
  return searchWrap;
}
