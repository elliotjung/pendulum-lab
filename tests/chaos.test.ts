import { describe, expect, test } from 'vitest';
import {
  maximalLyapunov,
  lyapunovSpectrum,
  kaplanYorkeDimension,
  saliIndicator,
  fliIndicator,
  buildPoincareSection,
  poincareSection,
  poincareSectionPreset,
  bifurcationDiagram,
  distinctValueCount
} from '../src/chaos/index';
import { rhsDriven, DAMPED_DRIVEN_CHAOS_PRESET, type DrivenParameters } from '../src/physics/driven';
import { rhsDouble, energyDouble } from '../src/physics/double';
import type { Derivative } from '../src/physics/types';

const driven = (s: Float64Array, o: Float64Array): void => {
  rhsDriven(s, DAMPED_DRIVEN_CHAOS_PRESET, o);
};
const oscillator = (s: Float64Array, o: Float64Array): void => {
  o[0] = s[1] ?? 0;
  o[1] = -(s[0] ?? 0);
};
const dpParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const doublePendulum = (s: Float64Array, o: Float64Array): void => {
  rhsDouble(s, dpParams, 0, o);
};

describe('maximal Lyapunov exponent (Benettin)', () => {
  test('is clearly positive for the damped-driven chaos preset', () => {
    const result = maximalLyapunov(new Float64Array([0.2, 0, 0]), driven, { steps: 20_000 });
    expect(result.lambdaMax).toBeGreaterThan(0.03);
    expect(result.convergence.length).toBeGreaterThan(10);
  });

  test('is ~0 for the (regular) harmonic oscillator', () => {
    const result = maximalLyapunov(new Float64Array([1, 0]), oscillator, { steps: 10_000 });
    expect(Math.abs(result.lambdaMax)).toBeLessThan(0.01);
  });
});

describe('Lyapunov input validation', () => {
  const shortRun = { steps: 10, renormEvery: 1, transientSteps: 0 } as const;

  test('rejects a zero/non-integer renormalization interval instead of hanging or returning an empty estimate', () => {
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, renormEvery: 0 })).toThrow(
      /renormEvery must be a positive integer/
    );
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, renormEvery: 1.5 })).toThrow(
      /renormEvery must be a positive integer/
    );
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, renormEvery: 11 })).toThrow(
      /renormEvery must not exceed steps/
    );
  });

  test('rejects non-finite or structurally invalid numeric settings and states', () => {
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, dt: Number.NaN })).toThrow(
      /dt must be positive and finite/
    );
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, steps: Infinity })).toThrow(
      /steps must be a positive integer/
    );
    expect(() => maximalLyapunov([1, 0], oscillator, { ...shortRun, transientSteps: -1 })).toThrow(
      /transientSteps must be a non-negative integer/
    );
    expect(() => maximalLyapunov([Number.NaN, 0], oscillator, shortRun)).toThrow(/state0 components must be finite/);
    expect(() => lyapunovSpectrum([1, 0], oscillator, 0, shortRun)).toThrow(/count must be a positive integer/);
  });
});

describe('full Lyapunov spectrum', () => {
  test('chaotic double pendulum: positive leader, Hamiltonian pairing, sum ~ 0', () => {
    const result = lyapunovSpectrum(new Float64Array([2.0, 2.0, 0, 0]), doublePendulum, 4, { steps: 18_000 });
    expect(result.spectrum.length).toBe(4);
    // Sorted descending.
    for (let i = 1; i < result.spectrum.length; i += 1) {
      expect(result.spectrum[i - 1] ?? 0).toBeGreaterThanOrEqual(result.spectrum[i] ?? 0);
    }
    // Positive maximal exponent => chaos.
    expect(result.spectrum[0] ?? 0).toBeGreaterThan(0.1);
    // Conservative system: the exponents sum to ~0 (Liouville / symplectic pairing).
    expect(Math.abs(result.sum)).toBeLessThan(0.1);
    // Symplectic pairing: largest ~ -smallest.
    expect(Math.abs((result.spectrum[0] ?? 0) + (result.spectrum[3] ?? 0))).toBeLessThan(0.1);
    expect(result.kaplanYorkeDimension).toBeGreaterThan(2);
    expect(result.kaplanYorkeDimension).toBeLessThanOrEqual(4);
  });
});

describe('Kaplan-Yorke dimension formula', () => {
  test('interpolates between integer dimensions', () => {
    // partial sum 1+0 = 1 >= 0, next exponent -3: D = 2 + 1/3.
    expect(kaplanYorkeDimension([1, 0, -3])).toBeCloseTo(2 + 1 / 3, 10);
  });
  test('returns the full count when every exponent is non-negative', () => {
    expect(kaplanYorkeDimension([1, 1, 1])).toBe(3);
  });
  test('returns 0 when the leading exponent is negative', () => {
    expect(kaplanYorkeDimension([-1, -2])).toBe(0);
  });
});

