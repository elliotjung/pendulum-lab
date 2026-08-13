import { describe, expect, test } from 'vitest';
import { fftInPlace, ifftInPlace } from '../src/physics/fft';
import { locateTransition, refineCrossing } from '../src/physics/eventLocator';
import {
  choleskyFactor,
  choleskySolveFactored,
  solveCholeskyInPlace,
  solveLinearInPlace
} from '../src/physics/linearSolve';
import { generateStudyValues } from '../src/research/researchSampling';
import {
  captureReferralAttribution,
  parseReferralAttribution,
  REFERRAL_SESSION_KEY
} from '../src/runtime/referralAttribution';
import { Float64RingBuffer, type Float64RingBufferDescriptor } from '../src/runtime/sharedRingBuffer';
import {
  buildBrownianGrid,
  commutativeMilsteinStep,
  eulerMaruyamaStep,
  fixedGridLangevinPath,
  gaussianSampler,
  milsteinStep,
  runAdaptiveLangevinPath,
  runLangevinEnsemble,
  stochasticHeunStratonovichStep,
  type LangevinEnsembleSpec,
  type MatrixSdeScratch
} from '../src/physics/stochastic';

describe('FFT hostile-input boundary', () => {
  test('rejects empty, mismatched, aliased, overlapping, and non-finite buffers', () => {
    expect(() => fftInPlace(new Float64Array(), new Float64Array())).toThrow(/positive power/);
    expect(() => fftInPlace(new Float64Array(2), new Float64Array(4))).toThrow(/equal length/);
    const alias = new Float64Array(2);
    expect(() => fftInPlace(alias, alias)).toThrow(/alias/);
    const backing = new ArrayBuffer(4 * Float64Array.BYTES_PER_ELEMENT);
    expect(() => fftInPlace(new Float64Array(backing, 0, 2), new Float64Array(backing, 8, 2))).toThrow(/overlap/);
    expect(() => fftInPlace(Float64Array.of(1, Number.NaN), new Float64Array(2))).toThrow(/finite/);
  });

  test('inverse validation occurs before conjugation and a one-point transform is stable', () => {
    const re = Float64Array.of(1, 2);
    const im = Float64Array.of(3, Number.POSITIVE_INFINITY);
    expect(() => ifftInPlace(re, im)).toThrow(/finite/);
    expect(Array.from(im)).toEqual([3, Number.POSITIVE_INFINITY]);
    const singleton = Float64Array.of(4);
    const zero = Float64Array.of(0);
    fftInPlace(singleton, zero);
    ifftInPlace(singleton, zero);
    expect(Array.from(singleton)).toEqual([4]);
  });
});

describe('event-refinement boundary', () => {
  test('validates brackets and solver options', () => {
    expect(() => refineCrossing((t) => t, 1, 0, 1, -1)).toThrow(/lo <= hi/);
    expect(() => refineCrossing((t) => t + 2, 0, 1, 2, 3)).toThrow(/sign change/);
    expect(() => refineCrossing((t) => t, 0, 1, -1, 1, { tol: 0 })).toThrow(/tol/);
    expect(() => refineCrossing((t) => t, 0, 1, -1, 1, { maxIterations: 1.5 })).toThrow(/maxIterations/);
    expect(() => refineCrossing(() => Number.NaN, 0, 1, -1, 1)).toThrow(/non-finite/);
  });

  test('returns exact endpoint roots and rejects invalid transition spans', () => {
    expect(refineCrossing((t) => t - 1, 0, 1, -1, 0)).toMatchObject({ tBefore: 1, tAfter: 1, iterations: 0 });
    expect(() => locateTransition((t) => t, 0, -1, 0)).toThrow(/positive and finite/);
    expect(() => locateTransition((t) => t, 1, Number.NaN, 0)).toThrow(/endpoint values/);
  });
});

