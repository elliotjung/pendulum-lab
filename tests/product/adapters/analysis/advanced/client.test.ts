import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAdvancedDiagnosticJob,
  ADVANCED_DIAGNOSTIC_TIMEOUT_MS,
  type AdvancedDiagnosticWorker
} from '../../../../../src/product/adapters/analysis/advanced/client';
import {
  executeAdvancedDiagnosticJob,
  runAdvancedDiagnostic
} from '../../../../../src/product/adapters/analysis/advanced/execute';
import { defaultAdvancedSettings } from '../../../../../src/product/adapters/analysis/advanced/settings';
import type {
  AdvancedDiagnosticEvent,
  AdvancedDiagnosticRequest
} from '../../../../../src/product/adapters/analysis/advanced/contracts';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../../../../src/product/adapters/analysis/core/source';

function request(): AdvancedDiagnosticRequest {
  const canonical = toCanonicalPlanar(defaultPlanarConfig());
  if (!canonical.ok) throw new Error('canonical fixture');
  return {
    id: 'advanced-worker-test',
    kind: 'topological-entropy',
    experiment: canonical.value,
    series: createDiagnosticSeries(canonical.value, []),
    settings: defaultAdvancedSettings('topological-entropy', canonical.value)
  };
}
function worker(): AdvancedDiagnosticWorker {
  return { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
}
const message = (data: AdvancedDiagnosticEvent) => ({ data }) as MessageEvent<AdvancedDiagnosticEvent>;
afterEach(() => vi.useRealTimers());

describe('S19 isolated advanced worker lifecycle', () => {
  it('posts an immutable validated snapshot and discards stale results after cancellation', () => {
    const r = request(),
      w = worker(),
      events: AdvancedDiagnosticEvent[] = [];
    const job = createAdvancedDiagnosticJob(
      r,
      (event) => events.push(event),
      () => w
    );
    const posted = vi.mocked(w.postMessage).mock.calls[0]![0];
    expect(posted).toEqual(r);
    expect(posted).not.toBe(r);
    r.settings.boxes = 16;
    r.experiment = {
      ...r.experiment,
      parameters: { ...r.experiment.parameters, g: { kind: 'scalar', value: 1, unit: 'm/s^2' } }
    };
    expect(posted.settings.boxes).toBe(8);
    expect(posted.experiment.parameters.g).not.toEqual(r.experiment.parameters.g);
    const queued = w.onmessage!;
    queued(message({ type: 'error', id: 'other', message: 'ignored' }));
    queued(message({ type: 'progress', id: r.id, work: 1, fraction: null, phase: 'calculating' }));
    job.cancel();
    queued(message({ type: 'result', id: r.id, result: runAdvancedDiagnostic(posted) }));
    job.cancel();
    job.dispose();
    expect(events.map((event) => event.type)).toEqual(['progress', 'cancelled']);
    expect(w.terminate).toHaveBeenCalledTimes(1);
    expect(w.onmessage).toBeNull();
  });

  it('accepts native output and rejects altered units, method, kind or nonfinite rows', () => {
    const r = request(),
      result = runAdvancedDiagnostic(r);
    const w = worker(),
      emit = vi.fn();
    createAdvancedDiagnosticJob(r, emit, () => w);
    w.onmessage!(message({ type: 'result', id: r.id, result }));
    expect(emit.mock.calls[0]![0].type).toBe('result');
    expect(w.terminate).toHaveBeenCalledOnce();
    for (const mutate of [
      (copy: typeof result) => {
        copy.units[0] = 'J';
      },
      (copy: typeof result) => {
        copy.method = 'unverified';
      },
      (copy: typeof result) => {
        copy.kind = 'basin';
      },
      (copy: typeof result) => {
        copy.rows = [[NaN]];
      }
    ]) {
      const bad = worker(),
        changed = structuredClone(result),
        events = vi.fn();
      mutate(changed);
      createAdvancedDiagnosticJob(r, events, () => bad);
      bad.onmessage!(message({ type: 'result', id: r.id, result: changed }));
      expect(events.mock.calls.at(-1)![0].type).toBe('error');
      expect(bad.terminate).toHaveBeenCalledOnce();
    }
  });

  it('terminates an unresponsive worker and resets the timeout only for valid current progress', () => {
    vi.useFakeTimers();
    const r = request(),
      w = worker(),
      emit = vi.fn();
    createAdvancedDiagnosticJob(r, emit, () => w);
    vi.advanceTimersByTime(ADVANCED_DIAGNOSTIC_TIMEOUT_MS - 1);
    w.onmessage!(message({ type: 'progress', id: r.id, work: 2, fraction: 0.25, phase: 'calculating' }));
    vi.advanceTimersByTime(ADVANCED_DIAGNOSTIC_TIMEOUT_MS - 1);
    expect(w.terminate).not.toHaveBeenCalled();
    w.onmessage!(message({ type: 'progress', id: 'stale', work: 3, fraction: 0.5, phase: 'calculating' }));
    vi.advanceTimersByTime(1);
    expect(emit.mock.calls.at(-1)![0].message).toContain('30초');
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects malformed, backward, fractional, and inconsistent completion progress', () => {
    vi.useFakeTimers();
    for (const change of [
      { work: -1, fraction: null, phase: 'calculating' },
      { work: 1.5, fraction: null, phase: 'calculating' },
      { work: 1, fraction: 0.25, phase: 'calculating' },
      { work: 3, fraction: 0.1, phase: 'calculating' },
      { work: 3, fraction: 0.75, phase: 'complete' },
      { work: 3, fraction: NaN, phase: 'calculating' }
    ]) {
      const r = request(),
        w = worker(),
        emit = vi.fn();
      createAdvancedDiagnosticJob(r, emit, () => w);
      w.onmessage!(message({ type: 'progress', id: r.id, work: 2, fraction: 0.5, phase: 'calculating' }));
      w.onmessage!(message({ type: 'progress', id: r.id, ...change } as AdvancedDiagnosticEvent));
      expect(emit.mock.calls.at(-1)![0].type).toBe('error');
      expect(w.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('handles startup, clone, runtime, message errors and disposal without leaked callbacks', async () => {
    const r = request(),
      emit = vi.fn();
    createAdvancedDiagnosticJob(r, emit, () => {
      throw new Error('CSP');
    });
    expect(emit).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(emit.mock.calls.at(-1)![0].type).toBe('error');
    const post = worker();
    post.postMessage = () => {
      throw new Error('clone');
    };
    createAdvancedDiagnosticJob(r, emit, () => post);
    await Promise.resolve();
    expect(post.terminate).toHaveBeenCalledOnce();
    const runtime = worker(),
      preventDefault = vi.fn();
    createAdvancedDiagnosticJob(r, emit, () => runtime);
    runtime.onerror!({ preventDefault } as unknown as ErrorEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    const deserialize = worker();
    createAdvancedDiagnosticJob(r, emit, () => deserialize);
    deserialize.onmessageerror!({} as MessageEvent);
    expect(emit.mock.calls.at(-1)![0].message).toContain('읽지');
    const disposed = worker(),
      silent = vi.fn();
    const job = createAdvancedDiagnosticJob(r, silent, () => disposed),
      queued = disposed.onmessage!;
    job.dispose();
    job.cancel();
    queued(message({ type: 'error', id: r.id, message: 'stale' }));
    expect(silent).not.toHaveBeenCalled();
    expect(disposed.terminate).toHaveBeenCalledOnce();
  });

  it('refuses getters and malformed input before worker creation and permits retry', async () => {
    const getter = vi.fn(() => 'malicious'),
      r = request(),
      factory = vi.fn(worker),
      emit = vi.fn();
    Object.defineProperty(r, 'id', { enumerable: true, get: getter });
    createAdvancedDiagnosticJob(r, emit, factory);
    await Promise.resolve();
    expect(getter).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(emit.mock.calls.at(-1)![0].type).toBe('error');
    const retry = createAdvancedDiagnosticJob(request(), emit, factory);
    expect(factory).toHaveBeenCalledOnce();
    retry.cancel();
  });

  it('converts backend validation failures into explanatory worker errors', () => {
    const r = request(),
      events: AdvancedDiagnosticEvent[] = [];
    r.settings.boxes = 1000;
    executeAdvancedDiagnosticJob(r, (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', id: r.id });
  });
});
