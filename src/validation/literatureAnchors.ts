import { jacobianDouble } from '../physics/double';
import { rhsDriven, type DrivenParameters } from '../physics/driven';
import { rk4Step } from '../physics/integrators';
import {
  melnikovCriticalAmplitude,
  melnikovFunctionNumeric,
  drivenPeriodicOrbit,
  doublePendulumFlipBasin,
  boundaryMask,
  boxCountingDimension
} from '../chaos/index';

/**
 * Literature anchors: quantities this engine computes that have *published or
 * closed-form* reference values, compared head-to-head. Everything else in the
 * validation suite is self-consistency (convergence orders, spectrum
 * constraints, independent-diagnostic agreement); this module pins the engine
 * to numbers that exist outside the codebase:
 *
 *  - the large-amplitude pendulum period 4K(sin(θ₀/2))/ω₀ (complete elliptic
 *    integral; Landau & Lifshitz, *Mechanics*, §11),
 *  - the equal double pendulum normal modes ω² = (2 ∓ √2)g/l (Goldstein,
 *    *Classical Mechanics*, ch. 6),
 *  - the Melnikov threshold A_c = (4γω₀/π)cosh(πω/2ω₀) (Guckenheimer & Holmes,
 *    *Nonlinear Oscillations*, §4.5), cross-checked by direct quadrature,
 *  - the damped driven pendulum period-doubling onset A_PD ≈ 1.0663 at γ = 0.5,
 *    ω = 2/3 (Baker & Gollub, *Chaotic Dynamics*), measured here from the
 *    Floquet multiplier crossing −1.
 */

export interface LiteratureAnchor {
  id: string;
  description: string;
  reference: string;
  published: number;
  computed: number;
  /** Absolute tolerance on |computed − published|. */
  tolerance: number;
  pass: boolean;
  note?: string;
}

export interface LiteratureCheck {
  id: string;
  description: string;
  reference: string;
  /** Human-readable statement of what was measured. */
  detail: string;
  pass: boolean;
}

export interface LiteratureAnchorReport {
  anchors: LiteratureAnchor[];
  checks: LiteratureCheck[];
  allPass: boolean;
}

/** Complete elliptic integral of the first kind K(k) by the AGM (machine precision). */
export function ellipticK(k: number): number {
  if (!(k >= 0 && k < 1)) return Number.NaN;
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 64 && Math.abs(a - b) > 1e-17 * a; i += 1) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

/** Closed-form large-amplitude pendulum period T = 4K(sin(θ₀/2))/ω₀. */
export function pendulumPeriodElliptic(theta0: number, omega0: number): number {
  return (4 * ellipticK(Math.sin(theta0 / 2))) / omega0;
}

/**
 * Measure the free (undamped, undriven) pendulum period by RK4 simulation:
 * average spacing of same-direction zero crossings of θ, sub-step resolved by
 * linear interpolation (θ̈ = −sin θ vanishes at θ = 0, so the crossing is
 * locally linear and the interpolation error is O(dt³)).
 */
export function measurePendulumPeriod(theta0: number, options: { dt?: number; crossings?: number } = {}): number {
  const dt = options.dt ?? 0.001;
  const wanted = options.crossings ?? 11;
  const params: DrivenParameters = { g: 1, length: 1, damping: 0, driveAmplitude: 0, driveFrequency: 1 };
  const rhs = (s: ArrayLike<number>, o: Float64Array): void => {
    rhsDriven(s, params, o);
  };
  let state = new Float64Array([theta0, 0, 0]);
  let next = new Float64Array(3);
  const crossings: number[] = [];
  let t = 0;
  const maxSteps = Math.ceil(((wanted + 2) * 12) / dt);
  for (let i = 0; i < maxSteps && crossings.length < wanted; i += 1) {
    rk4Step(state, dt, rhs, next);
    const thPrev = state[0]!;
    const thCur = next[0]!;
    // Downward crossing: θ passes through 0 with negative velocity.
    if (thPrev > 0 && thCur <= 0) {
      crossings.push(t + (dt * thPrev) / (thPrev - thCur));
    }
    const swap = state;
    state = next;
    next = swap;
    t += dt;
  }
  if (crossings.length < 2) return Number.NaN;
  return (crossings[crossings.length - 1]! - crossings[0]!) / (crossings.length - 1);
}

