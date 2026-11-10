import {
  SimulationClock,
  type SimulationTimingMode,
  type SimulationFrameAccounting
} from '../../../app/SimulationClock';
import type { LabSimulation } from '../../../app/LabSimulation';
import type { PlaybackSettings } from '../../contracts/playback';
export type { PlaybackSettings } from '../../contracts/playback';
export const DEFAULT_PLAYBACK: PlaybackSettings = {
  timingMode: 'wall-clock',
  speed: 1,
  stepsPerFrame: 6,
  mode: 'demo'
};
export function validatePlayback(value: PlaybackSettings): PlaybackSettings {
  if (
    !['wall-clock', 'deterministic'].includes(value.timingMode) ||
    !Number.isFinite(value.speed) ||
    value.speed < 0.1 ||
    value.speed > 4 ||
    !Number.isInteger(value.stepsPerFrame) ||
    value.stepsPerFrame < 1 ||
    value.stepsPerFrame > 60 ||
    !['demo', 'education', 'research', 'benchmark', 'performance', 'recovery'].includes(value.mode)
  )
    throw new RangeError('실행 모드·속도·프레임 예산 범위를 확인하세요.');
  return Object.freeze({ ...value });
}

/** Reuse the native clock's frame-budget policy. This counter schedules work;
 * it does not integrate a second scientific trajectory or supply plot data. */
export function createPlaybackClock() {
  const clock = new SimulationClock();
  const state = new Float64Array(1);
  const scheduler = {
    config: { dt: 0.002 },
    step() {
      state[0] = state[0]! + 1;
    },
    stateView: () => state,
    get time() {
      return state[0]! * scheduler.config.dt;
    },
    energy: () => 0,
    driftForEnergy: () => 0,
    bobPositionsInto: () => []
  };
  type Frame = Omit<SimulationFrameAccounting, 'actualSteps'> & { readonly mode: SimulationTimingMode };
  let pending: { frame: Frame; count: number } | undefined;
  function frame(
    settings: PlaybackSettings,
    dt: number,
    remaining: number,
    timestampMs: number,
    maxSteps: number
  ): Frame | null {
    validatePlayback(settings);
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isSafeInteger(remaining) || remaining < 0)
      throw new RangeError('유한한 시간 간격과 남은 단계 수가 필요합니다.');
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 1_000_000)
      throw new RangeError('유효한 frame 단계 상한이 필요합니다.');
    if (remaining === 0) return null;
    return {
      dt,
      mode: settings.timingMode,
      timestampMs,
      speedMultiplier: settings.speed,
      stepsPerFrame:
        settings.timingMode === 'deterministic'
          ? Math.min(remaining, maxSteps, Math.round(settings.stepsPerFrame * settings.speed))
          : settings.stepsPerFrame,
      maxWallClockSteps: Math.min(
        remaining,
        maxSteps,
        Math.max(1, Math.round(settings.stepsPerFrame * Math.max(1, settings.speed)))
      )
    };
  }
  function advance(request: Frame): number {
    scheduler.config.dt = request.dt;
    return clock.advance({
      sim: scheduler as unknown as LabSimulation,
      stepsPerFrame: request.stepsPerFrame,
      mode: request.mode,
      timestampMs: request.timestampMs!,
      speedMultiplier: request.speedMultiplier!,
      maxWallClockSteps: request.maxWallClockSteps!,
      bobsScratch: [],
      onStep() {}
    }).stepsAdvanced;
  }
  return {
    reset() {
      pending = undefined;
      clock.reset();
      state[0] = 0;
    },
    diagnostics: () => clock.diagnostics(),
    next(settings: PlaybackSettings, dt: number, remaining: number, timestampMs: number, maxSteps = 1_000_000): number {
      if (pending) throw new Error('대기 중인 worker frame을 먼저 확정하거나 취소하세요.');
      const request = frame(settings, dt, remaining, timestampMs, maxSteps);
      return request ? advance(request) : 0;
    },
    /** Preview the native budget without consuming time before a worker reply. */
    plan(settings: PlaybackSettings, dt: number, remaining: number, timestampMs: number, maxSteps: number): number {
      if (pending) throw new Error('worker frame이 이미 대기 중입니다.');
      const request = frame(settings, dt, remaining, timestampMs, maxSteps);
      if (!request) return 0;
      const before = clock.checkpoint(),
        counter = state[0]!;
      let count: number;
      try {
        count = advance(request);
        clock.checkpoint();
      } finally {
        clock.restore(before);
        state[0] = counter;
      }
      pending = { frame: request, count };
      return count;
    },
    commit(actualSteps: number): boolean {
      if (!pending) return false;
      if (!Number.isSafeInteger(actualSteps) || actualSteps < 0 || actualSteps > pending.count)
        throw new RangeError('완료한 worker 단계 수가 계획과 다릅니다.');
      clock.accountFrame({ ...pending.frame, actualSteps });
      state[0] = state[0]! + actualSteps;
      pending = undefined;
      return true;
    },
    cancelPending(): void {
      pending = undefined;
    }
  };
}
