import { describe, expect, it } from 'vitest';
import {
  displayedControlValue,
  epsilonCanonicalValue,
  formatPreciseDecimal,
  parseScientificValue,
  precisionCanonicalValue,
  setEpsilonCanonicalValue
} from '../src/app/precisionControls';

describe('scientific precision entry', () => {
  it('parses rational pi forms and explicit degree values into canonical radians', () => {
    expect(parseScientificValue('2π/3', { min: -Math.PI, max: Math.PI }).value).toBeCloseTo((2 * Math.PI) / 3, 15);
    expect(parseScientificValue('-3*pi/4', { min: -Math.PI, max: Math.PI }).value).toBeCloseTo((-3 * Math.PI) / 4, 15);
    expect(parseScientificValue('120°', { min: -Math.PI, max: Math.PI }).value).toBeCloseTo((2 * Math.PI) / 3, 15);
    expect(parseScientificValue('120 deg', { min: -Math.PI, max: Math.PI }).value).toBeCloseTo((2 * Math.PI) / 3, 15);
  });

  it('uses the display preference only for unitless decimal input', () => {
    expect(parseScientificValue('120', { defaultUnit: 'deg' }).value).toBeCloseTo((2 * Math.PI) / 3, 15);
    expect(parseScientificValue('2*pi/3', { defaultUnit: 'deg' }).value).toBeCloseTo((2 * Math.PI) / 3, 15);
    expect(parseScientificValue('2.0943951023931953', { defaultUnit: 'rad' }).value).toBe(2.0943951023931953);
  });

  it('rejects angular suffixes for scalars and accepts per-second velocity units', () => {
    expect(parseScientificValue('180deg', { angularUnits: 'none' })).toMatchObject({ ok: false, reason: 'syntax' });
    expect(parseScientificValue('180deg/s', { angularUnits: 'angular-velocity' }).value).toBeCloseTo(Math.PI, 15);
    expect(parseScientificValue('1rad/s', { angularUnits: 'angle' })).toMatchObject({
      ok: false,
      reason: 'syntax'
    });
  });

  it('accepts one locale decimal comma but rejects prefixes and executable syntax', () => {
    expect(parseScientificValue('2,5').value).toBe(2.5);
    for (const source of ['1abc', 'pi+1', '2**pi', 'globalThis.alert(1)', '1,234,5', '']) {
      expect(parseScientificValue(source).ok).toBe(false);
    }
  });

  it('preserves a full-precision off-step value through display formatting', () => {
    const canonical = (2 * Math.PI) / 3;
    const serialized = formatPreciseDecimal(canonical);
    expect(Number(serialized)).toBe(canonical);
    const degrees = formatPreciseDecimal(displayedControlValue(canonical, 'angle', 'deg'));
    expect(Number(degrees)).toBeCloseTo(120, 13);
  });

  it('enforces canonical bounds after unit conversion', () => {
    expect(parseScientificValue('181 deg', { min: -Math.PI, max: Math.PI }).reason).toBe('range');
    expect(parseScientificValue('1e-4 rad', { min: 1e-7, max: 1e-2 }).value).toBe(1e-4);
  });

  it('retains the authored canonical value and falls back when a modular control is absent', () => {
    const range = {
      value: '0.1234567890123456',
      dataset: { precisionCanonical: '0.12345678901234567' }
    } as unknown as HTMLInputElement;
    expect(precisionCanonicalValue(range, -4)).toBe(0.12345678901234567);
    expect(precisionCanonicalValue(null, -4)).toBe(-4);
  });

  it('keeps an arbitrary epsilon exact while its range stores only a log projection', () => {
    const epsilon = 0.00012345678901234567;
    expect(Object.is(epsilon, 10 ** Math.log10(epsilon))).toBe(false);
    const range = {
      id: 'ensEps',
      value: '-4',
      dataset: { precisionCanonical: '-4' }
    } as unknown as HTMLInputElement;

    setEpsilonCanonicalValue(range, epsilon);

    expect(range.value).toBe(String(Math.log10(epsilon)));
    expect(range.dataset.precisionCanonical).toBe(String(Math.log10(epsilon)));
    expect(range.dataset.precisionEpsilonCanonical).toBe(String(epsilon));
    expect(epsilonCanonicalValue(range)).toBe(epsilon);

    range.value = '-3.5';
    expect(epsilonCanonicalValue(range)).toBe(10 ** -3.5);
    expect(range.dataset.precisionEpsilonCanonical).toBe(String(10 ** -3.5));
  });
});
