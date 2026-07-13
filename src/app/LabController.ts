import { LabRenderer, type LabRenderOptions } from './LabRenderer';
import { LabSimulation, type LabConfig, type LabSnapshot } from './LabSimulation';

/**
 * Drives a `LabSimulation` into a `LabRenderer` on an animation loop. This is
 * the modern replacement for the legacy lab render loop: a self-contained,
 * independently-mountable unit (it never touches `window.App`), which lets it be
 * stood up behind a feature flag and parity-tested before the legacy lab code is
 * removed.
 */

export interface MountOptions {
  /** Fixed physics steps per rendered frame. Default 6 (legacy default). */
  stepsPerFrame?: number;
  /** Trail ring-buffer capacity (tip positions). Default 1500. */
  trailLength?: number;
  render?: Omit<LabRenderOptions, 'width' | 'height'>;
  /** Frame scheduler (injectable for tests). Defaults to requestAnimationFrame. */
  scheduler?: (callback: () => void) => () => void;
}

export interface LabHandle {
  readonly simulation: LabSimulation;
  readonly renderer: LabRenderer;
  running(): boolean;
  /** Step + draw exactly one frame (used by tests and by the loop). */
  frame(): void;
  start(): void;
  stop(): void;
  lastSnapshot(): LabSnapshot;
  clearTrail(): void;
}

function defaultScheduler(callback: () => void): () => void {
  let active = true;
  let handle = 0;
  const tick = (): void => {
    if (!active) return;
    callback();
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => {
    active = false;
    cancelAnimationFrame(handle);
  };
}

export function mountModernLab(canvas: HTMLCanvasElement, config: LabConfig, options: MountOptions = {}): LabHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('mountModernLab: 2D canvas context is unavailable');

  const stepsPerFrame = Math.max(1, options.stepsPerFrame ?? 6);
  const trailLength = Math.max(2, options.trailLength ?? 1500);
  const scheduler = options.scheduler ?? defaultScheduler;

  const simulation = new LabSimulation(config);
  const renderer = new LabRenderer(ctx, { width: canvas.width, height: canvas.height, ...options.render });

  // The trail is drawn incrementally by the renderer (fade + new segment), so the
  // controller no longer needs to retain a trail buffer; the fade derives a
  // persistence length from `trailLength`.
  const fade = Math.max(0.01, Math.min(0.3, 30 / Math.max(100, trailLength)));
  let snapshot = simulation.snapshot();
  let cancel: (() => void) | null = null;

  renderer.clear();

  const handle: LabHandle = {
    simulation,
    renderer,
    running: () => cancel !== null,
    frame() {
      simulation.step(stepsPerFrame);
      snapshot = simulation.snapshot();
      renderer.draw(snapshot.bobs, { fade });
    },
    start() {
      if (cancel) return;
      cancel = scheduler(() => handle.frame());
    },
    stop() {
      cancel?.();
      cancel = null;
    },
    lastSnapshot: () => snapshot,
    clearTrail() {
      renderer.clear();
    }
  };

  return handle;
}
