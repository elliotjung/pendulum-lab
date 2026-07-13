/**
 * Symbolic cross-validation: the TypeScript engine's equations of motion vs a
 * SymPy derivation (scripts/sympy_reference.py) that builds each Lagrangian
 * symbolically and produces the Euler–Lagrange equations by *symbolic
 * differentiation alone* — no integrator, no shared algebra with the engine.
 *
 * This is sharper than a trajectory comparison: the RHS of both
 * implementations is evaluated at the same randomly sampled states and
 * compared component-wise, so there is no tolerance floor from an ODE solver —
 * any disagreement is a derivation bug, not accumulated integration error.
 *
 * Systems covered: planar double, planar triple, spherical double (3D, 4 DOF)
 * and spherical triple (3D, 6 DOF). All conservative (γ = 0): the symbolic
 * Euler–Lagrange derivation is for the conservative dynamics, and the engines'
 * damping conventions differ by design (documented in sphericalChain.ts).
 *
 * Run: npm run validate:sympy   (requires python + sympy + numpy on PATH)
 * Writes reports/sympy-validation.{json,md}.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rhsDouble } from '../src/physics/double';
import { rhsTriple } from '../src/physics/triple';
import { rhsSphericalChain, type SphericalChainParams } from '../src/physics/sphericalChain';

interface SystemCase {
  system: 'double' | 'triple' | 'sphericalDouble' | 'sphericalTriple';
  description: string;
  params: Record<string, number>;
  /** Engine state layout dimension. */
  dim: number;
  /** Number of generalized coordinates (accelerations compared). */
  dof: number;
  sampleState: (rand: () => number) => number[];
  engineAccelerations: (state: number[]) => number[];
}

/** Deterministic LCG so the sampled states are reproducible across runs. */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const uniform = (rand: () => number, lo: number, hi: number) => lo + (hi - lo) * rand();
/** Polar angle sample away from the spherical-chart poles (|sinθ| ≥ ~0.3). */
const polarAngle = (rand: () => number) => (rand() < 0.5 ? -1 : 1) * uniform(rand, 0.35, 2.75);

// Deliberately asymmetric parameters so index-transposition bugs cannot cancel
// (same convention as the SciPy cross-validation).
const DOUBLE_PARAMS = { m1: 1.1, m2: 0.9, l1: 1.2, l2: 1.0, g: 9.81 };
const TRIPLE_PARAMS = { m1: 1.1, m2: 0.9, m3: 0.8, l1: 1.2, l2: 1.0, l3: 0.8, g: 9.81 };
const SPHERICAL_DOUBLE: SphericalChainParams = { masses: [1.1, 0.9], lengths: [1.2, 1.0], g: 9.81, damping: 0 };
const SPHERICAL_TRIPLE: SphericalChainParams = {
  masses: [1.1, 0.9, 0.8],
  lengths: [1.2, 1.0, 0.8],
  g: 9.81,
  damping: 0
};

const CASES: SystemCase[] = [
  {
    system: 'double',
    description: 'planar double pendulum — hand-derived closed form (rhsDouble) vs SymPy Euler–Lagrange',
    params: DOUBLE_PARAMS,
    dim: 4,
    dof: 2,
    sampleState: (rand) => [
      uniform(rand, -2.8, 2.8),
      uniform(rand, -2.8, 2.8),
      uniform(rand, -2.5, 2.5),
      uniform(rand, -2.5, 2.5)
    ],
    engineAccelerations: (state) => {
      const out = new Float64Array(4);
      rhsDouble(state, DOUBLE_PARAMS, 0, out);
      return [out[2] ?? 0, out[3] ?? 0];
    }
  },
  {
    system: 'triple',
    description: 'planar triple pendulum — hand-expanded 3×3 elimination (rhsTriple) vs SymPy Euler–Lagrange',
    params: TRIPLE_PARAMS,
    dim: 6,
    dof: 3,
    sampleState: (rand) => [
      uniform(rand, -2.8, 2.8),
      uniform(rand, -2.8, 2.8),
      uniform(rand, -2.8, 2.8),
      uniform(rand, -2.0, 2.0),
      uniform(rand, -2.0, 2.0),
      uniform(rand, -2.0, 2.0)
    ],
    engineAccelerations: (state) => {
      const out = new Float64Array(6);
      rhsTriple(state, TRIPLE_PARAMS, 0, out);
      return [out[3] ?? 0, out[4] ?? 0, out[5] ?? 0];
    }
  },
  {
    system: 'sphericalDouble',
    description: 'spherical double pendulum (3D, 4 DOF) — manipulator-form rhsSphericalChain vs SymPy Euler–Lagrange',
    params: { m1: 1.1, m2: 0.9, l1: 1.2, l2: 1.0, g: 9.81 },
    dim: 8,
    dof: 4,
    sampleState: (rand) => [
      polarAngle(rand),
      uniform(rand, -3.1, 3.1),
      polarAngle(rand),
      uniform(rand, -3.1, 3.1),
      uniform(rand, -2.0, 2.0),
      uniform(rand, -2.0, 2.0),
      uniform(rand, -2.0, 2.0),
      uniform(rand, -2.0, 2.0)
    ],
    engineAccelerations: (state) => {
      const out = new Float64Array(8);
      rhsSphericalChain(state, SPHERICAL_DOUBLE, out);
      return [out[4] ?? 0, out[5] ?? 0, out[6] ?? 0, out[7] ?? 0];
    }
  },
  {
    system: 'sphericalTriple',
    description: 'spherical triple pendulum (3D, 6 DOF) — manipulator-form rhsSphericalChain vs SymPy Euler–Lagrange',
    params: { m1: 1.1, m2: 0.9, m3: 0.8, l1: 1.2, l2: 1.0, l3: 0.8, g: 9.81 },
    dim: 12,
    dof: 6,
    sampleState: (rand) => {
      const state: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        state.push(polarAngle(rand), uniform(rand, -3.1, 3.1));
      }
      for (let i = 0; i < 6; i += 1) state.push(uniform(rand, -1.5, 1.5));
      return state;
    },
    engineAccelerations: (state) => {
      const out = new Float64Array(12);
      rhsSphericalChain(state, SPHERICAL_TRIPLE, out);
      return [out[6] ?? 0, out[7] ?? 0, out[8] ?? 0, out[9] ?? 0, out[10] ?? 0, out[11] ?? 0];
    }
  }
];

