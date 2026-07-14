import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  ChaosClient,
  ChaosClientDisposedError,
  ChaosRequestIdCollisionError,
  ChaosRequestTimeoutError,
  ChaosWorkerResetError,
  type ChaosRequestOptions
} from '../src/runtime/ChaosClient';
import { runChaosJob, type ChaosRequest, type ChaosResponse } from '../src/workers/chaosProtocol';
import type { SystemSpec } from '../src/physics/systemSpec';

const DRIVEN: Extract<SystemSpec, { kind: 'driven' }> = {
  kind: 'driven',
  g: 1,
  length: 1,
  damping: 0.5,
  driveAmplitude: 1.15,
  driveFrequency: 2 / 3
};

/** Minimal Worker stand-in: routes postMessage through a transform back as a message event. */
class FakeWorker {
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  terminateCalls = 0;
  postCalls = 0;

  constructor(
    private readonly transform: ((req: ChaosRequest) => ChaosResponse) | null,
    private readonly postError?: unknown
  ) {}

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }

  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }

  postMessage(req: ChaosRequest): void {
    this.postCalls += 1;
    if (this.postError !== undefined) throw this.postError;
    if (!this.transform) return;
    queueMicrotask(() => {
      const response = this.transform?.(req);
      if (!response) return;
      for (const cb of this.listeners.message ?? []) cb({ data: response });
    });
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emitError(error: Error): void {
    for (const cb of [...(this.listeners.error ?? [])]) cb({ error, message: error.message });
  }

  listenerCount(type: string): number {
    return this.listeners[type]?.length ?? 0;
  }
}

