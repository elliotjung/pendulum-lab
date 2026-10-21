import { describe, expect, it } from 'vitest';
import { recurrenceQuantification, recurrenceMatrix } from '../../../../../src/chaos/rqa';
import { recurrenceNetworkMetrics } from '../../../../../src/chaos/recurrenceNetwork';
import { correlationDimension, delayEmbed } from '../../../../../src/chaos/correlationDimension';
import { generalizedDimensions } from '../../../../../src/chaos/multifractal';
import { topologicalEntropy1D } from '../../../../../src/chaos/topologicalEntropy';
import { transferOperatorSpectrum, ulamTransitionMatrix1D } from '../../../../../src/chaos/transferOperator';
import { finiteTimeLyapunovReport } from '../../../../../src/chaos/ftle';
import { covariantLyapunovVectors } from '../../../../../src/chaos/clv';
import { createDiagnosticFlow } from '../../../../../src/product/adapters/analysis/core/source';
import { defaultAdvancedSettings } from '../../../../../src/product/adapters/analysis/advanced/settings';
import {
  runAdvancedDiagnostic,
  executeAdvancedDiagnosticJob
} from '../../../../../src/product/adapters/analysis/advanced/execute';
import { advancedDiagnosticRejection } from '../../../../../src/product/adapters/analysis/advanced/validation';
import type {
  AdvancedDiagnosticKind,
  AdvancedDiagnosticRequest
} from '../../../../../src/product/adapters/analysis/advanced/contracts';
import { experiment, signalSeries } from '../core/fixture';
import { defaultChainConfig, toCanonicalChain } from '../../../../../src/product/adapters/physics/chain';
import { advancedWadaGridEvidence } from '../../../../../src/product/adapters/analysis/advanced/native-grid';

