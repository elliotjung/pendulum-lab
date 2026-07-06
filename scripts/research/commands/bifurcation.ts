import {
  codimTwoDiagram,
  continueDrivenPeriodicOrbit,
  drivenPeriodicOrbit,
  drivenPeriodicOrbitN,
  melnikovCriticalAmplitude,
  melnikovVerdict,
  switchPeriodDoubling,
  switchSymmetryBreaking,
  switchTranscriticalBranch
} from '../../../src/chaos';
import { flagNum, flagState, type CommandHandler } from './shared';

export const runBifurcationCommand: CommandHandler = ({ command, flags }, spec) => {
  switch (command) {
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
      if (!p1.converged) throw new Error('period-1 Newton did not converge; adjust --th0/--w0');
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
    case 'pitchfork': {
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
        if (!cont.bifurcation) throw new Error('no bifurcation found in [from,to]; widen the range');
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
    case 'transcritical': {
      const step = flagNum(flags, 'step', 0.2);
      const result = switchTranscriticalBranch(
        { dimension: 1, residual: (state, parameter, out) => { out[0] = parameter * state[0]! - state[0]! * state[0]!; } },
        { state: [0], parameter: 0 },
        { parameterStep: step, branchTangent: [1], referenceBranch: () => [0] }
      );
      return {
        normalForm: 'r(x, mu) = mu*x - x^2; branches x=0 and x=mu cross transcritically at mu=0',
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
    default:
      return undefined;
  }
};
