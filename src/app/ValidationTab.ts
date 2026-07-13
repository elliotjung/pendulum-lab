import { TabController } from './TabController';
import { classifyValidation } from './resultBadges';
import {
  runAllValidationChecks,
  runReplayDeterminismCheck,
  runDtHalvingCheck,
  runEnergyDriftCheck,
  type ValidationCaseResult
} from '../validation/validationSuite';
import { runReferenceValidation } from '../validation/referenceSuite';
import { rhsDouble } from '../physics/double';
import { energyDouble } from '../physics/energy';
import { rk4Step } from '../physics/integrators';
import { clearChildren } from './domTakeover';
import energyBenchmarkReport from '../../reports/energy-benchmark.json';
import { normalizeEnergyBenchmark, renderEnergyBenchmarkCanvas, renderEnergyBenchmarkLegend } from './energyBenchmarkView';

/**
 * Modern port of the Validation tab. It takes over the tab's buttons (cloning to
 * strip the legacy handlers) and drives the tested `src/validation` suites:
 * the standard checks, the flagship integrator-order cross-validation, replay
 * determinism, and a long-run energy-drift stress test. Results render into the
 * existing `#validateResults` list and the `#testPassed`/`#testFailed`/`#testTime`
 * counters, using safe element-by-element DOM construction.
 */

const PALETTE = { pass: '#34e88a', fail: '#ff4565', meta: '#6b7686' };

/** A 200k-step RK4 energy-drift stress test (browser-sized stand-in for 10⁶). */
function runStressCheck(): ValidationCaseResult {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const state = new Float64Array([2.0, 2.5, 0, 0]);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
  const e0 = energyDouble(state, parameters).total;
  let maxDrift = 0;
  let blewUp = false;
  for (let i = 0; i < 200_000; i += 1) {
    rk4Step(state, 0.002, rhs, out);
    state.set(out);
    if (!Number.isFinite(state[0]!)) {
      blewUp = true;
      break;
    }
    if (i % 500 === 0) maxDrift = Math.max(maxDrift, Math.abs((energyDouble(state, parameters).total - e0) / e0));
  }
  return {
    id: 'stress-200k-rk4-double',
    status: !blewUp && maxDrift < 1e-2 ? 'PASS' : 'FAIL',
    measured: blewUp ? 'NaN (diverged)' : maxDrift.toExponential(3),
    threshold: '< 1e-2 over 2e5 steps'
  };
}

export class ValidationTab extends TabController {
  private renderEnergyBenchmark(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('energyBenchmarkCanvas');
    const legend = this.dom.el('energyBenchmarkLegend');
    if (!canvas || !legend) return;
    const model = normalizeEnergyBenchmark(energyBenchmarkReport);
    renderEnergyBenchmarkCanvas(canvas, model);
    renderEnergyBenchmarkLegend(legend, model);
    const date = model.generatedAt ? new Date(model.generatedAt).toLocaleDateString() : 'unknown date';
    this.dom.setText('energyBenchmarkStatus', `${model.series.length} committed benchmark:energy curves · ${model.steps.toLocaleString()} steps at dt=${model.dt} · generated ${date}.`);
  }

  private render(cases: ValidationCaseResult[], elapsedMs: number): void {
    const container = this.dom.el('validateResults');
    if (container) {
      clearChildren(container);
      for (const c of cases) container.appendChild(this.row(c));
    }
    const passed = cases.filter((c) => c.status === 'PASS').length;
    const failed = cases.length - passed;
    this.dom.setText('testPassed', String(passed));
    this.dom.setText('testFailed', String(failed));
    this.dom.setText('testTime', `${elapsedMs.toFixed(0)} ms`);
    this.badge(
      'testPassed',
      classifyValidation(passed, failed),
      failed > 0 ? `${failed} validation case(s) failed — see the table.` : `${passed} independent checks passed (analytic limits, reversibility, dt-halving, replay hash).`,
      {
        title: 'Validation suite summary',
        source: 'Validation tab → src/validation/*',
        parameters: { passed, failed, elapsedMs: elapsedMs.toFixed(0) },
        uncertainty: 'Each row reports its own measured value and threshold; this badge summarizes pass/fail status.',
        externalValidation: 'Includes analytic limits, replay determinism, dt-halving convergence, and reference-suite checks.',
        reproduce: 'npm run validate:reference && npm test -- tests/reference-validation.test.ts',
        caveat: failed > 0 ? 'At least one validation case failed; do not quote dependent outputs until the row is resolved.' : 'Browser stress check is shorter than the full headless validation ladder.',
        artifact: 'reports/validation-reference.json'
      }
    );
  }

  private row(c: ValidationCaseResult): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'padding:3px 0;border-bottom:1px solid #0a0e16;font-size:10.5px';
    const status = document.createElement('span');
    status.style.color = c.status === 'PASS' ? PALETTE.pass : PALETTE.fail;
    status.textContent = c.status;
    const title = document.createElement('strong');
    title.textContent = ` ${c.id} `;
    const meta = document.createElement('span');
    meta.style.color = PALETTE.meta;
    meta.textContent = `${c.measured}  (${c.threshold})`;
    row.append(status, title, meta);
    return row;
  }

  private timed(run: () => ValidationCaseResult[]): void {
    const t0 = performance.now();
    const cases = run();
    this.render(cases, performance.now() - t0);
  }

  /** Map the integrator-order cross-validation into displayable case rows. */
  private convergenceCases(): ValidationCaseResult[] {
    return runReferenceValidation().checks.map((c) => ({
      id: `order:${c.id}`,
      status: c.pass ? 'PASS' : 'FAIL',
      measured: `order≈${c.order.measured === null ? 'round-off' : c.order.measured.toFixed(2)}, drift ${c.energy.value.toExponential(1)}`,
      threshold: `order≥${(c.order.expected - 0.6).toFixed(1)}`
    }));
  }

  protected bind(): void {
    this.renderEnergyBenchmark();
    this.dom.takeOver('runValidation')?.addEventListener('click', () => this.timed(() => runAllValidationChecks().value ?? []));
    this.dom.takeOver('runDeterminism')?.addEventListener('click', () => this.timed(() => [runReplayDeterminismCheck()]));
    this.dom.takeOver('runConvergence')?.addEventListener('click', () => this.timed(() => this.convergenceCases()));
    this.dom.takeOver('runReplay')?.addEventListener('click', () => this.timed(() => [runReplayDeterminismCheck(), runEnergyDriftCheck()]));
    this.dom.takeOver('runStress')?.addEventListener('click', () => this.timed(() => [runStressCheck(), runDtHalvingCheck()]));
  }
}