function request(kind: AdvancedDiagnosticKind): AdvancedDiagnosticRequest {
  const e = experiment();
  return {
    id: 'native_parity',
    kind,
    experiment: e,
    series: signalSeries(256),
    settings: defaultAdvancedSettings(kind, e)
  };
}
function details(r: ReturnType<typeof runAdvancedDiagnostic>) {
  return r.details as Record<string, unknown>;
}
describe('S19 native advanced adapters: parity, interpretation and bounded failure', () => {
  it('matches native RQA exactly and includes explicit block uncertainty/selection', () => {
    const q = request('rqa'),
      r = runAdvancedDiagnostic(q),
      native = recurrenceQuantification(
        q.series.states.map((v) => v[0]!),
        { dimension: 2, delay: 1, targetRecurrenceRate: 0.1, theiler: 1, lMin: 2, vMin: 2 }
      );
    expect(details(r).native).toEqual(native);
    expect(details(r).uncertainty).toHaveProperty('blocks', 4);
    expect(r.warnings.join(' ')).toContain('첫 최대 256');
  });
  it('constructs exactly the native recurrence graph after explicit Theiler exclusion', () => {
    const q = request('recurrence-network'),
      r = runAdvancedDiagnostic(q),
      matrix = recurrenceMatrix(
        q.series.states.map((v) => v[0]!),
        { dimension: 2, delay: 1, targetRecurrenceRate: 0.1 }
      );
    for (let i = 0; i < matrix.size; i++)
      for (let j = Math.max(0, i - 1); j <= Math.min(matrix.size - 1, i + 1); j++)
        matrix.matrix[i * matrix.size + j] = 0;
    expect(details(r).native).toEqual(recurrenceNetworkMetrics(matrix.matrix, matrix.size));
  });
  it('preserves native GP pair counts, fit and scaling curve', () => {
    const q = request('correlation-dimension'),
      r = runAdvancedDiagnostic(q),
      points = delayEmbed(
        q.series.states.map((v) => v[0]!),
        2,
        1
      );
    expect(details(r).native).toEqual(
      correlationDimension(points, { radiusCount: 32, fitLowFraction: 0.01, fitHighFraction: 0.1, theilerWindow: 1 })
    );
  });
  it('preserves native multifractal output at the exported actual box sizes', () => {
    const q = request('multifractal'),
      r = runAdvancedDiagnostic(q),
      points = delayEmbed(
        q.series.states.map((v) => v[0]!),
        2,
        1
      ),
      d = details(r);
    expect(d.native).toEqual(generalizedDimensions(points, { qs: [0, 1, 2, 3, 4], boxSizes: d.boxSizes as number[] }));
  });
  it('uses an independent named tent benchmark, exactly reproducing log2 across dyadic resolutions', () => {
    const q = request('topological-entropy'),
      r = runAdvancedDiagnostic(q),
      native = topologicalEntropy1D((x) => 2 * Math.min(x, 1 - x), [0, 1], 8, 32, {
        iterations: 1000,
        tolerance: 1e-10
      });
    expect(r.rows[0]![1]).toBe(native.entropy);
    expect(r.rows.every((row) => Math.abs(row[1]! - Math.LN2) < 1e-10)).toBe(true);
    expect(details(r).source).toHaveProperty('physicalExperimentUsed', false);
  });
  it('preserves native Ulam eigenvalues with exact transition matrix and meaningful nonfinite rate reason', () => {
    const q = request('transfer-operator'),
      r = runAdvancedDiagnostic(q),
      matrix = ulamTransitionMatrix1D((x) => 2 * Math.min(x, 1 - x), [0, 1], 8, 32),
      native = transferOperatorSpectrum(matrix.transition, 8);
    const outputs = details(r).outputs as { matrix: unknown; spectrum: { eigenvalues: unknown } }[];
    expect(outputs[0]!.matrix).toEqual(matrix);
    expect(outputs[0]!.spectrum.eigenvalues).toEqual(native.eigenvalues);
    expect(() => JSON.stringify(r)).not.toThrow();
  });
  it('matches FTLE native RHS and Jacobian trust exactly', () => {
    const q = request('ftle'),
      r = runAdvancedDiagnostic(q),
      flow = createDiagnosticFlow(q.experiment);
    const native = finiteTimeLyapunovReport(flow.initial, flow.rhs, 1, { dt: 0.01 }, flow.rhs.jacobian);
    expect(details(r).native).toEqual(native);
    expect(r.rows[0]![1]).toBe(native.value);
  });
  it('refuses an FTLE propagator pinned to the floating-point underflow floor', () => {
    const q = request('ftle');
    q.experiment = {
      ...q.experiment,
      parameters: {
        ...q.experiment.parameters,
        l1: { kind: 'scalar', value: 0.001, unit: 'm' },
        l2: { kind: 'scalar', value: 0.001, unit: 'm' },
        g: { kind: 'scalar', value: 1000, unit: 'm/s^2' },
        gamma: { kind: 'scalar', value: 0.001, unit: 'kg*m^2/s' }
      },
      initialConditions: Object.fromEntries(
        Object.entries(q.experiment.initialConditions).map(([key, value]) => [key, { ...value, value: 0 }])
      )
    };
    q.settings = { duration: 10, dt: 0.0001 };
    expect(() => runAdvancedDiagnostic(q)).toThrow(/underflow/);
  });
  it('matches CLV exponents and vectors; unavailable hyperbolicity is explicit null', () => {
    const q = request('clv'),
      r = runAdvancedDiagnostic(q),
      flow = createDiagnosticFlow(q.experiment),
      native = covariantLyapunovVectors(
        flow.initial,
        flow.rhs,
        4,
        { dt: 0.01, renormEvery: 5, forwardTransient: 20, window: 40, backwardTransient: 20, seed: 40503 },
        flow.rhs.jacobian
      );
    expect(details(r).exponents).toEqual(native.exponents);
    expect(details(r).vectors).toEqual(native.vectors.map((v) => Array.from(v)));
    const one = { ...q, settings: { ...q.settings, count: 1 } };
    const noPair = runAdvancedDiagnostic(one);
    expect(details(noPair).meanHyperbolicityAngle).toBeNull();
    expect(details(noPair).angleAvailability).toContain('unavailable');
  });
  it('never converts a missing boundary into an uncertainty exponent of2', () => {
    const q = request('uncertainty');
    q.settings = { ...q.settings, rangeLow: -0.1, rangeHigh: 0.1, duration: 0.01 };
    const r = runAdvancedDiagnostic(q);
    expect(details(r).uncertaintyExponentProxy).toBeNull();
    expect(details(r).proxyCi95).toBeNull();
    expect(r.rows).toEqual([[1, 0]]);
  });
  it('compares three independent Wada resolutions and calls absent three labels inconclusive', () => {
    const q = request('wada');
    q.settings = { ...q.settings, rangeLow: -0.1, rangeHigh: 0.1, duration: 0.01 };
    const r = runAdvancedDiagnostic(q);
    expect(r.rows.map((v) => v[0])).toEqual([16, 24, 32]);
    expect(details(r).productVerdict).toBe('insufficient-data');
  });
  it.each([
    [0, 2],
    [1, 2]
  ])('requires three distinct labels rather than max(label)+1: %j', (a, b) => {
    const resolutions = [16, 24, 32],
      grids = resolutions.map((n) => ({
        width: n,
        height: n,
        labels: Int32Array.from({ length: n * n }, (_, i) => (i % n < n / 2 ? a : b))
      }));
    const evidence = advancedWadaGridEvidence(
      grids,
      resolutions,
      { radius: 2, threshold: 0.95, convergenceTolerance: 0.05 },
      { dt: 0.01, maxTime: 1, range: [-3, 3] }
    );
    expect(evidence.native.numColors).toEqual([3, 3, 3]);
    expect(evidence.distinctColorCounts).toEqual([2, 2, 2]);
    expect(evidence.productVerdict).toBe('insufficient-data');
    expect(evidence.availabilityReason).toContain('distinct');
  });
  it('refuses nonuniform/constant/too short/oversized embedding observations with explanation', () => {
    for (const mutate of [
      (q: AdvancedDiagnosticRequest) => {
        q.series.times[10]! += 0.01;
      },
      (q: AdvancedDiagnosticRequest) => {
        q.series.states = q.series.states.map(() => [1, 0]);
      },
      (q: AdvancedDiagnosticRequest) => {
        q.settings.dimension = 8;
        q.settings.delay = 128;
      },
      (q: AdvancedDiagnosticRequest) => {
        q.settings.maxSamples = 513;
      }
    ]) {
      const q = request('rqa');
      mutate(q);
      expect(advancedDiagnosticRejection(q.kind, q.experiment, q.series, q.settings)).toBeTypeOf('string');
      expect(() => runAdvancedDiagnostic(q)).toThrow();
    }
  });
  it('refuses ignored damping, unsafe explicit grid steps and aggregate three-grid work', () => {
    const q = request('basin');
    q.experiment = {
      ...q.experiment,
      parameters: { ...q.experiment.parameters, gamma: { kind: 'scalar', value: 0.1, unit: 'kg*m^2/s' } }
    };
    expect(() => runAdvancedDiagnostic(q)).toThrow(/gamma=0/);
    const unsafe = request('basin');
    unsafe.settings.dt = 0.1;
    expect(() => runAdvancedDiagnostic(unsafe)).toThrow(/step/);
    const work = request('wada');
    work.settings = { ...work.settings, resolution: 32, duration: 10, dt: 0.01 };
    expect(() => runAdvancedDiagnostic(work)).toThrow(/궤적 step/);
  });
  it('rejects unknown settings/source and too many CLV output rows before computation', () => {
    const q = request('topological-entropy');
    q.settings.source = 'eval';
    expect(() => runAdvancedDiagnostic(q)).toThrow();
    const clv = request('clv');
    clv.settings = { ...clv.settings, window: 1000, backwardTransient: 0, count: 4 };
    clv.settings.rogue = 1;
    expect(() => runAdvancedDiagnostic(clv)).toThrow(/설정/);
    const chain = toCanonicalChain(defaultChainConfig('system:chain', 8));
    if (!chain.ok) throw new Error('chain fixture');
    const many = request('clv');
    many.experiment = chain.value;
    many.settings = {
      ...many.settings,
      count: 16,
      window: 1000,
      backwardTransient: 0,
      forwardTransient: 0,
      renormEvery: 1
    };
    expect(() => runAdvancedDiagnostic(many)).toThrow(/출력 행/);
  });
  it('emits monotonic progress/result and worker-safe errors without changing input', () => {
    const q = request('topological-entropy'),
      before = JSON.stringify(q),
      events: unknown[] = [];
    executeAdvancedDiagnosticJob(q, (e) => events.push(e));
    expect(events).toMatchObject([
      { type: 'progress', fraction: null, work: 0 },
      { type: 'progress', fraction: 1 },
      { type: 'result' }
    ]);
    expect(JSON.stringify(q)).toBe(before);
    const errors: unknown[] = [];
    executeAdvancedDiagnosticJob({ ...q, id: 'invalid id' }, (e) => errors.push(e));
    expect(errors).toMatchObject([{ type: 'error' }]);
  });
});
