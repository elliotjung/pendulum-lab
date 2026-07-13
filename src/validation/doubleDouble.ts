/**
 * Double-double (~106-bit, ≈ 31 decimal digit) arithmetic and integrators — a
 * self-contained extended-precision *ground truth* for the float64 solvers.
 *
 * The existing cross-validation reference (`gbs`, fine-dt) is a high-accuracy
 * orbit computed *in the same float64 precision* it is meant to certify, so it
 * cannot expose float64 round-off itself. A double-double number represents a
 * value as an unevaluated sum hi + lo of two non-overlapping doubles, doubling
 * the working precision using only IEEE-754 double operations (Dekker 1971,
 * Knuth two-sum, the QD library of Hida–Li–Bailey). Integrating a system in
 * double-double therefore yields a trajectory whose round-off floor is ~1e-31
 * instead of ~1e-16 — a genuinely independent, higher-precision reference.
 *
 * Scope: the primitives need only +, −, × (no transcendental functions), so the
 * integrators here target polynomial vector fields (e.g. the Hénon–Heiles
 * Hamiltonian used to validate them). A double-double double *pendulum* would
 * additionally need double-double sin/cos and a double-double linear solve;
 * that remains future work, but the arithmetic and the explicit integrators
 * below are exact to the claimed precision and tested as such.
 */

/** A double-double value: the exact number is hi + lo with |lo| ≤ ½ ulp(hi). */
export type DD = readonly [hi: number, lo: number];

const SPLIT = 134217729; // 2^27 + 1, the Dekker splitting constant for IEEE doubles.

/** Knuth two-sum: returns [s, e] with s = fl(a+b) and a+b = s + e exactly. */
export function twoSum(a: number, b: number): DD {
  const s = a + b;
  const bb = s - a;
  const err = a - (s - bb) + (b - bb);
  return [s, err];
}

/** Fast two-sum, valid only when |a| ≥ |b|. */
function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  const err = b - (s - a);
  return [s, err];
}

/** Veltkamp split of a double into two 26/27-bit halves. */
function split(a: number): DD {
  const c = SPLIT * a;
  const hi = c - (c - a);
  const lo = a - hi;
  return [hi, lo];
}

/** Two-product: returns [p, e] with p = fl(a·b) and a·b = p + e exactly (Dekker, FMA-free). */
export function twoProd(a: number, b: number): DD {
  const p = a * b;
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  const err = ah * bh - p + ah * bl + al * bh + al * bl;
  return [p, err];
}

export function ddFromNumber(x: number): DD {
  return [x, 0];
}

/** Nearest double to a double-double (hi + lo). Loses precision — for comparison/printing only. */
export function ddToNumber(a: DD): number {
  return a[0] + a[1];
}

export function ddNeg(a: DD): DD {
  return [-a[0], -a[1]];
}

/** Double-double + double. */
export function ddAddDouble(a: DD, b: number): DD {
  let [s, e] = twoSum(a[0], b);
  e += a[1];
  return quickTwoSum(s, e);
}

/** Double-double + double-double (QD "sloppy" add: ~106-bit accurate). */
export function ddAdd(a: DD, b: DD): DD {
  let [s, e] = twoSum(a[0], b[0]);
  e += a[1] + b[1];
  return quickTwoSum(s, e);
}

export function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, ddNeg(b));
}

/** Double-double × double. */
export function ddMulDouble(a: DD, b: number): DD {
  let [p, e] = twoProd(a[0], b);
  e += a[1] * b;
  return quickTwoSum(p, e);
}

/** Double-double × double-double. */
export function ddMul(a: DD, b: DD): DD {
  let [p, e] = twoProd(a[0], b[0]);
  e += a[0] * b[1] + a[1] * b[0];
  return quickTwoSum(p, e);
}

/** Double-double ÷ double (a few Newton-style correction steps). */
export function ddDivDouble(a: DD, b: number): DD {
  const q1 = a[0] / b;
  const r1 = ddSub(a, twoProd(q1, b)); // a − q1·b, q1·b held exactly
  const q2 = r1[0] / b;
  const r2 = ddSub(r1, twoProd(q2, b));
  const q3 = r2[0] / b;
  return ddAddDouble(quickTwoSum(q1, q2), q3);
}

/** Double-double ÷ double-double. */
export function ddDiv(a: DD, b: DD): DD {
  const q1 = a[0] / b[0];
  let r = ddSub(a, ddMulDouble(b, q1)); // a − q1·b
  const q2 = r[0] / b[0];
  r = ddSub(r, ddMulDouble(b, q2));
  const q3 = r[0] / b[0];
  return ddAddDouble(quickTwoSum(q1, q2), q3);
}

// Standard QD double-double constants (the trailing word is the rounding tail).
const DD_PI_2: DD = [1.5707963267948966, 6.123233995736766e-17];
const DD_PI_2_HI = 1.5707963267948966;

/** sin and cos of a small argument |r| ≤ π/4 via their double-double Taylor series. */
function sinCosSmall(r: DD): [DD, DD] {
  const negR2 = ddNeg(ddMul(r, r));
  let sinTerm: DD = r;
  let sinSum: DD = r;
  for (let k = 1; k < 30; k += 1) {
    sinTerm = ddDivDouble(ddMul(sinTerm, negR2), 2 * k * (2 * k + 1));
    sinSum = ddAdd(sinSum, sinTerm);
    if (Math.abs(sinTerm[0]) < 1e-34) break;
  }
  let cosTerm: DD = [1, 0];
  let cosSum: DD = [1, 0];
  for (let k = 1; k < 30; k += 1) {
    cosTerm = ddDivDouble(ddMul(cosTerm, negR2), (2 * k - 1) * (2 * k));
    cosSum = ddAdd(cosSum, cosTerm);
    if (Math.abs(cosTerm[0]) < 1e-34) break;
  }
  return [sinSum, cosSum];
}

