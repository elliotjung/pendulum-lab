import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabSimulation, type LabConfig } from '../../../../src/app/LabSimulation';
import { integratorRegistry } from '../../../../src/physics/integratorRegistry';
import { step } from '../../../../src/physics/integrators';
import { rhsChain } from '../../../../src/physics/nPendulum';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar,
  fromCanonicalPlanar,
  validatePlanarConfig
} from '../../../../src/product/adapters/physics/planar';
import {
  createChainSimulation,
  defaultChainConfig,
  toCanonicalChain,
  fromCanonicalChain,
  validateChainConfig
} from '../../../../src/product/adapters/physics/chain';
import {
  LEGACY_ODE_INTEGRATOR_IDS,
  nativeOdeMethod,
  odeIntegratorWarnings
} from '../../../../src/product/adapters/physics/planar-integrators';
import { createLegacyOdeIntervalStepper } from '../../../../src/product/adapters/physics/planar-step-policy';
import { parseExperiment, serializeExperiment } from '../../../../src/product/persistence/serialization';
import { parseCoreConfig, serializeCoreConfig } from '../../../../src/product/lab/views/core-storage';
import { parseChainConfig, serializeChainConfig } from '../../../../src/product/lab/views/chain-storage';
import { createChainWorkerSession } from '../../../../src/product/adapters/physics/chain-worker-protocol';
import { createCoreModel } from '../../../../src/product/lab/views/core-model';
import type { ContractResult } from '../../../../src/product/contracts/validation';

const unwrap = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
afterEach(() => vi.useRealTimers());

describe('S28 exact public ODE method coverage and native live-Lab policy', () => {
  it('offers every original public method exactly once, including the verlet alias', () => {
    expect(LEGACY_ODE_INTEGRATOR_IDS.map(nativeOdeMethod).sort()).toEqual(Object.keys(integratorRegistry).sort());
    expect(new Set(LEGACY_ODE_INTEGRATOR_IDS).size).toBe(16);
  });
  it('preserves original public derivative metadata: analytic double and fixed-point compound policy', () => {
    const double = createPlanarSimulation(defaultPlanarConfig('system:double'));
    expect(typeof double.derivative.jacobian).toBe('function');
    expect(double.derivative.jacobianProvenance).toBe('analytic-model');
    const compound = createPlanarSimulation(defaultPlanarConfig('system:compound-double'));
    expect(compound.derivative.jacobian).toBeUndefined();
    expect(compound.derivative.jacobianProvenance).toBeUndefined();
  });
  for (const system of ['double', 'compound-double', 'triple'] as const) {
    it.each(LEGACY_ODE_INTEGRATOR_IDS)(
      `${system} %s matches every native state, energy and accepted-step diagnostic`,
      (integratorId) => {
        for (const tolerance of [undefined, 1e-8]) {
          const nativeConfig: LabConfig = {
            system,
            method: nativeOdeMethod(integratorId),
            parameters: {
              m1: 1.2,
              m2: 0.7,
              l1: 0.8,
              l2: 1.1,
              g: 9.81,
              ...(system === 'triple' ? { m3: 0.9, l3: 0.6 } : {})
            },
            gamma: 0.07,
            initialState: system === 'triple' ? [0.4, -0.3, 0.2, 0.1, -0.2, 0.3] : [0.4, -0.3, 0.1, -0.2],
            dt: 0.001,
            ...(tolerance === undefined ? {} : { tolerance })
          };
          const common = {
            integratorId,
            step: 0.001,
            duration: 0.04,
            startTime: 42.5,
            gamma: 0.07,
            ...(tolerance === undefined ? {} : { tolerance })
          };
          const run =
            system === 'triple'
              ? createChainSimulation({
                  ...defaultChainConfig('system:triple'),
                  ...common,
                  parameters: { masses: [1.2, 0.7, 0.9], lengths: [0.8, 1.1, 0.6], g: 9.81 },
                  initialState: nativeConfig.initialState
                })
              : createPlanarSimulation({
                  ...defaultPlanarConfig(system === 'double' ? 'system:double' : 'system:compound-double'),
                  ...common,
                  parameters: nativeConfig.parameters,
                  initialState: nativeConfig.initialState as readonly [number, number, number, number]
                });
          const native = new LabSimulation(nativeConfig);
          while (!run.done) {
            native.step();
            const sample = run.step();
            expect(sample.state).toEqual(native.getState());
            expect(sample.energy.total).toBe(native.energy());
            expect(run.lastStepReport()).toEqual(native.lastStepReport());
            expect(sample.time).toBe(42.5 + sample.step * 0.001);
          }
          expect(run.snapshot().step).toBe(40);
        }
      }
    );
  }
  it.each(LEGACY_ODE_INTEGRATOR_IDS)(
    'N=4 chain %s calls the original dispatcher without method substitution',
    (integratorId) => {
      const config = {
        ...defaultChainConfig('system:chain', 4),
        integratorId,
        tolerance: 1e-8,
        step: 0.001,
        duration: 0.01
      };
      const run = createChainSimulation(config),
        native = Float64Array.from(config.initialState),
        out = new Float64Array(8);
      const rhs = (input: Float64Array, output: Float64Array) => {
        rhsChain(input, config.parameters, config.gamma, output);
      };
      while (!run.done) {
        const diagnostics = {};
        step(nativeOdeMethod(integratorId), native, config.step, rhs, out, {
          tolerance: config.tolerance,
          diagnostics
        });
        expect((diagnostics as { accepted?: boolean }).accepted).not.toBe(false);
        native.set(out);
        expect(run.step().state).toEqual(Array.from(native));
      }
    }
  );
  it('keeps verlet as the original persisted ID while matching the legacy leapfrog numerical alias', () => {
    const source = { ...defaultPlanarConfig(), integratorId: 'integrator:verlet' as const, tolerance: 1e-7 };
    const canonical = unwrap(toCanonicalPlanar(source));
    expect(canonical.integrator).toMatchObject({ id: 'integrator:verlet' });
    expect(unwrap(fromCanonicalPlanar(canonical))).toEqual(source);
    expect(createPlanarSimulation(source).step()).toEqual(
      createPlanarSimulation({ ...source, integratorId: 'integrator:leapfrog' }).step()
    );
  });
});

