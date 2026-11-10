export interface Sonifier {
  setEnabled(on: boolean): void;
  setVolume(volume: number): void;
  update(omega1: number, omega2: number): void;
  dispose(): void;
}
export interface AudioSample {
  readonly running: boolean;
  readonly omega1: number;
  readonly omega2: number;
}
export type AudioObservable = 'both' | 'omega1' | 'omega2';
export const AUDIO_MAX_VOLUME = 0.2;

/** Lifecycle/safety adapter only; all pitch and gain mappings remain in AudioSonifier. */
export function createAudioController(create: () => Sonifier) {
  let sonifier: Sonifier | undefined;
  let requested = false;
  let disposed = false;
  let volume = 0.04;
  let observable: AudioObservable = 'both';
  let sample: AudioSample = { running: false, omega1: 0, omega2: 0 };
  function update() {
    if (!sonifier || disposed) return;
    const playable = requested && sample.running && Number.isFinite(sample.omega1) && Number.isFinite(sample.omega2);
    sonifier.setEnabled(playable);
    if (playable)
      sonifier.update(
        observable === 'omega2' ? 0 : Math.max(-64, Math.min(64, sample.omega1)),
        observable === 'omega1' ? 0 : Math.max(-64, Math.min(64, sample.omega2))
      );
  }
  return {
    get requested() {
      return requested;
    },
    /** Call only from the explicit user activation control. */
    activate() {
      if (disposed) return;
      sonifier ??= create();
      sonifier.setVolume(volume);
      // Creating/resuming the native graph belongs to the activation gesture.
      sonifier.setEnabled(true);
      requested = true;
      update();
    },
    silence() {
      requested = false;
      sonifier?.setEnabled(false);
    },
    setVolume(value: number) {
      if (disposed) return;
      if (!Number.isFinite(value) || value < 0 || value > AUDIO_MAX_VOLUME)
        throw new RangeError(`소리 크기는 0–${AUDIO_MAX_VOLUME} 범위여야 합니다.`);
      volume = value;
      sonifier?.setVolume(value);
    },
    setObservable(value: string) {
      if (disposed) return;
      if (value !== 'both' && value !== 'omega1' && value !== 'omega2')
        throw new Error('지원하는 각속도를 선택하세요.');
      observable = value;
      update();
    },
    update(next: AudioSample) {
      if (disposed) return;
      sample = { ...next };
      update();
    },
    dispose() {
      if (disposed) return;
      requested = false;
      disposed = true;
      sonifier?.setEnabled(false);
      sonifier?.dispose();
      sonifier = undefined;
    }
  };
}
