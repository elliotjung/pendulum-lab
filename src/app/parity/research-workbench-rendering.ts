/** Focused research-workbench responsibility extracted from research-workbench.ts. */
/**
 * Research Workbench: experiments, run log, parameter/design studies, analysis superpack.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { $ } from './shared';
import { downloadJson } from '../../export/manifest';

import { forkExperimentData, validateDoi } from '../../research/libraryUx';

import { ParameterStudyPlan, clear, html, researchUid, setText, state, toast } from './shared';
import { MAX_RESEARCH_EXPERIMENTS, persistResearchState, renderResearchStoragePanel } from './storage-sync';

import { buildComparisonRows, renderComparisonMatrix, renderPaperSummary } from './research-comparison';
import { renderResearchTable } from './research-renderers';
import { renderResearchRunLog } from './research-run-log';
import { studyBatch } from './research-batch-runner';

import {
  renderExperimentDiff,
  renderExperimentTimeline,
  renderResearchExperiments as renderResearchExperimentsPanel
} from './research-experiment-library-renderer';

import {
  metricValue,
  selectedResearchExperiment,
  renderWorkspaceProfile,
  logResearchRun,
  studyPointValue,
  studyCompletionSummary,
  renderDesignStudy
} from './research-workbench';

export function rebuildComparisonMatrix(): void {
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  logResearchRun('comparison', 'Rebuilt comparison matrix', `${state.research.comparisonRows.length} rows`);
}

export function exportComparisonMatrix(): void {
  if (!state.research.comparisonRows.length) state.research.comparisonRows = buildComparisonRows();
  downloadJson('pendulum_result_comparison_matrix.json', {
    schemaVersion: 'pendulum-result-comparison/v1',
    generatedAt: new Date().toISOString(),
    rows: state.research.comparisonRows
  });
  logResearchRun(
    'export',
    'Comparison matrix export',
    `${state.research.comparisonRows.length} rows`,
    'pendulum_result_comparison_matrix.json'
  );
}

export function renderResearchWorkbench(): void {
  renderWorkspaceProfile();
  renderResearchExperiments();
  renderResearchRunLog();
  renderParameterStudy();
  renderDesignStudy();
  renderComparisonMatrix();
  renderPaperSummary();
  renderResearchStoragePanel();
}

export function renderResearchExperiments(): void {
  renderResearchExperimentsPanel();
}

export function toggleFavoriteExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  if (experiment.favorite) delete experiment.favorite;
  else experiment.favorite = true;
  experiment.updatedAt = new Date().toISOString();
  persistResearchState();
  renderResearchWorkbench();
  toast(experiment.favorite ? 'Marked favorite' : 'Favorite removed');
}

export function forkSelectedExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  const fork = forkExperimentData(experiment, researchUid('exp'), new Date().toISOString());
  fork.updatedAt = fork.createdAt;
  state.research.experiments.unshift(fork);
  state.research.experiments = state.research.experiments.slice(0, MAX_RESEARCH_EXPERIMENTS);
  state.research.selectedExperimentId = fork.id;
  persistResearchState();
  logResearchRun('experiment', 'Forked experiment', `${experiment.name} -> ${fork.name}`);
  toast('Experiment forked');
}

export function diffSelectedExperiments(): void {
  const selected = selectedResearchExperiment();
  const diffSelect = $('rwDiffAgainst');
  const otherId = diffSelect instanceof HTMLSelectElement ? diffSelect.value : '';
  const other = state.research.experiments.find((experiment) => experiment.id === otherId);
  if (!selected || !other) {
    toast('Select two experiments to diff');
    return;
  }
  const count = renderExperimentDiff(selected, other);
  toast(`${count} differing field(s)`);
}

export function saveCitationForSelected(): void {
  const experiment = selectedResearchExperiment();
  const doiInput = $('rwLibDoi');
  const refInput = $('rwLibRef');
  if (!experiment || !(doiInput instanceof HTMLInputElement) || !(refInput instanceof HTMLInputElement)) {
    toast('No experiment selected');
    return;
  }
  if (!validateDoi(doiInput.value)) {
    toast('Invalid DOI — expected 10.xxxx/...');
    return;
  }
  const doi = doiInput.value.trim();
  const reference = refInput.value.trim();
  if (doi || reference) experiment.citation = { doi, reference };
  else delete experiment.citation;
  experiment.updatedAt = new Date().toISOString();
  persistResearchState();
  renderResearchWorkbench();
  toast('Citation saved');
}

export function toggleExperimentTimeline(): void {
  const target = $('rwLibTimeline');
  if (!target) return;
  if (target.childElementCount > 0) {
    clear(target);
    return;
  }
  renderExperimentTimeline();
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
  setText(
    'rwStudySummary',
    plan
      ? `${plan.count} points for ${plan.variable} using ${plan.strategy}. Range ${plan.min} to ${plan.max}. First: ${plan.experiments[0]?.estimate ?? '-'}.${progress}`
      : 'No parameter study generated.'
  );
  setText('rwStudyCheckpoint', buildStudyCheckpointSummary(plan));
  setText('rwStudyInsights', buildParameterStudyInsights(plan));
  const resultRows = (plan?.experiments ?? [])
    .filter((point) => point.results || point.error)
    .map((point) =>
      point.results
        ? [
            point.label,
            `${point.results.lambdaMax.toFixed(4)} ± ${point.results.lambdaBlockStdError.toFixed(4)}`,
            point.results.rqaDeterminism.toFixed(3),
            point.results.rqaDivergence.toFixed(4),
            point.results.ftle.toFixed(4)
          ]
        : [point.label, `error: ${point.error ?? 'unknown'}`, '-', '-', '-']
    );
  renderResearchTable(
    'rwStudyResults',
    ['point', 'lambda max ± SE', 'RQA DET', 'RQA DIV', 'FTLE'],
    resultRows,
    'Run the batch to fill per-point diagnostics.'
  );
}

export function buildStudyCheckpointSummary(plan: ParameterStudyPlan | null): string {
  const checkpoint = state.research.batchCheckpoint;
  if (!plan || !checkpoint || checkpoint.planId !== plan.id) return 'No batch checkpoint yet.';
  const age = Number.isNaN(Date.parse(checkpoint.updatedAt))
    ? checkpoint.updatedAt
    : new Date(checkpoint.updatedAt).toLocaleTimeString();
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
  const peak = completed.reduce(
    (best, entry) => (entry.point.results!.lambdaMax > best.point.results!.lambdaMax ? entry : best),
    completed[0]!
  );
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

// --- 3D Lab: rope pendulum + spherical pendulum ------------------------------