/**
 * Measure the period-doubling onset of the damped driven pendulum: continue the
 * period-1 stroboscopic orbit in drive amplitude (warm-started Newton) and
 * locate where the most negative real Floquet multiplier crosses −1.
 */
export function measurePeriodDoublingOnset(options: { from?: number; to?: number; step?: number; dt?: number } = {}): {
  onset: number;
  bracket: [number, number];
  converged: boolean;
} {
  const from = options.from ?? 1.05;
  const to = options.to ?? 1.08;
  const step = options.step ?? 0.0025;
  const dt = options.dt ?? 0.005;
  let guess: [number, number] = [-0.29, 1.97];
  let prevA = Number.NaN;
  let prevRho = Number.NaN;
  for (let A = from; A <= to + 1e-12; A += step) {
    const params: DrivenParameters = { g: 1, length: 1, damping: 0.5, driveAmplitude: A, driveFrequency: 2 / 3 };
    const orbit = drivenPeriodicOrbit(params, guess, { dt, tolerance: 1e-10 });
    if (!orbit.converged) return { onset: Number.NaN, bracket: [Number.NaN, Number.NaN], converged: false };
    guess = orbit.orbit;
    const realMultipliers = orbit.multipliers.filter((m) => Math.abs(m.im) < 1e-9).map((m) => m.re);
    const rho = realMultipliers.length > 0 ? Math.min(...realMultipliers) : Number.NaN;
    if (Number.isFinite(prevRho) && prevRho > -1 && rho <= -1) {
      const onset = prevA + ((-1 - prevRho) * (A - prevA)) / (rho - prevRho);
      return { onset, bracket: [prevA, A], converged: true };
    }
    prevA = A;
    prevRho = rho;
  }
  return { onset: Number.NaN, bracket: [Number.NaN, Number.NaN], converged: false };
}

/**
 * The Melnikov critical amplitude recomputed from *quadrature* instead of the
 * closed form: with M(τ₀) = −(damping term) + A·(drive term per unit amplitude),
 * both terms are evaluated by Simpson integration along the separatrix and
 * A_c = dampingTerm / driveTermPerUnitA at the maximizing phase τ₀ = 0.
 */
export function melnikovCriticalAmplitudeNumeric(p: DrivenParameters): number {
  const dampingTerm = -melnikovFunctionNumeric(0, { ...p, driveAmplitude: 0 });
  const refAmplitude = 1;
  const drivePerUnit = melnikovFunctionNumeric(0, { ...p, damping: 0, driveAmplitude: refAmplitude }) / refAmplitude;
  return dampingTerm / drivePerUnit;
}

const DRIVEN_BASE: DrivenParameters = { g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 };

function eig2x2(a: number, b: number, c: number, d: number): [number, number] {
  const trace = a + d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  return [(trace + disc) / 2, (trace - disc) / 2];
}

