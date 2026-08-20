/**
 * Accessible, progressively-enhanced presentation for native single-selects.
 *
 * The original select remains in the DOM (and remains the form/value source of
 * truth) so automation, form submission, validation and existing listeners keep
 * working. CSS visually overlays it with a button while this module portals a
 * fixed listbox to `document.body`, avoiding clipping by panels and flyouts.
 */

const OWNER_ATTRIBUTE = 'data-custom-select-owner';
const OPT_OUT_VALUE = 'native';
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
const DEFAULT_MENU_MAX_HEIGHT = 320;
const TYPEAHEAD_TIMEOUT_MS = 700;
const SYNC_EVENTS = [
  'pendulum:audience-mode-changed',
  'pendulum:ui-locale-changed',
  'pendulum:color-theme-changed',
  'pendulum:lab-controls-committed'
] as const;

interface CustomOptionEntry {
  readonly source: HTMLOptionElement;
  readonly element: HTMLButtonElement;
  readonly index: number;
  readonly searchLabel: string;
  readonly disabled: boolean;
}

export interface CustomSelectInstallation {
  /** Enhance newly-created eligible selects and resynchronise existing ones. */
  refresh(root?: ParentNode): void;
  /** Remove the enhancement and restore the original selects. */
  destroy(): void;
}

let nextControlId = 0;
const installations = new WeakMap<Document, CustomSelectManager>();

function documentFor(root: ParentNode): Document | null {
  if (root instanceof Document) return root;
  return root.ownerDocument;
}

function selectsUnder(root: ParentNode): HTMLSelectElement[] {
  const selects: HTMLSelectElement[] = [];
  if (root instanceof HTMLSelectElement) selects.push(root);
  if ('querySelectorAll' in root)
    selects.push(...Array.from(root.querySelectorAll<HTMLSelectElement>('select:not([multiple])')));
  return selects;
}

