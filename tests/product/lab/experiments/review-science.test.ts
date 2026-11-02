import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../../src/product/contracts/experiment';
import type { ContractResult } from '../../../../src/product/contracts/validation';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import { createBatchQueue } from '../../../../src/product/lab/experiments/queue';
import { validateBatchResult } from '../../../../src/product/lab/experiments/validation';
import { BATCH_KINDS, type BatchPlan, type BatchSnapshot } from '../../../../src/product/lab/experiments/contracts';
import {
  buildBatch,
  builderFields,
  compatibleBatchIntegrators,
  defaultBatchSettings
} from '../../../../src/product/lab/experiments/builders';
import { createDiagnosticSeries } from '../../../../src/product/adapters/analysis/core/source';
import {
  PLANAR_SYSTEM_IDS,
  defaultPlanarConfig,
  createPlanarSimulation,
  toCanonicalPlanar
} from '../../../../src/product/adapters/physics/planar';
import {
  CHAIN_SYSTEM_IDS,
  defaultChainConfig,
  createChainSimulation,
  toCanonicalChain
} from '../../../../src/product/adapters/physics/chain';
import {
  CONSTRAINT_SYSTEM_IDS,
  defaultConstraintConfig,
  createConstraintSimulation,
  toCanonicalConstraint
} from '../../../../src/product/adapters/physics/constraint';
import {
  SPATIAL_SYSTEM_IDS,
  defaultSpatialConfig,
  createSpatialSimulation,
  toCanonicalSpatial
} from '../../../../src/product/adapters/physics/spatial';
import {
  DRIVEN_SYSTEM_IDS,
  defaultDrivenConfig,
  createDrivenSimulation,
  toCanonicalDriven
} from '../../../../src/product/adapters/physics/driven';
import {
  NONLINEAR_SYSTEM_IDS,
  defaultNonlinearConfig,
  createNonlinearSimulation,
  toCanonicalNonlinear
} from '../../../../src/product/adapters/physics/nonlinear';
import {
  NETWORK_SYSTEM_IDS,
  defaultNetworkConfig,
  createNetworkSimulation,
  toCanonicalNetwork
} from '../../../../src/product/adapters/physics/network';
import {
  FIELD_SYSTEM_IDS,
  defaultFieldConfig,
  createFieldSimulation,
  toCanonicalField
} from '../../../../src/product/adapters/physics/field';
import {
  DISCRETE_SYSTEM_IDS,
  defaultDiscreteConfig,
  createDiscreteSimulation,
  toCanonicalDiscrete
} from '../../../../src/product/adapters/physics/discrete';

const unwrap = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
const short = <T extends { duration: number; step: number }>(config: T): T => ({
  ...config,
  duration: config.step * 4
});
type NativeSession = { readonly done: boolean; snapshot(): unknown; step(): unknown };
function nativeCase<T extends { systemId: string }>(
  config: T,
  canonical: (config: T) => ContractResult<ExperimentStateV1>,
  create: (config: T) => NativeSession
) {
  return { id: config.systemId, experiment: unwrap(canonical(config)), native: () => create(config) };
}
const cases = [
  ...PLANAR_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultPlanarConfig(id)), toCanonicalPlanar, createPlanarSimulation)
  ),
  ...CHAIN_SYSTEM_IDS.map((id) => nativeCase(short(defaultChainConfig(id)), toCanonicalChain, createChainSimulation)),
  ...CONSTRAINT_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultConstraintConfig(id)), toCanonicalConstraint, createConstraintSimulation)
  ),
  ...SPATIAL_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultSpatialConfig(id)), toCanonicalSpatial, createSpatialSimulation)
  ),
  ...DRIVEN_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultDrivenConfig(id)), toCanonicalDriven, createDrivenSimulation)
  ),
  ...NONLINEAR_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultNonlinearConfig(id)), toCanonicalNonlinear, createNonlinearSimulation)
  ),
  ...NETWORK_SYSTEM_IDS.map((id) =>
    nativeCase(short(defaultNetworkConfig(id)), toCanonicalNetwork, createNetworkSimulation)
  ),
  ...FIELD_SYSTEM_IDS.map((id) => nativeCase(short(defaultFieldConfig(id)), toCanonicalField, createFieldSimulation)),
  ...DISCRETE_SYSTEM_IDS.map((id) =>
    nativeCase({ ...defaultDiscreteConfig(id), iterations: 4 }, toCanonicalDiscrete, createDiscreteSimulation)
  )
];
function direct(experiment: ExperimentStateV1) {
  return executeBatchRun({
    batchId: 'independent-review',
    run: { id: 'independent-review-run', index: 0, experiment, assignments: [] }
  });
}
const staticIds = ['system:unitary-floquet', 'system:lattice-fk-limit', 'system:frenkel-kontorova'];

