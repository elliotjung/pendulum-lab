import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentSnapshot } from '../src/app/parity/shared-runtime';
import { state } from '../src/app/parity/shared-state';
import type { RuntimeSnapshot } from '../src/types/domain';

const liveSnapshot: RuntimeSnapshot = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'demo',
  dt: 0.003,
  tolerance: 1e-7,
  stepsPerFrame: 6,
  damping: 0,
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
  state: [0.42, -0.3, 1.1, -0.8],
  simTime: 12.75,
  seed: 17,
  hash: 'live-hash'
};

afterEach(() => {
  state.mode = 'demo';
  vi.unstubAllGlobals();
});

describe('currentSnapshot live Lab preference', () => {
  it('uses one atomic runtime snapshot instead of mixing DOM, store, and diagnostics state', () => {
    const runtimeSnapshot = vi.fn(() => structuredClone(liveSnapshot));
    vi.stubGlobal('window', { __modernLab: { runtimeSnapshot } });
    state.mode = 'research';

    expect(currentSnapshot()).toEqual({ ...liveSnapshot, mode: 'research' });
    expect(runtimeSnapshot).toHaveBeenCalledTimes(1);
  });
});