function makeClient(transform: ((req: ChaosRequest) => ChaosResponse) | null): ChaosClient {
  return new ChaosClient(() => (transform ? (new FakeWorker(transform) as unknown as Worker) : null));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ChaosClient', () => {
  test('worker path resolves with the worker response', async () => {
    const client = makeClient(runChaosJob);
    expect(client.usesWorker()).toBe(true);
    const res = await client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    expect(res.kind).toBe('lyapunov');
    expect(res.lambdaMax).toBeGreaterThan(0.03);
  });

  test('fallback path (no worker) resolves with the same computation', async () => {
    const client = makeClient(null);
    expect(client.usesWorker()).toBe(false);
    const res = await client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    expect(res.lambdaMax).toBeGreaterThan(0.03);
  });

  test('worker and fallback agree on the result for identical input', async () => {
    const settings = { steps: 4000, seed: 123 } as const;
    const viaWorker = await makeClient(runChaosJob).lyapunov(DRIVEN, [0.2, 0, 0], settings);
    const viaFallback = await makeClient(null).lyapunov(DRIVEN, [0.2, 0, 0], settings);
    expect(viaWorker.lambdaMax).toBeCloseTo(viaFallback.lambdaMax, 10);
  });

  test('a worker error response rejects the promise', async () => {
    const client = makeClient((req) => ({ id: req.id, ok: false, error: 'boom' }));
    await expect(client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 })).rejects.toThrow('boom');
  });

  test('bifurcation resolves with one column per amplitude', async () => {
    const client = makeClient(runChaosJob);
    const res = await client.bifurcation(DRIVEN, [1.0, 1.1, 1.2], [0.2, 0, 0], {
      dt: 6e-3,
      maxTime: 100,
      transientCrossings: 8,
      maxPointsPerParam: 15
    });
    expect(res.columns.length).toBe(3);
  });

  test('a request-specific deadline rejects with a typed timeout error and clears its timer', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(null);
    const replacementWorker = new FakeWorker(runChaosJob);
    const workers = [worker, replacementWorker];
    const client = new ChaosClient(() => workers.shift() as unknown as Worker, { requestTimeoutMs: 1_000 });

    const result = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 }, { timeoutMs: 25 });
    const observed = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await observed;
    expect(error).toBeInstanceOf(ChaosRequestTimeoutError);
    expect(error).toMatchObject({ requestKind: 'lyapunov', timeoutMs: 25 });
    expect(vi.getTimerCount()).toBe(0);
    expect(worker.terminateCalls).toBe(1);
    expect(worker.listenerCount('message')).toBe(0);

    const restarted = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(restarted).resolves.toMatchObject({ ok: true });
    client.terminate();
  });

  test('a timed-out worker rejects other queued requests while clearing all of their deadlines', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(null);
    const client = new ChaosClient(() => worker as unknown as Worker, { requestTimeoutMs: 1_000 });

    const timedOut = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 }, { timeoutMs: 25 });
    const collateral = client.zeroOne(DRIVEN, [0.2, 0, 0], { samples: 100 });
    const observedTimedOut = timedOut.catch((error: unknown) => error);
    const observedCollateral = collateral.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    expect(await observedTimedOut).toBeInstanceOf(ChaosRequestTimeoutError);
    expect(await observedCollateral).toMatchObject({
      name: ChaosWorkerResetError.name,
      timedOutRequestId: expect.any(String)
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('rejects a duplicate pending request id instead of overwriting its resolver', async () => {
    const worker = new FakeWorker(null);
    const client = new ChaosClient(() => worker as unknown as Worker);
    const request: ChaosRequest = {
      id: 'fixed-collision-id',
      kind: 'lyapunov',
      spec: DRIVEN,
      state0: [0.2, 0, 0],
      settings: { steps: 1000 }
    };
    const internal = client as unknown as {
      run<R extends ChaosResponse>(value: ChaosRequest, options?: ChaosRequestOptions): Promise<R>;
    };

    const first = internal.run(request);
    const observedFirst = first.catch((error: unknown) => error);
    await expect(internal.run(request)).rejects.toBeInstanceOf(ChaosRequestIdCollisionError);
    client.terminate();
    expect(await observedFirst).toBeInstanceOf(ChaosClientDisposedError);
  });

  test('a worker error rejects every pending request, removes listeners, and permits restart', async () => {
    const failedWorker = new FakeWorker(null);
    const replacementWorker = new FakeWorker(runChaosJob);
    const workers = [failedWorker, replacementWorker];
    const client = new ChaosClient(() => workers.shift() as unknown as Worker);

    const first = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 });
    const second = client.zeroOne(DRIVEN, [0.2, 0, 0], { samples: 100 });
    const observed = Promise.all([first.catch((error: unknown) => error), second.catch((error: unknown) => error)]);
    const failure = new Error('worker crashed');
    failedWorker.emitError(failure);

    expect(await observed).toEqual([failure, failure]);
    expect(failedWorker.listenerCount('message')).toBe(0);
    expect(failedWorker.listenerCount('error')).toBe(0);
    expect(failedWorker.terminateCalls).toBe(1);

    const restarted = await client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    expect(restarted.ok).toBe(true);
    expect(replacementWorker.postCalls).toBe(1);
    client.terminate();
  });

  test('a synchronous postMessage failure cleans up and a later request creates a fresh worker', async () => {
    const failedWorker = new FakeWorker(null, new Error('clone failed'));
    const replacementWorker = new FakeWorker(runChaosJob);
    const workers = [failedWorker, replacementWorker];
    const client = new ChaosClient(() => workers.shift() as unknown as Worker);

    await expect(client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 })).rejects.toThrow('clone failed');
    expect(failedWorker.listenerCount('message')).toBe(0);
    expect(failedWorker.listenerCount('error')).toBe(0);
    expect(failedWorker.terminateCalls).toBe(1);

    await expect(client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 })).resolves.toMatchObject({ ok: true });
    client.terminate();
  });

  test('terminate rejects all pending work, clears listeners and timers, then lazily restarts', async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker(null);
    const replacementWorker = new FakeWorker(runChaosJob);
    const workers = [firstWorker, replacementWorker];
    const client = new ChaosClient(() => workers.shift() as unknown as Worker);

    const first = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 });
    const second = client.zeroOne(DRIVEN, [0.2, 0, 0], { samples: 100 });
    const observed = Promise.all([first.catch((error: unknown) => error), second.catch((error: unknown) => error)]);
    client.terminate();

    for (const error of await observed) expect(error).toBeInstanceOf(ChaosClientDisposedError);
    expect(firstWorker.listenerCount('message')).toBe(0);
    expect(firstWorker.listenerCount('error')).toBe(0);
    expect(firstWorker.terminateCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);

    const restarted = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(restarted).resolves.toMatchObject({ ok: true });
    client.dispose();
  });

  test('dispose cancels a deferred fallback without leaving open timers and fallback can restart', async () => {
    vi.useFakeTimers();
    const client = new ChaosClient(() => null);
    const pending = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 1000 });
    const observed = pending.catch((error: unknown) => error);

    client.dispose();
    expect(await observed).toBeInstanceOf(ChaosClientDisposedError);
    expect(vi.getTimerCount()).toBe(0);

    const restarted = client.lyapunov(DRIVEN, [0.2, 0, 0], { steps: 4000 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(restarted).resolves.toMatchObject({ ok: true });
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
