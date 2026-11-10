import { afterEach, describe, expect, it, vi } from 'vitest';
import { energyDouble, createDoublePendulumDerivative } from '../../../../src/physics/double';
import { energyCompoundDouble, createCompoundDoublePendulumDerivative } from '../../../../src/physics/compoundDouble';
import { energyTriple } from '../../../../src/physics/energy';
import { createTripleRhsWorkspace, rhsTriple } from '../../../../src/physics/triple';
import { createChainWorkspace, rhsChain, energyChain } from '../../../../src/physics/nPendulum';
import {
  canonicalRhs,
  canonicalStepThetaOmega,
  implicitMidpointCanonical,
  omegaToMomentum
} from '../../../../src/physics/canonical';
import { energyDriftProfile } from '../../../../src/research/structurePreservation';
import { compareDoublePendulumFormulations } from '../../../../src/validation/formulationEquivalence';
import { step } from '../../../../src/physics/integrators';
import type { Derivative, StepDiagnostics } from '../../../../src/physics/types';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  type PlanarConfig
} from '../../../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain, type ChainConfig } from '../../../../src/product/adapters/physics/chain';
import {
  LEGACY_ODE_INTEGRATOR_IDS,
  nativeOdeMethod
} from '../../../../src/product/adapters/physics/planar-integrators';
import {
  computeStructureEnergy,
  computeStructureCanonical,
  STRUCTURE_CANONICAL_DEFAULTS,
  STRUCTURE_ENERGY_DEFAULTS,
  validateStructureEnergySettings,
  validateStructureCanonicalSettings,
  serializeStructureArtifact
} from '../../../../src/product/adapters/physics/structure-diagnostics';
import {
  handleStructureDiagnostic,
  type StructureDiagnosticEvent,
  type StructureDiagnosticRequest
} from '../../../../src/product/adapters/physics/structure-diagnostics-worker-protocol';
import {
  createStructureDiagnosticClient,
  type StructureDiagnosticWorker
} from '../../../../src/product/adapters/physics/structure-diagnostics-client';
import type { ContractResult } from '../../../../src/product/contracts/validation';

function value<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
const settings = { dt: 0.001, totalTime: 0.03, samples: 3, tolerance: 1e-10 };
const planar = { ...defaultPlanarConfig(), gamma: 0, initialState: [6.5, -6.4, 0.2, -0.3] as const, startTime: 7 };
const experiment = value(toCanonicalPlanar(planar));
afterEach(() => vi.useRealTimers());

