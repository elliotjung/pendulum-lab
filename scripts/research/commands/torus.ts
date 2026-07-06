import {
  continueExpansionNSBranch,
  continueNeimarkSackerTorus,
  neimarkSackerSpectralConvergence,
  planarMapRotationNumber,
  scanModeLocking,
  sineCircleMap,
  torusLyapunovSpectrum
} from '../../../src/chaos';
import { delayedLogisticSystem, flagNum, type CommandHandler } from './shared';

export const runTorusCommand: CommandHandler = ({ command, flags }) => {
  switch (command) {
    case 'nstorus': {
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
      const a = flagNum(flags, 'a', 2.02);
      const center = (a - 1) / a;
      const result = torusLyapunovSpectrum(delayedLogisticSystem(), a, [center + 0.12, center], {
        iterations: Math.round(flagNum(flags, 'iters', 40000)),
        transient: Math.round(flagNum(flags, 'transient', 5000))
      });
      const rho = planarMapRotationNumber(delayedLogisticSystem(), a, [center, center], [center + 0.1, center], { iterations: 100000, transient: 5000 });
      return { a, rotationNumber: rho, ...result };
    }
    case 'nsconv':
      return neimarkSackerSpectralConvergence(delayedLogisticSystem(), flagNum(flags, 'a', 2.02), {
        initialAmplitude: flagNum(flags, 'amplitude', 0.18),
        tolerance: 1e-12,
        maxIterations: 60,
        floor: 1e-8
      });
    case 'nsbranch': {
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
      return undefined;
  }
};
