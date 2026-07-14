import { describe, expect, test } from 'vitest';
import { detectEvents } from '../src/physics/events';
import {
  doublePendulumFlipBasin,
  doublePendulumFtleField,
  flowMapGradient,
  lyapunovSpectrum,
  maximalLyapunov,
  recurrenceMatrix,
  recurrenceQuantification,
  rqaBlockUncertainty,
  sampleObservable,
  zeroOneTest
} from '../src/chaos/index';
import {
  fitDoublePendulum,
  levenbergMarquardt,
  type LevenbergMarquardtOptions
} from '../src/research/parameterEstimation';
import { runChaosJob } from '../src/workers/chaosProtocol';
import { NUMERICAL_WORK_BUDGETS } from '../src/validation/numericalBudgets';

const zeroRhs = (_state: Float64Array, out: Float64Array): void => {
  out.fill(0);
};

describe('event-solver finite work contract', () => {
  const spec = { g: (state: Float64Array): number => state[0] ?? 0 };

  test('rejects unsafe step counts and non-finite/unbounded event caps before integration', () => {
    expect(() => detectEvents(new Float64Array([1]), zeroRhs, [spec], { dt: Number.MIN_VALUE, maxTime: 1 })).toThrow(
      /too small/
    );
    expect(() => detectEvents(new Float64Array([1]), zeroRhs, [spec], { dt: 1, maxTime: Number.MAX_VALUE })).toThrow(
      /step count/
    );
    for (const maxEvents of [Infinity, Number.MAX_VALUE, 1.5, -1]) {
      expect(() => detectEvents(new Float64Array([1]), zeroRhs, [spec], { dt: 1, maxTime: 1, maxEvents })).toThrow(
        /maxEvents/
      );
    }
    expect(() =>
      detectEvents(new Float64Array([1]), zeroRhs, [spec], {
        dt: 1,
        maxTime: NUMERICAL_WORK_BUDGETS.events.maxIntegrationSteps + 1
      })
    ).toThrow(/integration steps/);
  });

  test('accounts for event-function count in the total scan budget', () => {
    // 9m steps * 3 specs fits the legacy steps*specs estimate (27m), but the
    // two endpoint calls per spec require 54m and must be rejected up front.
    const specs = Array.from({ length: 3 }, () => spec);
    expect(() =>
      detectEvents(new Float64Array([1]), zeroRhs, specs, {
        dt: 1,
        maxTime: 9_000_000
      })
    ).toThrow(/evaluation work budget/);
  });

  test('charges every root-refinement probe before invoking the event function', () => {
    let calls = 0;
    const uniformMotion = (_state: Float64Array, out: Float64Array): void => {
      out[0] = 1;
    };
    expect(() =>
      detectEvents(
        new Float64Array([0]),
        uniformMotion,
        [
          {
            g: (state) => {
              calls += 1;
              return (state[0] ?? 0) ** 2 - 0.2;
            }
          }
        ],
        { dt: 1, maxTime: 1, rootTol: 1e-12, maxEvents: 1, maxEventFunctionEvaluations: 3 }
      )
    ).toThrow(/evaluation work budget/);
    expect(calls).toBe(3);
  });

  test('lands exactly on maxTime despite accumulated decimal-step roundoff', () => {
    const uniformMotion = (_state: Float64Array, out: Float64Array): void => {
      out[0] = 1;
    };
    const result = detectEvents(new Float64Array([0]), uniformMotion, [], { dt: 0.1, maxTime: 1 });
    expect(result.finalTime).toBe(1);
    expect(result.finalState[0]).toBeCloseTo(1, 14);
  });
});

