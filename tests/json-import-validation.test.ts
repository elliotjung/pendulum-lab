import { describe, expect, test } from 'vitest';
import { MAX_JSON_BYTES, MAX_JSON_DEPTH, MAX_JSON_NODES, parseStrictJsonImport } from '../src/validation/importSchema';

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
    expect(parseStrictJsonImport(JSON.stringify({ ...valid, method: 'toString' })).ok).toBe(false);
  });

  test('accepts the legacy verlet method alias', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, method: 'verlet' }));
    expect(result.ok).toBe(true);
    expect(result.value?.method).toBe('leapfrog');
  });

  test('rejects prototype pollution keys before mutation', () => {
    const result = parseStrictJsonImport(
      '{"schemaVersion":"pendulum-session/v10-ts","systemType":"double","method":"rk4","mode":"research","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1.2,"l2":1,"g":9.81,"__proto__":{"polluted":true}},"state":[0.1,0.2,0,0],"simTime":0,"seed":123,"hash":"test"}'
    );
    expect(result.ok).toBe(false);
  });

  test('rejects escaped prototype pollution keys after parsing', () => {
    const result = parseStrictJsonImport(
      '{"schemaVersion":"pendulum-session/v10-ts","systemType":"double","method":"rk4","mode":"research","dt":0.003,"tolerance":1e-7,"stepsPerFrame":6,"damping":0,"parameters":{"m1":1,"m2":1,"l1":1.2,"l2":1,"g":9.81,"\\u005f\\u005fproto\\u005f\\u005f":{"polluted":true}},"state":[0.1,0.2,0,0],"simTime":0,"seed":123,"hash":"test"}'
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('prototype-pollution');
  });

  test('rejects non-finite state encodings', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, state: [0, null, 0, 0] }));
    expect(result.ok).toBe(false);
  });

  test('rejects unsupported session schemas and invalid runtime fields', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...valid, schemaVersion: 'pendulum-session/v11-ts' }, 'newer'],
      [{ ...valid, schemaVersion: 'pendulum-session/v9-ts' }, 'migration'],
      [{ ...valid, tolerance: -1 }, 'tolerance'],
      [{ ...valid, stepsPerFrame: 1.5 }, 'stepsPerFrame'],
      [{ ...valid, simTime: -1 }, 'simTime'],
      [{ ...valid, seed: 1.5 }, 'seed'],
      [{ ...valid, parameters: { ...valid.parameters, g: -9.81 } }, 'g']
    ];
    for (const [candidate, message] of cases) {
      const result = parseStrictJsonImport(JSON.stringify(candidate));
      expect(result.ok, message).toBe(false);
      expect(result.problems.join(' ')).toContain(message);
    }
  });

  test('keeps historical signed integer seeds reproducible', () => {
    const result = parseStrictJsonImport(JSON.stringify({ ...valid, seed: -1 }));
    expect(result.ok).toBe(true);
    expect(result.value?.seed).toBe(-1);
  });

  test('measures the import limit in UTF-8 bytes rather than UTF-16 code units', () => {
    const multibytePayload = 'é'.repeat(Math.floor(MAX_JSON_BYTES / 2) + 1);
    expect(multibytePayload.length).toBeLessThan(MAX_JSON_BYTES);
    const result = parseStrictJsonImport(multibytePayload);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('UTF-8');
  });

  test('rejects excessive nesting iteratively instead of overflowing the call stack', () => {
    let deeplyNested = 'null';
    for (let depth = 0; depth <= MAX_JSON_DEPTH; depth += 1) deeplyNested = `{"child":${deeplyNested}}`;
    expect(() => parseStrictJsonImport(deeplyNested)).not.toThrow();
    const result = parseStrictJsonImport(deeplyNested);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('depth');
  });

  test('rejects JSON graphs that exceed the node budget', () => {
    const tooManyNodes = `[${'0,'.repeat(MAX_JSON_NODES)}0]`;
    const result = parseStrictJsonImport(tooManyNodes);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('nodes');
  });
});
