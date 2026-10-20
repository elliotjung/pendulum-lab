import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCoreDiagnosticJob,
  CORE_DIAGNOSTIC_TIMEOUT_MS,
  type CoreDiagnosticWorker
} from '../../../../../src/product/adapters/analysis/core/client';
import { executeCoreDiagnosticJob, runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import type { CoreDiagnosticEvent } from '../../../../../src/product/adapters/analysis/core/contracts';
import { request } from './fixture';
function worker(): CoreDiagnosticWorker {
  return { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
}
const message = (data: CoreDiagnosticEvent) => ({ data }) as MessageEvent<CoreDiagnosticEvent>;
afterEach(() => vi.useRealTimers());
describe('S18 isolated worker lifecycle', () => {
  it('terminates exactly once on cancellation and discards queued or other-job messages', () => {
    const w = worker(),
      events: CoreDiagnosticEvent[] = [],
      r = request('fft');
    const job = createCoreDiagnosticJob(
        r,
        (e) => events.push(e),
        () => w
      ),
      queued = w.onmessage!;
    queued(message({ type: 'error', id: 'other', message: 'ignored' }));
    queued(message({ type: 'progress', id: r.id, fraction: null, work: 0, phase: 'calculating' }));
    job.cancel();
    queued(message({ type: 'result', id: r.id, result: runCoreDiagnostic(r) }));
    job.cancel();
    job.dispose();
    expect(events.map((e) => e.type)).toEqual(['progress', 'cancelled']);
    expect(w.terminate).toHaveBeenCalledTimes(1);
    expect(w.onmessage).toBeNull();
  });
  it('cleans up on result and validates corrupt result metadata/shape', () => {
    const r = request('fft'),
      w = worker(),
      emit = vi.fn();
    createCoreDiagnosticJob(r, emit, () => w);
    w.onmessage!(message({ type: 'result', id: r.id, result: runCoreDiagnostic(r) }));
    expect(emit.mock.calls[0]![0].type).toBe('result');
    expect(w.terminate).toHaveBeenCalledTimes(1);
    const bad = worker();
    createCoreDiagnosticJob(r, emit, () => bad);
    bad.onmessage!(message({ type: 'result', id: r.id, result: { ...runCoreDiagnostic(r), rows: [[NaN, 1]] } }));
    expect(emit.mock.calls.at(-1)![0].type).toBe('error');
    expect(bad.terminate).toHaveBeenCalledTimes(1);
  });
  it('rejects backward/fractional progress and terminates stalled jobs with no leaked timers', () => {
    vi.useFakeTimers();
    const r = request('fft'),
      w = worker(),
      emit = vi.fn();
    createCoreDiagnosticJob(r, emit, () => w);
    vi.advanceTimersByTime(CORE_DIAGNOSTIC_TIMEOUT_MS - 1);
    w.onmessage!(message({ type: 'progress', id: r.id, fraction: null, work: 2, phase: 'calculating' }));
    vi.advanceTimersByTime(CORE_DIAGNOSTIC_TIMEOUT_MS - 1);
    expect(w.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit.mock.calls.at(-1)![0].message).toContain('30초');
    expect(w.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const bad = worker();
    createCoreDiagnosticJob(r, emit, () => bad);
    bad.onmessage!(message({ type: 'progress', id: r.id, fraction: null, work: 1.5, phase: 'calculating' }));
    expect(emit.mock.calls.at(-1)![0].type).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles startup, postMessage, runtime, deserialization errors and can retry', async () => {
    const r = request('fft'),
      emit = vi.fn();
    createCoreDiagnosticJob(r, emit, () => {
      throw new Error('CSP');
    });
    expect(emit).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(emit.mock.calls.at(-1)![0].type).toBe('error');
    const post = worker();
    post.postMessage = () => {
      throw new Error('clone');
    };
    createCoreDiagnosticJob(r, emit, () => post);
    await Promise.resolve();
    expect(post.terminate).toHaveBeenCalledTimes(1);
    const runtime = worker();
    createCoreDiagnosticJob(r, emit, () => runtime);
    const preventDefault = vi.fn();
    runtime.onerror!({ preventDefault } as unknown as ErrorEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    const deserialize = worker();
    createCoreDiagnosticJob(r, emit, () => deserialize);
    deserialize.onmessageerror!({} as MessageEvent);
    expect(emit.mock.calls.at(-1)![0].message).toContain('읽지');
    const retry = worker();
    const job = createCoreDiagnosticJob(r, emit, () => retry);
    job.cancel();
    expect(retry.terminate).toHaveBeenCalledOnce();
  });
  it('converts backend validation failures into one explanatory worker error', () => {
    const events: CoreDiagnosticEvent[] = [];
    executeCoreDiagnosticJob(request('fft', { id: 'bad!' }), (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', id: 'bad!' });
  });
});