describe('S21 independent 35-system × 6-builder compatibility matrix', () => {
  for (const entry of cases)
    for (const kind of BATCH_KINDS)
      it(`${entry.id} × ${kind}: actual native runs or explicit internal-method refusal`, () => {
        const fields = builderFields(entry.experiment);
        const field =
          fields.find(
            (candidate) =>
              candidate.group === 'parameters' &&
              candidate.index === undefined &&
              [
                'g',
                'damping',
                'noise',
                'kickStrength',
                'hbar',
                'coupling',
                'alpha',
                'delta',
                'l1',
                'length',
                'onsiteOmegaSq'
              ].includes(candidate.key)
          ) ??
          fields.find((candidate) => candidate.group === 'initialConditions') ??
          fields[0]!;
        const start = kind === 'log' && field.value <= 0 ? 0.0001 : field.value;
        const choices = compatibleBatchIntegrators(entry.experiment);
        const settings = {
          ...defaultBatchSettings(entry.experiment),
          kind,
          count: 2,
          integratorIds: choices,
          axes:
            kind === 'ensemble' || kind === 'integrators'
              ? []
              : [
                  {
                    group: field.group,
                    key: field.key,
                    ...(field.index === undefined ? {} : { index: field.index }),
                    start,
                    end: start + 0.001,
                    count: 2
                  }
                ]
        };
        if (kind === 'integrators' && choices.length < 2) {
          expect(() => buildBatch(entry.experiment, settings)).toThrow(/적분기|stepper/);
          return;
        }
        const plan = buildBatch(entry.experiment, settings);
        expect(plan.runs.length).toBeGreaterThanOrEqual(2);
        for (const run of plan.runs) {
          const request = { batchId: plan.id, run },
            result = executeBatchRun(request);
          expect(validateBatchResult(result, request)).toEqual(result);
          expect(result.summary.metrics.length).toBeGreaterThan(0);
          expect(result.summary.metrics.every((metric) => Number.isFinite(metric.final))).toBe(true);
        }
      });
});

