/**
 * Headless research CLI. Runs the same pure chaos jobs the app's worker runs
 * (`runChaosJob`) plus the periodic-orbit/continuation library — no browser, no
 * DOM — and prints JSON (or writes it with --out). Examples:
 *
 *   npx tsx scripts/research-cli.ts lyapunov --state 2,2.5,0,0
 *   npx tsx scripts/research-cli.ts spectrum --state 2,2.5,0,0 --steps 30000
 *   npx tsx scripts/research-cli.ts studypoint --state 2.5,2.5,0,0
 *   npx tsx scripts/research-cli.ts basin --n 100 --out reports/basin.json
 *   npx tsx scripts/research-cli.ts wada --n 150
 *   npx tsx scripts/research-cli.ts ftle --n 48 --horizon 5
 *   npx tsx scripts/research-cli.ts rqa --state 2.5,2.5,0,0
 *   npx tsx scripts/research-cli.ts zeroone --state 2.1,2.9,0,0
 *   npx tsx scripts/research-cli.ts orbit --amplitude 0.3 --frequency 0.6667 --damping 0.5
 *   npx tsx scripts/research-cli.ts continue --from 0.2 --to 1.2 --step 0.02
 *   npx tsx scripts/research-cli.ts pitchfork --damping 0.5 --frequency 0.6667
 *   npx tsx scripts/research-cli.ts estimate --estimate g,l2 --g 9.81 --l2 1 --guess 8,0.8
 *   npx tsx scripts/research-cli.ts sde --sigma 0.5 --scheme milstein --realizations 400
 *
 * Shared options: --m1 --m2 --l1 --l2 --g (double-pendulum parameters),
 * --state th1,th2,w1,w2 — defaults match the app's Lab defaults.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runChaosJob, type ChaosRequest } from '../src/workers/chaosProtocol';
import {
  doublePendulumFlipBasin,
  wadaCandidate,
  wadaResolutionConvergence,
  codimTwoDiagram,
  drivenPeriodicOrbit,
  drivenPeriodicOrbitN,
  continueDrivenPeriodicOrbit,
  switchPeriodDoubling,
  switchSymmetryBreaking,
  switchTranscriticalBranch,
  melnikovVerdict,
  melnikovCriticalAmplitude,
  continueNeimarkSackerTorus,
  continueExpansionNSBranch,
  sineCircleMap,
  scanModeLocking,
  planarMapRotationNumber,
  torusLyapunovSpectrum,
  neimarkSackerSpectralConvergence,
  type PlanarMapSystem
} from '../src/chaos';
import { runCliBatch, validateCliBatchSpec } from '../src/research/cliBatchSpec';
import {
  fitDoublePendulum,
  type DoublePendulumParameterName
} from '../src/research/parameterEstimation';
import { runLangevinEnsemble } from '../src/physics/stochastic';
import { rhsDouble } from '../src/physics/double';
import { rhsChain, energyChain, createChainWorkspace } from '../src/physics/nPendulum';
import { energyDriftProfile } from '../src/research/structurePreservation';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';
import type { IntegratorId, PendulumParameters } from '../src/types/domain';
import type { SystemSpec } from '../src/physics/systemSpec';

const ESTIMABLE = new Set<DoublePendulumParameterName>(['m1', 'm2', 'l1', 'l2', 'g']);

/** The delayed-logistic planar map (x, y) ↦ (a·x·(1 − y), x) — the textbook Neimark–Sacker example. */
function delayedLogisticSystem(): PlanarMapSystem {
  return {
    map: (s, a, out) => {
      out[0] = a * s[0]! * (1 - s[1]!);
      out[1] = s[0]!;
    },
    center: (a) => {
      const x = (a - 1) / a;
      return [x, x];
    }
  };
}

/**
 * Synthetic double-pendulum angle observations from a known parameter set —
 * integrates rhsDouble with RK4, sub-stepping each inter-sample span (the same
 * scheme `fitDoublePendulum` uses), so the inverse demo recovers the truth.
 */
