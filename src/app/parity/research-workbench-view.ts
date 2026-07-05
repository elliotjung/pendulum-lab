/**
 * Research workbench view: builds the workbench DOM once per session and
 * orchestrates the render order across the state/study/design/comparison
 * controllers. Domain logic stays in the controller modules.
 */
import { downloadJson } from '../../export/manifest';
import { $, ResearchRunLogEntry, append, button, card, currentSnapshot, detailsCard, html, kvGrid, state, toast } from './shared';
import { clearResearchDb, exportResearchDbArchive, exportWorkspaceJson, importResearchDbArchive, importWorkspaceJson, persistResearchState, renderResearchStoragePanel } from './storage-sync';
import { renderPerfBudgetPanel, runBranchTrace, runEnsembleBenchmark, runLegacyValidationSurface, runNumericalProbe, runOrbitFinder } from './runtime-diagnostics';
import { FIGURE_CAPTIONS, exportPaperFigureManifestJson, exportPaperFiguresHtml, exportPaperMethodsLatex, exportPaperMethodsMarkdown, exportPaperPackJson, exportProvenanceJson, exportResearchBundleJson, exportResearchBundleZip, exportResearchNotebook, exportScaledCanvases, exportStudyFigureCsv, exportStudyFigurePng, exportStudyFigureSvg, renderFigureStudio, renderProvenanceViewer, saveSelectedFigureCaption } from './figure-export';
import { exportManifest } from './governance-ui';
import { renderComparisonMatrix, renderPaperSummary } from './research-comparison';
import { renderResearchRunLog } from './research-run-log';
import { researchActions, researchCard, researchFormRow, researchInput, researchSelect, researchTextArea } from './research-ui-components';
import { activeResearchSession, workspaceOptions } from './research-workspace-controller';
import {
  createWorkspaceProfile,
  deleteSelectedExperiment,
  diffSelectedExperiments,
  exportExperimentLibrary,
  forkSelectedExperiment,
  loadSelectedExperiment,
  markResearchRun,
  clearResearchRunLog,
  exportResearchRunLog,
  renderResearchExperiments,
  renderWorkspaceProfile,
  saveCitationForSelected,
  saveCurrentExperiment,
  saveWorkspaceProfile,
  switchWorkspaceProfile,
  toggleExperimentTimeline,
  toggleFavoriteExperiment
} from './research-workbench-state';
import {
  applySelectedStudyPoint,
  cancelStudyBatch,
  clearStudyBatchCheckpoint,
  exportParameterStudy,
  exportParameterStudyResultsCsv,
  generateParameterStudy,
  renderParameterStudy,
  runStudyBatch
} from './study-batch-controller';
import {
  cancelDesignBatch,
  exportDesignStudyCsv,
  exportDesignStudyJson,
  generateDesignStudy,
  renderDesignStudy,
  runDesignBatch
} from './design-study-controller';
import { exportComparisonMatrix, rebuildComparisonMatrix } from './comparison-controller';
// eslint-disable-next-line import/no-cycle
import { runBifurcationDetectPanel, runCodimTwoPanel, runFixedPointPanel, runFtleRidgePanel, runMelnikovPanel, runRecurrenceNetworkPanel, runShadowingPanel, runSobolPanel, runWadaConvergencePanel } from './superpack-panels';

const RESEARCH_WORKBENCH_CHANGED_EVENT = 'pendulum-lab:research-workbench-changed';
let researchWorkbenchEventBridgeInstalled = false;
let researchWorkbenchRenderScheduled = false;

function scheduleResearchWorkbenchRender(): void {
  if (researchWorkbenchRenderScheduled) return;
  researchWorkbenchRenderScheduled = true;
  const render = () => {
    researchWorkbenchRenderScheduled = false;
    renderResearchWorkbench();
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(render);
  } else {
    setTimeout(render, 0);
  }
}

export function dispatchResearchWorkbenchChanged(entry: ResearchRunLogEntry): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(RESEARCH_WORKBENCH_CHANGED_EVENT, { detail: { entryId: entry.id } }));
}

