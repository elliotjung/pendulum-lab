/**
 * Audio sonification for the modern Lab: two oscillators whose pitch and loudness
 * track the magnitudes of the two angular velocities, so the pendulum's motion is
 * audible (fast/chaotic → higher, louder). The frequency/gain mappings are pure
 * and unit-tested; the Web Audio graph is created lazily on enable (so nothing
 * touches `AudioContext` in Node/tests).
 *
 * This is the modern replacement for the legacy `audioInit`/`audioUpdate`.
 */

/** Clamp(base + |w|·scale, min, max) — the legacy frequency law. */
export function sonifyFrequency(w: number, base: number, scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, base + Math.abs(w) * scale));
}

/** min(max, |w|·scale) — the legacy loudness law. */
export function sonifyGain(w: number, scale: number, max = 0.5): number {
  return Math.min(max, Math.abs(w) * scale);
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class AudioSonifier {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private enabled = false;
  private volume = 0.08;

  private ensureGraph(): boolean {
    if (this.ctx) return true;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.ratio.value = 8;
      const master = ctx.createGain();
      master.gain.value = this.volume;
      compressor.connect(master).connect(ctx.destination);
      for (let i = 0; i < 2; i += 1) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.connect(gain).connect(compressor);
        osc.start();
        this.voices.push({ osc, gain });
      }
      this.ctx = ctx;
      this.master = master;
      return true;
    } catch {
      return false;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      if (this.ensureGraph() && this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    } else {
      // Silence the voices but keep the graph for quick re-enable.
      for (const v of this.voices) if (this.ctx) v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  /** Per-frame update from the two angular velocities. No-op while disabled. */
  update(w1: number, w2: number): void {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    const v0 = this.voices[0];
    const v1 = this.voices[1];
    if (v0) {
      v0.osc.frequency.setTargetAtTime(sonifyFrequency(w1, 200, 55, 80, 1200), t, 0.04);
      v0.gain.gain.setTargetAtTime(sonifyGain(w1, 0.018), t, 0.04);
    }
    if (v1) {
      v1.osc.frequency.setTargetAtTime(sonifyFrequency(w2, 300, 70, 120, 1500), t, 0.04);
      v1.gain.gain.setTargetAtTime(sonifyGain(w2, 0.014), t, 0.04);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.enabled = false;
    for (const voice of this.voices) {
      try {
        voice.osc.stop();
      } catch {
        // An oscillator may already have stopped during browser teardown.
      }
      voice.osc.disconnect();
      voice.gain.disconnect();
    }
    this.voices = [];
    this.master?.disconnect();
    const context = this.ctx;
    this.master = null;
    this.ctx = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
