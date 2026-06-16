import { describe, expect, test } from 'vitest';
import {
  diatomicDispersion,
  diatomicBandGap,
  diatomicDispersionCurve,
  acousticSoundSpeed,
  diatomicGroupVelocity,
  type DiatomicChainParams
} from '../src/physics/latticeDispersion';

/**
 * Diatomic-chain phonon dispersion. Pinned against the closed forms and the
 * textbook limits: acoustic ω→0 at the zone centre, the optical band top, the
 * zone-boundary band gap (and its closure when the masses are equal, recovering
 * the monatomic fold), the long-wavelength sound speed, and the vanishing group
 * velocity at the zone boundary.
 */

const GAAS_LIKE: DiatomicChainParams = { massA: 3, massB: 1, forceConstant: 1, latticeConstant: 1 };

describe('diatomic dispersion — closed forms & limits', () => {
  test('zone centre: acoustic → 0, optical² = 2C(1/mA+1/mB)', () => {
    const { acoustic, optical } = diatomicDispersion(0, GAAS_LIKE);
    expect(acoustic).toBeCloseTo(0, 10);
    expect(optical * optical).toBeCloseTo(2 * 1 * (1 / 3 + 1 / 1), 10);
  });

  test('zone-boundary band gap matches √(2C/m_heavy) and √(2C/m_light)', () => {
    const gap = diatomicBandGap(GAAS_LIKE);
    expect(gap.acousticTop).toBeCloseTo(Math.sqrt((2 * 1) / 3), 10); // heavy mass = 3
    expect(gap.opticalBottom).toBeCloseTo(Math.sqrt((2 * 1) / 1), 10); // light mass = 1
    expect(gap.gap).toBeGreaterThan(0);
    // The branches evaluated at k=π/a agree with the gap edges.
    const atBoundary = diatomicDispersion(Math.PI / GAAS_LIKE.latticeConstant, GAAS_LIKE);
    expect(atBoundary.acoustic).toBeCloseTo(gap.acousticTop, 9);
    expect(atBoundary.optical).toBeCloseTo(gap.opticalBottom, 9);
  });

  test('equal masses close the gap (monatomic fold)', () => {
    const mono: DiatomicChainParams = { massA: 2, massB: 2, forceConstant: 1, latticeConstant: 1 };
    expect(diatomicBandGap(mono).gap).toBeCloseTo(0, 9);
    // At the zone boundary both branches meet at ω² = 2C/m.
    const atBoundary = diatomicDispersion(Math.PI, mono);
    expect(atBoundary.acoustic).toBeCloseTo(Math.sqrt(2 / 2), 8);
    expect(atBoundary.optical).toBeCloseTo(Math.sqrt(2 / 2), 8);
  });

  test('optical branch is everywhere ≥ acoustic branch', () => {
    for (const { acoustic, optical } of diatomicDispersionCurve(GAAS_LIKE, 50)) {
      expect(optical).toBeGreaterThanOrEqual(acoustic - 1e-12);
    }
  });

  test('on-site pinning shifts both ω² rigidly by ω₀²', () => {
    const k = 0.7;
    const bare = diatomicDispersion(k, GAAS_LIKE);
    const pinned = diatomicDispersion(k, { ...GAAS_LIKE, onsiteOmegaSq: 4 });
    expect(pinned.acoustic * pinned.acoustic).toBeCloseTo(bare.acoustic * bare.acoustic + 4, 9);
    expect(pinned.optical * pinned.optical).toBeCloseTo(bare.optical * bare.optical + 4, 9);
  });
});

describe('diatomic dispersion — group velocity', () => {
  test('long-wavelength sound speed matches the acoustic slope at k→0', () => {
    const vs = acousticSoundSpeed(GAAS_LIKE);
    expect(vs).toBeCloseTo(GAAS_LIKE.latticeConstant * Math.sqrt(1 / (2 * (3 + 1))), 12);
    // Numerical slope ω_acoustic(k)/k for small k approaches v_s.
    const k = 1e-3;
    const slope = diatomicDispersion(k, GAAS_LIKE).acoustic / k;
    expect(slope).toBeCloseTo(vs, 4);
    expect(() => acousticSoundSpeed({ ...GAAS_LIKE, onsiteOmegaSq: 1 })).toThrow();
  });

  test('group velocity of both branches vanishes at the zone boundary', () => {
    const kB = Math.PI / GAAS_LIKE.latticeConstant;
    expect(Math.abs(diatomicGroupVelocity(kB, GAAS_LIKE, 'acoustic'))).toBeLessThan(1e-3);
    expect(Math.abs(diatomicGroupVelocity(kB, GAAS_LIKE, 'optical'))).toBeLessThan(1e-3);
  });
});
