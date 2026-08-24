import type { SimulationTimingMode } from './SimulationClock';
import { bobsFromStateInto } from './pendulumGeometry';
import type { BobPosition, LabConfig } from './LabSimulation';

/** Fraction of the latest fixed step that should be displayed this frame. */
export function renderInterpolationAlpha(options: {
  enabled: boolean;
  timingMode: SimulationTimingMode;
  timingDebtSeconds: number;
  dt: number;
}): number {
  if (!options.enabled || options.timingMode !== 'wall-clock') return 1;
  if (!Number.isFinite(options.dt) || options.dt <= 0) return 1;
  if (!Number.isFinite(options.timingDebtSeconds) || options.timingDebtSeconds <= 0) return 0;
  return Math.min(1, options.timingDebtSeconds / options.dt);
}

/**
 * Interpolate one double/triple-pendulum state without taking the long route
 * across the -pi/pi display seam. The solver state remains untouched; this is
 * strictly a presentation snapshot.
 */
export function interpolatePendulumRenderState(
  previous: ArrayLike<number>,
  current: ArrayLike<number>,
  alpha: number,
  out: Float64Array
): Float64Array {
  if (previous.length !== current.length || out.length !== current.length || current.length % 2 !== 0) {
    throw new RangeError('render interpolation requires equally sized angle/velocity states');
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError('render interpolation alpha must be finite in [0, 1]');
  }
  const angleCount = current.length / 2;
  for (let index = 0; index < current.length; index += 1) {
    const from = previous[index]!;
    const to = current[index]!;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new RangeError(`render interpolation state must be finite at index ${index}`);
    }
    const delta = index < angleCount ? Math.atan2(Math.sin(to - from), Math.cos(to - from)) : to - from;
    out[index] = from + alpha * delta;
  }
  return out;
}

/** Owns allocation-free render-only state snapshots for the Lab frame loop. */
export class LabRenderInterpolator {
  private readonly bobsScratch: BobPosition[] = [];
  private previous = new Float64Array(0);
  private current = new Float64Array(0);
  private interpolated = new Float64Array(0);

  reset(state: ArrayLike<number>): void {
    this.previous = Float64Array.from(state);
    this.current = Float64Array.from(state);
    this.interpolated = new Float64Array(state.length);
  }

  capture(state: ArrayLike<number>): void {
    if (this.current.length !== state.length) {
      this.reset(state);
      return;
    }
    this.previous.set(this.current);
    this.current.set(state);
  }

  bobs(options: {
    exactBobs: BobPosition[];
    config: LabConfig;
    enabled: boolean;
    timingMode: SimulationTimingMode;
    timingDebtSeconds: number;
  }): BobPosition[] {
    const alpha = renderInterpolationAlpha({
      enabled: options.enabled,
      timingMode: options.timingMode,
      timingDebtSeconds: options.timingDebtSeconds,
      dt: options.config.dt
    });
    if (alpha >= 1 || this.current.length !== options.config.initialState.length) return options.exactBobs;
    interpolatePendulumRenderState(this.previous, this.current, alpha, this.interpolated);
    return bobsFromStateInto(options.config, this.interpolated, this.bobsScratch);
  }
}