describe('linear-algebra boundary', () => {
  test('rejects invalid orders, options, and malformed factored solves', () => {
    expect(solveLinearInPlace(Float64Array.of(1), Float64Array.of(1), Number.NaN).reason).toBe('dimension-mismatch');
    expect(() => solveLinearInPlace(Float64Array.of(1), Float64Array.of(1), 1, { pivotTolerance: Number.NaN })).toThrow(
      /pivotTolerance/
    );
    expect(() => choleskyFactor(Float64Array.of(1), 2, Float64Array.of(0))).toThrow(/dimensions/);
    expect(() => choleskySolveFactored(Float64Array.of(0), Float64Array.of(1), 1)).toThrow(/diagonal/);
    expect(() => choleskySolveFactored(Float64Array.of(1, 0, Number.NaN, 1), Float64Array.of(1, 1), 2)).toThrow(
      /lower factor/
    );
    expect(() => choleskySolveFactored(Float64Array.of(1), Float64Array.of(Number.NaN), 1)).toThrow(/rhs/);
    expect(() =>
      solveCholeskyInPlace(Float64Array.of(1), Float64Array.of(1), 1, Float64Array.of(0), {
        fallbackPolicy: 'invalid' as 'throw'
      })
    ).toThrow(/fallbackPolicy/);
  });

  test('reports arithmetic overflow rather than claiming a finite solution', () => {
    const result = solveLinearInPlace(Float64Array.of(1e308, 1e308, 1e308, -1e308), Float64Array.of(1e308, -1e308), 2);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('non-finite-output');
  });

  test('Cholesky honors its lower-triangle contract in validation, residuals, and thrown context', () => {
    const rhs = Float64Array.of(1, 2);
    const result = solveCholeskyInPlace(Float64Array.of(4, Number.NaN, 1, 3), rhs, 2, new Float64Array(4), {
      diagnostics: true
    });
    expect(result.ok).toBe(true);
    expect(rhs[0]).toBeCloseTo(1 / 11, 14);
    expect(rhs[1]).toBeCloseTo(7 / 11, 14);
    expect(result.relativeResidual).toBeLessThan(1e-14);
    expect(() =>
      solveCholeskyInPlace(Float64Array.of(-1), Float64Array.of(1), 1, Float64Array.of(0), {
        fallbackPolicy: 'throw'
      })
    ).toThrow(/solveCholeskyInPlace: linear solve failed/);
  });

  test('Cholesky rejects overlapping views and preserves the rhs on triangular overflow', () => {
    const aliasedMatrix = Float64Array.of(4, 0, 1, 3);
    const matrixBefore = Array.from(aliasedMatrix);
    expect(() => choleskyFactor(aliasedMatrix, 2, aliasedMatrix)).toThrow(/matrix and factor.*overlap/);
    expect(Array.from(aliasedMatrix)).toEqual(matrixBefore);

    const backing = new ArrayBuffer(8 * Float64Array.BYTES_PER_ELEMENT);
    const factor = new Float64Array(backing, 0, 4);
    factor.set([2, 0, 0.5, 1]);
    const overlappingRhs = new Float64Array(backing, 2 * Float64Array.BYTES_PER_ELEMENT, 2);
    expect(() => choleskySolveFactored(factor, overlappingRhs, 2)).toThrow(/factor and rhs.*overlap/);

    const matrix = Float64Array.of(4, 0, 1, 3);
    const matrixRhsBacking = new Float64Array(matrix.buffer, 0, 2);
    expect(() => solveCholeskyInPlace(matrix, matrixRhsBacking, 2, new Float64Array(4))).toThrow(
      /matrix and rhs.*overlap/
    );

    const rhs = Float64Array.of(1);
    expect(() => choleskySolveFactored(Float64Array.of(Number.MIN_VALUE), rhs, 1)).toThrow(/forward solve/);
    expect(Array.from(rhs)).toEqual([1]);

    const outerRhs = Float64Array.of(Number.MAX_VALUE);
    const result = solveCholeskyInPlace(Float64Array.of(Number.MIN_VALUE), outerRhs, 1, new Float64Array(1), {
      pivotTolerance: 0
    });
    expect(result).toMatchObject({ ok: false, reason: 'non-finite-output' });
    expect(Array.from(outerRhs)).toEqual([Number.MAX_VALUE]);
  });
});

