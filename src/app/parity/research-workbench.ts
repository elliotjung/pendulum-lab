/**
 * Research Workbench: experiments, run log, parameter/design studies, analysis superpack.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { RuntimeSnapshot } from '../../types/domain';
import { downloadJson } from '../../export/manifest';
import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../chaos/continuation';
import { chaosWorkerTransportFactory, JobCancelledError, JobClient } from '../../runtime/JobClient';
import { ChaosClient } from '../../runtime/ChaosClient';
import type { StudyPointResponse } from '../../workers/chaosProtocol';
import { buildRhs, type SystemSpec } from '../../physics/systemSpec';
import { classifyFixedPoint } from '../../chaos/fixedPointClassify';
import { detectBifurcations } from '../../chaos/bifurcationDetect';
import { detectNeimarkSacker } from '../../chaos/neimarkSacker';
import { recurrenceNetworkMetrics } from '../../chaos/recurrenceNetwork';
import { extractFtleRidges } from '../../chaos/ftleRidge';
import { shadowingHorizon } from '../../chaos/shadowing';
import { melnikovVerdict } from '../../chaos/melnikov';
import { csvCell, hashText } from '../../research/researchExportUtils';
import { generateStudyValues } from '../../research/researchSampling';
import {
  diffObjects,
  filterExperiments,
  forkExperimentData,
  qualityBadges,
  timelineGroups,
  validateDoi,
  type QualityBadge
} from '../../research/libraryUx';
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
import { ParameterStudyPlan, ParameterStudyPoint, ResearchBatchStatus, ResearchComparisonRow, ResearchExperiment, ResearchMetrics, ResearchRunLogEntry, ResearchRunType, StudyPointResults, append, button, card, clear, currentParameters, currentSnapshot, detailsCard, downloadText, html, kvGrid, modernLab, numberFrom, researchUid, selectValue, setControl, setText, state, toast } from './shared';
import { MAX_RESEARCH_EXPERIMENTS, RESEARCH_STUDY_STRATEGIES, clampNumber, clearResearchDb, exportResearchDbArchive, exportWorkspaceJson, finiteNumber, importResearchDbArchive, importWorkspaceJson, persistResearchState, renderResearchStoragePanel, researchDbInstance } from './storage-sync';
import { orbitBaseFromControls, renderPerfBudgetPanel, runBranchTrace, runEnsembleBenchmark, runLegacyValidationSurface, runNumericalProbe, runOrbitFinder } from './runtime-diagnostics';
import { FIGURE_CAPTIONS, exportPaperFigureManifestJson, exportPaperFiguresHtml, exportPaperMethodsLatex, exportPaperMethodsMarkdown, exportPaperPackJson, exportProvenanceJson, exportResearchBundleJson, exportResearchBundleZip, exportResearchNotebook, exportScaledCanvases, exportStudyFigureCsv, exportStudyFigurePng, exportStudyFigureSvg, renderFigureStudio, renderProvenanceViewer, saveSelectedFigureCaption } from './figure-export';
import { exportManifest, setMode } from './governance-ui';
import { $ } from './shared';


export function installResearchTab(): void {
  const panel = $('tab-research');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';

  const workbench = html('div', { id: 'researchWorkbench', className: 'research-workbench' });

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

  append(workbench, experimentCard, logCard, studyCard, designCard, superpackCard, comparisonCard, orbitCard, paperCard, figureCard, perfCard, storageCard);

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

export function researchCard(title: string, id: string): HTMLElement {
  const section = html('section', { id, className: 'research-card' });
  section.append(html('div', { className: 'research-title', text: title }));
  return section;
}

export function researchInput(id: string, type: string, value: string, placeholder: string): HTMLInputElement {
  const input = html('input', { id });
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  if (type === 'number') input.step = 'any';
  return input;
}

export function researchTextArea(id: string, placeholder: string): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.placeholder = placeholder;
  return textarea;
}

export function researchSelect(id: string, options: Array<[string, string]>): HTMLSelectElement {
  const select = html('select', { id });
  for (const [value, label] of options) select.append(html('option', { value, text: label }));
  return select;
}

export function researchFormRow(label: string, child: HTMLElement): HTMLDivElement {
  const rowNode = html('div', { className: 'research-form-row' });
  append(rowNode, html('label', { text: label }), child);
  return rowNode;
}

export function researchActions(...children: HTMLElement[]): HTMLDivElement {
  const rowNode = html('div', { className: 'research-actions' });
  children.forEach((child) => rowNode.append(child));
  return rowNode;
}


export function cloneSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RuntimeSnapshot;
}

export function collectResearchMetrics(validationStatus = 'not-run'): ResearchMetrics {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const drift = Number.isFinite(diag?.drift ?? Number.NaN) ? diag!.drift : null;
  const lambdaMax = Number.isFinite(diag?.lambdaMax ?? Number.NaN) ? diag!.lambdaMax : null;
  const fps = Number.isFinite(diag?.fps ?? Number.NaN) ? diag!.fps : null;
  const physicsMsPerFrame = Number.isFinite(diag?.physicsMsPerFrame ?? Number.NaN) ? diag!.physicsMsPerFrame : null;
  let score = 100;
  if (!snapshot.state.every(Number.isFinite)) score -= 60;
  if (snapshot.systemType === 'triple') score -= 8;
  if (snapshot.damping > 0) score -= 5;
  if (drift !== null && Math.abs(drift) > 1e-2) score -= 16;
  if (drift !== null && Math.abs(drift) > 1e-1) score -= 20;
  if (validationStatus.toLowerCase().includes('fail')) score -= 25;
  if (fps !== null && fps < 20) score -= 8;
  return {
    drift,
    lambdaMax,
    fps,
    physicsMsPerFrame,
    poincarePoints: diag?.poincarePoints ?? 0,
    qualityScore: Math.max(0, Math.min(100, Math.round(score))),
    validationStatus
  };
}

export function metricValue(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value) ? '-' : Math.abs(value) >= 1000 || Math.abs(value) < 0.01 ? value.toExponential(2) : value.toFixed(digits);
}

export function selectedResearchExperiment(): ResearchExperiment | undefined {
  const select = $('rwExperimentSelect');
  const id = select instanceof HTMLSelectElement ? select.value : state.research.selectedExperimentId;
  return state.research.experiments.find((experiment) => experiment.id === id);
}

export function defaultExperimentName(snapshot: RuntimeSnapshot): string {
  return `${snapshot.systemType}-${snapshot.method}-dt${snapshot.dt.toPrecision(3)}-${snapshot.hash.slice(0, 8)}`;
}

export function saveCurrentExperiment(): void {
  const snapshot = currentSnapshot();
  const nameInput = $('rwExperimentName');
  const notesInput = $('rwExperimentNotes');
  const tagsInput = $('rwExperimentTags');
  const name = nameInput instanceof HTMLInputElement && nameInput.value.trim() ? nameInput.value.trim() : defaultExperimentName(snapshot);
  const notes = notesInput instanceof HTMLTextAreaElement ? notesInput.value.trim() : '';
  const tags = tagsInput instanceof HTMLInputElement ? tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  const experiment: ResearchExperiment = {
    id: researchUid('exp'),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes,
    tags,
    snapshot,
    metrics: collectResearchMetrics('not-run')
  };
  state.research.experiments.unshift(experiment);
  state.research.experiments = state.research.experiments.slice(0, 60);
  state.research.selectedExperimentId = experiment.id;
  persistResearchState();
  logResearchRun('experiment', 'Saved experiment', name, 'localStorage');
  renderResearchWorkbench();
  toast('Experiment saved');
}

export function applySnapshotControls(snapshot: RuntimeSnapshot): void {
  setMode(snapshot.mode);
  setControl('sysType', snapshot.systemType);
  setControl('method', snapshot.method);
  setControl('dt', snapshot.dt);
  setControl('gamma', snapshot.damping);
  setControl('m1', snapshot.parameters.m1);
  setControl('m2', snapshot.parameters.m2);
  setControl('m3', snapshot.parameters.m3 ?? 1);
  setControl('l1', snapshot.parameters.l1);
  setControl('l2', snapshot.parameters.l2);
  setControl('l3', snapshot.parameters.l3 ?? 0.8);
  setControl('g', snapshot.parameters.g);
  if (snapshot.systemType === 'triple') {
    setControl('th1', snapshot.state[0] ?? 0);
    setControl('th2', snapshot.state[1] ?? 0);
    setControl('th3', snapshot.state[2] ?? 0);
    setControl('iw1', snapshot.state[3] ?? 0);
    setControl('iw2', snapshot.state[4] ?? 0);
    setControl('iw3', snapshot.state[5] ?? 0);
  } else {
    setControl('th1', snapshot.state[0] ?? 0);
    setControl('th2', snapshot.state[1] ?? 0);
    setControl('iw1', snapshot.state[2] ?? 0);
    setControl('iw2', snapshot.state[3] ?? 0);
  }
  modernLab()?.reset?.();
}

export function loadSelectedExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  applySnapshotControls(experiment.snapshot);
  state.research.selectedExperimentId = experiment.id;
  persistResearchState();
  logResearchRun('experiment', 'Loaded experiment', experiment.name);
  renderResearchWorkbench();
  toast('Experiment loaded');
}

export function deleteSelectedExperiment(): void {
  const experiment = selectedResearchExperiment();
  if (!experiment) {
    toast('No experiment selected');
    return;
  }
  state.research.experiments = state.research.experiments.filter((item) => item.id !== experiment.id);
  state.research.selectedExperimentId = state.research.experiments[0]?.id ?? '';
  persistResearchState();
  renderResearchWorkbench();
  toast('Experiment deleted');
}

export function exportExperimentLibrary(): void {
  downloadJson('pendulum_research_experiment_library.json', {
    schemaVersion: 'pendulum-research-experiments/v1',
    generatedAt: new Date().toISOString(),
    experiments: state.research.experiments
  });
  logResearchRun('export', 'Experiment library export', `${state.research.experiments.length} experiments`, 'pendulum_research_experiment_library.json');
}

export function logResearchRun(type: ResearchRunType, label: string, summary: string, artifact = '', validationStatus = 'not-run'): ResearchRunLogEntry {
  const snapshot = currentSnapshot();
  const entry: ResearchRunLogEntry = {
    id: researchUid('run'),
    type,
    label,
    timestamp: new Date().toISOString(),
    experimentId: state.research.selectedExperimentId || null,
    snapshotHash: snapshot.hash,
    method: snapshot.method,
    system: snapshot.systemType,
    dt: snapshot.dt,
    damping: snapshot.damping,
    metrics: collectResearchMetrics(validationStatus),
    summary
  };
  if (artifact) entry.artifact = artifact;
  state.research.runLog.unshift(entry);
  state.research.runLog = state.research.runLog.slice(0, 100);
  persistResearchState();
  renderResearchWorkbench();
  return entry;
}

export function markResearchRun(): void {
  logResearchRun('probe', 'Manual research mark', 'Current state captured in run log.');
  toast('Run marked');
}

export function clearResearchRunLog(): void {
  state.research.runLog = [];
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
  toast('Run log cleared');
}

export function exportResearchRunLog(): void {
  downloadJson('pendulum_research_run_log.json', {
    schemaVersion: 'pendulum-research-run-log/v1',
    generatedAt: new Date().toISOString(),
    entries: state.research.runLog
  });
  logResearchRun('export', 'Run log export', `${state.research.runLog.length} entries`, 'pendulum_research_run_log.json');
}

export function studyStrategy(): ParameterStudyPlan['strategy'] {
  const raw = selectValue('rwStudyStrategy', 'grid');
  return RESEARCH_STUDY_STRATEGIES.has(raw as ParameterStudyPlan['strategy']) ? raw as ParameterStudyPlan['strategy'] : 'grid';
}

export function snapshotWithStudyPatch(base: RuntimeSnapshot, variable: string, value: number): RuntimeSnapshot {
  const snapshot = cloneSnapshot(base);
  const omega1Index = snapshot.systemType === 'triple' ? 3 : 2;
  const omega2Index = snapshot.systemType === 'triple' ? 4 : 3;
  switch (variable) {
    case 'theta1':
      snapshot.state[0] = value;
      break;
    case 'theta2':
      snapshot.state[1] = value;
      break;
    case 'omega1':
      snapshot.state[omega1Index] = value;
      break;
    case 'omega2':
      snapshot.state[omega2Index] = value;
      break;
    case 'damping':
      snapshot.damping = Math.max(0, value);
      break;
    case 'dt':
      snapshot.dt = Math.max(1e-6, value);
      break;
    case 'mass-ratio':
      snapshot.parameters.m2 = Math.max(1e-6, snapshot.parameters.m1 * value);
      break;
    case 'length-ratio':
      snapshot.parameters.l2 = Math.max(1e-6, snapshot.parameters.l1 * value);
      break;
    default:
      break;
  }
  snapshot.hash = `${base.hash.slice(0, 10)}-${variable}-${value.toPrecision(4)}`;
  return snapshot;
}

export function studyEstimate(snapshot: RuntimeSnapshot): string {
  const stiffness = snapshot.dt < 0.001 ? 'high cost' : snapshot.dt < 0.004 ? 'medium cost' : 'low cost';
  const caveat = snapshot.systemType === 'triple' ? 'triple sensitivity' : snapshot.damping > 0 ? 'dissipative' : 'conservative';
  return `${stiffness}, ${caveat}`;
}

export function generateParameterStudy(): void {
  const variable = selectValue('rwStudyVariable', 'theta1');
  const strategy = studyStrategy();
  const min = numberFrom('rwStudyMin', -1);
  const max = numberFrom('rwStudyMax', 1);
  const count = numberFrom('rwStudyCount', 7);
  const base = currentSnapshot();
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const values = generateStudyValues(strategy, lo, hi, count, base.hash);
  const plan: ParameterStudyPlan = {
    id: researchUid('study'),
    generatedAt: new Date().toISOString(),
    variable,
    strategy,
    min: lo,
    max: hi,
    count: values.length,
    values,
    experiments: values.map((value, index) => {
      const snapshot = snapshotWithStudyPatch(base, variable, value);
      return {
        id: researchUid('point'),
        label: `${variable}=${value.toPrecision(6)}`,
        patch: { [variable]: value },
        snapshot,
        estimate: studyEstimate(snapshot)
      };
    })
  };
  state.research.parameterStudy = plan;
  persistResearchState();
  logResearchRun('parameter-study', 'Generated parameter study', `${variable} ${strategy} ${values.length} points`);
  renderResearchWorkbench();
  toast('Parameter study generated');
}

export function selectedStudyPoint(): ParameterStudyPoint | undefined {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  const id = select instanceof HTMLSelectElement ? select.value : '';
  return plan?.experiments.find((point) => point.id === id) ?? plan?.experiments[0];
}

export function applySelectedStudyPoint(): void {
  const point = selectedStudyPoint();
  if (!point) {
    toast('No study point available');
    return;
  }
  applySnapshotControls(point.snapshot);
  logResearchRun('parameter-study', 'Applied study point', point.label);
  renderResearchWorkbench();
  toast('Study point applied');
}

export const studyBatch = {
  running: false,
  cancelled: false,
  current: 0,
  total: 0,
  completed: 0,
  failed: 0,
  timeoutMs: 45_000,
  poolSize: 2,
  cancelInFlight: null as (() => void) | null
};

export let studyJobClient: JobClient | null = null;
export let studyJobClientPoolSize = 0;

/** V2 job client with a worker pool; rebuilt when the requested pool size changes. */
export function studyJobClientInstance(poolSize: number): JobClient {
  if (studyJobClient && studyJobClientPoolSize !== poolSize) {
    studyJobClient.terminate();
    studyJobClient = null;
  }
  if (!studyJobClient) {
    studyJobClient = new JobClient(chaosWorkerTransportFactory(), { poolSize });
    studyJobClientPoolSize = poolSize;
  }
  return studyJobClient;
}

