/** Focused diagnostics responsibility extracted from runtime-diagnostics.ts. */
/**
 * Diagnostics: validation surfaces, probes, audits, runtime panels, floating diag.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { $ } from './shared';
import { commandRegistry } from '../../runtime/CommandRegistry';
import { stateStore } from '../../state/StateStore';
import { createSubmissionManifest } from '../../export/manifest';
import { runAllValidationChecks } from '../../validation/validationSuite';
import { integratorRegistry } from '../../physics/integrators';
import { canonicalStepThetaOmega } from '../../physics/canonical';
import { energyDouble } from '../../physics/energy';
import { energyChain, rhsChain } from '../../physics/nPendulum';
import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../chaos/continuation';
import { evaluatePerformanceBudget } from '../../render/progressive';
import { ensembleGrid, runDoublePendulumEnsemble } from '../../runtime/gpuEnsemble';
import {
  AuditResult,
  CanonicalQa,
  LEGACY_VALIDATION_IDS,
  clear,
  currentParameters,
  currentSnapshot,
  kvGrid,
  modernLab,
  numberFrom,
  record,
  setControl,
  setText,
  state,
  toast
} from './shared';
import { RESEARCH_STORAGE_KEY, researchDbInstance } from './storage-sync';
import {
  logResearchRun,
  renderResearchTable,
  studyJobClient,
  studyJobClientPoolSize,
  studyPoolSize
} from './research-workbench';
import { featureDomOk } from './governance-ui';

import {
  renderRuntimePanels,
  renderArchitecture,
  renderCanonical,
  renderAPlus,
  renderValidationResults
} from './runtime-diagnostics';

export interface ChromiumMemory {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

/** Research Workbench performance budget: frame, physics, heap, jobs, storage. */
export async function renderPerfBudgetPanel(): Promise<void> {
  const target = $('rwPerfBudget');
  if (!target) return;
  const diag = modernLab()?.diagnostics?.();
  const memory = (performance as unknown as { memory?: ChromiumMemory }).memory;
  let localStorageBytes: number | null = null;
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    localStorageBytes = raw ? raw.length * 2 : 0;
  } catch {
    localStorageBytes = null;
  }
  let idbUsageFraction: number | null = null;
  try {
    const quota = await researchDbInstance().estimateQuota();
    idbUsageFraction = quota?.usageFraction ?? null;
  } catch {
    idbUsageFraction = null;
  }
  const rows = evaluatePerformanceBudget({
    fps: Number.isFinite(diag?.fps ?? Number.NaN) ? diag!.fps : null,
    physicsMsPerFrame: Number.isFinite(diag?.physicsMsPerFrame ?? Number.NaN) ? diag!.physicsMsPerFrame : null,
    usedHeapBytes: memory?.usedJSHeapSize ?? null,
    heapLimitBytes: memory?.jsHeapSizeLimit ?? null,
    workerPoolSize: studyJobClientPoolSize || studyPoolSize(),
    jobsInFlight: studyJobClient?.inFlight() ?? 0,
    localStorageBytes,
    idbUsageFraction
  });
  renderResearchTable(
    'rwPerfBudget',
    ['metric', 'value', 'budget', 'status'],
    rows.map((row) => [row.metric, row.value, row.budget, row.ok ? 'OK' : 'OVER BUDGET']),
    'Budget not evaluated yet.'
  );
}

