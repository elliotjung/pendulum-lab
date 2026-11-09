import { describe, expect, it } from 'vitest';
import { parseScientificValue } from '../../../src/app/precisionControls';
import { displayQuantityValue, parseDisplayQuantityInput } from '../../../src/product/design-system/display-quantity';

describe('S28 native precision grammar and display quantities', () => {
  it.each(['pi', 'π/2', '-3*pi/4', '+2pi', '−pi/7', '180 deg', '-90°', '1,5', '0.125', '1e-12', '0'])(
    '%s matches native authored SI angles exactly',
    (text) => {
      const native = parseScientificValue(text, { angularUnits: 'angle', defaultUnit: 'rad', min: -100, max: 100 });
      const product = parseDisplayQuantityInput(text, { unit: 'rad', min: -100, max: 100 });
      expect(native.ok).toBe(true);
      expect(product).toEqual({ ok: true, quantity: { kind: 'scalar', value: native.value, unit: 'rad' } });
    }
  );
  it.each(['360deg/s', '-pi/2 rad/s', '45', 'pi'])('%s matches native angular velocity in degree display', (text) => {
    const native = parseScientificValue(text, {
      angularUnits: 'angular-velocity',
      defaultUnit: 'deg',
      min: -100,
      max: 100
    });
    expect(parseDisplayQuantityInput(text, { unit: 'rad/s', min: -100, max: 100 }, 'deg')).toEqual({
      ok: true,
      quantity: { kind: 'scalar', value: native.value, unit: 'rad/s' }
    });
  });
  it.each(['alert(1)', 'Math.PI', '1+2', 'pi/0', 'NaN', 'Infinity', '1e309', '-0', '1e-400', '1 rad/s', '90 deg/s'])(
    'rejects unsafe, lossy or dimensionally wrong angle %s',
    (text) => {
      expect(parseDisplayQuantityInput(text, { unit: 'rad', min: -100, max: 100 }).ok).toBe(false);
    }
  );
  it('keeps scalar units independent of angular suffixes and validates SI bounds after conversion', () => {
    expect(parseDisplayQuantityInput('pi/2', { unit: 'm', min: 0, max: 2 })).toEqual({
      ok: true,
      quantity: { kind: 'scalar', value: Math.PI / 2, unit: 'm' }
    });
    expect(parseDisplayQuantityInput('90 deg', { unit: 'kg', min: 0, max: 100 }).ok).toBe(false);
    expect(parseDisplayQuantityInput('180deg', { unit: 'rad', min: -1, max: 1 })).toMatchObject({
      ok: false,
      code: 'range'
    });
    expect(parseDisplayQuantityInput('5e-324 deg', { unit: 'rad', min: -1, max: 1 }).ok).toBe(false);
    expect(parseDisplayQuantityInput(`0.${'0'.repeat(400)}1pi`, { unit: 'rad', min: -1, max: 1 }).ok).toBe(false);
  });
  it('only projects display values and refuses overflow', () => {
    expect(displayQuantityValue(Math.PI, 'rad', 'deg')).toBe('180');
    expect(displayQuantityValue(0.125, 'rad/s', 'rad')).toBe('0.125');
    expect(displayQuantityValue(1.25, 'kg', 'deg')).toBe('1.25');
    expect(() => displayQuantityValue(Number.MAX_VALUE, 'rad', 'deg')).toThrow(RangeError);
  });
});
