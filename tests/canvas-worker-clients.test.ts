import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { tryCreateMainCanvasWorkerClient, type MainCanvasFrame } from '../src/app/MainCanvasWorkerClient';
import { LabSidePlotWorkerClient } from '../src/app/LabSidePlotWorkerClient';
import { LabSidePlotSharedRingReader } from '../src/app/LabSidePlotSharedTransport';
import type { LabSidePlotSharedRingDescriptor } from '../src/app/LabSidePlotProtocol';

class FakeWorker {
  readonly messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly terminate = vi.fn();

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, ...(transfer ? { transfer } : {}) });
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(type === 'message' ? { data } : new Event(type));
    }
  }
}

function fakeCanvas(): {
  canvas: HTMLCanvasElement;
  replacement: HTMLCanvasElement;
  replaceWith: ReturnType<typeof vi.fn>;
} {
  const replacement = {} as HTMLCanvasElement;
  const replaceWith = vi.fn();
  const canvas = {
    width: 300,
    height: 150,
    clientWidth: 300,
    clientHeight: 150,
    isConnected: true,
    cloneNode: () => replacement,
    replaceWith,
    transferControlToOffscreen: () => ({ getContext: () => ({}) }),
    getBoundingClientRect: () => ({ width: 300, height: 150 }),
    getAttribute: () => null
  } as unknown as HTMLCanvasElement;
  return { canvas, replacement, replaceWith };
}

const style: MainCanvasFrame['style'] = {
  fade: 0.1,
  trailMode: 'continuous',
  trailLength: 100,
  glow: false,
  trailBackend: 'canvas2d'
};

