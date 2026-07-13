import { describe, expect, it } from 'vitest';
import {
  adaptiveRefinement,
  boundaryRefinement,
  budgetAllows,
  DEFAULT_DESIGN_BUDGET,
  factorialGrid,
  generateDesign,
  latinHypercube,
  marginalUniformity,
  sobolSequence,
  uncertaintyResampling,
  type EvaluatedPoint,
  type StudyVariable
} from '../src/research/experimentDesign';

const vars2: StudyVariable[] = [
  { key: 'theta1', min: -1, max: 1 },
  { key: 'damping', min: 0, max: 0.5 }
];

describe('multi-dimensional samplers', () => {
  it('sobol points are deterministic, in [0,1), and low-discrepancy', () => {
    const a = sobolSequence(3, 64);
    const b = sobolSequence(3, 64);
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    for (const point of a) {
      expect(point).toHaveLength(3);
      for (const coordinate of point) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThan(1);
      }
    }
    // 64 Sobol points cover each axis better than the worst-case random gap.
    expect(marginalUniformity(a, 3)).toBeLessThan(0.1);
    // Dimensions are not identical copies of each other.
    expect(a.some((point) => Math.abs(point[0]! - point[1]!) > 1e-9)).toBe(true);
  });

  it('latin hypercube stratifies every marginal', () => {
    const n = 20;
    const points = latinHypercube(2, n, 'seed-a');
    expect(points).toHaveLength(n);
    for (let j = 0; j < 2; j += 1) {
      const bins = new Set(points.map((point) => Math.floor(point[j]! * n)));
      expect(bins.size).toBe(n); // exactly one sample per stratum
    }
    // Deterministic per seed, different across seeds.
    expect(latinHypercube(2, n, 'seed-a')).toEqual(points);
    expect(latinHypercube(2, n, 'seed-b')).not.toEqual(points);
  });

  it('factorial grid covers corners and truncates to count', () => {
    const points = factorialGrid(2, 9);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1]).toEqual([1, 1]);
  });

  it('generateDesign scales to variable ranges and honours replicates + budget', () => {
    const design = generateDesign(vars2, 'sobol', 10, { replicates: 2 });
    expect(design).toHaveLength(20);
    for (const point of design) {
      expect(point.values.theta1).toBeGreaterThanOrEqual(-1);
      expect(point.values.theta1).toBeLessThanOrEqual(1);
      expect(point.values.damping).toBeGreaterThanOrEqual(0);
      expect(point.values.damping).toBeLessThanOrEqual(0.5);
    }
    expect(design.filter((point) => point.origin === 'replicate')).toHaveLength(10);

    const capped = generateDesign(vars2, 'latin-hypercube', 100, {
      budget: { maxPoints: 12, maxTimeMs: 1, maxFailures: 1 }
    });
    expect(capped.length).toBeLessThanOrEqual(12);
  });
});

describe('adaptive refinement', () => {
  const evaluated: EvaluatedPoint[] = [
    { values: { theta1: -1, damping: 0.1 }, lambdaMax: -0.2, lambdaStdError: 0.01 },
    { values: { theta1: -0.5, damping: 0.1 }, lambdaMax: -0.1, lambdaStdError: 0.01 },
    { values: { theta1: 0.5, damping: 0.1 }, lambdaMax: 1.4, lambdaStdError: 0.01 },
    { values: { theta1: 1, damping: 0.1 }, lambdaMax: 1.5, lambdaStdError: 0.3 }
  ];

  it('proposes midpoints across the steepest lambda gradients', () => {
    const proposals = adaptiveRefinement(evaluated, vars2, 2);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.length).toBeLessThanOrEqual(2);
    // The steepest gradient is between theta1=-0.5 (λ=-0.1) and theta1=0.5 (λ=1.4).
    expect(proposals[0]!.values.theta1).toBeCloseTo(0, 5);
    expect(proposals[0]!.origin).toBe('adaptive');
  });

  it('refines the lambda sign-change boundary with the tightest brackets first', () => {
    const proposals = boundaryRefinement(evaluated, vars2, 4);
    expect(proposals.length).toBeGreaterThan(0);
    // All proposals bisect sign-changing pairs.
    for (const proposal of proposals) expect(proposal.origin).toBe('boundary');
    // Tightest sign-change bracket is (-0.5, 0.5) -> midpoint 0.
    expect(proposals[0]!.values.theta1).toBeCloseTo(0, 5);
  });

  it('resamples only points whose uncertainty is far above the median', () => {
    const proposals = uncertaintyResampling(evaluated, 4, 2);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.values.theta1).toBe(1);
    expect(proposals[0]!.origin).toBe('uncertainty');
  });

  it('returns nothing for degenerate inputs', () => {
    expect(adaptiveRefinement([], vars2)).toEqual([]);
    expect(boundaryRefinement([evaluated[0]!], vars2)).toEqual([]);
    expect(uncertaintyResampling([])).toEqual([]);
  });
});

describe('budget controls', () => {
  it('limits by points, time, and failures with explicit reasons', () => {
    const budget = { maxPoints: 10, maxTimeMs: 1000, maxFailures: 3 };
    expect(budgetAllows(budget, { pointsRun: 0, elapsedMs: 0, failures: 0 }).allowed).toBe(true);
    expect(budgetAllows(budget, { pointsRun: 10, elapsedMs: 0, failures: 0 }).reason).toContain('point budget');
    expect(budgetAllows(budget, { pointsRun: 0, elapsedMs: 1001, failures: 0 }).reason).toContain('time budget');
    expect(budgetAllows(budget, { pointsRun: 0, elapsedMs: 0, failures: 3 }).reason).toContain('failure budget');
    expect(DEFAULT_DESIGN_BUDGET.maxPoints).toBeGreaterThan(0);
  });
});
