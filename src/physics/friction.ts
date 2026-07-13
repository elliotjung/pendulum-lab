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
