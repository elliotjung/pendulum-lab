import type { FloquetMultiplier } from './floquet';

/**
 * Stability classification of a Poincaré-map fixed point from its Floquet
 * multipliers (eigenvalues of the linearised return map). For 2D sections:
 * |μ| < 1 both → sink (node/spiral), |μ| > 1 both → source, mixed → saddle,
 * complex pair on the unit circle → (neutral) center / Neimark–Sacker point.
 */

export type FixedPointClass =
  | 'stable-node'
  | 'stable-spiral'
  | 'unstable-node'
  | 'unstable-spiral'
  | 'saddle'
  | 'center'
  | 'period-doubling-critical'
  | 'fold-critical'
  | 'degenerate';

export interface FixedPointClassification {
  classification: FixedPointClass;
  stable: boolean;
  /** Largest multiplier modulus (spectral radius of the return map). */
  spectralRadius: number;
  /** Multiplier moduli, descending. */
  moduli: number[];
  /** True when the dominant pair is complex (rotation around the fixed point). */
  rotational: boolean;
  /** Rotation number (arg μ / 2π) when rotational, else null. */
  rotationNumber: number | null;
  detail: string;
}

const UNIT_TOLERANCE = 1e-3;

export function classifyFixedPoint(multipliers: readonly FloquetMultiplier[]): FixedPointClassification {
  if (multipliers.length === 0) {
    return {
      classification: 'degenerate',
      stable: false,
      spectralRadius: Number.NaN,
      moduli: [],
      rotational: false,
      rotationNumber: null,
      detail: 'no multipliers supplied'
    };
  }
  const moduli = multipliers.map((mu) => Math.hypot(mu.re, mu.im)).sort((a, b) => b - a);
  const spectralRadius = moduli[0]!;
  const dominant = multipliers.reduce((best, mu) =>
    Math.hypot(mu.re, mu.im) > Math.hypot(best.re, best.im) ? mu : best
  );
  const rotational = Math.abs(dominant.im) > 1e-9;
  const rotationNumber = rotational ? Math.atan2(dominant.im, dominant.re) / (2 * Math.PI) : null;

  const allInside = moduli.every((modulus) => modulus < 1 - UNIT_TOLERANCE);
  const allOutside = moduli.every((modulus) => modulus > 1 + UNIT_TOLERANCE);
  const someInside = moduli.some((modulus) => modulus < 1 - UNIT_TOLERANCE);
  const someOutside = moduli.some((modulus) => modulus > 1 + UNIT_TOLERANCE);
  const onCircle = moduli.some((modulus) => Math.abs(modulus - 1) <= UNIT_TOLERANCE);

  let classification: FixedPointClass;
  if (onCircle) {
    // Critical cases: μ = -1 (period doubling), μ = +1 (fold), complex |μ| = 1 (NS/center).
    const critical = multipliers.find((mu) => Math.abs(Math.hypot(mu.re, mu.im) - 1) <= UNIT_TOLERANCE)!;
    if (Math.abs(critical.im) <= 1e-6 && critical.re < 0) classification = 'period-doubling-critical';
    else if (Math.abs(critical.im) <= 1e-6 && critical.re > 0) classification = 'fold-critical';
    else classification = 'center';
  } else if (allInside) {
    classification = rotational ? 'stable-spiral' : 'stable-node';
  } else if (allOutside) {
    classification = rotational ? 'unstable-spiral' : 'unstable-node';
  } else if (someInside && someOutside) {
    classification = 'saddle';
  } else {
    classification = 'degenerate';
  }

  return {
    classification,
    stable: allInside,
    spectralRadius,
    moduli,
    rotational,
    rotationNumber,
    detail:
      `multipliers ${multipliers.map((mu) => `${mu.re.toFixed(4)}${mu.im >= 0 ? '+' : ''}${mu.im.toFixed(4)}i`).join(', ')}; ` +
      `spectral radius ${spectralRadius.toFixed(4)} (unit-circle tolerance ${UNIT_TOLERANCE})`
  };
}