describe('canvas worker clients', () => {
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const originalOffscreen = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  const originalIsolation = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {} });
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {} });
    Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
    if (originalOffscreen) Object.defineProperty(globalThis, 'OffscreenCanvas', originalOffscreen);
    else Reflect.deleteProperty(globalThis, 'OffscreenCanvas');
    if (originalIsolation) Object.defineProperty(globalThis, 'crossOriginIsolated', originalIsolation);
    else Reflect.deleteProperty(globalThis, 'crossOriginIsolated');
  });

  test('main canvas waits for ready and coalesces to one transferable frame in flight', () => {
    const worker = new FakeWorker();
    const { canvas } = fakeCanvas();
    const client = tryCreateMainCanvasWorkerClient(canvas, { createWorker: () => worker as never });
    expect(client).not.toBeNull();

    client!.draw({ bobs: [{ x: 1, y: 0 }], ensembleBobs: [], style });
    client!.draw({ bobs: [{ x: 2, y: 0 }], ensembleBobs: [], style });
    expect(worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'frame')).toHaveLength(0);

    worker.emit('message', { kind: 'ready' });
    let frames = worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'frame');
    expect(frames).toHaveLength(1);
    expect(Array.from((frames[0]!.message as { bobs: Float32Array }).bobs)).toEqual([2, 0]);

    client!.draw({ bobs: [{ x: 3, y: 0 }], ensembleBobs: [], style });
    client!.draw({ bobs: [{ x: 4, y: 0 }], ensembleBobs: [], style });
    expect(worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'frame')).toHaveLength(1);
    worker.emit('message', { kind: 'rendered', sequence: 1, elapsedMs: 1 });
    frames = worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'frame');
    expect(frames).toHaveLength(2);
    expect(Array.from((frames[1]!.message as { bobs: Float32Array }).bobs)).toEqual([4, 0]);
    client!.dispose();
  });

  test('main canvas recovers its DOM node on a malformed response', () => {
    const worker = new FakeWorker();
    const { canvas, replacement, replaceWith } = fakeCanvas();
    const onFallback = vi.fn();
    const client = tryCreateMainCanvasWorkerClient(canvas, { createWorker: () => worker as never, onFallback });
    worker.emit('message', { kind: 'rendered', sequence: Number.NaN, elapsedMs: 0 });
    expect(client!.isActive()).toBe(false);
    expect(replaceWith).toHaveBeenCalledWith(replacement);
    expect(onFallback).toHaveBeenCalledWith(replacement, 'worker emitted a malformed response');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  test('side plots wait for ready, coalesce frames, and recover transferred canvases', () => {
    const worker = new FakeWorker();
    const { canvas, replacement, replaceWith } = fakeCanvas();
    const onFallback = vi.fn();
    const client = new LabSidePlotWorkerClient({ createWorker: () => worker as never, onFallback });
    expect(client.ensure({ lyap: canvas })).toBe(true);
    expect(client.render({ plot: 'lyap', history: new Float32Array([1]), value: 1 })).toBe(true);
    expect(client.render({ plot: 'lyap', history: new Float32Array([2]), value: 2 })).toBe(true);
    expect(worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render')).toHaveLength(0);

    worker.emit('message', { kind: 'ready', plot: 'lyap' });
    let renders = worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render');
    expect(renders).toHaveLength(1);
    expect((renders[0]!.message as { payload: { value: number } }).payload.value).toBe(2);
    client.render({ plot: 'lyap', history: new Float32Array([3]), value: 3 });
    client.render({ plot: 'lyap', history: new Float32Array([4]), value: 4 });
    worker.emit('message', { kind: 'rendered', plot: 'lyap', elapsedMs: 1 });
    renders = worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render');
    expect(renders).toHaveLength(2);
    expect((renders[1]!.message as { payload: { value: number } }).payload.value).toBe(4);

    worker.emit('message', { nonsense: true });
    expect(client.usesWorker()).toBe(false);
    expect(replaceWith).toHaveBeenCalledWith(replacement);
    expect(onFallback).toHaveBeenCalledWith({ lyap: replacement }, 'side-plot worker emitted a malformed response');
  });

  test('uses a shared ring only after a COOP/COEP handshake, with no SAB transfer list', () => {
    Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: true });
    const worker = new FakeWorker();
    const lyap = fakeCanvas();
    const phase = fakeCanvas();
    const client = new LabSidePlotWorkerClient({
      createWorker: () => worker as never,
      sharedRingCapacity: 1,
      sharedSlotFloatCapacity: 4
    });
    expect(client.ensure({ lyap: lyap.canvas, phase: phase.canvas })).toBe(true);

    const init = worker.messages.find(({ message }) => (message as { kind?: string }).kind === 'shared-init');
    expect(init).toBeDefined();
    expect(init?.transfer).toBeUndefined();
    const descriptor = (init!.message as { transport: LabSidePlotSharedRingDescriptor }).transport;
    expect(descriptor.metadata).toBeInstanceOf(SharedArrayBuffer);
    const reader = new LabSidePlotSharedRingReader(descriptor);

    worker.emit('message', { kind: 'shared-ready', protocol: 1 });
    worker.emit('message', { kind: 'ready', plot: 'lyap' });
    worker.emit('message', { kind: 'ready', plot: 'phase' });
    expect(client.usesSharedTransport()).toBe(true);

    expect(client.render({ plot: 'lyap', history: Float32Array.from([1, 2]), value: 2 })).toBe(true);
    let sharedRenders = worker.messages.filter(
      ({ message }) => (message as { kind?: string }).kind === 'render-shared'
    );
    expect(sharedRenders).toHaveLength(1);
    const first = sharedRenders[0]!.message as { plot: string; slot: number; sequence: number; payload?: unknown };
    expect(first.payload).toBeUndefined();

    // The fixed one-slot ring must coalesce another ready plot until the
    // worker has consumed the previous slot, instead of allocating or copying.
    expect(client.render({ plot: 'phase', theta: Float32Array.from([3]), omega: Float32Array.from([4]) })).toBe(true);
    expect(
      worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render-shared')
    ).toHaveLength(1);
    expect(worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render')).toHaveLength(0);

    const lease = reader.acquire({ slot: first.slot, sequence: first.sequence });
    expect(lease.payload).toMatchObject({ plot: 'lyap', value: 2 });
    lease.release();
    worker.emit('message', {
      kind: 'rendered',
      plot: 'lyap',
      elapsedMs: 1,
      transport: 'shared',
      slot: first.slot,
      sequence: first.sequence
    });
    sharedRenders = worker.messages.filter(({ message }) => (message as { kind?: string }).kind === 'render-shared');
    expect(sharedRenders).toHaveLength(2);
    expect((sharedRenders[1]!.message as { plot: string }).plot).toBe('phase');
    client.dispose();
  });

  test('uses the transferable path when isolation is absent or a shared slot is too small', () => {
    const noIsolationWorker = new FakeWorker();
    const noIsolationCanvas = fakeCanvas();
    const noIsolationClient = new LabSidePlotWorkerClient({ createWorker: () => noIsolationWorker as never });
    expect(noIsolationClient.ensure({ lyap: noIsolationCanvas.canvas })).toBe(true);
    expect(
      noIsolationWorker.messages.some(({ message }) => (message as { kind?: string }).kind === 'shared-init')
    ).toBe(false);
    noIsolationWorker.emit('message', { kind: 'ready', plot: 'lyap' });
    const ordinary = Float32Array.from([1, 2]);
    noIsolationClient.render({ plot: 'lyap', history: ordinary, value: 2 });
    const noIsolationRender = noIsolationWorker.messages.find(
      ({ message }) => (message as { kind?: string }).kind === 'render'
    );
    expect(noIsolationRender?.transfer).toEqual([ordinary.buffer]);
    noIsolationClient.dispose();

    Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: true });
    const worker = new FakeWorker();
    const { canvas } = fakeCanvas();
    const client = new LabSidePlotWorkerClient({
      createWorker: () => worker as never,
      sharedSlotFloatCapacity: 2
    });
    expect(client.ensure({ lyap: canvas })).toBe(true);
    worker.emit('message', { kind: 'shared-ready', protocol: 1 });
    worker.emit('message', { kind: 'ready', plot: 'lyap' });
    const oversize = Float32Array.from([1, 2, 3]);
    client.render({ plot: 'lyap', history: oversize, value: 3 });
    const fallbackRender = worker.messages.find(({ message }) => (message as { kind?: string }).kind === 'render');
    expect(fallbackRender?.transfer).toEqual([oversize.buffer]);
    expect(client.usesSharedTransport()).toBe(true);
    client.dispose();
  });

  test('degrades a rejected shared initialization to transferable rendering without replacing canvases', () => {
    Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: true });
    const worker = new FakeWorker();
    const { canvas, replaceWith } = fakeCanvas();
    const client = new LabSidePlotWorkerClient({ createWorker: () => worker as never });
    expect(client.ensure({ lyap: canvas })).toBe(true);
    worker.emit('message', { kind: 'shared-unavailable', detail: 'headers unavailable' });
    worker.emit('message', { kind: 'ready', plot: 'lyap' });
    client.render({ plot: 'lyap', history: Float32Array.from([1]), value: 1 });
    expect(worker.messages.some(({ message }) => (message as { kind?: string }).kind === 'render')).toBe(true);
    expect(client.usesWorker()).toBe(true);
    expect(replaceWith).not.toHaveBeenCalled();
    client.dispose();
  });
});
