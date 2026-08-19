/**
 * Public compatibility barrel for the research workbench.
 *
 * The workbench is split by user workflow: tab construction, experiment
 * library/run log, parameter batches, design studies, and rendering.
 */
export {
  researchActions,
  researchCard,
  researchFormRow,
  researchInput,
  researchSelect,
  researchTextArea
} from './research-ui-components';
export {
  buildComparisonRows,
  comparisonRowFromExperiment,
  comparisonRowFromRun,
  renderComparisonMatrix,
  renderPaperSummary
} from './research-comparison';
export { renderResearchTable } from './research-renderers';
export { renderResearchRunLog } from './research-run-log';
export { studySpecFromSnapshot } from './research-batch-runner';
export type { DesignStudyPointState, DesignStudyState } from './research-design-types';
export {
  DESIGN_ORIGIN_COLORS,
  designPointCanvasPosition,
  designSummaryText,
  designTableRows,
  drawDesignHeatmap,
  drawDesignPreview
} from './research-design-renderers';
export { currentLibraryFilter, experimentBadges } from './research-experiment-library-renderer';
export {
  activeResearchSession,
  ensureWorkspaceList,
  upsertResearchSession,
  upsertWorkspaceProfile,
  workspaceOptions
} from './research-workspace-controller';
export {
  doubleSpecFromCurrent,
  runBifurcationDetectPanel,
  runCodimTwoPanel,
  runFixedPointPanel,
  runFtleRidgePanel,
  runMelnikovPanel,
  runRecurrenceNetworkPanel,
  runShadowingPanel,
  runSobolPanel,
  runWadaConvergencePanel,
  superpackChaosClient,
  superpackClient,
  superpackSection
} from './superpack-panels';

export * from './research-workbench-ui';
export * from './research-workbench-experiments';
export * from './research-workbench-parameter-study';
export * from './research-workbench-design-study';
export * from './research-workbench-rendering';
