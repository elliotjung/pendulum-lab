/**
 * Trust & Diagnostics drawer — the single home for the runtime's trust
 * surfaces (numerical health, validation, provenance/governance, performance,
 * fault log). The parity modules mount their cards into the drawer sections
 * (see `app.html#trustDrawer`); this module owns open/close and the internal
 * tab strip so the Lab screen itself stays focused on the simulation.
 */

import { hasActiveModalSurface } from './modalSurface';

export type TrustSection = 'health' | 'validation' | 'provenance' | 'performance' | 'faults';

let returnFocus: HTMLElement | null = null;

function drawer(): HTMLElement | null {
  return document.getElementById('trustDrawer');
}

/** Section container for parity cards; null when the drawer markup is absent. */
export function trustSection(name: TrustSection): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#trustDrawer [data-trust-panel="${name}"]`);
}

export function openTrustDrawer(section?: TrustSection): void {
  const root = drawer();
  if (!root) return;
  if (root.hidden) {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && !root.contains(active) ? active : null;
  }
  root.hidden = false;
  document.getElementById('trustDrawerToggle')?.setAttribute('aria-expanded', 'true');
  if (section) selectSection(section);
  root.focus();
}

export function closeTrustDrawer(restoreFocus = true): void {
  const root = drawer();
  if (!root || root.hidden) return;
  root.hidden = true;
  document.getElementById('trustDrawerToggle')?.setAttribute('aria-expanded', 'false');
  const target = returnFocus;
  returnFocus = null;
  if (restoreFocus && target?.isConnected) queueMicrotask(() => target.focus());
}

function selectSection(name: TrustSection): void {
  document.querySelectorAll<HTMLElement>('#trustDrawer [data-trust-tab]').forEach((tab) => {
    const selected = tab.dataset.trustTab === name;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('#trustDrawer [data-trust-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.trustPanel !== name;
  });
}

let installed = false;

export function installTrustDrawer(): void {
  if (installed || typeof document === 'undefined' || !drawer()) return;
  installed = true;

  const toggle = document.getElementById('trustDrawerToggle');
  toggle?.addEventListener('click', () => {
    const root = drawer();
    if (!root) return;
    if (root.hidden) openTrustDrawer();
    else closeTrustDrawer();
  });
  document.getElementById('trustDrawerClose')?.addEventListener('click', () => {
    closeTrustDrawer();
  });

  const tabs = Array.from(document.querySelectorAll<HTMLElement>('#trustDrawer [data-trust-tab]'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.trustTab as TrustSection | undefined;
      if (name) selectSection(name);
    });
    // Roving-tabindex arrow navigation across the section tabs.
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      const next = tabs[nextIndex];
      next?.focus();
      const name = next?.dataset.trustTab as TrustSection | undefined;
      if (name) selectSection(name);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    const root = drawer();
    if (root && !root.hidden) {
      if (hasActiveModalSurface() || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      closeTrustDrawer();
    }
  });
}
