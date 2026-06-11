/**
 * Numerical experiment behind the mini-paper (paper/index.html):
 *
 *   "How far above the Melnikov threshold does the period-doubling cascade
 *    begin? A damping sweep of the damped driven pendulum."
 *
 * For each damping γ (ω = 2/3, ω₀ = 1):
 *   1. A_c(γ): the closed-form Melnikov critical amplitude (first-order
 *      perturbation theory — the analytic onset of the homoclinic tangle).
 *   2. A_PD(γ): the *measured* drive amplitude where the primary
 *      small-oscillation period-1 attractor first loses stability:
 *        a. march A upward, strobing the attractor at the drive period
 *           (warm-started so the same attractor branch is followed),
 *        b. bisect the period-1 boundary,
 *        c. refine with the Floquet multiplier of the Newton periodic orbit
 *           *seeded from the physical attractor* — the onset is interpolated
 *           where the most negative real multiplier crosses −1, and the
 *           crossing type is verified (ρ ≈ −1 ⇒ genuine period doubling).
 *   3. 0–1 test corroboration just below and well above the onset.
 *
 * Also produced: a strobe bifurcation diagram at γ = 0.5 and a dt-sensitivity
 * check of the measured onset. Everything lands in reports/paper-study.json;
 * scripts/build-paper.ts renders the paper from that JSON.
 *
 * Run: npm run paper:study   (~10–20 minutes, CPU-bound)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { rhsDriven, type DrivenParameters } from '../src/physics/driven';
import { rk4Step } from '../src/physics/integrators';
import type { Derivative } from '../src/physics/types';
import { drivenPeriodicOrbit } from '../src/chaos/floquet';
import { melnikovCriticalAmplitude } from '../src/chaos/melnikov';
import { zeroOneTest } from '../src/chaos/zeroOneTest';

const OMEGA = 2 / 3;
const PERIOD = (2 * Math.PI) / OMEGA;
const DT = 0.005;

const params = (gamma: number, A: number): DrivenParameters => ({
  g: 1,
  length: 1,
  damping: gamma,
  driveAmplitude: A,
  driveFrequency: OMEGA
});

interface StrobeResult {
  strobes: Array<[number, number]>;
  final: [number, number];
}

/** Integrate and sample (θ, ω) at every drive period after the transient. */
function strobeAttractor(p: DrivenParameters, ic: [number, number], transient: number, samples: number, dt0 = DT): StrobeResult {
  const steps = Math.max(1, Math.round(PERIOD / dt0));
  const dt = PERIOD / steps;
  const cur = new Float64Array([ic[0], ic[1], 0]);
  const nxt = new Float64Array(3);
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, p, o);
  };
  const out: Array<[number, number]> = [];
  for (let period = 0; period < transient + samples; period += 1) {
    for (let s = 0; s < steps; s += 1) {
      rk4Step(cur, dt, rhs, nxt);
      cur.set(nxt);
    }
    cur[2] = (cur[2] ?? 0) % (2 * Math.PI);
    if (period >= transient) out.push([cur[0] ?? 0, cur[1] ?? 0]);
  }
  return { strobes: out, final: [cur[0] ?? 0, cur[1] ?? 0] };
}

/** Distance in the (sinθ, cosθ, ω) embedding — immune to 2π winding. */
function strobeDistance(a: [number, number], b: [number, number]): number {
  return Math.hypot(Math.sin(a[0]) - Math.sin(b[0]), Math.cos(a[0]) - Math.cos(b[0]), a[1] - b[1]);
}

function isPeriod1(points: Array<[number, number]>): boolean {
  let d1 = 0;
  for (let i = points.length - 12; i < points.length - 1; i += 1) {
    d1 = Math.max(d1, strobeDistance(points[i]!, points[i + 1]!));
  }
  return d1 < 2e-3;
}