describe('research sampling boundary', () => {
  test('rejects invalid runtime strategies, ranges, counts, and oversized seeds', () => {
    expect(() => generateStudyValues('unknown' as 'grid', 0, 1, 3, 'x')).toThrow(/unsupported/);
    expect(() => generateStudyValues('grid', 1, 0, 3, 'x')).toThrow(/bounds/);
    expect(() => generateStudyValues('grid', -Number.MAX_VALUE, Number.MAX_VALUE, 3, 'x')).toThrow(/span/);
    expect(() => generateStudyValues('grid', 0, 1, Number.NaN, 'x')).toThrow(/count/);
    expect(() => generateStudyValues('random', 0, 1, 3, 'x'.repeat(4_097))).toThrow(/4096/);
  });

  test('even symmetric studies are unbiased and ordered; ordered seeds no longer collide', () => {
    const values = generateStudyValues('symmetric', -2, 4, 6, 'seed');
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBe(-2);
    expect(values.at(-1)).toBe(4);
    const midpoint = 1;
    for (let i = 0; i < values.length; i += 1) {
      expect((values[i] ?? 0) + (values.at(-1 - i) ?? 0)).toBeCloseTo(2 * midpoint, 14);
    }
    expect(generateStudyValues('random', 0, 1, 6, 'abc')).not.toEqual(generateStudyValues('random', 0, 1, 6, 'cba'));
  });
});

describe('referral storage boundary', () => {
  test('validates persisted records instead of trusting parsed JSON', () => {
    const entries = new Map([[REFERRAL_SESSION_KEY, '{"source":"<script>","capturedAt":"yesterday"}']]);
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value)
    };
    const result = captureReferralAttribution(
      'https://example.test/?utm_source=safe-source',
      storage,
      '2026-07-20T00:00:00.000Z'
    );
    expect(result?.source).toBe('safe-source');
    expect(JSON.parse(entries.get(REFERRAL_SESSION_KEY) ?? '{}').source).toBe('safe-source');
  });

  test('is non-fatal when session storage is unavailable and rejects unsafe URL/time inputs', () => {
    const unavailable = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      }
    };
    expect(
      captureReferralAttribution('https://example.test/?utm_source=landing', unavailable, '2026-07-20T00:00:00.000Z')
        ?.source
    ).toBe('landing');
    expect(parseReferralAttribution('javascript:?utm_source=landing')).toBeNull();
    expect(() => parseReferralAttribution('https://example.test/?utm_source=landing', 'not-a-date')).toThrow(
      /capturedAt/
    );
  });
});

describe('ring-buffer boundary', () => {
  test('rejects poisoned descriptors, non-finite samples, and invalid snapshot counts atomically', () => {
    const ring = new Float64RingBuffer({ capacity: 2, stride: 2, preferShared: false });
    ring.push([1, 2]);
    expect(() => ring.push([9, Number.NaN])).toThrow(/finite/);
    expect(Array.from(ring.snapshot())).toEqual([1, 2]);
    expect(() => ring.snapshot(Number.NaN)).toThrow(/maxSamples/);
    const descriptor = ring.descriptor();
    expect(
      () => new Float64RingBuffer({ ...descriptor, mode: 'invalid' } as unknown as Float64RingBufferDescriptor)
    ).toThrow(/mode/);
    expect(
      () => new Float64RingBuffer({ ...descriptor, values: new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT) })
    ).toThrow(/dimensions/);
  });

  test.each([3, 10])('preserves chronology when the seqlock wraps for capacity %i', (capacity) => {
    const ring = new Float64RingBuffer({ capacity, stride: 1, preferShared: false });
    const descriptor = ring.descriptor();
    const metadata = new Int32Array(descriptor.metadata);
    const values = new Float64Array(descriptor.values);
    const nextSlot = Math.floor(capacity / 2);
    metadata[0] = nextSlot;
    metadata[1] = capacity;
    metadata[2] = -2; // the next begin/end pair wraps Int32 MAX through zero
    for (let i = 0; i < capacity; i += 1) values[(nextSlot + i) % capacity] = i + 1;
    expect(Array.from(ring.snapshot())).toEqual(Array.from({ length: capacity }, (_, i) => i + 1));
    ring.push([capacity + 1]);
    expect(Array.from(ring.snapshot())).toEqual(Array.from({ length: capacity }, (_, i) => i + 2));
    expect(metadata[2]).toBe(0);
  });
});