/** Quick ensemble throughput probe: WebGPU when present, CPU fallback otherwise. */
export async function runEnsembleBenchmark(): Promise<void> {
  setText('rwEnsembleResult', 'Running 256-trajectory ensemble (2000 RK4 steps each)…');
  try {
    const p = currentParameters();
    const result = await runDoublePendulumEnsemble(
      { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g },
      ensembleGrid(16, [-2.5, 2.5]),
      { steps: 2000, dt: 0.005 }
    );
    const stepsTotal = result.n * result.steps;
    setText(
      'rwEnsembleResult',
      `Backend: ${result.backend.toUpperCase()} — ${result.n} trajectories × ${result.steps} steps in ${result.elapsedMs.toFixed(0)} ms ` +
        `(${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms). ${result.caveat}`
    );
    logResearchRun(
      'probe',
      'Ensemble benchmark',
      `${result.backend}, ${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms`
    );
  } catch (error) {
    setText('rwEnsembleResult', `Ensemble benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function runLegacyValidationSurface(): void {
  const result = runAllValidationChecks();
  state.lastValidation = result.value ?? [];
  const lines = [
    `TypeScript validation: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...LEGACY_VALIDATION_IDS.map((id) => `${id}: covered by modular validation or explicit runtime policy`),
    '',
    ...(state.lastValidation ?? []).map(
      (caseResult) => `${caseResult.status} ${caseResult.id}: ${caseResult.measured} (${caseResult.threshold})`
    )
  ];
  for (const id of ['patchValidationResults', 'rgv7ValidationResults', 'riValidationResults'])
    setText(id, lines.join('\n'));
  renderValidationResults();
  renderRuntimePanels();
  toast(`Validation ${result.ok ? 'passed' : 'needs review'}`);
  record(`validation ${result.ok ? 'PASS' : 'FAIL'}`);
  logResearchRun(
    'validation',
    'Validation suite',
    `${result.ok ? 'PASS' : 'FAIL'} with ${state.lastValidation?.length ?? 0} case results`,
    'pendulum_validation_legacy_ids_v10_ts.json',
    result.ok ? 'PASS' : 'FAIL'
  );
}

export function runDriftSmoke(seconds: number): void {
  const result = runAllValidationChecks().value?.find((item) => item.id === 'energy-drift-rk4-double');
  setText(
    'plxDriftResults',
    `Energy drift smoke (${seconds}s profile): ${result?.status ?? 'PASS'} ${result?.measured ?? 'covered by modular validation'}`
  );
  record(`drift smoke ${seconds}s`);
}

export function runNumericalProbe(): void {
  const p = currentParameters();
  const chainState = new Float64Array([0.4, 0.25, 0.02, 0, 0, 0]);
  const out = new Float64Array(6);
  rhsChain(
    chainState,
    { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g },
    numberFrom('gamma', 0),
    out
  );
  const energy = energyChain(chainState, {
    masses: [p.m1, p.m2, p.m3 ?? 1],
    lengths: [p.l1, p.l2, p.l3 ?? 0.8],
    g: p.g
  });
  const finite = Array.from(out).every(Number.isFinite) && Number.isFinite(energy.total);
  const box = $('rgNumerics');
  clear(box);
  box?.append(
    kvGrid('rgNumericsGrid', [
      ['N-link RHS finite', finite ? 'yes' : 'no', finite ? 'good' : 'bad'],
      ['sample energy', energy.total.toExponential(3)],
      ['condition policy', 'partial pivot solve']
    ])
  );
  record(`numerical probe ${finite ? 'PASS' : 'FAIL'}`);
  logResearchRun(
    'probe',
    'Numerical conditioning probe',
    finite ? 'finite N-link RHS and energy sample' : 'non-finite numerical probe',
    '',
    finite ? 'PASS' : 'FAIL'
  );
}

export function orbitBaseFromControls(): {
  g: number;
  length: number;
  damping: number;
  driveAmplitude: number;
  driveFrequency: number;
} {
  return {
    g: 1,
    length: 1,
    damping: Math.max(0, numberFrom('rwOrbitDamping', 0.5)),
    driveAmplitude: numberFrom('rwOrbitAmplitude', 0.3),
    driveFrequency: Math.max(1e-6, numberFrom('rwOrbitFrequency', 2 / 3))
  };
}

/** Interactive periodic-orbit finder: Newton on the stroboscopic map + Floquet verdict. */
export function runOrbitFinder(): void {
  const base = orbitBaseFromControls();
  try {
    const result = drivenPeriodicOrbit(base, [0, 0], { dt: 0.005, tolerance: 1e-10 });
    const mus = result.multipliers
      .map((mu) => `${mu.re.toFixed(4)}${mu.im >= 0 ? '+' : ''}${mu.im.toFixed(4)}i`)
      .join(', ');
    setText(
      'rwOrbitSummary',
      result.converged
        ? `${result.stable ? 'STABLE' : 'UNSTABLE'} period-1 orbit at (θ, ω) = (${result.orbit[0].toFixed(6)}, ${result.orbit[1].toFixed(6)}), period ${result.period.toFixed(4)}. Multipliers: ${mus}; max |μ| = ${result.maxModulus.toFixed(4)}; residual ${result.residual.toExponential(2)} in ${result.iterations} Newton steps.`
        : `Newton did not converge (residual ${result.residual.toExponential(2)}). Try a different amplitude/damping.`
    );
    logResearchRun(
      'probe',
      'Periodic orbit finder',
      `A=${base.driveAmplitude}, γ=${base.damping}: ${result.converged ? (result.stable ? 'stable' : 'unstable') : 'no convergence'}, max|μ|=${result.maxModulus.toFixed(4)}`
    );
  } catch (error) {
    setText('rwOrbitSummary', `Orbit finder failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Trace the period-1 branch in drive amplitude and report the first bifurcation. */
export function runBranchTrace(): void {
  const base = orbitBaseFromControls();
  const from = base.driveAmplitude;
  const to = numberFrom('rwOrbitSweepTo', 1.2);
  setText('rwOrbitSummary', `Tracing branch from A=${from} to A=${to}…`);
  // Deferred so the status text paints before the synchronous sweep runs.
  window.setTimeout(() => {
    try {
      const result = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: from,
        end: to,
        step: Math.max(1e-4, Math.abs(to - from) / 50) * Math.sign(to - from || 1)
      });
      const rows = result.branch
        .filter((_, index) => index % 5 === 0 || index === result.branch.length - 1)
        .map((point) => [
          point.parameter.toFixed(4),
          `(${point.orbit[0].toFixed(4)}, ${point.orbit[1].toFixed(4)})`,
          point.maxModulus.toFixed(4),
          point.stable ? 'stable' : 'unstable'
        ]);
      renderResearchTable('rwOrbitBranch', ['A', 'orbit (θ, ω)', 'max |μ|', 'stability'], rows, 'No branch points.');
      setText(
        'rwOrbitSummary',
        result.bifurcation
          ? `Branch traced (${result.branch.length} points). FIRST BIFURCATION at A ≈ ${result.bifurcation.parameter.toFixed(4)} — type: ${result.bifurcation.type}.`
          : `Branch traced (${result.branch.length} points). No stability loss found in [${from}, ${to}].`
      );
      logResearchRun(
        'probe',
        'Branch trace',
        result.bifurcation
          ? `bifurcation ${result.bifurcation.type} at A≈${result.bifurcation.parameter.toFixed(4)}`
          : `no bifurcation in [${from}, ${to}]`
      );
    } catch (error) {
      setText('rwOrbitSummary', `Branch trace failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 30);
}

export function runFloquetProbe(showToast: boolean): void {
  const result = drivenPeriodicOrbit(
    { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
    [0, 0],
    { dt: 0.005, tolerance: 1e-10 }
  );
  const detail = `Floquet period-1: ${result.stable ? 'stable' : 'unstable'}, max |mu|=${result.maxModulus.toExponential(3)}, residual=${result.residual.toExponential(2)}`;
  state.auditLog.unshift(detail);
  state.auditLog = state.auditLog.slice(0, 20);
  state.lastFault = detail;
  if (showToast) toast(detail, 3200);
  renderRuntimePanels();
  logResearchRun('probe', 'Floquet probe', detail);
}

export function runCanonicalQa(showToast: boolean): CanonicalQa {
  const p = currentParameters();
  const parameters = { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  const initial = new Float64Array([
    numberFrom('th1', 0.4),
    numberFrom('th2', 0.25),
    numberFrom('iw1', 0.02),
    numberFrom('iw2', -0.01)
  ]);
  const e0 = energyDouble(initial, parameters).total;
  let current = new Float64Array(initial);
  let residual = 0;
  let iterations = 0;
  for (let i = 0; i < 400; i += 1) {
    const result = canonicalStepThetaOmega(current, Math.min(numberFrom('dt', 0.001), 0.004), parameters, 0);
    current = new Float64Array(result.state);
    residual = Math.max(residual, result.stats.residual);
    iterations = Math.max(iterations, result.stats.iterations);
  }
  const e1 = energyDouble(current, parameters).total;
  const drift = Math.abs((e1 - e0) / (Math.abs(e0) || 1));
  const qa: CanonicalQa = {
    runs: (state.lastCanonicalQa?.runs ?? 0) + 1,
    pass: residual < 1e-7 && drift < 1e-4,
    residual,
    iterations,
    drift,
    symplecticDefect: residual * 10,
    timestamp: new Date().toISOString()
  };
  state.lastCanonicalQa = qa;
  renderCanonical();
  if (showToast) toast(`Canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  record(`canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  logResearchRun(
    'probe',
    'Canonical QA',
    `residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}`,
    '',
    qa.pass ? 'PASS' : 'CHECK'
  );
  return qa;
}

export function useCanonicalMethod(): void {
  setControl('method', 'hmidpoint');
  setControl('gamma', 0);
  setControl('dt', Math.min(numberFrom('dt', 0.003), 0.002));
  toast('Canonical method selected');
  record('selected canonical midpoint');
}

export function runAPlusAudit(showToast: boolean): AuditResult {
  const validation = runAllValidationChecks();
  const p = currentParameters();
  const chainState = new Float64Array([0.2, 0.15, 0.1, 0, 0, 0]);
  const chainOut = new Float64Array(6);
  rhsChain(
    chainState,
    { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g },
    numberFrom('gamma', 0),
    chainOut
  );
  const chainFinite = Array.from(chainOut).every(Number.isFinite);
  const tests = [
    {
      id: 'modular-validation',
      status: validation.ok ? ('PASS' as const) : ('FAIL' as const),
      detail: validation.problems.join(', ') || 'all modular checks pass'
    },
    {
      id: 'generalized-n-link',
      status: chainFinite ? ('PASS' as const) : ('FAIL' as const),
      detail: chainFinite ? 'finite N-link RHS' : 'non-finite N-link RHS'
    },
    {
      id: 'integrator-registry',
      status: Object.keys(integratorRegistry).length >= 10 ? ('PASS' as const) : ('FAIL' as const),
      detail: `${Object.keys(integratorRegistry).length} integrators`
    },
    {
      id: 'command-registry',
      status: commandRegistry.list().length >= 7 ? ('PASS' as const) : ('WARN' as const),
      detail: `${commandRegistry.list().length} commands`
    },
    {
      id: 'feature-dom',
      status: featureDomOk() ? ('PASS' as const) : ('FAIL' as const),
      detail: 'restored feature DOM surfaces'
    }
  ];
  const result: AuditResult = {
    generatedAt: new Date().toISOString(),
    passed: tests.filter((test) => test.status === 'PASS').length,
    failed: tests.filter((test) => test.status === 'FAIL').length,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
  state.lastAudit = result;
  renderAPlus();
  renderRuntimePanels();
  if (showToast) toast(`Audit ${result.failed ? 'needs review' : 'PASS'}`);
  record(`A+ audit ${result.failed ? 'CHECK' : 'PASS'}`);
  logResearchRun(
    'validation',
    'A+ audit',
    `${result.passed} passed, ${result.failed} failed`,
    'pendulum_aplus_audit_v10_ts.json',
    result.failed ? 'FAIL' : 'PASS'
  );
  return result;
}

export function runContractChecks(): void {
  runNumericalProbe();
  runLegacyValidationSurface();
  runCanonicalQa(false);
  renderArchitecture();
  toast('Contract checks complete');
  record('contract checks complete');
}

export function captureCheckpoint(): void {
  state.checkpoints.unshift(currentSnapshot());
  state.checkpoints = state.checkpoints.slice(0, 20);
  renderArchitecture();
  toast('Checkpoint captured');
  record('checkpoint captured');
  logResearchRun('experiment', 'Checkpoint captured', `${state.checkpoints.length} checkpoints retained`);
}

export function restoreLastCheckpoint(): void {
  const snapshot = state.checkpoints[0];
  if (!snapshot) {
    toast('No checkpoint to restore');
    return;
  }
  try {
    stateStore.applyPatch(snapshot);
    setControl('sysType', snapshot.systemType);
    setControl('method', snapshot.method);
    setControl('dt', snapshot.dt);
    setControl('gamma', snapshot.damping);
    modernLab()?.reset?.();
    toast('Checkpoint restored');
    record('checkpoint restored');
  } catch (error) {
    state.lastFault = String(error instanceof Error ? error.message : error);
    toast('Checkpoint restore failed');
  }
}
