import { describe, expect, test } from 'vitest';
import fixture from '../../../characterization/numerical-golden.fixture.json';
import { createDoublePendulumDerivative, energyDouble } from '../../../../src/physics/double';
import { createCompoundDoublePendulumDerivative, energyCompoundDouble } from '../../../../src/physics/compoundDouble';
import { eulerStep, rk2Step, rk4Step } from '../../../../src/physics/integrators';
import {
  createPlanarSimulation,
  createPlanarDerivative,
  defaultPlanarConfig,
  validatePlanarConfig,
  fromCanonicalPlanar,
  toCanonicalPlanar,
  planarPositions,
  planarWarnings,
  PLANAR_SYSTEM_IDS,
  PLANAR_FIELDS,
  type PlanarConfig,
  type PlanarState
} from '../../../../src/product/adapters/physics/planar';
import { parseExperiment, serializeExperiment } from '../../../../src/product/persistence/serialization';
import type { ContractResult } from '../../../../src/product/contracts/validation';

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
function expectNumbers(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    const reference = expected[i]!;
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value - reference)).toBeLessThanOrEqual(
      fixture.tolerance.numeric.absolute + fixture.tolerance.numeric.relative * Math.abs(reference)
    );
  });
}

describe('S07 legacy planar physics adapter', () => {
  test.each(PLANAR_SYSTEM_IDS)('%s matches every S01 golden state, RHS and energy snapshot', (systemId) => {
    const input = fixture.inputs.planar;
    const config: PlanarConfig = {
      systemId,
      parameters: input.parameters,
      gamma: input.gamma,
      initialState: input.initialState as unknown as PlanarState,
      integratorId: 'integrator:rk4',
      step: input.dt,
      duration: input.steps * input.dt
    };
    const run = createPlanarSimulation(config);
    const expected = fixture.expected[systemId === 'system:double' ? 'double' : 'compound'];
    const initialEnergy = run.snapshot().energy.total;
    let maxDrift = 0;
    const snapshots = [];
    for (let step = 0; step <= input.steps; step += 1) {
      const sample = run.snapshot();
      maxDrift = Math.max(maxDrift, Math.abs(sample.energy.total - initialEnergy));
      if (input.snapshotSteps.includes(step)) {
        const rhs = new Float64Array(4);
        run.derivative(Float64Array.from(sample.state), rhs);
        snapshots.push({ ...sample, rhs: Array.from(rhs) });
      }
      if (!run.done) run.step();
    }
    expect(run.done).toBe(true);
    expect(snapshots).toHaveLength(expected.snapshots.length);
    snapshots.forEach((sample, i) => {
      const reference = expected.snapshots[i]!;
      expect(sample.step).toBe(reference.step);
      expect(sample.time).toBe(reference.time);
      expectNumbers(sample.state, reference.state);
      expectNumbers(sample.rhs, reference.rhs);
      expectNumbers(
        [sample.energy.total, sample.energy.KE, sample.energy.PE],
        [reference.energy.total, reference.energy.KE, reference.energy.PE]
      );
    });
    expectNumbers([maxDrift], [expected.maxAbsoluteEnergyDrift]);
    expect(maxDrift).toBeLessThan(1e-8);
  });

  for (const systemId of PLANAR_SYSTEM_IDS) {
    test.each(['integrator:rk4', 'integrator:rk2', 'integrator:euler'] as const)(
      `${systemId} %s exactly reuses the legacy step and damping`,
      (integratorId) => {
        const config: PlanarConfig = {
          ...defaultPlanarConfig(systemId),
          gamma: 0.09,
          integratorId,
          duration: 0.04,
          step: 0.001
        };
        const run = createPlanarSimulation(config);
        const derivative =
          systemId === 'system:double' ? createDoublePendulumDerivative : createCompoundDoublePendulumDerivative;
        const energy = systemId === 'system:double' ? energyDouble : energyCompoundDouble;
        const rhs = derivative(config.parameters, config.gamma);
        const stepper =
          integratorId === 'integrator:rk4' ? rk4Step : integratorId === 'integrator:rk2' ? rk2Step : eulerStep;
        const legacy = Float64Array.from(config.initialState);
        const out = new Float64Array(4);
        while (!run.done) {
          stepper(legacy, config.step, rhs, out);
          legacy.set(out);
          const sample = run.step();
          expect(sample.state).toEqual(Array.from(legacy));
          expect(sample.energy).toEqual(energy(legacy, config.parameters));
        }
        expect(run.snapshot().step).toBe(40);
      }
    );
  }

  test.each(PLANAR_SYSTEM_IDS)('%s preserves rest geometry, rod centers and gravitational energy', (systemId) => {
    const config: PlanarConfig = { ...defaultPlanarConfig(systemId), initialState: [0, 0, 0, 0] };
    const run = createPlanarSimulation(config);
    const sample = run.step();
    expect(sample.state).toEqual([0, 0, 0, 0]);
    expect(sample.positions.first.x).toBe(0);
    expect(sample.positions.first.y).toBe(-1);
    expect(sample.positions.second.y).toBe(-2);
    expect(sample.energy.KE).toBe(0);
    expect(sample.energy.PE).toBeCloseTo(systemId === 'system:double' ? -29.43 : -19.62, 12);
    if (systemId === 'system:compound-double')
      expect(sample.positions.centers?.map((point) => point.y)).toEqual([-0.5, -1.5]);
    else expect(sample.positions.centers).toBeUndefined();
    const horizontal = planarPositions(config, [Math.PI / 2, Math.PI / 2, 0, 0]);
    expect(horizontal.second.x).toBe(2);
    expect(horizontal.second.y).toBeCloseTo(0, 12);
  });

  test('fractional final steps end exactly at the requested time without overshoot', () => {
    const config: PlanarConfig = { ...defaultPlanarConfig(), startTime: 13, duration: 0.005, step: 0.002 };
    const run = createPlanarSimulation(config);
    const legacy = Float64Array.from(config.initialState);
    const out = new Float64Array(4);
    for (const dt of [0.002, 0.002, 0.001]) {
      rk4Step(legacy, dt, createPlanarDerivative(config), out);
      legacy.set(out);
      run.step();
    }
    expect(run.done).toBe(true);
    expect(run.snapshot().time).toBe(13.005);
    expect(run.snapshot().state).toEqual(Array.from(legacy));
    expect(run.step()).toEqual(run.snapshot());
  });

  test('decimal duration does not allocate an extra zero-sized step', () => {
    const run = createPlanarSimulation({ ...defaultPlanarConfig(), duration: 0.14, step: 0.02 });
    while (!run.done) run.step();
    expect(run.snapshot().step).toBe(7);
    expect(run.snapshot().time).toBe(0.14);
  });

  test('isolates caller configuration and snapshots from an active simulation', () => {
    const config = defaultPlanarConfig();
    const run = createPlanarSimulation(config);
    const expected = createPlanarSimulation(config).step();
    config.parameters.g = 100;
    run.config.parameters.g = 0;
    (run.snapshot().state as unknown as number[])[0] = 999;
    expect(run.step()).toEqual(expected);
  });

  test('a failed numerical step does not advance time or corrupt the accepted state', () => {
    const run = createPlanarSimulation({
      ...defaultPlanarConfig(),
      parameters: { m1: 0.001, m2: 0.001, l1: 0.001, l2: 0.001, g: 1000 },
      initialState: [1, 2, 1e4, -1e4],
      gamma: 1000,
      integratorId: 'integrator:euler',
      step: 0.05,
      duration: 1
    });
    let failed = false;
    while (!run.done) {
      const before = run.snapshot();
      try {
        run.step();
      } catch {
        expect(run.snapshot()).toEqual(before);
        failed = true;
        break;
      }
    }
    expect(failed).toBe(true);
  });

  test.each([
    { gamma: -1 },
    { step: 0 },
    { step: 0.06 },
    { duration: 301 },
    { step: 1e-6, duration: 1 },
    { step: 0.01, duration: 0.001 },
    { startTime: Number.MAX_VALUE },
    { sampleEvery: 0 },
    { sampleEvery: 1.2 },
    { startTime: null },
    { sampleEvery: null },
    { gamma: Number.NaN },
    { integratorId: 'integrator:unknown' },
    { systemId: 'system:triple' },
    { initialState: [1, 2, 3] },
    { initialState: [1, 2, 3, 4, 5] },
    { initialState: [1, 2, Infinity, 4] },
    { unexpected: true }
  ])('rejects invalid or unsupported configuration %j', (change) => {
    const input = { ...defaultPlanarConfig(), ...change };
    expect(validatePlanarConfig(input).ok).toBe(false);
    expect(() => createPlanarSimulation(input as PlanarConfig)).toThrow();
  });

  test.each([
    { m1: 0 },
    { m2: -1 },
    { l1: 0 },
    { l2: Infinity },
    { g: -1 },
    { m3: 1 },
    { m1: 0.001, m2: 1000, l1: 1000, l2: 0.001 }
  ])('rejects invalid or singular model parameters %j', (change) => {
    const config = defaultPlanarConfig();
    expect(
      validatePlanarConfig({ ...config, initialState: [0, 0, 0, 0], parameters: { ...config.parameters, ...change } })
        .ok
    ).toBe(false);
  });

  test('never invokes an accessor during untrusted configuration validation', () => {
    let invoked = false;
    const input = {
      ...defaultPlanarConfig(),
      get gamma() {
        invoked = true;
        return 0;
      }
    };
    expect(validatePlanarConfig(input).ok).toBe(false);
    expect(invoked).toBe(false);
  });
});

