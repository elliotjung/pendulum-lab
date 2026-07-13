import type { Derivative, StateVector } from '../physics/types';
import { energyDouble } from '../physics/double';
import { energyTriple } from '../physics/energy';
import { energyChain } from '../physics/nPendulum';
import { energyDriven, DAMPED_DRIVEN_CHAOS_PRESET } from '../physics/driven';
import { energySpring, type SpringPendulumParameters } from '../physics/spring';
import { buildRhs, type SystemSpec } from '../physics/systemSpec';
import type { Point2D } from '../viz';

/**
 * Demo-facing system registry. Each entry wraps one physics system from
 * `src/physics` with the small amount of presentation logic the UI needs:
 * an initial state, a (parameter-bound) RHS, an energy scalar, the pixel
 * positions of the rendered bodies, and a Poincare-crossing rule. The drawing
 * itself stays in the host (this module only computes positions), so the math
 * here is DOM-free and unit-testable.
 */

export interface SystemView {
  cx: number;
  cy: number;
  scale: number;
}

export interface DemoSystem {
  id: string;
  label: string;
  /** State-vector dimension. */
  dim: number;
  /** Physical reach (sum of link lengths) used to fit the drawing scale. */
  reach: number;
  supportsCanonical: boolean;
  supportsBifurcation: boolean;
  poincareLabels: { x: string; y: string };
  /** Data-only descriptor; serializable to the chaos worker. */
  spec: SystemSpec;
  defaultState(): StateVector;
  rhs: Derivative;
  energy(state: ArrayLike<number>): number;
  /** Pivot followed by each body, in pixel coordinates. */
  bobPositions(state: ArrayLike<number>, view: SystemView): Point2D[];
  /** Returns the section point if a crossing happened between two states, else null. */
  detectPoincare(before: ArrayLike<number>, after: ArrayLike<number>): Point2D | null;
}

const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

/** Chain pendulum bodies (double / triple / N) share this geometry and section. */
function chainSystem(
  id: string,
  label: string,
  lengths: number[],
  initial: number[],
  spec: SystemSpec,
  energy: (s: ArrayLike<number>) => number
): DemoSystem {
  const n = lengths.length;
  const dim = 2 * n;
  return {
    id,
    label,
    dim,
    reach: lengths.reduce((a, b) => a + b, 0),
    supportsCanonical: id === 'double',
    supportsBifurcation: false,
    poincareLabels: { x: 'theta1', y: 'omega1' },
    spec,
    defaultState: () => new Float64Array(initial),
    rhs: buildRhs(spec),
    energy,
    bobPositions(state, view) {
      const points: Point2D[] = [{ x: view.cx, y: view.cy }];
      let x = view.cx;
      let y = view.cy;
      for (let i = 0; i < n; i += 1) {
        const theta = Number(state[i] ?? 0);
        x += Math.sin(theta) * (lengths[i] ?? 0) * view.scale;
        y += Math.cos(theta) * (lengths[i] ?? 0) * view.scale;
        points.push({ x, y });
      }
      return points;
    },
    detectPoincare(before, after) {
      // Section: theta2 = 0 with omega2 > 0; record (theta1, omega1).
      const half = dim / 2;
      const b2 = Number(before[1] ?? 0);
      const a2 = Number(after[1] ?? 0);
      const w2 = Number(after[half + 1] ?? 0);
      if (b2 <= 0 && a2 > 0 && w2 > 0) {
        return { x: Number(after[0] ?? 0), y: Number(after[half] ?? 0) };
      }
      return null;
    }
  };
}

function makeDouble(): DemoSystem {
  const p = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const spec: SystemSpec = { kind: 'double', ...p };
  return chainSystem(
    'double',
    'Double pendulum',
    [p.l1, p.l2],
    [1.35, 1.05, 0, 0],
    spec,
    (s) => energyDouble(s, p).total
  );
}