export function installResearchWorkbenchEventBridge(): void {
  if (researchWorkbenchEventBridgeInstalled || typeof window === 'undefined') return;
  researchWorkbenchEventBridgeInstalled = true;
  window.addEventListener(RESEARCH_WORKBENCH_CHANGED_EVENT, () => scheduleResearchWorkbenchRender());
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

export function installResearchTab(): void {
  installResearchWorkbenchEventBridge();
  const panel = $('tab-research');
  // Idempotency guard: build the workbench once. The panel already holds the
  // static Research+ (Inverse · Surrogate · Stochastic) content, so we must key
  // off the workbench's own marker — not childElementCount — or the build is
  // wrongly skipped and #researchWorkbench/#researchExperimentCard never appear.
  if (!panel || panel.querySelector('#researchWorkbench')) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';

  const workbench = html('div', { id: 'researchWorkbench', className: 'research-workbench' });

  const workspaceCard = researchCard('Certified Workspace', 'researchWorkspaceCard');
  workspaceCard.classList.add('research-wide');
  const workspaceSelect = researchSelect('rwWorkspaceSelect', workspaceOptions());
  workspaceSelect.value = state.research.workspace.id;
  workspaceSelect.addEventListener('change', () => switchWorkspaceProfile());
  const projectName = researchInput('rwProjectName', 'text', state.research.project.name, 'project name');
  const sessionName = researchInput('rwSessionName', 'text', activeResearchSession().name, 'session name');
  const workspaceName = researchInput('rwWorkspaceName', 'text', state.research.workspace.name, 'workspace name');
  const workspaceObjective = researchTextArea('rwWorkspaceObjective', 'research objective, flagship claim, reviewer goal');
  workspaceObjective.value = state.research.workspace.objective;
  append(
    workspaceCard,
    researchFormRow('Project', projectName),
    researchFormRow('Session', sessionName),
    researchFormRow('Workspace', workspaceSelect),
    researchFormRow('Name', workspaceName),
    workspaceObjective,
    researchFormRow('Density', researchSelect('rwWorkspaceDensity', [
      ['comfortable', 'comfortable'],
      ['compact', 'compact']
    ])),
    researchActions(
      button('rwSaveWorkspaceProfile', 'Save Profile', () => saveWorkspaceProfile(), 'primary'),
      button('rwNewWorkspaceProfile', 'New Workspace', () => createWorkspaceProfile()),
      button('rwReviewerKitHint', 'Reviewer Kit', () => {
        exportWorkspaceJson();
        toast('Workspace saved. Run npm run reviewer:kit for the external checklist.');
      }),
      button('rwWorkspaceExportTop', 'Save Workspace', () => exportWorkspaceJson()),
      button('rwWorkspaceImportTop', 'Restore Workspace', () => importWorkspaceJson())
    ),
    html('div', { id: 'rwWorkspaceSummary', className: 'research-summary', text: '' })
  );

  const experimentCard = researchCard('Experiment Workspace', 'researchExperimentCard');
  const experimentName = researchInput('rwExperimentName', 'text', '', 'e.g. double-rk4-baseline');
  const experimentNotes = researchTextArea('rwExperimentNotes', 'Notes, hypothesis, source paper, or caveats');
  const experimentTags = researchInput('rwExperimentTags', 'text', 'baseline,local', 'comma separated');
  const experimentSelect = researchSelect('rwExperimentSelect', []);
  experimentSelect.addEventListener('change', () => {
    state.research.selectedExperimentId = experimentSelect.value;
    persistResearchState();
    renderResearchWorkbench();
  });
  const libSearch = researchInput('rwLibSearch', 'text', '', 'search name, notes, tags, DOI');
  libSearch.addEventListener('input', () => renderResearchExperiments());
  const libTag = researchInput('rwLibTag', 'text', '', 'filter by tag');
  libTag.addEventListener('input', () => renderResearchExperiments());
  const libFavOnly = researchInput('rwLibFavOnly', 'checkbox', '', '');
  libFavOnly.addEventListener('change', () => renderResearchExperiments());
  append(
    experimentCard,
    researchFormRow('Name', experimentName),
    researchFormRow('Tags', experimentTags),
    experimentNotes,
    researchFormRow('Search', libSearch),
    researchFormRow('Tag filter', libTag),
    researchFormRow('Favorites', libFavOnly),
    researchFormRow('Saved', experimentSelect),
    researchFormRow('Diff vs', researchSelect('rwDiffAgainst', [])),
    researchFormRow('DOI', researchInput('rwLibDoi', 'text', '', '10.xxxx/...')),
    researchFormRow('Reference', researchInput('rwLibRef', 'text', '', 'citation reference text')),
    researchActions(
      button('rwSaveExperiment', 'Save Current', () => saveCurrentExperiment(), 'primary'),
      button('rwLoadExperiment', 'Load', () => loadSelectedExperiment()),
      button('rwDeleteExperiment', 'Delete', () => deleteSelectedExperiment()),
      button('rwExportExperiments', 'Export Library', () => exportExperimentLibrary())
    ),
    researchActions(
      button('rwToggleFavorite', '★ Favorite', () => toggleFavoriteExperiment()),
      button('rwForkExperiment', 'Fork', () => forkSelectedExperiment()),
      button('rwDiffExperiment', 'Diff', () => diffSelectedExperiments()),
      button('rwSaveCitation', 'Save Citation', () => saveCitationForSelected()),
      button('rwToggleTimeline', 'Timeline', () => toggleExperimentTimeline())
    ),
    html('div', { id: 'rwExperimentSummary', className: 'research-summary', text: 'No experiments saved yet.' }),
    html('div', { id: 'rwLibBadges', className: 'research-summary', text: '' }),
    html('div', { id: 'rwLibDiff', className: 'research-table-wrap' }),
    html('div', { id: 'rwLibTimeline', className: 'research-table-wrap' })
  );

  const logCard = researchCard('Research Run Log', 'researchRunLogCard');
  append(
    logCard,
    researchActions(
      button('rwMarkRun', 'Mark Run', () => markResearchRun(), 'primary'),
      button('rwRunValidationLog', 'Run Validation + Log', () => runLegacyValidationSurface()),
      button('rwClearLog', 'Clear Log', () => clearResearchRunLog()),
      button('rwExportLog', 'Export Log', () => exportResearchRunLog())
    ),
    html('div', { id: 'rwRunLog', className: 'research-table-wrap' })
  );

  const studyCard = researchCard('Parameter Study Builder', 'researchStudyCard');
  const variableSelect = researchSelect('rwStudyVariable', [
    ['theta1', 'theta1 initial'],
    ['theta2', 'theta2 initial'],
    ['omega1', 'omega1 initial'],
    ['omega2', 'omega2 initial'],
    ['damping', 'damping gamma'],
    ['dt', 'time step dt'],
    ['mass-ratio', 'mass ratio m2/m1'],
    ['length-ratio', 'length ratio l2/l1']
  ]);
  const strategySelect = researchSelect('rwStudyStrategy', [
    ['grid', 'grid'],
    ['symmetric', 'symmetric'],
    ['random', 'deterministic random'],
    ['latin-hypercube', 'Latin hypercube'],
    ['edge-focus', 'edge focused'],
    ['sobol', 'low-discrepancy'],
    ['chebyshev', 'Chebyshev nodes']
  ]);
  append(
    studyCard,
    researchFormRow('Variable', variableSelect),
    researchFormRow('Strategy', strategySelect),
    researchFormRow('Min', researchInput('rwStudyMin', 'number', '-1', '')),
    researchFormRow('Max', researchInput('rwStudyMax', 'number', '1', '')),
    researchFormRow('Count', researchInput('rwStudyCount', 'number', '7', '')),
    researchFormRow('Timeout', researchInput('rwStudyTimeout', 'number', '45', 'seconds per point')),
    researchFormRow('Pool', researchInput('rwStudyPool', 'number', '2', 'parallel workers (1-4)')),
    researchFormRow('Point', researchSelect('rwStudyPointSelect', [])),
    researchActions(
      button('rwGenerateStudy', 'Generate Study', () => generateParameterStudy(), 'primary'),
      button('rwApplyStudyPoint', 'Apply Point', () => applySelectedStudyPoint()),
      button('rwExportStudy', 'Export Study', () => exportParameterStudy()),
      button('rwExportStudyCsv', 'Export Results CSV', () => exportParameterStudyResultsCsv())
    ),
    researchActions(
      button('rwRunStudyBatch', 'Run Batch (λ/RQA/FTLE)', () => { void runStudyBatch(); }, 'primary'),
      button('rwResumeStudyBatch', 'Resume Batch', () => { void runStudyBatch({ resume: true }); }),
      button('rwRetryStudyFailures', 'Retry Failed', () => { void runStudyBatch({ failedOnly: true }); }),
      button('rwCancelStudyBatch', 'Cancel Batch', () => cancelStudyBatch()),
      button('rwClearStudyCheckpoint', 'Clear Checkpoint', () => clearStudyBatchCheckpoint())
    ),
    html('div', { id: 'rwStudySummary', className: 'research-summary', text: 'No parameter study generated.' }),
    html('div', { id: 'rwStudyCheckpoint', className: 'research-summary', text: 'No batch checkpoint yet.' }),
    html('div', { id: 'rwStudyInsights', className: 'research-summary', text: 'Study insights will appear after batch diagnostics run.' }),
    html('div', { id: 'rwStudyResults', className: 'research-table-wrap' })
  );

  const designCard = researchCard('Experiment Design (Multi-Variable)', 'researchDesignCard');
  designCard.classList.add('research-wide');
  const designVars = researchTextArea('rwDesignVars', 'one variable per line: key,min,max  (keys: theta1 theta2 omega1 omega2 damping dt mass-ratio length-ratio)');
  designVars.value = 'theta1,1.2,2.8\ndamping,0,0.4';
  const designStrategy = researchSelect('rwDesignStrategy', [
    ['sobol', 'multi-variable Sobol'],
    ['latin-hypercube', 'multi-variable Latin hypercube'],
    ['grid', 'factorial grid']
  ]);
  const designPreview = html('canvas', { id: 'rwDesignPreview' }) as HTMLCanvasElement;
  designPreview.width = 320;
  designPreview.height = 200;
  designPreview.style.width = '100%';
  designPreview.style.maxWidth = '340px';
  const designHeatmap = html('canvas', { id: 'rwDesignHeatmap' }) as HTMLCanvasElement;
  designHeatmap.width = 320;
  designHeatmap.height = 200;
  designHeatmap.style.width = '100%';
  designHeatmap.style.maxWidth = '340px';
  append(
    designCard,
    researchFormRow('Variables', designVars),
    researchFormRow('Strategy', designStrategy),
    researchFormRow('Points', researchInput('rwDesignCount', 'number', '12', 'initial design points')),
    researchFormRow('Replicates', researchInput('rwDesignReplicates', 'number', '1', 'runs per point (1-8)')),
    researchFormRow('Max points', researchInput('rwDesignMaxPoints', 'number', '48', 'budget: total points')),
    researchFormRow('Max time', researchInput('rwDesignMaxTime', 'number', '300', 'budget: seconds')),
    researchFormRow('Max failures', researchInput('rwDesignMaxFailures', 'number', '6', 'budget: failed points')),
    researchActions(
      button('rwGenerateDesign', 'Generate Design', () => generateDesignStudy(), 'primary'),
      button('rwRunDesign', 'Run + Adaptive Refine', () => { void runDesignBatch(); }, 'primary'),
      button('rwCancelDesign', 'Cancel', () => cancelDesignBatch()),
      button('rwExportDesignCsv', 'Export CSV', () => exportDesignStudyCsv()),
      button('rwExportDesignJson', 'Export JSON', () => exportDesignStudyJson())
    ),
    html('div', { id: 'rwDesignSummary', className: 'research-summary', text: 'No design generated. Define variables and generate a multi-dimensional design.' }),
    designPreview,
    designHeatmap,
    html('div', { id: 'rwDesignResults', className: 'research-table-wrap' })
  );

  const superpackCard = researchCard('Analysis Superpack', 'researchSuperpackCard');
  superpackCard.classList.add('research-wide');
  const superpackCanvas = html('canvas', { id: 'rwSuperpackCanvas' }) as HTMLCanvasElement;
  superpackCanvas.width = 320;
  superpackCanvas.height = 200;
  superpackCanvas.style.width = '100%';
  superpackCanvas.style.maxWidth = '340px';
  append(
    superpackCard,
    researchActions(
      button('rwSpWada', 'Wada Convergence', () => { void runWadaConvergencePanel(); }, 'primary'),
      button('rwSpNetwork', 'Recurrence Network', () => { void runRecurrenceNetworkPanel(); }),
      button('rwSpRidges', 'FTLE Ridges', () => { void runFtleRidgePanel(); }),
      button('rwSpBifurcations', 'Detect Bifurcations', () => { void runBifurcationDetectPanel(); }),
      button('rwSpFixedPoint', 'Fixed Point + NS Scan', () => runFixedPointPanel()),
      button('rwSpCodim2', 'Codim-2 Map', () => { void runCodimTwoPanel(); }),
      button('rwSpSobol', 'Sobol Sensitivity', () => { void runSobolPanel(); }),
      button('rwSpShadowing', 'Shadowing Score', () => runShadowingPanel()),
      button('rwSpMelnikov', 'Melnikov Threshold', () => runMelnikovPanel())
    ),
    html('div', { id: 'rwSuperpackResults', className: 'research-summary', text: 'Run an analysis to populate results. Every metric reports method, dt, transient handling, uncertainty, caveat, and a reproducibility hash.' }),
    superpackCanvas
  );

  const comparisonCard = researchCard('Result Comparison Matrix', 'researchComparisonCard');
  append(
    comparisonCard,
    researchActions(
      button('rwRebuildComparison', 'Rebuild Matrix', () => rebuildComparisonMatrix(), 'primary'),
      button('rwExportComparison', 'Export Matrix', () => exportComparisonMatrix())
    ),
    html('div', { id: 'rwComparisonMatrix', className: 'research-table-wrap' })
  );

  const orbitCard = researchCard('Periodic Orbit Finder (Driven Pendulum)', 'researchOrbitCard');
  append(
    orbitCard,
    researchFormRow('Amplitude', researchInput('rwOrbitAmplitude', 'number', '0.3', 'drive amplitude A')),
    researchFormRow('Frequency', researchInput('rwOrbitFrequency', 'number', '0.6667', 'drive frequency ω')),
    researchFormRow('Damping', researchInput('rwOrbitDamping', 'number', '0.5', 'damping γ')),
    researchFormRow('Sweep to', researchInput('rwOrbitSweepTo', 'number', '1.2', 'final amplitude for the branch trace')),
    researchActions(
      button('rwFindOrbit', 'Find Orbit', () => runOrbitFinder(), 'primary'),
      button('rwTraceBranch', 'Trace Branch', () => runBranchTrace())
    ),
    html('div', { id: 'rwOrbitSummary', className: 'research-summary', text: 'Find the period-1 orbit of the damped driven pendulum (Newton on the stroboscopic map) and its Floquet stability.' }),
    html('div', { id: 'rwOrbitBranch', className: 'research-table-wrap' })
  );

  const paperCard = researchCard('Paper Export Pack', 'researchPaperCard');
  paperCard.classList.add('research-wide');
  append(
    paperCard,
    researchActions(
      button('rwExportPaperJson', 'Export Pack JSON', () => exportPaperPackJson(), 'primary'),
      button('rwExportFigures', 'Export Figures', () => exportPaperFiguresHtml()),
      button('rwExportFigureManifest', 'Figure Manifest', () => exportPaperFigureManifestJson()),
      button('rwExportPaperMd', 'Export Methods MD', () => exportPaperMethodsMarkdown()),
      button('rwExportPaperTex', 'Export LaTeX', () => exportPaperMethodsLatex()),
      button('rwExportNotebook', 'Export Notebook', () => exportResearchNotebook()),
      button('rwExportBundle', 'Export Bundle', () => exportResearchBundleJson()),
      button('rwExportBundleZip', 'Export ZIP Bundle', () => exportResearchBundleZip(), 'primary'),
      button('rwExportProvenance', 'Provenance JSON', () => exportProvenanceJson()),
      button('rwViewProvenance', 'View Graph', () => renderProvenanceViewer()),
      button('rwExportManifestPack', 'Export Manifest', () => exportManifest('pendulum_research_manifest_v10_ts.json'))
    ),
    html('div', { id: 'rwPaperSummary', className: 'research-summary', text: 'Paper pack not generated yet.' }),
    html('div', { id: 'rwProvenanceView', className: 'research-table-wrap' })
  );

  const figureCard = researchCard('Figure Studio (Publication Pipeline)', 'researchFigureCard');
  const figureSelect = researchSelect('rwFigSelect', Object.entries(FIGURE_CAPTIONS).map(([id, caption]) => [id, `${id} — ${caption.slice(0, 44)}`]));
  figureSelect.addEventListener('change', () => renderFigureStudio());
  const figureCaption = researchTextArea('rwFigCaption', 'Custom caption for the selected figure (blank restores the default)');
  append(
    figureCard,
    researchFormRow('Theme', researchSelect('rwFigTheme', [
      ['light', 'light'],
      ['dark', 'dark'],
      ['print', 'print (B/W)'],
      ['colorblind', 'colourblind-safe (Okabe–Ito)']
    ])),
    researchFormRow('Scale', researchSelect('rwFigScale', [['1', '1x'], ['2', '2x'], ['4', '4x (print DPI)']])),
    researchFormRow('Figure', figureSelect),
    figureCaption,
    researchActions(
      button('rwFigSaveCaption', 'Save Caption', () => saveSelectedFigureCaption(), 'primary'),
      button('rwFigExportSvg', 'Study Figure SVG', () => exportStudyFigureSvg()),
      button('rwFigExportPng', 'Study Figure PNG', () => { void exportStudyFigurePng(); }),
      button('rwFigExportCsv', 'Figure Source CSV', () => exportStudyFigureCsv()),
      button('rwFigExportCanvases', 'Canvases PNG @ scale', () => exportScaledCanvases())
    ),
    html('div', { id: 'rwFigureSummary', className: 'research-summary', text: 'Vector SVG figures regenerate from saved study data — no physics re-run. PNG exports honour the selected scale.' })
  );

  const perfCard = researchCard('Performance Budget', 'researchPerfCard');
  append(
    perfCard,
    researchActions(
      button('rwPerfRefresh', 'Refresh Budget', () => { void renderPerfBudgetPanel(); }, 'primary'),
      button('rwEnsembleBench', 'Ensemble Benchmark (WebGPU/CPU)', () => { void runEnsembleBenchmark(); })
    ),
    html('div', { id: 'rwPerfBudget', className: 'research-table-wrap' }),
    html('div', { id: 'rwEnsembleResult', className: 'research-summary', text: '' })
  );

  const storageCard = researchCard('Long-Term Storage (IndexedDB)', 'researchStorageCard');
  append(
    storageCard,
    researchActions(
      button('rwDbExport', 'Export DB Archive', () => exportResearchDbArchive(), 'primary'),
      button('rwDbImport', 'Import DB Archive', () => importResearchDbArchive()),
      button('rwDbRefresh', 'Refresh Status', () => renderResearchStoragePanel()),
      button('rwDbClear', 'Clear DB', () => clearResearchDb())
    ),
    researchActions(
      button('rwWorkspaceExport', 'Save Workspace', () => exportWorkspaceJson(), 'primary'),
      button('rwWorkspaceImport', 'Restore Workspace', () => importWorkspaceJson())
    ),
    html('div', { id: 'rwStorageSummary', className: 'research-summary', text: 'IndexedDB status not loaded yet.' })
  );

  append(workbench, workspaceCard, experimentCard, logCard, studyCard, designCard, superpackCard, comparisonCard, orbitCard, paperCard, figureCard, perfCard, storageCard);

  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Integrator Registry Metadata', html('div', { id: 'rgIntegrators' })),
    card('Numerical Conditioning Probe', html('div', { id: 'rgNumerics' })),
    card('Render Graph', html('div', { id: 'rgRenderGraph' })),
    card('Performance Advisor', html('div', { id: 'rgPerf' })),
    card('State Store V2', html('div', { id: 'rgState' })),
    card('Optimization Matrix', html('div', { id: 'rgOpt' })),
    card('Test Matrix', html('div', { id: 'rgTests' }), undefined, 'rg-card rg-wide')
  );
  left.append(workbench, grid);

  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('rgRunProbe', 'Run Numerical Probe', () => runNumericalProbe(), 'primary'),
    button('rgRunTests', 'Run Smoke Tests', () => runLegacyValidationSurface()),
    button('rgSaveExperiment', 'Save Experiment', () => saveCurrentExperiment()),
    button('rgGenerateStudy', 'Generate Study', () => generateParameterStudy()),
    button('rgExportPaperPack', 'Paper Pack', () => exportPaperPackJson()),
    button('rgExportSnapshot', 'Export V2 Snapshot', () => downloadJson('pendulum_snapshot_v2_ts.json', currentSnapshot()))
  );
  append(
    controls,
    detailsCard('Research Controls', actions),
    detailsCard('Strict Contract', html('div', { id: 'rgContract' })),
    detailsCard('Lock-Free Queue', kvGrid('rgQueue', []))
  );
  append(layout, left, controls);
  panel.append(layout);
}