describe('SALI', () => {
  test('decays to ~0 for chaos but stays O(1) for regular motion', () => {
    const chaos = saliIndicator(new Float64Array([0.2, 0, 0]), driven, { steps: 8_000 });
    const regular = saliIndicator(new Float64Array([1, 0]), oscillator, { steps: 8_000 });
    // SALI decays exponentially for chaos; the instantaneous value fluctuates as
    // it falls, so assert a comfortable threshold far below the regular O(1) case.
    expect(chaos.finalSali).toBeLessThan(0.05);
    expect(regular.finalSali).toBeGreaterThan(1.0);
    expect(regular.finalSali).toBeGreaterThan(chaos.finalSali * 100);
  });
});

describe('FLI', () => {
  test('grows large for chaos and stays small for regular motion', () => {
    const chaos = fliIndicator(new Float64Array([0.2, 0, 0]), driven, { steps: 6_000 });
    const regular = fliIndicator(new Float64Array([1, 0]), oscillator, { steps: 6_000 });
    expect(chaos.fli).toBeGreaterThan(5);
    expect(regular.fli).toBeLessThan(1);
    expect(chaos.fli).toBeGreaterThan(regular.fli * 10);
  });
});

describe('Poincare section sampler', () => {
  test('collects on-section points for the double pendulum (theta2 = 0, rising)', () => {
    const state0 = new Float64Array([1.0, 0.4, 0, 0]);
    const e0 = energyDouble(state0, dpParams).total;
    const result = poincareSection(state0, doublePendulum, {
      section: (s) => s[1] ?? 0,
      direction: 'rising',
      dt: 5e-4,
      maxTime: 40
    });
    expect(result.points.length).toBeGreaterThan(3);
    for (const p of result.points) {
      expect(Math.abs(p[1] ?? 1)).toBeLessThan(1e-4);
      expect(p[3] ?? -1).toBeGreaterThan(0); // rising => omega2 > 0
      expect(Math.abs((energyDouble(p, dpParams).total - e0) / e0)).toBeLessThan(1e-4);
    }
  });

  test('preset builder supports theta, energy, stroboscopic sections, and transient discard', () => {
    const theta = buildPoincareSection({ kind: 'theta', index: 1, value: 0, direction: 'rising' });
    expect(theta.label).toContain('theta[1]');
    expect(theta.direction).toBe('rising');
    expect(theta.section(new Float64Array([0, 0.25]))).toBeCloseTo(0.25);

    const energy = buildPoincareSection({ kind: 'energy', value: 1, energy: (s) => (s[0] ?? 0) ** 2 });
    expect(energy.section(new Float64Array([2]))).toBe(3);

    const rhs: Derivative = (s, o) => {
      o[0] = 1;
    };
    const strobe = poincareSectionPreset(new Float64Array([-0.1]), rhs, {
      preset: { kind: 'stroboscopic', phaseIndex: 0, period: 1, phase: 0 },
      dt: 0.01,
      maxTime: 3.2,
      transientDiscard: 1,
      maxPoints: 2
    });
    expect(strobe.points).toHaveLength(2);
    expect(strobe.times[0]).toBeCloseTo(1.1, 2);
    expect(strobe.times[1]).toBeCloseTo(2.1, 2);
  });
});

describe('bifurcation diagram', () => {
  test('produces one finite-valued column per swept parameter', () => {
    const amplitudes = [0.9, 1.07, 1.15, 1.35];
    const columns = bifurcationDiagram<number>({
      parameters: amplitudes,
      makeRhs: (A) => {
        const params: DrivenParameters = { ...DAMPED_DRIVEN_CHAOS_PRESET, driveAmplitude: A };
        return (s, o) => {
          rhsDriven(s, params, o);
        };
      },
      makeState0: () => new Float64Array([0.2, 0, 0]),
      // Stroboscopic-style section: drive phase crossing multiples of 2*pi.
      section: (s) => Math.sin(0.5 * (s[2] ?? 0)),
      direction: 'rising',
      observable: (s) => s[0] ?? 0,
      dt: 5e-3,
      maxTime: 400,
      transientCrossings: 20,
      maxPointsPerParam: 60
    });
    expect(columns.length).toBe(amplitudes.length);
    for (const col of columns) {
      expect(col.values.length).toBeGreaterThan(0);
      for (const v of col.values) expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('distinctValueCount separates a period-2 set from a scattered set', () => {
    expect(distinctValueCount([1.0, 2.0, 1.0, 2.0, 1.0])).toBe(2);
    expect(distinctValueCount([0.1, 0.5, 0.9, 1.3, 1.7])).toBe(5);
  });
});
