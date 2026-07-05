/**
 * Parameter study controller: plan generation, worker-pool batch execution with
 * checkpoint/resume/retry, CSV/JSON export, and the study panel rendering.
 */
import type { RuntimeSnapshot } from '../../types/domain';
import { downloadJson } from '../../export/manifest';
import { chaosWorkerTransportFactory, JobCancelledError, JobClient } from '../../runtime/JobClient';
import type { StudyPointResponse } from '../../workers/chaosProtocol';
import { csvCell, hashText } from '../../research/researchExportUtils';
import { generateStudyValues } from '../../research/researchSampling';
import {
  $,
  ParameterStudyPlan,
  ParameterStudyPoint,
  ResearchBatchStatus,
  clear,
  currentSnapshot,
  downloadText,
  html,
  numberFrom,
  researchUid,
  selectValue,
  setText,
  state,
  toast
} from './shared';
import { RESEARCH_STUDY_STRATEGIES, clampNumber, persistResearchState } from './storage-sync';
import { studyBatch, studyBatchTargets, studySpecFromSnapshot } from './research-batch-runner';
import { renderResearchTable } from './research-renderers';
import { applySnapshotControls, cloneSnapshot, logResearchRun, metricValue } from './research-workbench-state';
import { renderResearchWorkbench } from './research-workbench-view';

export function studyStrategy(): ParameterStudyPlan['strategy'] {
  const raw = selectValue('rwStudyStrategy', 'grid');
  return RESEARCH_STUDY_STRATEGIES.has(raw as ParameterStudyPlan['strategy']) ? raw as ParameterStudyPlan['strategy'] : 'grid';
}

export function snapshotWithStudyPatch(base: RuntimeSnapshot, variable: string, value: number): RuntimeSnapshot {
  const snapshot = cloneSnapshot(base);
  const omega1Index = snapshot.systemType === 'triple' ? 3 : 2;
  const omega2Index = snapshot.systemType === 'triple' ? 4 : 3;
  switch (variable) {
    case 'theta1':
      snapshot.state[0] = value;
      break;
    case 'theta2':
      snapshot.state[1] = value;
      break;
    case 'omega1':
      snapshot.state[omega1Index] = value;
      break;
    case 'omega2':
      snapshot.state[omega2Index] = value;
      break;
    case 'damping':
      snapshot.damping = Math.max(0, value);
      break;
    case 'dt':
      snapshot.dt = Math.max(1e-6, value);
      break;
    case 'mass-ratio':
      snapshot.parameters.m2 = Math.max(1e-6, snapshot.parameters.m1 * value);
      break;
    case 'length-ratio':
      snapshot.parameters.l2 = Math.max(1e-6, snapshot.parameters.l1 * value);
      break;
    default:
      break;
  }
  snapshot.hash = `${base.hash.slice(0, 10)}-${variable}-${value.toPrecision(4)}`;
  return snapshot;
}

export function studyEstimate(snapshot: RuntimeSnapshot): string {
  const stiffness = snapshot.dt < 0.001 ? 'high cost' : snapshot.dt < 0.004 ? 'medium cost' : 'low cost';
  const caveat = snapshot.systemType === 'triple' ? 'triple sensitivity' : snapshot.damping > 0 ? 'dissipative' : 'conservative';
  return `${stiffness}, ${caveat}`;
}

export function generateParameterStudy(): void {
  const variable = selectValue('rwStudyVariable', 'theta1');
  const strategy = studyStrategy();
  const min = numberFrom('rwStudyMin', -1);
  const max = numberFrom('rwStudyMax', 1);
  const count = numberFrom('rwStudyCount', 7);
  const base = currentSnapshot();
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const values = generateStudyValues(strategy, lo, hi, count, base.hash);
  const plan: ParameterStudyPlan = {
    id: researchUid('study'),
    generatedAt: new Date().toISOString(),
    variable,
    strategy,
    min: lo,
    max: hi,
    count: values.length,
    values,
    experiments: values.map((value, index) => {
      const snapshot = snapshotWithStudyPatch(base, variable, value);
      return {
        id: researchUid('point'),
        label: `${variable}=${value.toPrecision(6)}`,
        patch: { [variable]: value },
        snapshot,
        estimate: studyEstimate(snapshot)
      };
    })
  };
  state.research.parameterStudy = plan;
  persistResearchState();
  logResearchRun('parameter-study', 'Generated parameter study', `${variable} ${strategy} ${values.length} points`);
  toast('Parameter study generated');
}

