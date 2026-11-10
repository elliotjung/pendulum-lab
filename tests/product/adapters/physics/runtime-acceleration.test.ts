import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runDoublePendulumEnsemble,
  ensembleStatistics,
  compareEnsembleStatistics
} from '../../../../src/runtime/gpuEnsemble';
import { runDoublePendulumEnsembleWasm } from '../../../../src/runtime/wasmEnsemble';
import { buildNChainJacobianTapeWasm } from '../../../../src/runtime/wasmNChain';
import * as nativeNChain from '../../../../src/runtime/wasmNChain';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain } from '../../../../src/product/adapters/physics/chain';
import {
  createRuntimeAccelerationClient,
  type RuntimeAccelerationEvent,
  type RuntimeAccelerationRequest,
  type RuntimeAccelerationWorker
} from '../../../../src/product/adapters/physics/runtime-acceleration-client';
import { handleRuntimeAcceleration } from '../../../../src/product/adapters/physics/runtime-acceleration-worker-protocol';
import {
  RUNTIME_ENSEMBLE_DEFAULTS,
  RUNTIME_TAPE_DEFAULTS,
  RUNTIME_TAPE_MAX_SCALARS,
  computeRuntimeAcceleration,
  validateRuntimeAccelerationSettings,
  runtimeDifference,
  serializeRuntimeAcceleration
} from '../../../../src/product/adapters/physics/runtime-acceleration';
import type { ContractResult } from '../../../../src/product/contracts/validation';
function value<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
const config = { ...defaultPlanarConfig(), gamma: 0.03, initialState: [6.5, -6.4, 0.2, -0.3] as const },
  experiment = value(toCanonicalPlanar(config));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});