function makeTriple(): DemoSystem {
  const p = { m1: 1, m2: 1, m3: 1, l1: 1, l2: 1, l3: 1, g: 9.81 };
  const spec: SystemSpec = { kind: 'triple', ...p };
  return chainSystem(
    'triple',
    'Triple pendulum',
    [p.l1, p.l2, p.l3],
    [1.0, 1.0, 1.0, 0, 0, 0],
    spec,
    (s) => energyTriple(s, p).total
  );
}

function makeChainN(): DemoSystem {
  const lengths = [0.7, 0.7, 0.7, 0.7, 0.7];
  const masses = [1, 1, 1, 1, 1];
  const spec: SystemSpec = { kind: 'chain', masses, lengths, g: 9.81 };
  return chainSystem(
    'chain',
    'N-pendulum (N=5)',
    lengths,
    [0.9, 0.7, 0.5, 0.3, 0.15, 0, 0, 0, 0, 0],
    spec,
    (s) => energyChain(s, { masses, lengths, g: 9.81 }).total
  );
}

function makeDriven(): DemoSystem {
  const p = DAMPED_DRIVEN_CHAOS_PRESET;
  const spec: SystemSpec = { kind: 'driven', ...p };
  return {
    id: 'driven',
    label: 'Driven pendulum (chaos)',
    dim: 3,
    reach: p.length,
    supportsCanonical: false,
    supportsBifurcation: true,
    poincareLabels: { x: 'theta wrapped', y: 'omega' },
    spec,
    defaultState: () => new Float64Array([0.2, 0, 0]),
    rhs: buildRhs(spec),
    energy: (s) => energyDriven(s, p).total,
    bobPositions(state, view) {
      const theta = Number(state[0] ?? 0);
      return [
        { x: view.cx, y: view.cy },
        { x: view.cx + Math.sin(theta) * p.length * view.scale, y: view.cy + Math.cos(theta) * p.length * view.scale }
      ];
    },
    detectPoincare(before, after) {
      // Stroboscopic: record once per drive period (phi crosses k*2pi).
      const bp = Number(before[2] ?? 0);
      const ap = Number(after[2] ?? 0);
      if (Math.floor(ap / (2 * Math.PI)) > Math.floor(bp / (2 * Math.PI))) {
        return { x: wrapPi(Number(after[0] ?? 0)), y: Number(after[1] ?? 0) };
      }
      return null;
    }
  };
}

function makeSpring(): DemoSystem {
  const p: SpringPendulumParameters = { mass: 1, stiffness: 40, restLength: 1, g: 9.81 };
  const spec: SystemSpec = { kind: 'spring', ...p };
  return {
    id: 'spring',
    label: 'Spring (elastic) pendulum',
    dim: 4,
    reach: p.restLength * 1.8,
    supportsCanonical: false,
    supportsBifurcation: false,
    poincareLabels: { x: 'r', y: 'r_dot' },
    spec,
    defaultState: () => new Float64Array([1.3, 0.6, 0, 0]),
    rhs: buildRhs(spec),
    energy: (s) => energySpring(s, p).total,
    bobPositions(state, view) {
      const r = Number(state[0] ?? 0);
      const theta = Number(state[1] ?? 0);
      return [
        { x: view.cx, y: view.cy },
        { x: view.cx + Math.sin(theta) * r * view.scale, y: view.cy + Math.cos(theta) * r * view.scale }
      ];
    },
    detectPoincare(before, after) {
      // Section: theta = 0 with thetaDot > 0; record (r, rDot).
      const b = Number(before[1] ?? 0);
      const a = Number(after[1] ?? 0);
      const td = Number(after[3] ?? 0);
      if (b <= 0 && a > 0 && td > 0) return { x: Number(after[0] ?? 0), y: Number(after[2] ?? 0) };
      return null;
    }
  };
}

export function createDemoSystems(): DemoSystem[] {
  return [makeDouble(), makeTriple(), makeChainN(), makeDriven(), makeSpring()];
}
