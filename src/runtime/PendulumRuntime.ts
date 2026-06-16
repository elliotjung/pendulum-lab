import { ServiceContainer } from './ServiceContainer';
import { publishDebugApi } from './globalApi';
import { eventBus, EventBus, type PendulumEvents } from './EventBus';
import { commandRegistry, CommandRegistry } from './CommandRegistry';
import { stateStore } from '../state/StateStore';
import { physicsAdapter } from '../physics';
import { workerBridge } from './WorkerBridge';
import type { PendulumLegacyApp, PendulumLegacyPhysics } from '../types/globals';
import { APP_VERSION } from './version';
import { legacyAdopted, legacyApp, legacyPhysics } from './legacyCompat';

/**
 * Typed service map for the application container. Modern services are always
 * present; the two `legacy*` entries are adopted from the classic runtime and
 * are absent under `file://` (use `tryResolve`).
 */
export interface PendulumServiceMap {
  events: EventBus<PendulumEvents>;
  commands: CommandRegistry;
  state: typeof stateStore;
  physics: typeof physicsAdapter;
  worker: typeof workerBridge;
  legacyApp: PendulumLegacyApp;
  legacyPhysics: PendulumLegacyPhysics;
}

const container = new ServiceContainer<PendulumServiceMap>();

let installed = false;

/**
 * Build the application container and publish the single canonical runtime
 * surface on `window.PendulumRuntime`. Idempotent.
 */
export function installPendulumRuntime(): ServiceContainer<PendulumServiceMap> {
  if (installed) return container;

  container.registerValue('events', eventBus);
  container.registerValue('commands', commandRegistry);
  container.registerValue('state', stateStore);
  container.registerValue('physics', physicsAdapter);
  container.registerValue('worker', workerBridge);

  // Deprecated compatibility readers for old scripts/tests. They resolve
  // lazily through `legacyCompat` so direct global access stays centralized.
  container.register('legacyApp', () => {
    const app = legacyApp();
    if (!app) throw new Error('PendulumRuntime: legacy App is not available (file:// or pre-boot)');
    return app;
  }, { singleton: false });
  container.register('legacyPhysics', () => {
    const physics = legacyPhysics();
    if (!physics) throw new Error('PendulumRuntime: legacy Physics is not available');
    return physics;
  }, { singleton: false });

  const surface = Object.freeze({
    version: APP_VERSION,
    container,
    resolve: <K extends keyof PendulumServiceMap>(token: K) => container.resolve(token),
    tryResolve: <K extends keyof PendulumServiceMap>(token: K) => container.tryResolve(token),
    has: <K extends keyof PendulumServiceMap>(token: K) => container.has(token),
    /** Convenience typed accessors for the most-used services. */
    get events() {
      return eventBus;
    },
    get commands() {
      return commandRegistry;
    },
    get state() {
      return stateStore;
    },
    /** Lightweight description for diagnostics panels. */
    describe: () => ({
      version: APP_VERSION,
      services: container.tokens().map((token) => String(token)),
      legacyAdopted: legacyAdopted()
    })
  });

  // The DI surface is an internal/debug concern: publish it on the debug
  // namespace, keeping `window.PendulumRuntime` as a deprecated alias.
  publishDebugApi({ runtime: surface }, { PendulumRuntime: surface });
  installed = true;
  return container;
}

/** The application container (for modern modules that prefer direct access). */
export function getContainer(): ServiceContainer<PendulumServiceMap> {
  return container;
}