function isInitiallyEligible(select: HTMLSelectElement): boolean {
  if (!select.isConnected || !select.parentNode || !isEnhanceable(select)) return false;
  if (select.hidden || select.inert || select.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function isEnhanceable(select: HTMLSelectElement): boolean {
  return (
    !select.multiple &&
    select.size <= 1 &&
    !select.hidden &&
    !select.inert &&
    select.dataset.customSelect !== OPT_OUT_VALUE
  );
}

function optionLabel(option: HTMLOptionElement | undefined): string {
  if (!option) return '';
  return option.label.trim() || option.textContent?.trim() || option.value;
}

function normaliseSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== ' ' && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function copyAttribute(source: Element, target: Element, name: string): void {
  const value = source.getAttribute(name);
  if (value === null) target.removeAttribute(name);
  else target.setAttribute(name, value);
}

function requestFrame(view: Window, callback: FrameRequestCallback): number {
  if (typeof view.requestAnimationFrame === 'function') return view.requestAnimationFrame(callback);
  return view.setTimeout(() => callback(performance.now()), 0);
}

function cancelFrame(view: Window, id: number): void {
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
function observeSelectProperty(
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

class CustomSelectControl {
  readonly select: HTMLSelectElement;
  readonly host: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly listbox: HTMLDivElement;

  private readonly manager: CustomSelectManager;
  private readonly valueElement: HTMLSpanElement;
  private readonly originalTabIndex: string | null;
  private readonly originalAriaHidden: string | null;
  private readonly selectObserver: MutationObserver;
  private readonly restoreObservedProperties: Array<() => void> = [];
  private entries: CustomOptionEntry[] = [];
  private activeIndex = -1;
  private typeahead = '';
  private typeaheadAt = 0;
  private nativeSyncQueued = false;
  private destroyed = false;

  constructor(manager: CustomSelectManager, select: HTMLSelectElement) {
    this.manager = manager;
    this.select = select;
    this.originalTabIndex = select.getAttribute('tabindex');
    this.originalAriaHidden = select.getAttribute('aria-hidden');

    const document = select.ownerDocument;
    const controlNumber = ++nextControlId;
    const buttonId = `custom-select-button-${controlNumber}`;
    const listboxId = `custom-select-listbox-${controlNumber}`;

    this.host = document.createElement('div');
    this.host.className = 'custom-select-host';
    this.host.dataset.customSelectHost = String(controlNumber);

    this.button = document.createElement('button');
    this.button.id = buttonId;
    this.button.type = 'button';
    this.button.className = 'custom-select-button';
    this.button.setAttribute('role', 'combobox');
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', listboxId);
    this.button.setAttribute('aria-autocomplete', 'none');

    this.valueElement = document.createElement('span');
    this.valueElement.className = 'custom-select-value';
    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    this.button.append(this.valueElement, chevron);

    this.listbox = document.createElement('div');
    this.listbox.id = listboxId;
    this.listbox.className = 'custom-select-listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.setAttribute('aria-labelledby', buttonId);
    this.listbox.setAttribute('aria-multiselectable', 'false');
    this.listbox.setAttribute(OWNER_ATTRIBUTE, buttonId);
    this.listbox.hidden = true;

    select.before(this.host);
    this.host.append(select, this.button);
    document.body.append(this.listbox);
    select.classList.add('custom-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    this.button.addEventListener('click', this.onButtonClick);
    this.button.addEventListener('keydown', this.onButtonKeyDown);
    this.select.addEventListener('input', this.onNativeValueEvent);
    this.select.addEventListener('change', this.onNativeValueEvent);
    this.select.addEventListener('focus', this.onNativeFocus);
    this.select.addEventListener('invalid', this.onNativeInvalid);
    // The listbox is a body portal. Keeping its pointerdown from reaching
    // document-level outside-dismiss handlers prevents an owner flyout (the
    // audience preferences panel, for example) from closing before option click.
    this.listbox.addEventListener('pointerdown', this.onPortalPointerDown);
    this.refresh();
    this.restoreObservedProperties.push(
      observeSelectProperty(select, 'value', this.scheduleNativeSync),
      observeSelectProperty(select, 'selectedIndex', this.scheduleNativeSync)
    );
    this.selectObserver = new MutationObserver(() => this.manager.reconcile(this));
    this.selectObserver.observe(select, { attributes: true, characterData: true, childList: true, subtree: true });
  }

  isOpen(): boolean {
    return !this.listbox.hidden;
  }

  isIntact(): boolean {
    return (
      !this.destroyed &&
      this.host.isConnected &&
      this.button.parentElement === this.host &&
      this.listbox.parentElement === this.select.ownerDocument.body &&
      this.select.parentElement === this.host
    );
  }

  contains(target: Node | null): boolean {
    return Boolean(target && (this.host.contains(target) || this.listbox.contains(target)));
  }

  refresh(): void {
    if (this.destroyed) return;
    const activeSource = this.isOpen() ? this.entries[this.activeIndex]?.source : undefined;
    this.syncButtonSemantics();
    this.rebuildOptions();
    this.syncSelection();
    if (this.isOpen()) {
      // A MutationObserver or semantic-sync event can refresh the control
      // between Arrow/Home/End and Enter. Preserve the user's active option
      // across that rebuild instead of snapping back to the selected value.
      const preserved = activeSource
        ? this.entries.find((entry) => entry.source === activeSource && !entry.disabled)?.index
        : undefined;
      this.activeIndex = preserved ?? this.enabledIndexNear(this.select.selectedIndex, 1);
      this.syncActiveOption(false);
      this.manager.schedulePosition();
    }
  }

  open(initialIndex = this.select.selectedIndex): void {
    if (this.destroyed || this.select.disabled || !this.isRenderedAndAvailable()) return;
    this.refresh();
    this.manager.activate(this);
    this.listbox.hidden = false;
    this.listbox.style.visibility = 'hidden';
    this.button.setAttribute('aria-expanded', 'true');
    this.activeIndex = this.enabledIndexNear(initialIndex, 1);
    this.syncActiveOption(false);
    this.position();
    this.listbox.style.removeProperty('visibility');
    this.scrollActiveIntoView();
  }

  close(): void {
    if (this.destroyed || this.listbox.hidden) return;
    this.listbox.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.removeAttribute('aria-activedescendant');
    this.entries.forEach((entry) => entry.element.classList.remove('is-active'));
    this.activeIndex = -1;
    this.typeahead = '';
    this.manager.deactivate(this);
  }

  position(): void {
    if (!this.isOpen()) return;
    if (!this.isRenderedAndAvailable()) {
      this.close();
      return;
    }

    const view = this.select.ownerDocument.defaultView;
    if (!view) return;
    const rect = this.button.getBoundingClientRect();
    const viewport = view.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? view.innerWidth;
    const viewportHeight = viewport?.height ?? view.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const maximumWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2);
    const menuWidth = Math.min(Math.max(rect.width, 160), maximumWidth);
    const left = Math.min(
      Math.max(rect.left, viewportLeft + VIEWPORT_MARGIN),
      Math.max(viewportLeft + VIEWPORT_MARGIN, viewportRight - VIEWPORT_MARGIN - menuWidth)
    );
    const availableBelow = Math.max(0, viewportBottom - VIEWPORT_MARGIN - rect.bottom - MENU_GAP);
    const availableAbove = Math.max(0, rect.top - viewportTop - VIEWPORT_MARGIN - MENU_GAP);

    this.listbox.style.width = `${menuWidth}px`;
    this.listbox.style.left = `${left}px`;
    this.listbox.style.removeProperty('max-height');
    const desiredHeight = Math.min(this.listbox.scrollHeight, DEFAULT_MENU_MAX_HEIGHT);
    const openAbove = availableBelow < Math.min(desiredHeight, 160) && availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const maximumHeight = Math.max(38, Math.min(DEFAULT_MENU_MAX_HEIGHT, availableHeight));
    this.listbox.style.maxHeight = `${maximumHeight}px`;

    if (openAbove) {
      const actualHeight = Math.min(this.listbox.scrollHeight, maximumHeight);
      this.listbox.style.top = `${Math.max(viewportTop + VIEWPORT_MARGIN, rect.top - MENU_GAP - actualHeight)}px`;
      this.listbox.style.setProperty('--custom-select-origin', 'bottom');
    } else {
      this.listbox.style.top = `${Math.min(rect.bottom + MENU_GAP, viewportBottom - VIEWPORT_MARGIN)}px`;
      this.listbox.style.setProperty('--custom-select-origin', 'top');
    }
  }

  destroy(restoreDom: boolean): void {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.button.removeEventListener('click', this.onButtonClick);
    this.button.removeEventListener('keydown', this.onButtonKeyDown);
    this.select.removeEventListener('input', this.onNativeValueEvent);
    this.select.removeEventListener('change', this.onNativeValueEvent);
    this.select.removeEventListener('focus', this.onNativeFocus);
    this.select.removeEventListener('invalid', this.onNativeInvalid);
    this.listbox.removeEventListener('pointerdown', this.onPortalPointerDown);
    this.selectObserver.disconnect();
    for (const restoreProperty of this.restoreObservedProperties) restoreProperty();
    this.restoreObservedProperties.length = 0;
    this.listbox.remove();
    this.select.classList.remove('custom-select-native');
    if (this.originalTabIndex === null) this.select.removeAttribute('tabindex');
    else this.select.setAttribute('tabindex', this.originalTabIndex);
    if (this.originalAriaHidden === null) this.select.removeAttribute('aria-hidden');
    else this.select.setAttribute('aria-hidden', this.originalAriaHidden);

    if (restoreDom && this.select.parentElement === this.host && this.host.isConnected) {
      this.host.replaceWith(this.select);
    } else {
      this.button.remove();
      this.host.remove();
    }
  }

  private readonly onButtonClick = (): void => {
    if (this.isOpen()) this.close();
    else this.open();
  };

  private readonly onButtonKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (!this.isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.button.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'Tab') {
      this.close();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (!this.isOpen()) this.open();
      else if (this.activeIndex >= 0) this.choose(this.activeIndex);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!this.isOpen()) {
        const selected = this.select.selectedIndex;
        this.open(selected >= 0 ? selected : direction > 0 ? 0 : this.entries.length - 1);
      } else {
        this.moveActive(direction);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!this.isOpen()) this.open(event.key === 'Home' ? 0 : this.entries.length - 1);
      else this.setActive(this.edgeEnabledIndex(event.key === 'Home' ? 1 : -1));
      return;
    }
    if (isPrintableKey(event)) {
      event.preventDefault();
      this.handleTypeahead(event.key);
    }
  };

  private readonly onNativeValueEvent = (): void => {
    this.syncButtonSemantics();
    this.syncSelection();
  };

  private readonly onNativeFocus = (): void => {
    this.button.focus({ preventScroll: true });
  };

  private readonly onNativeInvalid = (): void => {
    this.button.setAttribute('aria-invalid', 'true');
  };

  private readonly onPortalPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
  };

  private readonly scheduleNativeSync = (): void => {
    if (this.nativeSyncQueued || this.destroyed) return;
    this.nativeSyncQueued = true;
    queueMicrotask(() => {
      this.nativeSyncQueued = false;
      if (!this.destroyed) this.refresh();
    });
  };

  private syncButtonSemantics(): void {
    this.button.disabled = this.select.disabled;
    this.button.toggleAttribute('aria-required', this.select.required);
    copyAttribute(this.select, this.button, 'aria-describedby');
    copyAttribute(this.select, this.button, 'aria-errormessage');
    copyAttribute(this.select, this.button, 'aria-invalid');
    copyAttribute(this.select, this.button, 'lang');
    copyAttribute(this.select, this.button, 'dir');
    this.button.title = this.select.title;

    const labelledBy = this.select.getAttribute('aria-labelledby');
    const ariaLabel = this.select.getAttribute('aria-label');
    if (labelledBy) {
      this.button.setAttribute('aria-labelledby', labelledBy);
      this.button.removeAttribute('aria-label');
    } else if (ariaLabel) {
      this.button.setAttribute('aria-label', ariaLabel);
      this.button.removeAttribute('aria-labelledby');
    } else {
      const labelIds = Array.from(this.select.labels ?? []).map((label, index) => {
        if (!label.id) label.id = `${this.button.id}-label-${index + 1}`;
        return label.id;
      });
      if (labelIds.length > 0) this.button.setAttribute('aria-labelledby', labelIds.join(' '));
      else this.button.removeAttribute('aria-labelledby');
      this.button.removeAttribute('aria-label');
    }
  }

  private rebuildOptions(): void {
    const fragment = this.select.ownerDocument.createDocumentFragment();
    this.entries = Array.from(this.select.options).map((option, index) => {
      const element = this.select.ownerDocument.createElement('button');
      const group = option.parentElement instanceof HTMLOptGroupElement ? option.parentElement : null;
      const disabled = option.disabled || Boolean(group?.disabled);
      const label = optionLabel(option);
      element.id = `${this.listbox.id}-option-${index}`;
      element.type = 'button';
      element.className = 'custom-select-option';
      element.setAttribute('role', 'option');
      element.setAttribute('aria-selected', String(option.selected));
      element.setAttribute('aria-disabled', String(disabled));
      element.tabIndex = -1;
      element.disabled = disabled;
      element.textContent = label;
      element.title = option.title;
      element.dataset.value = option.value;
      if (group?.label) element.dataset.group = group.label;
      element.addEventListener('pointermove', () => {
        if (!disabled) this.setActive(index, false);
      });
      element.addEventListener('pointerdown', (event) => event.preventDefault());
      element.addEventListener('click', () => {
        if (!disabled) this.choose(index);
      });
      fragment.append(element);
      return { source: option, element, index, searchLabel: normaliseSearch(label), disabled };
    });
    this.listbox.replaceChildren(fragment);
  }

  private syncSelection(): void {
    const selected = this.select.options.item(this.select.selectedIndex) ?? undefined;
    this.valueElement.textContent = optionLabel(selected) || this.select.getAttribute('placeholder') || 'Select';
    this.entries.forEach((entry) => {
      const isSelected = entry.index === this.select.selectedIndex;
      entry.element.setAttribute('aria-selected', String(isSelected));
      entry.source.selected = isSelected;
    });
  }

  private choose(index: number): void {
    const entry = this.entries[index];
    if (!entry || entry.disabled) return;
    const changed = this.select.selectedIndex !== entry.index;
    this.select.selectedIndex = entry.index;
    this.syncSelection();
    this.close();
    this.button.focus({ preventScroll: true });
    if (!changed) return;
    this.select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.manager.scheduleSync();
  }

  private moveActive(direction: 1 | -1): void {
    if (this.entries.length === 0) return;
    let index = this.activeIndex;
    for (let count = 0; count < this.entries.length; count += 1) {
      index = (index + direction + this.entries.length) % this.entries.length;
      if (!this.entries[index]?.disabled) {
        this.setActive(index);
        return;
      }
    }
  }

  private setActive(index: number, scroll = true): void {
    const entry = this.entries[index];
    if (!entry || entry.disabled) return;
    this.activeIndex = index;
    this.syncActiveOption(scroll);
  }

  private syncActiveOption(scroll: boolean): void {
    let activeId: string | null = null;
    this.entries.forEach((entry) => {
      const active = entry.index === this.activeIndex && !entry.disabled;
      entry.element.classList.toggle('is-active', active);
      if (active) activeId = entry.element.id;
    });
    if (activeId) this.button.setAttribute('aria-activedescendant', activeId);
    else this.button.removeAttribute('aria-activedescendant');
    if (scroll) this.scrollActiveIntoView();
  }

  private scrollActiveIntoView(): void {
    const active = this.entries[this.activeIndex]?.element;
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }

  private edgeEnabledIndex(direction: 1 | -1): number {
    let index = direction > 0 ? 0 : this.entries.length - 1;
    while (index >= 0 && index < this.entries.length) {
      if (!this.entries[index]?.disabled) return index;
      index += direction;
    }
    return -1;
  }

  private enabledIndexNear(requested: number, direction: 1 | -1): number {
    if (this.entries[requested] && !this.entries[requested].disabled) return requested;
    if (requested < 0) return this.edgeEnabledIndex(direction);
    let index = requested + direction;
    while (index >= 0 && index < this.entries.length) {
      if (!this.entries[index]?.disabled) return index;
      index += direction;
    }
    return this.edgeEnabledIndex(direction);
  }

  private handleTypeahead(key: string): void {
    const now = Date.now();
    const character = normaliseSearch(key);
    const repeating = now - this.typeaheadAt <= TYPEAHEAD_TIMEOUT_MS && this.typeahead === character;
    this.typeahead =
      now - this.typeaheadAt > TYPEAHEAD_TIMEOUT_MS || repeating ? character : this.typeahead + character;
    this.typeaheadAt = now;
    if (!this.isOpen()) this.open();
    if (!this.isOpen()) return;

    const start = repeating ? this.activeIndex + 1 : Math.max(this.activeIndex, -1) + 1;
    for (let offset = 0; offset < this.entries.length; offset += 1) {
      const index = (start + offset) % this.entries.length;
      const entry = this.entries[index];
      if (entry && !entry.disabled && entry.searchLabel.startsWith(this.typeahead)) {
        this.setActive(index);
        return;
      }
    }
  }

  private isRenderedAndAvailable(): boolean {
    if (!this.isIntact() || this.select.disabled || this.host.closest('[hidden], [inert]')) return false;
    const rect = this.button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}

class CustomSelectManager implements CustomSelectInstallation {
  private readonly document: Document;
  private readonly view: Window;
  private readonly observedRoot: Node;
  private readonly observer: MutationObserver;
  private readonly controls = new Map<HTMLSelectElement, CustomSelectControl>();
  private readonly generatedOwners = new WeakMap<Node, CustomSelectControl>();
  private active: CustomSelectControl | null = null;
  private positionFrame: number | null = null;
  private syncQueued = false;
  private destroyed = false;

  constructor(document: Document, observedRoot: Node) {
    const view = document.defaultView;
    if (!view) throw new Error('Custom selects require a document with a browsing context.');
    this.document = document;
    this.view = view;
    this.observedRoot = observedRoot;
    this.observer = new MutationObserver(this.onMutations);
    // The document-wide observer only discovers inserted selects and the few
    // eligibility attributes that can turn enhancement on/off. Option text and
    // state are watched by a narrow observer rooted at each native select.
    this.observer.observe(observedRoot, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'data-custom-select', 'hidden', 'inert', 'multiple', 'size'],
      childList: true,
      subtree: true
    });
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.addEventListener('focusin', this.onDocumentFocusIn);
    document.addEventListener('scroll', this.onViewportChange, true);
    document.addEventListener('reset', this.onFormReset, true);
    view.addEventListener('resize', this.onViewportChange);
    view.addEventListener('blur', this.onWindowBlur);
    view.visualViewport?.addEventListener('resize', this.onViewportChange);
    view.visualViewport?.addEventListener('scroll', this.onViewportChange);
    for (const eventName of SYNC_EVENTS) document.addEventListener(eventName, this.onSemanticSync);
  }

  refresh(root: ParentNode = this.observedRoot as ParentNode): void {
    if (this.destroyed) return;
    for (const select of selectsUnder(root)) this.enhance(select);
    for (const control of this.controls.values()) control.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    this.document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.document.removeEventListener('focusin', this.onDocumentFocusIn);
    this.document.removeEventListener('scroll', this.onViewportChange, true);
    this.document.removeEventListener('reset', this.onFormReset, true);
    this.view.removeEventListener('resize', this.onViewportChange);
    this.view.removeEventListener('blur', this.onWindowBlur);
    this.view.visualViewport?.removeEventListener('resize', this.onViewportChange);
    this.view.visualViewport?.removeEventListener('scroll', this.onViewportChange);
    for (const eventName of SYNC_EVENTS) this.document.removeEventListener(eventName, this.onSemanticSync);
    if (this.positionFrame !== null) cancelFrame(this.view, this.positionFrame);
    this.positionFrame = null;
    for (const control of [...this.controls.values()]) this.remove(control, true);
    this.active = null;
    installations.delete(this.document);
  }

  activate(control: CustomSelectControl): void {
    if (this.active && this.active !== control) this.active.close();
    this.active = control;
  }

  deactivate(control: CustomSelectControl): void {
    if (this.active === control) this.active = null;
  }

  reconcile(control: CustomSelectControl): void {
    if (this.destroyed || this.controls.get(control.select) !== control) return;
    const select = control.select;
    if (!select.isConnected) {
      this.remove(control, false);
      return;
    }
    if (!isEnhanceable(select)) {
      this.remove(control, true);
      return;
    }
    if (!control.isIntact()) {
      // If only a generated trigger/portal was removed, first unwrap the
      // still-live native select. Removing the host directly would otherwise
      // delete the source-of-truth control before re-enhancement can run.
      const canRestoreSelect = select.parentElement === control.host && control.host.isConnected;
      this.remove(control, canRestoreSelect);
      this.enhance(select);
      return;
    }
    control.refresh();
  }

  schedulePosition(): void {
    if (!this.active || this.positionFrame !== null) return;
    this.positionFrame = requestFrame(this.view, () => {
      this.positionFrame = null;
      this.active?.position();
    });
  }

  scheduleSync(): void {
    if (this.syncQueued || this.destroyed) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      if (this.destroyed) return;
      for (const control of this.controls.values()) control.refresh();
    });
  }

  private enhance(select: HTMLSelectElement): void {
    if (
      this.destroyed ||
      this.controls.has(select) ||
      !isInitiallyEligible(select) ||
      select.ownerDocument !== this.document
    )
      return;
    const control = new CustomSelectControl(this, select);
    this.controls.set(select, control);
    for (const generated of [control.select, control.host, control.button, control.listbox])
      this.generatedOwners.set(generated, control);
  }

  private remove(control: CustomSelectControl, restoreDom: boolean): void {
    this.controls.delete(control.select);
    for (const generated of [control.select, control.host, control.button, control.listbox])
      this.generatedOwners.delete(generated);
    control.destroy(restoreDom);
  }

  private collectGeneratedOwners(node: Node, owners: Set<CustomSelectControl>): void {
    const directOwner = this.generatedOwners.get(node);
    if (directOwner) owners.add(directOwner);
    if (!(node instanceof Element)) return;
    const generated = node.querySelectorAll(
      'select.custom-select-native, [data-custom-select-host], [data-custom-select-owner], .custom-select-button'
    );
    for (const element of generated) {
      const owner = this.generatedOwners.get(element);
      if (owner) owners.add(owner);
    }
  }

  private readonly onMutations = (records: MutationRecord[]): void => {
    const affectedControls = new Set<CustomSelectControl>();
    const eligibilitySelects = new Set<HTMLSelectElement>();
    const addedRoots: ParentNode[] = [];
    let activeGeometryChanged = false;

    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node instanceof Element) addedRoots.push(node);
        }
        for (const node of record.removedNodes) this.collectGeneratedOwners(node, affectedControls);
        continue;
      }
      activeGeometryChanged = true;
      if (record.target instanceof HTMLSelectElement) {
        const control = this.controls.get(record.target);
        if (control) affectedControls.add(control);
        else eligibilitySelects.add(record.target);
      }
    }

    for (const root of addedRoots) {
      for (const select of selectsUnder(root)) this.enhance(select);
    }
    for (const select of eligibilitySelects) this.enhance(select);
    for (const control of affectedControls) this.reconcile(control);
    if (activeGeometryChanged && this.active) this.schedulePosition();
  };

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (this.active && !this.active.contains(event.target instanceof Node ? event.target : null)) this.active.close();
  };

  private readonly onDocumentFocusIn = (event: FocusEvent): void => {
    if (this.active && !this.active.contains(event.target instanceof Node ? event.target : null)) this.active.close();
  };

  private readonly onViewportChange = (): void => {
    this.schedulePosition();
  };

  private readonly onWindowBlur = (): void => {
    this.active?.close();
  };

  private readonly onSemanticSync = (): void => {
    // Several semantic events are dispatched within a function that updates
    // select.value immediately afterwards. A microtask observes the final state.
    this.scheduleSync();
  };

  private readonly onFormReset = (event: Event): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    queueMicrotask(() => {
      for (const [select, control] of this.controls) {
        if (select.form === form) control.refresh();
      }
    });
  };
}

/**
 * Enhance every present and future native single-select under `root`.
 * Repeated installation for the same document is idempotent.
 */
export function installCustomSelects(root: ParentNode = document): CustomSelectInstallation {
  const ownerDocument = documentFor(root);
  if (!ownerDocument?.body) throw new Error('installCustomSelects requires document.body to exist.');
  const existing = installations.get(ownerDocument);
  if (existing) {
    existing.refresh(root);
    return existing;
  }
  const observedRoot = root instanceof Document ? root.documentElement : root;
  const manager = new CustomSelectManager(ownerDocument, observedRoot);
  installations.set(ownerDocument, manager);
  manager.refresh(root);
  return manager;
}