describe('Lyapunov finite work and exact step horizon', () => {
  const base = { dt: 0.1, steps: 3, renormEvery: 2, transientSteps: 0 } as const;

  test('integrates the final partial renormalization block in both estimators', () => {
    let maximalCalls = 0;
    const maximalRhs = (_state: Float64Array, out: Float64Array): void => {
      maximalCalls += 1;
      out[0] = 0;
    };
    const maximal = maximalLyapunov([1], maximalRhs, base);
    expect(maximalCalls).toBe(3 * 2 * 4); // three RK4 steps, reference + shadow, four stages
    expect(maximal.convergence).toHaveLength(2); // one 2-step block plus the 1-step tail

    let spectrumCalls = 0;
    const spectrumRhs = (_state: Float64Array, out: Float64Array): void => {
      spectrumCalls += 1;
      out[0] = 0;
    };
    const jacobian = (_state: Float64Array, out: Float64Array): void => {
      out[0] = 0;
    };
    lyapunovSpectrum([1], spectrumRhs, 1, base, jacobian);
    expect(spectrumCalls).toBe(3 * 4); // three RK4 steps, including the remainder block
  });

  test('rejects subnormal/overflowing horizons and every configured loop ceiling', () => {
    expect(() => maximalLyapunov([1], zeroRhs, { ...base, dt: Number.MIN_VALUE })).toThrow(/too small/);
    expect(() => maximalLyapunov([1], zeroRhs, { ...base, dt: Number.MAX_VALUE })).toThrow(
      /finite integration horizon/
    );
    expect(() => maximalLyapunov([1], zeroRhs, { ...base, steps: Number.MAX_VALUE })).toThrow(/positive integer/);
    expect(() =>
      maximalLyapunov([1], zeroRhs, {
        ...base,
        steps: NUMERICAL_WORK_BUDGETS.lyapunov.maxMeasurementSteps + 1
      })
    ).toThrow(/steps must not exceed/);
    expect(() =>
      maximalLyapunov([1], zeroRhs, {
        ...base,
        steps: NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps + 1,
        renormEvery: NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps + 1
      })
    ).toThrow(/renormEvery must not exceed/);
    expect(() =>
      maximalLyapunov([1], zeroRhs, {
        ...base,
        transientSteps: NUMERICAL_WORK_BUDGETS.lyapunov.maxTransientSteps + 1
      })
    ).toThrow(/transientSteps must not exceed/);
    expect(() =>
      maximalLyapunov([1], zeroRhs, {
        ...base,
        steps: 4_000_000,
        transientSteps: 4_000_001
      })
    ).toThrow(/steps plus transientSteps/);
  });

  test('rejects non-finite RHS, state/tangent, and Jacobian/QR propagation', () => {
    const nanRhs = (_state: Float64Array, out: Float64Array): void => {
      out[0] = Number.NaN;
    };
    const zeroJacobian = (_state: Float64Array, out: Float64Array): void => {
      out[0] = 0;
    };
    expect(() => maximalLyapunov([1], nanRhs, base)).toThrow(/non-finite/);
    expect(() => lyapunovSpectrum([1], nanRhs, 1, base, zeroJacobian)).toThrow(/non-finite/);

    const overflowingRhs = (_state: Float64Array, out: Float64Array): void => {
      out[0] = Number.MAX_VALUE;
    };
    expect(() => maximalLyapunov([1], overflowingRhs, base)).toThrow(/non-finite/);

    const infiniteJacobian = (_state: Float64Array, out: Float64Array): void => {
      out[0] = Infinity;
    };
    expect(() => lyapunovSpectrum([1], zeroRhs, 1, base, infiniteJacobian)).toThrow(/non-finite/);

    const collapsingJacobian = (_state: Float64Array, out: Float64Array): void => {
      out[0] = -10;
    };
    expect(() =>
      lyapunovSpectrum(
        [1],
        zeroRhs,
        1,
        { dt: 0.1, steps: 1, renormEvery: 1, transientSteps: 0, method: 'euler' },
        collapsingJacobian
      )
    ).toThrow(/QR output/);
  });
});