function nativeProfile(config: PlanarConfig | ChainConfig) {
  let rhs: Derivative, energy: (state: Float64Array) => number;
  if (config.systemId === 'system:double' || config.systemId === 'system:compound-double') {
    const p = config as PlanarConfig;
    rhs = (p.systemId === 'system:double' ? createDoublePendulumDerivative : createCompoundDoublePendulumDerivative)(
      p.parameters,
      0
    );
    energy = (state) =>
      (p.systemId === 'system:double' ? energyDouble : energyCompoundDouble)(state, p.parameters).total;
  } else {
    const c = config as ChainConfig;
    if (c.systemId === 'system:triple') {
      const { masses: m, lengths: l, g } = c.parameters,
        p = { m1: m[0]!, m2: m[1]!, m3: m[2]!, l1: l[0]!, l2: l[1]!, l3: l[2]!, g },
        workspace = createTripleRhsWorkspace();
      rhs = (state, out) => rhsTriple(state, p, 0, out, workspace);
      energy = (state) => energyTriple(state, p).total;
    } else {
      const workspace = createChainWorkspace(c.parameters.masses.length);
      rhs = (state, out) => rhsChain(state, c.parameters, 0, out, workspace);
      energy = (state) => energyChain(state, c.parameters).total;
    }
  }
  return energyDriftProfile({
    ...settings,
    method: nativeOdeMethod(config.integratorId),
    initialState: config.initialState,
    rhs,
    energy
  });
}
function fakeWorker() {
  const requests: StructureDiagnosticRequest[] = [],
    worker: StructureDiagnosticWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (request) => {
        requests.push(request);
      },
      terminate: vi.fn()
    };
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = handleStructureDiagnostic(request);
      worker.onmessage?.({ data: event } as MessageEvent<StructureDiagnosticEvent>);
      return event;
    }
  };
}
describe('S28 actual native energy drift profile and canonical diagnostics', () => {
  for (const systemId of ['system:double', 'system:compound-double', 'system:triple', 'system:chain'] as const)
    it.each(LEGACY_ODE_INTEGRATOR_IDS)(
      `${systemId} %s profile is bit-exact native output without changing source`,
      (integratorId) => {
        const config =
          systemId === 'system:double' || systemId === 'system:compound-double'
            ? { ...planar, systemId, integratorId }
            : { ...defaultChainConfig(systemId), integratorId, startTime: 7 };
        const source = value(
            config.systemId === 'system:double' || config.systemId === 'system:compound-double'
              ? toCanonicalPlanar(config as PlanarConfig)
              : toCanonicalChain(config as ChainConfig)
          ),
          before = JSON.stringify(source),
          result = computeStructureEnergy(source, settings);
        expect(result.profile).toEqual(nativeProfile(config));
        expect(result.acceptance).toEqual({
          policy: 'raw-native-no-retry',
          steps: 30,
          acceptedSteps: 30,
          rejectedSteps: 0
        });
        expect(result.experiment).toEqual(source);
        expect(result.profile.times).toEqual([0.01, 0.02, 0.03]);
        expect(JSON.stringify(source)).toBe(before);
        expect(JSON.parse(serializeStructureArtifact(result))).toEqual(result);
      }
    );
  it('refuses a genuinely rejected native step rather than certifying repeated unchanged states', () => {
    const config = {
        ...defaultPlanarConfig('system:compound-double'),
        gamma: 0,
        parameters: { m1: 1.2, m2: 0.7, l1: 0.8, l2: 1.1, g: 9.81 },
        initialState: [0.4, -0.3, 2, -3] as const,
        integratorId: 'integrator:hmidpoint' as const
      },
      source = value(toCanonicalPlanar(config)),
      before = JSON.stringify(source),
      diagnostics: Partial<StepDiagnostics> = {},
      out = new Float64Array(4);
    step(
      'hmidpoint',
      Float64Array.from(config.initialState),
      0.05,
      createCompoundDoublePendulumDerivative(config.parameters, 0),
      out,
      { tolerance: 1e-15, previousError: { value: 0 }, diagnostics }
    );
    expect(diagnostics.accepted).toBe(false);
    // The unchanged native helper does not inspect rejection diagnostics and
    // would otherwise classify three repeated source states as zero drift.
    const unsafeProfile = energyDriftProfile({
      method: 'hmidpoint',
      rhs: createCompoundDoublePendulumDerivative(config.parameters, 0),
      energy: (state) => energyCompoundDouble(state, config.parameters).total,
      initialState: config.initialState,
      dt: 0.05,
      totalTime: 0.15,
      samples: 3,
      tolerance: 1e-15
    });
    expect(unsafeProfile.drift).toEqual([0, 0, 0]);
    expect(unsafeProfile.maxAbsDrift).toBe(0);
    expect(() => computeStructureEnergy(source, { dt: 0.05, totalTime: 0.15, samples: 3, tolerance: 1e-15 })).toThrow(
      '수락하지 못했습니다'
    );
    expect(JSON.stringify(source)).toBe(before);
  });
  it('executes all three native canonical functions and independent RK4 coordinate comparison exactly', () => {
    const input = { ...STRUCTURE_CANONICAL_DEFAULTS, horizon: 0.1 },
      initialCanonical = omegaToMomentum(planar.initialState, planar.parameters),
      midpoint = implicitMidpointCanonical(
        initialCanonical,
        input.dt,
        planar.parameters,
        0,
        input.tolerance,
        input.maxIterations
      ),
      theta = canonicalStepThetaOmega(planar.initialState, input.dt, planar.parameters, 0),
      native = compareDoublePendulumFormulations({
        parameters: planar.parameters,
        initialState: planar.initialState,
        dt: input.dt,
        horizon: input.horizon,
        gamma: 0,
        comparisonPolicy: input.comparisonPolicy
      }),
      before = JSON.stringify(experiment),
      result = computeStructureCanonical(experiment, input);
    expect(result.initialCanonical).toEqual([...initialCanonical]);
    expect(result.rhs.value).toEqual([...canonicalRhs(initialCanonical, planar.parameters, 0)]);
    expect(result.midpoint).toEqual({
      source: 'implicitMidpointCanonical',
      state: [...midpoint.state],
      stats: midpoint.stats
    });
    expect(result.thetaOmegaStep).toEqual({
      source: 'canonicalStepThetaOmega',
      state: [...theta.state],
      stats: theta.stats,
      tolerance: 1e-10,
      maxIterations: 12
    });
    expect(result.coordinateComparison.result).toEqual({
      ...native,
      finalThetaOmega: [...native.finalThetaOmega],
      finalCanonical: [...native.finalCanonical],
      finalCanonicalAsThetaOmega: [...native.finalCanonicalAsThetaOmega]
    });
    expect(result.warnings.join(' ')).toContain('같은 고정 RK4');
    expect(JSON.parse(serializeStructureArtifact(result))).toEqual(result);
    expect(JSON.stringify(experiment)).toBe(before);
  });
  it('rejects native canonical midpoint nonconvergence with no partial artifact', () => {
    const before = JSON.stringify(experiment);
    expect(() =>
      computeStructureCanonical(experiment, { ...STRUCTURE_CANONICAL_DEFAULTS, maxIterations: 1, tolerance: 1e-15 })
    ).toThrow('미수렴');
    expect(JSON.stringify(experiment)).toBe(before);
  });
  it('refuses conservative analysis of damped input and canonical relabeling of other physics', () => {
    const damped = value(toCanonicalPlanar({ ...planar, gamma: 0.1 }));
    expect(() => computeStructureEnergy(damped, settings)).toThrow('γ=0');
    expect(() => computeStructureCanonical(damped, STRUCTURE_CANONICAL_DEFAULTS)).toThrow('γ=0');
    expect(() =>
      computeStructureCanonical(
        value(toCanonicalPlanar({ ...planar, systemId: 'system:compound-double' })),
        STRUCTURE_CANONICAL_DEFAULTS
      )
    ).toThrow('점질량 이중진자');
    expect(() => computeStructureEnergy({ ...experiment, systemId: 'system:quantum' }, settings)).toThrow('이중·복합');
  });
  it.each([
    { dt: 0 },
    { totalTime: 0.031 },
    { totalTime: 0.01, samples: 3 },
    { samples: 2 },
    { samples: 3.5 },
    { tolerance: 0 },
    { tolerance: null },
    { totalTime: 100, dt: 1e-6 },
    { extra: true }
  ])('refuses incompatible sample grids or invalid settings %j without rounding', (patch) => {
    expect(validateStructureEnergySettings({ ...settings, ...patch }).ok).toBe(false);
  });
  it('rejects dense-chain diagnostic work overflow before integration', () => {
    const source = value(toCanonicalChain(defaultChainConfig('system:chain', 32)));
    expect(() => computeStructureEnergy(source, STRUCTURE_ENERGY_DEFAULTS)).toThrow('작업 상한');
  });
  it.each([
    { maxIterations: 0 },
    { maxIterations: 2.5 },
    { comparisonPolicy: 'fake' },
    { dt: 0.05, horizon: 0.01 },
    { dt: 1e-6, horizon: 10 },
    { extra: true }
  ])('refuses invalid canonical settings %j', (patch) => {
    expect(validateStructureCanonicalSettings({ ...STRUCTURE_CANONICAL_DEFAULTS, ...patch }).ok).toBe(false);
  });
  it('never invokes hostile setting or worker-request accessors', () => {
    const getter = vi.fn(),
      hostile = Object.defineProperty({}, 'dt', { get: getter, enumerable: true });
    expect(validateStructureEnergySettings(hostile).ok).toBe(false);
    expect(handleStructureDiagnostic(hostile).type).toBe('error');
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['energy', 'canonical'] as const)(
    '%s worker client completes once with exact provenance and terminates',
    (kind) => {
      const fake = fakeWorker(),
        events: StructureDiagnosticEvent[] = [];
      createStructureDiagnosticClient(
        kind,
        experiment,
        kind === 'energy' ? settings : STRUCTURE_CANONICAL_DEFAULTS,
        (event) => events.push(event),
        () => fake.worker
      );
      expect(fake.requests).toHaveLength(1);
      const event = fake.flush();
      expect(event.type).toBe('result');
      expect(events).toEqual([event]);
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
      expect(fake.worker.onmessage).toBeNull();
    }
  );
  it('terminates on cancellation and ignores any late result', () => {
    const fake = fakeWorker(),
      events: StructureDiagnosticEvent[] = [];
    const client = createStructureDiagnosticClient(
        'energy',
        experiment,
        settings,
        (event) => events.push(event),
        () => fake.worker
      ),
      listener = fake.worker.onmessage!,
      request = fake.requests[0]!;
    client.dispose();
    client.dispose();
    listener({ data: handleStructureDiagnostic(request) } as MessageEvent<StructureDiagnosticEvent>);
    expect(events).toEqual([]);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['id', 'settings', 'profile', 'acceptance', 'unsafe'] as const)(
    'refuses malformed worker artifact %s',
    (kind) => {
      const fake = fakeWorker(),
        events: StructureDiagnosticEvent[] = [];
      createStructureDiagnosticClient(
        'energy',
        experiment,
        settings,
        (event) => events.push(event),
        () => fake.worker
      );
      const request = fake.requests[0]!,
        good = handleStructureDiagnostic(request);
      if (good.type !== 'result' || good.result.schema !== 'pendulum-structure-energy/v1') throw new Error('result');
      const bad = { ...structuredClone(good), result: structuredClone(good.result) };
      if (kind === 'id') bad.id = 'wrong';
      if (kind === 'settings') Object.assign(bad.result.settings, { dt: 0.002 });
      if (kind === 'profile') bad.result.profile.times.pop();
      if (kind === 'acceptance') Object.assign(bad.result.acceptance, { acceptedSteps: 0 });
      if (kind === 'unsafe')
        Object.defineProperty(bad, 'type', {
          get: () => {
            throw new Error('accessor invoked');
          },
          enumerable: true
        });
      fake.worker.onmessage!({ data: bad } as MessageEvent<StructureDiagnosticEvent>);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each(['timeout', 'worker', 'message'] as const)('terminates on %s failure', (kind) => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: StructureDiagnosticEvent[] = [];
    createStructureDiagnosticClient(
      'energy',
      experiment,
      settings,
      (event) => events.push(event),
      () => fake.worker
    );
    if (kind === 'timeout') vi.advanceTimersByTime(15000);
    if (kind === 'worker') fake.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    if (kind === 'message') fake.worker.onmessageerror!({} as MessageEvent);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('error');
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
});