function syntheticDoubleAngles(
  parameters: PendulumParameters,
  gamma: number,
  initialState: readonly number[],
  times: readonly number[],
  dt: number
): Array<[number, number]> {
  const state = Float64Array.from(initialState) as StateVector;
  const out = new Float64Array(4) as StateVector;
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDouble(s, parameters, gamma, o);
  };
  const angles: Array<[number, number]> = [];
  let t = 0;
  for (const target of times) {
    const span = target - t;
    if (span > 0) {
      const steps = Math.max(1, Math.ceil(span / dt - 1e-9));
      const h = span / steps;
      for (let k = 0; k < steps; k += 1) {
        rk4Step(state, h, rhs, out);
        state.set(out);
      }
      t = target;
    }
    angles.push([state[0]!, state[1]!]);
  }
  return angles;
}

interface CliArgs {
  command: string;
  flags: Map<string, string>;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] ?? '';
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, 'true');
    }
  }
  return { command, flags };
}

function flagNum(flags: Map<string, string>, key: string, fallback: number): number {
  const raw = flags.get(key);
  const value = raw === undefined ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function flagState(flags: Map<string, string>, fallback: number[]): number[] {
  const raw = flags.get('state');
  if (!raw) return fallback;
  const parts = raw.split(',').map((part) => Number.parseFloat(part.trim()));
  return parts.every(Number.isFinite) ? parts : fallback;
}

function doubleSpec(flags: Map<string, string>): Extract<SystemSpec, { kind: 'double' }> {
  return {
    kind: 'double',
    m1: flagNum(flags, 'm1', 1),
    m2: flagNum(flags, 'm2', 1),
    l1: flagNum(flags, 'l1', 1.2),
    l2: flagNum(flags, 'l2', 1),
    g: flagNum(flags, 'g', 9.81)
  };
}

function job(flags: Map<string, string>, request: ChaosRequest): unknown {
  const response = runChaosJob(request);
  if (!response.ok) throw new Error(response.error);
  // Drop bulky raster payloads unless --full is passed (they dwarf the metrics).
  if (!flags.has('full')) {
    const slim = { ...response } as Record<string, unknown>;
    for (const key of ['labels', 'values', 'plot', 'pPath', 'qPath', 'kValues', 'convergence']) {
      if (Array.isArray(slim[key])) slim[key] = `[${(slim[key] as unknown[]).length} values — rerun with --full]`;
    }
    return slim;
  }
  return response;
}

function run(args: CliArgs): unknown {
  const { command, flags } = args;
  const spec = doubleSpec(flags);
  const state0 = flagState(flags, [2, 2.5, 0, 0]);
  switch (command) {
    case 'lyapunov':
      return job(flags, {
        id: 'cli', kind: 'lyapunov', spec, state0,
        settings: { dt: flagNum(flags, 'dt', 0.01), steps: flagNum(flags, 'steps', 20000) }
      });
    case 'spectrum':
      return job(flags, {
        id: 'cli', kind: 'lyapunovSpectrum', spec, state0,
        settings: { dt: flagNum(flags, 'dt', 0.01), steps: flagNum(flags, 'steps', 20000) }
      });
    case 'zeroone':
      return job(flags, { id: 'cli', kind: 'zeroOne', spec, state0 });
    case 'rqa':
      return job(flags, { id: 'cli', kind: 'rqa', spec, state0 });
    case 'ftle':
      return job(flags, {
        id: 'cli', kind: 'ftle', spec,
        settings: { n: flagNum(flags, 'n', 32), totalTime: flagNum(flags, 'horizon', 5) }
      });
    case 'basin':
      return job(flags, { id: 'cli', kind: 'basin', spec, settings: { n: flagNum(flags, 'n', 100) } });
    case 'studypoint':
      return job(flags, {
        id: 'cli', kind: 'studyPoint', spec, state0,
        settings: { ftleHorizon: flagNum(flags, 'horizon', 5) }
      });
    case 'wada': {
      // Standalone Wada refinement: report the fraction at several radii so
      // resolution-dependence is visible (candidacy needs it stable near 1).
      const n = flagNum(flags, 'n', 120);
      const grid = doublePendulumFlipBasin(
        { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        { n, maxTime: flagNum(flags, 'maxTime', 12) }
      );
      const radii = [1, 2, 3, 5];
      return {
        n,
        results: radii.map((radius) => {
          const r = wadaCandidate(grid, radius);
          return { radius, wadaFraction: r.wadaFraction, boundaryCells: r.boundaryCells, numColors: r.numColors, wadaCandidate: r.wadaCandidate };
        })
      };
    }
    case 'wadaconv': {
      // Multi-resolution Wada convergence: fraction curve, adjacent deltas,
      // stable/unstable verdict, grid hashes, caveat, reproducibility hash.
      const raw = flags.get('resolutions');
      const resolutions = raw
        ? raw.split(',').map((part) => Number.parseInt(part.trim(), 10)).filter(Number.isFinite)
        : [40, 60, 90];
      return wadaResolutionConvergence(
        { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        {
          resolutions,
          maxTime: flagNum(flags, 'maxTime', 15),
          dt: flagNum(flags, 'dt', 0.01),
          radius: flagNum(flags, 'radius', 2),
          threshold: flagNum(flags, 'threshold', 0.95),
          convergenceTolerance: flagNum(flags, 'tolerance', 0.05)
        }
      );
    }
    case 'codim2': {
      const base = {
        kind: 'driven' as const,
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'afrom', 0.2),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      return codimTwoDiagram(
        (amplitude, damping) => ({ ...base, driveAmplitude: amplitude, damping }),
        flagState(flags, [0.3, 0, 0]),
        'driveAmplitude',
        [flagNum(flags, 'afrom', 0.2), flagNum(flags, 'ato', 1.6)],
        'damping',
        [flagNum(flags, 'gfrom', 0.05), flagNum(flags, 'gto', 0.7)],
        { n: flagNum(flags, 'n', 12), steps: flagNum(flags, 'steps', 4000), dt: flagNum(flags, 'dt', 0.01) }
      );
    }
    case 'orbit': {
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 0.3),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const result = drivenPeriodicOrbit(base, [flagNum(flags, 'th0', 0), flagNum(flags, 'w0', 0)], {
        dt: flagNum(flags, 'dt', 0.005),
        tolerance: 1e-10
      });
      return { base, ...result };
    }
    case 'switch': {
      // Period-doubling branch switch. Defaults target the classic cascade:
      // γ=0.5, ω=2/3, A=1.07 (just past A_PD ≈ 1.066), oscillating branch.
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 1.07),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const p1 = drivenPeriodicOrbit(base, [flagNum(flags, 'th0', -0.29), flagNum(flags, 'w0', 1.97)], {
        dt: flagNum(flags, 'dt', 0.005),
        tolerance: 1e-10
      });
      if (!p1.converged) throw new Error('period-1 Newton did not converge — adjust --th0/--w0');
      const sw = switchPeriodDoubling(base, p1.orbit, { dt: flagNum(flags, 'dt', 0.005), tolerance: 1e-10 });
      return {
        base,
        period1: { orbit: p1.orbit, multipliers: p1.multipliers, stable: p1.stable },
        switched: sw.switched,
        criticalMultiplier: sw.criticalMultiplier,
        separation: sw.separation,
        period2: {
          orbit: sw.doubled.orbit,
          cycle: sw.doubled.cycle,
          multipliers: sw.doubled.multipliers,
          stable: sw.doubled.stable,
          residual: sw.doubled.residual
        }
      };
    }
    case 'melnikov': {
      // Analytic homoclinic-chaos threshold for the damped driven pendulum:
      // verdict at the given parameters plus the A_c(ω) curve for context.
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 1.15),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const wFrom = flagNum(flags, 'wfrom', 0.2);
      const wTo = flagNum(flags, 'wto', 2);
      const wSteps = Math.max(2, Math.round(flagNum(flags, 'wsteps', 19)));
      const curve = Array.from({ length: wSteps }, (_, i) => {
        const driveFrequency = wFrom + ((wTo - wFrom) * i) / (wSteps - 1);
        return { driveFrequency, criticalAmplitude: melnikovCriticalAmplitude({ ...base, driveFrequency }) };
      });
      return { base, verdict: melnikovVerdict(base), criticalCurve: curve };
    }
    case 'continue': {
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'from', 0.2),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      return continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: flagNum(flags, 'from', 0.2),
        end: flagNum(flags, 'to', 1.2),
        step: flagNum(flags, 'step', 0.02)
      });
    }
    case 'estimate': {
      // Inverse problem: treat --m1/--m2/--l1/--l2/--g as the *truth*, synthesise
      // an angle trajectory, then recover the --estimate subset from --guess.
      const truth: PendulumParameters = { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g };
      const gamma = flagNum(flags, 'damping', 0);
      const initialState = flagState(flags, [0.5, 0.3, 0, 0]);
      const dt = flagNum(flags, 'dt', 0.002);
      const horizon = flagNum(flags, 'horizon', 2);
      const samples = Math.max(2, Math.round(flagNum(flags, 'samples', 41)));
      const noise = flagNum(flags, 'noise', 0);

      const names = (flags.get('estimate') ?? 'g').split(',').map((s) => s.trim()) as DoublePendulumParameterName[];
      for (const n of names) if (!ESTIMABLE.has(n)) throw new Error(`unknown parameter "${n}" (estimable: m1,m2,l1,l2,g)`);
      const guessRaw = flags.get('guess');
      const initialGuess = guessRaw
        ? guessRaw.split(',').map((s) => Number.parseFloat(s.trim()))
        : names.map((n) => truth[n] * 0.8);
      if (initialGuess.length !== names.length) throw new Error('--guess must list one value per --estimate parameter');

      const times = Array.from({ length: samples }, (_, i) => (horizon * i) / (samples - 1));
      const clean = syntheticDoubleAngles(truth, gamma, initialState, times, dt);
      // Deterministic pseudo-noise (no RNG dependency) so the command is reproducible.
      const angles = noise > 0
        ? clean.map(([a, b], i): [number, number] => [a + noise * Math.sin(12.9898 * i), b + noise * Math.cos(78.233 * i)])
        : clean;

      const fit = fitDoublePendulum(
        { times, angles },
        { initialState: [initialState[0]!, initialState[1]!, initialState[2]!, initialState[3]!], base: truth, gamma, estimate: names, initialGuess, dt }
      );
      return {
        truth,
        estimate: names,
        initialGuess,
        noise,
        recovered: fit.estimated,
        standardErrors: Object.fromEntries(names.map((n, i) => [n, fit.standardErrors[i]!])),
        rmse: fit.rmse,
        residualVariance: fit.residualVariance,
        degreesOfFreedom: fit.degreesOfFreedom,
        iterations: fit.iterations,
        converged: fit.converged,
        status: fit.status
      };
    }
    case 'pitchfork': {
      // Symmetry-breaking (+1) branch switch of the driven pendulum. Locates the
      // crossing by continuation (unless --amplitude pins A) then follows the two
      // mirror-image asymmetric orbits.
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'from', 0.7),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const dt = flagNum(flags, 'dt', 0.004);
      let amplitude: number;
      let symGuess: [number, number];
      let bifurcationType: string | null = null;
      if (flags.has('amplitude')) {
        amplitude = flagNum(flags, 'amplitude', 1.005);
        symGuess = [flagNum(flags, 'th0', 0), flagNum(flags, 'w0', 0)];
      } else {
        const cont = continueDrivenPeriodicOrbit(base, {
          parameter: 'driveAmplitude',
          start: flagNum(flags, 'from', 0.7),
          end: flagNum(flags, 'to', 1.06),
          step: flagNum(flags, 'step', 0.005),
          dt,
          tolerance: 1e-11
        });
        if (!cont.bifurcation) throw new Error('no bifurcation found in [from,to] — widen the range');
        bifurcationType = cont.bifurcation.type;
        amplitude = cont.bifurcation.parameter;
        const lastStable = cont.branch.filter((p) => p.parameter < amplitude).pop();
        symGuess = lastStable ? lastStable.orbit : [0, 0];
      }
      const params = { ...base, driveAmplitude: amplitude };
      const sym = drivenPeriodicOrbitN(params, symGuess, 1, { dt, tolerance: 1e-11 });
      const result = switchSymmetryBreaking(params, sym.orbit, { dt, tolerance: 1e-11 });
      return {
        params,
        bifurcationType,
        symmetric: { orbit: sym.orbit, stable: sym.stable, maxModulus: sym.maxModulus },
        switched: result.switched,
        criticalMultiplier: result.criticalMultiplier,
        eigenvector: result.eigenvector,
        midpoint: result.midpoint,
        pitchforkResidual: result.pitchforkResidual,
        separation: result.separation,
        branches: result.branches.map((b) => ({ orbit: b.orbit, stable: b.stable, maxModulus: b.maxModulus, residual: b.residual }))
      };
    }
    case 'sde': {
      // Langevin ensemble of the double pendulum with additive angular-velocity
      // noise (a stochastic torque). Reports mean/variance over the ensemble.
      const params: PendulumParameters = { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g };
      const gamma = flagNum(flags, 'damping', 0.2);
      const sigma = flagNum(flags, 'sigma', 0.5);
      const dt = flagNum(flags, 'dt', 0.005);
      const steps = Math.max(1, Math.round(flagNum(flags, 'steps', 2000)));
      const realizations = Math.max(2, Math.round(flagNum(flags, 'realizations', 400)));
      const seed = flagNum(flags, 'seed', 1);
      const scheme = flags.get('scheme') === 'milstein' ? 'milstein' : 'euler-maruyama';
      const initialState = flagState(flags, [0.5, 0.3, 0, 0]);
      const result = runLangevinEnsemble({
        drift: (s, o) => {
          rhsDouble(s, params, gamma, o);
        },
        initialState,
        diffusion: [0, 0, sigma, sigma], // noise on (ω₁, ω₂)
        dt,
        steps,
        realizations,
        seed,
        scheme,
        recordEvery: Math.max(1, Math.round(steps / 10))
      });
      return { params, gamma, sigma, scheme, realizations, dt, steps, times: result.times, mean: result.mean, variance: result.variance };
    }
    case 'transcritical': {
      // Transcritical (+1) branch switch on the normal form r(x, λ) = λx − x²:
      // branches x = 0 and x = λ exchange stability at λ = 0. Seeded along the
      // x = λ branch tangent and rejected if it falls back onto x = 0.
      const step = flagNum(flags, 'step', 0.2);
      const result = switchTranscriticalBranch(
        { dimension: 1, residual: (state, parameter, out) => { out[0] = parameter * state[0]! - state[0]! * state[0]!; } },
        { state: [0], parameter: 0 },
        { parameterStep: step, branchTangent: [1], referenceBranch: () => [0] }
      );
      return {
        normalForm: 'r(x,λ) = λx − x²; branches x=0 and x=λ cross transcritically at λ=0',
        targetParameter: result.targetParameter,
        seed: result.seed,
        switchedState: result.state,
        expected: step,
        switched: result.switched,
        residual: result.residual,
        separation: result.separation,
        method: result.method
      };
    }
    case 'nstorus': {
      // Neimark–Sacker invariant-circle continuation on the delayed-logistic map
      // x_{n+1} = a x_n (1 − x_{n−1}) — the textbook NS example (onset a=2, ρ→1/6).
      const sys = delayedLogisticSystem();
      const cont = continueNeimarkSackerTorus(sys, {
        start: flagNum(flags, 'from', 2.05),
        end: flagNum(flags, 'to', 2.01),
        step: flagNum(flags, 'step', 0.01),
        initialAmplitude: flagNum(flags, 'amplitude', 0.24),
        collocation: Math.max(9, Math.round(flagNum(flags, 'collocation', 31))),
        tolerance: 1e-10,
        maxIterations: 40
      });
      const full = flags.has('full');
      return {
        system: 'delayed-logistic',
        collocation: cont.collocation,
        method: cont.method,
        points: cont.points.map((p) => ({
          parameter: p.parameter,
          rotationNumber: p.rotationNumber,
          amplitude: p.amplitude,
          invarianceResidual: p.invarianceResidual,
          center: p.center,
          converged: p.converged,
          ...(full ? { curve: Array.from(p.curve) } : {})
        }))
      };
    }
    case 'arnold': {
      // Arnold tongues of the sine circle map θ ↦ θ + Ω − (K/2π)sin(2πθ): mode-locked
      // plateaus where ρ(Ω) pins to a rational (the devil's staircase steps).
      const couplingK = flagNum(flags, 'k', 1);
      const scan = scanModeLocking((omega) => sineCircleMap(omega, couplingK), {
        start: flagNum(flags, 'from', 0),
        end: flagNum(flags, 'to', 1),
        steps: Math.max(1, Math.round(flagNum(flags, 'steps', 200))),
        rationals: [[0, 1], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [1, 1]],
        tolerance: flagNum(flags, 'tol', 1e-4),
        rotationOptions: { iterations: Math.round(flagNum(flags, 'iters', 60000)), transient: 2000 }
      });
      return {
        couplingK,
        monotone: scan.monotone,
        maxDecrease: scan.maxDecrease,
        tongues: scan.tongues,
        method: scan.method,
        ...(flags.has('full') ? { samples: scan.samples } : {})
      };
    }
    case 'toruslyap': {
      // Lyapunov spectrum on the NS invariant circle (delayed-logistic): a
      // quasi-periodic torus has a neutral (≈0) largest exponent — a self-consistency gate.
      const a = flagNum(flags, 'a', 2.02);
      const center = (a - 1) / a;
      const result = torusLyapunovSpectrum(delayedLogisticSystem(), a, [center + 0.12, center], {
        iterations: Math.round(flagNum(flags, 'iters', 40000)),
        transient: Math.round(flagNum(flags, 'transient', 5000))
      });
      const rho = planarMapRotationNumber(delayedLogisticSystem(), a, [center, center], [center + 0.1, center], { iterations: 100000, transient: 5000 });
      return { a, rotationNumber: rho, ...result };
    }
    case 'nsconv': {
      // Spectral-convergence gate: NS truncation error vs collocation count M.
      const result = neimarkSackerSpectralConvergence(delayedLogisticSystem(), flagNum(flags, 'a', 2.02), {
        initialAmplitude: flagNum(flags, 'amplitude', 0.18),
        tolerance: 1e-12,
        maxIterations: 60,
        floor: 1e-8
      });
      return result;
    }
    case 'drift': {
      // Structure preservation: long-run energy drift of the planar double pendulum,
      // comparing a non-symmetric (rk4) and a time-symmetric (gauss2/hmidpoint) integrator.
      const chainParams = { masses: [spec.m1, spec.m2], lengths: [spec.l1, spec.l2], g: spec.g };
      const ws = createChainWorkspace(2);
      const rhs = (s: StateVector, o: StateVector): void => {
        rhsChain(s, chainParams, 0, o, ws);
      };
      const energy = (s: StateVector): number => energyChain(s, chainParams).total;
      const initialState = flagState(flags, [0.9, 1.3, 0, 0]);
      const dt = flagNum(flags, 'dt', 0.02);
      const totalTime = flagNum(flags, 'time', 2000);
      const samples = Math.max(3, Math.round(flagNum(flags, 'samples', 8)));
      const methods = (flags.get('methods') ?? 'rk4,gauss2,hmidpoint').split(',') as IntegratorId[];
      const profiles = methods.map((method) => energyDriftProfile({ method, rhs, energy, initialState, dt, totalTime, samples }));
      return { chainParams, dt, totalTime, initialState, profiles };
    }
    case 'nsbranch': {
      // Continue the NS invariant circle of the driven pendulum's stroboscopic
      // map across the drive amplitude axis.
      // Example: npx tsx scripts/research-cli.ts nsbranch --damping 0.5 --frequency 0.6667 --from 1.05 --to 1.12 --step 0.005 --amp 0.05
      const drivenParams = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'length', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'from', 1.05),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const stepsPerPeriod = Math.max(64, Math.round(flagNum(flags, 'steps', 256)));
      const cont = continueExpansionNSBranch(drivenParams, {
        start: flagNum(flags, 'from', 1.05),
        end: flagNum(flags, 'to', 1.12),
        step: flagNum(flags, 'step', 0.005),
        initialAmplitude: flagNum(flags, 'amp', 0.05),
        collocation: Math.max(9, Math.round(flagNum(flags, 'collocation', 31))),
        tolerance: 1e-10,
        maxIterations: 40,
        stepsPerPeriod
      });
      const full = flags.has('full');
      return {
        system: 'driven-pendulum-stroboscopic',
        drivenParams,
        stepsPerPeriod,
        collocation: cont.collocation,
        method: cont.method,
        caveat: cont.caveat,
        points: cont.points.map((p) => ({
          amplitude: p.parameter,
          rotationNumber: p.rotationNumber,
          torusAmplitude: p.amplitude,
          invarianceResidual: p.invarianceResidual,
          center: p.center,
          converged: p.converged,
          ...(full ? { curve: Array.from(p.curve) } : {})
        }))
      };
    }
    default:
      return {
        usage: 'npx tsx scripts/research-cli.ts <command> [--flags]',
        commands: ['lyapunov', 'spectrum', 'zeroone', 'rqa', 'ftle', 'basin', 'wada', 'wadaconv', 'codim2', 'studypoint', 'orbit', 'continue', 'switch', 'pitchfork', 'transcritical', 'melnikov', 'estimate', 'sde', 'nstorus', 'nsbranch', 'arnold', 'toruslyap', 'nsconv', 'drift', 'batch'],
        sharedFlags: ['--m1 --m2 --l1 --l2 --g', '--state th1,th2,w1,w2', '--out file.json', '--full (keep raster arrays)'],
        examples: [
          'npx tsx scripts/research-cli.ts lyapunov --state 2,2.5,0,0',
          'npx tsx scripts/research-cli.ts wadaconv --resolutions 40,60,90 --maxTime 15',
          'npx tsx scripts/research-cli.ts codim2 --n 12 --afrom 0.2 --ato 1.6',
          'npx tsx scripts/research-cli.ts estimate --estimate g,l2 --g 9.81 --l2 1',
          'npx tsx scripts/research-cli.ts pitchfork --damping 0.5 --frequency 0.6667',
          'npx tsx scripts/research-cli.ts sde --sigma 0.5 --scheme milstein --realizations 400',
          'npx tsx scripts/research-cli.ts batch --spec study-spec.json --out results.json',
          'npx tsx scripts/research-cli.ts nsbranch --damping 0.5 --frequency 0.6667 --from 1.05 --to 1.12 --step 0.005 --amp 0.05'
        ]
      };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let result: unknown;
  if (args.command === 'batch') {
    // JSON-spec batch: one committed file reproducibly drives a whole study.
    const specPath = args.flags.get('spec');
    if (!specPath) throw new Error('batch requires --spec <file.json>');
    const parsed = JSON.parse(await readFile(specPath, 'utf8')) as unknown;
    const validation = validateCliBatchSpec(parsed);
    if (!validation.ok || !validation.spec) throw new Error(`invalid batch spec: ${validation.problems.join('; ')}`);
    result = runCliBatch(validation.spec);
  } else {
    result = run(args);
  }
  const payload = {
    schemaVersion: 'pendulum-research-cli/v1',
    command: args.command,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    result
  };
  const out = args.flags.get('out');
  const text = JSON.stringify(payload, null, 2);
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text, 'utf8');
    console.log(`wrote ${out} (${args.command}, ${payload.elapsedMs} ms)`);
  } else {
    console.log(text);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
