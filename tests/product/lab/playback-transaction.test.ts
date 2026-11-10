import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationClock } from '../../../src/app/SimulationClock';
import { LabSimulation } from '../../../src/app/LabSimulation';
import { createPlaybackClock, DEFAULT_PLAYBACK } from '../../../src/product/lab/views/playback-clock';
import { createCoreModel } from '../../../src/product/lab/views/core-model';
import { createChainModel } from '../../../src/product/lab/views/chain-model';
import {
  defaultPlanarConfig,
  createPlanarSimulation,
  type PlanarConfig
} from '../../../src/product/adapters/physics/planar';
import {
  defaultChainConfig,
  createChainSimulation,
  type ChainConfig
} from '../../../src/product/adapters/physics/chain';
import {
  createChainWorkerSession,
  type ChainWorkerRequest,
  type ChainWorkerEvent
} from '../../../src/product/adapters/physics/chain-worker-protocol';
import { createChainWorkerClient, type ChainWorker } from '../../../src/product/adapters/physics/chain-client';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const nativeSimulation = () =>
  new LabSimulation({
    system: 'double',
    parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    initialState: [0.4, 0.2, 0, 0],
    gamma: 0,
    method: 'rk4',
    dt: 0.002
  });
function workerFixture(now: () => number = () => 0) {
  const session = createChainWorkerSession(now),
    requests: ChainWorkerRequest[] = [],
    events: ChainWorkerEvent[] = [];
  const worker: ChainWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (r) => requests.push(r),
    terminate: vi.fn()
  };
  const takeEvent = () => {
    const request = requests.shift();
    if (!request) throw new Error('request');
    const event = session.handle(request);
    events.push(event);
    return event;
  };
  return {
    worker,
    requests,
    events,
    takeEvent,
    flush() {
      const event = takeEvent();
      worker.onmessage?.({ data: event } as MessageEvent<ChainWorkerEvent>);
      return event;
    }
  };
}

