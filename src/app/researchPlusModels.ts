import { chimeraDiagnostics, type ChimeraDiagnostics } from '../chaos/chimera';
import {
  kuramotoCriticalCouplingLorentzian,
  kuramotoOrderParameter,
  nonlocalRingAdjacency,
  rhsKuramoto
} from '../physics/kuramoto';
import type { MagneticBasinGrid } from '../physics/magneticPendulum';
import type { QkrFloquetViewModel } from '../research/qkrViewModel';
import type { StateVector } from '../physics/types';

export type SynchronizationMode = 'mean-field' | 'chimera-seed';

export interface SynchronizationExploration {
  mode: SynchronizationMode;
  coupling: number;
  criticalCoupling: number;
  times: number[];
  order: number[];
  finalPhases: number[];
  chimera: ChimeraDiagnostics;
}

/** Deterministic finite-network exploration feeding the Research+ UI. */
export function buildSynchronizationExploration(
  coupling: number,
  mode: SynchronizationMode,
  options: { count?: number; steps?: number; dt?: number } = {}
): SynchronizationExploration {
  if (!Number.isFinite(coupling) || coupling < 0)
    throw new Error('Synchronization coupling must be finite and non-negative.');
  const n = options.count ?? 32;
  const steps = options.steps ?? 600;
  const dt = options.dt ?? 0.02;
  if (!Number.isInteger(n) || n < 8) throw new Error('Synchronization exploration requires at least 8 oscillators.');
  const halfWidth = 0.5;
  const phases = new Float64Array(n);
  const frequencies = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const q = (i + 0.5) / n;
    frequencies[i] = mode === 'mean-field' ? Math.max(-2, Math.min(2, halfWidth * Math.tan(Math.PI * (q - 0.5)))) : 0;
    phases[i] =
      mode === 'mean-field'
        ? 2 * Math.PI * q + 0.25 * Math.sin(6 * Math.PI * q)
        : i < n / 2
          ? 0
          : i % 2 === 0
            ? 0
            : Math.PI;
  }
  const adjacency = mode === 'chimera-seed' ? nonlocalRingAdjacency(n, Math.max(2, Math.floor(n / 8))) : undefined;
  const phaseLag = mode === 'chimera-seed' ? 1.45 : 0;
  const derivative = new Float64Array(n) as StateVector;
  const midpointDerivative = new Float64Array(n) as StateVector;
  const midpoint = new Float64Array(n);
  const times: number[] = [];
  const order: number[] = [];
  const recordEvery = Math.max(1, Math.floor(steps / 100));
  const parameters = {
    naturalFrequencies: Array.from(frequencies),
    coupling,
    phaseLag,
    ...(adjacency ? { adjacency } : {})
  };
  for (let step = 0; step <= steps; step += 1) {
    if (step % recordEvery === 0 || step === steps) {
      times.push(step * dt);
      order.push(kuramotoOrderParameter(phases).magnitude);
    }
    if (step === steps) break;
    rhsKuramoto(phases, parameters, derivative);
    for (let i = 0; i < n; i += 1) midpoint[i] = phases[i]! + 0.5 * dt * derivative[i]!;
    rhsKuramoto(midpoint, parameters, midpointDerivative);
    for (let i = 0; i < n; i += 1) {
      const next = phases[i]! + dt * midpointDerivative[i]!;
      phases[i] = Math.atan2(Math.sin(next), Math.cos(next));
    }
  }
  return {
    mode,
    coupling,
    criticalCoupling: kuramotoCriticalCouplingLorentzian(halfWidth),
    times,
    order,
    finalPhases: Array.from(phases),
    chimera: chimeraDiagnostics(phases, {
      radius: Math.max(2, Math.floor(n / 8)),
      coherentThreshold: 0.9,
      incoherentThreshold: 0.3
    })
  };
}

export function magneticBasinCsv(grid: MagneticBasinGrid): string {
  const rows = ['x,y,magnet,converged'];
  for (let iy = 0; iy < grid.height; iy += 1) {
    const y = grid.yRange[0] + ((grid.yRange[1] - grid.yRange[0]) * iy) / (grid.height - 1);
    for (let ix = 0; ix < grid.width; ix += 1) {
      const x = grid.xRange[0] + ((grid.xRange[1] - grid.xRange[0]) * ix) / (grid.width - 1);
      const index = iy * grid.width + ix;
      rows.push(`${x.toPrecision(10)},${y.toPrecision(10)},${grid.labels[index]},${grid.converged[index]}`);
    }
  }
  return rows.join('\n');
}

export function magneticBasinFingerprint(grid: MagneticBasinGrid): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < grid.labels.length; i += 1) {
    hash ^= (grid.labels[i] ?? 0) + 17 * (grid.converged[i] ?? 0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function drawMagneticBasin(canvas: HTMLCanvasElement, grid: MagneticBasinGrid): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.createImageData(grid.width, grid.height);
  const colors = [
    [239, 91, 91],
    [89, 210, 162],
    [112, 155, 255]
  ] as const;
  for (let i = 0; i < grid.labels.length; i += 1) {
    const color = colors[Math.max(0, grid.labels[i] ?? 0) % colors.length]!;
    const converged = grid.converged[i] === 1;
    image.data[4 * i] = converged ? color[0] : Math.floor(color[0] * 0.35);
    image.data[4 * i + 1] = converged ? color[1] : Math.floor(color[1] * 0.35);
    image.data[4 * i + 2] = converged ? color[2] : Math.floor(color[2] * 0.35);
    image.data[4 * i + 3] = 255;
  }
  const buffer = document.createElement('canvas');
  buffer.width = grid.width;
  buffer.height = grid.height;
  buffer.getContext('2d')?.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}

function drawFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, label: string): void {
  context.fillStyle = '#05080d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#63718a';
  context.strokeRect(36, 12, canvas.width - 48, canvas.height - 38);
  context.fillStyle = '#cfe8ff';
  context.font = '12px system-ui';
  context.fillText(label, 40, canvas.height - 8);
}

export function drawSynchronization(canvas: HTMLCanvasElement, result: SynchronizationExploration): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  drawFrame(context, canvas, 'time →   global order r(t)');
  context.strokeStyle = '#7fd4ff';
  context.lineWidth = 2;
  context.beginPath();
  const tMax = result.times.at(-1) ?? 1;
  result.order.forEach((value, index) => {
    const x = 36 + ((canvas.width - 48) * (result.times[index] ?? 0)) / tMax;
    const y = 12 + (canvas.height - 38) * (1 - value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

export function drawQkrSpectrum(canvas: HTMLCanvasElement, model: QkrFloquetViewModel): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  drawFrame(context, canvas, 'Floquet phase →   quasi-energy');
  const [qMin, qMaxRaw] = model.quasiEnergyDomain;
  const qMax = qMaxRaw > qMin ? qMaxRaw : qMin + 1;
  context.fillStyle = '#e7c887';
  model.bands.forEach((band) => {
    const x = 36 + ((canvas.width - 48) * (band.phase + Math.PI)) / (2 * Math.PI);
    const y = 12 + (canvas.height - 38) * (1 - (band.quasiEnergy - qMin) / (qMax - qMin));
    context.beginPath();
    context.arc(x, y, 3, 0, 2 * Math.PI);
    context.fill();
  });
}