describe('observable sampling rejects false-success inputs', () => {
  const valid = { dt: 0.01, sampleEvery: 1, samples: 2, transientSteps: 0 } as const;

  test('strictly validates every loop control and total work', () => {
    for (const dt of [0, -1, Number.NaN, Infinity, Number.MIN_VALUE]) {
      expect(() => sampleObservable(zeroRhs, [1], { ...valid, dt })).toThrow();
    }
    for (const sampleEvery of [0, -1, 1.5, Infinity, Number.MAX_VALUE]) {
      expect(() => sampleObservable(zeroRhs, [1], { ...valid, sampleEvery })).toThrow(/sampleEvery/);
    }
    for (const samples of [0, -1, 1.5, Infinity, Number.MAX_VALUE]) {
      expect(() => sampleObservable(zeroRhs, [1], { ...valid, samples })).toThrow(/samples/);
    }
    for (const transientSteps of [-1, 1.5, Infinity, Number.MAX_VALUE]) {
      expect(() => sampleObservable(zeroRhs, [1], { ...valid, transientSteps })).toThrow(/transientSteps/);
    }
    expect(() => sampleObservable(zeroRhs, [1], { ...valid, samples: 51, sampleEvery: 1_000_000 })).toThrow(
      /work budget/
    );
  });

  test('rejects non-finite state/observables and workers return an error instead of a false positive', () => {
    expect(() => sampleObservable(zeroRhs, [Number.NaN], valid)).toThrow(/state0 components/);
    expect(() => sampleObservable(zeroRhs, [1], { ...valid, observable: () => Infinity })).toThrow(/observable/);
    const response = runChaosJob({
      id: 'invalid-sampling',
      kind: 'rqa',
      spec: { kind: 'driven', g: 1, length: 1, damping: 0.1, driveAmplitude: 1, driveFrequency: 1 },
      state0: [0, 0, 0],
      settings: { dt: 0.01, sampleEvery: 0, samples: 40, transientSteps: 0 }
    });
    expect(response.ok).toBe(false);
  });
});

describe('FTLE field and trajectory work budgets', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

  test('rejects pathological ratios and state dimensions without allocating the STM', () => {
    expect(() => flowMapGradient([1], zeroRhs, 1, { dt: Number.MIN_VALUE })).toThrow(/too small/);
    expect(() => flowMapGradient([1], zeroRhs, Number.MAX_VALUE, { dt: 1 })).toThrow(/step count/);
    expect(() => flowMapGradient(new Array<number>(129).fill(0), zeroRhs, 0)).toThrow(/state dimension/);
    expect(() =>
      flowMapGradient([1], zeroRhs, NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory + 1, { dt: 1 })
    ).toThrow(/integration steps/);
  });

  test('validates grid shape/range and the aggregate trajectory budget before allocation', () => {
    for (const n of [0, 1, 513, 1.5, Number.MAX_VALUE]) {
      expect(() => doublePendulumFtleField(params, { n, totalTime: 0 })).toThrow(/n must be an integer/);
    }
    expect(() => doublePendulumFtleField(params, { range: [0, Infinity], totalTime: 0 })).toThrow(/range endpoints/);
    expect(() => doublePendulumFtleField(params, { n: 512, totalTime: 573, dt: 1 })).toThrow(/work budget/);
  });
});

describe('parameter-estimation forward-model budget', () => {
  const fit = (times: readonly number[], dt: number): unknown =>
    fitDoublePendulum(
      { times, angles: times.map(() => [0.1, 0.1] as const) },
      {
        initialState: [0.1, 0.1, 0, 0],
        base: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
        gamma: 0,
        estimate: ['g'],
        initialGuess: [9],
        dt
      }
    );

  test('rejects subnormal dt, unsafe spans, and excessive forward steps before optimisation', () => {
    expect(() => fit([0, 1], Number.MIN_VALUE)).toThrow(/too small/);
    expect(() => fit([0, Number.MAX_VALUE], 1)).toThrow(/step count/);
    expect(() => fit([0, NUMERICAL_WORK_BUDGETS.parameterEstimation.maxForwardStepsPerEvaluation + 1], 1)).toThrow(
      /forward-model budget/
    );
  });
});