describe('S28 additive native clock checkpoint boundary', () => {
  it('restores finite versioned primitive state atomically without aliases or invoking accessors', () => {
    const clock = new SimulationClock(),
      sim = nativeSimulation();
    for (const timestampMs of [100, 116])
      clock.advance({ sim, stepsPerFrame: 6, mode: 'wall-clock', timestampMs, bobsScratch: [], onStep() {} });
    const checkpoint = clock.checkpoint();
    expect(Object.isFrozen(checkpoint)).toBe(true);
    const detached = structuredClone(checkpoint);
    clock.reset();
    clock.restore(detached);
    Reflect.set(detached, 'timingDebtSeconds', 1);
    expect(clock.checkpoint()).toEqual(checkpoint);
    const before = clock.checkpoint();
    for (const patch of [
      { schemaVersion: 'unknown' },
      { lastWallClockMs: NaN },
      { lastWallClockMs: -1 },
      { timingDebtSeconds: 3 },
      { timingDebtSeconds: -1 },
      { droppedSimulationSeconds: Infinity },
      { droppedSimulationSeconds: -1 },
      { extra: true }
    ]) {
      expect(() => clock.restore({ ...checkpoint, ...patch })).toThrow();
      expect(clock.checkpoint()).toEqual(before);
    }
    let reads = 0;
    const hostile = { ...checkpoint };
    Object.defineProperty(hostile, 'timingDebtSeconds', {
      enumerable: true,
      get() {
        reads++;
        return 0;
      }
    });
    expect(() => clock.restore(hostile)).toThrow('accessors');
    expect(reads).toBe(0);
    expect(clock.checkpoint()).toEqual(before);
  });
  it('accounts zero actual worker steps without weakening old advance zero-budget validation', () => {
    const clock = new SimulationClock(),
      sim = nativeSimulation(),
      before = clock.checkpoint();
    expect(() =>
      clock.advance({
        sim,
        stepsPerFrame: 6,
        mode: 'wall-clock',
        timestampMs: 100,
        maxWallClockSteps: 0,
        bobsScratch: [],
        onStep() {}
      })
    ).toThrow('maxWallClockSteps');
    expect(clock.checkpoint()).toEqual(before);
    expect(sim.time).toBe(0);
    clock.accountFrame({ dt: 0.002, stepsPerFrame: 6, mode: 'wall-clock', timestampMs: 100, actualSteps: 0 });
    expect(clock.diagnostics()).toEqual({ timingDebtSeconds: 0.012, droppedSimulationSeconds: 0 });
    clock.accountFrame({ dt: 0.002, stepsPerFrame: 6, mode: 'wall-clock', timestampMs: 116, actualSteps: 0 });
    expect(clock.diagnostics().timingDebtSeconds).toBeCloseTo(0.028, 15);
    expect(sim.time).toBe(0);
    const saved = clock.checkpoint();
    expect(() =>
      clock.accountFrame({
        dt: 0.002,
        stepsPerFrame: 6,
        mode: 'wall-clock',
        timestampMs: 132,
        actualSteps: 1,
        maxWallClockSteps: 0
      })
    ).toThrow();
    expect(clock.checkpoint()).toEqual(saved);
  });
  it('rejects impossible accounting atomically and retains native dropped-time bounds', () => {
    const clock = new SimulationClock(),
      initial = clock.checkpoint();
    expect(() =>
      clock.accountFrame({
        dt: 0.002,
        stepsPerFrame: 1,
        mode: 'wall-clock',
        timestampMs: 100,
        maxWallClockSteps: 3,
        actualSteps: 2
      })
    ).toThrow('available');
    expect(clock.checkpoint()).toEqual(initial);
    for (const patch of [
      { actualSteps: -1 },
      { actualSteps: 1.5 },
      { dt: 0 },
      { timestampMs: NaN },
      { speedMultiplier: NaN }
    ]) {
      expect(() =>
        clock.accountFrame({
          dt: 0.002,
          stepsPerFrame: 6,
          mode: 'wall-clock',
          timestampMs: 100,
          actualSteps: 0,
          ...patch
        })
      ).toThrow();
      expect(clock.checkpoint()).toEqual(initial);
    }
    clock.accountFrame({
      dt: 0.002,
      stepsPerFrame: 60,
      mode: 'wall-clock',
      timestampMs: 100,
      speedMultiplier: 4,
      actualSteps: 0
    });
    clock.accountFrame({
      dt: 0.002,
      stepsPerFrame: 60,
      mode: 'wall-clock',
      timestampMs: 10000,
      speedMultiplier: 4,
      actualSteps: 0
    });
    clock.accountFrame({
      dt: 0.002,
      stepsPerFrame: 60,
      mode: 'wall-clock',
      timestampMs: 20000,
      speedMultiplier: 4,
      actualSteps: 0
    });
    expect(clock.diagnostics().timingDebtSeconds).toBe(2);
    expect(clock.diagnostics().droppedSimulationSeconds).toBeGreaterThan(0);
  });
});

