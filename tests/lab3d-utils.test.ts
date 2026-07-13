import { describe, expect, it } from 'vitest';
import { CHAIN_COLORS, DOUBLE_STRING_PRESETS, parseClampedNumberList } from '../src/app/parity/lab3d-utils';

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
};

describe('lab3d pure helpers', () => {
  it('parses comma and whitespace lists, pads from the previous value, and clamps', () => {
    expect(parseClampedNumberList('1, 2.5 99', 5, 0.8, 0.2, 3, clampNumber)).toEqual([1, 2.5, 3, 3, 3]);
  });

  it('falls back when no finite values are present', () => {
    expect(parseClampedNumberList('nan nope', 3, 0.8, 0.2, 3, clampNumber)).toEqual([0.8, 0.8, 0.8]);
  });

  it('keeps display palettes and double-string presets explicit', () => {
    expect(CHAIN_COLORS).toHaveLength(5);
    expect(Object.keys(DOUBLE_STRING_PRESETS)).toEqual(['gentle-swing', 'chaotic-taut', 'slack-cascade', 'whirling']);
    expect(DOUBLE_STRING_PRESETS['slack-cascade']?.theta1).toBeGreaterThan(2);
  });
});
