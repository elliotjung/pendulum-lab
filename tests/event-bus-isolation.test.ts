import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/runtime/EventBus';

describe('EventBus listener isolation', () => {
  it('continues delivery and reports a listener that throws', () => {
    const report = vi.fn();
    const bus = new EventBus<{ update: number }>(report);
    const delivered: number[] = [];
    bus.on('update', () => {
      throw new Error('listener failed');
    });
    bus.on('update', (value) => delivered.push(value));

    expect(() => bus.emit('update', 7)).not.toThrow();
    expect(delivered).toEqual([7]);
    expect(report).toHaveBeenCalledOnce();
  });

  it('uses a stable listener snapshot when handlers unsubscribe during emit', () => {
    const bus = new EventBus<{ update: number }>(() => undefined);
    const delivered: string[] = [];
    const off = bus.on('update', () => {
      delivered.push('first');
      off();
    });
    bus.on('update', () => delivered.push('second'));
    bus.emit('update', 1);
    bus.emit('update', 2);
    expect(delivered).toEqual(['first', 'second', 'second']);
  });
});