describe('S28 optional tolerance storage and compatibility', () => {
  it.each(LEGACY_ODE_INTEGRATOR_IDS)(
    '%s preserves specified tolerance and omitted legacy defaults across canonical/state files',
    (integratorId) => {
      for (const tolerance of [undefined, 1e-15, 1e-8, 1]) {
        const option = tolerance === undefined ? {} : { tolerance };
        const planar = { ...defaultPlanarConfig(), integratorId, ...option };
        const chain = { ...defaultChainConfig('system:triple'), integratorId, ...option };
        const planarState = unwrap(toCanonicalPlanar(planar)),
          chainState = unwrap(toCanonicalChain(chain));
        for (const canonical of [planarState, chainState]) {
          expect(canonical.integrator.settings).toEqual(
            tolerance === undefined ? {} : { tolerance: { kind: 'scalar', value: tolerance, unit: '1' } }
          );
        }
        expect(unwrap(fromCanonicalPlanar(unwrap(parseExperiment(unwrap(serializeExperiment(planarState))))))).toEqual(
          planar
        );
        expect(unwrap(fromCanonicalChain(unwrap(parseExperiment(unwrap(serializeExperiment(chainState))))))).toEqual(
          chain
        );
        expect(parseCoreConfig(serializeCoreConfig(planar), planar.systemId)).toEqual(planar);
        expect(parseChainConfig(serializeChainConfig(chain), chain.systemId)).toEqual(chain);
      }
    }
  );
  it.each([0, -1, 1e-16, 1.01, NaN, Infinity, null, '1e-8'])(
    'rejects invalid tolerance %s without clamping or mutating input',
    (tolerance) => {
      for (const base of [defaultPlanarConfig(), defaultChainConfig()]) {
        const source = { ...base, tolerance },
          before = structuredClone(source);
        const result = base.systemId === 'system:double' ? validatePlanarConfig(source) : validateChainConfig(source);
        expect(result.ok).toBe(false);
        expect(source).toEqual(before);
      }
    }
  );
  it.each([
    { tolerance: { kind: 'scalar', value: 1e-8, unit: 's' } },
    { tolerance: { kind: 'vector', values: [1e-8], unit: '1' } },
    { tolerance: { kind: 'scalar', value: 0, unit: '1' } },
    { tolerance: { kind: 'scalar', value: 1e-8, unit: '1' }, maxIterations: { kind: 'scalar', value: 20, unit: '1' } }
  ])('refuses unrepresentable solver settings while preserving source', (settings) => {
    for (const [source, decode] of [
      [unwrap(toCanonicalPlanar(defaultPlanarConfig())), fromCanonicalPlanar],
      [unwrap(toCanonicalChain(defaultChainConfig())), fromCanonicalChain]
    ] as const) {
      const input = { ...source, integrator: { ...source.integrator, settings } },
        before = structuredClone(input);
      expect(decode(input).ok).toBe(false);
      expect(input).toEqual(before);
    }
  });
  it('warns about fixed macro-step error monitoring and limited symplectic claims', () => {
    for (const method of ['rkf45', 'dopri5', 'dop853', 'gbs'] as const)
      expect(odeIntegratorWarnings(`integrator:${method}`, 1e-8).join(' ')).toContain('고정 macro-step');
    expect(odeIntegratorWarnings('integrator:verlet').join(' ')).toContain('호환 별칭');
    expect(odeIntegratorWarnings('integrator:yoshida8').join(' ')).toContain('분리 가능한 정준계');
  });
});

