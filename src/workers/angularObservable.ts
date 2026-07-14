import type { SystemSpec } from '../physics/systemSpec';
import type { StateVector } from '../physics/types';

/** Spring stores its angular coordinate at index 1; all other specifications use index 0. */
export function boundedAngularObservable(spec: SystemSpec): (state: StateVector) => number {
  const angularIndex = spec.kind === 'spring' ? 1 : 0;
  return (state) => Math.cos(state[angularIndex] ?? 0);
}
