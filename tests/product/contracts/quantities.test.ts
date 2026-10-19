import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseExperiment, serializeExperiment } from '../../../src/product/persistence';
import { experimentFixture } from './fixtures';
import {
  CANONICAL_UNITS,
  MAX_QUANTITY_VECTOR_LENGTH,
  validateQuantityValue
} from '../../../src/product/contracts/quantities';

describe('S03 canonical SI quantities', () => {
  it('preserves S13 controller gain units through canonical serialization', () => {
    const state = experimentFixture();
    const gains = {
      kp: { kind: 'scalar' as const, value: 40, unit: 'N/rad' as const },
      kd: { kind: 'scalar' as const, value: 10, unit: 'N*s/rad' as const },
      kx: { kind: 'scalar' as const, value: 1, unit: 'N/m' as const },
      kv: { kind: 'scalar' as const, value: 2, unit: 'N*s/m' as const }
    };
    const serialized = serializeExperiment({ ...state, parameters: gains });
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) throw new Error('Controller gain unit fixture failed serialization');
    const parsed = parseExperiment(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Controller gain unit fixture failed parsing');
    expect(parsed.value.parameters).toEqual(gains);
  });

  it('preserves scalar, vector, complex components, explicit angle units and winding exactly', () => {
    for (const quantity of [
      { kind: 'scalar', value: 8 * Math.PI, unit: 'rad' },
      { kind: 'vector', values: [0, 2.5, -4.5], unit: 'rad/s' },
      { kind: 'complex-vector', re: [1, 0, -2], im: [0, 0.5, 1], unit: '1' }
    ]) {
      const result = validateQuantityValue(quantity);
      expect(result).toEqual({ ok: true, value: quantity });
      if (result.ok) expect(result.value).not.toBe(quantity);
    }
  });

  it.each([
    null,
    1,
    {},
    { kind: 'scalar', value: 180, unit: 'deg' },
    { kind: 'scalar', value: 1 },
    { kind: 'scalar', value: NaN, unit: 'm' },
    { kind: 'scalar', value: Infinity, unit: 'm' },
    { kind: 'scalar', value: -0, unit: 'm' },
    { kind: 'scalar', value: 1, unit: 'm', label: 'length' },
    { kind: 'vector', values: [], unit: '1' },
    { kind: 'vector', values: [1, '2'], unit: '1' },
    { kind: 'vector', values: new Float64Array([1, 2]), unit: '1' },
    { kind: 'complex-vector', re: [1], im: [0, 1], unit: '1' },
    { kind: 'complex-vector', re: [1], im: [NaN], unit: '1' },
    { kind: 'matrix', values: [[1]], unit: '1' }
  ])('rejects malformed, lossy or noncanonical quantities (%j)', (value) => {
    expect(validateQuantityValue(value).ok).toBe(false);
  });

  it('bounds vectors without truncating values', () => {
    expect(
      validateQuantityValue({ kind: 'vector', values: Array(MAX_QUANTITY_VECTOR_LENGTH).fill(1), unit: '1' }).ok
    ).toBe(true);
    expect(
      validateQuantityValue({ kind: 'vector', values: Array(MAX_QUANTITY_VECTOR_LENGTH + 1).fill(1), unit: '1' }).ok
    ).toBe(false);
  });

  it('round trips every supported unit and randomized finite scalar/vector values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CANONICAL_UNITS),
        fc.array(
          fc.double({ min: -1e100, max: 1e100, noNaN: true }).filter((value) => !Object.is(value, -0)),
          { minLength: 1, maxLength: 32 }
        ),
        (unit, values) => {
          const quantity = { kind: 'vector', values, unit };
          const parsed = JSON.parse(JSON.stringify(quantity));
          expect(validateQuantityValue(parsed)).toEqual({ ok: true, value: quantity });
        }
      ),
      { numRuns: 150 }
    );
  });
});
