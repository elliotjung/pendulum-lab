/** Focused research-workbench responsibility extracted from research-workbench.ts. */
/**
 * Research Workbench: experiments, run log, parameter/design studies, analysis superpack.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import type { RuntimeSnapshot } from '../../types/domain';
import { downloadJson } from '../../export/manifest';

import { CERTIFIED_WORKBENCH_FLAGSHIP } from '../../research/certifiedWorkbench';

import {
  ResearchExperiment,
  ResearchMetrics,
  ResearchRunLogEntry,
  ResearchRunType,
  clear,
  currentSnapshot,
  html,
  modernLab,
  researchUid,
  setControl,
  setText,
  state,
  toast
} from './shared';
import { persistResearchState } from './storage-sync';

import { setMode } from './governance-ui';

import { buildComparisonRows } from './research-comparison';

import {
  activeResearchSession,
  createWorkspaceProfileState,
  ensureWorkspaceList,
  recordRunInActiveSession,
  saveWorkspaceProfileState,
  selectWorkspaceProfile,
  workspaceOptions
} from './research-workspace-controller';
import { renderResearchWorkbench } from './research-workbench';
import { dispatchResearchWorkbenchChanged } from './research-workbench-events';

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
  return value === null || !Number.isFinite(value)
    ? '-'
    : Math.abs(value) >= 1000 || Math.abs(value) < 0.01
      ? value.toExponential(2)
      : value.toFixed(digits);
}

export function selectedResearchExperiment(): ResearchExperiment | undefined {
  const select = $('rwExperimentSelect');
  const id = select instanceof HTMLSelectElement ? select.value : state.research.selectedExperimentId;
  return state.research.experiments.find((experiment) => experiment.id === id);
}

export function switchWorkspaceProfile(): void {
  const select = $('rwWorkspaceSelect');
  const id = select instanceof HTMLSelectElement ? select.value : '';
  if (!selectWorkspaceProfile(id)) {
    toast('Workspace profile not found');
    return;
  }
  persistResearchState();
  renderWorkspaceProfile();
  logResearchRun('workspace', 'Switched workspace profile', state.research.workspace.name);
  toast('Workspace profile loaded');
}

export function createWorkspaceProfile(): void {
  const nameInput = $('rwWorkspaceName');
  const objectiveInput = $('rwWorkspaceObjective');
  const baseName =
    nameInput instanceof HTMLInputElement && nameInput.value.trim()
      ? nameInput.value.trim()
      : 'Certified Chaotic Dynamics Workbench';
  const objective =
    objectiveInput instanceof HTMLTextAreaElement && objectiveInput.value.trim()
      ? objectiveInput.value.trim()
      : CERTIFIED_WORKBENCH_FLAGSHIP.thesis;
  createWorkspaceProfileState(baseName, objective);
  persistResearchState();
  renderWorkspaceProfile();
  logResearchRun('workspace', 'Created workspace profile', state.research.workspace.name);
  toast('Workspace profile created');
}

export function saveWorkspaceProfile(): void {
  const projectInput = $('rwProjectName');
  const sessionInput = $('rwSessionName');
  const nameInput = $('rwWorkspaceName');
  const objectiveInput = $('rwWorkspaceObjective');
  const densitySelect = $('rwWorkspaceDensity');
  const name =
    nameInput instanceof HTMLInputElement && nameInput.value.trim()
      ? nameInput.value.trim()
      : CERTIFIED_WORKBENCH_FLAGSHIP.title;
  const objective =
    objectiveInput instanceof HTMLTextAreaElement && objectiveInput.value.trim()
      ? objectiveInput.value.trim()
      : CERTIFIED_WORKBENCH_FLAGSHIP.thesis;
  saveWorkspaceProfileState({
    projectName:
      projectInput instanceof HTMLInputElement && projectInput.value.trim()
        ? projectInput.value.trim()
        : state.research.project.name,
    sessionName:
      sessionInput instanceof HTMLInputElement && sessionInput.value.trim()
        ? sessionInput.value.trim()
        : activeResearchSession().name,
    workspaceName: name,
    objective,
    density:
      densitySelect instanceof HTMLSelectElement && densitySelect.value === 'compact' ? 'compact' : 'comfortable',
    panelCollapsed: document.body.classList.contains('panel-collapsed')
  });
  persistResearchState();
  renderWorkspaceProfile();
  logResearchRun('workspace', 'Saved workspace profile', state.research.workspace.name);
  toast('Workspace profile saved');
}

export function renderWorkspaceProfile(): void {
  ensureWorkspaceList();
  const workspace = state.research.workspace;
  const workbench = $('researchWorkbench');
  workbench?.classList.toggle('research-compact', state.research.layout.density === 'compact');
  const workspaceSelect = $('rwWorkspaceSelect');
  const projectInput = $('rwProjectName');
  const sessionInput = $('rwSessionName');
  const nameInput = $('rwWorkspaceName');
  const objectiveInput = $('rwWorkspaceObjective');
  const densitySelect = $('rwWorkspaceDensity');
  if (workspaceSelect instanceof HTMLSelectElement) {
    const options = workspaceOptions();
    clear(workspaceSelect);
    for (const [id, label] of options) workspaceSelect.append(html('option', { value: id, text: label }));
    workspaceSelect.value = workspace.id;
  }
  const session = activeResearchSession();
  if (projectInput instanceof HTMLInputElement && projectInput.value !== state.research.project.name)
    projectInput.value = state.research.project.name;
  if (sessionInput instanceof HTMLInputElement && sessionInput.value !== session.name)
    sessionInput.value = session.name;
  if (nameInput instanceof HTMLInputElement && nameInput.value !== workspace.name) nameInput.value = workspace.name;
  if (objectiveInput instanceof HTMLTextAreaElement && objectiveInput.value !== workspace.objective)
    objectiveInput.value = workspace.objective;
  if (densitySelect instanceof HTMLSelectElement) densitySelect.value = state.research.layout.density;
  const readyPieces = [
    `${state.research.experiments.length} experiment(s)`,
    `${state.research.runLog.length} run(s)`,
    `${state.research.parameterStudy?.count ?? 0} study point(s)`,
    `${state.research.comparisonRows.length || buildComparisonRows().length} comparison row(s)`,
    `${session.artifactManifest.length} session artifact(s)`
  ];
  setText(
    'rwWorkspaceSummary',
    `${state.research.project.name} / ${session.name} - ${state.research.workspaces.length} workspace profile(s), flagship=${workspace.flagshipId || CERTIFIED_WORKBENCH_FLAGSHIP.id}. ${readyPieces.join(', ')}. Objective: ${workspace.objective}`
  );
}

export function defaultExperimentName(snapshot: RuntimeSnapshot): string {
  return `${snapshot.systemType}-${snapshot.method}-dt${snapshot.dt.toPrecision(3)}-${snapshot.hash.slice(0, 8)}`;
}

export function saveCurrentExperiment(): void {
  const snapshot = currentSnapshot();
  const nameInput = $('rwExperimentName');
  const notesInput = $('rwExperimentNotes');
  const tagsInput = $('rwExperimentTags');
  const name =
    nameInput instanceof HTMLInputElement && nameInput.value.trim()
      ? nameInput.value.trim()
      : defaultExperimentName(snapshot);
  const notes = notesInput instanceof HTMLTextAreaElement ? notesInput.value.trim() : '';
  const tags =
    tagsInput instanceof HTMLInputElement
      ? tagsInput.value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
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
  logResearchRun(
    'export',
    'Experiment library export',
    `${state.research.experiments.length} experiments`,
    'pendulum_research_experiment_library.json'
  );
}

export function logResearchRun(
  type: ResearchRunType,
  label: string,
  summary: string,
  artifact = '',
  validationStatus = 'not-run'
): ResearchRunLogEntry {
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
  recordRunInActiveSession(entry);
  persistResearchState();
  dispatchResearchWorkbenchChanged(entry.id);
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
  logResearchRun(
    'export',
    'Run log export',
    `${state.research.runLog.length} entries`,
    'pendulum_research_run_log.json'
  );
}
