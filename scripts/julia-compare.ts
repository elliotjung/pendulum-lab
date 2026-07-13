/**
 * Compare the TypeScript integrators against the external Julia Vern9
 * reference (scripts/julia_reference.jl). If Julia is on PATH the reference is
 * (re)generated first; otherwise an existing reports/julia-vern9-reference.json
 * is used; with neither, the script reports SKIPPED unless JULIA_REQUIRED=1.
 *
 *   npm run validate:julia
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { rhsDouble } from '../src/physics/double';
import { step } from '../src/physics/integrators';
import { energyDouble } from '../src/physics/energy';

interface JuliaReference {
  schemaVersion: string;
  solver: string;
  params: { m1: number; m2: number; l1: number; l2: number; g: number };
  state0: number[];
  T: number;
  energyDrift: number;
  samples: { t: number; state: number[]; energy: number }[];
}

const required = process.env.JULIA_REQUIRED === '1';

async function loadReference(): Promise<JuliaReference | null> {
  const julia = spawnSync('julia', ['--version'], { encoding: 'utf8' });
  if (julia.status === 0) {
    console.log(`julia found (${(julia.stdout ?? '').trim()}); generating Vern9 reference…`);
    const run = spawnSync('julia', ['--project=julia', 'scripts/julia_reference.jl'], { encoding: 'utf8', timeout: 600_000 });
    if (run.status !== 0) {
      console.error(`julia run failed:\n${(run.stderr ?? '').slice(-1000)}`);
      if (required) return null;
    }
  }
  try {
    return JSON.parse(await readFile('reports/julia-vern9-reference.json', 'utf8')) as JuliaReference;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const reference = await loadReference();
  await mkdir('reports', { recursive: true });
  if (!reference) {
    console.log('SKIPPED: no Julia on PATH and no cached reports/julia-vern9-reference.json.');
    console.log('Install Julia + OrdinaryDiffEq to enable the external Vern9 cross-check.');
    await writeFile('reports/julia-comparison.json', JSON.stringify({
      schemaVersion: 'pendulum-julia-comparison/v1',
      status: 'skipped',
      reason: 'julia unavailable and no cached reference',
      generatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
    if (required) {
      console.error('Julia reference is required by this gate.');
      process.exitCode = 1;
    }
    return;
  }

  const { params, state0, T } = reference;
  // Integrate with the project's high-order GBS integrator at fine dt.
  const dt = 0.0005;
  const steps = Math.round(T / dt);
  const state = new Float64Array(state0);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  const previousError = { value: 0 };
  const sampleEvery = Math.round(0.5 / dt);
  const tsSamples = new Map<number, number[]>();
  tsSamples.set(0, [...state0]);
  for (let k = 1; k <= steps; k += 1) {
    step('gbs', state, dt, rhs, out, { previousError });
    state.set(out);
    if (k % sampleEvery === 0) tsSamples.set(Number((k * dt).toFixed(4)), Array.from(state));
  }

  // Chaotic divergence makes late-time pointwise comparison meaningless; compare
  // early-time states plus the conserved energy over the whole window.
  const rows = reference.samples
    .filter((sample) => sample.t <= 4.0)
    .map((sample) => {
      const ts = tsSamples.get(Number(sample.t.toFixed(4)));
      const maxDelta = ts ? Math.max(...sample.state.map((value, index) => Math.abs(value - (ts[index] ?? Number.NaN)))) : Number.NaN;
      return { t: sample.t, maxStateDelta: maxDelta };
    });
  const e0 = energyDouble(new Float64Array(state0), params).total;
  const eT = energyDouble(state, params).total;
  const tsEnergyDrift = Math.abs((eT - e0) / (Math.abs(e0) || 1));

  const earlyAgreement = rows.every((row) => Number.isFinite(row.maxStateDelta) && row.maxStateDelta < 1e-4);
  const report = {
    schemaVersion: 'pendulum-julia-comparison/v1',
    status: earlyAgreement ? 'pass' : 'check',
    solverReference: reference.solver,
    juliaEnergyDrift: reference.energyDrift,
    tsIntegrator: `gbs, dt=${dt}`,
    tsEnergyDrift,
    earlyTimeWindow: '0..4s (pointwise; chaos prevents late-time pointwise comparison)',
    rows,
    caveat: 'Pointwise agreement decays at the Lyapunov rate; energy drift is the long-horizon metric.',
    generatedAt: new Date().toISOString()
  };
  await writeFile('reports/julia-comparison.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(`Julia Vern9 vs TS gbs: ${report.status.toUpperCase()} — early-time max deltas ${rows.map((row) => row.maxStateDelta.toExponential(1)).join(', ')}`);
  console.log(`energy drift: julia ${reference.energyDrift.toExponential(2)}, ts ${tsEnergyDrift.toExponential(2)}`);
  if (!earlyAgreement) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