describe('S28 rejected intervals, bounded retry and cancellation', () => {
  it.each(['alias', 'partial-overlap', 'input-dimension', 'output-dimension'] as const)(
    'refuses unsafe %s buffers before evaluating or changing input',
    (kind) => {
      const buffer = new Float64Array([1, 2, 3, 4, 5, 6]);
      const from = buffer.subarray(0, kind === 'input-dimension' ? 1 : 2);
      const out =
        kind === 'alias'
          ? from
          : kind === 'partial-overlap'
            ? buffer.subarray(1, 3)
            : new Float64Array(kind === 'output-dimension' ? 3 : 2);
      const before = buffer.slice(),
        outBefore = out.slice();
      let calls = 0;
      const solver = createLegacyOdeIntervalStepper(
        'integrator:hmidpoint',
        (_state, derivative) => {
          calls++;
          derivative.fill(1);
        },
        2,
        1e-8
      );
      expect(() => solver.advance(from, 0.01, out)).toThrow(/disjoint/);
      expect(buffer).toEqual(before);
      expect(out).toEqual(outBefore);
      expect(calls).toBe(0);
      expect(solver.lastStepReport()).toMatchObject({
        accepted: false,
        advancedDt: 0,
        attempts: 0,
        diagnostics: { accepted: false, failureReason: 'invalid-buffer-boundary' }
      });
    }
  );
  it.each([0, -1, 0.5, NaN, Infinity])(
    'rejects invalid configured dimension %s before allocating scratch',
    (dimension) => {
      expect(() => createLegacyOdeIntervalStepper('integrator:rk4', () => {}, dimension)).toThrow(/dimension/);
    }
  );
  it.each([0.02, 0.05])(
    'compound native implicit policy at dt=%s preserves accepted or rejected interval evidence',
    (dt) => {
      const config = {
        ...defaultPlanarConfig('system:compound-double'),
        parameters: { m1: 1.2, m2: 0.7, l1: 0.8, l2: 1.1, g: 9.81 },
        initialState: [0.4, -0.3, 2, -3] as const,
        gamma: 0.07,
        integratorId: 'integrator:hmidpoint' as const,
        tolerance: 1e-15,
        step: dt,
        duration: dt
      };
      const native = new LabSimulation({
        system: 'compound-double',
        method: 'hmidpoint',
        parameters: config.parameters,
        gamma: config.gamma,
        initialState: config.initialState,
        dt,
        tolerance: config.tolerance
      });
      const run = createPlanarSimulation(config),
        before = run.snapshot();
      let nativeError: unknown, productError: unknown;
      try {
        native.step();
      } catch (cause) {
        nativeError = cause;
      }
      try {
        run.step();
      } catch (cause) {
        productError = cause;
      }
      expect(Boolean(productError)).toBe(Boolean(nativeError));
      expect(run.snapshot().state).toEqual(native.getState());
      expect(run.lastStepReport()).toEqual(native.lastStepReport());
      if (dt === 0.02) {
        expect(run.lastStepReport()).toMatchObject({
          accepted: true,
          attempts: 3,
          retrySubsteps: 2,
          primaryFailure: { accepted: false, solver: 'fixed-point' }
        });
      } else {
        expect(productError).toBeTruthy();
        expect(run.snapshot()).toEqual(before);
        expect(native.time).toBe(0);
        expect(run.lastStepReport()).toMatchObject({ accepted: false, advancedDt: 0 });
      }
    }
  );
  it.each(LEGACY_ODE_INTEGRATOR_IDS)(
    '%s preserves the final shortened interval rather than overshooting duration',
    (integratorId) => {
      const config = { ...defaultPlanarConfig(), integratorId, tolerance: 1e-8, step: 0.001, duration: 0.0025 };
      const run = createPlanarSimulation(config);
      let reference = config.initialState as readonly number[];
      for (let index = 0; index < 3; index++) {
        const dt = Math.min(config.step, config.duration - index * config.step);
        const native = new LabSimulation({
          system: 'double',
          method: nativeOdeMethod(integratorId),
          parameters: config.parameters,
          gamma: config.gamma,
          initialState: reference,
          dt,
          tolerance: config.tolerance
        });
        native.step();
        reference = native.getState();
        expect(run.step().state).toEqual(reference);
        expect(run.lastStepReport()).toEqual(native.lastStepReport());
      }
      expect(run.snapshot()).toMatchObject({ step: 3, time: 0.0025 });
      expect(run.done).toBe(true);
    }
  );
  it('accepts at most two native half-step retries and reports the original rejection', () => {
    const rhs = (s: Float64Array, out: Float64Array) => {
      out[0] = -100 * s[0]!;
    };
    const solver = createLegacyOdeIntervalStepper('integrator:hmidpoint', rhs, 1, 0.002);
    const source = new Float64Array([1]),
      result = new Float64Array(1);
    solver.advance(source, 0.02, result);
    expect(solver.lastStepReport()).toMatchObject({
      accepted: true,
      requestedDt: 0.02,
      advancedDt: 0.02,
      attempts: 3,
      retryAttempted: true,
      retrySubsteps: 2,
      primaryFailure: { accepted: false }
    });
    expect(source[0]).toBe(1);
    expect(result[0]).toBeGreaterThan(0);
  });
  it('refuses a failed retry without committing input and records failure each time', () => {
    const rhs = (s: Float64Array, out: Float64Array) => {
      out[0] = -100 * s[0]!;
    };
    const solver = createLegacyOdeIntervalStepper('integrator:hmidpoint', rhs, 1, 1e-15);
    const source = new Float64Array([1]),
      out = new Float64Array(1);
    expect(() => solver.advance(source, 0.02, out)).toThrow();
    expect(source[0]).toBe(1);
    expect(solver.lastStepReport()).toMatchObject({ accepted: false, advancedDt: 0, attempts: 2, retrySubsteps: 1 });
    expect(Object.isFrozen(solver.lastStepReport().diagnostics)).toBe(true);
    const throwing = createLegacyOdeIntervalStepper(
      'integrator:rk4',
      () => {
        throw new Error('native failure');
      },
      1
    );
    for (let i = 0; i < 2; i++) {
      expect(() => throwing.advance(source, 0.01, out)).toThrow('native failure');
      expect(throwing.lastStepReport()).toMatchObject({ accepted: false, advancedDt: 0, attempts: 1 });
    }
  });
  it.each(['system:double', 'system:compound-double', 'system:triple'] as const)(
    '%s numerical failure preserves accepted state and time',
    (systemId) => {
      const run =
        systemId === 'system:triple'
          ? createChainSimulation({
              ...defaultChainConfig('system:triple'),
              initialState: [1, 2, 3, 10000, -10000, 10000],
              integratorId: 'integrator:hmidpoint',
              tolerance: 1e-15,
              step: 0.05,
              duration: 1
            })
          : createPlanarSimulation({
              ...defaultPlanarConfig(systemId),
              parameters: { m1: 0.001, m2: 0.001, l1: 0.001, l2: 0.001, g: 1000 },
              initialState: [1, 2, 10000, -10000],
              gamma: 1000,
              integratorId: 'integrator:hmidpoint',
              tolerance: 1e-15,
              step: 0.05,
              duration: 1
            });
      const before = run.snapshot();
      expect(() => run.step()).toThrow();
      expect(run.snapshot()).toEqual(before);
      expect(run.lastStepReport()).toMatchObject({ accepted: false, advancedDt: 0 });
    }
  );
  it.each(LEGACY_ODE_INTEGRATOR_IDS)('%s remains cancellable in core scheduler and chain worker', (integratorId) => {
    vi.useFakeTimers();
    const model = createCoreModel({ ...defaultPlanarConfig(), integratorId, tolerance: 1e-8 });
    model.run();
    model.cancel();
    vi.advanceTimersByTime(1000);
    expect(model.state.status).toBe('cancelled');
    expect(model.state.sample.step).toBe(0);
    model.dispose();
    const worker = createChainWorkerSession(() => 0);
    expect(
      worker.handle({
        type: 'initialize',
        id: 'cancel',
        sequence: 0,
        config: { ...defaultChainConfig(), integratorId, tolerance: 1e-8 }
      }).type
    ).toBe('ready');
    expect(worker.handle({ type: 'cancel', id: 'cancel', sequence: 1 }).type).toBe('cancelled');
    expect(worker.handle({ type: 'advance', id: 'cancel', sequence: 2, count: 1 }).type).toBe('error');
  });
});
