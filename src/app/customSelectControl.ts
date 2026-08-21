import type { CustomSelectController, CustomSelectManagerHost } from './customSelectTypes';
import {
  copyAttribute,
  DEFAULT_MENU_MAX_HEIGHT,
  isPrintableKey,
  MENU_GAP,
  normaliseSearch,
  observeSelectProperty,
  optionLabel,
  OWNER_ATTRIBUTE,
  TYPEAHEAD_TIMEOUT_MS,
  VIEWPORT_MARGIN,
  type CustomOptionEntry
} from './customSelectUtils';

let nextControlId = 0;

export class CustomSelectControl implements CustomSelectController {
  readonly select: HTMLSelectElement;
  readonly host: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly listbox: HTMLDivElement;

  private readonly manager: CustomSelectManagerHost;
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

  constructor(manager: CustomSelectManagerHost, select: HTMLSelectElement) {
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