interface OnsetMeasurement {
  gamma: number;
  Ac: number;
  /** Attractor-based bisection bracket on the loss of period-1 stability. */
  attractorBracket: [number, number] | null;
  /** Floquet-refined onset (most negative real multiplier crosses −1). */
  Apd: number | null;
  /** Verified crossing type: 'period-doubling' iff ρ passes through −1. */
  lossType: 'period-doubling' | 'no-loss-below-cap' | 'unclassified';
  /** Most negative real multiplier just below / just above the onset. */
  rhoBelow: number | null;
  rhoAbove: number | null;
  ratio: number | null;
  /** 0–1 test K on the attractor strobe series just below and well above onset. */
  K_below: number | null;
  K_above: number | null;
  marchCap: number;
}

function measureOnset(gamma: number, dt0 = DT): OnsetMeasurement {
  const Ac = melnikovCriticalAmplitude(params(gamma, 0));
  const cap = Math.max(1.8 * Ac, 1.35);
  const result: OnsetMeasurement = {
    gamma,
    Ac,
    attractorBracket: null,
    Apd: null,
    lossType: 'no-loss-below-cap',
    rhoBelow: null,
    rhoAbove: null,
    ratio: null,
    K_below: null,
    K_above: null,
    marchCap: cap
  };

  // 1. Coarse march (warm-started) until the period-1 attractor is first lost.
  let ic: [number, number] = [0.1, 0];
  let lastP1 = Number.NaN;
  let firstLoss = Number.NaN;
  let seed: [number, number] = ic;
  const coarse = 0.02 * Ac;
  for (let A = 0.9 * Ac; A <= cap; A += coarse) {
    const r = strobeAttractor(params(gamma, A), ic, 300, 16, dt0);
    ic = r.final;
    if (isPeriod1(r.strobes)) {
      lastP1 = A;
      seed = r.strobes[r.strobes.length - 1]!;
    } else if (Number.isFinite(lastP1)) {
      firstLoss = A;
      break;
    }
  }
  if (!Number.isFinite(firstLoss)) return result;

  // 2. Bisect the period-1 boundary on the attractor.
  let a = lastP1;
  let b = firstLoss;
  let icBisect = seed;
  for (let i = 0; i < 14; i += 1) {
    const mid = (a + b) / 2;
    const r = strobeAttractor(params(gamma, mid), icBisect, 600, 16, dt0);
    if (isPeriod1(r.strobes)) {
      a = mid;
      icBisect = r.final;
      seed = r.strobes[r.strobes.length - 1]!;
    } else {
      b = mid;
    }
  }
  result.attractorBracket = [a, b];

  // 3. Floquet refinement, Newton-seeded from the physical attractor (this is
  //    what keeps the measurement on the symmetry-broken branch the attractor
  //    actually follows, instead of the symmetric orbit that pitchforked off
  //    earlier).
  let guess = seed;
  const rho = (A: number): number => {
    const orbit = drivenPeriodicOrbit(params(gamma, A), guess, { dt: dt0, tolerance: 1e-10 });
    if (!orbit.converged) return Number.NaN;
    guess = orbit.orbit;
    const reals = orbit.multipliers.filter((m) => Math.abs(m.im) < 1e-9).map((m) => m.re);
    return reals.length > 0 ? Math.min(...reals) : Number.NaN;
  };
  const width = Math.max(2e-3 * Ac, (b - a) * 4);
  let lo = a - width;
  let hi = b + width;
  let rlo = rho(lo);
  let rhi = rho(hi);
  result.rhoBelow = Number.isFinite(rlo) ? rlo : null;
  result.rhoAbove = Number.isFinite(rhi) ? rhi : null;
  if (Number.isFinite(rlo) && Number.isFinite(rhi) && rlo > -1 && rhi < -1 && rlo < -0.3) {
    for (let i = 0; i < 50 && hi - lo > 1e-8; i += 1) {
      const mid = (lo + hi) / 2;
      const rm = rho(mid);
      if (!Number.isFinite(rm)) break;
      if (rm > -1) {
        lo = mid;
        rlo = rm;
      } else {
        hi = mid;
        rhi = rm;
      }
    }
    result.Apd = lo + ((-1 - rlo) * (hi - lo)) / (rhi - rlo);
    result.lossType = 'period-doubling';
    result.ratio = result.Apd / Ac;
  } else {
    result.lossType = 'unclassified';
  }

  // 4. 0–1 test corroboration on strobe series (cosθ at the drive period).
  const onset = result.Apd ?? (a + b) / 2;
  const kAt = (A: number): number => {
    const r = strobeAttractor(params(gamma, A), [0.1, 0], 300, 700, dt0);
    const series = r.strobes.map(([theta]) => Math.cos(theta));
    return zeroOneTest(series, { seed: 12345 }).K;
  };
  result.K_below = kAt(0.97 * onset);
  result.K_above = kAt(1.08 * onset);
  return result;
}