export function studyPoolSize(): number {
  return Math.round(clampNumber(numberFrom('rwStudyPool', 2), 2, 1, 4));
}

export function writeStudyBatchCheckpoint(plan: ParameterStudyPlan, status: ResearchBatchStatus, message: string, nextIndex = studyBatch.current): void {
  const existing = state.research.batchCheckpoint?.planId === plan.id ? state.research.batchCheckpoint : null;
  const summary = studyCompletionSummary(plan);
  const now = new Date().toISOString();
  state.research.batchCheckpoint = {
    id: existing?.id ?? researchUid('batch'),
    planId: plan.id,
    planHash: summary.planHash,
    status,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    completed: summary.complete,
    failed: summary.failed,
    pending: summary.pending,
    nextIndex: Math.max(0, Math.min(plan.experiments.length, Math.round(nextIndex))),
    total: plan.experiments.length,
    timeoutMs: studyBatch.timeoutMs,
    message
  };
}

export function clearStudyBatchCheckpoint(): void {
  state.research.batchCheckpoint = null;
  persistResearchState();
  renderResearchWorkbench();
  toast('Batch checkpoint cleared');
}

export function studyBatchTimeoutMs(): number {
  const seconds = clampNumber(numberFrom('rwStudyTimeout', 45), 45, 5, 300);
  return Math.round(seconds * 1000);
}

