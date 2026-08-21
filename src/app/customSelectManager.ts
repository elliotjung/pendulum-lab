import { CustomSelectControl } from './customSelectControl';
import type { CustomSelectController, CustomSelectInstallation, CustomSelectManagerHost } from './customSelectTypes';
import {
  cancelFrame,
  isEnhanceable,
  isInitiallyEligible,
  requestFrame,
  selectsUnder,
  SYNC_EVENTS
} from './customSelectUtils';

export class CustomSelectManager implements CustomSelectInstallation, CustomSelectManagerHost {
  private readonly document: Document;
  private readonly view: Window;
  private readonly observedRoot: Node;
  private readonly observer: MutationObserver;
  private readonly controls = new Map<HTMLSelectElement, CustomSelectControl>();
  private readonly generatedOwners = new WeakMap<Node, CustomSelectControl>();
  private active: CustomSelectController | null = null;
  private positionFrame: number | null = null;
  private syncQueued = false;
  private destroyed = false;

  constructor(document: Document, observedRoot: Node, onDestroy: () => void) {
    const view = document.defaultView;
    if (!view) throw new Error('Custom selects require a document with a browsing context.');
    this.document = document;
    this.view = view;
    this.observedRoot = observedRoot;
    this.onDestroy = onDestroy;
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

  private readonly onDestroy: () => void;

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
    this.onDestroy();
  }

  activate(control: CustomSelectController): void {
    if (this.active && this.active !== control) this.active.close();
    this.active = control;
  }

  deactivate(control: CustomSelectController): void {
    if (this.active === control) this.active = null;
  }

  reconcile(control: CustomSelectController): void {
    const select = control.select;
    const managedControl = this.controls.get(select);
    if (this.destroyed || managedControl !== control) return;
    if (!select.isConnected) {
      this.remove(managedControl, false);
      return;
    }
    if (!isEnhanceable(select)) {
      this.remove(managedControl, true);
      return;
    }
    if (!managedControl.isIntact()) {
      // If only a generated trigger/portal was removed, first unwrap the
      // still-live native select. Removing the host directly would otherwise
      // delete the source-of-truth control before re-enhancement can run.
      const canRestoreSelect = select.parentElement === managedControl.host && managedControl.host.isConnected;
      this.remove(managedControl, canRestoreSelect);
      this.enhance(select);
      return;
    }
    managedControl.refresh();
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
