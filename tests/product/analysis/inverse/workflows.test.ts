import { describe, expect, it } from 'vitest';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../../src/product/adapters/physics/planar';
import { previewObservationImport, confirmObservationImport } from '../../../../src/product/observations/index';
import { runInverse, executeInverseJob } from '../../../../src/product/adapters/analysis/inverse/execute';
import {
  exportInverseResult,
  importInverseResult,
  predictSurrogateResult
} from '../../../../src/product/adapters/analysis/inverse/artifact';
import {
  defaultEstimateSettings,
  defaultInverseSettings
} from '../../../../src/product/adapters/analysis/inverse/settings';
import { inverseData, inverseHash } from '../../../../src/product/adapters/analysis/inverse/data';
import { validateInverseRequest } from '../../../../src/product/adapters/analysis/inverse/validation';
import type { InverseEvent, InverseRequest } from '../../../../src/product/adapters/analysis/inverse/contracts';
import { fitDoublePendulum } from '../../../../src/research/parameterEstimation';
import { defaultFieldConfig, toCanonicalField } from '../../../../src/product/adapters/physics/field';
import { sobolIndices } from '../../../../src/research/sobolSensitivity';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import { withVariables } from '../../../../src/product/adapters/analysis/inverse/validation';

function source(g = 8) {
  const config = {
    ...defaultPlanarConfig(),
    parameters: { ...defaultPlanarConfig().parameters, g },
    step: 0.01,
    duration: 0.8
  };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('fixture');
  return { config, experiment: canonical.value };
}
async function observation() {
  const simulation = createPlanarSimulation(source(9.81).config),
    rows = ['t,a,b'];
  let snapshot = simulation.snapshot();
  rows.push(`${snapshot.time},${snapshot.state[0]},${snapshot.state[1]}`);
  while (!simulation.done) {
    snapshot = simulation.step();
    rows.push(`${snapshot.time},${snapshot.state[0]},${snapshot.state[1]}`);
  }
  return confirmObservationImport(
    await previewObservationImport({
      kind: 'csv',
      name: 'truth.csv',
      text: rows.join('\n'),
      mapping: { time: 't', theta1: 'a', theta2: 'b' }
    })
  );
}
async function fitRequest(): Promise<InverseRequest> {
  return {
    schema: 'pendulum-inverse-request/v1',
    id: 'recovery',
    experiment: source().experiment,
    settings: defaultEstimateSettings(await observation())
  };
}
function uqRequest(kind: 'sobol' | 'pce' = 'pce'): InverseRequest {
  const experiment = source().experiment;
  return {
    schema: 'pendulum-inverse-request/v1',
    id: 'physical-uq',
    experiment,
    settings: {
      ...defaultInverseSettings(experiment, kind),
      variables: [{ group: 'parameters', key: 'g', min: 8, max: 10 }],
      samples: 16,
      degree: 2
    }
  };
}

