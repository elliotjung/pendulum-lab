import { catalog } from '../catalog';
import { courses } from '../../../content/learn/curriculum';
import {
  collectBilingualPairs,
  PRODUCT_LOCALE_STORAGE_KEY,
  resolveProductLocale,
  translateProductString,
  type ProductLocale
} from './locale-data';

interface LocaleState {
  locale: ProductLocale;
  readonly pairs: Map<string, string>;
  readonly ambiguous: Set<string>;
  readonly listeners: Set<() => void>;
}
const states = new WeakMap<Document, LocaleState>();
function stateFor(document: Document): LocaleState {
  const existing = states.get(document);
  if (existing) return existing;
  let stored: string | null = null;
  let query: string | null = null;
  try {
    stored = document.defaultView?.localStorage.getItem(PRODUCT_LOCALE_STORAGE_KEY) ?? null;
  } catch {
    /* Storage can be unavailable. */
  }
  try {
    query = new URL(document.defaultView!.location.href).searchParams.get('lang');
  } catch {
    /* Keep the safe default. */
  }
  const state: LocaleState = {
    locale: resolveProductLocale(query, stored),
    pairs: new Map(),
    ambiguous: new Set(),
    listeners: new Set()
  };
  states.set(document, state);
  return state;
}
export function currentProductLocale(document: Document): ProductLocale {
  return stateFor(document).locale;
}

/** Register only content already loaded by the normal router; no course chunks are fetched here. */
export function registerLoadedLocaleText(document: Document, value: unknown): void {
  const state = stateFor(document);
  for (const [ko, en] of collectBilingualPairs(value)) {
    if (state.pairs.has(ko) && state.pairs.get(ko) !== en) {
      state.pairs.delete(ko);
      state.ambiguous.add(ko);
    } else if (!state.ambiguous.has(ko)) state.pairs.set(ko, en);
  }
  state.listeners.forEach((notify) => notify());
}

