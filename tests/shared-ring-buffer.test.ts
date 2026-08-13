import { describe, expect, test } from 'vitest';
import { Worker } from 'node:worker_threads';
import { Float64RingBuffer, sharedMemoryCapability } from '../src/runtime/sharedRingBuffer';

describe('Float64RingBuffer', () => {
  test('keeps chronological samples across wraparound with a local fallback', () => {
    const ring = new Float64RingBuffer({ capacity: 3, stride: 2, preferShared: false });
    ring.push([1, 10]);
    ring.push([2, 20]);
    ring.push([3, 30]);
    ring.push([4, 40]);
    expect(ring.mode).toBe('local');
    expect(ring.size()).toBe(3);
    expect(Array.from(ring.snapshot())).toEqual([2, 20, 3, 30, 4, 40]);
    expect(Array.from(ring.snapshot(2))).toEqual([3, 30, 4, 40]);
  });

  test('shares one descriptor between writer and reader when isolation is available', () => {
    if (typeof SharedArrayBuffer === 'undefined') return;
    const writer = new Float64RingBuffer({ capacity: 4, stride: 1, crossOriginIsolated: true });
    const reader = new Float64RingBuffer(writer.descriptor());
    writer.push([Math.PI]);
    writer.push([Math.E]);
    expect(reader.mode).toBe('shared');
    expect(Array.from(reader.snapshot())).toEqual([Math.PI, Math.E]);
    reader.clear();
    expect(writer.size()).toBe(0);
  });

  test('returns coherent snapshots while a worker continuously publishes wide samples', async () => {
    if (typeof SharedArrayBuffer === 'undefined') return;
    const capacity = 8;
    const stride = 1_024;
    const writerRing = new Float64RingBuffer({ capacity, stride, crossOriginIsolated: true });
    const readerRing = new Float64RingBuffer(writerRing.descriptor());
    const control = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const descriptor = writerRing.descriptor();
    const worker = new Worker(
      `
        const { workerData } = require('node:worker_threads');
        const metadata = new Int32Array(workerData.metadata);
        const values = new Float64Array(workerData.values);
        for (let sequence = 1; sequence <= workerData.writes; sequence += 1) {
          const slot = Atomics.load(metadata, 0);
          Atomics.add(metadata, 2, 1);
          const offset = slot * workerData.stride;
          for (let index = 0; index < workerData.stride; index += 1) values[offset + index] = sequence;
          Atomics.store(metadata, 0, (slot + 1) % workerData.capacity);
          Atomics.store(metadata, 1, Math.min(workerData.capacity, Atomics.load(metadata, 1) + 1));
          Atomics.add(metadata, 2, 1);
        }
        Atomics.store(new Int32Array(workerData.control), 0, 1);
      `,
      {
        eval: true,
        workerData: {
          metadata: descriptor.metadata,
          values: descriptor.values,
          capacity,
          stride,
          writes: 2_000,
          control: control.buffer
        }
      }
    );
    const workerExit = new Promise<void>((resolve, reject) => {
      worker.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ring writer exited with ${code}`))));
      worker.once('error', reject);
    });

    let snapshots = 0;
    while (Atomics.load(control, 0) === 0 || snapshots < 32) {
      const snapshot = readerRing.snapshot();
      for (let row = 0; row < snapshot.length / stride; row += 1) {
        const expected = snapshot[row * stride];
        for (let column = 1; column < stride; column += 1) {
          if (snapshot[row * stride + column] !== expected) throw new Error('observed a torn shared-ring sample');
        }
      }
      snapshots += 1;
    }
    await workerExit;
    expect(snapshots).toBeGreaterThanOrEqual(32);
  });

  test('reports the honest header boundary', () => {
    const capability = sharedMemoryCapability();
    expect(['ready', 'missing-shared-array-buffer', 'missing-coop-coep']).toContain(capability.reason);
    expect(capability.supported).toBe(capability.reason === 'ready');
  });

  test('rejects dimension mismatches instead of corrupting adjacent samples', () => {
    const ring = new Float64RingBuffer({ capacity: 2, stride: 2, preferShared: false });
    expect(() => ring.push([1])).toThrow(/stride/);
  });

  test('reads stateful sample getters exactly once before publishing', () => {
    const ring = new Float64RingBuffer({ capacity: 2, stride: 2, preferShared: false });
    let firstReads = 0;
    let secondReads = 0;
    const sample: ArrayLike<number> = {
      length: 2,
      get 0() {
        firstReads += 1;
        return firstReads === 1 ? 9 : Number.NaN;
      },
      get 1() {
        secondReads += 1;
        if (secondReads > 1) throw new Error('second read must not happen');
        return 10;
      }
    };
    ring.push(sample);
    expect([firstReads, secondReads]).toEqual([1, 1]);
    expect(Array.from(ring.snapshot())).toEqual([9, 10]);
  });

  test('rejects a getter-triggered reentrant push without corrupting the outer sample', () => {
    const ring = new Float64RingBuffer({ capacity: 2, stride: 2, preferShared: false });
    let nestedError: unknown;
    const sample: ArrayLike<number> = {
      length: 2,
      get 0() {
        return 11;
      },
      get 1() {
        try {
          ring.push([91, 92]);
        } catch (error) {
          nestedError = error;
        }
        return 12;
      }
    };
    ring.push(sample);
    expect(nestedError).toBeInstanceOf(Error);
    expect((nestedError as Error).message).toMatch(/reentrant/);
    expect(Array.from(ring.snapshot())).toEqual([11, 12]);
  });
});
