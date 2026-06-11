import { describe, expect, test } from 'vitest';
import { parseStrictJsonImport } from '../src/validation/importSchema';

const valid = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.003,
  tolerance: 1e-7,
  stepsPerFrame: 6,
  damping: 0,
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
  state: [0.1, 0.2, 0, 0],
  simTime: 0,
  seed: 123,
  hash: 'test'
};

describe('JSON import validation', () => {
  test('accepts a strict valid snapshot', () => {
    const result = parseStrictJsonImport(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    expect(result.value?.state).toHaveLength(4);
  });

  test('rejects unknown methods', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, method: 'not-real' }));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('known integrator');
  });

  test('accepts the legacy verlet method alias', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, method: 'verlet' }));
    expect(result.ok).toBe(true);
    expect(result.value?.method).toBe('verlet');
  });

  test('rejects prototype pollution keys before mutation', () => {
    const result = parseStrictJsonImport('{"schemaVersion":"pendulum-session/v10-ts","systemType":"double","method":"rk4","mode":"research","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1.2,"l2":1,"g":9.81,"__proto__":{"polluted":true}},"state":[0.1,0.2,0,0],"simTime":0,"seed":123,"hash":"test"}');
    expect(result.ok).toBe(false);
  });

  test('rejects escaped prototype pollution keys after parsing', () => {
    const result = parseStrictJsonImport('{"schemaVersion":"pendulum-session/v10-ts","systemType":"double","method":"rk4","mode":"research","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1.2,"l2":1,"g":9.81,"\\u005f\\u005fproto\\u005f\\u005f":{"polluted":true}},"state":[0.1,0.2,0,0],"simTime":0,"seed":123,"hash":"test"}');
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('prototype-pollution');
  });

  test('rejects non-finite state encodings', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, state: [0, null, 0, 0] }));
    expect(result.ok).toBe(false);
  });
});
