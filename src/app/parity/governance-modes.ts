/** Focused governance responsibility extracted from governance-ui.ts. */
/**
 * Governance surfaces: extra tabs, palettes, onboarding, feature badge/audit UI, stable modes.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import type { RunMode } from '../../types/domain';

import { LEGACY_VALIDATION_IDS, html, modernLab, record, setControl, state, toast } from './shared';
import { renderRuntimePanels } from './runtime-diagnostics';

import { registerGovernanceCommands } from './governance-commands';

import { filterControls } from './control-search';

import { showFeaturePanel, exportManifest } from './governance-ui';

export function applyStableDefaults(): void {
  setControl('method', 'rk4');
  setControl('dt', 0.002);
  setControl('spf', 6);
  setControl('gamma', 0);
  setControl('trailLen', 1200);
  modernLab()?.reset?.();
  toast('Stable defaults applied');
  record('stable defaults applied');
}

export function applyAccuracyMode(): void {
  setMode('research');
  setControl('method', 'hmidpoint');
  setControl('dt', 0.001);
  setControl('tol', -8);
  setControl('spf', 4);
  modernLab()?.reset?.();
  toast('Accuracy mode applied');
  record('accuracy mode applied');
}

export function applyPerformanceMode(): void {
  setMode('performance');
  setControl('trailLen', 700);
  setControl('ensN', 0);
  setControl('glowMode', false);
  setControl('longExpose', false);
  modernLab()?.reset?.();
  toast('Performance mode applied');
  record('performance mode applied');
}

export function recoverSimulation(): void {
  state.recoveries += 1;
  const nanOverlay = $('nanOverlay');
  if (nanOverlay) nanOverlay.style.display = 'none'; // CSSOM write (setAttribute('style') is CSP-blocked)
  $('resetBtn')?.click();
  $('riErrorPanel')?.classList.remove('show');
  toast('Simulation recovered');
  record('manual recovery');
}

export { filterControls };

export function setMode(mode: RunMode): void {
  state.mode = mode;
  if (window.App) window.App.runMode = mode;
  for (const id of ['v10RunMode', 'rgv7ModeSelect', 'plxRunMode', 'riModeSelect']) {
    const el = $(id);
    if (el instanceof HTMLSelectElement && Array.from(el.options).some((opt) => opt.value === mode)) el.value = mode;
  }
  renderRuntimePanels();
  record(`mode ${mode}`);
}

export function registerParityCommands(): void {
  registerGovernanceCommands({ exportManifest, showFeaturePanel });
}

export function installModeSelectAnchors(): void {
  if (!$('riModeSelect')) {
    // Legacy id anchor only — hidden from the accessibility tree and focus
    // order so it never surfaces as an unnamed control.
    const select = html('select', { id: 'riModeSelect', className: 'v10-sr' });
    select.setAttribute('hidden', '');
    select.setAttribute('aria-hidden', 'true');
    select.inert = true;
    select.tabIndex = -1;
    for (const mode of ['demo', 'research', 'performance', 'recovery'] as const)
      select.append(html('option', { value: mode, text: mode }));
    select.addEventListener('change', () => setMode(select.value as RunMode));
    document.body.append(select);
  }
  for (const id of ['methodHonesty', 'modeHonesty']) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr' }));
  }
}

export function installLegacyValidationIdAnchors(): void {
  for (const id of LEGACY_VALIDATION_IDS) {
    if (!$(id)) {
      const anchor = html('div', { id, className: 'v10-sr' });
      anchor.setAttribute('aria-hidden', 'true');
      anchor.inert = true;
      document.body.append(anchor);
    }
  }
  if (!$('fault-')) {
    const anchor = html('div', { id: 'fault-', className: 'v10-sr' });
    anchor.setAttribute('aria-hidden', 'true');
    anchor.inert = true;
    document.body.append(anchor);
  }
}
