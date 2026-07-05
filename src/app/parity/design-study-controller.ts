/**
 * Multi-variable experiment design controller: design generation, budgeted
 * batch execution with adaptive/boundary/uncertainty refinement, persistence,
 * preview/heatmap drawing, and CSV/JSON export.
 */
import type { RuntimeSnapshot } from '../../types/domain';
import { downloadJson } from '../../export/manifest';
import { JobCancelledError, JobClient } from '../../runtime/JobClient';
import type { StudyPointResponse } from '../../workers/chaosProtocol';
import { csvCell, hashText } from '../../research/researchExportUtils';
import {
  adaptiveRefinement,
  boundaryRefinement,
  budgetAllows,
  generateDesign,
  uncertaintyResampling,
  type DesignBudget,
  type DesignPoint,
  type EvaluatedPoint,
  type MultiStrategy,
  type StudyVariable
} from '../../research/experimentDesign';
import {
  $,
  StudyPointResults,
  currentSnapshot,
  downloadText,
  numberFrom,
  researchUid,
  selectValue,
  state,
  toast
} from './shared';
import { clampNumber, finiteNumber, researchDbInstance } from './storage-sync';
import { studyBatch, studySpecFromSnapshot } from './research-batch-runner';
import { DESIGN_VARIABLE_KEYS, createDesignBudget, parseDesignVariableLines } from './research-design-controller';
import { renderResearchTable } from './research-renderers';
import { cloneSnapshot, logResearchRun } from './research-workbench-state';
import { snapshotWithStudyPatch, studyBatchTimeoutMs, studyJobClientInstance, studyPoolSize } from './study-batch-controller';

export interface DesignStudyPointState {
  id: string;
  values: Record<string, number>;
  origin: DesignPoint['origin'];
  replicate: number;
  attempts?: number;
  results?: StudyPointResults;
  error?: string;
}

export interface DesignStudyState {
  schemaVersion: 'pendulum-design-study/v1';
  id: string;
  generatedAt: string;
  variables: StudyVariable[];
  strategy: MultiStrategy;
  count: number;
  replicates: number;
  budget: DesignBudget;
  points: DesignStudyPointState[];
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'failed' | 'budget-stopped';
  message: string;
}

export const DESIGN_STORAGE_KEY = 'pendulum-lab/design-study/v1';

export let designStudy: DesignStudyState | null = null;

/** Cross-module setter: ES module live bindings are read-only for importers. */
export function setDesignStudy(value: DesignStudyState | null): void {
  designStudy = value;
}

export const designBatch = {
  running: false,
  cancelled: false,
  startedAtMs: 0,
  cancelInFlight: null as (() => void) | null
};

export function persistDesignStudy(): void {
  try {
    if (designStudy) window.localStorage?.setItem(DESIGN_STORAGE_KEY, JSON.stringify(designStudy));
  } catch {
    /* design study persists to IndexedDB below even when localStorage is full */
  }
  const db = researchDbInstance();
  if (db.available() && designStudy) {
    void db.put('parameterStudies', `design:${designStudy.id}`, designStudy).catch(() => undefined);
  }
}

