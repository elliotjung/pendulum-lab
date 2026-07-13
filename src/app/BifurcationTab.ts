import { num } from './systemControls';
import { TabController } from './TabController';
import {
  poincareSection,
  continueDrivenPeriodicOrbit,
  drivenPeriodicOrbitN,
  switchSymmetryBreaking,
  continueNeimarkSackerTorus,
  type FloquetMultiplier,
  type PlanarMapSystem,
  type InvariantTorusPoint
} from '../chaos';
import { rhsDouble } from '../physics/double';
import { renderBifurcation, type BifurcationColumnData } from '../viz';
import type { PendulumParameters } from '../types/domain';
import { downloadDataUrl } from './labExport';

/** Format a (possibly complex) Floquet multiplier compactly. */
const fmtMultiplier = (m: FloquetMultiplier): string =>
  Math.abs(m.im) < 1e-9 ? m.re.toFixed(4) : `${m.re.toFixed(4)}${m.im >= 0 ? '+' : '−'}${Math.abs(m.im).toFixed(4)}i`;

/** Yield to the event loop so a "computing…" status paints before a blocking solve. */
const paintYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Modern port of the Bifurcation tab. It sweeps gravity g and records θ₂ at the
 * θ₁=0 (θ̇₁>0) Poincaré section for the double pendulum, building the classic
 * bifurcation picture. Columns are computed one parameter value at a time in
 * time-budgeted animation-loop chunks (responsive, cancellable, progress bar),
 * reusing the tested `poincareSection`, and rendered with `viz/renderBifurcation`.
 */

const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

export class BifurcationTab extends TabController {
  private gValues: number[] = [];
  private columns: BifurcationColumnData[] = [];
  private cursor = 0;
  private rafId: number | null = null;
  private params: PendulumParameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  private state0: number[] = [2, 2.5, 0, 0];
  private maxTime = 60;