describe('Langevin ensemble boundary and scratch reuse', () => {
  const base: LangevinEnsembleSpec = {
    drift: (_state, out) => {
      out[0] = 0;
    },
    initialState: [0],
    diffusion: [0.1],
    dt: 0.01,
    steps: 2,
    realizations: 2
  };

  test('rejects non-finite/dimension/work-driving settings before integration', () => {
    expect(() => runLangevinEnsemble({ ...base, initialState: [Number.NaN] })).toThrow(/initialState/);
    expect(() => runLangevinEnsemble({ ...base, diffusion: [] })).toThrow(/diffusion length/);
    expect(() => runLangevinEnsemble({ ...base, steps: 1.5 })).toThrow(/steps/);
    expect(() => runLangevinEnsemble({ ...base, recordEvery: 0 })).toThrow(/recordEvery/);
    expect(runLangevinEnsemble({ ...base, recordEvery: 3 }).times).toEqual([0, 0.02]);
    expect(() => runLangevinEnsemble({ ...base, seed: Number.NaN })).toThrow(/seed/);
    expect(() => runLangevinEnsemble({ ...base, seed: 0x1_0000_0001 })).toThrow(/uint32/);
    expect(() => runLangevinEnsemble({ ...base, steps: 10_000_000, realizations: 1_000_000 })).toThrow(
      /requested work/
    );
  });

  test('rejects seed aliases instead of silently truncating them to uint32', () => {
    expect(() => gaussianSampler(-1)).toThrow(/uint32/);
    expect(() => gaussianSampler(0x1_0000_0001)).toThrow(/uint32/);
    expect(() => buildBrownianGrid(1, 2, 1, 0x1_0000_0001)).toThrow(/uint32/);
    expect(Number.isFinite(gaussianSampler(0xffff_ffff)())).toBe(true);
  });

  test('persists every matrix SDE scratch buffer across steps', () => {
    const scratch: MatrixSdeScratch = {};
    const state = Float64Array.of(1);
    const out = new Float64Array(1);
    const step = () =>
      commutativeMilsteinStep(
        state,
        0.01,
        (_s, target) => {
          target[0] = 0;
        },
        1,
        (_s, target) => {
          target[0] = 0.2;
        },
        (_s, target) => {
          target[0] = 0;
        },
        () => 0,
        out,
        scratch
      );
    step();
    const references = { ...scratch };
    step();
    for (const key of Object.keys(references) as Array<keyof MatrixSdeScratch>) {
      expect(scratch[key]).toBe(references[key]);
    }
  });

  test('rejects matrix SDE scratch buffers with hostile types or aliases before stepping', () => {
    const state = Float64Array.of(1, 2);
    const out = new Float64Array(2);
    const drift = (_state: Float64Array, target: Float64Array) => target.fill(0);
    const diffusion = (_state: Float64Array, target: number[]) => target.fill(0.1);
    const overlapping = new Float64Array(3);
    expect(() =>
      stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, out, {
        drift0: overlapping.subarray(0, 2),
        predictor: overlapping.subarray(1, 3)
      })
    ).toThrow(/must not overlap each other/);
    expect(() =>
      stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, out, { drift0: state })
    ).toThrow(/must not overlap state or out/);
    expect(() =>
      stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, out, {
        drift0: [0, 0] as unknown as Float64Array
      })
    ).toThrow(/Float64Array/);
    const aliasedMatrices = [0, 0];
    expect(() =>
      stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, out, {
        diffusion0: aliasedMatrices,
        diffusion1: aliasedMatrices
      })
    ).toThrow(/must not alias each other/);
  });

  test('bounds direct matrix-step dimensions and validates inputs before allocation', () => {
    const state = Float64Array.of(0);
    const out = Float64Array.of(7);
    const drift = (_state: Float64Array, target: Float64Array) => {
      target[0] = 0;
    };
    const diffusion = (_state: Float64Array, target: number[]) => {
      target[0] = 0.1;
    };
    expect(() => stochasticHeunStratonovichStep(new Float64Array(), 0.01, drift, 1, diffusion, () => 0, out)).toThrow(
      /state dimension/
    );
    expect(() => stochasticHeunStratonovichStep(state, 0.01, drift, 1_000_000_000, diffusion, () => 0, out)).toThrow(
      /noiseDimension/
    );
    expect(() => stochasticHeunStratonovichStep(state, Number.MIN_VALUE, drift, 1, diffusion, () => 0, out)).toThrow(
      /too small/
    );
    expect(() =>
      stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, new Float64Array(2))
    ).toThrow(/out/);
    expect(() =>
      stochasticHeunStratonovichStep(Float64Array.of(Number.NaN), 0.01, drift, 1, diffusion, () => 0, out)
    ).toThrow(/state\[0\]/);
    expect(() =>
      commutativeMilsteinStep(
        new Float64Array(512),
        0.01,
        drift,
        512,
        diffusion,
        (_state, target) => target.fill(0),
        () => 0,
        new Float64Array(512)
      )
    ).toThrow(/matrix scratch|requested work/);
  });

  test('rejects non-finite callbacks atomically and skips Heun Jacobian allocation', () => {
    const state = Float64Array.of(1);
    const out = Float64Array.of(7);
    const scratch: MatrixSdeScratch = {};
    const drift = (_state: Float64Array, target: Float64Array) => {
      target[0] = 0;
    };
    const diffusion = (_state: Float64Array, target: number[]) => {
      target[0] = 0.1;
    };
    stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => 0, out, scratch);
    expect(scratch.diffusionJacobian).toHaveLength(0);
    const beforeFailure = out[0];
    expect(() =>
      stochasticHeunStratonovichStep(
        state,
        0.01,
        drift,
        1,
        (_state, target) => {
          target[0] = Number.NaN;
        },
        () => 0,
        out
      )
    ).toThrow(/diffusion output/);
    expect(out[0]).toBe(beforeFailure);
    expect(() => stochasticHeunStratonovichStep(state, 0.01, drift, 1, diffusion, () => Number.NaN, out)).toThrow(
      /gaussian output/
    );
  });

  test('clears sparse diagonal multiplicative callbacks and rejects non-finite coefficients', () => {
    const makeSpec = (explicitZero: boolean): LangevinEnsembleSpec => {
      let diffusionCalls = 0;
      let primeCalls = 0;
      return {
        ...base,
        drift: (_state, target) => target.fill(0),
        initialState: [1, 1],
        diffusion: [0, 0],
        scheme: 'milstein',
        multiplicative: {
          diffusion: (_state, target) => {
            if (explicitZero) target.fill(0);
            target[diffusionCalls % 2] = 0.2;
            diffusionCalls += 1;
          },
          diffusionPrime: (_state, target) => {
            if (explicitZero) target.fill(0);
            target[primeCalls % 2] = 0.1;
            primeCalls += 1;
          }
        }
      };
    };
    expect(runLangevinEnsemble(makeSpec(false))).toEqual(runLangevinEnsemble(makeSpec(true)));
    expect(() =>
      runLangevinEnsemble({
        ...base,
        multiplicative: { diffusion: (_state, target) => (target[0] = Number.NaN) }
      })
    ).toThrow(/diffusion\[0\]/);
    expect(() =>
      runLangevinEnsemble({
        ...base,
        scheme: 'milstein',
        multiplicative: {
          diffusion: (_state, target) => (target[0] = 0.1),
          diffusionPrime: (_state, target) => (target[0] = Number.POSITIVE_INFINITY)
        }
      })
    ).toThrow(/diffusionPrime\[0\]/);
    expect(() =>
      runLangevinEnsemble({
        ...base,
        multiplicative: {
          diffusion: (_state, target) => (target[0] = 0.1),
          diffusionPrime: true as unknown as NonNullable<
            NonNullable<LangevinEnsembleSpec['multiplicative']>['diffusionPrime']
          >
        }
      })
    ).toThrow(/diffusionPrime must be a function/);
  });

  test('validates direct diagonal steppers and their callback-derived outputs', () => {
    const state = Float64Array.of(1);
    const out = Float64Array.of(7);
    const drift = (_state: Float64Array, target: Float64Array) => {
      target[0] = 0;
    };
    expect(() => eulerMaruyamaStep(state, 0.01, drift, [Number.NaN], () => 0, out)).toThrow(/diffusion/);
    expect(() => eulerMaruyamaStep(state, 0.01, drift, [0.1], () => Number.NaN, out)).toThrow(/gaussian/);
    expect(() =>
      eulerMaruyamaStep(
        state,
        0.01,
        (_state, target) => {
          target[0] = Number.NaN;
        },
        [0],
        () => 0,
        out
      )
    ).toThrow(/drift output/);
    expect(() => milsteinStep(state, 0.01, drift, [0.1], [Number.NaN], () => 0, out)).toThrow(/diffusionPrime/);
    expect(() => eulerMaruyamaStep(state, 0.01, drift, [0], () => 0, state)).toThrow(/must not overlap/);
  });
});

