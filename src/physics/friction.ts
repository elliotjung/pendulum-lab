/** Smooth, simulation-safe Coulomb and Stribeck friction laws. */

export interface RegularizedCoulombFriction {
  /** Sliding-friction magnitude (force or torque units). */
  magnitude: number;
  /** Velocity scale of the tanh sign regularization. */
  regularizationVelocity: number;
  /** Optional linear viscous coefficient. */
  viscous?: number;
}

export interface StribeckFrictionParameters {
  /** Break-away/static friction magnitude F_s. */
  staticFriction: number;
  /** High-speed Coulomb/sliding magnitude F_c, with F_s >= F_c. */
  dynamicFriction: number;
  /** Stribeck velocity v_s (>0). */
  stribeckVelocity: number;
  /** Smooth sign scale v_epsilon (>0). */
  regularizationVelocity: number;
  /** Linear viscous coefficient b (>=0). */
  viscous?: number;
  /** Exponent in exp(-(abs(v)/v_s)^p); default 2. */
  exponent?: number;
}

export interface StaticFrictionStepParameters {
  mass: number;
  dt: number;
  /** Symmetric static-friction cone |F_t| <= staticLimit. */
  staticLimit: number;
  /** Sliding-friction magnitude, normally <= staticLimit. */
  dynamicMagnitude: number;
}

export interface StaticFrictionStepResult {
  mode: 'stick' | 'slip';
  frictionForce: number;
  nextVelocity: number;
  /** Momentum-equation residual m(v_next-v)/dt - F_external - F_friction. */
  momentumResidual: number;
  /** Violation of the static cone; exactly zero for a valid step. */
  coneResidual: number;
}

function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative.`);
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite.`);
}

/** Regularized sign function used by both laws. */
export function smoothFrictionSign(velocity: number, regularizationVelocity: number): number {
  if (!Number.isFinite(velocity)) throw new Error('friction velocity must be finite.');
  positive(regularizationVelocity, 'regularizationVelocity');
  return Math.tanh(velocity / regularizationVelocity);
}

/** Opposing regularized Coulomb force -F_c tanh(v/v_epsilon) - b v. */
export function coulombFrictionForce(velocity: number, parameters: RegularizedCoulombFriction): number {
  nonNegative(parameters.magnitude, 'Coulomb magnitude');
  nonNegative(parameters.viscous ?? 0, 'Coulomb viscous coefficient');
  if (velocity === 0) return 0;
  return (
    -parameters.magnitude * smoothFrictionSign(velocity, parameters.regularizationVelocity) -
    (parameters.viscous ?? 0) * velocity
  );
}

/** Speed-dependent pre-sliding magnitude in the Stribeck curve. */
export function stribeckFrictionMagnitude(speed: number, parameters: StribeckFrictionParameters): number {
  nonNegative(speed, 'Stribeck speed');
  nonNegative(parameters.staticFriction, 'staticFriction');
  nonNegative(parameters.dynamicFriction, 'dynamicFriction');
  if (parameters.staticFriction < parameters.dynamicFriction) {
    throw new Error('staticFriction must be greater than or equal to dynamicFriction.');
  }
  positive(parameters.stribeckVelocity, 'stribeckVelocity');
  const exponent = parameters.exponent ?? 2;
  positive(exponent, 'Stribeck exponent');
  const ratio = speed / parameters.stribeckVelocity;
  return (
    parameters.dynamicFriction +
    (parameters.staticFriction - parameters.dynamicFriction) * Math.exp(-(ratio ** exponent))
  );
}

/**
 * Smooth Stribeck force/torque.  It always opposes motion, so F(v)*v <= 0.
 * This is a regularized sliding law, not a complementarity/static-stiction
 * solver: exactly at v=0 it returns zero instead of selecting any force in the
 * static-friction cone.
 */
export function stribeckFrictionForce(velocity: number, parameters: StribeckFrictionParameters): number {
  if (!Number.isFinite(velocity)) throw new Error('Stribeck velocity must be finite.');
  nonNegative(parameters.viscous ?? 0, 'Stribeck viscous coefficient');
  if (velocity === 0) return 0;
  const magnitude = stribeckFrictionMagnitude(Math.abs(velocity), parameters);
  return (
    -magnitude * smoothFrictionSign(velocity, parameters.regularizationVelocity) - (parameters.viscous ?? 0) * velocity
  );
}

/** Apply the scalar law component-wise without allocating an intermediate array. */
export function applyStribeckFriction(
  velocities: ArrayLike<number>,
  parameters: StribeckFrictionParameters,
  out: Float64Array
): Float64Array {
  if (out.length < velocities.length)
    throw new Error('applyStribeckFriction output is shorter than the velocity vector.');
  for (let i = 0; i < velocities.length; i += 1) out[i] = stribeckFrictionForce(Number(velocities[i] ?? 0), parameters);
  return out;
}

/**
 * One-dimensional implicit Euler contact step with exact static stiction.
 *
 * The solver first asks whether a force inside the static cone can make the
 * next velocity exactly zero. If so it returns that complementarity solution;
 * otherwise it applies kinetic Coulomb friction opposite the predicted slip.
 * This is the non-smooth path for experiments where a tanh regularization
 * would erase break-away/stick-slip dynamics.
 */
export function staticFrictionComplementarityStep(
  velocity: number,
  externalForce: number,
  parameters: StaticFrictionStepParameters
): StaticFrictionStepResult {
  if (!Number.isFinite(velocity) || !Number.isFinite(externalForce))
    throw new Error('Static-friction velocity and external force must be finite.');
  positive(parameters.mass, 'static-friction mass');
  positive(parameters.dt, 'static-friction dt');
  nonNegative(parameters.staticLimit, 'static-friction limit');
  nonNegative(parameters.dynamicMagnitude, 'dynamic-friction magnitude');
  if (parameters.dynamicMagnitude > parameters.staticLimit)
    throw new Error('dynamicMagnitude must not exceed staticLimit.');

  const requiredToStick = -(parameters.mass * velocity) / parameters.dt - externalForce;
  if (Math.abs(requiredToStick) <= parameters.staticLimit) {
    return {
      mode: 'stick',
      frictionForce: requiredToStick,
      nextVelocity: 0,
      momentumResidual: 0,
      coneResidual: 0
    };
  }

  const freeVelocity = velocity + (parameters.dt * externalForce) / parameters.mass;
  const slipDirection = Math.sign(freeVelocity || externalForce || velocity);
  const frictionForce = -parameters.dynamicMagnitude * slipDirection;
  const nextVelocity = velocity + (parameters.dt * (externalForce + frictionForce)) / parameters.mass;
  const momentumResidual =
    (parameters.mass * (nextVelocity - velocity)) / parameters.dt - externalForce - frictionForce;
  return {
    mode: 'slip',
    frictionForce,
    nextVelocity,
    momentumResidual,
    coneResidual: Math.max(0, Math.abs(frictionForce) - parameters.staticLimit)
  };
}
