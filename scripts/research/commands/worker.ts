import {
  doublePendulumFlipBasin,
  wadaCandidate,
  wadaResolutionConvergence
} from '../../../src/chaos';
import { flagNum, job, type CommandHandler } from './shared';

export const runWorkerCommand: CommandHandler = ({ command, flags }, spec, state0) => {
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
    default:
      return undefined;
  }
};