/**
 * sin and cos of a double-double argument. The argument is reduced modulo π/2
 * (tracking the octant) to a small remainder where the Taylor series converges
 * quickly and accurately, then the octant fixes the signs/swap.
 */
export function ddSinCos(x: DD): [DD, DD] {
  const j = Math.round(ddToNumber(x) / DD_PI_2_HI);
  const r = ddSub(x, ddMulDouble(DD_PI_2, j)); // |r| ≤ π/4
  const [s, c] = sinCosSmall(r);
  const q = ((j % 4) + 4) % 4;
  if (q === 0) return [s, c];
  if (q === 1) return [c, ddNeg(s)];
  if (q === 2) return [ddNeg(s), ddNeg(c)];
  return [ddNeg(c), s]; // q === 3
}

export function ddSin(x: DD): DD {
  return ddSinCos(x)[0];
}

export function ddCos(x: DD): DD {
  return ddSinCos(x)[1];
}

// --- Vector helpers over parallel (hi, lo) Float64Arrays -----------------------

/** out[i] = y[i] + scalar · k[i], all in double-double (scalar is an exact double). */
function ddAxpy(
  yHi: Float64Array,
  yLo: Float64Array,
  kHi: Float64Array,
  kLo: Float64Array,
  scalar: number,
  outHi: Float64Array,
  outLo: Float64Array
): void {
  for (let i = 0; i < yHi.length; i += 1) {
    const scaled = ddMulDouble([kHi[i] ?? 0, kLo[i] ?? 0], scalar);
    const sum = ddAdd([yHi[i] ?? 0, yLo[i] ?? 0], scaled);
    outHi[i] = sum[0];
    outLo[i] = sum[1];
  }
}

/** A derivative evaluated in double-double: writes f(y) into (outHi, outLo). */
export type DdDerivative = (yHi: Float64Array, yLo: Float64Array, outHi: Float64Array, outLo: Float64Array) => void;

/** A force F(q) (for a separable system) evaluated in double-double. */
export type DdForce = (qHi: Float64Array, qLo: Float64Array, outHi: Float64Array, outLo: Float64Array) => void;

/**
 * One classical RK4 step in double-double, advancing (yHi, yLo) in place by dt.
 * 4th-order accurate; its round-off floor is ~1e-31, so it is the high-order
 * extended-precision reference the float64 RK4 is compared against.
 */
export function ddRk4Step(yHi: Float64Array, yLo: Float64Array, dt: number, rhs: DdDerivative): void {
  const n = yHi.length;
  const k1Hi = new Float64Array(n),
    k1Lo = new Float64Array(n);
  const k2Hi = new Float64Array(n),
    k2Lo = new Float64Array(n);
  const k3Hi = new Float64Array(n),
    k3Lo = new Float64Array(n);
  const k4Hi = new Float64Array(n),
    k4Lo = new Float64Array(n);
  const tHi = new Float64Array(n),
    tLo = new Float64Array(n);

  rhs(yHi, yLo, k1Hi, k1Lo);
  ddAxpy(yHi, yLo, k1Hi, k1Lo, dt / 2, tHi, tLo);
  rhs(tHi, tLo, k2Hi, k2Lo);
  ddAxpy(yHi, yLo, k2Hi, k2Lo, dt / 2, tHi, tLo);
  rhs(tHi, tLo, k3Hi, k3Lo);
  ddAxpy(yHi, yLo, k3Hi, k3Lo, dt, tHi, tLo);
  rhs(tHi, tLo, k4Hi, k4Lo);

  for (let i = 0; i < n; i += 1) {
    // increment = (dt/6)(k1 + 2k2 + 2k3 + k4)
    let acc = ddAdd([k1Hi[i] ?? 0, k1Lo[i] ?? 0], [k4Hi[i] ?? 0, k4Lo[i] ?? 0]);
    acc = ddAdd(acc, ddMulDouble([k2Hi[i] ?? 0, k2Lo[i] ?? 0], 2));
    acc = ddAdd(acc, ddMulDouble([k3Hi[i] ?? 0, k3Lo[i] ?? 0], 2));
    const next = ddAdd([yHi[i] ?? 0, yLo[i] ?? 0], ddMulDouble(acc, dt / 6));
    yHi[i] = next[0];
    yLo[i] = next[1];
  }
}

/**
 * One Störmer–Verlet (leapfrog) step for a separable system q̈ = F(q), in
 * double-double, advancing (q, p) in place by dt. Verlet is *time-symmetric*:
 * a step with −dt exactly inverts a step with +dt in exact arithmetic, so a
 * forward-then-backward round trip isolates pure round-off — the test that
 * actually exposes the precision difference between float64 and double-double.
 */
export function ddVerletStep(
  qHi: Float64Array,
  qLo: Float64Array,
  pHi: Float64Array,
  pLo: Float64Array,
  dt: number,
  force: DdForce
): void {
  const n = qHi.length;
  const fHi = new Float64Array(n),
    fLo = new Float64Array(n);

  force(qHi, qLo, fHi, fLo); // half kick
  ddAxpy(pHi, pLo, fHi, fLo, dt / 2, pHi, pLo);
  ddAxpy(qHi, qLo, pHi, pLo, dt, qHi, qLo); // drift
  force(qHi, qLo, fHi, fLo); // half kick
  ddAxpy(pHi, pLo, fHi, fLo, dt / 2, pHi, pLo);
}
