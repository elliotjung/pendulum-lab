import type { ContractResult } from '../../../src/product/contracts/validation';
import type { FocusRuntimeOptions } from '../../../src/product/experiments/runtime';

export function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

/** Explicit asynchronous turns without wall-clock sleeps; cancelled work can be replayed to test stale guards. */
export function focusScheduler() {
  const queue: { callback: () => void; cancelled: boolean }[] = [];
  const schedule: NonNullable<FocusRuntimeOptions['schedule']> = (callback) => {
    const entry = { callback, cancelled: false };
    queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  const next = (includeCancelled = false) => {
    const entry = queue.shift();
    if (entry && (!entry.cancelled || includeCancelled)) entry.callback();
  };
  return {
    schedule,
    next,
    get pending() {
      return queue.length;
    },
    flush() {
      let turns = 0;
      while (queue.length) {
        if (++turns > 25_000) throw new Error('Focus runtime exceeded its bounded step budget.');
        next();
      }
    }
  };
}
