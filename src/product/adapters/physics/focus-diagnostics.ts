import { energyDouble, doubleMassMatrixDiagnostics } from '../../../physics/double';
import {
  createPlanarDerivative,
  planarPositions,
  type PlanarConfig,
  type PlanarState,
  type PlanarPoint
} from './planar';

export type Pair = readonly [number, number];
export interface FocusDiagnostics {
  readonly massMatrix: readonly [Pair, Pair];
  readonly determinant: number;
  readonly relativeDeterminant: number;
  readonly velocities: readonly [PlanarPoint, PlanarPoint];
  /** Coordinate-associated terms with the potential zero at the hanging equilibrium. */
  readonly energyTerms: {
    readonly kinetic1: number;
    readonly kinetic2: number;
    readonly coupling: number;
    readonly potential1: number;
    readonly potential2: number;
    readonly link1: number;
    readonly link2: number;
    readonly totalAboveMinimum: number;
  };
  /** Contributions at the same frozen state; these are not independent trajectories. */
  readonly acceleration: {
    readonly total: Pair;
    readonly gravity: Pair;
    readonly velocity: Pair;
    readonly damping: Pair;
  };
}

/**
 * Read-only diagnostics around the existing model. The quadratic kinetic-energy
 * form is recovered by basis evaluations; no second mass-matrix/EOM formula is
 * introduced. All acceleration terms are obtained from the S07 derivative.
 */
export function createFocusDiagnostics(config: PlanarConfig): (state: PlanarState) => FocusDiagnostics {
  config = structuredClone(config);
  if (config.systemId !== 'system:double') throw new Error('과정 1 진단은 질점 이중진자를 사용합니다.');
  const totalRhs = createPlanarDerivative(config);
  const conservativeRhs = createPlanarDerivative({ ...config, gamma: 0 });
  const velocityRhs = createPlanarDerivative({ ...config, gamma: 0, parameters: { ...config.parameters, g: 0 } });
  const parameters = structuredClone(config.parameters);
  const minimumPotential = energyDouble([0, 0, 0, 0], parameters).PE;
  const acceleration = (rhs: typeof totalRhs, state: PlanarState): Pair => {
    const out = new Float64Array(4);
    rhs(Float64Array.from(state), out);
    return [out[2]!, out[3]!];
  };
  return (state) => {
    const [q1, q2, w1, w2] = state;
    const energy = energyDouble(state, parameters);
    const t1 = energyDouble([q1, q2, 1, 0], parameters).KE;
    const t2 = energyDouble([q1, q2, 0, 1], parameters).KE;
    const cross = energyDouble([q1, q2, 1, 1], parameters).KE - t1 - t2;
    const kinetic1 = energyDouble([q1, q2, w1, 0], parameters).KE;
    const kinetic2 = energyDouble([q1, q2, 0, w2], parameters).KE;
    const coupling = energy.KE - kinetic1 - kinetic2;
    const potential1 = energyDouble([q1, 0, 0, 0], parameters).PE - minimumPotential;
    const potential2 = energyDouble([0, q2, 0, 0], parameters).PE - minimumPotential;
    const position = planarPositions(config, state);
    const firstVelocity = { x: -position.first.y * w1, y: position.first.x * w1 };
    const secondVelocity = {
      x: firstVelocity.x - (position.second.y - position.first.y) * w2,
      y: firstVelocity.y + (position.second.x - position.first.x) * w2
    };
    const total = acceleration(totalRhs, state);
    const gravity = acceleration(conservativeRhs, [q1, q2, 0, 0]);
    const velocity = acceleration(velocityRhs, state);
    const conservative = acceleration(conservativeRhs, state);
    const matrix = doubleMassMatrixDiagnostics(state, parameters);
    return {
      massMatrix: [
        [2 * t1, cross],
        [cross, 2 * t2]
      ],
      determinant: matrix.determinant,
      relativeDeterminant: matrix.relativeDeterminant,
      velocities: [firstVelocity, secondVelocity],
      energyTerms: {
        kinetic1,
        kinetic2,
        coupling,
        potential1,
        potential2,
        link1: kinetic1 + potential1,
        link2: kinetic2 + potential2,
        totalAboveMinimum: energy.total - minimumPotential
      },
      acceleration: {
        total,
        gravity,
        velocity,
        damping: [total[0] - conservative[0], total[1] - conservative[1]]
      }
    };
  };
}

