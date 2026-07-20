import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  notifyWorkerFallback,
  resetWorkerFallbackNoticesForTests,
  workerFallbackMessage,
  WORKER_FALLBACK_EVENT,
  type WorkerFallbackNoticeDetail
} from '../src/runtime/workerFallbackNotice';
import { WorkerBridge, WorkerBridgeTerminatedError } from '../src/runtime/WorkerBridge';

const globalWindow = globalThis as typeof globalThis & { window?: Window };

function installFakeWindow(protocol: string): { events: CustomEvent<WorkerFallbackNoticeDetail>[]; toasts: string[] } {
  const events: CustomEvent<WorkerFallbackNoticeDetail>[] = [];
  const toasts: string[] = [];
  const fakeWindow = {
    location: { protocol },
    dispatchEvent: (event: Event) => {
      events.push(event as CustomEvent<WorkerFallbackNoticeDetail>);
      return true;
    },
    toast: (message: string) => {
      toasts.push(message);
    }
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  return { events, toasts };
}

describe('worker fallback notice', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => {
    resetWorkerFallbackNoticesForTests();
  });

  afterEach(() => {
    resetWorkerFallbackNoticesForTests();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalWindow.window;
  });

  test('emits a file:// specific event and toast once per worker scope', () => {
    const { events, toasts } = installFakeWindow('file:');

    const first = notifyWorkerFallback('chaos-worker', 'blocked by file protocol');
    const second = notifyWorkerFallback('chaos-worker', 'blocked by file protocol');

    expect(first).toMatchObject({
      scope: 'chaos-worker',
      reason: 'blocked by file protocol',
      protocol: 'file:',
      mainThread: true
    });
    expect(second.protocol).toBe('file:');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(WORKER_FALLBACK_EVENT);
    expect(events[0]!.detail.guidance).toContain('dev server');
    expect(toasts).toEqual([workerFallbackMessage(first)]);
  });

  test('can emit repeated notices when explicitly requested', () => {
    const { events } = installFakeWindow('http:');

    notifyWorkerFallback('expansion-worker', 'worker script failed', { once: false });
    notifyWorkerFallback('expansion-worker', 'worker script failed', { once: false });

    expect(events).toHaveLength(2);
    expect(events[0]!.detail.protocol).toBe('http:');
    expect(events[0]!.detail.guidance).toContain('job size');
  });

  test('carries explicit job-size warnings for large main-thread fallbacks', () => {
    const { events, toasts } = installFakeWindow('file:');

    const detail = notifyWorkerFallback('chaos-job-worker', 'large job running on main thread', {
      estimatedWorkUnits: 1_500_000,
      jobLabel: 'ftle',
      once: false
    });

    expect(detail.estimatedWorkUnits).toBe(1_500_000);
    expect(detail.jobSizeWarning).toContain('Large ftle job');
    expect(events[0]!.detail.jobSizeWarning).toContain('block rendering');
    expect(toasts[0]).toContain('Large ftle job');
  });

  test('WorkerBridge falls back to main-thread stepping when Worker is unavailable', async () => {
    const { events } = installFakeWindow('http:');
    const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: undefined });
    try {
      const bridge = new WorkerBridge();
      const result = await bridge.step({ state: [1, 0], dt: 0.01, steps: 2, method: 'rk4' });

      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('worker unavailable');
      expect(result.state).toHaveLength(2);
      expect(result.state.every(Number.isFinite)).toBe(true);
      expect(events.at(-1)?.detail.scope).toBe('physics-worker');
    } finally {
      if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
      else Reflect.deleteProperty(globalThis, 'Worker');
    }
  });

  test.each([
    { state: [], dt: 0.01, steps: 1, method: 'rk4' },
    { state: [1], dt: 0.01, steps: 1, method: 'rk4' },
    { state: [1, 0, 0], dt: 0.01, steps: 1, method: 'rk4' },
    { state: [Number.NaN, 0], dt: 0.01, steps: 1, method: 'rk4' },
    { state: [1, 0], dt: 0, steps: 1, method: 'rk4' },
    { state: [1, 0], dt: Number.MIN_VALUE, steps: 100_001, method: 'rk4' },
    { state: [1, 0], dt: 0.01, steps: Number.MAX_SAFE_INTEGER, method: 'rk4' },
    { state: new Array(4_096).fill(0), dt: 0.001, steps: 100_000, method: 'rk4' },
    { state: new Array(2), dt: 0.01, steps: 1, method: 'rk4' },
    { state: [1, 0], dt: 0.01, steps: 1, method: 'unknown' }
  ])('WorkerBridge rejects malformed or unbounded work before starting a worker', async (request) => {
    const bridge = new WorkerBridge();
    await expect(bridge.step(request as Parameters<WorkerBridge['step']>[0])).rejects.toThrow(/worker step/);
  });

  test('rejects a public termination immediately instead of timing out into fallback', async () => {
    const { events } = installFakeWindow('http:');
    class SilentWorker {
      readonly terminate = vi.fn();
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(): void {}
    }
    const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: SilentWorker });
    try {
      const bridge = new WorkerBridge();
      expect(bridge.start(), events.at(-1)?.detail.reason).toBe(true);
      const pending = bridge.step({ state: [1, 0], dt: 0.01, steps: 1, method: 'rk4' });
      await Promise.resolve();
      bridge.terminate();
      await expect(pending).rejects.toBeInstanceOf(WorkerBridgeTerminatedError);
    } finally {
      if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
      else Reflect.deleteProperty(globalThis, 'Worker');
    }
  });

  test('settles an aborted worker step immediately and removes its listeners', async () => {
    class SilentWorker {
      readonly terminate = vi.fn();
      readonly removeEventListener = vi.fn();
      addEventListener(): void {}
      postMessage(): void {}
    }
    const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: SilentWorker });
    try {
      const bridge = new WorkerBridge();
      const controller = new AbortController();
      const pending = bridge.step({ state: [1, 0], dt: 0.01, steps: 1, method: 'rk4' }, { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toThrow('worker step was aborted');
      bridge.terminate();
    } finally {
      if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
      else Reflect.deleteProperty(globalThis, 'Worker');
    }
  });

  test('never accepts a malformed matching worker response', async () => {
    const { events } = installFakeWindow('http:');
    class MalformedWorker {
      private readonly messages = new Set<(event: MessageEvent) => void>();
      readonly terminate = vi.fn();
      addEventListener(type: string, listener: EventListener): void {
        if (type === 'message') this.messages.add(listener as (event: MessageEvent) => void);
      }
      removeEventListener(type: string, listener: EventListener): void {
        if (type === 'message') this.messages.delete(listener as (event: MessageEvent) => void);
      }
      postMessage(request: { id: string }): void {
        queueMicrotask(() => {
          for (const listener of this.messages) {
            listener(new MessageEvent('message', { data: { id: request.id, state: [Number.NaN, 0], elapsedMs: 1 } }));
          }
        });
      }
    }
    const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: MalformedWorker });
    try {
      const bridge = new WorkerBridge();
      expect(bridge.start(), events.at(-1)?.detail.reason).toBe(true);
      const result = await bridge.step({ state: [1, 0], dt: 0.01, steps: 1, method: 'rk4' });
      expect(result.fallback).toBe(true);
      expect(result.state.every(Number.isFinite)).toBe(true);
      expect(result.fallbackReason).toMatch(/sparse or non-finite state/);
    } finally {
      if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
      else Reflect.deleteProperty(globalThis, 'Worker');
    }
  });
});