  private start(): void {
    this.stop();
    this.params = { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: 9.81 };
    this.state0 = [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)];
    this.maxTime = num('bifT', 60);
    const gMin = num('bifGMin', 2);
    const gMax = num('bifGMax', 12);
    const steps = Math.max(20, Math.min(1000, Math.round(num('bifSteps', 400))));
    this.gValues = Array.from({ length: steps }, (_, i) => gMin + ((gMax - gMin) * i) / (steps - 1));
    this.columns = [];
    this.cursor = 0;
    const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.dom.setText('bifStatus', `sweeping g over ${steps}…`);
    this.rafId = requestAnimationFrame(() => this.chunk());
  }

  private columnFor(g: number): BifurcationColumnData {
    const params = { ...this.params, g };
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, params, 0, o);
    const section = poincareSection(this.state0, rhs, {
      section: (s) => Math.sin(0.5 * (s[0] ?? 0)), // zero at θ1 = 0 (mod 2π)
      direction: 'rising',
      dt: 0.005,
      maxTime: this.maxTime,
      transientCrossings: 20,
      maxPoints: 60
    });
    return { param: g, values: section.points.map((p) => wrapPi(p[1] ?? 0)) };
  }

  private chunk(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const deadline = performance.now() + 14;
    while (this.cursor < this.gValues.length && performance.now() < deadline) {
      this.columns.push(this.columnFor(this.gValues[this.cursor]!));
      this.cursor += 1;
    }
    renderBifurcation(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, this.columns, {
      xLabel: 'g (m/s²)',
      yLabel: 'θ₂ at section'
    });
    const progress = this.cursor / this.gValues.length;
    const bar = this.dom.el('bifProgress');
    if (bar) bar.style.width = `${(progress * 100).toFixed(1)}%`;
    if (this.cursor < this.gValues.length) {
      this.dom.setText('bifStatus', `${(progress * 100).toFixed(0)}%`);
      this.rafId = requestAnimationFrame(() => this.chunk());
    } else {
      this.dom.setText('bifStatus', `done · ${this.gValues.length} columns`);
      this.badge('bifStatus', 'finite-time-estimate', 'Bifurcation diagram: finite-transient section sampling.', {
        title: 'Bifurcation section sweep',
        source: 'Bifurcation tab → poincareSection + renderBifurcation',
        parameters: {
          columns: this.gValues.length,
          maxTime: this.maxTime,
          section: 'theta1=0 rising',
          transientCrossings: 20
        },
        uncertainty:
          'Finite transient and finite number of section crossings; refine g steps and max time before publication use.',
        externalValidation: 'Poincare event refinement is unit-tested against analytic-crossing fixtures.',
        reproduce: 'npm test -- tests/poincare-event-refinement.test.ts',
        caveat: 'A rendered bifurcation diagram is a diagnostic map, not a proof of an attractor classification.'
      });
      this.rafId = null;
    }
  }

  private stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * Trace the symmetric driven-pendulum period-1 branch up to the chosen drive
   * amplitude and report its Floquet multipliers and stability. Continuation
   * (warm-started from A = 0.7) keeps Newton on the symmetric oscillating branch
   * rather than jumping to a whirling solution.
   */
  private analyzeFloquet(): Promise<void> {
    return this.runExclusive(async () => {
      const targetA = num('bifDrA', 1.005);
      const gamma = num('bifDrGamma', 0.5);
      this.dom.setText('bifDrivenStatus', `tracing the branch to A=${targetA.toFixed(3)}…`);
      await paintYield();
      const base = { g: 1, length: 1, damping: gamma, driveAmplitude: 0.7, driveFrequency: 2 / 3 };
      const cont = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: 0.7,
        end: Math.max(targetA, 0.72),
        step: 0.02,
        dt: 0.004,
        tolerance: 1e-10
      });
      const point = [...cont.branch].reverse().find((p) => p.converged);
      if (!point) {
        this.dom.setText('bifDrivenStatus', 'branch tracing did not converge');
        return;
      }
      this.dom.setText(
        'bifDrivenStatus',
        `A≈${point.parameter.toFixed(3)} · ${point.stable ? 'stable' : 'unstable'} · max|ρ|=${point.maxModulus.toFixed(4)}`
      );
      this.dom.setText(
        'bifDrivenOut',
        `orbit (θ,ω) = (${wrapPi(point.orbit[0]).toFixed(4)}, ${point.orbit[1].toFixed(4)})\n` +
          `Floquet ρ = ${fmtMultiplier(point.multipliers[0]!)}, ${fmtMultiplier(point.multipliers[1]!)}`
      );
      this.badge(
        'bifDrivenStatus',
        'validated',
        'Floquet multipliers (monodromy eigenvalues) of the driven period-1 orbit, branch-traced from A=0.7.',
        {
          title: 'Driven period-1 Floquet multipliers',
          source: 'Bifurcation tab → continueDrivenPeriodicOrbit',
          parameters: { A: point.parameter.toFixed(6), gamma, driveFrequency: '2/3', dt: 0.004, tolerance: '1e-10' },
          uncertainty:
            'Continuation tolerance controls the fixed-point residual; refine dt/tolerance to quote more digits.',
          externalValidation:
            'Floquet pipeline is pinned on linear oscillator anchors and the Baker-Gollub period-doubling onset.',
          reproduce: 'npm test -- tests/floquet.test.ts tests/continuation.test.ts tests/literature-anchors.test.ts',
          caveat: 'Branch-traced from A=0.7; multistability can place a direct simulation on a different basin.',
          artifact: 'reports/literature-anchors.json'
        }
      );
    }, 'bifDrivenStatus');
  }

  /**
   * Locate the symmetry-breaking pitchfork (the first real +1 crossing of the
   * symmetric branch) and follow the two mirror-image asymmetric orbits born
   * there. Reports the pair and the midpoint Z₂ residual that confirms it.
   */
  private findPitchfork(): Promise<void> {
    return this.runExclusive(async () => {
      const gamma = num('bifDrGamma', 0.5);
      this.dom.setText('bifDrivenStatus', 'continuing to the +1 crossing…');
      await paintYield();
      const base = { g: 1, length: 1, damping: gamma, driveAmplitude: 0.7, driveFrequency: 2 / 3 };
      const cont = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: 0.7,
        end: 1.06,
        step: 0.005,
        dt: 0.004,
        tolerance: 1e-11
      });
      if (!cont.bifurcation) {
        this.dom.setText('bifDrivenStatus', 'no bifurcation found in A ∈ [0.7, 1.06]');
        return;
      }
      const critA = cont.bifurcation.parameter;
      const lastStable = cont.branch.filter((p) => p.parameter < critA).pop();
      const params = { ...base, driveAmplitude: critA };
      const sym = drivenPeriodicOrbitN(params, lastStable ? lastStable.orbit : [0, 0], 1, {
        dt: 0.004,
        tolerance: 1e-11
      });
      const result = switchSymmetryBreaking(params, sym.orbit, { dt: 0.004, tolerance: 1e-11 });
      if (!result.switched) {
        this.dom.setText(
          'bifDrivenStatus',
          `${cont.bifurcation.type} at A=${critA.toFixed(4)} — no pitchfork pair found`
        );
        this.badge(
          'bifDrivenStatus',
          'caveat',
          'A +1 crossing was found but no stable straddling pair (sub-critical or not a pitchfork here).',
          {
            title: 'Pitchfork branch switch',
            source: 'Bifurcation tab → switchSymmetryBreaking',
            parameters: { gamma, driveFrequency: '2/3', criticalA: critA.toFixed(6) },
            uncertainty: 'Newton switch failed to locate a separated stable pair at the chosen settings.',
            externalValidation:
              'Branch switching logic is tested on period-doubling, pitchfork, and transcritical normal forms.',
            reproduce: 'npm test -- tests/branch-switching.test.ts',
            caveat: 'The +1 crossing may be subcritical or not a pitchfork for this branch.'
          }
        );
        return;
      }
      const [branchA, branchB] = result.branches;
      this.dom.setText(
        'bifDrivenStatus',
        `pitchfork at A=${critA.toFixed(4)} · 2 stable branches · sep=${result.separation.toFixed(3)}`
      );
      this.dom.setText(
        'bifDrivenOut',
        `symmetric (θ,ω) = (${wrapPi(sym.orbit[0]).toFixed(4)}, ${sym.orbit[1].toFixed(4)}) [unstable]\n` +
          `branch A = (${wrapPi(branchA.orbit[0]).toFixed(4)}, ${branchA.orbit[1].toFixed(4)})\n` +
          `branch B = (${wrapPi(branchB.orbit[0]).toFixed(4)}, ${branchB.orbit[1].toFixed(4)})\n` +
          `midpoint Z₂ residual = ${result.pitchforkResidual.toExponential(2)}`
      );
      this.badge(
        'bifDrivenStatus',
        'validated',
        'Symmetry-breaking pitchfork: two stable mirror-image period-1 orbits straddling the symmetric one (midpoint residual confirms Z₂).',
        {
          title: 'Symmetry-breaking pitchfork switch',
          source: 'Bifurcation tab → switchSymmetryBreaking',
          parameters: {
            gamma,
            driveFrequency: '2/3',
            criticalA: critA.toFixed(6),
            separation: result.separation.toFixed(6),
            residual: result.pitchforkResidual.toExponential(3)
          },
          uncertainty:
            'Reported residual is the midpoint Z2 symmetry check; refine dt/tolerance for tighter branch coordinates.',
          externalValidation:
            'Branch-switching tests reject fallback onto the parent branch and verify normal-form switches.',
          reproduce: 'npm test -- tests/branch-switching.test.ts',
          caveat: 'This follows the symmetric branch near the detected +1 crossing; other basins can coexist.'
        }
      );
    }, 'bifDrivenStatus');
  }

  /**
   * Continue the Neimark–Sacker invariant circle of the textbook delayed-logistic
   * map (x, y) ↦ (a·x·(1 − y), x) from a = 2.05 toward the onset a = 2, and draw
   * the family of closed curves shrinking onto the fixed point — the library-only
   * `continueNeimarkSackerTorus` surfaced as a tab, the way Floquet/pitchfork are.
   */
  private continueTorus(): Promise<void> {
    return this.runExclusive(async () => {
      this.dom.setText('bifTorusStatus', 'continuing the invariant circle…');
      await paintYield();
      const system: PlanarMapSystem = {
        map: (s, a, out) => {
          out[0] = a * s[0]! * (1 - s[1]!);
          out[1] = s[0]!;
        },
        center: (a) => {
          const x = (a - 1) / a;
          return [x, x];
        }
      };
      const cont = continueNeimarkSackerTorus(system, {
        start: 2.05,
        end: 2.01,
        step: 0.01,
        initialAmplitude: 0.24,
        collocation: 31,
        tolerance: 1e-10,
        maxIterations: 40
      });
      const converged = cont.points.filter((p) => p.converged);
      this.drawTorusFamily(converged);
      const last = converged[converged.length - 1];
      if (!last) {
        this.dom.setText('bifTorusStatus', 'continuation did not converge');
        return;
      }
      this.dom.setText(
        'bifTorusStatus',
        `${converged.length} circles · ρ→${last.rotationNumber.toFixed(4)} (1/6≈0.1667)`
      );
      this.dom.setText(
        'bifTorusOut',
        cont.points
          .map(
            (p) =>
              `a=${p.parameter.toFixed(2)}  ρ=${p.rotationNumber.toFixed(5)}  amp=${p.amplitude.toFixed(4)}  resid=${p.invarianceResidual.toExponential(1)}${p.converged ? '' : '  (no conv)'}`
          )
          .join('\n')
      );
      this.badge(
        'bifTorusStatus',
        'validated',
        'Neimark–Sacker invariant circle by trigonometric collocation; ρ → 1/6 and the curve shrinks to the fixed point at the onset a = 2 (delayed-logistic anchor).',
        {
          title: 'Neimark-Sacker invariant circle',
          source: 'Bifurcation tab → continueNeimarkSackerTorus',
          parameters: {
            start: 2.05,
            end: 2.01,
            step: 0.01,
            collocation: 31,
            tolerance: '1e-10',
            rotationNumber: last.rotationNumber.toFixed(6)
          },
          uncertainty:
            'Off-grid invariance residual is sampled between collocation nodes; spectral convergence is checked separately.',
          externalValidation:
            'Delayed-logistic onset and rotation number are cross-validated by direct winding and SciPy reference.',
          reproduce:
            'npm test -- tests/neimark-sacker-torus.test.ts tests/torus-analysis.test.ts && npm run validate:ns',
          caveat:
            'Smooth collocation is not valid inside phase-locked Arnold tongues; robust winding fallback reports those cases.',
          artifact: 'reports/ns-cross-validation.json'
        }
      );
    }, 'bifTorusStatus');
  }

  /** Draw the family of invariant circles (parameter-coloured) on the torus canvas. */
  private drawTorusFamily(points: InvariantTorusPoint[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('bifTorusCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, W, H);
    if (points.length === 0) return;
    // World bounds over all curves (plus their centres), with a margin.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      for (let j = 0; j < p.curve.length; j += 2) {
        minX = Math.min(minX, p.curve[j]!);
        maxX = Math.max(maxX, p.curve[j]!);
        minY = Math.min(minY, p.curve[j + 1]!);
        maxY = Math.max(maxY, p.curve[j + 1]!);
      }
    }
    const pad = 0.12 * Math.max(maxX - minX, maxY - minY, 1e-6);
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    const sx = (x: number): number => ((x - minX) / (maxX - minX)) * (W - 20) + 10;
    const sy = (y: number): number => H - (((y - minY) / (maxY - minY)) * (H - 20) + 10);
    points.forEach((p, idx) => {
      const t = points.length > 1 ? idx / (points.length - 1) : 0;
      // a = 2.05 (t=0, outer) cyan → a = 2.01 (t=1, inner) magenta.
      const r = Math.round(80 + 175 * t);
      const g = Math.round(220 - 140 * t);
      const b = 230;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const m = p.curve.length / 2;
      for (let j = 0; j <= m; j += 1) {
        const k = j % m;
        const px = sx(p.curve[2 * k]!);
        const py = sy(p.curve[2 * k + 1]!);
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // The enclosed fixed point.
      ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.beginPath();
      ctx.arc(sx(p.center[0]), sy(p.center[1]), 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  protected bind(): void {
    this.dom.takeOver('bifStart')?.addEventListener('click', () => this.start());
    this.dom.takeOver('bifStop')?.addEventListener('click', () => {
      this.stop();
      this.dom.setText('bifStatus', 'cancelled');
    });
    this.dom.takeOver('bifExport')?.addEventListener('click', () => {
      const canvas = this.dom.el<HTMLCanvasElement>('bifCanvas');
      if (canvas) downloadDataUrl('pendulum_bifurcation.png', canvas.toDataURL('image/png'));
    });
    this.dom.takeOver('bifFloquet')?.addEventListener('click', () => void this.analyzeFloquet());
    this.dom.takeOver('bifPitchfork')?.addEventListener('click', () => void this.findPitchfork());
    this.dom.takeOver('bifTorus')?.addEventListener('click', () => void this.continueTorus());
  }
}
