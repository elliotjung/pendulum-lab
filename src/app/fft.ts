/**
 * Minimal radix-2 Cooley-Tukey FFT and a real-signal magnitude-spectrum helper
 * for the Lab FFT panel. Dependency-free and unit-tested (a pure sinusoid must
 * peak in the bin matching its frequency).
 */

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Periodic Hann window of length n (reduces spectral leakage). */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

/**
 * In-place iterative complex FFT. `re`/`im` have power-of-two length and are
 * overwritten with the transform.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('fftInPlace: length must be a power of two');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

export interface Spectrum {
  /** Frequency of each bin in Hz (length N/2). */
  freqs: number[];
  /** Magnitude of each bin (length N/2). */
  mags: number[];
}

/**
 * Magnitude spectrum of a real signal. The signal is detrended (mean removed),
 * Hann-windowed, zero-padded to the next power of two, and transformed; only the
 * non-negative-frequency half is returned.
 */
export function magnitudeSpectrum(signal: ArrayLike<number>, sampleRate: number, applyWindow = true): Spectrum {
  const m = signal.length;
  if (m < 2) return { freqs: [], mags: [] };
  const n = nextPow2(m);
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  let mean = 0;
  for (let i = 0; i < m; i += 1) mean += signal[i]!;
  mean /= m;

  const window = applyWindow ? hannWindow(m) : null;
  for (let i = 0; i < m; i += 1) re[i] = (signal[i]! - mean) * (window ? window[i]! : 1);

  fftInPlace(re, im);

  const half = n >> 1;
  const freqs = new Array<number>(half);
  const mags = new Array<number>(half);
  for (let i = 0; i < half; i += 1) {
    freqs[i] = (i * sampleRate) / n;
    mags[i] = Math.hypot(re[i]!, im[i]!) / m;
  }
  return { freqs, mags };
}

/** Index of the dominant (largest-magnitude) bin, ignoring the DC bin. */
export function dominantBin(spectrum: Spectrum): number {
  let best = 1;
  let bestMag = -Infinity;
  for (let i = 1; i < spectrum.mags.length; i += 1) {
    if (spectrum.mags[i]! > bestMag) {
      bestMag = spectrum.mags[i]!;
      best = i;
    }
  }
  return best;
}
