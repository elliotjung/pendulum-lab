/**
 * Headless radix-2 Cooley–Tukey complex FFT for the quantum solvers (the
 * split-operator quantum kicked rotor in `quantumKickedRotor.ts` switches
 * between the position and momentum bases every kick). Kept in the physics layer
 * — dependency-free and independent of the app's UI FFT panel — so the headless
 * core never reaches up into `src/app`.
 *
 * `fftInPlace` is the forward transform X_k = Σ_j x_j e^{-2πi jk/N}; `ifftInPlace`
 * is its exact inverse x_j = (1/N) Σ_k X_k e^{+2πi jk/N}, so ifft∘fft is the
 * identity to round-off. Length must be a power of two.
 */

function validateComplexBuffer(re: Float64Array, im: Float64Array, caller: string): number {
  const n = re.length;
  if (n !== im.length) throw new RangeError(`${caller}: real and imaginary buffers must have equal length`);
  if (!Number.isSafeInteger(n) || n < 1 || !Number.isInteger(Math.log2(n))) {
    throw new RangeError(`${caller}: length must be a positive power of two`);
  }
  if (re === im) throw new RangeError(`${caller}: real and imaginary buffers must not alias`);
  if (
    re.buffer === im.buffer &&
    re.byteOffset < im.byteOffset + im.byteLength &&
    im.byteOffset < re.byteOffset + re.byteLength
  ) {
    throw new RangeError(`${caller}: real and imaginary buffer views must not overlap`);
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(re[i]) || !Number.isFinite(im[i])) {
      throw new TypeError(`${caller}: input samples must be finite`);
    }
  }
  return n;
}

function fftUnchecked(re: Float64Array, im: Float64Array, n: number): void {
  if (n === 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n / 2;
    while (j >= bit) {
      j -= bit;
      bit /= 2;
    }
    j += bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  // Arithmetic doubling avoids the signed-32-bit overflow semantics of `<<=`.
  for (let len = 2; len <= n; len *= 2) {
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

/** In-place forward FFT. `re`/`im` (power-of-two length) are overwritten. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  fftUnchecked(re, im, validateComplexBuffer(re, im, 'fftInPlace'));
}

/** In-place inverse FFT (normalised by 1/N), via conjugation of the forward FFT. */
export function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = validateComplexBuffer(re, im, 'ifftInPlace');
  if (n === 1) return;
  for (let i = 0; i < n; i += 1) im[i] = -(im[i] ?? 0);
  // Validation has already scanned both buffers; avoid a second O(N) pass.
  fftUnchecked(re, im, n);
  const inv = 1 / n;
  for (let i = 0; i < n; i += 1) {
    re[i] = (re[i] ?? 0) * inv;
    im[i] = -(im[i] ?? 0) * inv;
  }
}
