import { describe, expect, it } from 'vitest';
import {
  EIGEN_LIMITS,
  eigenResidual,
  evaluateEigen,
  solveEigen,
  validateEigen,
  type EigenOperator,
  type EigenSettings,
  type KrylovModel
} from '../../../../src/product/adapters/analysis/data-driven/eigen';
import { restartedArnoldi } from '../../../../src/research/arnoldi';
import { restartedLanczos } from '../../../../src/research/lanczos';
import { eigenApply, eigenSeed } from '../../../../src/product/adapters/analysis/data-driven/eigen-validation';

const settings = (method: EigenSettings['method'] = 'lanczos'): EigenSettings => ({
  method,
  k: 2,
  krylovDim: 8,
  maxRestarts: 20,
  tolerance: 1e-9,
  seed: 's23-eigen',
  which: 'LA'
});
const diagonal = (n: number): EigenOperator => ({
  kind: 'dense',
  matrix: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? n - i : 0)))
});
function laplacian(n: number): EigenOperator {
  return {
    kind: 'sparse',
    dimension: n,
    entries: Array.from({ length: n }, (_, i) => [
      { row: i, column: i, value: 2 },
      ...(i > 0 ? [{ row: i, column: i - 1, value: -1 }] : []),
      ...(i < n - 1 ? [{ row: i, column: i + 1, value: -1 }] : [])
    ]).flat()
  };
}
describe('S23 preserved Krylov adapters', () => {
  it('recovers analytic largest symmetric eigenpairs and preserves native results', () => {
    const operator = diagonal(16),
      s = settings(),
      result = solveEigen(operator, s),
      model = result.model as KrylovModel;
    const native = restartedLanczos((x) => eigenApply(operator, x), {
      dimension: 16,
      numEigenvalues: s.k,
      krylovDim: s.krylovDim,
      maxRestarts: s.maxRestarts,
      tolerance: s.tolerance,
      seed: eigenSeed(s.seed, 16),
      which: s.which
    });
    expect(model.eigenpairs.map((p) => p.value.re)).toEqual(native.eigenpairs.map((p) => p.value));
    expect(model.matVecs).toBe(native.matVecs);
    expect(result.metrics.accepted).toBe(1);
    expect(result.rows[0]![1]).toBeCloseTo(16, 8);
    expect(result.rows[1]![1]).toBeCloseTo(15, 8);
    expect(result.metrics.maximumResidual).toBeLessThanOrEqual(s.tolerance);
  });
  it('recovers the analytic Dirichlet path spectrum in sparse form', () => {
    const n = 64,
      operator = laplacian(n),
      s = { ...settings(), krylovDim: 24, maxRestarts: 40, which: 'SA' as const };
    const result = solveEigen(operator, s);
    expect(result.metrics.accepted).toBe(1);
    expect(result.rows[0]![1]).toBeCloseTo(2 - 2 * Math.cos(Math.PI / (n + 1)), 8);
    expect(result.rows[1]![1]).toBeCloseTo(2 - 2 * Math.cos((2 * Math.PI) / (n + 1)), 8);
  });
  it('recovers a dominant complex pair with independently checked residuals', () => {
    const n = 12;
    const matrix: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? -0.5 : 0))
    );
    matrix[0]![0] = 2;
    matrix[0]![1] = 3;
    matrix[1]![0] = -3;
    matrix[1]![1] = 2;
    for (let i = 2; i < n; i++) matrix[i]![i - 2] = 0.2;
    const operator: EigenOperator = { kind: 'dense', matrix },
      s = settings('arnoldi'),
      result = solveEigen(operator, s);
    expect(result.metrics.accepted).toBe(1);
    for (const pair of (result.model as KrylovModel).eigenpairs) {
      expect(pair.value.re).toBeCloseTo(2, 7);
      expect(Math.abs(pair.value.im)).toBeCloseTo(3, 7);
      expect(eigenResidual(operator, pair)).toBeLessThanOrEqual(s.tolerance);
    }
    const native = restartedArnoldi((x) => eigenApply(operator, x), {
      dimension: n,
      numEigenvalues: s.k,
      krylovDim: s.krylovDim,
      maxRestarts: s.maxRestarts,
      tolerance: s.tolerance,
      seed: eigenSeed(s.seed, n)
    });
    expect((result.model as KrylovModel).eigenpairs.map((p) => p.value)).toEqual(native.eigenpairs.map((p) => p.value));
  });
  it('handles dimension2048 without dense storage', () => {
    const n = 2048,
      operator: EigenOperator = {
        kind: 'sparse',
        dimension: n,
        entries: Array.from({ length: n }, (_, i) => ({ row: i, column: i, value: i === 0 ? 100 : 1 }))
      };
    const result = solveEigen(operator, { ...settings(), k: 1, krylovDim: 12, maxRestarts: 2 });
    expect(result.metrics.accepted).toBe(1);
    expect(result.rows[0]![1]).toBeCloseTo(100, 8);
    expect((result.model as KrylovModel).eigenpairs[0]!.vector.re).toHaveLength(n);
  });
  it('records actual monotonic operator work and supports a cancellation hook', () => {
    const work: number[] = [],
      result = solveEigen(diagonal(16), settings(), (count) => work.push(count));
    expect(work).toEqual(Array.from({ length: result.metrics.matVecs! }, (_, i) => i + 1));
    expect((result.model as KrylovModel).trace).toEqual(work.map((count) => ({ work: count })));
    const cancelled: number[] = [];
    expect(() =>
      solveEigen(diagonal(16), settings(), (count) => {
        cancelled.push(count);
        if (count === 3) throw new Error('cancel hook');
      })
    ).toThrow('cancel hook');
    expect(cancelled).toEqual([1, 2, 3]);
  });
  it('does not report happy breakdown with too few eigenpairs as success', () => {
    const operator: EigenOperator = {
      kind: 'dense' as const,
      matrix: Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0)))
    };
    const result = solveEigen(operator, settings('arnoldi'));
    expect(result.metrics.returned).toBe(1);
    expect(result.metrics.nativeConverged).toBe(1);
    expect(result.metrics.accepted).toBe(0);
    expect(result.warnings.join(' ')).toContain('불변 부분공간');
  });
  it('preserves nonconvergence as a candidate with warnings', () => {
    const result = solveEigen(laplacian(64), { ...settings(), krylovDim: 4, maxRestarts: 1, tolerance: 1e-12 });
    expect(result.metrics.accepted).toBe(0);
    expect(result.metrics.nativeConverged).toBe(0);
    expect(result.warnings.join(' ')).toContain('수렴하지 않았습니다');
    expect(result.metrics.nativeRestarts).toBe(2);
  });
  it('deterministically reevaluates saved vectors and settings without refitting', () => {
    const operator = diagonal(16),
      s = settings(),
      result = solveEigen(operator, s),
      serialized = JSON.stringify(result);
    expect(evaluateEigen(operator, s, JSON.parse(serialized).model)).toEqual(result);
    expect(solveEigen(operator, s)).toEqual(result);
    expect(result.model).not.toBe(evaluateEigen(operator, s, result.model).model);
  });
  it('supports dense nonsymmetric eigenvalues with explicit no-eigenvector semantics', () => {
    const operator: EigenOperator = {
        kind: 'dense',
        matrix: [
          [2, 3],
          [-3, 2]
        ]
      },
      s = { ...settings('general-eigensolver'), k: 1, krylovDim: 2 };
    const result = solveEigen(operator, s);
    expect(result.rows.map((row) => row.slice(1))).toEqual([
      [2, 3],
      [2, -3]
    ]);
    expect(result.metrics.traceError).toBe(0);
    expect(result.metrics.maximumResidual).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('고유값만');
    expect(evaluateEigen(operator, s, result.model)).toEqual(result);
  });
});
describe('S23 operator and model boundaries', () => {
  it.each([
    { kind: 'dense', matrix: [[1, 0], [0]] },
    {
      kind: 'dense',
      matrix: [
        [1, Infinity],
        [0, 1]
      ]
    },
    {
      kind: 'dense',
      matrix: [
        [1, 1e7],
        [0, 1]
      ]
    },
    {
      kind: 'dense',
      matrix: [
        [1, 1e-100],
        [0, 1]
      ]
    },
    { kind: 'sparse', dimension: 2049, entries: [] },
    { kind: 'sparse', dimension: 8, entries: [{ row: 8, column: 0, value: 1 }] },
    { kind: 'sparse', dimension: 8, entries: [{ row: 0.5, column: 0, value: 1 }] },
    {
      kind: 'sparse',
      dimension: 8,
      entries: [
        { row: 0, column: 0, value: 1 },
        { row: 0, column: 0, value: 1 }
      ]
    },
    { kind: 'callback', apply: 'alert(1)' }
  ])('rejects malformed or unsupported operator %j', (operator) => {
    expect(() => validateEigen(operator as EigenOperator, { ...settings(), k: 1, krylovDim: 2 })).toThrow();
  });
  it('rejects nonsymmetric dense and sparse Lanczos inputs', () => {
    expect(() =>
      validateEigen(
        {
          kind: 'dense',
          matrix: [
            [1, 1],
            [0, 1]
          ]
        },
        { ...settings(), k: 1, krylovDim: 2 }
      )
    ).toThrow('대칭');
    expect(() =>
      validateEigen({ kind: 'sparse', dimension: 8, entries: [{ row: 0, column: 1, value: 1 }] }, settings())
    ).toThrow('대칭');
  });
  it('rejects dense overflow, sparse nnz overflow and over-budget work before allocation', () => {
    expect(() => validateEigen(diagonal(65), settings())).toThrow('2–64');
    expect(() =>
      validateEigen(
        {
          kind: 'sparse',
          dimension: 8,
          entries: new Array(EIGEN_LIMITS.nonzeros + 1).fill({ row: 0, column: 0, value: 1 })
        },
        settings()
      )
    ).toThrow('한도');
    const operator: EigenOperator = { kind: 'sparse', dimension: 2048, entries: [] };
    expect(() => validateEigen(operator, { ...settings(), krylovDim: 64, maxRestarts: 40 })).toThrow('계산량');
    expect(() => validateEigen(laplacian(8), settings('general-eigensolver'))).toThrow('조밀');
  });
  it.each([
    { k: 16 },
    { krylovDim: 2 },
    { maxRestarts: 41 },
    { tolerance: NaN },
    { tolerance: 0 },
    { seed: '' },
    { which: 'interior' },
    { future: true }
  ])('rejects invalid setting %j', (patch) => {
    expect(() => validateEigen(diagonal(16), { ...settings(), ...patch } as EigenSettings)).toThrow();
  });
  it('rejects accessors, prototypes, hidden fields, sparse arrays and cycles without executing getters', () => {
    let called = false;
    const accessor = {
      kind: 'dense' as const,
      get matrix() {
        called = true;
        return [
          [1, 0],
          [0, 1]
        ];
      }
    };
    expect(() => validateEigen(accessor, settings())).toThrow('접근자');
    expect(called).toBe(false);
    expect(() => validateEigen(Object.assign(Object.create({ injected: 1 }), diagonal(8)), settings())).toThrow('일반');
    const hidden = Object.defineProperty(diagonal(8), 'hidden', { value: 1 });
    expect(() => validateEigen(hidden, settings())).toThrow('숨김');
    const sparse = { kind: 'dense', matrix: new Array(8) } as EigenOperator;
    expect(() => validateEigen(sparse, settings())).toThrow('한도');
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => evaluateEigen(diagonal(8), settings(), cyclic)).toThrow();
  });
  it.each(['residual', 'vector', 'nativeConverged', 'trace', 'method', 'extra'])(
    'rejects forged persisted %s',
    (field) => {
      const operator = diagonal(16),
        s = settings(),
        model = structuredClone(solveEigen(operator, s).model) as unknown as Record<string, unknown>,
        pairs = model.eigenpairs as Record<string, unknown>[];
      if (field === 'residual') pairs[0]!.residual = 0.1;
      if (field === 'vector') (pairs[0]!.vector as { re: number[] }).re[0] = 2;
      if (field === 'nativeConverged') model.nativeConverged = false;
      if (field === 'trace') (model.trace as { work: number }[])[0]!.work = 2;
      if (field === 'method') model.method = 'arnoldi';
      if (field === 'extra') model.extra = true;
      expect(() => evaluateEigen(operator, s, model)).toThrow();
    }
  );
  it('rejects forged dense spectra and models evaluated on changed source data', () => {
    const operator = diagonal(8),
      s = settings('general-eigensolver'),
      result = solveEigen(operator, s),
      model = structuredClone(result.model) as unknown as { values: { re: number; im: number }[] };
    model.values[0]!.re += 1;
    expect(() => evaluateEigen(operator, s, model)).toThrow('재계산');
    const krylov = solveEigen(operator, settings()).model;
    expect(() =>
      evaluateEigen(
        {
          kind: 'dense',
          matrix: Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 20 - i : 0)))
        },
        settings(),
        krylov
      )
    ).toThrow('잔차');
  });
  it('cannot accept duplicate accurate vectors as multiple eigenpairs', () => {
    const operator = diagonal(16),
      s = settings(),
      model = structuredClone(solveEigen(operator, s).model) as unknown as { eigenpairs: unknown[] };
    model.eigenpairs[1] = structuredClone(model.eigenpairs[0]);
    const result = evaluateEigen(operator, s, model);
    expect(result.metrics.accepted).toBe(0);
    expect(result.metrics.independentVectors).toBe(1);
    expect(result.warnings.join(' ')).toContain('선형 독립');
  });
  it('rejects a forged overflowing recomputed residual instead of comparing Infinity to Infinity', () => {
    const operator = diagonal(16),
      s = settings(),
      model = structuredClone(solveEigen(operator, s).model) as unknown as {
        eigenpairs: { value: { re: number }; residual: number }[];
      };
    model.eigenpairs[0]!.value.re = 1e308;
    model.eigenpairs[0]!.residual = 1e308;
    expect(() => evaluateEigen(operator, s, model)).toThrow('잔차');
  });
});
