/**
 * Research workbench facade.
 *
 * The former monolith is split by responsibility; this module only re-exports
 * the stable surface so existing importers keep working:
 *
 * - `research-workbench-state`  — workspace profile, experiment library, run log
 * - `study-batch-controller`    — parameter study plan + worker-pool batches
 * - `design-study-controller`   — multi-variable design + budgeted refinement
 * - `comparison-controller`     — result comparison matrix rebuild/export
 * - `research-workbench-view`   — DOM construction and render orchestration
 */
export {
  applySnapshotControls,
  clearResearchRunLog,
  cloneSnapshot,
  collectResearchMetrics,
  createWorkspaceProfile,
  currentLibraryFilter,
  defaultExperimentName,
  deleteSelectedExperiment,
  diffSelectedExperiments,
  experimentBadges,
  exportExperimentLibrary,
  exportResearchRunLog,
  forkSelectedExperiment,
  loadSelectedExperiment,
  logResearchRun,
  markResearchRun,
  metricValue,
  renderResearchExperiments,
  renderWorkspaceProfile,
  saveCitationForSelected,
  saveCurrentExperiment,
  saveWorkspaceProfile,
  selectedResearchExperiment,
  switchWorkspaceProfile,
  toggleExperimentTimeline,
  toggleFavoriteExperiment
} from './research-workbench-state';
export {
  applySelectedStudyPoint,
  buildParameterStudyInsights,
  buildStudyCheckpointSummary,
  cancelStudyBatch,
  clearStudyBatchCheckpoint,
  exportParameterStudy,
  exportParameterStudyResultsCsv,
  generateParameterStudy,
  parameterStudyResultsCsvText,
  renderParameterStudy,
  runStudyBatch,
  selectedStudyPoint,
  snapshotWithStudyPatch,
  studyBatchTimeoutMs,
  studyCompletionSummary,
  studyEstimate,
  studyJobClient,
  studyJobClientInstance,
  studyJobClientPoolSize,
  studyPlanHash,
  studyPointValue,
  studyPoolSize,
  studyStrategy,
  writeStudyBatchCheckpoint
} from './study-batch-controller';
export {
  DESIGN_ORIGIN_COLORS,
  DESIGN_STORAGE_KEY,
  cancelDesignBatch,
  designBatch,
  designBudgetFromControls,
  designEvaluatedPoints,
  designSnapshotForValues,
  designStudy,
  designStudyCsvText,
  drawDesignHeatmap,
  drawDesignPreview,
  exportDesignStudyCsv,
  exportDesignStudyJson,
  generateDesignStudy,
  loadDesignStudy,
  parseDesignVariables,
  persistDesignStudy,
  renderDesignStudy,
  runDesignBatch,
  setDesignStudy
} from './design-study-controller';
export type { DesignStudyPointState, DesignStudyState } from './design-study-controller';
export { exportComparisonMatrix, rebuildComparisonMatrix } from './comparison-controller';
export {
  dispatchResearchWorkbenchChanged,
  installResearchTab,
  installResearchWorkbenchEventBridge,
  renderResearchWorkbench
} from './research-workbench-view';
export { researchActions, researchCard, researchFormRow, researchInput, researchSelect, researchTextArea } from './research-ui-components';
export { buildComparisonRows, comparisonRowFromExperiment, comparisonRowFromRun, renderComparisonMatrix, renderPaperSummary } from './research-comparison';
export { renderResearchTable } from './research-renderers';
export { renderResearchRunLog } from './research-run-log';
export { studySpecFromSnapshot } from './research-batch-runner';
export { activeResearchSession, ensureWorkspaceList, upsertResearchSession, upsertWorkspaceProfile, workspaceOptions } from './research-workspace-controller';
// eslint-disable-next-line import/no-cycle
export { doubleSpecFromCurrent, runBifurcationDetectPanel, runCodimTwoPanel, runFixedPointPanel, runFtleRidgePanel, runMelnikovPanel, runRecurrenceNetworkPanel, runShadowingPanel, runSobolPanel, runWadaConvergencePanel, superpackChaosClient, superpackClient, superpackSection } from './superpack-panels';
