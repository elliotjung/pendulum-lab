import type { RuntimeSnapshot } from '../types/domain';

/**
 * A single semantic commit emitted after code updates several Lab controls.
 * Individual user edits still use native `change` events; presets, deep links,
 * and imports use this event so the simulation rebuilds exactly once.
 */
export const LAB_CONTROLS_COMMITTED_EVENT = 'pendulum:lab-controls-committed';

export type LabControlCommitSource = 'preset' | 'deep-link' | 'saved-run-import';

export interface LabControlCommitDetail {
  source: LabControlCommitSource;
  controlIds: string[];
  snapshot?: RuntimeSnapshot;
}

export function commitLabControls(
  source: LabControlCommitSource,
  controlIds: Iterable<string>,
  snapshot?: RuntimeSnapshot
): void {
  document.dispatchEvent(
    new CustomEvent<LabControlCommitDetail>(LAB_CONTROLS_COMMITTED_EVENT, {
      detail: { source, controlIds: Array.from(new Set(controlIds)), ...(snapshot ? { snapshot } : {}) }
    })
  );
}
