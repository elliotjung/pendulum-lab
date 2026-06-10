/**
 * External cross-validation: the TypeScript engine vs an *independent* SciPy
 * reference (scripts/scipy_reference.py — different language, independently
 * derived equations of motion, different integrator family: DOP853).
 *
 * Both the double and the triple pendulum are covered, in two regimes each:
 *  - a regular small-angle orbit, where agreement must hold to ~1e-9 over 20 s;
 *  - a chaotic orbit, where divergence grows like e^{λt} from the solvers'
 *    tolerance floor, so agreement is asserted on a horizon T ≲ (1/λ)·ln(tol⁻¹)
 *    rather than for all time (that horizon *is* the physics).
 *
 * Run: npm run validate:cross   (requires python + scipy on PATH)
 * Writes reports/cross-validation.{json,md}.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rhsDouble, energyDouble } from '../src/physics/double';
import { rhsTriple } from '../src/physics/triple';
import { energyTriple } from '../src/physics/energy';
import { rk4Step } from '../src/physics/integrators';

interface ScipySample {
  t: number;
  state: number[];
}

interface ScipyResult {
  method: string;
  scipyEnergyDrift: number;
  samples: ScipySample[];
}

interface CaseReport {
  name: string;
  system: 'double' | 'triple';
  state0: number[];
  tEnd: number;
  scipyMethod: string;
  scipyEnergyDrift: number;
  tsEnergyDrift: number;
  /** max over samples of ‖state_ts − state_scipy‖∞ */
  maxDivergence: number;
  divergenceAtEnd: number;
  perSample: Array<{ t: number; divergence: number }>;
  pass: boolean;
  bound: number;
}

interface SystemSpec {
  system: 'double' | 'triple';
  params: Record<string, number>;
  dim: number;
  rhs: (s: ArrayLike<number>, out: Float64Array) => void;
  energy: (s: ArrayLike<number>) => number;
}

const DOUBLE_PARAMS = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
// Deliberately asymmetric masses/lengths so any index-transposition bug in
// either derivation shows up as a divergence instead of cancelling.
const TRIPLE_PARAMS = { m1: 1.1, m2: 0.9, m3: 0.8, l1: 1.2, l2: 1, l3: 0.8, g: 9.81 };

const DOUBLE: SystemSpec = {
  system: 'double',
  params: DOUBLE_PARAMS,
  dim: 4,
  rhs: (s, out) => void rhsDouble(s, DOUBLE_PARAMS, 0, out),
  energy: (s) => energyDouble(s, DOUBLE_PARAMS).total
};

const TRIPLE: SystemSpec = {
  system: 'triple',
  params: TRIPLE_PARAMS,
  dim: 6,
  rhs: (s, out) => void rhsTriple(s, TRIPLE_PARAMS as Required<typeof TRIPLE_PARAMS>, 0, out),
  energy: (s) => energyTriple(s, TRIPLE_PARAMS).total
};