/** Strobe bifurcation diagram data: A vs θ strobe points (γ fixed). */
function bifurcationDiagram(gamma: number, from: number, to: number, steps: number): Array<{ A: number; thetas: number[] }> {
  const rows: Array<{ A: number; thetas: number[] }> = [];
  let ic: [number, number] = [0.1, 0];
  for (let i = 0; i <= steps; i += 1) {
    const A = from + ((to - from) * i) / steps;
    const r = strobeAttractor(params(gamma, A), ic, 250, 70, 0.01);
    ic = r.final;
    // Wrap θ to (−π, π] for plotting.
    rows.push({ A, thetas: r.strobes.map(([theta]) => Math.atan2(Math.sin(theta), Math.cos(theta))) });
  }
  return rows;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const gammas = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
  const measurements: OnsetMeasurement[] = [];
  for (const gamma of gammas) {
    const m = measureOnset(gamma);
    measurements.push(m);
    console.log(
      `γ=${gamma.toFixed(2)}  A_c=${m.Ac.toFixed(5)}  ` +
        (m.Apd !== null
          ? `A_PD=${m.Apd.toFixed(6)}  ratio=${m.ratio!.toFixed(4)}  K(0.97·A)=${m.K_below?.toFixed(3)}  K(1.08·A)=${m.K_above?.toFixed(3)}`
          : `loss=${m.lossType}` + (m.attractorBracket ? ` bracket=[${m.attractorBracket[0].toFixed(4)},${m.attractorBracket[1].toFixed(4)}] ρ=[${m.rhoBelow?.toFixed(3)},${m.rhoAbove?.toFixed(3)}]` : ''))
    );
  }

  // dt-sensitivity of the headline measurement (γ = 0.5).
  console.log('dt-sensitivity check at γ = 0.5 (dt = 0.0025)…');
  const fine = measureOnset(0.5, 0.0025);
  const coarse05 = measurements.find((m) => m.gamma === 0.5)!;
  const dtSensitivity = fine.Apd !== null && coarse05.Apd !== null ? Math.abs(fine.Apd - coarse05.Apd) : null;
  console.log(`  A_PD(dt=0.005)=${coarse05.Apd?.toFixed(6)}  A_PD(dt=0.0025)=${fine.Apd?.toFixed(6)}  |Δ|=${dtSensitivity?.toExponential(2)}`);

  // Strobe bifurcation diagram at γ = 0.5 (the classic picture).
  console.log('bifurcation diagram at γ = 0.5…');
  const diagram = bifurcationDiagram(0.5, 1.0, 1.5, 220);

  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/paper-study.json',
    JSON.stringify(
      {
        schemaVersion: 'paper-study/v1',
        generatedAt: new Date().toISOString(),
        driveFrequency: OMEGA,
        dt: DT,
        method: {
          attractor: 'strobe at drive period, warm-started march + bisection of the period-1 boundary (300–600 transient periods)',
          refinement: 'Floquet multiplier of the Newton period-1 orbit seeded from the attractor; onset interpolated at ρ = −1',
          corroboration: '0–1 test (Gottwald–Melbourne) on cosθ strobe series, 700 samples, seed 12345',
          literatureAnchor: 'Baker & Gollub: A_PD ≈ 1.0663 at γ = 0.5, ω = 2/3'
        },
        measurements,
        dtSensitivity: { gamma: 0.5, dtFine: 0.0025, ApdFine: fine.Apd, ApdCoarse: coarse05.Apd, absDelta: dtSensitivity },
        bifurcationDiagram: { gamma: 0.5, rows: diagram },
        runtimeSeconds: (Date.now() - t0) / 1000
      },
      null,
      1
    )
  );
  console.log(`paper-study.json written (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