/** Translates known authored copy only. Values, formulas and user input are never rewritten. */
export function createProductLocaleControl(document: Document, root: HTMLElement) {
  const state = stateFor(document);
  registerLoadedLocaleText(document, catalog);
  registerLoadedLocaleText(document, courses);
  const container = document.createElement('div');
  container.className = 'ds-field product-locale-control';
  container.setAttribute('data-product-locale-skip', '');
  const label = document.createElement('label');
  label.className = 'ds-field__label';
  label.htmlFor = 'product-locale';
  const select = document.createElement('select');
  select.className = 'ds-field__control';
  select.id = label.htmlFor;
  for (const [value, title] of [
    ['ko', '한국어'],
    ['en', 'English']
  ]) {
    const option = document.createElement('option');
    option.value = value!;
    option.textContent = title!;
    select.append(option);
  }
  select.value = state.locale;
  const notice = document.createElement('p');
  notice.className = 'ds-field__help';
  notice.id = 'product-locale-notice';
  notice.setAttribute('role', 'status');
  select.setAttribute('aria-describedby', notice.id);
  container.append(label, select, notice);
  const texts = new WeakMap<Text, { original: string; rendered: string }>();
  const attributes = new WeakMap<Element, Map<string, { original: string; rendered: string }>>();
  const languages = new WeakMap<Element, string | null>();
  let disposed = false;
  let scheduled = false;
  let storageUnavailable = false;
  function language(node: Element, value: ProductLocale | undefined) {
    if (!languages.has(node)) languages.set(node, node.getAttribute('lang'));
    const next = value ?? languages.get(node);
    if (next) {
      if (node.getAttribute('lang') !== next) node.setAttribute('lang', next);
    } else if (node.hasAttribute('lang')) node.removeAttribute('lang');
  }
  function transform(node: Node, marks: Map<Element, ProductLocale | undefined>) {
    const mark = (element: Element, value: ProductLocale | undefined) => {
      const previous = marks.get(element);
      marks.set(
        element,
        previous === 'ko' || value === 'ko' ? 'ko' : previous === 'en' || value === 'en' ? 'en' : undefined
      );
    };
    if (node.nodeType === 1) {
      const element = node as Element;
      // Research names/narratives/captions are user data, even if they happen to
      // equal a reviewed UI label such as "실행". Keep the complete editor area.
      if (element.matches('.project-body, [contenteditable], [data-user-content]')) {
        if (/[가-힣]/.test(element.textContent ?? '')) mark(element, 'ko');
        return;
      }
      if (element.hasAttribute('data-product-locale-skip') || /^(?:PRE|CODE|SCRIPT|STYLE)$/.test(element.tagName))
        return;
      const recorded = attributes.get(element) ?? new Map<string, { original: string; rendered: string }>();
      for (const name of ['aria-label', 'title', 'placeholder']) {
        const value = element.getAttribute(name);
        if (!value) continue;
        const previous = recorded.get(name);
        const original = previous && previous.rendered === value ? previous.original : value;
        const translated = translateProductString(original, state.locale, state.pairs);
        recorded.set(name, { original, rendered: translated.text });
        if (value !== translated.text) element.setAttribute(name, translated.text);
        mark(element, translated.language);
      }
      attributes.set(element, recorded);
      if (/^(?:INPUT|TEXTAREA)$/.test(element.tagName)) return;
    } else if (node.nodeType === 3 && node.parentElement) {
      const text = node as Text;
      const previous = texts.get(text);
      const original = previous && previous.rendered === text.data ? previous.original : text.data;
      if (!original.trim()) return;
      const translated = translateProductString(original, state.locale, state.pairs);
      texts.set(text, { original, rendered: translated.text });
      if (text.data !== translated.text) text.data = translated.text;
      mark(node.parentElement, translated.language);
    }
    for (const child of Array.from(node.childNodes)) transform(child, marks);
  }
  function refresh() {
    if (disposed) return;
    document.documentElement.lang = state.locale;
    const labelText = state.locale === 'ko' ? '표시 언어' : 'Language';
    const noticeText = storageUnavailable
      ? state.locale === 'ko'
        ? '현재 화면에 적용했습니다. 저장 공간을 사용할 수 없습니다.'
        : 'Language is active for this page; storage is unavailable.'
      : state.locale === 'ko'
        ? ''
        : 'Untranslated explanations remain in Korean.';
    if (label.textContent !== labelText) label.textContent = labelText;
    if (notice.textContent !== noticeText) notice.textContent = noticeText;
    notice.hidden = state.locale === 'ko' && !storageUnavailable;
    container.lang = state.locale;
    select.value = state.locale;
    const marks = new Map<Element, ProductLocale | undefined>();
    transform(root, marks);
    marks.forEach((value, node) => language(node, value));
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refresh();
    });
  }
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'placeholder']
  });
  state.listeners.add(schedule);
  const onChange = () => {
    state.locale = select.value === 'en' ? 'en' : 'ko';
    try {
      document.defaultView?.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, state.locale);
      storageUnavailable = false;
    } catch {
      storageUnavailable = true;
    }
    refresh();
    const view = document.defaultView;
    if (view) {
      try {
        const url = new URL(view.location.href);
        if (url.searchParams.has('lang')) {
          url.searchParams.set('lang', state.locale);
          view.history.replaceState(view.history.state, '', url.href);
        }
      } catch {
        /* Storage preference still applies when URL replacement is unavailable. */
      }
      view.dispatchEvent(new CustomEvent('pendulum-product:locale-changed', { detail: { locale: state.locale } }));
    }
  };
  select.addEventListener('change', onChange);
  refresh();
  return {
    element: container,
    dispose() {
      disposed = true;
      observer.disconnect();
      state.listeners.delete(schedule);
      select.removeEventListener('change', onChange);
    }
  };
}
