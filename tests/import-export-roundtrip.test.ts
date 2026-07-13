import { describe, expect, test } from 'vitest';
import { StateStore } from '../src/state/StateStore';
import { parseStrictJsonImport } from '../src/validation/importSchema';

describe('import/export round-trip and security guards', () => {
  test('StateStore snapshot round-trips through strict JSON import', () => {
    const store = new StateStore({
      systemType: 'double',
      method: 'rk4',
      mode: 'research',
      state: [0.2, -0.4, 0.01, -0.02],
      simTime: 12.5,
      seed: 42
    });
    const snapshot = store.snapshot();
    const parsed = parseStrictJsonImport(JSON.stringify(snapshot));
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.state).toEqual(snapshot.state);
    expect(parsed.value?.method).toBe('rk4');
  });

  test('strict import rejects constructor and prototype pollution keys', () => {
    const base =
      '"schemaVersion":"pendulum-session/v10-ts","systemType":"double","method":"rk4","mode":"research","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1.2,"l2":1,"g":9.81},"state":[0.1,0.2,0,0],"simTime":0,"seed":123,"hash":"test"';
    expect(parseStrictJsonImport(`{${base},"constructor":{"polluted":true}}`).ok).toBe(false);
    expect(parseStrictJsonImport(`{${base},"prototype":{"polluted":true}}`).ok).toBe(false);
  });

  test('strict import size limit rejects oversized payloads before parsing', () => {
    const result = parseStrictJsonImport(' '.repeat(5_000_001));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('exceeds');
  });
});
