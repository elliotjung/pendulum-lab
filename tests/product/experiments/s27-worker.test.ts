import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchEvent, ResearchRequest } from '../../../src/product/experiments/research-focus-worker';
import type { ResearchFocusResult } from '../../../src/product/experiments/research-focus-contracts';
const calls = vi.hoisted(() => ({ async: vi.fn(), sync: vi.fn() }));
vi.mock('../../../src/product/experiments/s27-science', () => ({ executeS27ResearchFocus: calls.async }));
vi.mock('../../../src/product/experiments/research-focus-science', () => ({ executeResearchFocus: calls.sync }));
async function worker() {
  const scope: {
    onmessage: ((event: { data: ResearchRequest }) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  } = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  await import('../../../src/product/experiments/research-focus.worker');
  return scope;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.resetAllMocks();
});
describe('S27 asynchronous native research worker dispatch', () => {
  it('awaits native completion and forwards progress before publishing the result', async () => {
    let resolve!: (result: ResearchFocusResult) => void;
    const pending = new Promise<ResearchFocusResult>((done) => {
      resolve = done;
    });
    calls.async.mockImplementation((_id, _fields, progress) => {
      progress(0.25);
      return pending;
    });
    const scope = await worker(),
      request = { id: 'async_8_12', unitId: '8.12', fields: { seed: 27 } };
    scope.onmessage!({ data: request });
    expect(scope.postMessage.mock.calls.map((c) => c[0])).toEqual([
      { type: 'progress', id: request.id, fraction: 0.25 }
    ]);
    const result = { schema: 'pendulum-research-focus/v1', unitId: '8.12' } as ResearchFocusResult;
    resolve(result);
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenLastCalledWith({ type: 'result', id: request.id, result })
    );
    expect(calls.sync).not.toHaveBeenCalled();
  });
  it('contains rejected async operations as bounded recoverable errors', async () => {
    calls.async.mockRejectedValue(new Error('native failed '.repeat(80)));
    const scope = await worker();
    scope.onmessage!({ data: { id: 'async_failure', unitId: '8.4', fields: {} } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledTimes(1));
    const event = scope.postMessage.mock.calls[0]![0] as ResearchEvent;
    expect(event.type).toBe('error');
    if (event.type === 'error') expect(event.message.length).toBe(500);
    expect(scope.postMessage).toHaveBeenCalledTimes(1);
  });
  it('retains the existing synchronous path for earlier courses', async () => {
    const result = { schema: 'pendulum-research-focus/v1', unitId: '5.2' } as ResearchFocusResult;
    calls.sync.mockReturnValue(result);
    const scope = await worker();
    scope.onmessage!({ data: { id: 'sync_5_2', unitId: '5.2', fields: {} } });
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'result', id: 'sync_5_2', result });
    expect(calls.async).not.toHaveBeenCalled();
  });
  it('refuses malformed request IDs before invoking native work', async () => {
    const scope = await worker();
    scope.onmessage!({ data: { id: '../bad', unitId: '8.12', fields: {} } });
    expect(scope.postMessage.mock.calls[0]?.[0].type).toBe('error');
    expect(calls.async).not.toHaveBeenCalled();
    expect(calls.sync).not.toHaveBeenCalled();
  });
});