const SAMPLES_PER_SYSTEM = 40;
/** Mixed abs/rel tolerance: two float64 evaluations of different expression trees. */
const TOLERANCE = 1e-8;

interface CaseReport {
  system: string;
  description: string;
  samples: number;
  maxAbsDiff: number;
  maxRelDiff: number;
  worstComponent: { stateIndex: number; component: number; engine: number; sympy: number };
  pass: boolean;
}

async function main(): Promise<void> {
  const probe = spawnSync('python', ['-c', 'import sympy, numpy'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    console.error('python + sympy not available — skipping symbolic cross-validation');
    return;
  }

  const reports: CaseReport[] = [];
  for (const systemCase of CASES) {
    const rand = makeRand(0x5eed + systemCase.dim);
    const states = Array.from({ length: SAMPLES_PER_SYSTEM }, () => systemCase.sampleState(rand));
    const job = JSON.stringify({ system: systemCase.system, params: systemCase.params, states });
    const proc = spawnSync('python', ['scripts/sympy_reference.py'], {
      input: job,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    if (proc.status !== 0) {
      throw new Error(`sympy reference failed for ${systemCase.system}: ${proc.stderr}`);
    }
    const result = JSON.parse(proc.stdout) as { accelerations: number[][] };

    let maxAbsDiff = 0;
    let maxRelDiff = 0;
    let worst = { stateIndex: -1, component: -1, engine: 0, sympy: 0 };
    let pass = true;
    states.forEach((state, idx) => {
      const engine = systemCase.engineAccelerations(state);
      const sympy = result.accelerations[idx] ?? [];
      for (let c = 0; c < systemCase.dof; c += 1) {
        const e = engine[c] ?? 0;
        const s = sympy[c] ?? Number.NaN;
        const absDiff = Math.abs(e - s);
        const relDiff = absDiff / Math.max(1, Math.abs(e));
        if (absDiff > maxAbsDiff) {
          maxAbsDiff = absDiff;
          worst = { stateIndex: idx, component: c, engine: e, sympy: s };
        }
        maxRelDiff = Math.max(maxRelDiff, relDiff);
        if (!(relDiff <= TOLERANCE)) pass = false;
      }
    });

    reports.push({
      system: systemCase.system,
      description: systemCase.description,
      samples: SAMPLES_PER_SYSTEM,
      maxAbsDiff,
      maxRelDiff,
      worstComponent: worst,
      pass
    });
    console.log(
      `${systemCase.system}: max |Δa| = ${maxAbsDiff.toExponential(2)}, max rel = ${maxRelDiff.toExponential(2)} ` +
        `over ${SAMPLES_PER_SYSTEM} random states → ${pass ? 'PASS' : 'FAIL'}`
    );
  }

  const allPass = reports.every((r) => r.pass);
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/sympy-validation.json',
    JSON.stringify({ generated: new Date().toISOString(), tolerance: TOLERANCE, allPass, reports }, null, 2)
  );

  const md = [
    '# SymPy Symbolic Cross-Validation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'The engine right-hand sides are compared **component-wise at randomly sampled states**',
    'against equations of motion that SymPy derives independently: each Lagrangian is written',
    'symbolically and the Euler–Lagrange equations come from symbolic differentiation',
    '(`scripts/sympy_reference.py`). Unlike a trajectory comparison there is no integrator',
    'tolerance floor — any disagreement is a derivation bug. All systems conservative (γ = 0).',
    '',
    `Mixed tolerance: |Δa| ≤ ${TOLERANCE.toExponential(0)} · max(1, |a|) per component.`,
    '',
    '| System | Samples | max \\|Δa\\| | max rel | Verdict |',
    '|---|---|---|---|---|',
    ...reports.map(
      (r) =>
        `| ${r.description} | ${r.samples} | ${r.maxAbsDiff.toExponential(2)} | ${r.maxRelDiff.toExponential(2)} | ${
          r.pass ? 'PASS' : '**FAIL**'
        } |`
    ),
    '',
    allPass
      ? 'All engine derivations agree with the independent symbolic reference to float64 round-off.'
      : 'DISAGREEMENT FOUND — see sympy-validation.json for the worst components.',
    ''
  ].join('\n');
  await writeFile('reports/sympy-validation.md', md);

  if (!allPass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
