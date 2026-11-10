import { describe, expect, it, vi } from 'vitest';
import { AUDIO_MAX_VOLUME, createAudioController } from '../../../src/product/lab/compatibility-tools/audio';

function setup() {
  const native = { setEnabled: vi.fn(), setVolume: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  const factory = vi.fn(() => native);
  const audio = createAudioController(factory);
  return { native, factory, audio };
}
describe('S28 opt-in adapter around preserved AudioSonifier', () => {
  it('never creates audio on data updates, settings or silence without a user activation', () => {
    const { audio, factory } = setup();
    audio.update({ running: true, omega1: 1, omega2: 2 });
    audio.setVolume(0.08);
    audio.setObservable('omega1');
    audio.silence();
    expect(factory).not.toHaveBeenCalled();
    expect(audio.requested).toBe(false);
    audio.dispose();
    audio.activate();
    expect(factory).not.toHaveBeenCalled();
  });

  it('passes finite live angular velocities to native mappings only during an armed running interval', () => {
    const { audio, native, factory } = setup();
    audio.update({ running: false, omega1: 1, omega2: 2 });
    audio.activate();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(native.setVolume).toHaveBeenLastCalledWith(0.04);
    expect(native.setEnabled).toHaveBeenLastCalledWith(false);
    expect(native.update).not.toHaveBeenCalled();
    audio.update({ running: true, omega1: 1.25, omega2: -2.5 });
    expect(native.setEnabled).toHaveBeenLastCalledWith(true);
    expect(native.update).toHaveBeenLastCalledWith(1.25, -2.5);
    audio.update({ running: false, omega1: 2, omega2: 3 });
    expect(native.setEnabled).toHaveBeenLastCalledWith(false);
    audio.silence();
    audio.update({ running: true, omega1: 2, omega2: 3 });
    expect(native.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it('supports only the declared observables, clamps extreme pitch inputs and silences nonfinite values', () => {
    const { audio, native } = setup();
    audio.update({ running: true, omega1: 1000, omega2: -1000 });
    audio.activate();
    expect(native.update).toHaveBeenLastCalledWith(64, -64);
    audio.setObservable('omega1');
    expect(native.update).toHaveBeenLastCalledWith(64, 0);
    audio.setObservable('omega2');
    expect(native.update).toHaveBeenLastCalledWith(0, -64);
    expect(() => audio.setObservable('arbitrary')).toThrow();
    audio.update({ running: true, omega1: NaN, omega2: 1 });
    expect(native.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it('enforces a bounded finite volume before forwarding to the native master gain', () => {
    const { audio, native } = setup();
    audio.activate();
    for (const volume of [-1, NaN, Infinity, AUDIO_MAX_VOLUME + 0.01]) expect(() => audio.setVolume(volume)).toThrow();
    expect(native.setVolume).toHaveBeenCalledTimes(1);
    audio.setVolume(0);
    expect(native.setVolume).toHaveBeenLastCalledWith(0);
    audio.setVolume(AUDIO_MAX_VOLUME);
    expect(native.setVolume).toHaveBeenLastCalledWith(AUDIO_MAX_VOLUME);
  });

  it('disposes the native graph once and prevents late updates and reactivation', () => {
    const { audio, native } = setup();
    audio.activate();
    audio.dispose();
    expect(native.dispose).toHaveBeenCalledTimes(1);
    native.update.mockClear();
    native.setEnabled.mockClear();
    native.setVolume.mockClear();
    audio.dispose();
    audio.activate();
    audio.setVolume(0.08);
    audio.update({ running: true, omega1: 3, omega2: 4 });
    expect(native.update).not.toHaveBeenCalled();
    expect(native.setEnabled).not.toHaveBeenCalled();
    expect(native.setVolume).not.toHaveBeenCalled();
  });
});
