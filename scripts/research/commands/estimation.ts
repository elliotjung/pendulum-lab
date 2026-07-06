import { fitDoublePendulum, type DoublePendulumParameterName } from '../../../src/research/parameterEstimation';
import { runLangevinEnsemble } from '../../../src/physics/stochastic';
import { rhsDouble } from '../../../src/physics/double';
import { createChainWorkspace, energyChain, rhsChain } from '../../../src/physics/nPendulum';
import { energyDriftProfile } from '../../../src/research/structurePreservation';
import type { StateVector } from '../../../src/physics/types';
import type { IntegratorId, PendulumParameters } from '../../../src/types/domain';
import { flagNum, flagState, syntheticDoubleAngles, type CommandHandler } from './shared';

const ESTIMABLE = new Set<DoublePendulumParameterName>(['m1', 'm2', 'l1', 'l2', 'g']);

export const runEstimationCommand: CommandHandler = ({ command, flags }, spec) => {
  switch (command) {
    case 'estimate': {
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
    case 'sde': {
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
        diffusion: [0, 0, sigma, sigma],
        dt,
        steps,
        realizations,
        seed,
        scheme,
        recordEvery: Math.max(1, Math.round(steps / 10))
      });
      return { params, gamma, sigma, scheme, realizations, dt, steps, times: result.times, mean: result.mean, variance: result.variance };
    }
    case 'drift': {
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
    default:
      return undefined;
  }
};
