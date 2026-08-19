/** Notification, audit, tab, and compatibility behavior for the parity layer. */
import { canAccessAudienceTab, currentAudienceMode } from '../audienceMode';
import { installAdoptedStyle } from '../../ui/adoptedStyles';
import { $, html } from './shared-dom';
import { state } from './shared-state';
import { COMPAT_ANCHOR_IDS } from './shared-types';

export function toast(message: string, timeout = 2200): void {
  const maybeToast = window.toast;
  if (typeof maybeToast === 'function') maybeToast(message, timeout);
  else {
    const box = $('toast');
    if (box) {
      box.textContent = message;
      box.classList.add('show');
      window.setTimeout(() => box.classList.remove('show'), timeout);
    }
  }
}

let auditRenderHook: (() => void) | null = null;

export function setAuditRenderHook(hook: (() => void) | null): void {
  auditRenderHook = hook;
}

export function record(message: string): void {
  const line = new Date().toLocaleTimeString() + ' ' + message;
  state.auditLog.unshift(line);
  state.auditLog = state.auditLog.slice(0, 80);
  auditRenderHook?.();
}

export function installStyle(id: string, css: string): void {
  installAdoptedStyle(id, css);
}

export function ensureCompatAnchors(): void {
  for (const id of COMPAT_ANCHOR_IDS) {
    if ($(id)) continue;
    const template = html('template', { id });
    template.textContent = 'Preserved by src/app/FeatureParityLayer.ts';
    document.body.append(template);
  }
}

export function setActiveTab(name: string): void {
  if (!canAccessAudienceTab(currentAudienceMode(), name)) return;
  const shell = (window as Window & { __modernShell?: { switchTo(tab: string): void } }).__modernShell;
  if (shell) {
    shell.switchTo(name);
    return;
  }
  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === 'tab-' + name);
  });
  if (window.App) window.App.activeTab = name;
}

export function researchUid(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
