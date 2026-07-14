import type { RuntimeSnapshot } from '../types/domain';
import { StateStore } from '../state/StateStore';
import { validateLabSnapshot } from '../validation/sessionConstraints';
import type { LabConfig } from './LabSimulation';

/** Validate a persisted snapshot against both research and interactive-Lab contracts. */
export function canonicalLabSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const strict = StateStore.validate(snapshot);
  if (!strict.ok || !strict.value) throw new Error(`invalid Lab snapshot: ${strict.problems.join('; ')}`);
  const lab = validateLabSnapshot(strict.value);
  if (!lab.ok || !lab.value) throw new Error(`snapshot cannot drive Lab controls: ${lab.problems.join('; ')}`);
  return lab.value;
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
