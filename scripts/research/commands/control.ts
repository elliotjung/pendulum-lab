import { galiIndicator } from '../../../src/chaos/gali';
import { jacobianDouble, rhsDouble } from '../../../src/physics/double';
import {
  createHybridSwingUpController,
  designChainUprightLqr,
  designUprightLqr,
  ilqrSolve,
  makeDoubleSwingUpProblem,
  simulateHybridSwingUp,
  wrapAngle,
  type ActuationMode
} from '../../../src/control';
import type { StateVector } from '../../../src/physics/types';
import type { PendulumParameters } from '../../../src/types/domain';
import { flagNum, flagState, type CommandHandler } from './shared';

export const runControlCommand: CommandHandler = ({ command, flags }, spec, state0) => {
  switch (command) {
    case 'gali': {
      const params: PendulumParameters = { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g };
      const gamma = flagNum(flags, 'damping', 0);
      const k = Math.max(2, Math.round(flagNum(flags, 'k', 2)));
      const rhs = (s: StateVector, o: StateVector): void => {
        rhsDouble(s, params, gamma, o);
      };
      const jac = (s: StateVector, j: Float64Array): void => {
        jacobianDouble(s, params, gamma, j);
      };
      const result = galiIndicator(Float64Array.from(state0), rhs, k, {
        dt: flagNum(flags, 'dt', 0.01),
        steps: Math.round(flagNum(flags, 'steps', 10000)),
        transientSteps: Math.round(flagNum(flags, 'transient', 1000))
      }, jac);
      return {
        params, gamma, k,
        finalGali: result.finalGali,
        collapsed: result.collapsed,
        verdict: result.collapsed || result.finalGali < 1e-8 ? 'chaotic (aligned)' : 'regular / undecided at this horizon',
        ...(flags.has('full') ? { series: result.series } : { series: `[${result.series.length} samples; rerun with --full]` })
      };
    }
    case 'lqr': {
      const mode = (flags.get('mode') ?? 'full') as ActuationMode;
      const design = designUprightLqr({
        parameters: { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        gamma: flagNum(flags, 'damping', 0),
        dt: flagNum(flags, 'dt', 0.005),
        mode
      });
      return {
        mode,
        dt: design.dt,
        gain: design.riccati.K,
        costToGoDiagonal: design.riccati.P.map((row, i) => row[i]),
        riccati: { iterations: design.riccati.iterations, converged: design.riccati.converged, residual: design.riccati.residual },
        closedLoopModuli: design.closedLoopEigenvalues.map((z) => Math.hypot(z.re, z.im)),
        spectralRadius: design.spectralRadius,
        stabilising: design.stabilising
      };
    }
    case 'chainlqr': {
      const n = Math.max(2, Math.round(flagNum(flags, 'n', 3)));
      const masses = (flags.get('masses') ?? '').split(',').map(Number).filter(Number.isFinite);
      const lengths = (flags.get('lengths') ?? '').split(',').map(Number).filter(Number.isFinite);
      const design = designChainUprightLqr({
        parameters: {
          masses: masses.length === n ? masses : new Array<number>(n).fill(1),
          lengths: lengths.length === n ? lengths : new Array<number>(n).fill(1),
          g: flagNum(flags, 'g', 9.81)
        },
        gamma: flagNum(flags, 'damping', 0),
        dt: flagNum(flags, 'dt', 0.005)
      });
      return {
        links: n,
        dt: design.dt,
        spectralRadius: design.spectralRadius,
        stabilising: design.stabilising,
        riccati: { iterations: design.riccati.iterations, converged: design.riccati.converged },
        ...(flags.has('full') ? { gain: design.riccati.K } : { gain: `[${n}x${2 * n}; rerun with --full]` })
      };
    }
    case 'swingup': {
      const controlSpec = {
        parameters: { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        gamma: flagNum(flags, 'damping', 0),
        dt: flagNum(flags, 'dt', 0.005),
        mode: 'full' as const
      };
      const controller = createHybridSwingUpController(controlSpec, {
        ke: flagNum(flags, 'ke', 1.2),
        torqueLimit: flagNum(flags, 'torque', 30)
      });
      const sim = simulateHybridSwingUp(controller, controlSpec, flagState(flags, [0.1, 0, 0, 0]), {
        dt: controlSpec.dt,
        steps: Math.round(flagNum(flags, 'steps', 20000))
      });
      const f = sim.finalState;
      return {
        captureLevel: controller.captureLevel,
        captureTime: sim.captureTime,
        finalPhase: sim.finalPhase,
        finalDeviation: {
          theta1: wrapAngle(f[0]! - Math.PI),
          theta2: wrapAngle(f[1]! - Math.PI),
          omega1: f[2],
          omega2: f[3]
        },
        ...(flags.has('full') ? { samples: sim.samples } : { samples: `[${sim.samples.length} rows; rerun with --full]` })
      };
    }
    case 'ilqr': {
      const mode = (flags.get('mode') ?? 'full') as ActuationMode;
      const problem = makeDoubleSwingUpProblem({
        parameters: { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        gamma: flagNum(flags, 'damping', 0),
        dt: flagNum(flags, 'dt', 0.025),
        horizon: Math.round(flagNum(flags, 'horizon', 120)),
        mode,
        ...(flags.has('torque') ? { torqueLimit: flagNum(flags, 'torque', 8) } : {})
      });
      const result = ilqrSolve(problem, { maxIterations: Math.round(flagNum(flags, 'iters', 300)) });
      const xN = result.xs[result.xs.length - 1]!;
      return {
        mode,
        horizon: problem.horizon,
        dt: flagNum(flags, 'dt', 0.025),
        cost: result.cost,
        iterations: result.iterations,
        converged: result.converged,
        gradientNorm: result.gradientNorm,
        finalState: Array.from(xN),
        goal: problem.goal,
        ...(flags.has('full')
          ? { costHistory: result.costHistory, controls: result.us.map((u) => Array.from(u)) }
          : { costHistory: `[${result.costHistory.length} accepted steps; rerun with --full]` })
      };
    }
    default:
      return undefined;
  }
};
