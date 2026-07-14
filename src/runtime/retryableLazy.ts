export interface RetryableLazy<T> {
  load(): Promise<T>;
  /** True while the first attempt is pending and after it has fulfilled. */
  isStarted(): boolean;
}

/**
 * Coalesce concurrent lazy loads, retain a fulfilled value, and clear a failed
 * attempt so the next user action can retry instead of inheriting a poisoned
 * rejected promise forever.
 */
export function createRetryableLazy<T>(loader: () => Promise<T>): RetryableLazy<T> {
  let pending: Promise<T> | null = null;
  return {
    load(): Promise<T> {
      if (pending) return pending;
      const attempt = Promise.resolve().then(loader);
      let guarded: Promise<T>;
      guarded = attempt.catch((error: unknown) => {
        if (pending === guarded) pending = null;
        throw error;
      });
      pending = guarded;
      return guarded;
    },
    isStarted(): boolean {
      return pending !== null;
    }
  };
}
