import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  notifyWorkerFallback,
  resetWorkerFallbackNoticesForTests,
  workerFallbackMessage,
  WORKER_FALLBACK_EVENT,
  type WorkerFallbackNoticeDetail
} from '../src/runtime/workerFallbackNotice';

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
});
