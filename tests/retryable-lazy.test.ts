import { describe, expect, it, vi } from 'vitest';
import { createRetryableLazy } from '../src/runtime/retryableLazy';

describe('createRetryableLazy', () => {
  it('coalesces concurrent loads and retains a fulfilled result', async () => {
    const loader = vi.fn(async () => ({ ready: true }));
    const lazy = createRetryableLazy(loader);
    const first = lazy.load();
    const second = lazy.load();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ ready: true });
    await expect(lazy.load()).resolves.toEqual({ ready: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(lazy.isStarted()).toBe(true);
  });

  it('clears a rejected attempt so the next action retries', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce('loaded');
    const lazy = createRetryableLazy(loader);
    await expect(lazy.load()).rejects.toThrow('chunk failed');
    expect(lazy.isStarted()).toBe(false);
    await expect(lazy.load()).resolves.toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
