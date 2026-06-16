import { TabController } from './TabController';
import { runLangevinEnsemble } from '../physics/stochastic';
import { fitDoublePendulum } from '../research/parameterEstimation';
import { fitPolynomialChaos } from '../research/surrogate';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import type { PendulumParameters } from '../types/domain';
import type { StateVector } from '../physics/types';

/** Yield so a "computing…" status paints before a blocking solve. */
const paintYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Research+ tab — surfaces three previously library/CLI-only research tools as
 * Lab UI: a stochastic (Langevin) ensemble, the inverse parameter-estimation
 * problem (`fitDoublePendulum`), and the polynomial-chaos surrogate
 * (`fitPolynomialChaos`) with its analytic Sobol decomposition. Each runs the
 * exact same library function the tests and CLI use.
 */
export class ResearchPlusTab extends TabController {
  /** Stochastic ensemble: additive angular-velocity noise on the double pendulum. */
  private runSde(): Promise<void> {
    return this.runExclusive(async () => {
      this.dom.setText('rpSdeStatus', 'running ensemble…');
      await paintYield();
      const params: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
      const sigma = 0.5;
      const result = runLangevinEnsemble({
        drift: (s, o) => {
          rhsDouble(s, params, 0.2, o);
        },
        initialState: [0.5, 0.3, 0, 0],
        diffusion: [0, 0, sigma, sigma],
        dt: 0.005,
        steps: 2000,
        realizations: 300,
        seed: 1,
        recordEvery: 100
      });
      this.drawVariance(result.times, result.variance.map((v) => v[0] ?? 0));
      const last = result.times.length - 1;
      this.dom.setText('rpSdeStatus', `σ=${sigma} · ${result.realizations} realisations · Var[θ₁](T)=${(result.variance[last]![0] ?? 0).toFixed(4)}`);
      this.dom.setText(
        'rpOut',
        `Stochastic ensemble (Euler–Maruyama, additive torque noise σ=${sigma}):\n` +
          result.times.map((t, k) => `t=${t.toFixed(2)}  Var[θ₁]=${(result.variance[k]![0] ?? 0).toExponential(3)}  E[θ₁]=${(result.mean[k]![0] ?? 0).toFixed(4)}`).join('\n')
      );
      this.badge('rpSdeStatus', 'validated', 'Langevin ensemble (additive noise) — mean/variance via Welford, the same runLangevinEnsemble validated against Brownian/OU/GBM closed forms.');
    }, 'rpSdeStatus');
  }

  /** Inverse problem: recover g from a synthetic angle trajectory. */
  private runFit(): Promise<void> {
    return this.runExclusive(async () => {
      this.dom.setText('rpFitStatus', 'fitting g…');
      await paintYield();
      const truth: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
      const initialState: [number, number, number, number] = [0.5, 0.3, 0, 0];
      const times = Array.from({ length: 40 }, (_, i) => i * 0.05); // 0 … 2 s
      const angles = this.syntheticAngles(truth, initialState, times);
      const fit = fitDoublePendulum(
        { times, angles },
        { initialState, base: { ...truth, g: 8 }, gamma: 0, estimate: ['g'], initialGuess: [8] }
      );
      const gHat = fit.estimated.g ?? NaN;
      const se = fit.standardErrors[0] ?? NaN;
      this.dom.setText('rpFitStatus', `ĝ = ${gHat.toFixed(4)} ± ${se.toExponential(2)} (truth 9.81)`);
      this.dom.setText(
        'rpOut',
        `Inverse problem — recover g from 40 synthetic (θ₁,θ₂) samples over 2 s:\n` +
          `  initial guess g₀ = 8.00\n` +
          `  estimate  ĝ = ${gHat.toFixed(6)}\n` +
          `  std error  σ_g = ${se.toExponential(3)}\n` +
          `  |ĝ − 9.81| = ${Math.abs(gHat - 9.81).toExponential(2)}\n` +
          `  iterations = ${fit.iterations}, dof = ${fit.degreesOfFreedom}, converged = ${fit.converged}`
      );
      this.badge('rpFitStatus', 'validated', 'Levenberg–Marquardt with the engine RHS in the fit loop; covariance s²(JᵀJ)⁻¹ standard errors. Short window keeps the chaotic forward map well-conditioned.');
    }, 'rpFitStatus');
  }