describe('adaptive Langevin public boundary', () => {
  const drift = (_state: Float64Array, target: Float64Array): void => {
    target.fill(0);
  };

  test('bounds Brownian allocation and validates increment indices', () => {
    expect(() => buildBrownianGrid(Number.POSITIVE_INFINITY, 2, 1)).toThrow(/finite/);
    expect(() => buildBrownianGrid(1, 24, 512)).toThrow(/storage/);
    expect(() => buildBrownianGrid(Number.MIN_VALUE, 2, 1)).toThrow(/positive and finite|too small/);
    const grid = buildBrownianGrid(1, 2, 1, 1);
    expect(() => grid.increment(-1, 1, 0)).toThrow(/indices/);
    expect(() => grid.increment(0, 5, 0)).toThrow(/indices/);
    expect(() => grid.increment(0, 1, 1)).toThrow(/component/);
  });

  test('rejects non-dyadic grids, invalid tolerances, and excessive path work before stepping', () => {
    const baseGrid = { steps: 4, dt: 0.25, totalTime: 1, dimension: 1, increment: () => 0 };
    const spec = { drift, diffusion: [0], initialState: [0], grid: baseGrid };
    expect(() => runAdaptiveLangevinPath({ ...spec, grid: { ...baseGrid, steps: 3 } })).toThrow(/power of two/);
    expect(() => runAdaptiveLangevinPath({ ...spec, absoluteTolerance: Number.NaN })).toThrow(/tolerances/);
    expect(() => runAdaptiveLangevinPath({ ...spec, absoluteTolerance: 0, relativeTolerance: 0 })).toThrow(
      /at least one positive/
    );
    const relativeOnlyZeroPath = runAdaptiveLangevinPath({
      ...spec,
      absoluteTolerance: 0,
      relativeTolerance: 1e-3
    });
    expect(relativeOnlyZeroPath.rejectedSteps).toBe(0);
    expect(relativeOnlyZeroPath.acceptedSteps).toBe(1);
    expect(() => runAdaptiveLangevinPath({ ...spec, initialState: [Number.NaN] })).toThrow(/initialState/);
    const oversizedRecording = {
      steps: 2 ** 21,
      dt: 1 / 2 ** 21,
      totalTime: 1,
      dimension: 1,
      increment: () => 0
    };
    expect(() => runAdaptiveLangevinPath({ ...spec, grid: oversizedRecording })).toThrow(/recorded path/);
    const dimension = 128;
    const oversizedWork = {
      steps: 2 ** 20,
      dt: 1 / 2 ** 20,
      totalTime: 1,
      dimension,
      increment: () => 0
    };
    expect(() =>
      fixedGridLangevinPath({
        drift,
        diffusion: new Array(dimension).fill(0),
        initialState: new Array(dimension).fill(0),
        grid: oversizedWork
      })
    ).toThrow(/path work/);
  });

  test('defines omitted sparse callback cells as zero and rejects non-finite callback output', () => {
    const grid = { steps: 2, dt: 0.5, totalTime: 1, dimension: 2, increment: () => 0.1 };
    let calls = 0;
    const result = fixedGridLangevinPath({
      drift,
      diffusion: (_state, target) => {
        target[calls % 2] = 1;
        calls += 1;
      },
      initialState: [0, 0],
      grid
    });
    expect(result).toEqual([0.1, 0.1]);
    expect(() =>
      fixedGridLangevinPath({
        drift,
        diffusion: (_state, target) => {
          target[0] = Number.NaN;
        },
        initialState: [0, 0],
        grid
      })
    ).toThrow(/diffusion output/);
  });
});