describe('S22 native inverse and uncertainty adapters', () => {
  it('recovers gravity from native RK4 observations and exactly matches native fitting', async () => {
    const request = await fitRequest(),
      before = JSON.stringify(request),
      result = await runInverse(request);
    expect(result.kind).toBe('estimate');
    expect(result.rows[0]![1]).toBeCloseTo(9.81, 6);
    expect(JSON.stringify(request)).toBe(before);
    expect(result.observationId).toBe(request.settings.kind === 'estimate' ? request.settings.observation.id : '');
    if (request.settings.kind !== 'estimate') throw new Error('fixture');
    const native = fitDoublePendulum(
      {
        times: request.settings.observation.data.times,
        angles: request.settings.observation.data.angles as readonly (readonly [number, number])[]
      },
      {
        initialState: source().config.initialState,
        base: source().config.parameters,
        gamma: source().config.gamma,
        estimate: ['g'],
        initialGuess: [8],
        dt: 0.01
      },
      { maxIterations: 30, lowerBounds: [0.1], upperBounds: [30] }
    );
    expect(result.payload.fit).toEqual(JSON.parse(JSON.stringify(native)));
    const restored = await importInverseResult(exportInverseResult(result));
    expect(restored).toEqual(result);
    expect(restored.request.settings).toEqual(request.settings);
  });
  it('retains nonconvergence and covariance limitations without turning them into success', async () => {
    const request = await fitRequest();
    if (request.settings.kind !== 'estimate') throw new Error('fixture');
    const result = await runInverse({ ...request, settings: { ...request.settings, maxIterations: 1 } });
    expect((result.payload.fit as { converged: boolean }).converged).toBe(false);
    expect(result.warnings.some((v) => v.includes('수렴하지'))).toBe(true);
    expect(await importInverseResult(exportInverseResult(result))).toEqual(result);
  });
  it('preserves original CSV/calibration lineage and refuses altered raw data on reload', async () => {
    const result = await runInverse(await fitRequest()),
      bad = structuredClone(result);
    if (bad.request.settings.kind !== 'estimate') throw new Error('fixture');
    const observation = bad.request.settings.observation;
    observation.original.text += '\n';
    const { id: _, ...body } = bad;
    const { inverseResultId } = await import('../../../../src/product/adapters/analysis/inverse/execute');
    const inputId = `inverse-input-${inverseHash({ experiment: bad.request.experiment, settings: bad.request.settings })}`;
    const coherent = { ...body, inputId };
    await expect(importInverseResult(JSON.stringify({ ...coherent, id: inverseResultId(coherent) }))).rejects.toThrow();
  });
  it('fits and restores a native PCE model, reports held-out errors and supports bounded prediction', async () => {
    const result = await runInverse(uqRequest()),
      restored = await importInverseResult(exportInverseResult(result));
    expect(restored).toEqual(result);
    expect(result.evaluations).toBe(24);
    expect(result.payload.validationRmse).toBeTypeOf('number');
    expect(Number.isFinite(predictSurrogateResult(restored, [9]))).toBe(true);
    expect(() => predictSurrogateResult(restored, [11])).toThrow(/범위/);
    expect(() => predictSurrogateResult(restored, [])).toThrow();
    const training = result.payload.training as { inputs: number[] }[],
      validation = result.payload.validation as { inputs: number[] }[];
    expect(training).toHaveLength(16);
    expect(validation).toHaveLength(8);
    expect(validation.every((v) => !training.some((t) => JSON.stringify(t.inputs) === JSON.stringify(v.inputs)))).toBe(
      true
    );
  });
  it('Sobol matches the existing native estimator evaluated through the same physical endpoint', async () => {
    const request = uqRequest('sobol'),
      result = await runInverse(request);
    if (request.settings.kind === 'estimate') throw new Error('fixture');
    const settings = request.settings;
    const native = await sobolIndices(
      (point) => {
        const experiment = withVariables(request.experiment, settings.variables, point);
        return executeBatchRun({ batchId: 'direct', run: { id: 'direct', index: 0, experiment, assignments: [] } })
          .summary.metrics[0]!.final;
      },
      [{ name: 'parameters.g', min: 8, max: 10 }],
      { samples: 16 }
    );
    expect(result.payload.native).toEqual(native);
    expect(result.evaluations).toBe(48);
    expect(await importInverseResult(exportInverseResult(result))).toEqual(result);
  });
  it('reports monotonically increasing real forward progress and surfaces failure as an error event', async () => {
    const events: InverseEvent[] = [];
    await executeInverseJob(uqRequest('sobol'), (value) => events.push(value));
    const fractions = events
      .filter((v) => v.type === 'progress')
      .map((v) => v.fraction)
      .filter((v): v is number => v !== null);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((v, i) => i === 0 || v >= fractions[i - 1]!)).toBe(true);
    expect(events.at(-1)?.type).toBe('result');
    const errors: InverseEvent[] = [];
    await executeInverseJob({ ...uqRequest(), schema: 'malformed' } as unknown as InverseRequest, (value) =>
      errors.push(value)
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.type).toBe('error');
  });
});

