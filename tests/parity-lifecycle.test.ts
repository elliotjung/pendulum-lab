import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParityLifecycle } from '../src/app/parity/disposable';

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('ParityLifecycle', () => {
  it('owns installer cleanup and interval teardown exactly once in reverse order', () => {
    const order: string[] = [];
    const clearInterval = vi.fn(() => order.push('interval'));
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { setInterval: vi.fn(() => 41), clearInterval }
    });
    const lifecycle = new ParityLifecycle();
    lifecycle.install(() => () => order.push('installer'));
    lifecycle.interval(() => undefined, 2_000);
    lifecycle.add(() => order.push('explicit'));

    lifecycle.dispose();
    lifecycle.dispose();

    expect(order).toEqual(['explicit', 'interval', 'installer']);
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(clearInterval).toHaveBeenCalledWith(41);
    expect(() => lifecycle.add(() => undefined)).toThrow(/disposed/);
  });
});
