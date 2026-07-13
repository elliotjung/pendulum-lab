/**
 * Diatomic-lattice phonon dispersion — the two-atom-per-cell generalisation of
 * the monatomic ring in `pendulumNetwork.ts`. A 1-D chain with alternating
 * masses m_A, m_B and a single nearest-neighbour force constant C has TWO
 * branches separated by a forbidden gap, exactly the acoustic + optical phonon
 * band structure of a real (e.g. III-V) crystal:
 *
 *   ω²_±(k) = ω₀² + C(1/m_A + 1/m_B) ± C·√[(1/m_A + 1/m_B)² - 4 sin²(ka/2)/(m_A m_B)]
 *
 * where the optional on-site term ω₀² (= g/l for the gravity-pinned pendulum
 * lattice) shifts the whole ω² spectrum rigidly upward. The lower branch (−) is
 * acoustic (ω → ω₀ as k → 0), the upper branch (+) is optical, and at the zone
 * boundary k = π/a they split to leave the band gap
 *   ω²_acoustic-top = ω₀² + 2C/m_heavy,  ω²_optical-bottom = ω₀² + 2C/m_light.
 * When m_A = m_B the gap closes and the pair folds back to the monatomic
 * dispersion — the standard consistency limit.
 */
export interface DiatomicChainParams {
  /** Mass on sublattice A (> 0). */
  massA: number;
  /** Mass on sublattice B (> 0). */
  massB: number;
  /** Nearest-neighbour force constant C (> 0). */
  forceConstant: number;
  /** Two-atom-cell lattice constant a (> 0). */
  latticeConstant: number;
  /** Optional on-site pinning ω₀² ≥ 0 (e.g. gravitational g/l). Default 0. */
  onsiteOmegaSq?: number;
}

export interface DispersionBranches {
  /** Lower (acoustic) angular frequency ω_-(k). */
  acoustic: number;
  /** Upper (optical) angular frequency ω_+(k). */
  optical: number;
}

function validate(p: DiatomicChainParams): void {
  if (!(p.massA > 0) || !(p.massB > 0)) throw new Error('diatomic chain: masses must be positive');
  if (!(p.forceConstant > 0)) throw new Error('diatomic chain: forceConstant must be positive');
  if (!(p.latticeConstant > 0)) throw new Error('diatomic chain: latticeConstant must be positive');
  if ((p.onsiteOmegaSq ?? 0) < 0) throw new Error('diatomic chain: onsiteOmegaSq must be ≥ 0');
}

/** Acoustic and optical angular frequencies at wavevector k (closed form). */
export function diatomicDispersion(k: number, p: DiatomicChainParams): DispersionBranches {
  validate(p);
  const { massA, massB, forceConstant: C, latticeConstant: a } = p;
  const onsite = p.onsiteOmegaSq ?? 0;
  const invSum = 1 / massA + 1 / massB;
  const s = Math.sin((k * a) / 2);
  const disc = Math.max(0, invSum * invSum - (4 * s * s) / (massA * massB));
  const root = C * Math.sqrt(disc);
  const mid = onsite + C * invSum;
  return {
    acoustic: Math.sqrt(Math.max(0, mid - root)),
    optical: Math.sqrt(Math.max(0, mid + root))
  };
}

export interface DiatomicBandGap {
  /** Top of the acoustic branch at the zone boundary, √(ω₀² + 2C/m_heavy). */
  acousticTop: number;
  /** Bottom of the optical branch at the zone boundary, √(ω₀² + 2C/m_light). */
  opticalBottom: number;
  /** Forbidden gap width in ω (≥ 0; zero iff m_A = m_B). */
  gap: number;
}

/** Closed-form band-gap edges at the zone boundary k = π/a. */
export function diatomicBandGap(p: DiatomicChainParams): DiatomicBandGap {
  validate(p);
  const { massA, massB, forceConstant: C } = p;
  const onsite = p.onsiteOmegaSq ?? 0;
  const heavy = Math.max(massA, massB);
  const light = Math.min(massA, massB);
  const acousticTop = Math.sqrt(onsite + (2 * C) / heavy);
  const opticalBottom = Math.sqrt(onsite + (2 * C) / light);
  return { acousticTop, opticalBottom, gap: opticalBottom - acousticTop };
}

export interface DispersionSample {
  k: number;
  acoustic: number;
  optical: number;
}

/** Sample both branches over k ∈ [0, π/a] on `samples` points — a k-ω band plot. */
export function diatomicDispersionCurve(p: DiatomicChainParams, samples = 64): DispersionSample[] {
  validate(p);
  if (!Number.isInteger(samples) || samples < 2)
    throw new Error('diatomicDispersionCurve: samples must be an integer ≥ 2');
  const kMax = Math.PI / p.latticeConstant;
  const out: DispersionSample[] = [];
  for (let i = 0; i < samples; i += 1) {
    const k = (kMax * i) / (samples - 1);
    const { acoustic, optical } = diatomicDispersion(k, p);
    out.push({ k, acoustic, optical });
  }
  return out;
}

/**
 * Long-wavelength acoustic sound speed v_s = a·√(C/(2(m_A + m_B))), the group
 * velocity dω/dk of the acoustic branch as k → 0. Defined only for the
 * un-pinned chain (ω₀ = 0); with pinning the acoustic branch is gapped and has
 * zero slope at k = 0.
 */
export function acousticSoundSpeed(p: DiatomicChainParams): number {
  validate(p);
  if ((p.onsiteOmegaSq ?? 0) !== 0) {
    throw new Error('acousticSoundSpeed: only defined for an un-pinned chain (onsiteOmegaSq = 0)');
  }
  return p.latticeConstant * Math.sqrt(p.forceConstant / (2 * (p.massA + p.massB)));
}

/** Central-difference group velocity dω/dk of one branch at wavevector k. */
export function diatomicGroupVelocity(
  k: number,
  p: DiatomicChainParams,
  branch: 'acoustic' | 'optical',
  h = 1e-6
): number {
  const plus = diatomicDispersion(k + h, p)[branch];
  const minus = diatomicDispersion(k - h, p)[branch];
  return (plus - minus) / (2 * h);
}
