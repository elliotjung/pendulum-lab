export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus<Events extends object = Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<EventHandler>>();

  constructor(
    private readonly reportHandlerError: (type: keyof Events, error: unknown) => void = defaultEventErrorReporter
  ) {}

  on<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): () => void {
    const bucket = this.listeners.get(type) ?? new Set<EventHandler>();
    bucket.add(handler as EventHandler);
    this.listeners.set(type, bucket);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): void {
    this.listeners.get(type)?.delete(handler as EventHandler);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) {
      try {
        handler(payload);
      } catch (error: unknown) {
        this.reportHandlerError(type, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

function defaultEventErrorReporter(type: PropertyKey, error: unknown): void {
  console.error(`Pendulum event handler failed for ${String(type)}`, error);
}

export interface PendulumEvents {
  'simulation:toggle': { source: string };
  'simulation:reset': { source: string };
  'export:manifest': { source: string };
  'validation:run': { profile: 'quick' | 'standard' | 'research' };
  'state:changed': { reason: string };
  'worker:latency': { latencyMs: number };
  'security:import-rejected': { problems: string[] };
}

export const eventBus: EventBus<PendulumEvents> = new EventBus<PendulumEvents>();