/** Map a study-point snapshot onto the declarative chaos-job system spec. */
export function studySpecFromSnapshot(snapshot: RuntimeSnapshot): { spec: SystemSpec; state0: number[] } {
  const p = snapshot.parameters;
  if (snapshot.systemType === 'triple') {
    const spec: SystemSpec = {
      kind: 'triple',
      m1: p.m1, m2: p.m2, m3: p.m3 ?? 1,
      l1: p.l1, l2: p.l2, l3: p.l3 ?? 0.8,
      g: p.g
    };
    return { spec, state0: snapshot.state.slice(0, 6) };
  }
  const spec: SystemSpec = { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  return { spec, state0: snapshot.state.slice(0, 4) };
}

/**
 * Batch-execute every point of the current parameter study on the chaos worker:
 * maximal Lyapunov (+block SE), RQA determinism/divergence, and per-point FTLE.
 * Points run sequentially so the worker is never flooded; progress renders after
 * each point and the run is cancellable between points.
 */
export async function runStudyBatch(options: { failedOnly?: boolean; resume?: boolean } = {}): Promise<void> {
  const plan = state.research.parameterStudy;
  if (!plan || plan.experiments.length === 0) {
    toast('Generate a parameter study first');
    return;
  }
  if (studyBatch.running) {
    toast('Batch already running');
    return;
  }
  const targets = plan.experiments
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => options.failedOnly ? Boolean(point.error) : !point.results);
  if (targets.length === 0) {
    toast(options.failedOnly ? 'No failed study points to retry' : 'All study points already have results');
    return;
  }
  studyBatch.running = true;
  studyBatch.cancelled = false;
  studyBatch.current = 0;
  studyBatch.total = targets.length;
  studyBatch.completed = 0;
  studyBatch.failed = 0;
  studyBatch.timeoutMs = studyBatchTimeoutMs();
  studyBatch.poolSize = studyPoolSize();
  writeStudyBatchCheckpoint(plan, 'running', options.failedOnly ? 'Retrying failed study points.' : options.resume ? 'Resuming pending study points.' : 'Running pending study points.', 0);
  persistResearchState();
  renderParameterStudy();
  // Protocol V2: each point is a jobId-tracked studyPoint job on the worker
  // pool. Cancellation is a protocol message (phase-boundary stop with
  // checkpoint), not a worker teardown; timeouts are enforced by the engine at
  // phase boundaries and by the client as a wedged-kernel backstop.
  const client = studyJobClientInstance(studyBatch.poolSize);
  const inFlight = new Set<ReturnType<JobClient['submit']>>();
  studyBatch.cancelInFlight = () => {
    for (const handle of inFlight) handle.cancel();
  };
  let nextTarget = 0;
  let processed = 0;
  const maxAttempts = options.failedOnly ? 2 : 1;
  const runNext = async (): Promise<void> => {
    for (;;) {
      if (studyBatch.cancelled) return;
      const targetIndex = nextTarget;
      nextTarget += 1;
      if (targetIndex >= targets.length) return;
      const { point } = targets[targetIndex]!;
      const startedAt = performance.now();
      const { spec, state0 } = studySpecFromSnapshot(point.snapshot);
      const dt = Math.min(0.01, point.snapshot.dt || 0.01);
      let lastError = '';
      let res: StudyPointResponse | null = null;
      for (let attempt = 1; attempt <= maxAttempts && !studyBatch.cancelled; attempt += 1) {
        point.attempts = (point.attempts ?? 0) + 1;
        delete point.error;
        const handle = client.submit(
          { id: `${point.id}-a${point.attempts}`, kind: 'studyPoint', spec, state0, settings: { lyapunov: { dt } } },
          { timeoutMs: studyBatch.timeoutMs, checkpointEvery: 1 }
        );
        inFlight.add(handle);
        try {
          res = (await handle.result) as StudyPointResponse;
          inFlight.delete(handle);
          break;
        } catch (error) {
          inFlight.delete(handle);
          if (error instanceof JobCancelledError) {
            studyBatch.cancelled = true;
            lastError = 'cancelled by user';
            break;
          }
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      if (res) {
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
        studyBatch.completed += 1;
      } else {
        point.error = lastError || 'no result returned';
        studyBatch.failed += 1;
        if (studyBatch.cancelled || point.error.toLowerCase().includes('cancelled')) {
          studyBatch.cancelled = true;
          persistResearchState();
          renderParameterStudy();
          return;
        }
      }
      processed += 1;
      studyBatch.current = processed;
      persistResearchState();
      writeStudyBatchCheckpoint(plan, 'running', `Processed ${studyBatch.current}/${studyBatch.total} target point(s).`, processed);
      persistResearchState();
      renderParameterStudy();
    }
  };
  await Promise.all(Array.from({ length: Math.min(studyBatch.poolSize, targets.length) }, () => runNext()));
  studyBatch.cancelInFlight = null;
  const done = plan.experiments.filter((point) => point.results).length;
  studyBatch.running = false;
  const failed = plan.experiments.filter((point) => point.error).length;
  writeStudyBatchCheckpoint(
    plan,
    studyBatch.cancelled ? 'cancelled' : failed > 0 ? 'failed' : 'complete',
    studyBatch.cancelled ? `Cancelled at ${done}/${plan.experiments.length}.` : failed > 0 ? `${failed} point(s) failed; resume or retry failed points.` : 'All study points completed.',
    studyBatch.cancelled ? studyBatch.current : plan.experiments.length
  );
  persistResearchState();
  logResearchRun(
    'parameter-study',
    studyBatch.cancelled ? 'Batch cancelled' : options.failedOnly ? 'Batch retry complete' : 'Batch complete',
    `${done}/${plan.experiments.length} points filled; ${failed} failed; timeout ${Math.round(studyBatch.timeoutMs / 1000)}s`
  );
  renderResearchWorkbench();
  toast(studyBatch.cancelled ? `Batch cancelled at ${done}/${plan.experiments.length}` : `Batch complete: ${done}/${plan.experiments.length} filled, ${failed} failed`);
}

export function cancelStudyBatch(): void {
  if (!studyBatch.running) {
    toast('No batch running');
    return;
  }
  studyBatch.cancelled = true;
  studyBatch.cancelInFlight?.();
  toast('Cancelling batch...');
}

export function exportParameterStudy(): void {
  if (!state.research.parameterStudy) generateParameterStudy();
  const plan = state.research.parameterStudy;
  downloadJson('pendulum_parameter_study_plan.json', {
    schemaVersion: 'pendulum-parameter-study/v1',
    generatedAt: new Date().toISOString(),
    planHash: plan ? studyPlanHash(plan) : null,
    batch: plan ? studyCompletionSummary(plan) : null,
    checkpoint: state.research.batchCheckpoint,
    plan
  });
  logResearchRun('export', 'Parameter study export', state.research.parameterStudy ? `${state.research.parameterStudy.count} points` : 'no plan', 'pendulum_parameter_study_plan.json');
}

export function studyPointValue(plan: ParameterStudyPlan, point: ParameterStudyPoint, index: number): number | string {
  const patched = point.patch[plan.variable];
  if (typeof patched === 'number' || typeof patched === 'string') return patched;
  return plan.values[index] ?? '';
}

export function studyPlanHash(plan: ParameterStudyPlan): string {
  return hashText(JSON.stringify({
    id: plan.id,
    generatedAt: plan.generatedAt,
    variable: plan.variable,
    strategy: plan.strategy,
    min: plan.min,
    max: plan.max,
    values: plan.values,
    snapshots: plan.experiments.map((point) => point.snapshot.hash)
  }));
}

export function studyCompletionSummary(plan: ParameterStudyPlan): { complete: number; failed: number; pending: number; planHash: string } {
  const complete = plan.experiments.filter((point) => point.results).length;
  const failed = plan.experiments.filter((point) => point.error && !point.results).length;
  return {
    complete,
    failed,
    pending: Math.max(0, plan.experiments.length - complete - failed),
    planHash: studyPlanHash(plan)
  };
}

export function exportParameterStudyResultsCsv(): void {
  const plan = state.research.parameterStudy;
  if (!plan) {
    toast('Generate a parameter study first');
    return;
  }
  downloadText('pendulum_parameter_study_results.csv', parameterStudyResultsCsvText(plan), 'text/csv;charset=utf-8');
  logResearchRun('export', 'Parameter study CSV export', `${plan.experiments.length} rows`, 'pendulum_parameter_study_results.csv');
}

export function parameterStudyResultsCsvText(plan: ParameterStudyPlan): string {
  const rows = [[
    'point_id',
    'label',
    'variable',
    'value',
    'lambda_max',
    'lambda_block_std_error',
    'rqa_determinism',
    'rqa_divergence',
    'ftle',
    'duration_ms',
    'attempts',
    'error',
    'snapshot_hash'
  ]];
  plan.experiments.forEach((point, index) => {
    rows.push([
      point.id,
      point.label,
      plan.variable,
      String(studyPointValue(plan, point, index)),
      point.results ? String(point.results.lambdaMax) : '',
      point.results ? String(point.results.lambdaBlockStdError) : '',
      point.results ? String(point.results.rqaDeterminism) : '',
      point.results ? String(point.results.rqaDivergence) : '',
      point.results ? String(point.results.ftle) : '',
      point.results?.durationMs ? String(point.results.durationMs) : '',
      point.attempts ? String(point.attempts) : '',
      point.error ?? '',
      point.snapshot.hash
    ]);
  });
  const header = [
    `# schemaVersion=pendulum-parameter-study-results/v1`,
    `# generatedAt=${new Date().toISOString()}`,
    `# planHash=${studyPlanHash(plan)}`,
    `# variable=${plan.variable}`,
    `# strategy=${plan.strategy}`
  ];
  return [...header, ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

// --- Multi-variable experiment design ---------------------------------------

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
export const DESIGN_VARIABLE_KEYS = new Set(['theta1', 'theta2', 'omega1', 'omega2', 'damping', 'dt', 'mass-ratio', 'length-ratio']);

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
  for (const line of text.split('\n')) {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length < 3) continue;
    const key = parts[0] ?? '';
    const min = Number(parts[1]);
    const max = Number(parts[2]);
    if (!DESIGN_VARIABLE_KEYS.has(key) || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) continue;
    if (variables.some((variable) => variable.key === key)) continue;
    variables.push({ key, min, max });
    if (variables.length >= 4) break;
  }
  return variables;
}

export function designBudgetFromControls(): DesignBudget {
  return {
    maxPoints: Math.round(clampNumber(numberFrom('rwDesignMaxPoints', 48), 48, 4, 256)),
    maxTimeMs: Math.round(clampNumber(numberFrom('rwDesignMaxTime', 300), 300, 10, 3600) * 1000),
    maxFailures: Math.round(clampNumber(numberFrom('rwDesignMaxFailures', 6), 6, 1, 64))
  };
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

// --- Analysis superpack ------------------------------------------------------

export let superpackChaosClient: ChaosClient | null = null;

export function superpackClient(): ChaosClient {
  if (!superpackChaosClient) superpackChaosClient = new ChaosClient();
  return superpackChaosClient;
}

export function doubleSpecFromCurrent(): Extract<SystemSpec, { kind: 'double' }> {
  const p = currentParameters();
  return { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
}

/** Replace (or append) one titled analysis section inside the superpack results. */
export function superpackSection(key: string, title: string, lines: string[]): void {
  const target = $('rwSuperpackResults');
  if (!target) return;
  if (target.dataset.cleared !== '1') {
    target.textContent = '';
    target.dataset.cleared = '1';
  }
  let section = target.querySelector<HTMLElement>(`[data-superpack="${key}"]`);
  if (!section) {
    section = html('div', { className: 'research-summary' });
    section.dataset.superpack = key;
    target.append(section);
  }
  clear(section);
  append(section, html('strong', { text: title }));
  for (const line of lines) append(section, html('div', { text: line }));
}

export async function runWadaConvergencePanel(): Promise<void> {
  superpackSection('wada', 'Wada Resolution Convergence', ['Computing flip basins at 3 resolutions on the chaos worker…']);
  try {
    const response = await superpackClient().wadaConvergence(doubleSpecFromCurrent(), { resolutions: [30, 45, 60], maxTime: 12, dt: 0.015 });
    const result = response.result;
    superpackSection('wada', `Wada Resolution Convergence — ${result.verdict.toUpperCase()}`, [
      `Wada fraction by resolution: ${result.resolutions.map((n, i) => `${n}px=${(result.wadaFractions[i] ?? 0).toFixed(3)}`).join(', ')}`,
      `Adjacent deltas: ${result.adjacentDeltas.map((d) => d.toFixed(3)).join(', ')} (max ${result.maxAdjacentDelta.toFixed(3)}, tolerance ${result.convergenceTolerance})`,
      `Basin colours: ${result.numColors.join(', ')}; candidacy threshold ${result.threshold}, radius ${result.radius} cells`,
      `Method: ${result.method}`,
      `dt=${result.dt}, maxTime=${result.maxTime}s; ${result.transientHandling}`,
      `Caveat: ${result.caveat}`,
      `Reproducibility hash: ${result.reproducibilityHash}; grid hashes: ${result.gridHashes.join(', ')}`
    ]);
    logResearchRun('probe', 'Wada convergence', `${result.verdict}; fractions ${result.wadaFractions.map((f) => f.toFixed(2)).join('/')}`);
  } catch (error) {
    superpackSection('wada', 'Wada Resolution Convergence — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

export async function runRecurrenceNetworkPanel(): Promise<void> {
  superpackSection('network', 'Recurrence Network', ['Sampling observable and building the recurrence network…']);
  try {
    const snapshot = currentSnapshot();
    const { spec, state0 } = studySpecFromSnapshot(snapshot);
    const rqa = await superpackClient().rqa(spec, state0, { samples: 240 });
    const metrics = recurrenceNetworkMetrics(rqa.plot, rqa.plotSize);
    superpackSection('network', 'Recurrence Network (Donner et al. 2010)', [
      `Nodes ${metrics.nodes}, edges ${metrics.edges}, density ${metrics.density.toFixed(4)}`,
      `Degree: mean ${metrics.meanDegree.toFixed(2)}, max ${metrics.maxDegree}, std ${metrics.degreeStd.toFixed(2)}`,
      `Clustering ${metrics.clusteringCoefficient.toFixed(4)}, transitivity ${metrics.transitivity.toFixed(4)}`,
      `Average path length ${metrics.averagePathLength.toFixed(3)} over largest component (${metrics.largestComponent} nodes)`,
      `Method: recurrence matrix (epsilon=${rqa.epsilon.toFixed(4)}, embedding from RQA settings) as adjacency; dt=0.01 sampler, 2000-step transient discarded`,
      `Uncertainty: DET block-SE ${rqa.determinismStdError.toFixed(4)} over ${rqa.uncertaintyBlocks} blocks (network measures share the same sampling variability)`,
      `Caveat: ${metrics.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ hash: snapshot.hash, samples: 240, epsilon: rqa.epsilon }))}`
    ]);
    logResearchRun('probe', 'Recurrence network', `density ${metrics.density.toFixed(3)}, transitivity ${metrics.transitivity.toFixed(3)}`);
  } catch (error) {
    superpackSection('network', 'Recurrence Network — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

export async function runFtleRidgePanel(): Promise<void> {
  superpackSection('ridges', 'FTLE Ridge Extraction', ['Computing the FTLE field on the chaos worker…']);
  try {
    const field = await superpackClient().ftle(doubleSpecFromCurrent(), { n: 48 });
    const ridges = extractFtleRidges(field.values, field.width, field.height, { percentile: 0.85 });
    const canvas = $('rwSuperpackCanvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const cellW = canvas.width / field.width;
        const cellH = canvas.height / field.height;
        const span = field.max - field.min || 1;
        for (let y = 0; y < field.height; y += 1) {
          for (let x = 0; x < field.width; x += 1) {
            const value = field.values[y * field.width + x] ?? field.min;
            const shade = Math.round(((value - field.min) / span) * 255);
            ctx.fillStyle = ridges.mask[y * field.width + x] ? '#ff3355' : `rgb(${shade},${shade},${Math.min(255, shade + 40)})`;
            ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
          }
        }
      }
    }
    superpackSection('ridges', 'FTLE Ridge Extraction (LCS proxy)', [
      `Ridge cells: ${ridges.ridgeCells} (${(ridges.ridgeFraction * 100).toFixed(1)}% of ${field.width}x${field.height}), threshold λ>=${ridges.threshold.toFixed(4)} (p${Math.round(ridges.percentile * 100)})`,
      `Field range [${field.min.toFixed(4)}, ${field.max.toFixed(4)}]`,
      'Method: percentile + transverse local-maximum ridge condition on the (θ1, θ2) forward-FTLE section; canvas shows ridges in red',
      `Caveat: ${ridges.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ n: field.width, p: ridges.percentile, spec: doubleSpecFromCurrent() }))}`
    ]);
    logResearchRun('probe', 'FTLE ridges', `${ridges.ridgeCells} ridge cells (${(ridges.ridgeFraction * 100).toFixed(1)}%)`);
  } catch (error) {
    superpackSection('ridges', 'FTLE Ridge Extraction — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

export async function runBifurcationDetectPanel(): Promise<void> {
  superpackSection('bifurcations', 'Automated Bifurcation Detection', ['Sweeping the driven pendulum bifurcation diagram…']);
  try {
    const base = orbitBaseFromControls();
    const from = Math.max(0.6, base.driveAmplitude);
    const to = Math.max(from + 0.4, numberFrom('rwOrbitSweepTo', 1.2) + 0.3);
    const amplitudes = Array.from({ length: 25 }, (_, i) => from + ((to - from) * i) / 24);
    const response = await superpackClient().bifurcation(
      { kind: 'driven', g: base.g, length: base.length, damping: base.damping, driveAmplitude: from, driveFrequency: base.driveFrequency },
      amplitudes,
      [0.3, 0, 0],
      { dt: 0.01, maxTime: 240, transientCrossings: 30, maxPointsPerParam: 60 }
    );
    const detection = detectBifurcations(response.columns, { tolerance: 1e-3, chaosCountThreshold: 24 });
    const eventLines = detection.events.slice(0, 8).map((event) =>
      `${event.type} in A∈(${event.previousParam.toFixed(3)}, ${event.param.toFixed(3)}]: ${event.fromCount} -> ${event.toCount} branches`);
    superpackSection('bifurcations', `Automated Bifurcation Detection — ${detection.events.length} event(s)`, [
      ...(eventLines.length > 0 ? eventLines : ['No attractor-count changes detected in the swept range.']),
      `Chaotic columns: ${detection.chaoticColumns}/${detection.params.length}`,
      `Method: ${detection.method}; stroboscopic section, dt=0.01, 30 transient crossings discarded, maxTime 240`,
      `Caveat: ${detection.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ from, to, base }))}`
    ]);
    logResearchRun('probe', 'Bifurcation detection', `${detection.events.length} events, ${detection.chaoticColumns} chaotic columns`);
  } catch (error) {
    superpackSection('bifurcations', 'Automated Bifurcation Detection — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

/** Newton fixed point on the stroboscopic map + Floquet classification + NS scan along the branch. */
export function runFixedPointPanel(): void {
  superpackSection('fixedpoint', 'Poincaré Fixed Point', ['Running Newton on the stroboscopic map…']);
  window.setTimeout(() => {
    try {
      const base = orbitBaseFromControls();
      const orbit = drivenPeriodicOrbit(base, [0, 0], { dt: 0.005, tolerance: 1e-10 });
      const classification = classifyFixedPoint(orbit.multipliers);
      const to = numberFrom('rwOrbitSweepTo', 1.2);
      const branch = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: base.driveAmplitude,
        end: to,
        step: Math.max(1e-3, Math.abs(to - base.driveAmplitude) / 40) * Math.sign(to - base.driveAmplitude || 1)
      });
      const nsScan = detectNeimarkSacker(branch.branch.map((point) => ({ param: point.parameter, multipliers: point.multipliers })));
      superpackSection('fixedpoint', `Poincaré Fixed Point — ${classification.classification.toUpperCase()}`, [
        orbit.converged
          ? `Fixed point (θ, ω) = (${orbit.orbit[0].toFixed(6)}, ${orbit.orbit[1].toFixed(6)}), residual ${orbit.residual.toExponential(2)} in ${orbit.iterations} Newton steps`
          : `Newton did not converge (residual ${orbit.residual.toExponential(2)})`,
        `Classification: ${classification.classification} (${classification.stable ? 'stable' : 'not asymptotically stable'}); ${classification.detail}`,
        classification.rotationNumber !== null ? `Rotation number ${classification.rotationNumber.toFixed(4)}` : 'Non-rotational (real multipliers)',
        nsScan.points.length > 0
          ? `Neimark–Sacker: ${nsScan.points.map((point) => `A≈${point.paramCritical.toFixed(4)} (rot ${point.rotationNumber.toFixed(3)}${point.strongResonance ? ', STRONG RESONANCE' : ''}, ${point.direction})`).join('; ')}`
          : `Neimark–Sacker: no complex-pair unit-circle crossing along A∈[${base.driveAmplitude}, ${to}]`,
        `Method: Newton on the period-map (dt=0.005, tol 1e-10); Floquet multipliers from the monodromy matrix; NS scan: ${nsScan.method}`,
        `Caveat: ${nsScan.caveat}`,
        `Reproducibility hash: ${hashText(JSON.stringify({ base, to }))}`
      ]);
      logResearchRun('probe', 'Fixed point classification', `${classification.classification}; NS points: ${nsScan.points.length}`);
    } catch (error) {
      superpackSection('fixedpoint', 'Poincaré Fixed Point — FAILED', [String(error instanceof Error ? error.message : error)]);
    }
  }, 30);
}

export async function runCodimTwoPanel(): Promise<void> {
  superpackSection('codim2', 'Codim-2 Regime Map', ['Scanning the (drive amplitude, damping) plane on the chaos worker…']);
  try {
    const base = orbitBaseFromControls();
    const response = await superpackClient().codimTwo(
      { kind: 'driven', g: base.g, length: base.length, damping: base.damping, driveAmplitude: base.driveAmplitude, driveFrequency: base.driveFrequency },
      [0.3, 0, 0],
      [0.2, 1.6],
      [0.05, 0.7],
      { n: 11, steps: 2500, dt: 0.02 }
    );
    const result = response.result;
    const canvas = $('rwSuperpackCanvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const n = result.xValues.length;
        const cellW = canvas.width / n;
        const cellH = canvas.height / n;
        for (const cell of result.cells) {
          const i = result.xValues.indexOf(cell.x);
          const j = result.yValues.indexOf(cell.y);
          ctx.fillStyle = cell.regime === 1 ? '#e63946' : cell.regime === -1 ? '#4361ee' : '#778da9';
          ctx.fillRect(i * cellW, canvas.height - (j + 1) * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px system-ui';
        ctx.fillText('x: drive amplitude, y: damping — red chaotic, blue regular', 6, 12);
      }
    }
    superpackSection('codim2', 'Codim-2 Regime Map (A × γ)', [
      `Chaotic fraction ${(result.chaoticFraction * 100).toFixed(1)}%; boundary cells ${result.boundaryCells} (the λ=0 contour)`,
      `Method: ${result.method}`,
      `Transients: ${result.transientHandling}`,
      `Caveat: ${result.caveat}`,
      `Reproducibility hash: ${result.reproducibilityHash}`
    ]);
    logResearchRun('probe', 'Codim-2 map', `${(result.chaoticFraction * 100).toFixed(1)}% chaotic, ${result.boundaryCells} boundary cells`);
  } catch (error) {
    superpackSection('codim2', 'Codim-2 Regime Map — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

export function runShadowingPanel(): void {
  superpackSection('shadowing', 'Shadowing Reliability', ['Comparing production integrator against the GBS reference…']);
  window.setTimeout(() => {
    try {
      const snapshot = currentSnapshot();
      const { spec, state0 } = studySpecFromSnapshot(snapshot);
      const rhs = buildRhs(spec);
      const T = 20;
      const result = shadowingHorizon(state0, rhs, {
        dt: Math.min(0.01, snapshot.dt || 0.01),
        T,
        threshold: 1e-2,
        method: snapshot.method,
        sampleEvery: 20
      });
      const horizon = Number.isFinite(result.horizon) ? result.horizon : T;
      const score = Math.max(0, Math.min(1, horizon / T));
      superpackSection('shadowing', `Shadowing Reliability — score ${(score * 100).toFixed(0)}%`, [
        Number.isFinite(result.horizon)
          ? `Shadowing horizon ${result.horizon.toFixed(2)}s of ${T}s (separation > ${result.threshold} after that)`
          : `Trajectory shadowed the reference for the full ${T}s window (final separation ${result.finalSeparation.toExponential(2)})`,
        `Method: ${result.settings.method} (dt=${result.settings.dt}) vs ${result.settings.referenceMethod} reference (dt=${result.settings.referenceDt}); max-norm threshold ${result.threshold}`,
        'Uncertainty: horizon resolution = sampleEvery × dt; chaotic horizons scale ~ln(threshold)/λ, so treat as order-of-magnitude',
        'Caveat: in-precision reference, not an exact-arithmetic shadow; the score certifies numerical trust over T, not long-time orbit identity',
        `Reproducibility hash: ${hashText(JSON.stringify({ hash: snapshot.hash, T, threshold: 1e-2, method: snapshot.method }))}`
      ]);
      logResearchRun('probe', 'Shadowing score', `${(score * 100).toFixed(0)}% over ${T}s`);
    } catch (error) {
      superpackSection('shadowing', 'Shadowing Reliability — FAILED', [String(error instanceof Error ? error.message : error)]);
    }
  }, 30);
}

export function runMelnikovPanel(): void {
  try {
    const base = orbitBaseFromControls();
    const verdict = melnikovVerdict(base);
    const valid = verdict.delta < 0.5 && verdict.f < 1.5;
    superpackSection('melnikov', `Melnikov Threshold — ${verdict.predictsHomoclinicTangle ? 'TANGLE PREDICTED' : 'below threshold'}`, [
      `Critical amplitude A_c = ${verdict.criticalAmplitude.toFixed(4)}; current A = ${base.driveAmplitude} (ratio ${verdict.amplitudeRatio.toFixed(3)})`,
      `Scaled parameters: δ=${verdict.delta.toFixed(4)}, f=${verdict.f.toFixed(4)}, Ω=${verdict.Omega.toFixed(4)} (ω0=${verdict.omega0.toFixed(4)})`,
      `Validity: perturbative Melnikov theory ${valid ? 'applicable (small δ, f)' : 'STRAINED — δ or f is not small; treat the threshold as heuristic only'}`,
      'Method: first-order Melnikov function along the undamped separatrix of the driven pendulum; simple zeros ⇒ transverse homoclinic intersection',
      'Caveat: predicts the onset of homoclinic chaos (transient tangles), not necessarily a strange attractor; valid for the single driven pendulum only',
      `Reproducibility hash: ${hashText(JSON.stringify(base))}`
    ]);
    logResearchRun('probe', 'Melnikov threshold', `A_c=${verdict.criticalAmplitude.toFixed(4)}, ratio ${verdict.amplitudeRatio.toFixed(2)}`);
  } catch (error) {
    superpackSection('melnikov', 'Melnikov Threshold — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
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
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 60);
}

export function rebuildComparisonMatrix(): void {
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
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

export function renderResearchWorkbench(): void {
  renderResearchExperiments();
  renderResearchRunLog();
  renderParameterStudy();
  renderDesignStudy();
  renderComparisonMatrix();
  renderPaperSummary();
  renderResearchStoragePanel();
}

export function currentLibraryFilter(): { query: string; tag: string; favoritesOnly: boolean } {
  const search = $('rwLibSearch');
  const tag = $('rwLibTag');
  const favOnly = $('rwLibFavOnly');
  return {
    query: search instanceof HTMLInputElement ? search.value : '',
    tag: tag instanceof HTMLInputElement ? tag.value : '',
    favoritesOnly: favOnly instanceof HTMLInputElement ? favOnly.checked : false
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

export function renderResearchExperiments(): void {
  const filtered = filterExperiments(state.research.experiments, currentLibraryFilter());
  const select = $('rwExperimentSelect');
  if (select instanceof HTMLSelectElement) {
    const previous = state.research.selectedExperimentId || select.value;
    clear(select);
    for (const experiment of filtered) {
      select.append(html('option', { value: experiment.id, text: `${experiment.favorite ? '★ ' : ''}${experiment.name}` }));
    }
    if (filtered.some((experiment) => experiment.id === previous)) select.value = previous;
    state.research.selectedExperimentId = select.value || filtered[0]?.id || state.research.experiments[0]?.id || '';
  }
  const diffSelect = $('rwDiffAgainst');
  if (diffSelect instanceof HTMLSelectElement) {
    const previousDiff = diffSelect.value;
    clear(diffSelect);
    for (const experiment of state.research.experiments) diffSelect.append(html('option', { value: experiment.id, text: experiment.name }));
    if (state.research.experiments.some((experiment) => experiment.id === previousDiff)) diffSelect.value = previousDiff;
  }
  const selected = selectedResearchExperiment();
  const filterNote = filtered.length !== state.research.experiments.length ? ` (${filtered.length} matching filter)` : '';
  setText('rwExperimentSummary', selected
    ? `${state.research.experiments.length} experiment(s)${filterNote}. Selected: ${selected.name}; method=${selected.snapshot.method}; hash=${selected.snapshot.hash}; score=${selected.metrics.qualityScore}`
    : `${state.research.experiments.length} experiment(s)${filterNote}. Save current state to begin.`);
  if (selected) {
    const badges = experimentBadges(selected).map((badge) => `[${badge}]`).join(' ');
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
  renderResearchWorkbench();
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
  const rows = diffObjects(
    { snapshot: selected.snapshot, tags: selected.tags, notes: selected.notes },
    { snapshot: other.snapshot, tags: other.tags, notes: other.notes }
  );
  renderResearchTable(
    'rwLibDiff',
    [`field`, selected.name.slice(0, 24), other.name.slice(0, 24)],
    rows.slice(0, 40).map((row) => [row.field, row.a, row.b]),
    'No differences — the two experiments are identical (excluding hashes/timestamps).'
  );
  toast(`${rows.length} differing field(s)`);
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
  const groups = timelineGroups(state.research.experiments);
  if (groups.length === 0) {
    setText('rwLibTimeline', 'No experiments yet.');
    return;
  }
  const rows = groups.flatMap((group) => group.items.map((item, index) => [index === 0 ? group.day : '', item.time, item.name]));
  renderResearchTable('rwLibTimeline', ['day', 'time', 'experiment'], rows.slice(0, 40), 'No experiments yet.');
}

export function renderResearchRunLog(): void {
  const rows = state.research.runLog.slice(0, 12).map((entry) => [
    new Date(entry.timestamp).toLocaleTimeString(),
    entry.type,
    entry.label,
    entry.method,
    String(entry.metrics.qualityScore),
    entry.summary
  ]);
  renderResearchTable('rwRunLog', ['time', 'type', 'label', 'method', 'score', 'summary'], rows, 'No run log entries yet.');
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
  setText('rwStudySummary', plan
    ? `${plan.count} points for ${plan.variable} using ${plan.strategy}. Range ${plan.min} to ${plan.max}. First: ${plan.experiments[0]?.estimate ?? '-'}.${progress}`
    : 'No parameter study generated.');
  setText('rwStudyCheckpoint', buildStudyCheckpointSummary(plan));
  setText('rwStudyInsights', buildParameterStudyInsights(plan));
  const resultRows = (plan?.experiments ?? [])
    .filter((point) => point.results || point.error)
    .map((point) => point.results
      ? [
          point.label,
          `${point.results.lambdaMax.toFixed(4)} ± ${point.results.lambdaBlockStdError.toFixed(4)}`,
          point.results.rqaDeterminism.toFixed(3),
          point.results.rqaDivergence.toFixed(4),
          point.results.ftle.toFixed(4)
        ]
      : [point.label, `error: ${point.error ?? 'unknown'}`, '-', '-', '-']);
  renderResearchTable('rwStudyResults', ['point', 'lambda max ± SE', 'RQA DET', 'RQA DIV', 'FTLE'], resultRows, 'Run the batch to fill per-point diagnostics.');
}

export function buildStudyCheckpointSummary(plan: ParameterStudyPlan | null): string {
  const checkpoint = state.research.batchCheckpoint;
  if (!plan || !checkpoint || checkpoint.planId !== plan.id) return 'No batch checkpoint yet.';
  const age = Number.isNaN(Date.parse(checkpoint.updatedAt)) ? checkpoint.updatedAt : new Date(checkpoint.updatedAt).toLocaleTimeString();
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
  const peak = completed.reduce((best, entry) => entry.point.results!.lambdaMax > best.point.results!.lambdaMax ? entry : best, completed[0]!);
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
  renderResearchTable('rwComparisonMatrix', ['source', 'label', 'method', 'system', 'dt', 'drift', 'lambda', 'score'], rows, 'No comparison rows yet.');
}

export function renderPaperSummary(): void {
  const ready = state.research.experiments.length > 0 || state.research.runLog.length > 0 || Boolean(state.research.parameterStudy);
  const rowCount = state.research.comparisonRows.length || buildComparisonRows().length;
  setText('rwPaperSummary', `${ready ? 'ready' : 'not ready'}: ${state.research.experiments.length} experiments, ${state.research.runLog.length} run log entries, ${state.research.parameterStudy?.count ?? 0} study points, ${rowCount} comparison rows.`);
}

export function renderResearchTable(targetId: string, headers: string[], rows: string[][], emptyText: string): void {
  const box = $(targetId);
  clear(box);
  if (!box) return;
  if (!rows.length) {
    box.append(html('div', { className: 'research-summary', text: emptyText }));
    return;
  }
  const table = html('table', { className: 'research-table' });
  const head = html('tr');
  headers.forEach((header) => head.append(html('th', { text: header })));
  table.append(head);
  rows.forEach((cells) => {
    const tr = html('tr');
    cells.forEach((cell) => tr.append(html('td', { text: cell })));
    table.append(tr);
  });
  box.append(table);
}


// --- 3D Lab: rope pendulum + spherical pendulum ------------------------------
