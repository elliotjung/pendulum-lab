export interface UiTask {
  key?: string;
  priority?: number;
  run(): void;
}

interface QueueEntry extends UiTask {
  order: number;
}

interface IdleLikeDeadline {
  timeRemaining(): number;
}

type IdleLikeCallback = (deadline?: IdleLikeDeadline) => void;
type IdleLikeScheduler = (callback: IdleLikeCallback, options?: { timeout: number }) => number | void;

export class UiTaskQueue {
  private entries: QueueEntry[] = [];
  private scheduled = false;
  private order = 0;

  constructor(
    private readonly scheduleIdle: IdleLikeScheduler = defaultIdleScheduler,
    private readonly budgetMs = 8
  ) {}

  schedule(task: UiTask): void {
    if (task.key) {
      const existing = this.entries.find((entry) => entry.key === task.key);
      if (existing) {
        existing.priority = task.priority ?? existing.priority ?? 0;
        existing.run = task.run;
        return;
      }
    }
    this.entries.push({ ...task, priority: task.priority ?? 0, order: this.order++ });
    this.requestDrain();
  }

  clear(key?: string): void {
    if (!key) {
      this.entries.length = 0;
      return;
    }
    this.entries = this.entries.filter((entry) => entry.key !== key);
  }

  pendingCount(): number {
    return this.entries.length;
  }

  drainForTests(): void {
    this.drain();
  }

  private requestDrain(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.scheduleIdle((deadline) => this.drain(deadline), { timeout: 120 });
  }

  private drain(deadline?: IdleLikeDeadline): void {
    this.scheduled = false;
    this.entries.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.order - b.order);
    const started = now();
    while (this.entries.length > 0) {
      if (deadline && deadline.timeRemaining() <= 1) break;
      if (!deadline && now() - started > this.budgetMs) break;
      const entry = this.entries.shift()!;
      entry.run();
    }
    if (this.entries.length > 0) this.requestDrain();
  }
}

function defaultIdleScheduler(callback: IdleLikeCallback, options?: { timeout: number }): number | void {
  const global = globalThis as typeof globalThis & {
    requestIdleCallback?: IdleLikeScheduler;
    setTimeout?: (handler: () => void, timeout?: number) => unknown;
  };
  if (typeof global.requestIdleCallback === 'function') return global.requestIdleCallback(callback, options);
  if (typeof global.setTimeout === 'function') {
    global.setTimeout(() => callback(), 0);
    return undefined;
  }
  callback();
  return undefined;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export const uiTaskQueue = new UiTaskQueue();