  /** PCE surrogate: analytic Sobol indices of a smooth additive test response. */
  private runPce(): Promise<void> {
    return this.runExclusive(async () => {
      this.dom.setText('rpPceStatus', 'fitting surrogate…');
      await paintYield();
      // f(x₁,x₂) = sin(x₁) + ½·x₂² on [−1,1]² — additive, so both inputs carry variance.
      const f = (x: readonly number[]): number => Math.sin(x[0]!) + 0.5 * x[1]! * x[1]!;
      const n = 9;
      const samples = [];
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const x1 = -1 + (2 * i) / (n - 1);
          const x2 = -1 + (2 * j) / (n - 1);
          samples.push({ inputs: [x1, x2], output: f([x1, x2]) });
        }
      }
      const model = fitPolynomialChaos(
        [{ name: 'x₁', min: -1, max: 1 }, { name: 'x₂', min: -1, max: 1 }],
        samples,
        { degree: 5 }
      );
      this.dom.setText('rpPceStatus', `S₁=${model.firstOrderSobol.map((s) => s.toFixed(3)).join(', ')} · R²=${model.rSquared.toFixed(5)}`);
      this.dom.setText(
        'rpOut',
        `Polynomial-chaos surrogate of f(x₁,x₂)=sin(x₁)+½x₂² (degree 5, ${samples.length} samples):\n` +
          `  E[f]   = ${model.mean.toFixed(5)}\n` +
          `  Var[f] = ${model.variance.toFixed(5)}\n` +
          `  first-order Sobol  S = [${model.firstOrderSobol.map((s) => s.toFixed(4)).join(', ')}]\n` +
          `  total-effect Sobol Sᵀ = [${model.totalSobol.map((s) => s.toFixed(4)).join(', ')}]\n` +
          `  ΣS = ${model.firstOrderSobol.reduce((a, b) => a + b, 0).toFixed(4)} (≈1 for additive f)\n` +
          `  R² = ${model.rSquared.toFixed(6)}, cond ≈ ${model.conditionEstimate.toExponential(2)}`
      );
      this.badge('rpPceStatus', 'validated', 'Total-degree Legendre PCE → analytic Sobol indices (independent-uniform measure). For additive f the first-order indices sum to ≈1.');
    }, 'rpPceStatus');
  }

  /** Synthetic (θ₁,θ₂) observations from known parameters (the inverse-problem ground truth). */
  private syntheticAngles(params: PendulumParameters, ic: readonly [number, number, number, number], times: readonly number[]): Array<[number, number]> {
    const state = Float64Array.from(ic) as StateVector;
    const out = new Float64Array(4) as StateVector;
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDouble(s, params, 0, o);
    };
    const dt = 2e-3;
    const angles: Array<[number, number]> = [];
    let t = 0;
    for (const target of times) {
      const span = target - t;
      if (span > 0) {
        const steps = Math.max(1, Math.ceil(span / dt - 1e-9));
        const h = span / steps;
        for (let k = 0; k < steps; k += 1) {
          rk4Step(state, h, rhs, out);
          state.set(out);
        }
        t = target;
      }
      angles.push([state[0]!, state[1]!]);
    }
    return angles;
  }

  /** Plot log₁₀ of a variance series against time on the SDE canvas. */
  private drawVariance(times: readonly number[], variance: readonly number[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('rpSdeCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, W, H);
    const logs = variance.map((v) => Math.log10(Math.max(v, 1e-12)));
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of logs) {
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    if (!(hi > lo)) hi = lo + 1;
    const tMax = times[times.length - 1] || 1;
    const sx = (t: number): number => (t / tMax) * (W - 40) + 30;
    const sy = (l: number): number => H - (((l - lo) / (hi - lo)) * (H - 30) + 15);
    ctx.strokeStyle = '#7fd4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    times.forEach((t, k) => {
      const x = sx(t);
      const y = sy(logs[k]!);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    for (let k = 0; k < times.length; k += 1) {
      ctx.beginPath();
      ctx.arc(sx(times[k]!), sy(logs[k]!), 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  protected bind(): void {
    this.dom.takeOver('rpSdeRun')?.addEventListener('click', () => void this.runSde());
    this.dom.takeOver('rpFitRun')?.addEventListener('click', () => void this.runFit());
    this.dom.takeOver('rpPceRun')?.addEventListener('click', () => void this.runPce());
  }
}
