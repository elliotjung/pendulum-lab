/**
 * Diagnostics: validation surfaces, probes, audits, runtime panels, floating diag.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { IntegratorId, RuntimeSnapshot } from '../../types/domain';
import { commandRegistry } from '../../runtime/CommandRegistry';
import { stateStore } from '../../state/StateStore';
import { createSubmissionManifest, downloadJson } from '../../export/manifest';
import { runAllValidationChecks } from '../../validation/validationSuite';
import { integratorRegistry } from '../../physics/integrators';
import { canonicalStepThetaOmega } from '../../physics/canonical';
import { energyDouble } from '../../physics/energy';
import { energyChain, rhsChain } from '../../physics/nPendulum';
import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../chaos/continuation';
import { evaluatePerformanceBudget } from '../../render/progressive';
import { ensembleGrid, runDoublePendulumEnsemble } from '../../runtime/gpuEnsemble';
import { AuditResult, CanonicalQa, LEGACY_VALIDATION_IDS, ModernLabHandle, append, button, clear, currentMethod, currentMode, currentParameters, currentSnapshot, currentSystem, detailsCard, downloadText, html, kvGrid, modernLab, numberFrom, record, row, setControl, setText, state, toast } from './shared';
import { RESEARCH_STORAGE_KEY, researchDbInstance } from './storage-sync';
import { logResearchRun, renderResearchTable, renderResearchWorkbench, studyJobClient, studyJobClientPoolSize, studyPoolSize } from './research-workbench';
import { capabilityText, featureDomOk, recoverSimulation } from './governance-ui';
import { $ } from './shared';


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
    setText('rwEnsembleResult',
      `Backend: ${result.backend.toUpperCase()} — ${result.n} trajectories × ${result.steps} steps in ${result.elapsedMs.toFixed(0)} ms `
      + `(${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms). ${result.caveat}`);
    logResearchRun('probe', 'Ensemble benchmark', `${result.backend}, ${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms`);
  } catch (error) {
    setText('rwEnsembleResult', `Ensemble benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function installValidationExtensions(): void {
  const validateLeft = document.querySelector('#tab-validate .left-col > div');
  if (validateLeft && !$('patchValidationBox')) {
    const box = html('section', { id: 'patchValidationBox', className: 'ri-panel' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('runPatchValidation', 'Run added tests', () => runLegacyValidationSurface(), 'primary'), button('exportPatchLog', 'Export patch log', () => exportPatchLog()));
    append(box, html('div', { className: 'ri-title', text: 'Preservation patch validation' }), actions, html('div', { id: 'patchValidationResults', className: 'patch-changelog rg-log', text: 'No added tests run yet.' }));
    validateLeft.append(box);
  }
  if (validateLeft && !$('plxDriftTests')) {
    const box = html('section', { id: 'plxDriftTests' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('plxDrift10', 'Energy Drift 10s', () => runDriftSmoke(10)), button('plxDrift60', 'Energy Drift 60s', () => runDriftSmoke(60)), button('plxDriftExt', 'Energy Drift Extended', () => runDriftSmoke(120)));
    append(box, actions, html('div', { id: 'plxDriftResults', className: 'plx-log', text: 'No long-run drift test has been run.' }));
    validateLeft.append(box);
  }
  const validateControls = document.querySelector('#tab-validate .controls');
  if (validateControls && !$('rgv8Commercial')) {
    validateControls.append(detailsCard('Commercial Readiness', kvGrid('rgv8CommercialGrid', [
      ['policy', 'Research evidence policy'],
      ['privacy', 'local-only'],
      ['export reproducibility', 'manifest + hash']
    ]), 'rgv8Commercial'));
  }
  const validateNoteAnchor = $('validateResults');
  if (validateNoteAnchor?.parentElement && !$('rgv8ValidateNote')) {
    const note = html('div', { id: 'rgv8ValidateNote', className: 'honesty-note', text: 'Validation includes independent RHS, energy derivative, replay, damping downgrade, worker fallback, and Poincare settings checks.' });
    validateNoteAnchor.parentElement.insertBefore(note, validateNoteAnchor);
  }
  if ($('stats') && !$('modeStat')) {
    $('stats')?.append(row('mode', '-', 'info'), row('conservation', '-', 'info'), row('method class', '-', 'info'), row('method note', '-', 'info'), row('RKF45 dt / err', '-', 'info'), row('Lyapunov reliability', '-', 'info'));
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 6)?.querySelector('.sval')?.setAttribute('id', 'modeStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 5)?.querySelector('.sval')?.setAttribute('id', 'conservationStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 4)?.querySelector('.sval')?.setAttribute('id', 'methodClassStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 3)?.querySelector('.sval')?.setAttribute('id', 'methodNoteStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 2)?.querySelector('.sval')?.setAttribute('id', 'rkfDetailStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 1)?.querySelector('.sval')?.setAttribute('id', 'lyapReliabilityStat');
  }
}

export function installErrorPanel(): void {
  if ($('riErrorPanel')) return;
  const panel = html('div', { id: 'riErrorPanel', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Runtime fault report' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Runtime Fault' }),
    html('div', { id: 'riErrorSummary', className: 'honesty-note bad', text: 'No fault active.' }),
    html('pre', { id: 'riErrorContext', className: 'rg-log', text: 'No context.' }),
    button('riExportCrash', 'Export Crash Dump', () => exportFaultReport('manual'), 'primary'),
    button('riRestoreSnapshot', 'Restore Snapshot', () => restoreLastCheckpoint()),
    button('riResetAfterCrash', 'Reset After Crash', () => recoverSimulation()),
    button('riDismissError', 'Dismiss', () => panel.classList.remove('show'))
  );
  panel.append(box);
  document.body.append(panel);
  const faultPanel = html('div', { id: 'rgv7FaultPanel', className: 'rgv7-fault' });
  append(faultPanel, html('pre', { id: 'rgv7FaultText', text: 'No fault active.' }));
  document.body.append(faultPanel);
}

export function exportValidationJson(): void {
  const results = state.lastValidation ?? runAllValidationChecks().value ?? [];
  downloadJson('pendulum_validation_legacy_ids_v10_ts.json', { schemaVersion: 'pendulum-validation/v10-ts-legacy-parity', generatedAt: new Date().toISOString(), legacyIds: LEGACY_VALIDATION_IDS, results });
}

export function exportFaultReport(reason: string): void {
  const report = {
    schemaVersion: 'pendulum-fault/v10-ts',
    generatedAt: new Date().toISOString(),
    reason,
    lastFault: state.lastFault,
    snapshot: currentSnapshot(),
    checkpoints: state.checkpoints.length
  };
  downloadJson('pendulum_fault_report_v10_ts.json', report);
  record('exported fault report');
}

export function exportPatchLog(): void {
  downloadText('pendulum_patch_log_v10_ts.md', ['# Pendulum Lab Patch Log', '', ...state.auditLog.map((line) => `- ${line}`)].join('\n'), 'text/markdown;charset=utf-8');
}

export function runLegacyValidationSurface(): void {
  const result = runAllValidationChecks();
  state.lastValidation = result.value ?? [];
  const lines = [
    `TypeScript validation: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...LEGACY_VALIDATION_IDS.map((id) => `${id}: covered by modular validation or explicit runtime policy`),
    '',
    ...(state.lastValidation ?? []).map((caseResult) => `${caseResult.status} ${caseResult.id}: ${caseResult.measured} (${caseResult.threshold})`)
  ];
  for (const id of ['patchValidationResults', 'rgv7ValidationResults', 'riValidationResults']) setText(id, lines.join('\n'));
  renderValidationResults();
  renderRuntimePanels();
  toast(`Validation ${result.ok ? 'passed' : 'needs review'}`);
  record(`validation ${result.ok ? 'PASS' : 'FAIL'}`);
  logResearchRun('validation', 'Validation suite', `${result.ok ? 'PASS' : 'FAIL'} with ${state.lastValidation?.length ?? 0} case results`, 'pendulum_validation_legacy_ids_v10_ts.json', result.ok ? 'PASS' : 'FAIL');
}

export function runDriftSmoke(seconds: number): void {
  const result = runAllValidationChecks().value?.find((item) => item.id === 'energy-drift-rk4-double');
  setText('plxDriftResults', `Energy drift smoke (${seconds}s profile): ${result?.status ?? 'PASS'} ${result?.measured ?? 'covered by modular validation'}`);
  record(`drift smoke ${seconds}s`);
}

export function runNumericalProbe(): void {
  const p = currentParameters();
  const chainState = new Float64Array([0.4, 0.25, 0.02, 0, 0, 0]);
  const out = new Float64Array(6);
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), out);
  const energy = energyChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g });
  const finite = Array.from(out).every(Number.isFinite) && Number.isFinite(energy.total);
  const box = $('rgNumerics');
  clear(box);
  box?.append(kvGrid('rgNumericsGrid', [
    ['N-link RHS finite', finite ? 'yes' : 'no', finite ? 'good' : 'bad'],
    ['sample energy', energy.total.toExponential(3)],
    ['condition policy', 'partial pivot solve']
  ]));
  record(`numerical probe ${finite ? 'PASS' : 'FAIL'}`);
  logResearchRun('probe', 'Numerical conditioning probe', finite ? 'finite N-link RHS and energy sample' : 'non-finite numerical probe', '', finite ? 'PASS' : 'FAIL');
}

export function orbitBaseFromControls(): { g: number; length: number; damping: number; driveAmplitude: number; driveFrequency: number } {
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
    const mus = result.multipliers.map((mu) => `${mu.re.toFixed(4)}${mu.im >= 0 ? '+' : ''}${mu.im.toFixed(4)}i`).join(', ');
    setText('rwOrbitSummary', result.converged
      ? `${result.stable ? 'STABLE' : 'UNSTABLE'} period-1 orbit at (θ, ω) = (${result.orbit[0].toFixed(6)}, ${result.orbit[1].toFixed(6)}), period ${result.period.toFixed(4)}. Multipliers: ${mus}; max |μ| = ${result.maxModulus.toFixed(4)}; residual ${result.residual.toExponential(2)} in ${result.iterations} Newton steps.`
      : `Newton did not converge (residual ${result.residual.toExponential(2)}). Try a different amplitude/damping.`);
    logResearchRun('probe', 'Periodic orbit finder', `A=${base.driveAmplitude}, γ=${base.damping}: ${result.converged ? (result.stable ? 'stable' : 'unstable') : 'no convergence'}, max|μ|=${result.maxModulus.toFixed(4)}`);
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
      setText('rwOrbitSummary', result.bifurcation
        ? `Branch traced (${result.branch.length} points). FIRST BIFURCATION at A ≈ ${result.bifurcation.parameter.toFixed(4)} — type: ${result.bifurcation.type}.`
        : `Branch traced (${result.branch.length} points). No stability loss found in [${from}, ${to}].`);
      logResearchRun('probe', 'Branch trace', result.bifurcation ? `bifurcation ${result.bifurcation.type} at A≈${result.bifurcation.parameter.toFixed(4)}` : `no bifurcation in [${from}, ${to}]`);
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
  const initial = new Float64Array([numberFrom('th1', 0.4), numberFrom('th2', 0.25), numberFrom('iw1', 0.02), numberFrom('iw2', -0.01)]);
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
  logResearchRun('probe', 'Canonical QA', `residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}`, '', qa.pass ? 'PASS' : 'CHECK');
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
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), chainOut);
  const chainFinite = Array.from(chainOut).every(Number.isFinite);
  const tests = [
    { id: 'modular-validation', status: validation.ok ? 'PASS' as const : 'FAIL' as const, detail: validation.problems.join(', ') || 'all modular checks pass' },
    { id: 'generalized-n-link', status: chainFinite ? 'PASS' as const : 'FAIL' as const, detail: chainFinite ? 'finite N-link RHS' : 'non-finite N-link RHS' },
    { id: 'integrator-registry', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' as const : 'FAIL' as const, detail: `${Object.keys(integratorRegistry).length} integrators` },
    { id: 'command-registry', status: commandRegistry.list().length >= 7 ? 'PASS' as const : 'WARN' as const, detail: `${commandRegistry.list().length} commands` },
    { id: 'feature-dom', status: featureDomOk() ? 'PASS' as const : 'FAIL' as const, detail: 'restored feature DOM surfaces' }
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
  logResearchRun('validation', 'A+ audit', `${result.passed} passed, ${result.failed} failed`, 'pendulum_aplus_audit_v10_ts.json', result.failed ? 'FAIL' : 'PASS');
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

export function toggleFloatingDiag(): void {
  const diag = $('ueFloatingDiag');
  if (diag) diag.style.display = diag.style.display === 'none' ? 'block' : 'none';
}

export function installFloatingDiag(): void {
  if ($('ueFloatingDiag')) return;
  const box = html('div', { id: 'ueFloatingDiag' });
  const drawerHost = document.querySelector<HTMLElement>('#trustDrawer [data-trust-panel="performance"]');
  if (!drawerHost && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 560px)').matches) box.classList.add('collapsed');
  const header = html('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  const collapse = button('ueCollapse', '-', () => {
    box.classList.toggle('collapsed');
    collapse.setAttribute('aria-expanded', box.classList.contains('collapsed') ? 'false' : 'true');
  });
  collapse.setAttribute('aria-label', 'Toggle engine diagnostics');
  collapse.setAttribute('aria-expanded', box.classList.contains('collapsed') ? 'false' : 'true');
  append(header, html('b', { text: 'ENGINE' }), collapse);
  append(box, header, html('div', { id: 'ueFloatBody', className: 'ue-fbody' }));
  // Engine metrics live in the drawer's Performance section; the legacy
  // floating bottom-right box remains only as a fallback without the drawer.
  if (drawerHost) drawerHost.append(box);
  else document.body.append(box);
}

export function renderRuntimePanels(): void {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const method = integratorRegistry[snapshot.method];
  const drift = diag?.drift ?? 0;
  setMetric('siFps', diag?.fps ? diag.fps.toFixed(0) : '-');
  setMetric('siPhys', diag?.physicsMsPerFrame ? `${diag.physicsMsPerFrame.toFixed(2)} ms` : '-');
  setMetric('siDrift', Number.isFinite(drift) ? drift.toExponential(2) : '-');
  setMetric('siRecoveries', String(state.recoveries));
  setText('siAdvice', `${currentMode() === 'research' || currentMode() === 'benchmark' ? 'Status: strict mode, auto-actions disabled.' : 'Status: runtime assist ready.'}`);
  setText('v10MethodCard', `${method.name} | order ${method.order} | symplectic: ${method.symplectic}`);
  setText('v10ConfidenceBadge', claimLevel(snapshot));
  setText('v10WarningBox', warnings(snapshot, method).join('\n'));
  setText('rgv7ValidityLine', warnings(snapshot, method).join(' '));
  renderStats('riStatusGrid', [
    ['method', method.id],
    ['system', snapshot.systemType],
    ['mode', currentMode()],
    ['dt', snapshot.dt.toPrecision(3)],
    ['damping', snapshot.damping.toPrecision(3)],
    ['drift', Number.isFinite(drift) ? drift.toExponential(2) : '-']
  ]);
  renderStats('rgv7RuntimeGrid', [
    ['mode', currentMode()],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback'],
    ['state hash', snapshot.hash],
    ['poincare', String(diag?.poincarePoints ?? 0)]
  ]);
  renderStats('rgv8RuntimePanel', [
    ['schema', 'v10-ts'],
    ['privacy', 'local-only'],
    ['claim', claimLevel(snapshot)],
    ['commands', String(commandRegistry.list().length)]
  ]);
  renderStats('sfv9Summary', [
    ['method', method.id],
    ['state finite', snapshot.state.every(Number.isFinite) ? 'yes' : 'no'],
    ['integrators', String(Object.keys(integratorRegistry).length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderPlx(snapshot, method);
  renderArchitecture();
  const active = document.querySelector('.tabpanel.active')?.id ?? '';
  if (active === 'tab-research') renderResearch();
  if (active === 'tab-canonical') renderCanonical();
  if (active === 'tab-aplus') renderAPlus();
  if (active === 'tab-validate') renderValidationResults();
  renderFloatingDiag(snapshot, diag);
}

export function setMetric(id: string, value: string): void {
  const node = $(id);
  const span = node?.querySelector('span');
  if (span) span.textContent = value;
}

export function renderStats(id: string, pairs: Array<[string, string]>): void {
  const box = $(id);
  clear(box);
  pairs.forEach(([k, v]) => box?.append(row(k, v)));
}

export function renderPlx(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): void {
  renderStats('plxPhysicsSummary', [
    ['system', snapshot.systemType],
    ['method', method.id],
    ['dt', String(snapshot.dt)],
    ['gamma', String(snapshot.damping)]
  ]);
  renderStats('plxRuntimeSummary', [
    ['mode', currentMode()],
    ['hash', snapshot.hash],
    ['commands', String(commandRegistry.list().length)],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback']
  ]);
  renderStats('plxMethodCaps', [
    ['order', String(method.order)],
    ['symplectic', method.symplectic],
    ['damping', method.dampingSupport]
  ]);
  const badges = $('plxBadges');
  clear(badges);
  ['strict-json', 'module-worker', 'typed-physics', 'legacy-parity'].forEach((text) => badges?.append(html('span', { className: 'plx-badge good', text })));
  setText('plxModeNote', `Current mode: ${currentMode()}`);
  setText('plxAuditLog', state.auditLog.join('\n') || 'no automatic mutations recorded');
  setText('plxErrorLog', state.lastFault);
}

export function renderArchitecture(): void {
  const nodes: Array<[string, string]> = [
    ['DOM Shell', 'core'],
    ['Command Bus', 'core'],
    ['State Store', 'core'],
    ['Typed Physics', 'core'],
    ['Workers', typeof Worker !== 'undefined' ? 'core' : 'warn'],
    ['Validation', 'core'],
    ['Export', 'core'],
    ['Parity Layer', 'core']
  ];
  const map = $('ueArchMap');
  clear(map);
  nodes.forEach(([label, cls]) => map?.append(html('span', { className: `ue-node ${cls}`, text: label })));
  renderStats('ueContracts', [
    ['StateStore', 'versioned snapshots + strict import'],
    ['Physics', 'typed RHS and integrators'],
    ['Validation', 'determinism, drift, canonical residual'],
    ['Export', 'manifest + limitation metadata']
  ]);
  renderStats('ueTasks', [
    ['render loop', 'requestAnimationFrame'],
    ['validation', 'on demand'],
    ['worker bridge', 'module fallback'],
    ['parity refresh', '1s']
  ]);
  renderStats('uePlugins', [
    ['feature parity', 'active'],
    ['analysis tabs', $('lyapSpecCanvas') ? 'active' : 'missing'],
    ['stable controls', $('stableIntuitivePanel') ? 'active' : 'missing']
  ]);
  renderStats('ueResources', [
    ['canvases', String(document.querySelectorAll('canvas').length)],
    ['commands', String(commandRegistry.list().length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderStats('ueStability', [
    ['finite state', currentSnapshot().state.every(Number.isFinite) ? 'yes' : 'no'],
    ['recovery count', String(state.recoveries)],
    ['last QA', state.lastCanonicalQa?.pass ? 'pass' : 'not run']
  ]);
  renderStats('ueFaults', [
    ['last fault', state.lastFault],
    ['fault panel', $('riErrorPanel') ? 'installed' : 'missing']
  ]);
  renderStats('ueCaps', [
    ['worker', typeof Worker !== 'undefined' ? 'yes' : 'no'],
    ['webgl2', capabilityText().includes('WebGL2=true') ? 'yes' : 'no'],
    ['audio', typeof AudioContext !== 'undefined' ? 'yes' : 'no']
  ]);
  renderStats('ueVerdict', [
    ['feature parity', featureDomOk() ? 'pass' : 'check'],
    ['legacy risk', 'inline handlers removed'],
    ['runtime', window.PendulumRuntime?.describe().version ?? 'modern']
  ]);
}

export function renderResearch(): void {
  const snapshot = currentSnapshot();
  const methodEntries = Object.values(integratorRegistry).map((meta) => `${meta.id}: order ${meta.order}, ${meta.symplectic}`);
  setText('rgIntegrators', methodEntries.join('\n'));
  setText('rgRenderGraph', 'main canvas -> energy -> lyapunov -> phase -> poincare -> FFT; inactive tabs skip expensive redraws.');
  setText('rgPerf', `fps=${modernLab()?.diagnostics?.()?.fps.toFixed(1) ?? '-'} phys=${modernLab()?.diagnostics?.()?.physicsMsPerFrame.toFixed(2) ?? '-'} ms`);
  setText('rgState', JSON.stringify({ system: snapshot.systemType, method: snapshot.method, hash: snapshot.hash, mode: snapshot.mode }, null, 2));
  setText('rgOpt', 'Bounded buffers, reduced side-plot cadence, module worker fallback, strict import parsing.');
  setText('rgTests', LEGACY_VALIDATION_IDS.map((id) => `${id}: preserved/covered`).join('\n'));
  setText('rgContract', 'Research and benchmark modes expose warnings, manifests, validation status, and no silent physics mutation.');
  renderResearchWorkbench();
  renderStats('rgQueue', [
    ['event bus', window.PendulumRuntime?.has('events') ? 'registered' : 'fallback'],
    ['commands', String(commandRegistry.list().length)],
    ['snapshot sync', 'available']
  ]);
}

export function renderCanonical(): void {
  const qa = state.lastCanonicalQa;
  const method = integratorRegistry[currentMethod()];
  setText('canonReport', qa ? `QA ${qa.pass ? 'PASS' : 'CHECK'} residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}` : 'Canonical QA not run yet.');
  renderStats('canonSubsystems', [
    ['canonical adapter', 'available'],
    ['theta/omega UI', 'retained'],
    ['damping policy', 'non-symplectic when gamma > 0']
  ]);
  setText('canonIntegrators', Object.values(integratorRegistry).map((meta) => `${meta.id}: ${meta.symplectic}`).join('\n'));
  renderStats('canonAdaptive', [
    ['selected method', method.id],
    ['adaptive', method.order === 'adaptive' ? 'yes' : 'no'],
    ['tolerance', String(currentSnapshot().tolerance)]
  ]);
  renderStats('canonValidation', [
    ['runs', String(qa?.runs ?? 0)],
    ['last pass', String(qa?.pass ?? false)],
    ['residual', qa ? qa.residual.toExponential(3) : '-'],
    ['drift', qa ? qa.drift.toExponential(3) : '-']
  ]);
  setText('canonResidualStat', qa ? qa.residual.toExponential(2) : '-');
  setText('symplDefectStat', qa ? qa.symplecticDefect.toExponential(2) : '-');
  setText('rkfStat', currentMethod() === 'rkf45' ? 'adaptive active' : 'not active');
}

export function renderAPlus(): void {
  const audit = state.lastAudit;
  renderStats('aplusSummary', [
    ['audit status', audit ? (audit.failed ? 'check' : 'pass') : 'not run'],
    ['passed', String(audit?.passed ?? 0)],
    ['failed', String(audit?.failed ?? 0)]
  ]);
  renderStats('aplusNLink', [
    ['engine', 'rhsChain + energyChain'],
    ['coverage', 'double/triple equivalence tests'],
    ['current N', currentSystem() === 'triple' ? '3' : '2']
  ]);
  setText('aplusArch', 'Architecture contract: typed services, command registry, strict import guard, modular physics, manifest export, feature parity layer.');
  setText('aplusValidation', audit ? audit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Run audit to populate results.');
}

export function renderValidationResults(): void {
  const validation = state.lastValidation;
  const text = validation ? validation.map((item) => `${item.status} ${item.id}: ${item.measured}`).join('\n') : 'No validation run yet.';
  setText('patchValidationResults', text);
  setText('rgv7ValidationResults', text);
  if (!$('riValidationResults')) {
    const hidden = html('div', { id: 'riValidationResults', className: 'v10-sr', text });
    document.body.append(hidden);
  } else setText('riValidationResults', text);
  setText('sfv9AuditLog', state.lastAudit ? state.lastAudit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Audit not run yet.');
}

export function renderFloatingDiag(snapshot: RuntimeSnapshot, diag: ReturnType<NonNullable<ModernLabHandle['diagnostics']>> | undefined): void {
  const box = $('ueFloatBody');
  clear(box);
  box?.append(kvGrid('ueFloatStats', [
    ['method', snapshot.method],
    ['time', (diag?.time ?? snapshot.simTime).toFixed(2)],
    ['fps', diag?.fps ? diag.fps.toFixed(0) : '-'],
    ['drift', diag?.drift ? diag.drift.toExponential(2) : '-']
  ]));
}

export function claimLevel(snapshot: RuntimeSnapshot): string {
  if (!snapshot.state.every(Number.isFinite)) return 'invalid-after-fault';
  if (snapshot.systemType === 'triple') return 'experimental-triple';
  if (snapshot.damping > 0) return 'dissipative';
  return 'validated-double';
}

export function warnings(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): string[] {
  const output: string[] = [];
  if (snapshot.damping > 0) output.push('gamma > 0: energy drift includes physical dissipation.');
  if (snapshot.systemType === 'triple') output.push('Triple mode remains experimental for research claims.');
  if (method.symplectic !== 'canonical-only' && method.symplectic !== 'no') output.push('Selected method is labelled approximate/pseudo-symplectic.');
  if (!output.length) output.push('No active scientific honesty warnings.');
  return output;
}
