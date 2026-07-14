import type { ImportValidationResult, IntegratorId, RuntimeSnapshot } from '../types/domain';

export interface NumericBounds {
  min: number;
  max: number;
}

/**
 * Broad, headless-session safety limits. These deliberately remain wider than
 * the interactive Lab controls: StateStore is also used by research/export
 * code, where small timesteps and non-interactive parameter ranges are valid.
 */
export const SESSION_SAFETY_BOUNDS = Object.freeze({
  dt: { min: 1e-12, max: 0.1 },
  tolerance: { min: 1e-15, max: 1 },
  stepsPerFrame: { min: 1, max: 10_000 },
  damping: { min: 0, max: 10 },
  simTime: { min: 0, max: 1e12 },
  mass: { min: 1e-6, max: 1e6 },
  length: { min: 1e-6, max: 1e6 },
  gravity: { min: 0, max: 1e6 },
  angularVelocity: { min: -1e6, max: 1e6 }
} satisfies Record<string, NumericBounds>);

/**
 * Static contract represented by app.html. Unlike the broad StateStore
 * contract, every value in this object must be representable by a visible Lab
 * control without browser range clamping.
 */
export const LAB_CONTROL_BOUNDS = Object.freeze({
  dt: { min: 0.0001, max: 0.05 },
  tolerance: { min: 1e-12, max: 1e-3 },
  stepsPerFrame: { min: 1, max: 60 },
  damping: { min: 0, max: 10 },
  simTime: { min: 0, max: 1e9 },
  mass: { min: 0.1, max: 5 },
  length: { min: 0.3, max: 2 },
  gravity: { min: 0, max: 20 },
  angle: { min: -Math.PI, max: Math.PI },
  angularVelocity: { min: -64, max: 64 }
} satisfies Record<string, NumericBounds>);

/** The legacy `verlet` id is accepted by StateStore and canonicalized to leapfrog. */
export const LAB_INTEGRATOR_IDS = Object.freeze([
  'euler',
  'rk2',
  'rk4',
  'leapfrog',
  'symplectic',
  'yoshida4',
  'yoshida6',
  'yoshida8',
  'hmidpoint',
  'gauss2',
  'rkf45',
  'dopri5',
  'dop853',
  'gbs',
  'bdf2'
] as const satisfies readonly IntegratorId[]);

const labIntegratorIds = new Set<IntegratorId>(LAB_INTEGRATOR_IDS);

export function inBounds(value: number, bounds: NumericBounds): boolean {
  return Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
}

/** Canonicalize a periodic angle without changing the represented pose. */
export function principalAngle(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value >= -Math.PI && value <= Math.PI) return Object.is(value, -0) ? 0 : value;
  const wrapped = Math.atan2(Math.sin(value), Math.cos(value));
  // Avoid exporting negative zero, which is surprising in hashes and controls.
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function requireBound(problems: string[], label: string, value: number, bounds: NumericBounds): void {
  if (!inBounds(value, bounds)) problems.push(`${label} must be between ${bounds.min} and ${bounds.max}`);
}

/**
 * Validate the narrower contract required before a RuntimeSnapshot may drive
 * LabApp. StateStore validation must run first; this function only checks UI
 * representability and the interactive runtime budget.
 */
export function validateLabSnapshot(snapshot: RuntimeSnapshot): ImportValidationResult<RuntimeSnapshot> {
  const problems: string[] = [];
  if (!labIntegratorIds.has(snapshot.method)) problems.push(`method ${snapshot.method} is not exposed by the Lab`);
  requireBound(problems, 'dt', snapshot.dt, LAB_CONTROL_BOUNDS.dt);
  requireBound(problems, 'tolerance', snapshot.tolerance, LAB_CONTROL_BOUNDS.tolerance);
  requireBound(problems, 'stepsPerFrame', snapshot.stepsPerFrame, LAB_CONTROL_BOUNDS.stepsPerFrame);
  if (!Number.isSafeInteger(snapshot.stepsPerFrame)) problems.push('stepsPerFrame must be an integer');
  requireBound(problems, 'damping', snapshot.damping, LAB_CONTROL_BOUNDS.damping);
  requireBound(problems, 'simTime', snapshot.simTime, LAB_CONTROL_BOUNDS.simTime);
  requireBound(problems, 'm1', snapshot.parameters.m1, LAB_CONTROL_BOUNDS.mass);
  requireBound(problems, 'm2', snapshot.parameters.m2, LAB_CONTROL_BOUNDS.mass);
  requireBound(problems, 'l1', snapshot.parameters.l1, LAB_CONTROL_BOUNDS.length);
  requireBound(problems, 'l2', snapshot.parameters.l2, LAB_CONTROL_BOUNDS.length);
  requireBound(problems, 'g', snapshot.parameters.g, LAB_CONTROL_BOUNDS.gravity);
  if (snapshot.systemType === 'triple') {
    requireBound(problems, 'm3', snapshot.parameters.m3 ?? Number.NaN, LAB_CONTROL_BOUNDS.mass);
    requireBound(problems, 'l3', snapshot.parameters.l3 ?? Number.NaN, LAB_CONTROL_BOUNDS.length);
  }
  const angleCount = snapshot.systemType === 'triple' ? 3 : 2;
  for (let index = 0; index < snapshot.state.length; index += 1) {
    requireBound(
      problems,
      `state[${index}]`,
      snapshot.state[index] ?? Number.NaN,
      index < angleCount ? LAB_CONTROL_BOUNDS.angle : LAB_CONTROL_BOUNDS.angularVelocity
    );
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, problems: [], value: snapshot };
}
