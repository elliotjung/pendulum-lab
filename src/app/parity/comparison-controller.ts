/**
 * Result comparison matrix controller: rebuilds the cross-experiment/run rows
 * and exports them; row construction and table rendering live in
 * research-comparison.
 */
import { downloadJson } from '../../export/manifest';
import { state } from './shared';
import { persistResearchState } from './storage-sync';
import { buildComparisonRows } from './research-comparison';
import { logResearchRun } from './research-workbench-state';

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
  logResearchRun('export', 'Comparison matrix export', `${state.research.comparisonRows.length} rows`, 'pendulum_result_comparison_matrix.json');
}