/** Compute every literature anchor and structural check. */
export function runLiteratureAnchors(): LiteratureAnchorReport {
  const anchors: LiteratureAnchor[] = [];
  const checks: LiteratureCheck[] = [];

  // 1. Large-amplitude pendulum period vs the complete elliptic integral.
  {
    const theta0 = 2;
    const published = pendulumPeriodElliptic(theta0, 1);
    const computed = measurePendulumPeriod(theta0);
    anchors.push({
      id: 'elliptic-period',
      description: 'Free pendulum period at θ₀ = 2 rad vs T = 4K(sin(θ₀/2))/ω₀',
      reference: 'Landau & Lifshitz, Mechanics §11 (complete elliptic integral)',
      published,
      computed,
      tolerance: 1e-6,
      pass: Math.abs(computed - published) < 1e-6
    });
  }

  // 2. Equal double pendulum normal modes from the analytic Jacobian.
  {
    const g = 9.81;
    const jac = new Float64Array(16);
    jacobianDouble([0, 0, 0, 0], { m1: 1, m2: 1, l1: 1, l2: 1, g }, 0, jac);
    const [e1, e2] = eig2x2(jac[8]!, jac[9]!, jac[12]!, jac[13]!);
    const omegaSq = [-e1, -e2].sort((x, y) => y - x);
    const cases: Array<{ id: string; published: number; computed: number; sign: string }> = [
      { id: 'normal-mode-fast', published: (2 + Math.SQRT2) * g, computed: omegaSq[0]!, sign: '+' },
      { id: 'normal-mode-slow', published: (2 - Math.SQRT2) * g, computed: omegaSq[1]!, sign: '−' }
    ];
    for (const c of cases) {
      anchors.push({
        id: c.id,
        description: `Equal double pendulum normal mode ω²${c.sign} = (2 ${c.sign === '+' ? '+' : '−'} √2)g/l`,
        reference: 'Goldstein, Classical Mechanics, ch. 6 (small oscillations)',
        published: c.published,
        computed: c.computed,
        tolerance: 1e-8,
        pass: Math.abs(c.computed - c.published) < 1e-8
      });
    }
  }

  // 3. Melnikov threshold: closed form (published) vs direct quadrature (computed).
  {
    const published = melnikovCriticalAmplitude(DRIVEN_BASE);
    const computed = melnikovCriticalAmplitudeNumeric(DRIVEN_BASE);
    anchors.push({
      id: 'melnikov-threshold',
      description: 'Melnikov critical amplitude A_c at γ = 0.5, ω = 2/3: quadrature vs closed form (2/π)cosh(π/3)',
      reference: 'Guckenheimer & Holmes, Nonlinear Oscillations, §4.5',
      published,
      computed,
      tolerance: 1e-8,
      pass: Math.abs(computed - published) < 1e-8,
      note: 'closed form ≈ 1.0187; first-order perturbation theory, so a guide rather than an exact onset at γ = 0.5'
    });
  }

  // 4. Period-doubling onset measured from the Floquet multiplier crossing −1.
  const pd = measurePeriodDoublingOnset();
  {
    const published = 1.0663;
    anchors.push({
      id: 'period-doubling-onset',
      description: 'Damped driven pendulum (γ = 0.5, ω = 2/3) period-doubling onset A_PD from ρ → −1',
      reference: 'Baker & Gollub, Chaotic Dynamics (damped driven pendulum cascade)',
      published,
      computed: pd.onset,
      tolerance: 5e-3,
      pass: pd.converged && Math.abs(pd.onset - published) < 5e-3,
      note: `Floquet multiplier −1 crossing bracketed in [${pd.bracket[0]}, ${pd.bracket[1]}]`
    });
  }

  // Structural check: homoclinic tangle (Melnikov) precedes the attractor cascade.
  {
    const ac = melnikovCriticalAmplitude(DRIVEN_BASE);
    checks.push({
      id: 'melnikov-precedes-pd',
      description: 'Melnikov threshold lies below the period-doubling onset (tangle precedes attractor chaos)',
      reference: 'Guckenheimer & Holmes, Nonlinear Oscillations, §4.5',
      detail: `A_c ≈ ${ac.toFixed(4)} < A_PD ≈ ${Number.isFinite(pd.onset) ? pd.onset.toFixed(4) : 'n/a'}`,
      pass: pd.converged && ac < pd.onset
    });
  }

  // Structural check: the double-pendulum flip boundary is strictly fractal.
  {
    const grid = doublePendulumFlipBasin(
      { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
      { n: 48, range: [-3, 3], dt: 0.01, maxTime: 12 }
    );
    const { dimension } = boxCountingDimension(boundaryMask(grid), grid.width, grid.height);
    checks.push({
      id: 'flip-basin-fractal',
      description: 'Double-pendulum flip-basin boundary box-counting dimension is strictly fractal (1 < d < 2)',
      reference: 'Daza et al., basin entropy framework (fractal exit boundaries)',
      detail: `measured d ≈ ${dimension.toFixed(3)} at n = 48`,
      pass: dimension > 1.25 && dimension < 2
    });
  }

  return {
    anchors,
    checks,
    allPass: anchors.every((a) => a.pass) && checks.every((c) => c.pass)
  };
}
