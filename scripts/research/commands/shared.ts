import { runChaosJob, type ChaosRequest } from '../../../src/workers/chaosProtocol';
import { rk4Step } from '../../../src/physics/integrators';
import { rhsDouble } from '../../../src/physics/double';
import type { PlanarMapSystem } from '../../../src/chaos';
import type { StateVector } from '../../../src/physics/types';
import type { PendulumParameters } from '../../../src/types/domain';
import type { SystemSpec } from '../../../src/physics/systemSpec';

export interface CliArgs {
  command: string;
  flags: Map<string, string>;
}

export type DoubleCliSpec = Extract<SystemSpec, { kind: 'double' }>;
export type CommandHandler = (args: CliArgs, spec: DoubleCliSpec, state0: number[]) => unknown | undefined;

export function flagNum(flags: Map<string, string>, key: string, fallback: number): number {
  const raw = flags.get(key);
  const value = raw === undefined ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function flagState(flags: Map<string, string>, fallback: number[]): number[] {
  const raw = flags.get('state');
  if (!raw) return fallback;
  const parts = raw.split(',').map((part) => Number.parseFloat(part.trim()));
  return parts.every(Number.isFinite) ? parts : fallback;
}

export function doubleSpec(flags: Map<string, string>): DoubleCliSpec {
  return {
    kind: 'double',
    m1: flagNum(flags, 'm1', 1),
    m2: flagNum(flags, 'm2', 1),
    l1: flagNum(flags, 'l1', 1.2),
    l2: flagNum(flags, 'l2', 1),
    g: flagNum(flags, 'g', 9.81)
  };
}

export function job(flags: Map<string, string>, request: ChaosRequest): unknown {
  const response = runChaosJob(request);
  if (!response.ok) throw new Error(response.error);
  if (!flags.has('full')) {
    const slim = { ...response } as Record<string, unknown>;
    for (const key of ['labels', 'values', 'plot', 'pPath', 'qPath', 'kValues', 'convergence']) {
      if (Array.isArray(slim[key])) slim[key] = `[${(slim[key] as unknown[]).length} values; rerun with --full]`;
    }
    return slim;
  }
  return response;
}

export function delayedLogisticSystem(): PlanarMapSystem {
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

export function syntheticDoubleAngles(
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
