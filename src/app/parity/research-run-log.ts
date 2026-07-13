import { state } from './shared';
import { renderResearchTable } from './research-renderers';

export function renderResearchRunLog(): void {
  const rows = state.research.runLog
    .slice(0, 12)
    .map((entry) => [
      new Date(entry.timestamp).toLocaleTimeString(),
      entry.type,
      entry.label,
      entry.method,
      String(entry.metrics.qualityScore),
      entry.summary
    ]);
  renderResearchTable(
    'rwRunLog',
    ['time', 'type', 'label', 'method', 'score', 'summary'],
    rows,
    'No run log entries yet.'
  );
}
