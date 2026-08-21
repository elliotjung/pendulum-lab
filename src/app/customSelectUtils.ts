export const OWNER_ATTRIBUTE = 'data-custom-select-owner';
export const OPT_OUT_VALUE = 'native';
export const MENU_GAP = 4;
export const VIEWPORT_MARGIN = 8;
export const DEFAULT_MENU_MAX_HEIGHT = 320;
export const TYPEAHEAD_TIMEOUT_MS = 700;
export const SYNC_EVENTS = [
  'pendulum:audience-mode-changed',
  'pendulum:ui-locale-changed',
  'pendulum:color-theme-changed',
  'pendulum:lab-controls-committed'
] as const;

export interface CustomOptionEntry {
  readonly source: HTMLOptionElement;
  readonly element: HTMLButtonElement;
  readonly index: number;
  readonly searchLabel: string;
  readonly disabled: boolean;
}

export function documentFor(root: ParentNode): Document | null {
  if (root instanceof Document) return root;
  return root.ownerDocument;
}

export function selectsUnder(root: ParentNode): HTMLSelectElement[] {
  const selects: HTMLSelectElement[] = [];
  if (root instanceof HTMLSelectElement) selects.push(root);
  if ('querySelectorAll' in root)
    selects.push(...Array.from(root.querySelectorAll<HTMLSelectElement>('select:not([multiple])')));
  return selects;
}

export function isInitiallyEligible(select: HTMLSelectElement): boolean {
  if (!select.isConnected || !select.parentNode || !isEnhanceable(select)) return false;
  if (select.hidden || select.inert || select.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

export function isEnhanceable(select: HTMLSelectElement): boolean {
  return (
    !select.multiple &&
    select.size <= 1 &&
    !select.hidden &&
    !select.inert &&
    select.dataset.customSelect !== OPT_OUT_VALUE
  );
}

export function optionLabel(option: HTMLOptionElement | undefined): string {
  if (!option) return '';
  return option.label.trim() || option.textContent?.trim() || option.value;
}

export function normaliseSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== ' ' && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function copyAttribute(source: Element, target: Element, name: string): void {
  const value = source.getAttribute(name);
  if (value === null) target.removeAttribute(name);
  else target.setAttribute(name, value);
}

export function requestFrame(view: Window, callback: FrameRequestCallback): number {
  if (typeof view.requestAnimationFrame === 'function') return view.requestAnimationFrame(callback);
  return view.setTimeout(() => callback(performance.now()), 0);
}

export function cancelFrame(view: Window, id: number): void {
  if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(id);
  else view.clearTimeout(id);
}

type SelectObservableProperty = 'value' | 'selectedIndex';

function inheritedDescriptor(select: HTMLSelectElement, property: SelectObservableProperty): PropertyDescriptor | null {
  let prototype: object | null = Object.getPrototypeOf(select) as object | null;
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor) return descriptor;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return null;
}

/** Observe IDL property writes without changing the native select's source of truth. */
export function observeSelectProperty(
  select: HTMLSelectElement,
  property: SelectObservableProperty,
  onWrite: () => void
): () => void {
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(select, property);
  if (originalOwnDescriptor && !originalOwnDescriptor.configurable) return () => undefined;
  const nativeDescriptor = inheritedDescriptor(select, property);
  if (!nativeDescriptor?.get || !nativeDescriptor.set) return () => undefined;
  try {
    Object.defineProperty(select, property, {
      configurable: true,
      enumerable: nativeDescriptor.enumerable ?? true,
      get() {
        return nativeDescriptor.get?.call(this) as unknown;
      },
      set(value: unknown) {
        nativeDescriptor.set?.call(this, value);
        onWrite();
      }
    });
  } catch {
    // Some hardened DOM implementations reject own-property interception.
    // Native input/change events and open-time refresh remain the fallback.
    return () => undefined;
  }
  return () => {
    if (originalOwnDescriptor) Object.defineProperty(select, property, originalOwnDescriptor);
    else Reflect.deleteProperty(select, property);
  };
}