export function loadDesignStudy(): void {
  try {
    const raw = window.localStorage?.getItem(DESIGN_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as DesignStudyState;
    if (parsed?.schemaVersion !== 'pendulum-design-study/v1' || !Array.isArray(parsed.variables) || !Array.isArray(parsed.points)) return;
    const variables = parsed.variables.filter((variable) => DESIGN_VARIABLE_KEYS.has(variable?.key) && finiteNumber(variable.min) && finiteNumber(variable.max));
    if (variables.length === 0) return;
    designStudy = { ...parsed, variables, status: parsed.status === 'running' ? 'idle' : parsed.status };
  } catch {
    window.localStorage?.removeItem(DESIGN_STORAGE_KEY);
  }
}

export function parseDesignVariables(): StudyVariable[] {
  const textarea = $('rwDesignVars');
  const text = textarea instanceof HTMLTextAreaElement ? textarea.value : '';
  const variables: StudyVariable[] = [];
  for (const variable of parseDesignVariableLines(text)) {
    if (variables.some((existing) => existing.key === variable.key)) continue;
    variables.push(variable);
    if (variables.length >= 4) break;
  }
  return variables;
}

export function designBudgetFromControls(): DesignBudget {
  return createDesignBudget(
    clampNumber(numberFrom('rwDesignMaxPoints', 48), 48, 4, 256),
    clampNumber(numberFrom('rwDesignMaxTime', 300), 300, 10, 3600) * 1000,
    clampNumber(numberFrom('rwDesignMaxFailures', 6), 6, 1, 64)
  );
}

export function generateDesignStudy(): void {
  const variables = parseDesignVariables();
  if (variables.length === 0) {
    toast('Define at least one valid variable line: key,min,max');
    return;
  }
  const strategyRaw = selectValue('rwDesignStrategy', 'sobol');
  const strategy: MultiStrategy = strategyRaw === 'latin-hypercube' || strategyRaw === 'grid' ? strategyRaw : 'sobol';
  const count = Math.round(clampNumber(numberFrom('rwDesignCount', 12), 12, 2, 128));
  const replicates = Math.round(clampNumber(numberFrom('rwDesignReplicates', 1), 1, 1, 8));
  const budget = designBudgetFromControls();
  const id = researchUid('design');
  const points = generateDesign(variables, strategy, count, { replicates, budget, seedText: id });
  designStudy = {
    schemaVersion: 'pendulum-design-study/v1',
    id,
    generatedAt: new Date().toISOString(),
    variables,
    strategy,
    count,
    replicates,
    budget,
    points: points.map((point, index) => ({
      id: `${id}-p${index}`,
      values: point.values,
      origin: point.origin,
      replicate: point.replicate
    })),
    status: 'idle',
    message: `${points.length} point(s) over ${variables.length} variable(s); budget ${budget.maxPoints} points / ${Math.round(budget.maxTimeMs / 1000)}s / ${budget.maxFailures} failures.`
  };
  persistDesignStudy();
  renderDesignStudy();
  logResearchRun('parameter-study', 'Design generated', `${strategy} ${points.length} points x ${variables.length} vars`);
  toast(`Design generated (${points.length} points)`);
}

export function designSnapshotForValues(values: Record<string, number>): RuntimeSnapshot {
  let snapshot = cloneSnapshot(currentSnapshot());
  for (const [key, value] of Object.entries(values)) {
    snapshot = snapshotWithStudyPatch(snapshot, key, value);
  }
  return snapshot;
}

export function designEvaluatedPoints(design: DesignStudyState): EvaluatedPoint[] {
  return design.points
    .filter((point) => point.results)
    .map((point) => ({
      values: point.values,
      lambdaMax: point.results!.lambdaMax,
      lambdaStdError: point.results!.lambdaBlockStdError
    }));
}

/** Run pending design points on the worker pool, then adaptive/boundary/uncertainty refinement passes under budget. */
export async function runDesignBatch(): Promise<void> {
  const design = designStudy;
  if (!design || design.points.length === 0) {
    toast('Generate a design first');
    return;
  }
  if (designBatch.running || studyBatch.running) {
    toast('A batch is already running');
    return;
  }
  designBatch.running = true;
  designBatch.cancelled = false;
  designBatch.startedAtMs = performance.now();
  design.budget = designBudgetFromControls();
  design.status = 'running';
  design.message = 'Running design points on the worker pool.';
  renderDesignStudy();
  const client = studyJobClientInstance(studyPoolSize());
  const timeoutMs = studyBatchTimeoutMs();
  const inFlight = new Set<ReturnType<JobClient['submit']>>();
  designBatch.cancelInFlight = () => {
    for (const handle of inFlight) handle.cancel();
  };

  const budgetState = () => ({
    pointsRun: design.points.filter((point) => point.results).length,
    elapsedMs: performance.now() - designBatch.startedAtMs,
    failures: design.points.filter((point) => point.error && !point.results).length
  });

  const runPending = async (): Promise<void> => {
    const queue = design.points.filter((point) => !point.results && !point.error);
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (designBatch.cancelled) return;
        const verdict = budgetAllows(design.budget, budgetState());
        if (!verdict.allowed) {
          design.message = verdict.reason;
          return;
        }
        const index = next;
        next += 1;
        if (index >= queue.length) return;
        const point = queue[index]!;
        const startedAt = performance.now();
        point.attempts = (point.attempts ?? 0) + 1;
        const snapshot = designSnapshotForValues(point.values);
        const { spec, state0 } = studySpecFromSnapshot(snapshot);
        const handle = client.submit(
          { id: `${point.id}-a${point.attempts}`, kind: 'studyPoint', spec, state0, settings: { lyapunov: { dt: Math.min(0.01, snapshot.dt || 0.01) } } },
          { timeoutMs, checkpointEvery: 1 }
        );
        inFlight.add(handle);
        try {
          const res = (await handle.result) as StudyPointResponse;
          inFlight.delete(handle);
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
        } catch (error) {
          inFlight.delete(handle);
          if (error instanceof JobCancelledError) {
            designBatch.cancelled = true;
            return;
          }
          point.error = error instanceof Error ? error.message : String(error);
        }
        persistDesignStudy();
        renderDesignStudy();
      }
    };
    await Promise.all(Array.from({ length: Math.min(studyPoolSize(), Math.max(1, queue.length)) }, () => worker()));
  };

  await runPending();

  // Refinement passes: adaptive (steep |∇λ|), boundary (λ sign change),
  // uncertainty (high SE replicates) — each pass re-runs the new points and
  // stops as soon as the budget disallows more work.
  for (let pass = 0; pass < 3 && !designBatch.cancelled; pass += 1) {
    const verdict = budgetAllows(design.budget, budgetState());
    if (!verdict.allowed) {
      design.status = 'budget-stopped';
      design.message = verdict.reason;
      break;
    }
    const evaluated = designEvaluatedPoints(design);
    const headroom = Math.max(0, design.budget.maxPoints - design.points.length);
    if (headroom === 0) break;
    const proposals = [
      ...boundaryRefinement(evaluated, design.variables, Math.min(4, headroom)),
      ...adaptiveRefinement(evaluated, design.variables, Math.min(4, headroom)),
      ...uncertaintyResampling(evaluated, Math.min(2, headroom))
    ].slice(0, headroom);
    if (proposals.length === 0) break;
    proposals.forEach((proposal, index) => {
      design.points.push({
        id: `${design.id}-r${pass}-${index}`,
        values: proposal.values,
        origin: proposal.origin,
        replicate: proposal.replicate
      });
    });
    design.message = `Refinement pass ${pass + 1}: ${proposals.length} new point(s).`;
    renderDesignStudy();
    await runPending();
  }

  designBatch.cancelInFlight = null;
  designBatch.running = false;
  const done = design.points.filter((point) => point.results).length;
  const failed = design.points.filter((point) => point.error && !point.results).length;
  if (designBatch.cancelled) design.status = 'cancelled';
  else if (design.status !== 'budget-stopped') design.status = failed > 0 ? 'failed' : 'complete';
  design.message = `${done}/${design.points.length} complete, ${failed} failed (${design.status}).`;
  persistDesignStudy();
  renderDesignStudy();
  logResearchRun('parameter-study', 'Design batch finished', design.message);
  toast(`Design batch: ${done}/${design.points.length} points`);
}