describe('Levenberg-Marquardt option contract', () => {
  const residual = (parameters: readonly number[]): number[] => [(parameters[0] ?? 0) - 1];
  const rejects = (name: keyof LevenbergMarquardtOptions, value: number): void => {
    const options = { [name]: value } as LevenbergMarquardtOptions;
    expect(() => levenbergMarquardt(residual, [0], options)).toThrow(new RegExp(String(name)));
  };

  test('rejects non-finite, negative, or non-progressing convergence controls', () => {
    for (const value of [0, 1.5, Infinity, NUMERICAL_WORK_BUDGETS.parameterEstimation.maxOptimizerIterations + 1]) {
      rejects('maxIterations', value);
    }
    for (const name of ['costTolerance', 'stepTolerance', 'gradientTolerance'] as const) {
      for (const value of [-1, Number.NaN, Infinity]) rejects(name, value);
    }
    for (const value of [1, 2]) rejects('costTolerance', value);
    for (const value of [0, -1, Infinity]) rejects('initialLambda', value);
    for (const name of ['lambdaUp', 'lambdaDown'] as const) {
      for (const value of [0.5, 1, Infinity]) rejects(name, value);
    }
    for (const value of [0, Infinity]) rejects('maxLambda', value);
    for (const value of [0, Number.MIN_VALUE, Infinity]) rejects('finiteDiffStep', value);
    expect(() => levenbergMarquardt(residual, [0], { initialLambda: 2, maxLambda: 1 })).toThrow(/maxLambda/);
  });

  test('the former negative-tolerance/lambdaUp=1 infinite-loop combination is rejected synchronously', () => {
    expect(() =>
      levenbergMarquardt(() => [1], [0], {
        gradientTolerance: -1,
        lambdaUp: 1
      })
    ).toThrow(/gradientTolerance|lambdaUp/);
  });

  test('a barely-growing valid lambda still terminates at the hard damping-attempt cap', () => {
    const result = levenbergMarquardt(() => [1], [0], {
      maxIterations: 1,
      gradientTolerance: 0,
      initialLambda: Number.MIN_VALUE,
      lambdaUp: 1 + Number.EPSILON,
      maxLambda: 1
    });
    expect(result.status).toBe('lambda-overflow');
    expect(result.iterations).toBe(1);
  });
});

describe('0-1 test frequency range arithmetic', () => {
  const series = Array.from({ length: 20 }, (_, index) => Math.sin(index));

  test('rejects finite endpoints whose subtraction overflows', () => {
    expect(() => zeroOneTest(series, { cSamples: 1, cRange: [-Number.MAX_VALUE, Number.MAX_VALUE] })).toThrow(
      /span must be positive and finite/
    );
  });

  test('keeps every generated frequency and sampled phase finite near the float64 limit', () => {
    const result = zeroOneTest(series, {
      cSamples: 2,
      cRange: [-Number.MAX_VALUE / series.length, 0],
      seed: 7
    });
    expect(result.cValues.every(Number.isFinite)).toBe(true);
  });
});

describe('flip basin exact horizon and aggregate budget', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

  test('uses a shortened final step when maxTime is below dt', () => {
    const remainderOnly = doublePendulumFlipBasin(params, { n: 2, range: [3.2, 3.3], dt: 1, maxTime: 0.25 });
    const oneFullStep = doublePendulumFlipBasin(params, { n: 2, range: [3.2, 3.3], dt: 0.25, maxTime: 0.25 });
    expect(Array.from(remainderOnly.labels)).toEqual(Array.from(oneFullStep.labels));
    expect(Array.from(remainderOnly.labels).some((label) => label !== 2)).toBe(true);
  });

  test('rejects subnormal ratios, unsafe spans, and excessive aggregate work', () => {
    expect(() => doublePendulumFlipBasin(params, { n: 2, dt: Number.MIN_VALUE, maxTime: 1 })).toThrow(/too small/);
    expect(() => doublePendulumFlipBasin(params, { n: 2, dt: 1, maxTime: Number.MAX_VALUE })).toThrow(/step count/);
    expect(() => doublePendulumFlipBasin(params, { n: 512, dt: 1, maxTime: 573 })).toThrow(/work budget/);
  });
});

describe('dense RQA memory/work budget', () => {
  test('rejects an oversized point cloud before allocating the N-squared matrix', () => {
    const oversized = new Array<number>(NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddedPoints + 1).fill(0);
    expect(() => recurrenceMatrix(oversized)).toThrow(/embedded point count/);
    expect(() => recurrenceQuantification(oversized)).toThrow(/embedded point count/);
  });

  test('caps high-dimensional distance work and uncertainty block count', () => {
    const highDimensional = new Array<number>(1_000).fill(0);
    expect(() => recurrenceQuantification(highDimensional, { dimension: 100, delay: 1 })).toThrow(/distance scan/);
    expect(() =>
      rqaBlockUncertainty(
        new Array<number>(NUMERICAL_WORK_BUDGETS.rqa.maxUncertaintyBlocks + 2).fill(0),
        {},
        NUMERICAL_WORK_BUDGETS.rqa.maxUncertaintyBlocks + 1
      )
    ).toThrow(/blocks must not exceed/);
  });
});