describe('S28 native preview/actual-commit adapter', () => {
  it('keeps previews inert and commits a yielded worker interval exactly like native actual-step accounting', () => {
    const product = createPlaybackClock(),
      reference = new SimulationClock(),
      sim = nativeSimulation();
    const settings = { ...DEFAULT_PLAYBACK, stepsPerFrame: 60, speed: 4 };
    for (const [timestampMs, actual] of [
      [100, 3],
      [116, 1],
      [132, 5]
    ] as const) {
      const before = product.diagnostics();
      expect(product.plan(settings, 0.002, 100000, timestampMs, 64)).toBe(64);
      expect(product.diagnostics()).toEqual(before);
      expect(product.commit(actual)).toBe(true);
      reference.advance({
        sim,
        stepsPerFrame: 60,
        mode: 'wall-clock',
        timestampMs,
        speedMultiplier: 4,
        maxWallClockSteps: actual,
        bobsScratch: [],
        onStep() {}
      });
      expect(product.diagnostics()).toEqual(reference.diagnostics());
    }
    expect(sim.time).toBeCloseTo(0.018, 15);
  });
  it('bounds deterministic requests at64 and rejects stale/overlapping/invalid commitments without consuming time', () => {
    const clock = createPlaybackClock(),
      settings = { ...DEFAULT_PLAYBACK, timingMode: 'deterministic' as const, stepsPerFrame: 60, speed: 4 };
    expect(clock.plan(settings, 0.002, 100000, 100, 64)).toBe(64);
    expect(() => clock.plan(settings, 0.002, 100000, 116, 64)).toThrow();
    expect(() => clock.next(settings, 0.002, 100000, 116)).toThrow();
    expect(() => clock.commit(65)).toThrow();
    expect(clock.diagnostics()).toEqual({ timingDebtSeconds: 0, droppedSimulationSeconds: 0 });
    clock.cancelPending();
    expect(clock.commit(64)).toBe(false);
    clock.plan(settings, 0.002, 100000, 116, 64);
    clock.reset();
    expect(clock.commit(1)).toBe(false);
    expect(clock.plan(settings, 0.002, 3, 132, 64)).toBe(3);
    expect(clock.commit(3)).toBe(true);
  });
});