export interface LinearMode {
  readonly frequency: number;
  /** First angular component normalized to one; the second is a signed ratio. */
  readonly shape: Pair;
}
export interface FocusLinearReference {
  readonly modes: readonly [LinearMode, LinearMode];
  readonly jacobian: readonly number[];
  stateAt(elapsed: number): PlanarState;
}

/** Exact modal propagation of the legacy model's analytic equilibrium Jacobian. */
export function createFocusLinearReference(config: PlanarConfig): FocusLinearReference {
  if (config.systemId !== 'system:double' || config.gamma !== 0 || !(config.parameters.g > 0))
    throw new Error('정상모드 비교에는 양의 중력과 감쇠 없는 질점 이중진자가 필요합니다.');
  const rhs = createPlanarDerivative(config);
  if (!rhs.jacobian) throw new Error('공용 모델의 선형화 Jacobian을 사용할 수 없습니다.');
  const jac = new Float64Array(16);
  rhs.jacobian(new Float64Array(4), jac);
  // Eigenvalues of -J_acceleration,angle are squared frequencies. This is
  // generic 2x2 eigensystem algebra, not a second pendulum model.
  const a = -jac[8]!;
  const b = -jac[9]!;
  const c = -jac[12]!;
  const d = -jac[13]!;
  const gap = Math.sqrt((a - d) ** 2 + 4 * b * c);
  const high = (a + d + gap) / 2;
  // Product of the eigenvalues avoids cancellation in trace minus gap when
  // their frequencies are widely separated.
  const low = (a * d - b * c) / high;
  if (!(low > 0) || !Number.isFinite(high) || b === 0)
    throw new Error('이 설정에서 두 안정 정상모드를 분리할 수 없습니다.');
  const r1 = (low - a) / b;
  const r2 = (high - a) / b;
  const modes: readonly [LinearMode, LinearMode] = [
    { frequency: Math.sqrt(low), shape: [1, r1] },
    { frequency: Math.sqrt(high), shape: [1, r2] }
  ];
  const project = (first: number, second: number): Pair => {
    const secondMode = (second - r1 * first) / (r2 - r1);
    return [first - secondMode, secondMode];
  };
  const q = project(config.initialState[0], config.initialState[1]);
  const v = project(config.initialState[2], config.initialState[3]);
  return {
    modes,
    jacobian: Array.from(jac),
    stateAt(elapsed) {
      if (!Number.isFinite(elapsed) || elapsed < 0)
        throw new RangeError('선형 비교 시간은 0 이상의 유한한 수여야 합니다.');
      const positions = modes.map(
        (mode, i) =>
          q[i]! * Math.cos(mode.frequency * elapsed) + (v[i]! * Math.sin(mode.frequency * elapsed)) / mode.frequency
      );
      const velocities = modes.map(
        (mode, i) =>
          -q[i]! * mode.frequency * Math.sin(mode.frequency * elapsed) + v[i]! * Math.cos(mode.frequency * elapsed)
      );
      return [
        positions[0]! + positions[1]!,
        r1 * positions[0]! + r2 * positions[1]!,
        velocities[0]! + velocities[1]!,
        r1 * velocities[0]! + r2 * velocities[1]!
      ];
    }
  };
}

/** Dimensionless metric: wrapped angle/rad and angular velocity/(1 rad/s). */
export function focusStateDistance(first: PlanarState, second: PlanarState): number {
  const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.hypot(
    angleDifference(first[0], second[0]),
    angleDifference(first[1], second[1]),
    first[2] - second[2],
    first[3] - second[3]
  );
}

/** No renormalization or asymptotic Lyapunov claim; undefined at time zero/collapse. */
export function focusFiniteTimeRate(distance: number, initialDistance: number, elapsed: number): number | null {
  if (
    ![distance, initialDistance, elapsed].every(Number.isFinite) ||
    distance <= 0 ||
    initialDistance <= 0 ||
    elapsed <= 0
  )
    return null;
  const rate = (Math.log(distance) - Math.log(initialDistance)) / elapsed;
  return Number.isFinite(rate) ? rate : null;
}
