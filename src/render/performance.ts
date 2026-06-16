import type { BenchmarkMetrics } from '../types/domain';
import type { PendulumLegacyApp } from '../types/globals';
import { legacyApp } from '../runtime/legacyCompat';

/**
 * Resolve the legacy app through the DI container when available, falling back
 * to the centralized compatibility accessor (e.g. before the runtime is
 * installed, or under `file://` where the modern module does not boot).
 */
function resolveLegacyApp(): PendulumLegacyApp | undefined {
  try {
    const fromContainer = window.PendulumRuntime?.tryResolve('legacyApp') as PendulumLegacyApp | undefined;
    if (fromContainer) return fromContainer;
  } catch {
    // Legacy runtime not yet adopted (pre-boot / file://) — fall back below.
  }
  return legacyApp();
}

export function readRuntimeMetrics(label = 'candidate', url = location.href): BenchmarkMetrics {
  const app = resolveLegacyApp();
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return {
    label,
    url,
    fps: typeof app?.fps === 'number' ? app.fps : null,
    physicsMsPerFrame: typeof app?.physMs === 'number' ? app.physMs : null,
    memoryBytes: typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null,
    workerLatencyMs: typeof app?.workerLatency === 'number' ? app.workerLatency : null
  };
}

export function installPerformanceProbe(): void {
  Object.defineProperty(window, '__PENDULUM_METRICS__', {
    configurable: true,
    value: () => readRuntimeMetrics()
  });
}