describe('S28 actual timing and effective playback budgets', () => {
  it('retains the exact preceding core step independently of sparse recorded samples', () => {
    vi.useFakeTimers();
    const config = { ...defaultPlanarConfig(), duration: 1, sampleEvery: 100 };
    const model = createCoreModel(config),
      native = createPlanarSimulation(config);
    const initial = model.state.sample;
    expect(model.state.previousSample).toBe(initial);
    model.setPlayback({ ...DEFAULT_PLAYBACK, timingMode: 'deterministic' });
    model.run();
    vi.advanceTimersByTime(16);
    for (let step = 1; step <= 5; step++) native.step();
    expect(model.state.sample.step).toBe(6);
    expect(model.state.previousSample).toEqual(native.snapshot());
    expect(model.state.samples.map((entry) => entry.step)).toEqual([0]);
    expect(Object.isFrozen(model.state.previousSample.state)).toBe(true);
    model.reset();
    expect(model.state.previousSample).toBe(model.state.sample);
    model.dispose();
  });
  it('retains exact worker predecessors across sparse chunks without another integration', () => {
    vi.useFakeTimers();
    const config = { ...defaultChainConfig('system:triple'), duration: 1, sampleEvery: 100 };
    const f = workerFixture(),
      model = createChainModel(config, () => f.worker);
    expect(model.state.previousSample).toBe(model.state.sample);
    model.setPlayback({ ...DEFAULT_PLAYBACK, timingMode: 'deterministic', stepsPerFrame: 60, speed: 4 });
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    const event = f.flush();
    if (event.type !== 'progress') throw new Error('progress');
    expect(event.schemaVersion).toBe('pendulum-product-chain-snapshot/v2');
    expect(event.sample.step).toBe(64);
    expect(event.previousSample.step).toBe(63);
    expect(event.samples).toEqual([]);
    const native = createChainSimulation(config);
    for (let step = 1; step <= 63; step++) native.step();
    expect(model.state.previousSample).toEqual(native.snapshot());
    expect(Object.isFrozen(model.state.previousSample.state)).toBe(true);
    model.reset();
    expect(model.state.previousSample).toBe(model.state.sample);
    model.dispose();
  });
  it('keeps the accepted predecessor when a later step in a worker chunk fails', () => {
    const session = createChainWorkerSession(() => 0);
    const ready = session.handle({
      type: 'initialize',
      id: 'partial-failure',
      sequence: 0,
      config: {
        ...defaultChainConfig('system:triple'),
        step: 0.05,
        duration: 1,
        initialState: [1, 2, 3, 10000, -10000, 10000]
      }
    });
    if (ready.type !== 'ready') throw new Error('ready');
    const result = session.handle({ type: 'advance', id: 'partial-failure', sequence: 1, count: 64 });
    if (result.type !== 'error' || !result.snapshot) throw new Error('partial failure');
    expect(result.snapshot.advanced).toBe(1);
    expect(result.snapshot.sample.step).toBe(1);
    expect(result.snapshot.previousSample).toEqual(ready.sample);
    expect(result.snapshot.computationMs).toBe(0);
  });
  it('measures core compute batches, preserves requested budget and native states, and resets timing explicitly', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const config = { ...defaultPlanarConfig(), duration: 1, step: 0.01 };
    const model = createCoreModel(config, () => (ticks += 2.5)),
      native = createPlanarSimulation(config);
    model.step();
    expect(model.state.physicsMs).toBe(2.5);
    expect(model.state.sample).toEqual(native.step());
    model.reset();
    expect(model.state.physicsMs).toBe(0);
    model.setPlayback({ ...DEFAULT_PLAYBACK, stepsPerFrame: 6 });
    model.setEffectivePlaybackBudget(2);
    model.run();
    vi.advanceTimersByTime(32);
    expect(model.state.sample.step).toBe(3);
    expect(model.state.playback!.stepsPerFrame).toBe(6);
    expect(model.state.effectiveStepsPerFrame).toBe(2);
    expect(model.state.physicsMs).toBe(2.5);
    const debt = model.state.timingDiagnostics;
    model.setEffectivePlaybackBudget(1);
    expect(model.state.timingDiagnostics).toEqual(debt);
    expect(debt.timingDebtSeconds).toBeGreaterThan(0);
    model.reset();
    expect(model.state.physicsMs).toBe(0);
    expect(model.state.effectiveStepsPerFrame).toBe(6);
    const before = model.state;
    for (const budget of [0, 1.5, 7]) expect(() => model.setEffectivePlaybackBudget(budget)).toThrow();
    expect(model.state).toEqual(before);
    model.dispose();
    expect(model.setEffectivePlaybackBudget(1)).toBe(false);
  });
  it('measures a rejected core interval while preserving the last accepted physical state', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const config: PlanarConfig = {
      ...defaultPlanarConfig(),
      parameters: { m1: 0.001, m2: 0.001, l1: 0.001, l2: 0.001, g: 1000 },
      initialState: [1, 2, 10000, -10000],
      gamma: 1000,
      integratorId: 'integrator:hmidpoint',
      tolerance: 1e-15,
      step: 0.05,
      duration: 1
    };
    const model = createCoreModel(config, () => (ticks += 3)),
      before = model.state.sample;
    model.step();
    expect(model.state.status).toBe('error');
    expect(model.state.sample).toEqual(before);
    expect(model.state.previousSample).toEqual(before);
    expect(model.state.physicsMs).toBe(3);
    model.reset();
    model.setPlayback(DEFAULT_PLAYBACK);
    model.run();
    vi.advanceTimersByTime(16);
    expect(model.state.status).toBe('error');
    expect(model.state.sample).toEqual(before);
    expect(model.state.physicsMs).toBe(3);
    expect(model.state.timingDiagnostics.timingDebtSeconds).toBe(0.25);
    model.dispose();
  });
  it('caps high-speed chain requests, commits actual yields, and reports worker compute rather than message latency', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const f = workerFixture(() => ++ticks),
      config = { ...defaultChainConfig(), duration: 1 };
    const model = createChainModel(config, () => f.worker);
    model.setPlayback({ ...DEFAULT_PLAYBACK, stepsPerFrame: 60, speed: 4 });
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    expect(f.requests[0]).toMatchObject({ type: 'advance', count: 64 });
    expect(model.state.timingDiagnostics.timingDebtSeconds).toBe(0);
    vi.advanceTimersByTime(1000);
    const event = f.flush();
    if (event.type !== 'progress') throw new Error('progress');
    expect(event.advanced).toBe(8);
    expect(event.computationMs).toBe(9);
    expect(model.state.physicsMs).toBe(9);
    expect(model.state.timingDiagnostics.timingDebtSeconds).toBeCloseTo(0.48 - 8 * 0.002, 15);
    const native = createChainSimulation(config);
    for (let i = 0; i < 8; i++) native.step();
    expect(model.state.sample).toEqual(native.snapshot());
    const debt = model.state.timingDiagnostics;
    model.setEffectivePlaybackBudget(2);
    expect(model.state.playback!.stepsPerFrame).toBe(60);
    expect(model.state.effectiveStepsPerFrame).toBe(2);
    expect(model.state.timingDiagnostics).toEqual(debt);
    model.reset();
    expect(model.state.physicsMs).toBe(0);
    expect(model.state.effectiveStepsPerFrame).toBe(60);
    model.dispose();
  });
  it('credits a zero-step worker failure and ignores cancelled late work', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const failing: ChainConfig = {
      ...defaultChainConfig('system:triple'),
      initialState: [1, 2, 3, 10000, -10000, 10000],
      integratorId: 'integrator:hmidpoint',
      tolerance: 1e-15,
      step: 0.05,
      duration: 1
    };
    const f = workerFixture(() => ++ticks),
      model = createChainModel(failing, () => f.worker);
    model.setPlayback({ ...DEFAULT_PLAYBACK, stepsPerFrame: 6 });
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    const event = f.flush();
    expect(event.type).toBe('error');
    expect(model.state.status).toBe('error');
    expect(model.state.sample.step).toBe(0);
    expect(model.state.previousSample.step).toBe(0);
    expect(model.state.physicsMs).toBeGreaterThan(0);
    expect(model.state.timingDiagnostics.timingDebtSeconds).toBe(0.25);
    model.dispose();
    const g = workerFixture(),
      cancelled = createChainModel(defaultChainConfig(), () => g.worker);
    cancelled.setPlayback(DEFAULT_PLAYBACK);
    cancelled.run();
    g.flush();
    vi.advanceTimersByTime(16);
    const callback = g.worker.onmessage!,
      late = g.takeEvent();
    expect(late.type).toBe('progress');
    cancelled.cancel();
    callback({ data: late } as MessageEvent<ChainWorkerEvent>);
    expect(cancelled.state.sample.step).toBe(0);
    expect(cancelled.state.physicsMs).toBe(0);
    expect(cancelled.state.timingDiagnostics.timingDebtSeconds).toBe(0);
    cancelled.dispose();
  });
  it.each([undefined, -1, NaN, Infinity, 1])(
    'rejects unmeasured or malformed worker timing %s before exposing state',
    (metric) => {
      const f = workerFixture(),
        events: ChainWorkerEvent[] = [];
      createChainWorkerClient(
        defaultChainConfig(),
        (e) => events.push(e),
        () => f.worker
      );
      const request = f.requests.shift()!,
        good = createChainWorkerSession(() => 0).handle(request);
      if (good.type !== 'ready') throw new Error('ready');
      const malformed = { ...good, computationMs: metric };
      f.worker.onmessage!({ data: malformed } as unknown as MessageEvent<ChainWorkerEvent>);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(f.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each(['old-schema', 'missing-previous', 'wrong-step', 'non-finite'])(
    'rejects invalid v2 predecessor %s',
    (kind) => {
      const f = workerFixture(),
        events: ChainWorkerEvent[] = [];
      createChainWorkerClient(
        defaultChainConfig(),
        (event) => events.push(event),
        () => f.worker
      );
      const ready = createChainWorkerSession(() => 0).handle(f.requests.shift()!);
      if (ready.type !== 'ready') throw new Error('ready');
      const malformed =
        kind === 'old-schema'
          ? { ...ready, schemaVersion: 'v1' }
          : kind === 'missing-previous'
            ? { ...ready, previousSample: undefined }
            : {
                ...ready,
                previousSample: {
                  ...ready.previousSample,
                  ...(kind === 'wrong-step' ? { step: 1 } : { state: [NaN, 0, 0, 0, 0, 0, 0, 0] })
                }
              };
      f.worker.onmessage!({ data: malformed } as unknown as MessageEvent<ChainWorkerEvent>);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(f.worker.terminate).toHaveBeenCalledOnce();
    }
  );
});
