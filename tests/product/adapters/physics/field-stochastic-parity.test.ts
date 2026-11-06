import { describe, expect, it } from 'vitest';
import { rhsPendulumNetwork } from '../../../../src/physics/pendulumNetwork';
import {
  eulerMaruyamaStep,
  milsteinStep,
  stochasticHeunStratonovichStep,
  commutativeMilsteinStep,
  gaussianSampler
} from '../../../../src/physics/stochasticSteppers';
import { commutativityDefect } from '../../../../src/physics/noiseCommutativity';
import {
  createFieldSimulation,
  defaultFieldConfig,
  fieldMemberSeed,
  fieldPendulumParameters,
  toCanonicalField,
  fromCanonicalField,
  validateFieldConfig
} from '../../../../src/product/adapters/physics/field';
import {
  FIELD_STOCHASTIC_SCHEMES,
  fieldStochasticCallbacks,
  type FieldStochasticOptions
} from '../../../../src/product/adapters/physics/field-stochastic';
import { createFieldWorkerSession } from '../../../../src/product/adapters/physics/field-worker-protocol';
import { parseFieldConfig, serializeFieldConfig } from '../../../../src/product/lab/views/field-storage';
import type { ContractResult } from '../../../../src/product/contracts/validation';

const unwrap = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
function modifier(scheme: (typeof FIELD_STOCHASTIC_SCHEMES)[number]): FieldStochasticOptions {
  return {
    scheme,
    offset: [0.2, 1],
    slope: [0.1, -0.2],
    ...(['heun-stratonovich', 'commutative-milstein'].includes(scheme) ? { matrix: [1, 0.3, -0.2, 0.8] as const } : {})
  } as FieldStochasticOptions;
}
describe('S28 native additive, multiplicative and matrix stochastic integration', () => {
  it.each(FIELD_STOCHASTIC_SCHEMES)(
    '%s exactly matches native independent member streams and keeps ensemble prefixes',
    (scheme) => {
      const c = { ...defaultFieldConfig(), stochastic: modifier(scheme), duration: 0.2, ensemble: { members: 4 } };
      const native = Array.from({ length: 4 }, () => Float64Array.from(c.initialState)),
        samplers = native.map((_, i) => gaussianSampler(fieldMemberSeed(c.seed.value, i)));
      const sim = createFieldSimulation(c),
        larger = createFieldSimulation({ ...c, ensemble: { members: 8 } });
      const parameters = fieldPendulumParameters(c),
        sigma = c.parameters.noise!;
      const drift = (state: Float64Array, out: Float64Array) => {
        rhsPendulumNetwork(state, parameters, out);
      };
      // Independently spell the declared affine coefficients; do not use adapter callbacks as the oracle.
      const matrix = (state: Float64Array, out: number[]) => {
        for (let i = 0; i < 2; i++)
          for (let k = 0; k < 2; k++)
            out[i * 2 + k] =
              sigma *
              (c.stochastic.offset[i]! + c.stochastic.slope[i]! * state[i]!) *
              ('matrix' in c.stochastic ? c.stochastic.matrix[i * 2 + k]! : 0);
      };
      const jacobian = (_state: Float64Array, out: number[]) => {
        out.fill(0);
        for (let i = 0; i < 2; i++)
          for (let k = 0; k < 2; k++)
            out[(i * 2 + k) * 2 + i] =
              sigma * c.stochastic.slope[i]! * ('matrix' in c.stochastic ? c.stochastic.matrix[i * 2 + k]! : 0);
      };
      while (!sim.done) {
        native.forEach((state, i) => {
          const next = new Float64Array(2),
            diffusion = [0, 1].map((k) => sigma * (c.stochastic.offset[k]! + c.stochastic.slope[k]! * state[k]!));
          if (scheme === 'euler-maruyama') eulerMaruyamaStep(state, c.step, drift, diffusion, samplers[i]!, next);
          else if (scheme === 'milstein')
            milsteinStep(
              state,
              c.step,
              drift,
              diffusion,
              c.stochastic.slope.map((v) => sigma * v),
              samplers[i]!,
              next
            );
          else if (scheme === 'heun-stratonovich')
            stochasticHeunStratonovichStep(state, c.step, drift, 2, matrix, samplers[i]!, next);
          else commutativeMilsteinStep(state, c.step, drift, 2, matrix, jacobian, samplers[i]!, next);
          state.set(next);
        });
        const sample = sim.step(),
          prefix = larger.step();
        expect(sample.memberStates).toEqual(native.map((s) => Array.from(s)));
        expect(prefix.memberStates.slice(0, 4)).toEqual(sample.memberStates);
        expect(sample.ensemble.seeds).toEqual(samplers.map((_, i) => fieldMemberSeed(c.seed.value, i)));
      }
      expect(() => sim.restartConfig()).toThrow('cursor');
    }
  );
  it.each(FIELD_STOCHASTIC_SCHEMES)(
    '%s numerical failure retains the last complete ensemble and closes continuation',
    (scheme) => {
      const stochastic = { ...modifier(scheme), offset: [10, 10] as const, slope: [10, 10] as const };
      const source = {
        ...defaultFieldConfig(),
        stochastic,
        parameters: { damping: 0, noise: 5 },
        initialState: [999, 999],
        step: 0.05,
        duration: 0.1,
        ensemble: { members: 2 }
      };
      const run = createFieldSimulation(source),
        accepted = run.snapshot();
      expect(() => run.step()).toThrow();
      expect(run.snapshot()).toEqual(accepted);
      expect(() => run.step()).toThrow();
      expect(run.snapshot()).toEqual(accepted);
    }
  );
  it('keeps the old omitted configuration canonical and seeded results exactly unchanged', () => {
    const source = { ...defaultFieldConfig(), duration: 0.1, ensemble: { members: 2 } };
    const state = unwrap(toCanonicalField(source));
    expect(state.integrator.settings).toEqual({});
    expect(state.integrator.options).toBeUndefined();
    expect(unwrap(fromCanonicalField(state))).toEqual(source);
    const old = createFieldSimulation(source),
      explicit = createFieldSimulation({
        ...source,
        stochastic: { scheme: 'euler-maruyama', offset: [0, 1], slope: [0, 0] }
      });
    while (!old.done) expect(explicit.step().memberStates).toEqual(old.step().memberStates);
  });
  it('owns detached diffusion metadata so caller/source edits cannot alter a seeded run', () => {
    const source = { ...defaultFieldConfig(), stochastic: modifier('commutative-milstein'), duration: 0.1 };
    const run = createFieldSimulation(source),
      expected = createFieldSimulation(source).step();
    (source.stochastic.offset as unknown as number[])[0] = 10;
    (run.config.stochastic!.slope as unknown as number[])[1] = 10;
    expect(run.step()).toEqual(expected);
  });
  it.each(FIELD_STOCHASTIC_SCHEMES)('%s preserves every option in canonical/storage and worker execution', (scheme) => {
    const source = { ...defaultFieldConfig(), stochastic: modifier(scheme), duration: 0.1, ensemble: { members: 2 } };
    const canonical = unwrap(toCanonicalField(source)),
      restored = unwrap(fromCanonicalField(canonical));
    expect(restored).toEqual(source);
    expect(restored.stochastic).not.toBe(source.stochastic);
    expect(canonical.integrator.options).toEqual({ scheme, diffusionModel: 'row-affine-v1' });
    expect(parseFieldConfig(serializeFieldConfig(source), source.systemId)).toEqual(source);
    const direct = createFieldSimulation(source),
      worker = createFieldWorkerSession(() => 0);
    expect(worker.handle({ type: 'initialize', id: 'sde', sequence: 0, config: source }).type).toBe('ready');
    const event = worker.handle({ type: 'advance', id: 'sde', sequence: 1, count: 64 });
    while (!direct.done) direct.step();
    expect(event.type).toBe('progress');
    if (event.type === 'progress') expect(event.sample).toEqual(direct.snapshot());
    const cancelled = createFieldWorkerSession();
    cancelled.handle({ type: 'initialize', id: 'cancel', sequence: 0, config: source });
    expect(cancelled.handle({ type: 'cancel', id: 'cancel', sequence: 1 }).type).toBe('cancelled');
    expect(cancelled.handle({ type: 'advance', id: 'cancel', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('supplies an exact matrix diffusion Jacobian and satisfies the native commutativity diagnostic', () => {
    const options = modifier('commutative-milstein'),
      callback = fieldStochasticCallbacks(0.4, options);
    const state = new Float64Array([0.5, -0.2]),
      matrix: number[] = new Array(4).fill(0),
      jac: number[] = new Array(8).fill(0);
    callback.diffusion(state, matrix, 2);
    callback.jacobian(state, jac, 2);
    for (let component = 0; component < 2; component++) {
      const shifted = state.slice(),
        plus: number[] = new Array(4).fill(0);
      shifted[component] = shifted[component]! + 1e-5;
      callback.diffusion(shifted, plus, 2);
      for (let index = 0; index < 4; index++)
        expect((plus[index]! - matrix[index]!) / 1e-5).toBeCloseTo(jac[index * 2 + component]!, 10);
    }
    expect(commutativityDefect(state, 2, callback.diffusion, callback.jacobian)).toBeLessThan(1e-14);
  });
  it.each([
    null,
    { scheme: 'future', offset: [0, 1], slope: [0, 0] },
    { scheme: 'milstein', offset: [0, 1] },
    { scheme: 'milstein', offset: [0, 1], slope: [0] },
    { scheme: 'milstein', offset: [0, 11], slope: [0, 0] },
    { scheme: 'milstein', offset: [0, 1], slope: [0, 0], matrix: [1, 0, 0, 1] },
    { scheme: 'heun-stratonovich', offset: [0, 1], slope: [0, 0] },
    { scheme: 'commutative-milstein', offset: [0, 1], slope: [0, 0], matrix: [1, 2, 3] }
  ])('rejects malformed diffusion without mutating original data %j', (stochastic) => {
    const source = { ...defaultFieldConfig(), stochastic },
      before = structuredClone(source);
    expect(validateFieldConfig(source).ok).toBe(false);
    expect(source).toEqual(before);
  });
  it('refuses unsupported field-model settings and unrepresentable canonical options', () => {
    expect(validateFieldConfig({ ...defaultFieldConfig('system:fput'), stochastic: modifier('milstein') }).ok).toBe(
      false
    );
    const state = unwrap(toCanonicalField({ ...defaultFieldConfig(), stochastic: modifier('milstein') }));
    for (const integrator of [
      { ...state.integrator, options: { scheme: 'milstein', diffusionModel: 'future' } },
      {
        ...state.integrator,
        settings: { ...state.integrator.settings, extra: { kind: 'scalar', value: 1, unit: '1' } }
      },
      {
        ...state.integrator,
        settings: { ...state.integrator.settings, diffusionOffset: { kind: 'vector', values: [0, 1], unit: 'rad' } }
      }
    ])
      expect(fromCanonicalField({ ...state, integrator }).ok).toBe(false);
  });
});
