import { describe, expect, it } from 'vitest';
import { createPlanarSimulation, defaultPlanarConfig } from '../../../src/product/adapters/physics/planar';
import { historyRestart } from '../../../src/product/lab/views/run-history';

describe('S28 explicit restart from a native recording', () => {
  it.each(['system:double', 'system:compound-double'] as const)(
    '%s retains exact selected state/time and source configuration',
    (systemId) => {
      const config = { ...defaultPlanarConfig(systemId), duration: 0.03, step: 0.002 };
      const native = createPlanarSimulation(config);
      native.step();
      const sample = native.step();
      const restart = historyRestart(config, sample);
      expect(restart.initialState).toEqual(sample.state);
      expect(restart.startTime).toBe(sample.time);
      expect(restart.parameters).toEqual(config.parameters);
      expect(restart.integratorId).toBe(config.integratorId);
      const replay = createPlanarSimulation(restart);
      const expected = native.step();
      expect(replay.step().state).toEqual(expected.state);
      expect(replay.snapshot().time).toBe(expected.time);
      expect(config.initialState).not.toEqual(sample.state);
    }
  );
});