describe('S07 canonical restart boundary', () => {
  test.each(PLANAR_SYSTEM_IDS)('%s save/serialize/reload preserves exact restart semantics', (systemId) => {
    const config: PlanarConfig = {
      ...defaultPlanarConfig(systemId),
      initialState: [12 * Math.PI + 0.2, -8 * Math.PI, 0.3, -0.4],
      gamma: 0.125,
      integratorId: 'integrator:rk2',
      startTime: 21.25,
      sampleEvery: 3,
      seed: { value: '00042', generator: 'reserved', generatorVersion: '1' },
      provenance: {
        createdByVersion: '10.36.0',
        source: { kind: 'manual' },
        parentExperimentIds: [],
        sourceUnits: { 'initialConditions.theta1': 'deg' }
      },
      analyses: [{ id: 'analysis:lyapunov', algorithmVersion: '1', settings: {} }]
    };
    const canonical = unwrap(toCanonicalPlanar(config));
    const serialized = unwrap(serializeExperiment(canonical));
    const restored = unwrap(fromCanonicalPlanar(unwrap(parseExperiment(serialized))));
    expect(restored).toEqual(config);
    expect(unwrap(toCanonicalPlanar(restored))).toEqual(canonical);
    expect(createPlanarSimulation(restored).step()).toEqual(createPlanarSimulation(config).step());
    expect(canonical.parameters.gamma).toEqual({ kind: 'scalar', value: 0.125, unit: 'kg*m^2/s' });
  });

  test('import preserves optional analyses/provenance with detached copies', () => {
    const canonical = unwrap(toCanonicalPlanar(defaultPlanarConfig()));
    const restored = unwrap(fromCanonicalPlanar(canonical));
    (restored.parameters as Record<string, number>).m1 = 2;
    expect(canonical.parameters.m1).toEqual({ kind: 'scalar', value: 1, unit: 'kg' });
  });

  test.each([
    'missing-gamma',
    'wrong-unit',
    'extra-parameter',
    'wrong-model-version',
    'wrong-integrator-version',
    'integrator-settings',
    'model-options',
    'integrator-options'
  ] as const)('rejects %s without losing the original data', (kind) => {
    const source = structuredClone(unwrap(toCanonicalPlanar(defaultPlanarConfig()))) as unknown as Record<
      string,
      unknown
    >;
    const parameters = source.parameters as Record<string, unknown>;
    const integrator = source.integrator as Record<string, unknown>;
    if (kind === 'missing-gamma') delete parameters.gamma;
    if (kind === 'wrong-unit') parameters.gamma = { kind: 'scalar', value: 0.1, unit: 's^-1' };
    if (kind === 'extra-parameter') parameters.mass = { kind: 'scalar', value: 1, unit: 'kg' };
    if (kind === 'wrong-model-version') source.modelVersion = '999';
    if (kind === 'wrong-integrator-version') integrator.version = '999';
    if (kind === 'integrator-settings')
      integrator.settings = { maxIterations: { kind: 'scalar', value: 10, unit: '1' } };
    if (kind === 'model-options') source.modelOptions = {};
    if (kind === 'integrator-options') integrator.options = {};
    const before = JSON.stringify(source);
    expect(fromCanonicalPlanar(source).ok).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });

  test('field metadata and unit/solver warnings are usable without mutating a configuration', () => {
    expect(PLANAR_FIELDS.find((field) => field.id === 'gamma')?.unit).toBe('kg*m^2/s');
    const warnings = planarWarnings({
      ...defaultPlanarConfig('system:compound-double'),
      gamma: 1,
      integratorId: 'integrator:euler',
      step: 0.02
    });
    expect(warnings.some((warning) => warning.includes('감쇠'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('오일러'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('간격'))).toBe(true);
  });
});
