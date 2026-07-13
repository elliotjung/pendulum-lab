/**
 * Long-term energy-conservation benchmark. Integrates the conservative
 * (undamped) double pendulum from a fixed initial condition with every
 * registered integrator and reports the maximum and final relative energy
 * drift plus wall-clock cost. Pure Node — run with `npm run benchmark:energy`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type { IntegratorId, PendulumParameters } from '../src/types/domain';
import { rhsDouble, energyDouble } from '../src/physics/double';
import { integratorRegistry, step } from '../src/physics/integrators';

const PARAMETERS: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const INITIAL_STATE = [1.2, -0.6, 0, 0];
const DT = 0.002;
const STEPS = 100_000; // T = 200 s

/** Decimated |ΔE/E₀|(t) samples so releases keep the whole drift history. */
interface DriftCurve {
  time: number[];
  relDrift: number[];
}

interface DriftRow {
  id: IntegratorId;
  name: string;
  order: string;
  maxRelDrift: number;
  finalRelDrift: number;
  wallMs: number;
  blewUp: boolean;
  curve: DriftCurve;
}

/** Steps between stored curve samples (200 points over the 100k-step run). */
const CURVE_STRIDE = 500;

function benchmark(id: IntegratorId): DriftRow {
  const meta = integratorRegistry[id];
  const state = new Float64Array(INITIAL_STATE);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array) => {
    rhsDouble(s, PARAMETERS, 0, o);
  };
  const e0 = energyDouble(state, PARAMETERS).total;
  const previousError = { value: 0 };
  let maxRelDrift = 0;
  let blewUp = false;
  const curve: DriftCurve = { time: [], relDrift: [] };

  const t0 = performance.now();
  for (let i = 0; i < STEPS; i += 1) {
    step(id, state, DT, rhs, out, { previousError });
    state.set(out);
    if (!Number.isFinite(state[0] ?? NaN)) {
      blewUp = true;
      break;
    }
    if (i % 50 === 0) {
      const drift = Math.abs((energyDouble(state, PARAMETERS).total - e0) / e0);
      if (drift > maxRelDrift) maxRelDrift = drift;
      if (i % CURVE_STRIDE === 0) {
        curve.time.push((i + 1) * DT);
        curve.relDrift.push(drift);
      }
    }
  }
  const wallMs = performance.now() - t0;
  const finalRelDrift = blewUp ? Infinity : Math.abs((energyDouble(state, PARAMETERS).total - e0) / e0);
  if (!blewUp) {
    curve.time.push(STEPS * DT);
    curve.relDrift.push(finalRelDrift);
  }

  return {
    id,
    name: meta.name,
    order: String(meta.order),
    maxRelDrift: blewUp ? Infinity : maxRelDrift,
    finalRelDrift,
    wallMs,
    blewUp,
    curve
  };
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return 'diverged';
  return x.toExponential(3);
}

function markdown(rows: DriftRow[]): string {
  const lines = [
    '# Long-Term Energy Benchmark',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Conservative double pendulum, IC = [${INITIAL_STATE.join(', ')}], dt = ${DT}, steps = ${STEPS} (T = ${(DT * STEPS).toFixed(0)} s).`,
    '',
    'Relative energy drift |ΔE / E₀|. Lower is better for conservation; note that',
    'TR-BDF2 is L-stable and intentionally dissipative, so its drift reflects',
    'numerical damping rather than instability.',
    '',
    `Per-integrator drift curves (|ΔE/E₀| sampled every ${CURVE_STRIDE} steps) are stored`,
    'in `reports/energy-benchmark.json` under `rows[].curve`.',
    '',
    '| Integrator | Order | Max rel. drift | Final rel. drift | Wall ms |',
    '|---|---|---:|---:|---:|'
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.name} (\`${r.id}\`) | ${r.order} | ${fmt(r.maxRelDrift)} | ${fmt(r.finalRelDrift)} | ${r.wallMs.toFixed(0)} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

const ids = Object.keys(integratorRegistry) as IntegratorId[];
const rows = ids.map(benchmark).sort((a, b) => a.maxRelDrift - b.maxRelDrift);

await mkdir('reports', { recursive: true });
await writeFile(
  'reports/energy-benchmark.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), parameters: PARAMETERS, dt: DT, steps: STEPS, rows }, null, 2)
);
await writeFile('reports/energy-benchmark.md', markdown(rows));
console.log(markdown(rows));
