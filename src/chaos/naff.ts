/**
 * NAFF — Numerical Analysis of Fundamental Frequencies (Laskar's frequency-map
 * analysis). Given a quasi-periodic complex signal f(t) = Σ_j a_j e^{i ω_j t}
 * sampled uniformly, it extracts the fundamental frequencies ω_j and complex
 * amplitudes a_j to **far below the FFT bin resolution** (≈ machine precision for
 * a clean tone, vs the FFT's 2π/T) by maximising the windowed Fourier integral
 *
 *     φ(ω) = (1/W) Σ_k f_k χ_k e^{-i ω t_k} ,   W = Σ_k χ_k,
 *
 * over ω — FFT for the coarse peak, then golden-section refinement — then
 * subtracting that component and repeating (Gram–Schmidt-free, valid for
 * well-separated frequencies). A Hann window χ suppresses spectral leakage.
 *
 * This is the precision frequency tool of celestial mechanics and accelerator
 * physics: tracking how a fundamental frequency *drifts* with time (or with
 * initial condition) is the sharpest practical detector of chaotic diffusion vs
 * regular (KAM) motion — it complements the rotation-number/Arnold-tongue tools
 * and pairs directly with the Chirikov standard map.
 */
import { fftInPlace } from '../physics/fft';

/** One identified spectral line. */
export interface NaffComponent {
  /** Angular frequency ω (rad per unit time). */
  frequency: number;
  /** Amplitude modulus |a|. */
  amplitude: number;
  amplitudeRe: number;
  amplitudeIm: number;
  /** Power |a|². */
  power: number;
}

export interface NaffOptions {
  /** Golden-section refinement iterations (default 100 → ω to ~machine ε). */
  refineIterations?: number;
}

const TWO_PI = 2 * Math.PI;

/** Hann window χ_k = 1 − cos(2πk/N) (zero at the endpoints). */
function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let k = 0; k < n; k += 1) w[k] = 1 - Math.cos((TWO_PI * k) / n);
  return w;
}

/** φ(ω)·W = Σ_k (fχ)_k e^{-i ω k dt}; returns the unnormalised projection. */
function projection(fChiRe: Float64Array, fChiIm: Float64Array, dt: number, omega: number): { re: number; im: number } {
  let re = 0;
  let im = 0;
  const n = fChiRe.length;
  for (let k = 0; k < n; k += 1) {
    const phase = -omega * k * dt;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const fr = fChiRe[k]!;
    const fi = fChiIm[k]!;
    re += fr * c - fi * s;
    im += fr * s + fi * c;
  }
  return { re, im };
}

/** Maximise a unimodal scalar function on [a, b] by golden-section search. */
function goldenMaximize(fn: (x: number) => number, a0: number, b0: number, iterations: number): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = a0;
  let b = b0;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = fn(c);
  let fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = fn(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = fn(d);
    }
  }
  return (a + b) / 2;
}

/**
 * Decompose a uniformly-sampled complex signal (`re`/`im`, sample step `dt`) into
 * its `terms` strongest fundamental frequencies, strongest first. For a real
 * signal pass `im` all zeros (the ± frequency pair will both appear).
 */
export function naffDecompose(
  re: readonly number[],
  im: readonly number[],
  dt: number,
  terms: number,
  options: NaffOptions = {}
): NaffComponent[] {
  const n = re.length;
  if (n < 4) throw new Error('naffDecompose: need at least 4 samples.');
  if (im.length !== n) throw new Error('naffDecompose: re and im must have equal length.');
  if (!(dt > 0)) throw new Error('naffDecompose: dt must be positive.');
  if (!Number.isInteger(terms) || terms < 1) throw new Error('naffDecompose: terms must be a positive integer.');
  const refineIterations = options.refineIterations ?? 100;

  const chi = hann(n);
  let chiSum = 0;
  for (let k = 0; k < n; k += 1) chiSum += chi[k]!;

  // Working residual (mutated as components are removed).
  const fr = Float64Array.from(re);
  const fi = Float64Array.from(im);

  // FFT padding length (power of two ≥ n) for the coarse peak search.
  let nfft = 1;
  while (nfft < n) nfft *= 2;
  const binWidth = TWO_PI / (nfft * dt);

  const components: NaffComponent[] = [];
  const fChiRe = new Float64Array(n);
  const fChiIm = new Float64Array(n);

  for (let term = 0; term < terms; term += 1) {
    for (let k = 0; k < n; k += 1) {
      fChiRe[k] = fr[k]! * chi[k]!;
      fChiIm[k] = fi[k]! * chi[k]!;
    }

    // Coarse peak via zero-padded FFT of the windowed residual.
    const padRe = new Float64Array(nfft);
    const padIm = new Float64Array(nfft);
    padRe.set(fChiRe);
    padIm.set(fChiIm);
    fftInPlace(padRe, padIm);
    let bestBin = 0;
    let bestMag = -1;
    for (let b = 0; b < nfft; b += 1) {
      const mag = padRe[b]! * padRe[b]! + padIm[b]! * padIm[b]!;
      if (mag > bestMag) {
        bestMag = mag;
        bestBin = b;
      }
    }
    const signedBin = bestBin <= nfft / 2 ? bestBin : bestBin - nfft;
    const omegaCoarse = (TWO_PI * signedBin) / (nfft * dt);

    // Refine: maximise |φ(ω)|² within ±1.5 bins of the coarse peak.
    const objective = (omega: number): number => {
      const p = projection(fChiRe, fChiIm, dt, omega);
      return p.re * p.re + p.im * p.im;
    };
    const omega = goldenMaximize(
      objective,
      omegaCoarse - 1.5 * binWidth,
      omegaCoarse + 1.5 * binWidth,
      refineIterations
    );

    // Amplitude a = φ(ω)/W.
    const proj = projection(fChiRe, fChiIm, dt, omega);
    const aRe = proj.re / chiSum;
    const aIm = proj.im / chiSum;

    // Subtract a·e^{iω t_k} from the (unwindowed) residual.
    for (let k = 0; k < n; k += 1) {
      const phase = omega * k * dt;
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      fr[k] = fr[k]! - (aRe * c - aIm * s);
      fi[k] = fi[k]! - (aRe * s + aIm * c);
    }

    const power = aRe * aRe + aIm * aIm;
    components.push({ frequency: omega, amplitude: Math.sqrt(power), amplitudeRe: aRe, amplitudeIm: aIm, power });
  }

  return components;
}

/** The single dominant fundamental frequency of a complex signal. */
export function naffFundamentalFrequency(
  re: readonly number[],
  im: readonly number[],
  dt: number,
  options?: NaffOptions
): number {
  return naffDecompose(re, im, dt, 1, options)[0]!.frequency;
}
