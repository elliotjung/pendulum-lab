import type { RuntimeSnapshot } from '../types/domain';
import { stateHash, StateStore } from '../state/StateStore';
import { principalAngle, validateLabSnapshot } from '../validation/sessionConstraints';
import type { LabConfig } from './LabSimulation';

/** Validate a persisted snapshot against both research and interactive-Lab contracts. */
export function canonicalLabSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const strict = StateStore.validate(snapshot);
  if (!strict.ok || !strict.value) throw new Error(`invalid Lab snapshot: ${strict.problems.join('; ')}`);
  const lab = validateLabSnapshot(strict.value);
  if (!lab.ok || !lab.value) throw new Error(`snapshot cannot drive Lab controls: ${lab.problems.join('; ')}`);
  return lab.value;
}

/** Project exact solver winding onto the periodic angle controls. */
export function recoveryControlSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const angleCount = snapshot.systemType === 'triple' ? 3 : 2;
  return {
    ...snapshot,
    state: snapshot.state.map((component, index) => (index < angleCount ? principalAngle(component) : component))
  };
}

/**
 * Validate an app-created PWA recovery point without discarding its winding
 * number. The hash binds the exact live state, while a principal-angle copy is
 * checked against the narrower browser-control contract.
 */
export function exactRecoveryLabSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const strict = StateStore.validate(snapshot, { preserveAngleWinding: true });
  if (!strict.ok || !strict.value) throw new Error(`invalid recovery snapshot: ${strict.problems.join('; ')}`);
  const expectedHash = stateHash(strict.value.state);
  if (typeof snapshot.hash !== 'string' || snapshot.hash !== expectedHash) {
    throw new Error('recovery snapshot hash does not bind the exact solver state');
  }
  const controlProjection = validateLabSnapshot(recoveryControlSnapshot(strict.value));
  if (!controlProjection.ok) {
    throw new Error(`recovery snapshot cannot drive Lab controls: ${controlProjection.problems.join('; ')}`);
  }
  return { ...strict.value, hash: expectedHash };
}

/** Convert a validated persisted snapshot into the simulation's runtime config. */
export function labConfigFromSnapshot(snapshot: RuntimeSnapshot): LabConfig {
  return {
    system: snapshot.systemType,
    parameters: { ...snapshot.parameters },
    gamma: snapshot.damping,
    method: snapshot.method,
    dt: snapshot.dt,
    tolerance: snapshot.tolerance,
    initialState: [...snapshot.state]
  };
}