export function cancelDesignBatch(): void {
  if (!designBatch.running) {
    toast('No design batch running');
    return;
  }
  designBatch.cancelled = true;
  designBatch.cancelInFlight?.();
  toast('Cancelling design batch...');
}

export const DESIGN_ORIGIN_COLORS: Record<DesignPoint['origin'], string> = {
  design: '#4cc9f0',
  replicate: '#a3b3c9',
  adaptive: '#f4a261',
  boundary: '#e63946',
  uncertainty: '#b388eb'
};

export function drawDesignPreview(design: DesignStudyState): void {
  const canvas = $('rwDesignPreview');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const [vx, vy] = [design.variables[0], design.variables[1] ?? design.variables[0]];
  if (!vx || !vy) return;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = 18;
  const sx = (value: number) => pad + ((value - vx.min) / (vx.max - vx.min || 1)) * (canvas.width - 2 * pad);
  const sy = (value: number) => canvas.height - pad - ((value - vy.min) / (vy.max - vy.min || 1)) * (canvas.height - 2 * pad);
  ctx.strokeStyle = '#2a3550';
  ctx.strokeRect(pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
  for (const point of design.points) {
    ctx.fillStyle = DESIGN_ORIGIN_COLORS[point.origin];
    ctx.beginPath();
    ctx.arc(sx(point.values[vx.key] ?? vx.min), sy(point.values[vy.key] ?? vy.min), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText(`${vx.key} →`, canvas.width - pad - 52, canvas.height - 4);
  ctx.fillText(`${vy.key} ↑`, 2, pad - 6);
}

export function drawDesignHeatmap(design: DesignStudyState): void {
  const canvas = $('rwDesignHeatmap');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const evaluated = design.points.filter((point) => point.results);
  const [vx, vy] = [design.variables[0], design.variables[1] ?? design.variables[0]];
  if (!vx || !vy || evaluated.length === 0) {
    ctx.fillStyle = '#8fa3c2';
    ctx.font = '11px system-ui';
    ctx.fillText('Heatmap appears after the design batch runs.', 12, canvas.height / 2);
    return;
  }
  const lambdas = evaluated.map((point) => point.results!.lambdaMax).filter(Number.isFinite);
  const maxAbs = Math.max(0.1, ...lambdas.map((lambda) => Math.abs(lambda)));
  const pad = 18;
  const sx = (value: number) => pad + ((value - vx.min) / (vx.max - vx.min || 1)) * (canvas.width - 2 * pad);
  const sy = (value: number) => canvas.height - pad - ((value - vy.min) / (vy.max - vy.min || 1)) * (canvas.height - 2 * pad);
  for (const point of evaluated) {
    const lambda = point.results!.lambdaMax;
    const t = Math.max(-1, Math.min(1, lambda / maxAbs));
    // Diverging palette: blue (λ<0, regular) -> white (0) -> red (λ>0, chaotic).
    const r = t > 0 ? 255 : Math.round(255 * (1 + t));
    const b = t < 0 ? 255 : Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - Math.abs(t)));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(sx(point.values[vx.key] ?? vx.min), sy(point.values[vy.key] ?? vy.min), 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#2a3550';
  ctx.strokeRect(pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText(`λ heatmap: blue regular, red chaotic (|λ|max ${maxAbs.toFixed(2)})`, pad, 12);
}

export function renderDesignStudy(): void {
  const summary = $('rwDesignSummary');
  if (!summary) return;
  const design = designStudy;
  if (!design) {
    summary.textContent = 'No design generated. Define variables and generate a multi-dimensional design.';
    return;
  }
  const done = design.points.filter((point) => point.results).length;
  const failed = design.points.filter((point) => point.error && !point.results).length;
  summary.textContent = `${design.strategy} design over ${design.variables.map((variable) => variable.key).join(', ')} — ${design.points.length} points (${done} complete, ${failed} failed). Status: ${design.status}. ${design.message}`;
  drawDesignPreview(design);
  drawDesignHeatmap(design);
  const rows = design.points.slice(0, 40).map((point) => [
    point.origin,
    design.variables.map((variable) => `${variable.key}=${(point.values[variable.key] ?? 0).toFixed(3)}`).join(' '),
    point.results ? point.results.lambdaMax.toFixed(4) : '-',
    point.results ? `±${point.results.lambdaBlockStdError.toFixed(4)}` : '-',
    point.results ? point.results.ftle.toFixed(3) : '-',
    point.error ?? ''
  ]);
  renderResearchTable('rwDesignResults', ['origin', 'point', 'lambda max', 'SE', 'FTLE', 'error'], rows, 'Design points appear here.');
}

export function designStudyCsvText(design: DesignStudyState): string {
  const variableKeys = design.variables.map((variable) => variable.key);
  const header = ['point_id', 'origin', 'replicate', ...variableKeys, 'lambda_max', 'lambda_block_std_error', 'rqa_determinism', 'rqa_divergence', 'ftle', 'attempts', 'error'];
  const rows = design.points.map((point) => [
    point.id,
    point.origin,
    String(point.replicate),
    ...variableKeys.map((key) => String(point.values[key] ?? '')),
    point.results ? String(point.results.lambdaMax) : '',
    point.results ? String(point.results.lambdaBlockStdError) : '',
    point.results ? String(point.results.rqaDeterminism) : '',
    point.results ? String(point.results.rqaDivergence) : '',
    point.results ? String(point.results.ftle) : '',
    point.attempts ? String(point.attempts) : '',
    point.error ?? ''
  ]);
  return [
    `# schemaVersion=pendulum-design-study-results/v1`,
    `# designId=${design.id}`,
    `# generatedAt=${new Date().toISOString()}`,
    `# strategy=${design.strategy}`,
    `# variables=${design.variables.map((variable) => `${variable.key}[${variable.min},${variable.max}]`).join(';')}`,
    `# method=studyPoint(Benettin lambda + RQA + FTLE), dt<=0.01, transient handled per kernel`,
    `# uncertainty=lambda block std error (batched means)`,
    `# caveat=finite-time estimates; replicate/refine for publication claims`,
    header.join(','),
    ...rows.map((row) => row.map(csvCell).join(','))
  ].join('\n');
}

export function exportDesignStudyCsv(): void {
  if (!designStudy) {
    toast('Generate a design first');
    return;
  }
  downloadText('pendulum_design_study_results.csv', designStudyCsvText(designStudy), 'text/csv;charset=utf-8');
  logResearchRun('export', 'Design study CSV export', `${designStudy.points.length} rows`, 'pendulum_design_study_results.csv');
}

export function exportDesignStudyJson(): void {
  if (!designStudy) {
    toast('Generate a design first');
    return;
  }
  downloadJson('pendulum_design_study.json', { ...designStudy, designHash: hashText(JSON.stringify(designStudy.points.map((point) => [point.id, point.values]))) });
  logResearchRun('export', 'Design study JSON export', `${designStudy.points.length} points`, 'pendulum_design_study.json');
}