describe('S21 independent native endpoint and interpretation review', () => {
  it('covers all 35 preserved model adapters', () => expect(new Set(cases.map((entry) => entry.id)).size).toBe(35));
  for (const entry of cases)
    it(`${entry.id}: exact native endpoint, units and real propagation count`, () => {
      const saved = structuredClone(entry.experiment),
        native = entry.native(),
        samples = [native.snapshot()];
      let steps = 0;
      while (!native.done) {
        if (++steps > 16) throw new Error('independent four-step fixture did not terminate');
        samples.push(native.step());
      }
      const result = direct(entry.experiment),
        final = samples.at(-1) as Record<string, unknown>;
      const expected =
        entry.id === 'system:quantum-kicked-rotor'
          ? [final.meanSquareMomentum, final.norm]
          : entry.id === 'system:unitary-floquet'
            ? (final.spectrum as { quasiEnergies: number[] }).quasiEnergies
            : (final.state as number[]);
      expect(result.summary.metrics.map((metric) => metric.final)).toEqual(expected);
      expect(result.summary.steps).toBe(steps);
      expect(result.summary.sampleCount).toBe(samples.length);
      expect(entry.experiment).toEqual(saved);
      expect(result.summary.evaluation).toBe(staticIds.includes(entry.id));
      if (staticIds.includes(entry.id)) {
        expect(steps).toBe(0);
        expect(result.summary.axisUnit).toBe('evaluation');
        expect(result.summary.axisStart).toBe(0);
        expect(result.summary.axisEnd).toBe(0);
      } else {
        const series = createDiagnosticSeries(entry.experiment, samples);
        expect(result.summary.metrics.map((metric) => metric.unit)).toEqual(series.units);
        expect(result.summary.axisUnit).toBe(series.axisUnit);
        expect(result.summary.axisStart).toBe(series.times[0]);
        expect(result.summary.axisEnd).toBe(series.times.at(-1));
        expect(result.summary.warnings).toEqual(expect.arrayContaining(series.warnings));
      }
    });

  it('reports arithmetic sample mean rather than inventing a continuous time average', () => {
    const experiment = unwrap(
      toCanonicalDriven({
        ...defaultDrivenConfig(),
        parameters: { g: 0, length: 1, damping: 0 },
        forcing: { waveform: 'sine', amplitude: 0, frequency: 1, phase: 0 },
        initialState: [0, 1, 0],
        step: 0.01,
        duration: 0.025,
        sampleEvery: 2
      })
    );
    const plan = buildBatch(experiment, {
      ...defaultBatchSettings(experiment),
      kind: 'paired',
      axes: [{ group: 'parameters', key: 'damping', start: 0, end: 0.01, count: 2 }]
    });
    const summary = executeBatchRun({ batchId: plan.id, run: plan.runs[0]! }).summary;
    expect(summary.sampleCount).toBe(3);
    expect(summary.steps).toBe(3);
    expect(summary.metrics[0]!.final).toBeCloseTo(0.025, 14);
    expect(summary.metrics[0]!.mean).toBeCloseTo((0 + 0.02 + 0.025) / 3, 14);
    expect(summary.metrics[0]!.mean).not.toBeCloseTo(0.025 / 2, 6);
    expect(plan.warnings.join(' ')).toContain('시간 가중 평균이 아닙니다');
  });

  it('uses actual supported integrators and fixes every non-method input', () => {
    const experiment = cases.find((entry) => entry.id === 'system:driven')!.experiment;
    const choices = compatibleBatchIntegrators(experiment);
    expect(choices).toEqual(['integrator:euler', 'integrator:rk2', 'integrator:rk4']);
    const plan = buildBatch(experiment, {
      ...defaultBatchSettings(experiment),
      kind: 'integrators',
      axes: [],
      integratorIds: choices
    });
    for (const run of plan.runs) {
      const { integrator: _method, ...input } = run.experiment;
      const { integrator: _sourceMethod, ...source } = experiment;
      expect(input).toEqual(source);
    }
    expect(plan.warnings.join(' ')).toContain('참해가 아닙니다');
    expect(compatibleBatchIntegrators(cases.find((entry) => entry.id === 'system:standard-map')!.experiment)).toEqual(
      []
    );
  });

  it('keeps member-one observations distinct from ensemble mean energy in stochastic summaries', () => {
    const source = cases.find((entry) => entry.id === 'system:langevin')!.experiment;
    const result = direct(source).summary;
    expect(result.metrics[0]!.label).toBe('member-1:theta');
    expect(result.metrics[1]!.label).toBe('member-1:omega');
    expect(result.energy?.unit).toBe('normalized');
    expect(result.warnings.join(' ')).toContain('에너지는 전체 앙상블 평균');
    expect(result.warnings.join(' ')).toContain('수치 오차가 아닙니다');
  });

  for (const id of staticIds)
    it(`${id}: import rejects missing or relabeled static results without recalculating numeric claims`, () => {
      const experiment = cases.find((entry) => entry.id === id)!.experiment;
      const request = { batchId: 'static-review', run: { id: 'static-run', index: 0, experiment, assignments: [] } };
      const valid = executeBatchRun(request);
      expect(validateBatchResult(valid, request)).toEqual(valid);
      expect(() => validateBatchResult({ ...valid, summary: { ...valid.summary, metrics: [] } }, request)).toThrow();
      const impossible = {
        ...valid,
        summary: {
          ...valid.summary,
          metrics: valid.summary.metrics.map((metric, i) =>
            i === 0
              ? {
                  ...metric,
                  initial: 0,
                  final: 1,
                  min: 0,
                  max: 1,
                  mean: 0.5,
                  rms: 0.7
                }
              : metric
          )
        }
      };
      expect(() => validateBatchResult(impossible, request)).toThrow();
      for (const field of ['label', 'unit'] as const) {
        const forged = {
          ...valid,
          summary: {
            ...valid.summary,
            metrics: valid.summary.metrics.map((metric, i) =>
              i === 0 ? { ...metric, [field]: 'wrong-static-metadata' } : metric
            )
          }
        };
        expect(() => validateBatchResult(forged, request)).toThrow();
      }
    });

  it('validates the complete canonical source instead of silently retaining unsupported analysis requests', () => {
    const source = cases.find((entry) => entry.id === 'system:driven')!.experiment;
    const forged: ExperimentStateV1 = {
      ...source,
      analyses: [{ id: 'analysis:unregistered-s21-request', algorithmVersion: '1', settings: {} }]
    };
    expect(() => buildBatch(forged, defaultBatchSettings(source))).toThrow();
    expect(forged.analyses).toHaveLength(1);
  });

  for (const id of [
    'huygens-phase-pair',
    'kuramoto',
    'chimera-exploration',
    'standard-map',
    'quantum-kicked-rotor',
    'unitary-floquet',
    'lattice-fk-limit'
  ])
    it(`${id}: does not invent mechanical energy from absent or placeholder diagnostics`, () => {
      const source = cases.find((entry) => entry.id === `system:${id}`)!.experiment;
      expect(direct(source).summary.energy).toBeUndefined();
    });

  it('paired comparison keeps all source inputs intact except its declared control variable', () => {
    const source = cases.find((entry) => entry.id === 'system:driven')!.experiment;
    const plan = buildBatch(source, {
      ...defaultBatchSettings(source),
      axes: [
        {
          group: 'parameters',
          key: 'damping',
          start: source.parameters.damping!.kind === 'scalar' ? source.parameters.damping!.value : 0,
          end: 0.4,
          count: 2
        }
      ]
    });
    expect(plan.runs[0]!.experiment).toEqual(source);
    const q = source.parameters.damping!;
    if (q.kind !== 'scalar') throw new Error('damping scalar fixture');
    expect(plan.runs[1]!.experiment).toEqual({
      ...source,
      parameters: { ...source.parameters, damping: { ...q, value: 0.4 } }
    });
  });

  it('seeded native paths and aggregate values survive a different bounded completion order', async () => {
    const source = cases.find((entry) => entry.id === 'system:langevin')!.experiment;
    async function runAt(concurrency: number): Promise<{ snapshot: BatchSnapshot; maximum: number; order: number[] }> {
      const plan: BatchPlan = buildBatch(source, {
        ...defaultBatchSettings(source),
        kind: 'ensemble',
        axes: [],
        count: 8,
        seed: 'review-scheduler',
        concurrency
      });
      let active = 0,
        maximum = 0;
      const order: number[] = [];
      const queue = createBatchQueue(plan, {
        executor(request, event) {
          active++;
          maximum = Math.max(maximum, active);
          let settled = false;
          const timer = setTimeout(
            () => {
              const result = executeBatchRun(request);
              active--;
              settled = true;
              order.push(request.run.index);
              event({ type: 'result', id: request.run.id, result });
            },
            (4 - (request.run.index % 4)) * 3
          );
          return {
            dispose() {
              clearTimeout(timer);
              if (!settled) {
                settled = true;
                active--;
              }
            }
          };
        }
      });
      const snapshot = await new Promise<BatchSnapshot>((resolve) => {
        queue.subscribe((state) => {
          if (state.status === 'completed') resolve(state);
        });
        queue.start();
      });
      queue.dispose();
      return { snapshot, maximum, order };
    }
    const serial = await runAt(1),
      parallel = await runAt(4);
    expect(serial.maximum).toBe(1);
    expect(parallel.maximum).toBe(4);
    expect(serial.order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(parallel.order).not.toEqual(serial.order);
    expect(parallel.snapshot.plan.runs.map((entry) => entry.experiment)).toEqual(
      serial.snapshot.plan.runs.map((entry) => entry.experiment)
    );
    expect(parallel.snapshot.runs.map((entry) => entry.result!.summary)).toEqual(
      serial.snapshot.runs.map((entry) => entry.result!.summary)
    );
    expect(parallel.snapshot.aggregate.metrics).toEqual(serial.snapshot.aggregate.metrics);
    expect(parallel.snapshot.aggregate.childRunIds).toEqual(parallel.snapshot.plan.runs.map((entry) => entry.id));
  });
});