describe('S22 resource and compatibility refusal', () => {
  it('refuses integer-only computational settings as continuous uniform-distribution UQ inputs', () => {
    for (const systemId of ['system:langevin', 'system:frenkel-kontorova'] as const) {
      const canonical = toCanonicalField(defaultFieldConfig(systemId));
      if (!canonical.ok) throw new Error('fixture');
      const key = systemId === 'system:langevin' ? 'ensembleMembers' : 'maxIterations';
      const request: InverseRequest = {
        schema: 'pendulum-inverse-request/v1',
        id: 'integer-cost',
        experiment: canonical.value,
        settings: {
          ...defaultInverseSettings(canonical.value, 'sobol'),
          variables: [{ group: 'parameters', key, min: 1, max: 16 }]
        }
      };
      expect(() => validateInverseRequest(request)).toThrow(/정수 전용/);
    }
  });
  it.each([
    { samples: 0 },
    { samples: 257 },
    {
      samples: 8,
      degree: 3,
      variables: [
        { group: 'initialConditions', key: 'theta1', min: 0.1, max: 0.2 },
        { group: 'initialConditions', key: 'theta2', min: 0.1, max: 0.2 }
      ]
    },
    { degree: 4 },
    { seed: 'bad seed' },
    { metric: { index: 999, statistic: 'final' } },
    { metric: { index: 0, statistic: 'not-native' } },
    { variables: [] },
    { variables: [{ group: 'parameters', key: 'missing', min: 0, max: 1 }] },
    { variables: [{ group: 'parameters', key: 'g', min: 10, max: 8 }] },
    { variables: [{ group: 'parameters', key: 'g', min: -1, max: 8 }] },
    {
      variables: [
        { group: 'parameters', key: 'g', min: 1, max: 2 },
        { group: 'parameters', key: 'g', min: 2, max: 3 }
      ]
    },
    { variables: [{ group: 'parameters', key: 'g', min: 1, max: 2, unknown: true }] },
    { extra: true }
  ])('rejects malformed UQ settings %j', (patch) => {
    const request = uqRequest();
    expect(() => validateInverseRequest({ ...request, settings: { ...request.settings, ...patch } })).toThrow();
  });
  it('bounds aggregate simulation work before allocating worker', () => {
    const request = uqRequest();
    const experiment = {
      ...request.experiment,
      runtime: {
        ...request.experiment.runtime,
        domain: 'time',
        start: { value: 0, unit: 's' },
        duration: { value: 100, unit: 's' },
        step: { value: 0.001, unit: 's' },
        sampleEvery: 1
      }
    };
    expect(() => validateInverseRequest({ ...request, experiment })).toThrow(/한도/);
  });
  it('refuses a different canonical integrator, model, initial-time origin, unidentifiable masses and out-of-bounds guesses', async () => {
    const request = await fitRequest();
    if (request.settings.kind !== 'estimate') throw new Error('fixture');
    expect(() =>
      validateInverseRequest({
        ...request,
        experiment: { ...request.experiment, integrator: { ...request.experiment.integrator, id: 'integrator:euler' } }
      })
    ).toThrow(/RK4/);
    const compound = toCanonicalPlanar({ ...source().config, systemId: 'system:compound-double' });
    if (!compound.ok) throw new Error('fixture');
    expect(() => validateInverseRequest({ ...request, experiment: compound.value })).toThrow(/이중진자/);
    const start = toCanonicalPlanar({ ...source().config, startTime: 1 });
    if (!start.ok) throw new Error('fixture');
    expect(() => validateInverseRequest({ ...request, experiment: start.value })).toThrow(/시작 시간/);
    expect(() =>
      validateInverseRequest({
        ...request,
        settings: {
          ...request.settings,
          parameters: [
            { key: 'm1', min: 0.1, max: 3 },
            { key: 'm2', min: 0.1, max: 3 }
          ]
        }
      })
    ).toThrow(/식별/);
    expect(() =>
      validateInverseRequest({
        ...request,
        settings: { ...request.settings, parameters: [{ key: 'g', min: 9, max: 10 }] }
      })
    ).toThrow(/초기 추정/);
  });
  it('rejects unaligned observation origin and excessive inverse integration budget', async () => {
    const request = await fitRequest();
    if (request.settings.kind !== 'estimate') throw new Error('fixture');
    const raw = request.settings.observation.original;
    const shifted = confirmObservationImport(
      await previewObservationImport({
        text: raw.text,
        name: raw.name,
        kind: 'csv',
        mapping: { time: 't', theta1: 'a', theta2: 'b' },
        options: { timeOffset: 1 }
      })
    );
    await expect(runInverse({ ...request, settings: { ...request.settings, observation: shifted } })).rejects.toThrow(
      /정렬/
    );
    const tiny = toCanonicalPlanar({ ...source().config, step: 0.0001 });
    if (!tiny.ok) throw new Error('fixture');
    await expect(runInverse({ ...request, experiment: tiny.value })).rejects.toThrow(/예산/);
  });
  it('rejects accessors, pollution, sparse arrays, cycles and unsupported versions without reading getters', () => {
    let reads = 0;
    const getter = Object.defineProperty({}, 'x', {
      enumerable: true,
      get() {
        reads++;
        return 1;
      }
    });
    const cycle: unknown[] = [];
    cycle.push(cycle);
    for (const bad of [
      getter,
      JSON.parse('{"__proto__":{"polluted":true}}'),
      new Array(2),
      cycle,
      new Date(),
      { x: Infinity }
    ])
      expect(() => inverseData(bad)).toThrow();
    expect(reads).toBe(0);
    expect(() => validateInverseRequest({ ...uqRequest(), schema: 'future' })).toThrow();
  });
  it('revalidates result kind/lineage/numerical dimensions and validates the PCE training relation', async () => {
    const result = await runInverse(uqRequest());
    for (const patch of [
      { kind: 'estimate' },
      { inputId: 'wrong' },
      { rows: [[1, 2, 3, 4]] },
      { units: [] },
      { payload: { ...result.payload, validationRmse: 99 } }
    ])
      await expect(importInverseResult(JSON.stringify({ ...result, ...patch }))).rejects.toThrow();
    const bad = structuredClone(result);
    (bad.payload.model as { coefficients: number[] }).coefficients[0]! += 1;
    const { inverseResultId } = await import('../../../../src/product/adapters/analysis/inverse/execute');
    const { id: _, ...body } = bad;
    await expect(importInverseResult(JSON.stringify({ ...body, id: inverseResultId(body) }))).rejects.toThrow(/PCE/);
    await expect(importInverseResult('{broken')).rejects.toThrow(/JSON/);
  });
  it('rejects internally inconsistent Sobol sample design, summaries and metric units even with a regenerated public ID', async () => {
    const result = await runInverse(uqRequest('sobol'));
    const { inverseResultId } = await import('../../../../src/product/adapters/analysis/inverse/execute');
    const mutations = [
      (value: typeof result) => {
        (value.payload.evaluated as { inputs: number[] }[])[0]!.inputs[0]! += 0.0001;
      },
      (value: typeof result) => {
        const native = value.payload.native as { mean: number };
        native.mean += 1;
      },
      (value: typeof result) => {
        (value.payload as { metricUnit: string }).metricUnit = 'wrong';
      },
      (value: typeof result) => {
        (value.columns as string[])[0] = 'wrong';
      }
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(result);
      mutate(changed);
      const { id: _, ...body } = changed;
      await expect(importInverseResult(JSON.stringify({ ...body, id: inverseResultId(body) }))).rejects.toThrow();
    }
  });
});
