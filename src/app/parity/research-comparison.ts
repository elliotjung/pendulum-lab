import {
  currentSnapshot,
  ResearchComparisonRow,
  ResearchExperiment,
  ResearchRunLogEntry,
  setText,
  state
} from './shared';
import { renderResearchTable } from './research-renderers';

function metricValue(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value)
    ? '-'
    : Math.abs(value) >= 1000 || Math.abs(value) < 0.01
      ? value.toExponential(2)
      : value.toFixed(digits);
}

export function comparisonRowFromExperiment(experiment: ResearchExperiment): ResearchComparisonRow {
  return {
    id: experiment.id,
    label: experiment.name,
    source: 'experiment',
    timestamp: experiment.updatedAt,
    method: experiment.snapshot.method,
    system: experiment.snapshot.systemType,
    dt: experiment.snapshot.dt,
    damping: experiment.snapshot.damping,
    drift: experiment.metrics.drift,
    lambdaMax: experiment.metrics.lambdaMax,
    fps: experiment.metrics.fps,
    score: experiment.metrics.qualityScore,
    hash: experiment.snapshot.hash
  };
}

export function comparisonRowFromRun(entry: ResearchRunLogEntry): ResearchComparisonRow {
  const snapshot = currentSnapshot();
  return {
    id: entry.id,
    label: entry.label,
    source: entry.type,
    timestamp: entry.timestamp,
    method: entry.method,
    system: entry.system,
    dt: entry.dt ?? snapshot.dt,
    damping: entry.damping ?? snapshot.damping,
    drift: entry.metrics.drift,
    lambdaMax: entry.metrics.lambdaMax,
    fps: entry.metrics.fps,
    score: entry.metrics.qualityScore,
    hash: entry.snapshotHash
  };
}

export function buildComparisonRows(): ResearchComparisonRow[] {
  return [
    ...state.research.experiments.map(comparisonRowFromExperiment),
    ...state.research.runLog.slice(0, 24).map(comparisonRowFromRun)
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 60);
}

export function renderComparisonMatrix(): void {
  const rows = state.research.comparisonRows.map((entry) => [
    entry.source,
    entry.label,
    entry.method,
    entry.system,
    String(entry.dt),
    metricValue(entry.drift),
    metricValue(entry.lambdaMax),
    String(entry.score)
  ]);
  renderResearchTable(
    'rwComparisonMatrix',
    ['source', 'label', 'method', 'system', 'dt', 'drift', 'lambda', 'score'],
    rows,
    'No comparison rows yet.'
  );
}

export function renderPaperSummary(): void {
  const ready =
    state.research.experiments.length > 0 || state.research.runLog.length > 0 || Boolean(state.research.parameterStudy);
  const rowCount = state.research.comparisonRows.length || buildComparisonRows().length;
  setText(
    'rwPaperSummary',
    `${ready ? 'ready' : 'not ready'}: ${state.research.experiments.length} experiments, ${state.research.runLog.length} run log entries, ${state.research.parameterStudy?.count ?? 0} study points, ${rowCount} comparison rows.`
  );
}
