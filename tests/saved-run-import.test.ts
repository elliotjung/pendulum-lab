import { describe, expect, it } from 'vitest';
import { parseAndApplySavedRun, snapshotControlValues } from '../src/browser/savedRunImport';
import { StateStore } from '../src/state/StateStore';

const snapshot = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'triple' as const,
  method: 'rk4' as const,
  mode: 'research' as const,
  dt: 0.002,
  tolerance: 1e-8,
  stepsPerFrame: 8,
  damping: 0.02,
  parameters: { m1: 1, m2: 2, m3: 3, l1: 1.1, l2: 1.2, l3: 1.3, g: 9.81 },
  state: [0.1, 0.2, 0.3, 1, 2, 3],
  simTime: 12.5,
  seed: 77,
  hash: 'fixture'
};

describe('saved-run import', () => {
  it('validates before applying the snapshot to StateStore', () => {
    const store = new StateStore();
    const result = parseAndApplySavedRun(JSON.stringify(snapshot), store);
    expect(result.ok).toBe(true);
    expect(store.snapshot()).toMatchObject({
      systemType: 'triple',
      method: 'rk4',
      state: snapshot.state,
      simTime: 12.5,
      seed: 77
    });
  });

  it('does not mutate StateStore when validation fails', () => {
    const store = new StateStore();
    const before = store.snapshot();
    const result = parseAndApplySavedRun(JSON.stringify({ ...snapshot, state: [0, null, 0, 0, 0, 0] }), store);
    expect(result.ok).toBe(false);
    expect(store.snapshot()).toEqual(before);
  });

  it('maps triple state and tolerance to the existing controls', () => {
    const values = Object.fromEntries(snapshotControlValues(snapshot));
    expect(values).toMatchObject({
      sysType: 'triple',
      tol: -8,
      spf: 8,
      th3: 0.3,
      iw1: 1,
      iw2: 2,
      iw3: 3
    });
  });
});
