import type { RunMode } from '../../types/domain';

/** Public control data only. Scheduling/runtime code is loaded by the lab. */
export interface PlaybackSettings {
  readonly timingMode: 'wall-clock' | 'deterministic';
  readonly speed: number;
  readonly stepsPerFrame: number;
  readonly mode: RunMode;
}
