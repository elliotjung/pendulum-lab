import type { LabConfig } from './LabSimulation';
import type { Point2D } from '../viz/poincare';
import type { RunMode, RuntimeSnapshot } from '../types/domain';

/**
 * Pure builders for the Lab data exports (trajectory CSV, Poincaré CSV, run
 * JSON) plus a tiny browser download helper. The builders are string-in /
 * string-out so they unit-test without a DOM.
 */

export interface TrajectorySample {
  time: number;
  state: ArrayLike<number>;
}

/** Trajectory CSV: time then one column per state component. */
export function trajectoryCsv(samples: readonly TrajectorySample[], system: LabConfig['system']): string {
  const header = system === 'triple' ? 't,th1,th2,th3,w1,w2,w3' : 't,th1,th2,w1,w2';
  const rows = samples.map((s) => {
    const values = [s.time];
    for (let i = 0; i < s.state.length; i += 1) values.push(s.state[i] ?? 0);
    return values.map((v) => v.toPrecision(10)).join(',');
  });
  return [header, ...rows].join('\n');
}

/** Poincaré-section CSV: theta2, omega2 per crossing. */
export function poincareCsv(points: readonly Point2D[]): string {
  return ['theta2,omega2', ...points.map((p) => `${p.x.toPrecision(10)},${p.y.toPrecision(10)}`)].join('\n');
}

export interface RunExport {
  /** Stable legacy run-envelope version retained for existing consumers. */
  schemaVersion: 2;
  generator: string;
  system: LabConfig['system'];
  method: LabConfig['method'];
  dt: number;
  gamma: number;
  parameters: LabConfig['parameters'];
  initialState: readonly number[];
  finalState: readonly number[];
  simTime: number;
  energy: number;
  drift: number;
  /** Exact, directly restorable session state added without breaking v2 readers. */
  runtimeSnapshot: RuntimeSnapshot;
}

export interface RunExportOptions {
  mode?: RunMode;
  stepsPerFrame?: number;
  seed?: number | null;
  hash?: string;
}

function stateHash(state: ArrayLike<number>): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < state.length; i += 1) {
    hash ^= Math.trunc(Number(state[i] ?? 0) * 1e9);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Reproducible run JSON for the modern Lab. */
export function runJson(
  config: LabConfig,
  finalState: readonly number[],
  simTime: number,
  energy: number,
  drift: number,
  options: RunExportOptions = {}
): RunExport {
  const state = Array.from(finalState);
  const stepsPerFrame =
    Number.isSafeInteger(options.stepsPerFrame) && Number(options.stepsPerFrame) >= 1
      ? Number(options.stepsPerFrame)
      : 6;
  const seed = Number.isSafeInteger(options.seed) ? Number(options.seed) : null;
  const runtimeSnapshot: RuntimeSnapshot = {
    schemaVersion: 'pendulum-session/v10-ts',
    systemType: config.system,
    method: config.method,
    mode: options.mode ?? 'demo',
    dt: config.dt,
    tolerance: config.tolerance ?? 1e-7,
    stepsPerFrame,
    damping: config.gamma,
    parameters: { ...config.parameters },
    state,
    simTime,
    seed,
    hash: options.hash ?? stateHash(state)
  };
  return {
    schemaVersion: 2,
    generator: 'pendulum-lab-modern-lab',
    system: config.system,
    method: config.method,
    dt: config.dt,
    gamma: config.gamma,
    parameters: { ...config.parameters },
    initialState: [...config.initialState],
    finalState: [...state],
    simTime,
    energy,
    drift,
    runtimeSnapshot
  };
}

/** Trigger a browser download of text content. No-op when there is no document. */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  triggerDownload(filename, url);
  // Revoking in the same task can cancel downloads in Safari/WebKit. One
  // second keeps the URL short-lived while allowing navigation to consume it.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Trigger a browser download from a data URL (used for canvas PNG export). */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  if (typeof document === 'undefined') return;
  triggerDownload(filename, dataUrl);
}

function triggerDownload(filename: string, href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
