import { describe, expect, test } from 'vitest';
import {
  LabSidePlotSharedRingReader,
  LabSidePlotSharedRingWriter,
  type LabSidePlotSharedFrame,
  type LabSidePlotSharedWriteResult
} from '../src/app/LabSidePlotSharedTransport';

function frameOf(result: LabSidePlotSharedWriteResult): LabSidePlotSharedFrame {
  expect(result.kind).toBe('written');
  if (result.kind !== 'written') throw new Error('expected a shared side-plot frame');
  return result.frame;
}

describe('LabSidePlotSharedRing transport', () => {
  test('round-trips each variable payload layout without transferring its source buffers', () => {
    const writer = new LabSidePlotSharedRingWriter({ capacity: 5, slotFloatCapacity: 16 });
    const reader = new LabSidePlotSharedRingReader(writer.descriptor);
    const cases = [
      {
        plot: 'energy' as const,
        energy: {
          time: Float32Array.from([0, 1]),
          total: Float32Array.from([2, 3]),
          drift: Float32Array.from([0, 0.1])
        }
      },
      { plot: 'lyap' as const, history: Float32Array.from([1, 2]), value: Math.PI },
      { plot: 'phase' as const, theta: Float32Array.from([1, 2]), omega: Float32Array.from([3, 4]) },
      { plot: 'poincare' as const, points: Float32Array.from([1, 2, 3, 4]) },
      { plot: 'fft' as const, theta1Frames: Float32Array.from([1, 2, 3]), sampleRate: 44_100.125 }
    ];

    for (const payload of cases) {
      const lease = reader.acquire(frameOf(writer.tryWrite(payload)));
      expect(lease.payload.plot).toBe(payload.plot);
      if (lease.payload.plot === 'energy') {
        expect(Array.from(lease.payload.energy.time)).toEqual([0, 1]);
        expect(Array.from(lease.payload.energy.total)).toEqual([2, 3]);
      } else if (lease.payload.plot === 'lyap') {
        expect(Array.from(lease.payload.history)).toEqual([1, 2]);
        expect(lease.payload.value).toBe(Math.PI);
      } else if (lease.payload.plot === 'phase') {
        expect(Array.from(lease.payload.theta)).toEqual([1, 2]);
        expect(Array.from(lease.payload.omega)).toEqual([3, 4]);
      } else if (lease.payload.plot === 'poincare') {
        expect(Array.from(lease.payload.points)).toEqual([1, 2, 3, 4]);
      } else {
        expect(Array.from(lease.payload.theta1Frames)).toEqual([1, 2, 3]);
        expect(lease.payload.sampleRate).toBe(44_100.125);
      }
      lease.release();
    }
  });

  test('reports bounded backpressure and falls back for snapshots larger than one slot', () => {
    const writer = new LabSidePlotSharedRingWriter({ capacity: 1, slotFloatCapacity: 4 });
    const reader = new LabSidePlotSharedRingReader(writer.descriptor);
    const first = frameOf(writer.tryWrite({ plot: 'lyap', history: Float32Array.from([1, 2]), value: 1 }));

    expect(writer.tryWrite({ plot: 'phase', theta: Float32Array.from([1]), omega: Float32Array.from([2]) })).toEqual({
      kind: 'backpressured'
    });
    expect(writer.tryWrite({ plot: 'lyap', history: Float32Array.from([1, 2, 3, 4, 5]), value: 1 })).toEqual({
      kind: 'oversize'
    });

    const lease = reader.acquire(first);
    lease.release();
    expect(writer.tryWrite({ plot: 'phase', theta: Float32Array.from([1]), omega: Float32Array.from([2]) }).kind).toBe(
      'written'
    );
  });

  test('does not free a newer slot when a delayed render message has an old sequence', () => {
    const writer = new LabSidePlotSharedRingWriter({ capacity: 1, slotFloatCapacity: 4 });
    const reader = new LabSidePlotSharedRingReader(writer.descriptor);
    const first = frameOf(writer.tryWrite({ plot: 'lyap', history: Float32Array.from([1]), value: 1 }));
    reader.acquire(first).release();
    const second = frameOf(writer.tryWrite({ plot: 'lyap', history: Float32Array.from([2]), value: 2 }));

    expect(() => reader.acquire(first)).toThrow(/sequence/);
    const lease = reader.acquire(second);
    expect(lease.payload).toMatchObject({ plot: 'lyap', value: 2 });
    lease.release();
  });
});
