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
import { rhsDuffing, type DuffingParameters } from '../src/physics/duffing';
import { rk4Step } from '../src/physics/integrators';
import type { Derivative } from '../src/physics/types';
import { drivenPeriodicOrbit } from '../src/chaos/floquet';
import { melnikovCriticalAmplitude, melnikovCriticalAmplitudeDuffing } from '../src/chaos/melnikov';
import { zeroOneTest } from '../src/chaos/zeroOneTest';

const OMEGA = 2 / 3;
const DT = 0.005;

const params = (gamma: number, A: number, omega: number = OMEGA): DrivenParameters => ({
  g: 1,
  length: 1,
  damping: gamma,
  driveAmplitude: A,
  driveFrequency: omega
});

interface StrobeResult {
  strobes: Array<[number, number]>;
  final: [number, number];
}

/** Integrate and sample (θ, ω) at every drive period after the transient. */
function strobeAttractor(
  p: DrivenParameters,
  ic: [number, number],
  transient: number,
  samples: number,
  dt0 = DT
): StrobeResult {
  const period = (2 * Math.PI) / p.driveFrequency;
  const steps = Math.max(1, Math.round(period / dt0));
  const dt = period / steps;
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
  /** Drive frequency of this measurement (the main grid uses ω = 2/3). */
  omega: number;
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

function measureOnset(gamma: number, dt0 = DT, omega: number = OMEGA): OnsetMeasurement {
  const Ac = melnikovCriticalAmplitude(params(gamma, 0, omega));
  const cap = Math.max(1.8 * Ac, 1.35);
  const result: OnsetMeasurement = {
    gamma,
    omega,
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
    const r = strobeAttractor(params(gamma, A, omega), ic, 300, 16, dt0);
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
    const r = strobeAttractor(params(gamma, mid, omega), icBisect, 600, 16, dt0);
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
    const orbit = drivenPeriodicOrbit(params(gamma, A, omega), guess, { dt: dt0, tolerance: 1e-10 });
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
    const r = strobeAttractor(params(gamma, A, omega), [0.1, 0], 300, 700, dt0);
    const series = r.strobes.map(([theta]) => Math.cos(theta));
    return zeroOneTest(series, { seed: 12345 }).K;
  };
  result.K_below = kAt(0.97 * onset);
  result.K_above = kAt(1.08 * onset);
  return result;
}

/*
 * ---- Duffing double-well extension -----------------------------------------
 * Same gap-map question for the second canonical system (x'' = −δx' + x − x³
 * + Γcos(ωt), i.e. α = −1, β = 1): closed-form Melnikov Γ_c(δ) vs the measured
 * loss of period-1 stability of the confined single-well attractor. The
 * measurement reuses the strobe/march/bisection protocol; there is no Newton
 * Floquet refinement for the Duffing flow yet, so the onset is reported as a
 * bisection bracket (midpoint ± half-width), honestly wider than the
 * pendulum's ρ = −1 interpolation.
 */

const DUFFING_ALPHA = -1;
const DUFFING_BETA = 1;
const DUFFING_OMEGA = 1;

const duffingParams = (delta: number, Gamma: number): DuffingParameters => ({
  damping: delta,
  linearStiffness: DUFFING_ALPHA,
  cubicStiffness: DUFFING_BETA,
  driveAmplitude: Gamma,
  driveFrequency: DUFFING_OMEGA
});

/** Integrate and sample (x, v) at every drive period after the transient. */
function strobeDuffing(
  p: DuffingParameters,
  ic: [number, number],
  transient: number,
  samples: number,
  dt0 = DT
): StrobeResult {
  const period = (2 * Math.PI) / p.driveFrequency;
  const steps = Math.max(1, Math.round(period / dt0));
  const dt = period / steps;
  const cur = new Float64Array([ic[0], ic[1], 0]);
  const nxt = new Float64Array(3);
  const rhs: Derivative = (s, o) => {
    rhsDuffing(s, p, o);
  };
  const out: Array<[number, number]> = [];
  for (let period_ = 0; period_ < transient + samples; period_ += 1) {
    for (let s = 0; s < steps; s += 1) {
      rk4Step(cur, dt, rhs, nxt);
      cur.set(nxt);
    }
    cur[2] = (cur[2] ?? 0) % (2 * Math.PI);
    if (period_ >= transient) out.push([cur[0] ?? 0, cur[1] ?? 0]);
  }
  return { strobes: out, final: [cur[0] ?? 0, cur[1] ?? 0] };
}

/** Period-1 detector in the (x, v) strobe plane (no winding to worry about). */
function isPeriod1Duffing(points: Array<[number, number]>): boolean {
  let d1 = 0;
  for (let i = points.length - 12; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    d1 = Math.max(d1, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return d1 < 2e-3;
}

interface DuffingOnsetRow {
  delta: number;
  /** Closed-form Melnikov critical drive Γ_c(δ). */
  Gc: number;
  /** Bisection bracket on the loss of period-1 stability, or null if none found below the cap. */
  bracket: [number, number] | null;
  /** Onset estimate: bracket midpoint. */
  Gpd: number | null;
  /** Half-width of the bracket (the quoted uncertainty). */
  uncertainty: number | null;
  ratio: number | null;
  K_below: number | null;
  K_above: number | null;
  marchCap: number;
}

function measureDuffingOnset(delta: number, dt0 = DT): DuffingOnsetRow {
  const Gc = melnikovCriticalAmplitudeDuffing(duffingParams(delta, 0));
  const cap = Math.max(2.6 * Gc, 0.45);
  const row: DuffingOnsetRow = {
    delta,
    Gc,
    bracket: null,
    Gpd: null,
    uncertainty: null,
    ratio: null,
    K_below: null,
    K_above: null,
    marchCap: cap
  };

  // Warm-started march from inside the +x well (x* = √(−α/β) = 1).
  let ic: [number, number] = [1, 0];
  let lastP1 = Number.NaN;
  let firstLoss = Number.NaN;
  const coarse = 0.02 * Gc;
  for (let G = 0.9 * Gc; G <= cap; G += coarse) {
    const r = strobeDuffing(duffingParams(delta, G), ic, 300, 16, dt0);
    ic = r.final;
    if (isPeriod1Duffing(r.strobes)) {
      lastP1 = G;
    } else if (Number.isFinite(lastP1)) {
      firstLoss = G;
      break;
    }
  }
  if (!Number.isFinite(firstLoss)) return row;

  let a = lastP1;
  let b = firstLoss;
  let icBisect = ic;
  for (let i = 0; i < 16; i += 1) {
    const mid = (a + b) / 2;
    const r = strobeDuffing(duffingParams(delta, mid), icBisect, 600, 16, dt0);
    if (isPeriod1Duffing(r.strobes)) {
      a = mid;
      icBisect = r.final;
    } else {
      b = mid;
    }
  }
  row.bracket = [a, b];
  row.Gpd = (a + b) / 2;
  row.uncertainty = (b - a) / 2;
  row.ratio = row.Gpd / Gc;

  const kAt = (G: number): number => {
    const r = strobeDuffing(duffingParams(delta, G), [1, 0], 300, 700, dt0);
    const series = r.strobes.map(([x]) => x);
    return zeroOneTest(series, { seed: 12345 }).K;
  };
  row.K_below = kAt(0.97 * row.Gpd);
  row.K_above = kAt(1.08 * row.Gpd);
  return row;
}

/** Strobe bifurcation diagram data: A vs θ strobe points (γ fixed). */
function bifurcationDiagram(
  gamma: number,
  from: number,
  to: number,
  steps: number
): Array<{ A: number; thetas: number[] }> {
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

// Smoke mode for the extension lanes (frequency scan + Duffing): one point
// each, no main grid, writes reports/paper-study-probe.json only. Used to
// validate the added measurement paths cheaply before a full ~30 min study.
const QUICK_PROBE = process.argv.includes('--quick-probe');

async function main(): Promise<void> {
  if (QUICK_PROBE) {
    const t0 = Date.now();
    const scan = measureOnset(0.5, DT, 0.85);
    console.log(
      `probe ω=0.85 γ=0.50  A_c=${scan.Ac.toFixed(5)}  ` +
        (scan.Apd !== null ? `A_PD=${scan.Apd.toFixed(6)}  ratio=${scan.ratio!.toFixed(4)}` : `loss=${scan.lossType}`)
    );
    const duffing = measureDuffingOnset(0.25);
    console.log(
      `probe Duffing δ=0.25  Γ_c=${duffing.Gc.toFixed(5)}  ` +
        (duffing.Gpd !== null
          ? `Γ_PD=${duffing.Gpd.toFixed(5)}±${duffing.uncertainty!.toExponential(1)}  ratio=${duffing.ratio!.toFixed(4)}  K=(${duffing.K_below?.toFixed(2)}, ${duffing.K_above?.toFixed(2)})`
          : `no loss below Γ=${duffing.marchCap.toFixed(3)}`)
    );
    await mkdir('reports', { recursive: true });
    await writeFile(
      'reports/paper-study-probe.json',
      JSON.stringify(
        {
          schemaVersion: 'paper-study-probe/v1',
          generatedAt: new Date().toISOString(),
          scan,
          duffing,
          runtimeSeconds: (Date.now() - t0) / 1000
        },
        null,
        1
      )
    );
    console.log(`probe complete (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return;
  }

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
          : `loss=${m.lossType}` +
            (m.attractorBracket
              ? ` bracket=[${m.attractorBracket[0].toFixed(4)},${m.attractorBracket[1].toFixed(4)}] ρ=[${m.rhoBelow?.toFixed(3)},${m.rhoAbove?.toFixed(3)}]`
              : ''))
    );
  }

  // dt-sensitivity of the headline measurement (γ = 0.5).
  console.log('dt-sensitivity check at γ = 0.5 (dt = 0.0025)…');
  const fine = measureOnset(0.5, 0.0025);
  const coarse05 = measurements.find((m) => m.gamma === 0.5)!;
  const dtSensitivity = fine.Apd !== null && coarse05.Apd !== null ? Math.abs(fine.Apd - coarse05.Apd) : null;
  console.log(
    `  A_PD(dt=0.005)=${coarse05.Apd?.toFixed(6)}  A_PD(dt=0.0025)=${fine.Apd?.toFixed(6)}  |Δ|=${dtSensitivity?.toExponential(2)}`
  );

  // Strobe bifurcation diagram at γ = 0.5 (the classic picture).
  console.log('bifurcation diagram at γ = 0.5…');
  const diagram = bifurcationDiagram(0.5, 1.0, 1.5, 220);

  // Frequency scan: does the gap-map shape survive away from ω = 2/3?
  const scanGammas = [0.2, 0.35, 0.5, 0.65, 0.8];
  const scanOmegas = [0.5, 0.85];
  const frequencyScan: Array<{ omega: number; measurements: OnsetMeasurement[] }> = [];
  for (const omega of scanOmegas) {
    const rows: OnsetMeasurement[] = [];
    for (const gamma of scanGammas) {
      const m = measureOnset(gamma, DT, omega);
      rows.push(m);
      console.log(
        `ω=${omega.toFixed(2)} γ=${gamma.toFixed(2)}  A_c=${m.Ac.toFixed(5)}  ` +
          (m.Apd !== null ? `A_PD=${m.Apd.toFixed(6)}  ratio=${m.ratio!.toFixed(4)}` : `loss=${m.lossType}`)
      );
    }
    frequencyScan.push({ omega, measurements: rows });
  }

  // Duffing double-well gap map (second system).
  console.log('Duffing double-well gap map (α = −1, β = 1, ω = 1)…');
  const duffingDeltas = [0.15, 0.2, 0.25, 0.3, 0.35];
  const duffingRows: DuffingOnsetRow[] = [];
  for (const delta of duffingDeltas) {
    const row = measureDuffingOnset(delta);
    duffingRows.push(row);
    console.log(
      `δ=${delta.toFixed(2)}  Γ_c=${row.Gc.toFixed(5)}  ` +
        (row.Gpd !== null
          ? `Γ_PD=${row.Gpd.toFixed(5)}±${row.uncertainty!.toExponential(1)}  ratio=${row.ratio!.toFixed(4)}  K=(${row.K_below?.toFixed(2)}, ${row.K_above?.toFixed(2)})`
          : `no loss below Γ=${row.marchCap.toFixed(3)}`)
    );
  }

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
          attractor:
            'strobe at drive period, warm-started march + bisection of the period-1 boundary (300–600 transient periods)',
          refinement:
            'Floquet multiplier of the Newton period-1 orbit seeded from the attractor; onset interpolated at ρ = −1',
          corroboration: '0–1 test (Gottwald–Melbourne) on cosθ strobe series, 700 samples, seed 12345',
          literatureAnchor: 'Baker & Gollub: A_PD ≈ 1.0663 at γ = 0.5, ω = 2/3'
        },
        measurements,
        dtSensitivity: {
          gamma: 0.5,
          dtFine: 0.0025,
          ApdFine: fine.Apd,
          ApdCoarse: coarse05.Apd,
          absDelta: dtSensitivity
        },
        bifurcationDiagram: { gamma: 0.5, rows: diagram },
        frequencyScan: {
          method:
            'Same warm-started march + bisection + attractor-seeded Floquet refinement as the main grid, at additional drive frequencies (reduced gamma grid).',
          scans: frequencyScan
        },
        duffingGapMap: {
          alpha: DUFFING_ALPHA,
          beta: DUFFING_BETA,
          omega: DUFFING_OMEGA,
          method:
            'Closed-form double-well Melnikov Gamma_c (verified against separatrix quadrature in tests/melnikov.test.ts) vs the marched/bisected loss of period-1 stability of the confined single-well attractor; no Newton-Floquet refinement for the Duffing flow yet, so the onset is a bisection bracket (midpoint +/- half-width). 0-1 test corroboration on the x strobe series (700 samples, seed 12345).',
          rows: duffingRows
        },
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
