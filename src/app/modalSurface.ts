/**
 * Shared accessibility contract for the app's custom (non-<dialog>) modals.
 *
 * Native dialogs already make the document inert. Audience selection, the
 * command palette, and Trust Inspector are div/section based surfaces, so they
 * need the same background isolation, focus containment, and nested-modal
 * restoration explicitly.
 */

interface BackgroundState {
  ariaHidden: string | null;
  inert: boolean;
}

const activeModals: HTMLElement[] = [];
const backgroundState = new Map<HTMLElement, BackgroundState>();
const LIVE_SURFACE_IDS = new Set(['toast', 'nanOverlay', 'uiPreferenceStatus']);
let backgroundObserver: MutationObserver | null = null;

function isBackgroundCandidate(element: HTMLElement): boolean {
  return !['LINK', 'SCRIPT', 'STYLE', 'TEMPLATE'].includes(element.tagName) && !LIVE_SURFACE_IDS.has(element.id);
}

function remember(element: HTMLElement): void {
  if (backgroundState.has(element)) return;
  backgroundState.set(element, {
    ariaHidden: element.getAttribute('aria-hidden'),
    inert: element.inert
  });
}

function restore(element: HTMLElement, state: BackgroundState): void {
  element.inert = state.inert;
  if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', state.ariaHidden);
}

function exposeActiveSurface(element: HTMLElement): void {
  // A surface may have been remembered as hidden while another modal was on
  // top. Opening it later must override that snapshot until the stack drains;
  // otherwise it is visibly open but remains absent from the accessibility tree.
  element.inert = false;
  element.removeAttribute('aria-hidden');
}

function syncBackgroundIsolation(): void {
  const top = activeModals.at(-1) ?? null;
  document.body.dataset.modalDepth = String(activeModals.length);
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || !isBackgroundCandidate(child)) continue;
    remember(child);
    const original = backgroundState.get(child);
    if (!original) continue;
    if (child === top || (top !== null && child.contains(top))) {
      exposeActiveSurface(child);
      if (top) exposeActiveSurface(top);
      continue;
    }
    child.inert = true;
    child.setAttribute('aria-hidden', 'true');
  }
}

function observeBackgroundAdditions(): void {
  if (backgroundObserver || !document.body) return;
  backgroundObserver = new MutationObserver((records) => {
    if (!activeModals.length || !records.some((record) => record.addedNodes.length > 0)) return;
    syncBackgroundIsolation();
  });
  backgroundObserver.observe(document.body, { childList: true });
}

/** Make `modal` the only interactive top-level application surface. */
export function activateModalSurface(modal: HTMLElement): void {
  const previousIndex = activeModals.indexOf(modal);
  if (previousIndex >= 0) activeModals.splice(previousIndex, 1);
  activeModals.push(modal);
  syncBackgroundIsolation();
  observeBackgroundAdditions();
}

/** Restore the exact inert/aria-hidden state that preceded modal activation. */
export function deactivateModalSurface(modal: HTMLElement): void {
  const index = activeModals.lastIndexOf(modal);
  if (index >= 0) activeModals.splice(index, 1);
  if (activeModals.length) {
    syncBackgroundIsolation();
    return;
  }
  backgroundObserver?.disconnect();
  backgroundObserver = null;
  for (const [element, state] of backgroundState) restore(element, state);
  backgroundState.clear();
  document.body.removeAttribute('data-modal-depth');
}

/** True when one of the app's custom modal surfaces currently owns focus. */
export function hasActiveModalSurface(): boolean {
  return activeModals.length > 0;
}

function isFocusable(element: HTMLElement): boolean {
  if (element.hidden || element.inert || element.closest('[hidden],[inert]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

export function modalFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])'
    )
  ).filter(isFocusable);
}

/** Keep Tab/Shift+Tab within a custom modal, including focus recovery. */
export function trapModalFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const focusable = modalFocusableElements(root);
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    root.focus();
    return;
  }
  if (!root.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** A single polite live region for mode/language changes and other UI state. */
export function announceUiPreference(message: string): void {
  let status = document.getElementById('uiPreferenceStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'uiPreferenceStatus';
    status.className = 'v10-sr';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    document.body.append(status);
  }
  // Repeating a selection should still be announced after an explicit user
  // action. Clearing first gives assistive technology a real text mutation.
  status.textContent = '';
  queueMicrotask(() => {
    if (status?.isConnected) status.textContent = message;
  });
}