function fakeWorker() {
  const requests: RuntimeAccelerationRequest[] = [],
    worker: RuntimeAccelerationWorker = {
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
    async flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = await handleRuntimeAcceleration(request);
      worker.onmessage?.({ data: event } as MessageEvent<RuntimeAccelerationEvent>);
      return event;
    }
  };
}
describe('S28 native GPU/Wasm opt-in backend comparison', () => {
  it('runs all forced-CPU native ensemble paths exactly and retains source/metadata', async () => {
    const before = JSON.stringify(experiment),
      settings = { ...RUNTIME_ENSEMBLE_DEFAULTS, forceCpu: true },
      result = await computeRuntimeAcceleration(experiment, settings);
    if (result.kind !== 'double-ensemble') throw new Error('kind');
    const native = await runDoublePendulumEnsemble(
        config.parameters,
        result.initialStates,
        { dt: settings.dt, steps: settings.steps, forceCpu: true },
        config.gamma
      ),
      wasm = await runDoublePendulumEnsembleWasm(config.parameters, config.gamma, result.initialStates, {
        dt: settings.dt,
        steps: settings.steps,
        forceCpu: true
      });
    expect(result.cpuOracle.states).toEqual([...native.states]);
    expect(result.gpu.states).toEqual([...native.states]);
    expect(result.wasm.states).toEqual([...wasm.states]);
    expect(result.gpu.backend).toBe('cpu');
    expect(result.wasm.backend).toBe('cpu');
    expect(result.gpuStateDifference).toEqual({ elements: 36, maxAbsolute: 0, exactEqual: true });
    expect(result.wasmStateDifference).toEqual(result.gpuStateDifference);
    expect(result.gpuStatisticsComparison).toEqual(
      compareEnsembleStatistics(ensembleStatistics(native.states), ensembleStatistics(native.states))
    );
    expect(result.gpuReduction).toBeNull();
    expect(result.capabilities.webgpuAdapter).toBe('not-probed');
    expect(result.capabilities.wasmEnsembleKernel).toBe('not-probed');
    expect(JSON.stringify(experiment)).toBe(before);
    expect(JSON.parse(serializeRuntimeAcceleration(result))).toEqual(result);
    expect(result.warnings.join(' ')).toContain('GPU 통과로 기록하지 않습니다');
  });
  it('attempts the real Wasm ensemble kernel and reports its actual backend with native-equivalent output', async () => {
    vi.stubGlobal('navigator', {});
    const result = await computeRuntimeAcceleration(experiment, RUNTIME_ENSEMBLE_DEFAULTS);
    if (result.kind !== 'double-ensemble') throw new Error('kind');
    const native = await runDoublePendulumEnsembleWasm(config.parameters, config.gamma, result.initialStates, {
      dt: result.settings.dt,
      steps: result.settings.steps
    });
    expect(result.wasm.backend).toBe(native.backend);
    expect(result.wasm.states).toEqual([...native.states]);
    expect(result.gpu.backend).toBe('cpu');
    expect(result.capabilities.webgpuAdapter).toBe('unavailable');
    expect(result.wasmStateDifference).toEqual(runtimeDifference(native.states, result.cpuOracle.states));
    expect(result.gpuStatisticsComparison.tolerances).toEqual({
      mean: 1e-5,
      variance: 1e-4,
      covariance: 1e-4,
      rmsSpread: 1e-4,
      flipFraction: 0
    });
  });
  it.each(['system:triple', 'system:chain'] as const)(
    '%s executes native SIMD candidate and forceCpu tape oracle without promotion',
    async (systemId) => {
      const config = defaultChainConfig(systemId),
        source = value(toCanonicalChain(config)),
        before = JSON.stringify(source),
        result = await computeRuntimeAcceleration(source, RUNTIME_TAPE_DEFAULTS);
      if (result.kind !== 'chain-jacobian-tape') throw new Error('kind');
      const native = await buildNChainJacobianTapeWasm(
          config.parameters,
          config.initialState,
          config.gamma,
          RUNTIME_TAPE_DEFAULTS
        ),
        cpu = await buildNChainJacobianTapeWasm(config.parameters, config.initialState, config.gamma, {
          ...RUNTIME_TAPE_DEFAULTS,
          forceCpu: true
        });
      expect(result.backend).toBe(native.backend);
      expect(result.tape).toEqual([...native.tape]);
      expect(result.cpuTape).toEqual([...cpu.tape]);
      expect(result.tapeDifference).toEqual(runtimeDifference(native.tape, cpu.tape));
      expect(result.promoted).toBe(false);
      expect(result.abiVersion).toBe(native.abiVersion);
      expect(JSON.stringify(source)).toBe(before);
      expect(JSON.parse(serializeRuntimeAcceleration(result))).toEqual(result);
    }
  );
  it('uses explicit real CPU fallback when WebGPU and WebAssembly are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('WebAssembly', undefined);
    const fresh = await import('../../../../src/product/adapters/physics/runtime-acceleration');
    const result = await fresh.computeRuntimeAcceleration(experiment, RUNTIME_ENSEMBLE_DEFAULTS);
    if (result.kind !== 'double-ensemble') throw new Error('kind');
    expect(result.capabilities).toMatchObject({
      webgpuApi: false,
      webgpuAdapter: 'unavailable',
      wasmEnsembleKernel: 'unavailable',
      wasmSimdSupported: false
    });
    expect(result.gpu.backend).toBe('cpu');
    expect(result.wasm.backend).toBe('cpu');
    expect(result.gpuStateDifference.exactEqual).toBe(true);
    expect(result.wasmStateDifference.exactEqual).toBe(true);
  });
  it('reports an actual adapter error and still executes the native CPU fallback', async () => {
    const requestAdapter = vi.fn(async () => {
      throw new Error('device unavailable');
    });
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    const result = await computeRuntimeAcceleration(experiment, RUNTIME_ENSEMBLE_DEFAULTS);
    if (result.kind !== 'double-ensemble') throw new Error('kind');
    expect(result.capabilities.webgpuAdapter).toBe('error');
    expect(result.gpu.backend).toBe('cpu');
    expect(requestAdapter).toHaveBeenCalledTimes(2);
  });
  it.each([
    { steps: 0 },
    { steps: 1.5 },
    { gridSize: 9 },
    { angleRadius: -1 },
    { forceCpu: 'true' },
    { dt: 0.02, steps: 100 },
    { extra: true }
  ])('refuses unsafe ensemble settings %j', (patch) => {
    expect(validateRuntimeAccelerationSettings({ ...RUNTIME_ENSEMBLE_DEFAULTS, ...patch }).ok).toBe(false);
  });
  it.each([{ renormEvery: 0 }, { window: 33 }, { forwardTransient: -1 }, { kind: 'invented' }, { extra: true }])(
    'refuses unsafe tape settings %j',
    (patch) => {
      expect(validateRuntimeAccelerationSettings({ ...RUNTIME_TAPE_DEFAULTS, ...patch }).ok).toBe(false);
    }
  );
  it('refuses unsupported physical models and excessive dense work without modifying input', async () => {
    await expect(
      computeRuntimeAcceleration(
        value(toCanonicalPlanar({ ...config, systemId: 'system:compound-double' })),
        RUNTIME_ENSEMBLE_DEFAULTS
      )
    ).rejects.toThrow('점질량 이중진자');
    const large = value(toCanonicalChain(defaultChainConfig('system:chain', 9))),
      before = JSON.stringify(large);
    await expect(computeRuntimeAcceleration(large, RUNTIME_TAPE_DEFAULTS)).rejects.toThrow('최대8개');
    expect(JSON.stringify(large)).toBe(before);
  });
  it('accepts the exact transport boundary and rejects the next complete tape before native work', async () => {
    const nativeBuild = vi.spyOn(nativeNChain, 'buildNChainJacobianTapeWasm');
    const source = value(
      toCanonicalChain({ ...defaultChainConfig('system:chain', 8), initialState: Array<number>(16).fill(0) })
    );
    const settings = { ...RUNTIME_TAPE_DEFAULTS, forwardTransient: 0, window: 16, renormEvery: 1, forceCpu: true };
    const result = await computeRuntimeAcceleration(source, settings);
    if (result.kind !== 'chain-jacobian-tape') throw new Error('kind');
    expect(result.tape).toHaveLength(RUNTIME_TAPE_MAX_SCALARS);
    expect(result.cpuTape).toHaveLength(RUNTIME_TAPE_MAX_SCALARS);
    expect(result.normalization).toMatchObject({ policy: 'finite-json-zero/v1' });
    expect(result.normalization.negativeZeroToZero).toBeGreaterThan(0);
    expect(result.tape.some((v) => Object.is(v, -0))).toBe(false);
    expect(JSON.parse(serializeRuntimeAcceleration(result))).toEqual(result);
    const before = JSON.stringify(source);
    nativeBuild.mockClear();
    await expect(computeRuntimeAcceleration(source, { ...settings, window: 17 })).rejects.toThrow(
      `최대${RUNTIME_TAPE_MAX_SCALARS} scalar`
    );
    expect(nativeBuild).not.toHaveBeenCalled();
    expect(JSON.stringify(source)).toBe(before);
  });
  it('rejects accessors before reading settings or worker input', async () => {
    const getter = vi.fn(),
      hostile = Object.defineProperty({}, 'kind', { get: getter, enumerable: true });
    expect(validateRuntimeAccelerationSettings(hostile).ok).toBe(false);
    expect((await handleRuntimeAcceleration(hostile)).type).toBe('error');
    expect(getter).not.toHaveBeenCalled();
  });
  it('client emits one complete result and terminates the worker', async () => {
    const fake = fakeWorker(),
      events: RuntimeAccelerationEvent[] = [];
    createRuntimeAccelerationClient(
      experiment,
      { ...RUNTIME_ENSEMBLE_DEFAULTS, forceCpu: true },
      (event) => events.push(event),
      () => fake.worker
    );
    const event = await fake.flush();
    expect(events).toEqual([event]);
    expect(event.type).toBe('result');
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    expect(fake.worker.onmessage).toBeNull();
  });
  it('client cancellation suppresses an already captured late result and terminates once', async () => {
    const fake = fakeWorker(),
      events: RuntimeAccelerationEvent[] = [],
      client = createRuntimeAccelerationClient(
        experiment,
        { ...RUNTIME_ENSEMBLE_DEFAULTS, forceCpu: true },
        (event) => events.push(event),
        () => fake.worker
      ),
      listener = fake.worker.onmessage!,
      request = fake.requests[0]!;
    client.dispose();
    client.dispose();
    listener({ data: await handleRuntimeAcceleration(request) } as MessageEvent<RuntimeAccelerationEvent>);
    expect(events).toEqual([]);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['id', 'settings', 'backend', 'difference', 'normalization', 'unsafe'] as const)(
    'rejects malformed backend result %s',
    async (kind) => {
      const fake = fakeWorker(),
        events: RuntimeAccelerationEvent[] = [];
      createRuntimeAccelerationClient(
        experiment,
        { ...RUNTIME_ENSEMBLE_DEFAULTS, forceCpu: true },
        (event) => events.push(event),
        () => fake.worker
      );
      const good = await handleRuntimeAcceleration(fake.requests[0]!);
      if (good.type !== 'result' || good.result.kind !== 'double-ensemble') throw new Error('result');
      const bad = { ...structuredClone(good), result: structuredClone(good.result) };
      if (kind === 'id') bad.id = 'wrong';
      if (kind === 'settings') Object.assign(bad.result.settings, { steps: 100 });
      if (kind === 'backend') Object.assign(bad.result.gpu, { backend: 'webgpu' });
      if (kind === 'difference') Object.assign(bad.result.gpuStateDifference, { maxAbsolute: 1 });
      if (kind === 'normalization') Object.assign(bad.result.normalization, { negativeZeroToZero: -1 });
      if (kind === 'unsafe')
        Object.defineProperty(bad, 'type', {
          get: () => {
            throw new Error('accessor');
          },
          enumerable: true
        });
      fake.worker.onmessage!({ data: bad } as MessageEvent<RuntimeAccelerationEvent>);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each(['timeout', 'worker', 'message'] as const)('terminates on backend %s error', (kind) => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: RuntimeAccelerationEvent[] = [];
    createRuntimeAccelerationClient(
      experiment,
      RUNTIME_ENSEMBLE_DEFAULTS,
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