export function selectedStudyPoint(): ParameterStudyPoint | undefined {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  const id = select instanceof HTMLSelectElement ? select.value : '';
  return plan?.experiments.find((point) => point.id === id) ?? plan?.experiments[0];
}

export function applySelectedStudyPoint(): void {
  const point = selectedStudyPoint();
  if (!point) {
    toast('No study point available');
    return;
  }
  applySnapshotControls(point.snapshot);
  logResearchRun('parameter-study', 'Applied study point', point.label);
  toast('Study point applied');
}

export let studyJobClient: JobClient | null = null;
export let studyJobClientPoolSize = 0;

/** V2 job client with a worker pool; rebuilt when the requested pool size changes. */
export function studyJobClientInstance(poolSize: number): JobClient {
  if (studyJobClient && studyJobClientPoolSize !== poolSize) {
    studyJobClient.terminate();
    studyJobClient = null;
  }
  if (!studyJobClient) {
    studyJobClient = new JobClient(chaosWorkerTransportFactory(), { poolSize });
    studyJobClientPoolSize = poolSize;
  }
  return studyJobClient;
}

export function studyPoolSize(): number {
  return Math.round(clampNumber(numberFrom('rwStudyPool', 2), 2, 1, 4));
}

export function writeStudyBatchCheckpoint(plan: ParameterStudyPlan, status: ResearchBatchStatus, message: string, nextIndex = studyBatch.current): void {
  const existing = state.research.batchCheckpoint?.planId === plan.id ? state.research.batchCheckpoint : null;
  const summary = studyCompletionSummary(plan);
  const now = new Date().toISOString();
  state.research.batchCheckpoint = {
    id: existing?.id ?? researchUid('batch'),
    planId: plan.id,
    planHash: summary.planHash,
    status,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    completed: summary.complete,
    failed: summary.failed,
    pending: summary.pending,
    nextIndex: Math.max(0, Math.min(plan.experiments.length, Math.round(nextIndex))),
    total: plan.experiments.length,
    timeoutMs: studyBatch.timeoutMs,
    message
  };
}

export function clearStudyBatchCheckpoint(): void {
  state.research.batchCheckpoint = null;
  persistResearchState();
  renderResearchWorkbench();
  toast('Batch checkpoint cleared');
}

export function studyBatchTimeoutMs(): number {
  const seconds = clampNumber(numberFrom('rwStudyTimeout', 45), 45, 5, 300);
  return Math.round(seconds * 1000);
}

/**
 * Batch-execute every point of the current parameter study on the chaos worker:
 * maximal Lyapunov (+block SE), RQA determinism/divergence, and per-point FTLE.
 * Points run sequentially so the worker is never flooded; progress renders after
 * each point and the run is cancellable between points.
 */