function runScipy(spec: SystemSpec, state0: number[], tEnd: number, sampleEvery: number): ScipyResult {
  const job = JSON.stringify({ system: spec.system, ...spec.params, state0, tEnd, sampleEvery });
  const proc = spawnSync('python', ['scripts/scipy_reference.py'], { input: job, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(`scipy reference failed: ${proc.stderr || proc.stdout}`);
  return JSON.parse(proc.stdout) as ScipyResult;
}

/** Integrate with the engine's own RHS via fine-dt RK4 and sample at the same times. */
function runTs(spec: SystemSpec, state0: number[], tEnd: number, sampleEvery: number): { samples: ScipySample[]; energyDrift: number } {
  const dt = 2e-5; // global error ~1e-13: matches the SciPy tolerance floor
  const stepsPerSample = Math.round(sampleEvery / dt);
  const state = new Float64Array(state0);
  const out = new Float64Array(spec.dim);
  const samples: ScipySample[] = [{ t: 0, state: [...state0] }];
  const total = Math.round(tEnd / sampleEvery);
  const e0 = spec.energy(state);
  for (let block = 1; block <= total; block += 1) {
    for (let s = 0; s < stepsPerSample; s += 1) {
      rk4Step(state, dt, spec.rhs, out);
      state.set(out);
    }
    samples.push({ t: block * sampleEvery, state: Array.from(state) });
  }
  return { samples, energyDrift: Math.abs(spec.energy(state) - e0) };
}

function compare(name: string, spec: SystemSpec, state0: number[], tEnd: number, sampleEvery: number, bound: number): CaseReport {
  const scipy = runScipy(spec, state0, tEnd, sampleEvery);
  const ts = runTs(spec, state0, tEnd, sampleEvery);
  const perSample = scipy.samples.map((sample, index) => {
    const mine = ts.samples[index];
    let div = Number.POSITIVE_INFINITY;
    if (mine && Math.abs(mine.t - sample.t) < 1e-9) {
      div = Math.max(...sample.state.map((v, k) => Math.abs(v - (mine.state[k] ?? Number.NaN))));
    }
    return { t: sample.t, divergence: div };
  });
  const maxDivergence = Math.max(...perSample.map((p) => p.divergence));
  const last = perSample[perSample.length - 1];
  return {
    name,
    system: spec.system,
    state0,
    tEnd,
    scipyMethod: scipy.method,
    scipyEnergyDrift: scipy.scipyEnergyDrift,
    tsEnergyDrift: ts.energyDrift,
    maxDivergence,
    divergenceAtEnd: last ? last.divergence : Number.NaN,
    perSample,
    pass: maxDivergence < bound,
    bound
  };
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toExponential(2) : 'n/a';
}

function markdown(cases: CaseReport[]): string {
  const lines = [
    '# External Cross-Validation — TypeScript engine vs SciPy DOP853',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'The SciPy reference re-derives the equations of motion independently (different',
    'language, different derivation route, different integrator family) and integrates',
    'with `solve_ivp` DOP853 at rtol = atol = 1e-13. The TypeScript engine integrates the',
    'same initial conditions with its own RHS via RK4 at dt = 2e-5. The double pendulum is',
    'compared against closed-form Lagrangian equations; the triple pendulum against the',
    'general N-chain mass-matrix formulation solved with `numpy.linalg.solve` (the engine',
    'uses a hand-expanded 3×3 Gaussian elimination — a different linear-solve path).',
    '',
    '| Case | System | Horizon | Max ‖Δ‖∞ | At end | Bound | Verdict | TS energy drift | SciPy energy drift |',
    '|---|---|---:|---:|---:|---:|:--:|---:|---:|'
  ];
  for (const c of cases) {
    lines.push(`| ${c.name} | ${c.system} | ${c.tEnd} s | ${fmt(c.maxDivergence)} | ${fmt(c.divergenceAtEnd)} | ${fmt(c.bound)} | ${c.pass ? 'PASS' : 'FAIL'} | ${fmt(c.tsEnergyDrift)} | ${fmt(c.scipyEnergyDrift)} |`);
  }
  lines.push(
    '',
    'For the chaotic cases the divergence grows like e^{λ₁ t} from the shared tolerance',
    'floor, so agreement is only asserted on the predictability horizon; the regular cases',
    'must agree essentially to the tolerance floor over the full window.',
    ''
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const probe = spawnSync('python', ['-c', 'import scipy'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    console.error('python + scipy not available — skipping external cross-validation');
    process.exitCode = 2;
    return;
  }
  const cases = [
    // Regular: small angles, quasi-periodic — both solvers must agree to ~1e-9 for 20 s.
    compare('regular small-angle', DOUBLE, [0.2, 0.1, 0, 0], 20, 0.5, 1e-8),
    // Chaotic: λ₁ ≈ 1.1 ⇒ 1e-13 · e^{1.1·10} ≈ 6e-9; bound 1e-5 leaves margin for
    // the RHS-derivation difference while still catching any real physics bug.
    compare('chaotic', DOUBLE, [2.0, 2.5, 0, 0], 10, 0.5, 1e-5),
    // Triple regular: small angles, quasi-periodic over the full 20 s window.
    compare('regular small-angle', TRIPLE, [0.15, 0.1, 0.05, 0, 0, 0], 20, 0.5, 1e-8),
    // Triple chaotic: the triple pendulum's λ₁ is larger than the double's, so the
    // asserted horizon is shorter (8 s) with the same tolerance-floor reasoning.
    compare('chaotic', TRIPLE, [2.6, 2.0, 1.4, 0, 0, 0], 8, 0.5, 1e-4)
  ];
  await mkdir('reports', { recursive: true });
  await writeFile('reports/cross-validation.json', JSON.stringify({ generatedAt: new Date().toISOString(), parameters: { double: DOUBLE_PARAMS, triple: TRIPLE_PARAMS }, cases }, null, 2), 'utf8');
  await writeFile('reports/cross-validation.md', markdown(cases), 'utf8');
  for (const c of cases) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.system} ${c.name}: max divergence ${fmt(c.maxDivergence)} (bound ${fmt(c.bound)}), end ${fmt(c.divergenceAtEnd)}`);
  }
  if (cases.some((c) => !c.pass)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
