import type { LabConfig } from './LabSimulation';
import type { Point2D } from '../viz/poincare';

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
}

/** Reproducible run JSON for the modern Lab. */
export function runJson(
  config: LabConfig,
  finalState: readonly number[],
  simTime: number,
  energy: number,
  drift: number
): RunExport {
  return {
    schemaVersion: 2,
    generator: 'pendulum-lab-modern-lab',
    system: config.system,
    method: config.method,
    dt: config.dt,
    gamma: config.gamma,
    parameters: config.parameters,
    initialState: [...config.initialState],
    finalState: [...finalState],
    simTime,
    energy,
    drift
  };
}

/** Trigger a browser download of text content. No-op when there is no document. */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  triggerDownload(filename, url);
  URL.revokeObjectURL(url);
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