export async function runStudyBatch(options: { failedOnly?: boolean; resume?: boolean } = {}): Promise<void> {
  const plan = state.research.parameterStudy;
  if (!plan || plan.experiments.length === 0) {
    toast('Generate a parameter study first');
    return;
  }
  if (studyBatch.running) {
    toast('Batch already running');
    return;
  }
  const targets = studyBatchTargets(plan, options);
  if (targets.length === 0) {
    toast(options.failedOnly ? 'No failed study points to retry' : 'All study points already have results');
    return;
  }
  studyBatch.running = true;
  studyBatch.cancelled = false;
  studyBatch.current = 0;
  studyBatch.total = targets.length;
  studyBatch.completed = 0;
  studyBatch.failed = 0;
  studyBatch.timeoutMs = studyBatchTimeoutMs();
  studyBatch.poolSize = studyPoolSize();
  writeStudyBatchCheckpoint(plan, 'running', options.failedOnly ? 'Retrying failed study points.' : options.resume ? 'Resuming pending study points.' : 'Running pending study points.', 0);
  persistResearchState();
  renderParameterStudy();
  // Protocol V2: each point is a jobId-tracked studyPoint job on the worker
  // pool. Cancellation is a protocol message (phase-boundary stop with
  // checkpoint), not a worker teardown; timeouts are enforced by the engine at
  // phase boundaries and by the client as a wedged-kernel backstop.
  const client = studyJobClientInstance(studyBatch.poolSize);
  const inFlight = new Set<ReturnType<JobClient['submit']>>();
  studyBatch.cancelInFlight = () => {
    for (const handle of inFlight) handle.cancel();
  };
  let nextTarget = 0;
  let processed = 0;
  const maxAttempts = options.failedOnly ? 2 : 1;
  const runNext = async (): Promise<void> => {
    for (;;) {
      if (studyBatch.cancelled) return;
      const targetIndex = nextTarget;
      nextTarget += 1;
      if (targetIndex >= targets.length) return;
      const { point } = targets[targetIndex]!;
      const startedAt = performance.now();
      const { spec, state0 } = studySpecFromSnapshot(point.snapshot);
      const dt = Math.min(0.01, point.snapshot.dt || 0.01);
      let lastError = '';
      let res: StudyPointResponse | null = null;
      for (let attempt = 1; attempt <= maxAttempts && !studyBatch.cancelled; attempt += 1) {
        point.attempts = (point.attempts ?? 0) + 1;
        delete point.error;
        const handle = client.submit(
          { id: `${point.id}-a${point.attempts}`, kind: 'studyPoint', spec, state0, settings: { lyapunov: { dt } } },
          { timeoutMs: studyBatch.timeoutMs, checkpointEvery: 1 }
        );
        inFlight.add(handle);
        try {
          res = (await handle.result) as StudyPointResponse;
          inFlight.delete(handle);
          break;
        } catch (error) {
          inFlight.delete(handle);
          if (error instanceof JobCancelledError) {
            studyBatch.cancelled = true;
            lastError = 'cancelled by user';
            break;
          }
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      if (res) {
        point.results = {
          lambdaMax: res.lambdaMax,
          lambdaBlockStdError: res.lambdaBlockStdError,
          rqaDeterminism: res.rqaDeterminism,
          rqaDivergence: res.rqaDivergence,
          ftle: res.ftle,
          durationMs: Math.round(performance.now() - startedAt),
          completedAt: new Date().toISOString()
        };
        delete point.error;
        studyBatch.completed += 1;
      } else {
        point.error = lastError || 'no result returned';
        studyBatch.failed += 1;
        if (studyBatch.cancelled || point.error.toLowerCase().includes('cancelled')) {
          studyBatch.cancelled = true;
          persistResearchState();
          renderParameterStudy();
          return;
        }
      }
      processed += 1;
      studyBatch.current = processed;
      persistResearchState();
      writeStudyBatchCheckpoint(plan, 'running', `Processed ${studyBatch.current}/${studyBatch.total} target point(s).`, processed);
      persistResearchState();
      renderParameterStudy();
    }
  };
  await Promise.all(Array.from({ length: Math.min(studyBatch.poolSize, targets.length) }, () => runNext()));
  studyBatch.cancelInFlight = null;
  const done = plan.experiments.filter((point) => point.results).length;
  studyBatch.running = false;
  const failed = plan.experiments.filter((point) => point.error).length;
  writeStudyBatchCheckpoint(
    plan,
    studyBatch.cancelled ? 'cancelled' : failed > 0 ? 'failed' : 'complete',
    studyBatch.cancelled ? `Cancelled at ${done}/${plan.experiments.length}.` : failed > 0 ? `${failed} point(s) failed; resume or retry failed points.` : 'All study points completed.',
    studyBatch.cancelled ? studyBatch.current : plan.experiments.length
  );
  persistResearchState();
  logResearchRun(
    'parameter-study',
    studyBatch.cancelled ? 'Batch cancelled' : options.failedOnly ? 'Batch retry complete' : 'Batch complete',
    `${done}/${plan.experiments.length} points filled; ${failed} failed; timeout ${Math.round(studyBatch.timeoutMs / 1000)}s`
  );
  toast(studyBatch.cancelled ? `Batch cancelled at ${done}/${plan.experiments.length}` : `Batch complete: ${done}/${plan.experiments.length} filled, ${failed} failed`);
}

export function cancelStudyBatch(): void {
  if (!studyBatch.running) {
    toast('No batch running');
    return;
  }
  studyBatch.cancelled = true;
  studyBatch.cancelInFlight?.();
  toast('Cancelling batch...');
}

export function exportParameterStudy(): void {
  if (!state.research.parameterStudy) generateParameterStudy();
  const plan = state.research.parameterStudy;
  downloadJson('pendulum_parameter_study_plan.json', {
    schemaVersion: 'pendulum-parameter-study/v1',
    generatedAt: new Date().toISOString(),
    planHash: plan ? studyPlanHash(plan) : null,
    batch: plan ? studyCompletionSummary(plan) : null,
    checkpoint: state.research.batchCheckpoint,
    plan
  });
  logResearchRun('export', 'Parameter study export', state.research.parameterStudy ? `${state.research.parameterStudy.count} points` : 'no plan', 'pendulum_parameter_study_plan.json');
}

export function studyPointValue(plan: ParameterStudyPlan, point: ParameterStudyPoint, index: number): number | string {
  const patched = point.patch[plan.variable];
  if (typeof patched === 'number' || typeof patched === 'string') return patched;
  return plan.values[index] ?? '';
}

export function studyPlanHash(plan: ParameterStudyPlan): string {
  return hashText(JSON.stringify({
    id: plan.id,
    generatedAt: plan.generatedAt,
    variable: plan.variable,
    strategy: plan.strategy,
    min: plan.min,
    max: plan.max,
    values: plan.values,
    snapshots: plan.experiments.map((point) => point.snapshot.hash)
  }));
}

export function studyCompletionSummary(plan: ParameterStudyPlan): { complete: number; failed: number; pending: number; planHash: string } {
  const complete = plan.experiments.filter((point) => point.results).length;
  const failed = plan.experiments.filter((point) => point.error && !point.results).length;
  return {
    complete,
    failed,
    pending: Math.max(0, plan.experiments.length - complete - failed),
    planHash: studyPlanHash(plan)
  };
}

export function exportParameterStudyResultsCsv(): void {
  const plan = state.research.parameterStudy;
  if (!plan) {
    toast('Generate a parameter study first');
    return;
  }
  downloadText('pendulum_parameter_study_results.csv', parameterStudyResultsCsvText(plan), 'text/csv;charset=utf-8');
  logResearchRun('export', 'Parameter study CSV export', `${plan.experiments.length} rows`, 'pendulum_parameter_study_results.csv');
}

export function parameterStudyResultsCsvText(plan: ParameterStudyPlan): string {
  const rows = [[
    'point_id',
    'label',
    'variable',
    'value',
    'lambda_max',
    'lambda_block_std_error',
    'rqa_determinism',
    'rqa_divergence',
    'ftle',
    'duration_ms',
    'attempts',
    'error',
    'snapshot_hash'
  ]];
  plan.experiments.forEach((point, index) => {
    rows.push([
      point.id,
      point.label,
      plan.variable,
      String(studyPointValue(plan, point, index)),
      point.results ? String(point.results.lambdaMax) : '',
      point.results ? String(point.results.lambdaBlockStdError) : '',
      point.results ? String(point.results.rqaDeterminism) : '',
      point.results ? String(point.results.rqaDivergence) : '',
      point.results ? String(point.results.ftle) : '',
      point.results?.durationMs ? String(point.results.durationMs) : '',
      point.attempts ? String(point.attempts) : '',
      point.error ?? '',
      point.snapshot.hash
    ]);
  });
  const header = [
    `# schemaVersion=pendulum-parameter-study-results/v1`,
    `# generatedAt=${new Date().toISOString()}`,
    `# planHash=${studyPlanHash(plan)}`,
    `# variable=${plan.variable}`,
    `# strategy=${plan.strategy}`
  ];
  return [...header, ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

export function renderParameterStudy(): void {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  if (select instanceof HTMLSelectElement) {
    const previous = select.value;
    clear(select);
    for (const point of plan?.experiments ?? []) select.append(html('option', { value: point.id, text: point.label }));
    if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }
  const filled = plan?.experiments.filter((point) => point.results).length ?? 0;
  const progress = studyBatch.running
    ? ` Batch running: point ${studyBatch.current}/${studyBatch.total}…`
    : filled > 0
      ? ` ${filled}/${plan?.count ?? 0} points have batch results.`
      : '';
  setText('rwStudySummary', plan
    ? `${plan.count} points for ${plan.variable} using ${plan.strategy}. Range ${plan.min} to ${plan.max}. First: ${plan.experiments[0]?.estimate ?? '-'}.${progress}`
    : 'No parameter study generated.');
  setText('rwStudyCheckpoint', buildStudyCheckpointSummary(plan));
  setText('rwStudyInsights', buildParameterStudyInsights(plan));
  const resultRows = (plan?.experiments ?? [])
    .filter((point) => point.results || point.error)
    .map((point) => point.results
      ? [
          point.label,
          `${point.results.lambdaMax.toFixed(4)} ± ${point.results.lambdaBlockStdError.toFixed(4)}`,
          point.results.rqaDeterminism.toFixed(3),
          point.results.rqaDivergence.toFixed(4),
          point.results.ftle.toFixed(4)
        ]
      : [point.label, `error: ${point.error ?? 'unknown'}`, '-', '-', '-']);
  renderResearchTable('rwStudyResults', ['point', 'lambda max ± SE', 'RQA DET', 'RQA DIV', 'FTLE'], resultRows, 'Run the batch to fill per-point diagnostics.');
}

export function buildStudyCheckpointSummary(plan: ParameterStudyPlan | null): string {
  const checkpoint = state.research.batchCheckpoint;
  if (!plan || !checkpoint || checkpoint.planId !== plan.id) return 'No batch checkpoint yet.';
  const age = Number.isNaN(Date.parse(checkpoint.updatedAt)) ? checkpoint.updatedAt : new Date(checkpoint.updatedAt).toLocaleTimeString();
  return `Checkpoint ${checkpoint.status}: ${checkpoint.completed}/${checkpoint.total} complete, ${checkpoint.failed} failed, ${checkpoint.pending} pending; next target ${checkpoint.nextIndex}; timeout ${Math.round(checkpoint.timeoutMs / 1000)}s; updated ${age}. ${checkpoint.message}`;
}

export function buildParameterStudyInsights(plan: ParameterStudyPlan | null): string {
  if (!plan) return 'Study insights will appear after batch diagnostics run.';
  const completion = studyCompletionSummary(plan);
  const completed = plan.experiments
    .map((point, index) => ({ point, index, value: Number(studyPointValue(plan, point, index)) }))
    .filter((entry) => entry.point.results && Number.isFinite(entry.value));
  if (!completed.length) {
    return `Plan hash ${completion.planHash}. ${completion.pending} pending point(s); run the batch to compute Lyapunov/RQA/FTLE diagnostics.`;
  }
  const lambdas = completed.map((entry) => entry.point.results!.lambdaMax);
  const minLambda = Math.min(...lambdas);
  const maxLambda = Math.max(...lambdas);
  const peak = completed.reduce((best, entry) => entry.point.results!.lambdaMax > best.point.results!.lambdaMax ? entry : best, completed[0]!);
  const sorted = completed.slice().sort((a, b) => a.value - b.value);
  let maxSlope = 0;
  let slopeLabel = '-';
  let signChanges = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    const dv = next.value - prev.value;
    if (dv !== 0) {
      const slope = Math.abs((next.point.results!.lambdaMax - prev.point.results!.lambdaMax) / dv);
      if (slope > maxSlope) {
        maxSlope = slope;
        slopeLabel = `${prev.value.toPrecision(4)} → ${next.value.toPrecision(4)}`;
      }
    }
    const prevSign = Math.sign(prev.point.results!.lambdaMax);
    const nextSign = Math.sign(next.point.results!.lambdaMax);
    if (prevSign !== 0 && nextSign !== 0 && prevSign !== nextSign) signChanges += 1;
  }
  return [
    `Plan hash ${completion.planHash}. Complete ${completion.complete}/${plan.count}; failed ${completion.failed}; pending ${completion.pending}.`,
    `λ range ${metricValue(minLambda)} to ${metricValue(maxLambda)}; peak at ${peak.point.label}.`,
    `Max local sensitivity |Δλ/Δ${plan.variable}|=${metricValue(maxSlope)} over ${slopeLabel}; sign-change crossings ${signChanges}.`
  ].join(' ');
}
