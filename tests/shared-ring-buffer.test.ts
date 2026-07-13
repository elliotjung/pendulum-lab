import { describe, expect, test } from 'vitest';
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

  test('reports the honest header boundary', () => {
    const capability = sharedMemoryCapability();
    expect(['ready', 'missing-shared-array-buffer', 'missing-coop-coep']).toContain(capability.reason);
    expect(capability.supported).toBe(capability.reason === 'ready');
  });

  test('rejects dimension mismatches instead of corrupting adjacent samples', () => {
    const ring = new Float64RingBuffer({ capacity: 2, stride: 2, preferShared: false });
    expect(() => ring.push([1])).toThrow(/stride/);
  });
});
