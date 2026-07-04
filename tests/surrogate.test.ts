import { describe, it, expect } from 'vitest';
import {
  fitPolynomialChaos,
  totalDegreeMultiIndices,
  type SurrogateVariable,
  type PolynomialChaosSample
} from '../src/research/surrogate';
import { mulberry32 } from '../src/physics/variational';

function sampleGrid(
  variables: SurrogateVariable[],
  perAxis: number,
  f: (inputs: number[]) => number
): PolynomialChaosSample[] {
  // Deterministic tensor grid over the variable ranges.
  const axes = variables.map((v) =>
    Array.from({ length: perAxis }, (_, i) => v.min + ((v.max - v.min) * i) / (perAxis - 1))
  );
  const samples: PolynomialChaosSample[] = [];
  const dim = variables.length;
  const indices = new Array(dim).fill(0);
  const total = perAxis ** dim;
  for (let n = 0; n < total; n += 1) {
    let rem = n;
    for (let j = 0; j < dim; j += 1) {
      indices[j] = rem % perAxis;
      rem = Math.floor(rem / perAxis);
    }
    const inputs = indices.map((i: number, j: number) => axes[j]![i]!);
    samples.push({ inputs, output: f(inputs) });
  }
  return samples;
}

describe('totalDegreeMultiIndices', () => {
  it('enumerates {α : Σα ≤ p} with the correct count C(d+p, p)', () => {
    const idx = totalDegreeMultiIndices(3, 2);
    expect(idx.length).toBe(10); // C(5,2) = 10
    expect(idx[0]).toEqual([0, 0, 0]);
    for (const a of idx) expect(a.reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(2);
  });

  it('rejects dimensions and degrees that do not define a basis', () => {
    expect(() => totalDegreeMultiIndices(0, 2)).toThrow(/dimension/);
    expect(() => totalDegreeMultiIndices(2, -1)).toThrow(/degree/);
  });
});

describe('fitPolynomialChaos — exactness on a representable polynomial', () => {
  const variables: SurrogateVariable[] = [
    { name: 'x1', min: -1, max: 1 },
    { name: 'x2', min: -1, max: 1 }
  ];
  // f = x1^2 + x1*x2 is exactly representable at degree 2.
  const f = (inp: number[]): number => inp[0]! * inp[0]! + inp[0]! * inp[1]!;
  const samples = sampleGrid(variables, 6, f);
  const model = fitPolynomialChaos(variables, samples, { degree: 2 });

  it('reproduces the function essentially exactly (R² ≈ 1, tiny prediction error)', () => {
    expect(model.rSquared).toBeGreaterThan(1 - 1e-9);
    const rng = mulberry32(99);
    for (let t = 0; t < 25; t += 1) {
      const p = [2 * rng() - 1, 2 * rng() - 1];
      expect(model.predict(p)).toBeCloseTo(f(p), 8);
    }
  });

  it('matches the closed-form mean and variance', () => {
    // For uniform on [-1,1]: mean = E[x1^2] = 1/3.
    // Var = Var(x1^2) + Var(x1 x2) = 4/45 + 1/9 = 1/5.
    expect(model.mean).toBeCloseTo(1 / 3, 8);
    expect(model.variance).toBeCloseTo(1 / 5, 8);
  });

  it('matches the closed-form Sobol indices', () => {
    // S1 = Var(x1^2)/Var = (4/45)/(1/5) = 4/9; S2 = 0 (no x2-only term).
    // S_T1 = 1 (x1 is in every variance term); S_T2 = Var(x1 x2)/Var = 5/9.
    expect(model.firstOrderSobol[0]!).toBeCloseTo(4 / 9, 6);
    expect(model.firstOrderSobol[1]!).toBeCloseTo(0, 6);
    expect(model.totalSobol[0]!).toBeCloseTo(1, 6);
    expect(model.totalSobol[1]!).toBeCloseTo(5 / 9, 6);
  });
});

describe('fitPolynomialChaos — additive linear model Sobol', () => {
  it('splits variance by coefficient² for f = 3 x1 − 2 x2', () => {
    const variables: SurrogateVariable[] = [
      { name: 'x1', min: -1, max: 1 },
      { name: 'x2', min: -1, max: 1 }
    ];
    const f = (inp: number[]): number => 3 * inp[0]! - 2 * inp[1]!;
    const samples = sampleGrid(variables, 5, f);
    const model = fitPolynomialChaos(variables, samples, { degree: 1 });

    // Var = 9·(1/3) + 4·(1/3) = 13/3; S1 = 9/13, S2 = 4/13; purely additive so S_Ti = S_i.
    expect(model.mean).toBeCloseTo(0, 8);
    expect(model.variance).toBeCloseTo(13 / 3, 7);
    expect(model.firstOrderSobol[0]!).toBeCloseTo(9 / 13, 6);
    expect(model.firstOrderSobol[1]!).toBeCloseTo(4 / 13, 6);
    expect(model.totalSobol[0]!).toBeCloseTo(9 / 13, 6);
    expect(model.totalSobol[1]!).toBeCloseTo(4 / 13, 6);
    const s1 = model.firstOrderSobol[0]! + model.firstOrderSobol[1]!;
    expect(s1).toBeCloseTo(1, 6); // additive ⇒ first-order indices sum to 1
  });
});

describe('fitPolynomialChaos — smooth non-polynomial approximation', () => {
  it('emulates exp(0.5 x) to high accuracy at sufficient degree', () => {
    const variables: SurrogateVariable[] = [{ name: 'x', min: -1, max: 1 }];
    const f = (inp: number[]): number => Math.exp(0.5 * inp[0]!);
    const samples = sampleGrid(variables, 30, f);
    const model = fitPolynomialChaos(variables, samples, { degree: 6 });
    expect(model.rSquared).toBeGreaterThan(0.99999);
    const rng = mulberry32(7);
    for (let t = 0; t < 20; t += 1) {
      const x = 2 * rng() - 1;
      expect(model.predict([x])).toBeCloseTo(f([x]), 5);
    }
  });

  it('throws when under-determined', () => {
    const variables: SurrogateVariable[] = [{ name: 'x', min: -1, max: 1 }];
    const samples: PolynomialChaosSample[] = [{ inputs: [0], output: 1 }];
    expect(() => fitPolynomialChaos(variables, samples, { degree: 4 })).toThrow(/under-determined/);
  });
});

describe('fitPolynomialChaos input contracts and degenerate outputs', () => {
  it('treats a constant response as zero variance with zero Sobol mass', () => {
    const variables: SurrogateVariable[] = [
      { name: 'x1', min: -1, max: 1 },
      { name: 'x2', min: -1, max: 1 }
    ];
    const samples = sampleGrid(variables, 4, () => 2.75);
    const model = fitPolynomialChaos(variables, samples, { degree: 1 });

    expect(model.mean).toBeCloseTo(2.75, 12);
    expect(model.variance).toBeCloseTo(0, 12);
    expect(model.rSquared).toBe(1);
    expect(model.firstOrderSobol).toEqual([0, 0]);
    expect(model.totalSobol).toEqual([0, 0]);
    expect(model.predict([0.33, -0.75])).toBeCloseTo(2.75, 12);
  });

  it('fails loudly for inconsistent sample dimension and zero-width variables', () => {
    const variables: SurrogateVariable[] = [{ name: 'x', min: -1, max: 1 }];
    expect(() => fitPolynomialChaos(variables, [{ inputs: [0, 1], output: 1 }, { inputs: [1, 0], output: 2 }], { degree: 1 }))
      .toThrow(/dimension mismatch/);

    const zeroWidth: SurrogateVariable[] = [{ name: 'locked', min: 2, max: 2 }];
    expect(() => fitPolynomialChaos(zeroWidth, [{ inputs: [2], output: 1 }, { inputs: [2], output: 1 }], { degree: 1 }))
      .toThrow(/zero range/);
  });
});
