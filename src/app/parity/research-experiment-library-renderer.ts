/**
 * Experiment-library rendering helpers for the research workbench.
 */
import {
  diffObjects,
  filterExperiments,
  qualityBadges,
  timelineGroups,
  type QualityBadge
} from '../../research/libraryUx';
import { $, clear, html, setText, state, type ResearchExperiment } from './shared';
import { renderResearchTable } from './research-renderers';

export function currentLibraryFilter(): { query: string; tag: string; favoritesOnly: boolean } {
  const query = $('rwLibSearch');
  const tag = $('rwLibTag');
  const fav = $('rwLibFavOnly');
  return {
    query: query instanceof HTMLInputElement ? query.value : '',
    tag: tag instanceof HTMLInputElement ? tag.value : '',
    favoritesOnly: fav instanceof HTMLInputElement ? fav.checked : false
  };
}

export function experimentBadges(experiment: ResearchExperiment): QualityBadge[] {
  return qualityBadges({
    hasSnapshotHash: Boolean(experiment.snapshot.hash && experiment.snapshot.hash !== 'unknown'),
    validationStatus: experiment.metrics.validationStatus,
    drift: experiment.metrics.drift,
    lambdaMax: experiment.metrics.lambdaMax,
    qualityScore: experiment.metrics.qualityScore,
    hasNotes: experiment.notes.trim().length > 0,
    hasTags: experiment.tags.length > 0
  });
}

export function experimentOptionLabel(experiment: ResearchExperiment): string {
  return `${experiment.favorite ? '* ' : ''}${experiment.name}`;
}

export function experimentSummaryText(total: number, filtered: number, selected?: ResearchExperiment): string {
  const filterNote = filtered !== total ? ` (${filtered} matching filter)` : '';
  return selected
    ? `${total} experiment(s)${filterNote}. Selected: ${selected.name}; method=${selected.snapshot.method}; hash=${selected.snapshot.hash}; score=${selected.metrics.qualityScore}`
    : `${total} experiment(s)${filterNote}. Save current state to begin.`;
}

export function experimentBadgeText(experiment?: ResearchExperiment): string {
  return experiment
    ? experimentBadges(experiment)
        .map((badge) => `[${badge}]`)
        .join(' ')
    : '';
}

export function selectedExperimentFromState(): ResearchExperiment | undefined {
  const select = $('rwExperimentSelect');
  const id = select instanceof HTMLSelectElement ? select.value : state.research.selectedExperimentId;
  return state.research.experiments.find((experiment) => experiment.id === id);
}

export function renderResearchExperiments(): void {
  const filtered = filterExperiments(state.research.experiments, currentLibraryFilter());
  const select = $('rwExperimentSelect');
  if (select instanceof HTMLSelectElement) {
    const previous = state.research.selectedExperimentId || select.value;
    clear(select);
    for (const experiment of filtered)
      select.append(html('option', { value: experiment.id, text: experimentOptionLabel(experiment) }));
    if (filtered.some((experiment) => experiment.id === previous)) select.value = previous;
    state.research.selectedExperimentId = select.value || filtered[0]?.id || state.research.experiments[0]?.id || '';
  }
  const diffSelect = $('rwDiffAgainst');
  if (diffSelect instanceof HTMLSelectElement) {
    const previousDiff = diffSelect.value;
    clear(diffSelect);
    for (const experiment of state.research.experiments)
      diffSelect.append(html('option', { value: experiment.id, text: experiment.name }));
    if (state.research.experiments.some((experiment) => experiment.id === previousDiff))
      diffSelect.value = previousDiff;
  }
  const selected = selectedExperimentFromState();
  setText('rwExperimentSummary', experimentSummaryText(state.research.experiments.length, filtered.length, selected));
  if (selected) {
    const badges = experimentBadgeText(selected);
    const citation = selected.citation?.doi ? ` DOI: ${selected.citation.doi}` : '';
    setText('rwLibBadges', `Quality: ${badges || 'no badges'}${citation}`);
    const doiInput = $('rwLibDoi');
    const refInput = $('rwLibRef');
    if (doiInput instanceof HTMLInputElement) doiInput.value = selected.citation?.doi ?? '';
    if (refInput instanceof HTMLInputElement) refInput.value = selected.citation?.reference ?? '';
  } else {
    setText('rwLibBadges', '');
  }
}

export function renderExperimentDiff(selected: ResearchExperiment, other: ResearchExperiment): number {
  const rows = diffObjects(
    { snapshot: selected.snapshot, tags: selected.tags, notes: selected.notes },
    { snapshot: other.snapshot, tags: other.tags, notes: other.notes }
  );
  renderResearchTable(
    'rwLibDiff',
    ['field', selected.name.slice(0, 20), other.name.slice(0, 20)],
    rows.slice(0, 40).map((row) => [row.field, row.a, row.b]),
    'No differences - the two experiments are identical (excluding hashes/timestamps).'
  );
  return rows.length;
}

export function renderExperimentTimeline(): void {
  const groups = timelineGroups(state.research.experiments);
  if (!groups.length) {
    setText('rwLibTimeline', 'No experiments yet.');
    return;
  }
  const rows = groups.flatMap((group) => group.items.map((item) => [group.day, item.time, item.name]));
  renderResearchTable('rwLibTimeline', ['day', 'time', 'experiment'], rows.slice(0, 40), 'No experiments yet.');
}
