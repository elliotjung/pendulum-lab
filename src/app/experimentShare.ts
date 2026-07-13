import { integratorRegistry } from '../physics/integratorRegistry';
import type { IntegratorId } from '../types/domain';

/** Stable, versioned URL payload used by the "Share experiment" button. */
export interface SharedExperimentV1 {
  v: 1;
  system: 'double' | 'triple';
  method: IntegratorId;
  dt: number;
  damping: number;
  toleranceExponent: number;
  parameters: { m1: number; m2: number; m3: number; l1: number; l2: number; l3: number; g: number };
  initial: { theta: [number, number, number]; omega: [number, number, number] };
  tab: string;
}

const HASH_PREFIX = '#experiment=';
const MAX_HASH_LENGTH = 8_192;
const TABS = new Set([
  'lab', 'compare', 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'expansion',
  'matrix', 'validate', 'golden', 'zeroone', 'clv', 'basin', 'rqa', 'ftle',
  'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs'
]);

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function tuple3(value: unknown, fallback: [number, number, number], min: number, max: number): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  return [
    finite(value[0], fallback[0], min, max),
    finite(value[1], fallback[1], min, max),
    finite(value[2], fallback[2], min, max)
  ];
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(text: string): string {
  const padded = `${text.replaceAll('-', '+').replaceAll('_', '/')}${'='.repeat((4 - text.length % 4) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSharedExperiment(payload: SharedExperimentV1): string {
  return `${HASH_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

/** Parse and clamp an untrusted share hash. Unknown versions fail closed. */
export function decodeSharedExperiment(hash: string): SharedExperimentV1 | null {
  if (!hash.startsWith(HASH_PREFIX) || hash.length > MAX_HASH_LENGTH) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(hash.slice(HASH_PREFIX.length))) as Record<string, unknown>;
    if (parsed.v !== 1) return null;
    const parameters = typeof parsed.parameters === 'object' && parsed.parameters !== null
      ? parsed.parameters as Record<string, unknown>
      : {};
    const initial = typeof parsed.initial === 'object' && parsed.initial !== null
      ? parsed.initial as Record<string, unknown>
      : {};
    const method = typeof parsed.method === 'string' && parsed.method in integratorRegistry
      ? parsed.method as IntegratorId
      : 'rk4';
    const tab = typeof parsed.tab === 'string' && TABS.has(parsed.tab) ? parsed.tab : 'lab';
    return {
      v: 1,
      system: parsed.system === 'triple' ? 'triple' : 'double',
      method,
      dt: finite(parsed.dt, 0.003, 0.00001, 0.1),
      damping: finite(parsed.damping, 0, 0, 10),
      toleranceExponent: finite(parsed.toleranceExponent, -6, -14, -2),
      parameters: {
        m1: finite(parameters.m1, 1, 0.01, 100),
        m2: finite(parameters.m2, 1, 0.01, 100),
        m3: finite(parameters.m3, 1, 0.01, 100),
        l1: finite(parameters.l1, 1.2, 0.01, 100),
        l2: finite(parameters.l2, 1, 0.01, 100),
        l3: finite(parameters.l3, 0.8, 0.01, 100),
        g: finite(parameters.g, 9.81, 0, 100)
      },
      initial: {
        theta: tuple3(initial.theta, [2, 2.5, 1], -Math.PI * 4, Math.PI * 4),
        omega: tuple3(initial.omega, [0, 0, 0], -100, 100)
      },
      tab
    };
  } catch {
    return null;
  }
}

function controlValue(id: string, fallback: number): number {
  const element = document.getElementById(id) as HTMLInputElement | null;
  const value = element ? Number.parseFloat(element.value) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

function activeTab(): string {
  const panel = document.querySelector<HTMLElement>('.tabpanel.active');
  const tab = panel?.id.startsWith('tab-') ? panel.id.slice(4) : 'lab';
  return TABS.has(tab) ? tab : 'lab';
}

export function captureSharedExperiment(): SharedExperimentV1 {
  const selected = (id: string, fallback: string): string =>
    (document.getElementById(id) as HTMLSelectElement | null)?.value ?? fallback;
  const methodValue = selected('method', 'rk4');
  return {
    v: 1,
    system: selected('sysType', 'double') === 'triple' ? 'triple' : 'double',
    method: methodValue in integratorRegistry ? methodValue as IntegratorId : 'rk4',
    dt: controlValue('dt', 0.003),
    damping: controlValue('gamma', 0),
    toleranceExponent: controlValue('tol', -6),
    parameters: {
      m1: controlValue('m1', 1), m2: controlValue('m2', 1), m3: controlValue('m3', 1),
      l1: controlValue('l1', 1.2), l2: controlValue('l2', 1), l3: controlValue('l3', 0.8),
      g: controlValue('g', 9.81)
    },
    initial: {
      theta: [controlValue('th1', 2), controlValue('th2', 2.5), controlValue('th3', 1)],
      omega: [controlValue('iw1', 0), controlValue('iw2', 0), controlValue('iw3', 0)]
    },
    tab: activeTab()
  };
}

function setControl(id: string, value: string | number): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!element) return;
  const next = String(value);
  if (element instanceof HTMLSelectElement && !Array.from(element.options).some((option) => option.value === next)) return;
  element.value = next;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function restoreSharedExperiment(payload: SharedExperimentV1): void {
  setControl('sysType', payload.system);
  setControl('method', payload.method);
  setControl('dt', payload.dt);
  setControl('gamma', payload.damping);
  setControl('tol', payload.toleranceExponent);
  for (const [id, value] of Object.entries(payload.parameters)) setControl(id, value);
  payload.initial.theta.forEach((value, index) => setControl(`th${index + 1}`, value));
  payload.initial.omega.forEach((value, index) => setControl(`iw${index + 1}`, value));
  // One rebuild is enough: every control has already been populated.
  document.getElementById('sysType')?.dispatchEvent(new Event('change', { bubbles: true }));
  (window as Window & { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo(payload.tab);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function notify(message: string): void {
  const toast = (window as Window & { toast?: unknown }).toast;
  if (typeof toast === 'function') (toast as (text: string, duration?: number) => void)(message, 2200);
}

export function installExperimentShare(): void {
  if (typeof document === 'undefined') return;
  const restoreHash = (): void => {
    const payload = decodeSharedExperiment(location.hash);
    if (payload) restoreSharedExperiment(payload);
  };
  restoreHash();
  window.addEventListener('hashchange', restoreHash);
  const button = document.getElementById('shareUrl') as HTMLButtonElement | null;
  if (!button || button.dataset.shareBound === '1') return;
  button.dataset.shareBound = '1';
  button.dataset.testid = 'share-experiment';
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    url.hash = encodeSharedExperiment(captureSharedExperiment());
    history.replaceState(null, '', url);
    void copyText(url.href)
      .then(() => notify('Experiment link copied'))
      .catch(() => notify('Link created in the address bar'));
  });
}
