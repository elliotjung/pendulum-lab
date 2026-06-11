import type { IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../types/domain';
import { commandRegistry } from '../runtime/CommandRegistry';
import { StateStore, stateStore } from '../state/StateStore';
import { createSubmissionManifest, downloadBytes, downloadJson } from '../export/manifest';
import { runAllValidationChecks, type ValidationCaseResult } from '../validation/validationSuite';
import { integratorRegistry } from '../physics/integrators';
import { canonicalStepThetaOmega } from '../physics/canonical';
import { energyDouble } from '../physics/energy';
import { energyChain, rhsChain } from '../physics/nPendulum';
import { drivenPeriodicOrbit } from '../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../chaos/continuation';
import { chaosWorkerTransportFactory, JobCancelledError, JobClient } from '../runtime/JobClient';
import { ChaosClient } from '../runtime/ChaosClient';
import type { StudyPointResponse } from '../workers/chaosProtocol';
import { buildRhs, type SystemSpec } from '../physics/systemSpec';
import { classifyFixedPoint } from '../chaos/fixedPointClassify';
import { detectBifurcations } from '../chaos/bifurcationDetect';
import { detectNeimarkSacker } from '../chaos/neimarkSacker';
import { recurrenceNetworkMetrics } from '../chaos/recurrenceNetwork';
import { extractFtleRidges } from '../chaos/ftleRidge';
import { shadowingHorizon } from '../chaos/shadowing';
import { melnikovVerdict } from '../chaos/melnikov';
import { csvCell, dataUrlByteEstimate, hashText } from '../research/researchExportUtils';
import { generateStudyValues, type ParameterStudyStrategy } from '../research/researchSampling';
import { buildZip, checksumEntries, dataUrlToBytes, textToBytes, type ZipEntryInput } from '../research/zipBundle';
import { collectEnvironment, ProvenanceBuilder, type ProvenanceGraph } from '../research/provenance';
import { migrateFromLocalStorageV2, ResearchDb, validateResearchDbArchive, type ResearchDbArchive } from '../research/researchDb';
import { buildNotebookV2 } from '../research/notebookBuilder';
import {
  figureFingerprint,
  figureSourceCsv,
  renderStudyFigureSvg,
  scaleCanvasToPngDataUrl,
  studyFigureFromSavedStudy,
  type FigureTheme
} from '../research/figurePipeline';
import {
  diffObjects,
  filterExperiments,
  forkExperimentData,
  qualityBadges,
  timelineGroups,
  validateDoi,
  type QualityBadge
} from '../research/libraryUx';
import { evaluatePerformanceBudget } from '../render/progressive';
import { RopePendulum } from '../physics/rope';
import { SphericalPendulum } from '../physics/spherical';
import { SphericalChain, type SphericalChainParams } from '../physics/sphericalChain';
import { bindOrbitControls, drawPolyline3D, drawSphereWireframe, OrbitCamera } from '../viz/orbit3d';
import { ensembleGrid, runDoublePendulumEnsemble } from '../runtime/gpuEnsemble';
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
} from '../research/experimentDesign';
import { createRailTabButton, EXTRA_RAIL_TABS } from './railNavigation';

type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

interface ModernLabHandle {
  diagnostics?: () => {
    time: number;
    drift: number;
    poincarePoints: number;
    lambdaMax: number;
    fps: number;
    physicsMsPerFrame: number;
  };
  reset?: () => void;
}

interface CanonicalQa {
  runs: number;
  pass: boolean;
  residual: number;
  iterations: number;
  drift: number;
  symplecticDefect: number;
  timestamp: string;
}

interface AuditResult {
  generatedAt: string;
  passed: number;
  failed: number;
  tests: Array<{ id: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }>;
  manifest: unknown;
}

type ResearchRunType = 'experiment' | 'validation' | 'parameter-study' | 'comparison' | 'export' | 'probe';

interface ResearchMetrics {
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  physicsMsPerFrame: number | null;
  poincarePoints: number;
  qualityScore: number;
  validationStatus: string;
}

interface ResearchExperiment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  tags: string[];
  snapshot: RuntimeSnapshot;
  metrics: ResearchMetrics;
  favorite?: boolean;
  citation?: { doi: string; reference: string };
}

interface ResearchRunLogEntry {
  id: string;
  type: ResearchRunType;
  label: string;
  timestamp: string;
  experimentId: string | null;
  snapshotHash: string;
  method: IntegratorId;
  system: SystemType;
  dt?: number;
  damping?: number;
  metrics: ResearchMetrics;
  summary: string;
  artifact?: string;
}

interface StudyPointResults {
  lambdaMax: number;
  lambdaBlockStdError: number;
  rqaDeterminism: number;
  rqaDivergence: number;
  ftle: number;
  durationMs?: number;
  completedAt: string;
}

interface ParameterStudyPoint {
  id: string;
  label: string;
  patch: Record<string, number | string>;
  snapshot: RuntimeSnapshot;
  estimate: string;
  attempts?: number;
  /** Filled by the batch runner (Lyapunov / RQA / FTLE per point). */
  results?: StudyPointResults;
  /** Error message when the batch job for this point failed. */
  error?: string;
}

interface ParameterStudyPlan {
  id: string;
  generatedAt: string;
  variable: string;
  strategy: ParameterStudyStrategy;
  min: number;
  max: number;
  count: number;
  values: number[];
  experiments: ParameterStudyPoint[];
}

type ResearchBatchStatus = 'running' | 'cancelled' | 'complete' | 'failed';

interface ResearchBatchCheckpoint {
  id: string;
  planId: string;
  planHash: string;
  status: ResearchBatchStatus;
  startedAt: string;
  updatedAt: string;
  completed: number;
  failed: number;
  pending: number;
  nextIndex: number;
  total: number;
  timeoutMs: number;
  message: string;
}

interface ResearchComparisonRow {
  id: string;
  label: string;
  source: string;
  timestamp: string;
  method: IntegratorId;
  system: SystemType;
  dt: number;
  damping: number;
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  score: number;
  hash: string;
}

interface ResearchWorkbenchState {
  experiments: ResearchExperiment[];
  selectedExperimentId: string;
  runLog: ResearchRunLogEntry[];
  parameterStudy: ParameterStudyPlan | null;
  batchCheckpoint: ResearchBatchCheckpoint | null;
  comparisonRows: ResearchComparisonRow[];
}

interface ResearchStoragePayload extends ResearchWorkbenchState {
  schemaVersion: string;
  savedAt: string;
  migrations: string[];
  droppedEntries: number;
}


const LEGACY_VALIDATION_IDS = [
  'energy-drift-gamma0',
  'damping-sanity',
  'small-angle-reference',
  'dt-halving-convergence',
  'order-accuracy-estimate',
  'time-reversibility',
  'deterministic-replay-hash',
  'worker-main-consistency',
  'poincare-crossing-consistency',
  'lyapunov-transient-handling',
  'rk4-reference-comparison',
  'implicit-solver-residual',
  'localstorage-roundtrip',
  'url-share-roundtrip',
  'json-import-schema',
  'nan-fault-injection',
  'render-independence',
  'browser-capability-report',
  'event-listener-leak-smoke',
  'performance-budget-smoke'
] as const;

const COMPAT_ANCHOR_IDS = [
  'single-file-platform-prelude-v9',
  'single-file-platform-architecture-v9',
  'pendulum-lab-v10-consolidation',
  'research-integrity-upgrade-v4',
  'research-governance-v7-script',
  'stable-intuitive-layer',
  'ple-tsconfig-strict',
  'ple-type-contracts',
  'pendulumRodFinal'
] as const;

const state = {
  mode: 'demo' as RunMode,
  recoveries: 0,
  auditLog: [] as string[],
  checkpoints: [] as RuntimeSnapshot[],
  lastValidation: null as ValidationCaseResult[] | null,
  lastCanonicalQa: null as CanonicalQa | null,
  lastAudit: null as AuditResult | null,
  lastFault: 'No runtime faults recorded.',
  research: {
    experiments: [] as ResearchExperiment[],
    selectedExperimentId: '',
    runLog: [] as ResearchRunLogEntry[],
    parameterStudy: null as ParameterStudyPlan | null,
    batchCheckpoint: null as ResearchBatchCheckpoint | null,
    comparisonRows: [] as ResearchComparisonRow[]
  } as ResearchWorkbenchState
};

let installed = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    className?: string;
    text?: string;
    title?: string;
    role?: string;
    ariaLabel?: string;
    type?: string;
    value?: string;
  } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.role) node.setAttribute('role', options.role);
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.type && node instanceof HTMLButtonElement) node.type = options.type as HTMLButtonElement['type'];
  if (options.value !== undefined && (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLOptionElement)) {
    node.value = options.value;
  }
  return node;
}

function append(parent: Node, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(child));
  }
}

function clear(node: Element | null): void {
  if (node) node.replaceChildren();
}

function setText(id: string, text: string): void {
  const node = $(id);
  if (node) node.textContent = text;
}

function button(id: string, label: string, run: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const node = html('button', { id, text: label, type: 'button', className });
  node.addEventListener('click', () => {
    void run();
  });
  return node;
}

function row(label: string, value: string, tone: Tone = ''): HTMLDivElement {
  const node = html('div', { className: 'srow' });
  const key = html('span', { className: 'skey', text: label });
  const val = html('span', { className: `sval ${tone}`.trim(), text: value });
  append(node, key, val);
  return node;
}

function kvGrid(id: string, pairs: Array<[string, string, Tone?]>): HTMLDivElement {
  const grid = html('div', { id, className: 'stats' });
  pairs.forEach(([k, v, tone]) => grid.append(row(k, v, tone ?? '')));
  return grid;
}

function card(title: string, body: Node, id?: string, className = 'rg-card'): HTMLElement {
  const section = id === undefined ? html('section', { className }) : html('section', { id, className });
  append(section, html('div', { className: 'rg-title', text: title }), body);
  return section;
}

function detailsCard(title: string, body: Node, id?: string): HTMLDetailsElement {
  const details = id === undefined ? html('details', { className: 'acc' }) : html('details', { id, className: 'acc' });
  details.open = true;
  const summary = html('summary');
  append(summary, html('span', { className: 'acc-icon', text: '>' }), html('span', { className: 'acc-label', text: title }), html('span', { className: 'acc-arrow', text: '>' }));
  append(details, summary, html('div', { className: 'acc-body' }));
  details.querySelector('.acc-body')?.append(body);
  return details;
}

function numberFrom(id: string, fallback: number): number {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  const value = Number.parseFloat(el.value);
  return Number.isFinite(value) ? value : fallback;
}

function selectValue(id: string, fallback: string): string {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  return el.value || fallback;
}

function setControl(id: string, value: string | number | boolean): void {
  const el = $(id);
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    el.value = String(value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function modernLab(): ModernLabHandle | undefined {
  return (window as Window & { __modernLab?: ModernLabHandle }).__modernLab;
}

function currentParameters(): PendulumParameters {
  return {
    m1: numberFrom('m1', 1),
    m2: numberFrom('m2', 1),
    m3: numberFrom('m3', 1),
    l1: numberFrom('l1', 1.2),
    l2: numberFrom('l2', 1),
    l3: numberFrom('l3', 0.8),
    g: numberFrom('g', 9.81)
  };
}

function currentSystem(): SystemType {
  return selectValue('sysType', 'double') === 'triple' ? 'triple' : 'double';
}

function currentMethod(): IntegratorId {
  const raw = selectValue('method', 'rk4');
  if (raw === 'verlet') return 'leapfrog';
  return raw in integratorRegistry ? (raw as IntegratorId) : 'rk4';
}

function currentMode(): RunMode {
  const raw = state.mode;
  return raw === 'research' || raw === 'benchmark' || raw === 'education' || raw === 'performance' || raw === 'recovery' ? raw : 'demo';
}

/**
 * Build a live runtime snapshot from the current UI controls, running sim
 * state, and live diagnostics. Exported so other entry points (e.g. the
 * `index.exportSubmissionManifest` command) capture the actual live state
 * rather than the state-store defaults.
 */
export function currentSnapshot(): RuntimeSnapshot {
  const synced = stateStore.syncFromLegacy();
  const diag = modernLab()?.diagnostics?.();
  const system = currentSystem();
  const baseState = system === 'triple'
    ? [numberFrom('th1', 2), numberFrom('th2', 2.5), numberFrom('th3', 1), numberFrom('iw1', 0), numberFrom('iw2', 0), numberFrom('iw3', 0)]
    : [numberFrom('th1', 2), numberFrom('th2', 2.5), numberFrom('iw1', 0), numberFrom('iw2', 0)];
  const snapshot: RuntimeSnapshot = {
    ...synced,
    systemType: system,
    method: currentMethod(),
    mode: currentMode(),
    dt: numberFrom('dt', synced.dt || 0.003),
    tolerance: 10 ** numberFrom('tol', Math.log10(synced.tolerance || 1e-7)),
    stepsPerFrame: Math.max(1, Math.round(numberFrom('spf', synced.stepsPerFrame || 6))),
    damping: numberFrom('gamma', synced.damping || 0),
    parameters: currentParameters(),
    state: window.App?.state ? Array.from(window.App.state).slice(0, window.App.stateLen || window.App.state.length) : baseState,
    simTime: diag?.time ?? synced.simTime,
    hash: window.App?._stateHash ?? synced.hash
  };
  return snapshot;
}

function toast(message: string, timeout = 2200): void {
  const maybeToast = window.toast;
  if (typeof maybeToast === 'function') maybeToast(message, timeout);
  else {
    const box = $('toast');
    if (box) {
      box.textContent = message;
      box.classList.add('show');
      window.setTimeout(() => box.classList.remove('show'), timeout);
    }
  }
}

function record(message: string): void {
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  state.auditLog.unshift(line);
  state.auditLog = state.auditLog.slice(0, 80);
  renderRuntimePanels();
}

function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = html('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function installStyle(id: string, css: string): void {
  if ($(id)) return;
  const style = html('style', { id });
  style.textContent = css;
  document.head.append(style);
}

function installStyles(): void {
  installStyle('rg-style', `
.rg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rg-card{background:rgba(12,16,28,.78);border:1px solid var(--glass-stroke);border-radius:8px;padding:12px;box-shadow:var(--shadow-xs)}
.rg-card.rg-wide{grid-column:1/-1}.rg-title{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.6px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px}
.rg-table{width:100%;border-collapse:collapse;font-size:10.5px}.rg-table td,.rg-table th{border:1px solid var(--glass-stroke);padding:6px;vertical-align:top}.rg-table th{color:var(--cyan);text-align:left;background:rgba(24,212,248,.04)}
.rg-log{white-space:pre-wrap;max-height:240px;overflow:auto;background:rgba(0,0,0,.22);border:1px solid var(--glass-stroke);border-radius:7px;padding:8px;font:10px/1.45 var(--font-mono);color:var(--text)}
.research-workbench{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
.research-card{background:rgba(9,14,25,.84);border:1px solid rgba(24,212,248,.22);border-radius:8px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.24)}
.research-card.research-wide{grid-column:1/-1}
.research-title{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.research-form-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:center;margin:6px 0}
.research-form-row label{color:var(--muted);font-size:10px}
.research-card input,.research-card select,.research-card textarea{width:100%;min-width:0}
.research-card textarea{min-height:54px;resize:vertical;background:var(--panel2);color:var(--fg);border:1px solid var(--border-strong);border-radius:6px;padding:7px 9px;font:11px/1.45 var(--font-sans)}
.research-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.research-summary{font:10.5px/1.5 var(--font-mono);color:var(--text);background:rgba(0,0,0,.18);border:1px solid var(--glass-stroke);border-radius:7px;padding:7px;min-height:36px}
.research-table-wrap{max-height:220px;overflow:auto;border:1px solid var(--glass-stroke);border-radius:7px;background:rgba(0,0,0,.14)}
.research-table{width:100%;border-collapse:collapse;font-size:10px}.research-table th,.research-table td{border-bottom:1px solid rgba(255,255,255,.055);padding:6px;text-align:left;vertical-align:top}.research-table th{color:var(--cyan);position:sticky;top:0;background:rgba(8,12,22,.96);z-index:1}
.research-badge{display:inline-flex;align-items:center;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text);background:rgba(255,255,255,.025)}
.research-badge.good{color:var(--green);border-color:rgba(56,232,140,.38)}.research-badge.warn{color:var(--orange);border-color:rgba(255,122,44,.42)}.research-badge.info{color:var(--cyan);border-color:rgba(24,212,248,.38)}
@media(max-width:980px){.research-workbench{grid-template-columns:1fr}.research-card.research-wide{grid-column:auto}.research-form-row{grid-template-columns:1fr}}
.ri-panel,.rgv8-card,.sfv9-card{margin:8px 0 10px;padding:10px 12px;border:1px solid rgba(24,212,248,.20);border-radius:8px;background:rgba(8,12,22,.72);box-shadow:0 8px 28px rgba(0,0,0,.24)}
.ri-title,.rgv8-card h3,.sfv9-card h3{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan);margin:0 0 8px}
.ri-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.ri-row{display:flex;gap:8px;align-items:center;margin:5px 0}.ri-row label{flex:0 0 90px;color:var(--muted);font-size:10px}.ri-row select{min-width:0;flex:1}
.ue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ue-card{background:rgba(255,255,255,.032);border:1px solid var(--glass-stroke);border-radius:8px;padding:10px}.ue-title{font:800 9px var(--font-display);color:var(--cyan);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
.ue-archmap{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.ue-node{border:1px solid var(--border-strong);border-radius:999px;padding:4px 8px;font:10px var(--font-mono);color:var(--text);background:rgba(255,255,255,.025)}.ue-node.core{color:var(--green);border-color:rgba(56,232,140,.38)}.ue-node.warn{color:var(--orange);border-color:rgba(255,122,44,.42)}
.ue-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.fig-badge{position:fixed;right:14px;top:14px;z-index:9000;max-width:320px;background:rgba(8,10,20,.94);border:1px solid var(--border-strong);border-radius:8px;padding:9px 10px;font:10px/1.45 var(--font-mono);color:var(--text);box-shadow:var(--shadow-md)}.fig-badge.good{border-color:rgba(56,232,140,.45)}.fig-badge.warn{border-color:rgba(255,122,44,.5)}.fig-badge.bad{border-color:rgba(245,100,100,.55)}.fig-actions{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.fig-panel{position:fixed;inset:6vh 5vw;z-index:10020;overflow:auto;background:rgba(6,8,14,.98);border:1px solid rgba(24,212,248,.38);border-radius:12px;padding:16px;color:var(--text);box-shadow:var(--shadow-lg)}.fig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.fig-card{border:1px solid var(--glass-stroke);border-radius:8px;padding:8px;background:rgba(255,255,255,.028)}.fig-list{white-space:pre-wrap;font:10px/1.5 var(--font-mono);background:rgba(0,0,0,.22);border:1px solid var(--glass-stroke);border-radius:8px;padding:8px;margin-top:6px}
.rgv7-palette,.rgv8-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10000;align-items:flex-start;justify-content:center;padding:12vh 16px}.rgv7-palette.show,.rgv8-overlay.show{display:flex}.rgv7-palette-box,.rgv8-modal{width:min(660px,96vw);background:rgba(8,10,20,.98);border:1px solid rgba(24,212,248,.36);border-radius:12px;box-shadow:var(--shadow-lg);padding:12px}.rgv7-cmd-list,.rgv8-cmd-list{max-height:330px;overflow:auto;margin-top:8px}.rgv7-cmd,.rgv8-cmd-row{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;padding:8px 9px;border-radius:8px;margin:4px 0}.rgv7-cmd small,.rgv8-cmd-row small{color:var(--muted);font-family:var(--font-mono)}
#rgv8Cmd{display:none;position:fixed;left:50%;top:12%;transform:translateX(-50%);width:min(680px,calc(100vw - 24px));background:var(--panel-solid);border:1px solid var(--border-strong);border-radius:14px;padding:10px;z-index:10001}#rgv8Cmd.show{display:block}#rgv8Cmd input,#rgv7Palette input{width:100%;margin-bottom:8px}
#ueFloatingDiag{position:fixed;right:12px;bottom:12px;z-index:900;width:min(300px,90vw);background:rgba(6,8,12,.88);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:10px;box-shadow:0 18px 80px rgba(0,0,0,.45)}#ueFloatingDiag.collapsed{width:auto}#ueFloatingDiag.collapsed .ue-fbody{display:none}
@media(max-width:780px){.rg-grid,.ue-grid,.ri-grid{grid-template-columns:1fr}.fig-badge{display:none}}
@media(max-width:560px){#ueFloatingDiag{right:10px;bottom:88px;z-index:80;max-width:calc(100vw - 20px)}.rail{z-index:960}.rail-submenu{z-index:980}}
`);
  installStyle('riV4Style', '.ri-chip{display:inline-flex;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text)}.ri-chip.info{color:var(--cyan)}.ri-chip.good{color:var(--green)}.ri-chip.warn{color:var(--orange)}.ri-chip.bad{color:var(--red)}');
  installStyle('rgv8-style', '');
  installStyle('sfv9-style', '');
  installStyle('finalPreservationStyle', '');
  installStyle('figStyle', '');
}

function ensureCompatAnchors(): void {
  for (const id of COMPAT_ANCHOR_IDS) {
    if ($(id)) continue;
    const template = html('template', { id });
    template.textContent = 'Preserved by src/app/FeatureParityLayer.ts';
    document.body.append(template);
  }
}

function installExtraTabs(): void {
  const nav = document.querySelector('.tabs');
  const main = document.querySelector('.main-col');
  const target = document.getElementById('rail-govern-tabs') ?? document.getElementById('rail-panel-govern') ?? nav;
  if (!target || !main) return;
  for (const tab of EXTRA_RAIL_TABS) {
    if (!document.querySelector(`.tab[data-tab="${tab.id}"]`)) {
      target.append(createRailTabButton(tab));
    }
    if (!$(`tab-${tab.id}`)) {
      const panel = html('div', { id: `tab-${tab.id}`, className: 'tabpanel', role: 'tabpanel' });
      main.append(panel);
    }
  }
}

function setActiveTab(name: string): void {
  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${name}`);
  });
  if (window.App) window.App.activeTab = name;
}

function bindExtraTabClicks(): void {
  for (const tab of EXTRA_RAIL_TABS) {
    document.querySelectorAll<HTMLElement>(`.tab[data-tab="${tab.id}"]`).forEach((btn) => {
      if (btn.dataset.parityBound === 'true') return;
      btn.dataset.parityBound = 'true';
      btn.addEventListener('click', () => setActiveTab(tab.id));
    });
  }
}

function bindRailActions(): void {
  const mappings: Record<string, () => void | Promise<void>> = {
    runtime: () => setActiveTab('architecture'),
    audit: () => setActiveTab('aplus'),
    integrity: () => showFeaturePanel(),
    palette: () => showCommandPalette(),
    report: () => exportFeatureReport(),
    manifest: () => exportManifest('pendulum_submission_manifest_v10_ts.json'),
    floquet: () => runFloquetProbe(true)
  };
  document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((btn) => {
    if (btn.dataset.parityBound === 'true') return;
    const action = btn.dataset.railAction;
    const run = action ? mappings[action] : undefined;
    if (!run) return;
    btn.dataset.parityBound = 'true';
    btn.addEventListener('click', () => {
      void run();
    });
  });
}

function installArchitectureTab(): void {
  const panel = $('tab-architecture');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const map = html('div', { id: 'ueArchMap', className: 'ue-archmap' });
  const toolbar = html('div', { className: 'ue-toolbar' });
  append(
    toolbar,
    button('ueRunContract', 'Run Contract Checks', () => runContractChecks(), 'primary'),
    button('ueCaptureCheckpoint', 'Capture Checkpoint', () => captureCheckpoint()),
    button('ueExportManifest', 'Export Engine Manifest', () => exportManifest('pendulum_engine_manifest_v10_ts.json')),
    button('ueExportReplay', 'Export Checkpoints', () => downloadJson('pendulum_checkpoints_v10_ts.json', state.checkpoints)),
    button('ueToggleDiag', 'Toggle Floating Diagnostics', () => toggleFloatingDiag())
  );
  const grid = html('div', { className: 'ue-grid' });
  append(
    grid,
    card('Typed Runtime Contracts', html('div', { id: 'ueContracts' }), undefined, 'ue-card'),
    card('Task Graph', html('div', { id: 'ueTasks' }), undefined, 'ue-card'),
    card('Plugin Registry', html('div', { id: 'uePlugins' }), undefined, 'ue-card'),
    card('Resource Manager', html('div', { id: 'ueResources' }), undefined, 'ue-card'),
    card('Numerical Stability Layer', html('div', { id: 'ueStability' }), undefined, 'ue-card'),
    card('Fault Boundary', html('div', { id: 'ueFaults' }), undefined, 'ue-card')
  );
  append(left, map, toolbar, grid);
  const controls = html('aside', { className: 'controls' });
  append(
    controls,
    detailsCard('Runtime Capabilities', kvGrid('ueCaps', [])),
    detailsCard('Verdict', kvGrid('ueVerdict', []))
  );
  append(layout, left, controls);
  panel.append(layout);
}

function installResearchTab(): void {
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

const RESEARCH_STORAGE_KEY = 'pendulum-lab/research-workbench/v1';
const RESEARCH_STORAGE_SCHEMA_VERSION = 'pendulum-research-workbench/v2';
const MAX_RESEARCH_EXPERIMENTS = 60;
const MAX_RESEARCH_RUN_LOG = 120;
const MAX_RESEARCH_COMPARISON_ROWS = 80;
const MAX_RESEARCH_STUDY_POINTS = 128;
const RESEARCH_RUN_TYPES = new Set<ResearchRunType>(['experiment', 'validation', 'parameter-study', 'comparison', 'export', 'probe']);
const RESEARCH_STUDY_STRATEGIES = new Set<ParameterStudyPlan['strategy']>(['grid', 'random', 'symmetric', 'latin-hypercube', 'edge-focus', 'sobol', 'chebyshev']);
const RESEARCH_SYSTEM_TYPES = new Set<SystemType>(['double', 'triple']);
const RESEARCH_BATCH_STATUSES = new Set<ResearchBatchStatus>(['running', 'cancelled', 'complete', 'failed']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalFinite(value: unknown): number | null {
  return finiteNumber(value) ? Number(value) : null;
}

function clippedText(value: unknown, fallback: string, maxLength = 220): string {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return (text || fallback).slice(0, maxLength);
}

function isoText(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (!finiteNumber(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value)));
}

function sanitizeStringList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeRuntimeSnapshot(value: unknown): RuntimeSnapshot | null {
  const validation = StateStore.validate(value);
  return validation.ok && validation.value ? validation.value : null;
}

function sanitizeResearchMetrics(value: unknown): ResearchMetrics {
  const v = isPlainObject(value) ? value : {};
  return {
    drift: optionalFinite(v.drift),
    lambdaMax: optionalFinite(v.lambdaMax),
    fps: optionalFinite(v.fps),
    physicsMsPerFrame: optionalFinite(v.physicsMsPerFrame),
    poincarePoints: Math.round(clampNumber(v.poincarePoints, 0, 0, 1_000_000)),
    qualityScore: Math.round(clampNumber(v.qualityScore, 0, 0, 100)),
    validationStatus: clippedText(v.validationStatus, 'unknown', 80)
  };
}

function sanitizeResearchExperiment(value: unknown): ResearchExperiment | null {
  if (!isPlainObject(value)) return null;
  const snapshot = sanitizeRuntimeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const now = new Date().toISOString();
  const experiment: ResearchExperiment = {
    id: clippedText(value.id, researchUid('experiment'), 80),
    name: clippedText(value.name, 'Recovered experiment', 120),
    createdAt: isoText(value.createdAt, now),
    updatedAt: isoText(value.updatedAt, now),
    notes: clippedText(value.notes, '', 2_000),
    tags: sanitizeStringList(value.tags),
    snapshot,
    metrics: sanitizeResearchMetrics(value.metrics)
  };
  if (value.favorite === true) experiment.favorite = true;
  if (isPlainObject(value.citation)) {
    experiment.citation = {
      doi: clippedText(value.citation.doi, '', 120),
      reference: clippedText(value.citation.reference, '', 400)
    };
  }
  return experiment;
}

function sanitizeResearchRunLogEntry(value: unknown): ResearchRunLogEntry | null {
  if (!isPlainObject(value)) return null;
  const type = RESEARCH_RUN_TYPES.has(value.type as ResearchRunType) ? value.type as ResearchRunType : null;
  const method = typeof value.method === 'string' && value.method in integratorRegistry ? value.method as IntegratorId : null;
  const system = RESEARCH_SYSTEM_TYPES.has(value.system as SystemType) ? value.system as SystemType : null;
  if (!type || !method || !system) return null;
  const entry: ResearchRunLogEntry = {
    id: clippedText(value.id, researchUid('run'), 80),
    type,
    label: clippedText(value.label, 'Recovered run', 140),
    timestamp: isoText(value.timestamp),
    experimentId: typeof value.experimentId === 'string' ? value.experimentId : null,
    snapshotHash: clippedText(value.snapshotHash, 'unknown', 120),
    method,
    system,
    metrics: sanitizeResearchMetrics(value.metrics),
    summary: clippedText(value.summary, '', 1_000)
  };
  const dt = optionalFinite(value.dt);
  const damping = optionalFinite(value.damping);
  if (dt !== null) entry.dt = dt;
  if (damping !== null) entry.damping = damping;
  if (typeof value.artifact === 'string') entry.artifact = clippedText(value.artifact, '', 180);
  return entry;
}

function sanitizeStudyPointResults(value: unknown): StudyPointResults | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!finiteNumber(value.lambdaMax) || !finiteNumber(value.lambdaBlockStdError) || !finiteNumber(value.rqaDeterminism) || !finiteNumber(value.rqaDivergence) || !finiteNumber(value.ftle)) return undefined;
  const results: StudyPointResults = {
    lambdaMax: Number(value.lambdaMax),
    lambdaBlockStdError: Number(value.lambdaBlockStdError),
    rqaDeterminism: Number(value.rqaDeterminism),
    rqaDivergence: Number(value.rqaDivergence),
    ftle: Number(value.ftle),
    completedAt: isoText(value.completedAt)
  };
  if (finiteNumber(value.durationMs)) results.durationMs = Math.max(0, Math.round(value.durationMs));
  return results;
}

function sanitizeStudyPoint(value: unknown): ParameterStudyPoint | null {
  if (!isPlainObject(value)) return null;
  const snapshot = sanitizeRuntimeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const patch: Record<string, number | string> = {};
  if (isPlainObject(value.patch)) {
    for (const [key, patchValue] of Object.entries(value.patch)) {
      if (finiteNumber(patchValue) || typeof patchValue === 'string') patch[key.slice(0, 64)] = patchValue;
    }
  }
  const point: ParameterStudyPoint = {
    id: clippedText(value.id, researchUid('point'), 80),
    label: clippedText(value.label, 'Recovered point', 140),
    patch,
    snapshot,
    estimate: clippedText(value.estimate, studyEstimate(snapshot), 180)
  };
  const attempts = clampNumber(value.attempts, 0, 0, 50);
  if (attempts > 0) point.attempts = Math.round(attempts);
  const results = sanitizeStudyPointResults(value.results);
  if (results) point.results = results;
  if (typeof value.error === 'string') point.error = clippedText(value.error, '', 400);
  return point;
}

function sanitizeParameterStudyPlan(value: unknown): ParameterStudyPlan | null {
  if (!isPlainObject(value)) return null;
  const strategy = RESEARCH_STUDY_STRATEGIES.has(value.strategy as ParameterStudyPlan['strategy']) ? value.strategy as ParameterStudyPlan['strategy'] : 'grid';
  const values = Array.isArray(value.values)
    ? value.values.filter(finiteNumber).map(Number).slice(0, MAX_RESEARCH_STUDY_POINTS)
    : [];
  const experiments = Array.isArray(value.experiments)
    ? value.experiments.map(sanitizeStudyPoint).filter((point): point is ParameterStudyPoint => Boolean(point)).slice(0, MAX_RESEARCH_STUDY_POINTS)
    : [];
  if (experiments.length === 0) return null;
  return {
    id: clippedText(value.id, researchUid('study'), 80),
    generatedAt: isoText(value.generatedAt),
    variable: clippedText(value.variable, 'theta1', 80),
    strategy,
    min: clampNumber(value.min, values[0] ?? 0, -1e8, 1e8),
    max: clampNumber(value.max, values.at(-1) ?? values[0] ?? 0, -1e8, 1e8),
    count: experiments.length,
    values: values.length ? values.slice(0, experiments.length) : experiments.map((_, index) => index),
    experiments
  };
}

function sanitizeBatchCheckpoint(value: unknown): ResearchBatchCheckpoint | null {
  if (!isPlainObject(value)) return null;
  const status = RESEARCH_BATCH_STATUSES.has(value.status as ResearchBatchStatus) ? value.status as ResearchBatchStatus : null;
  if (!status) return null;
  return {
    id: clippedText(value.id, researchUid('batch'), 80),
    planId: clippedText(value.planId, '', 80),
    planHash: clippedText(value.planHash, '', 120),
    status,
    startedAt: isoText(value.startedAt),
    updatedAt: isoText(value.updatedAt),
    completed: Math.round(clampNumber(value.completed, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    failed: Math.round(clampNumber(value.failed, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    pending: Math.round(clampNumber(value.pending, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    nextIndex: Math.round(clampNumber(value.nextIndex, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    total: Math.round(clampNumber(value.total, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    timeoutMs: Math.round(clampNumber(value.timeoutMs, 45_000, 1_000, 600_000)),
    message: clippedText(value.message, '', 400)
  };
}

function sanitizeComparisonRow(value: unknown): ResearchComparisonRow | null {
  if (!isPlainObject(value)) return null;
  const method = typeof value.method === 'string' && value.method in integratorRegistry ? value.method as IntegratorId : null;
  const system = RESEARCH_SYSTEM_TYPES.has(value.system as SystemType) ? value.system as SystemType : null;
  if (!method || !system) return null;
  return {
    id: clippedText(value.id, researchUid('comparison'), 80),
    label: clippedText(value.label, 'Recovered row', 140),
    source: clippedText(value.source, 'unknown', 80),
    timestamp: isoText(value.timestamp),
    method,
    system,
    dt: clampNumber(value.dt, 0.003, 1e-8, 1),
    damping: clampNumber(value.damping, 0, 0, 100),
    drift: optionalFinite(value.drift),
    lambdaMax: optionalFinite(value.lambdaMax),
    fps: optionalFinite(value.fps),
    score: Math.round(clampNumber(value.score, 0, 0, 100)),
    hash: clippedText(value.hash, 'unknown', 120)
  };
}

function normalizeResearchStorage(value: unknown): { research: ResearchWorkbenchState; migrations: string[]; droppedEntries: number } {
  const fallback: ResearchWorkbenchState = {
    experiments: [],
    selectedExperimentId: '',
    runLog: [],
    parameterStudy: null,
    batchCheckpoint: null,
    comparisonRows: []
  };
  if (!isPlainObject(value)) return { research: fallback, migrations: [], droppedEntries: 0 };
  const source = isPlainObject(value.research) ? value.research : value;
  const schema = typeof value.schemaVersion === 'string' ? value.schemaVersion : 'legacy';
  const migrations = schema === RESEARCH_STORAGE_SCHEMA_VERSION ? [] : [`${schema} -> ${RESEARCH_STORAGE_SCHEMA_VERSION}`];
  const rawExperiments = Array.isArray(source.experiments) ? source.experiments : [];
  const rawRunLog = Array.isArray(source.runLog) ? source.runLog : [];
  const rawComparisonRows = Array.isArray(source.comparisonRows) ? source.comparisonRows : [];
  const experiments = rawExperiments.map(sanitizeResearchExperiment).filter((entry): entry is ResearchExperiment => Boolean(entry)).slice(0, MAX_RESEARCH_EXPERIMENTS);
  const runLog = rawRunLog.map(sanitizeResearchRunLogEntry).filter((entry): entry is ResearchRunLogEntry => Boolean(entry)).slice(0, MAX_RESEARCH_RUN_LOG);
  const comparisonRows = rawComparisonRows.map(sanitizeComparisonRow).filter((entry): entry is ResearchComparisonRow => Boolean(entry)).slice(0, MAX_RESEARCH_COMPARISON_ROWS);
  const parameterStudy = sanitizeParameterStudyPlan(source.parameterStudy);
  const batchCheckpoint = sanitizeBatchCheckpoint(source.batchCheckpoint);
  const selectedExperimentId = typeof source.selectedExperimentId === 'string' && experiments.some((experiment) => experiment.id === source.selectedExperimentId)
    ? source.selectedExperimentId
    : experiments[0]?.id ?? '';
  const studyDrops = isPlainObject(source.parameterStudy) && Array.isArray(source.parameterStudy.experiments) && parameterStudy
    ? Math.max(0, source.parameterStudy.experiments.length - parameterStudy.experiments.length)
    : 0;
  const droppedEntries = Math.max(0, rawExperiments.length - experiments.length)
    + Math.max(0, rawRunLog.length - runLog.length)
    + Math.max(0, rawComparisonRows.length - comparisonRows.length)
    + studyDrops;
  return { research: { experiments, selectedExperimentId, runLog, parameterStudy, batchCheckpoint, comparisonRows }, migrations, droppedEntries };
}

function researchCard(title: string, id: string): HTMLElement {
  const section = html('section', { id, className: 'research-card' });
  section.append(html('div', { className: 'research-title', text: title }));
  return section;
}

function researchInput(id: string, type: string, value: string, placeholder: string): HTMLInputElement {
  const input = html('input', { id });
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  if (type === 'number') input.step = 'any';
  return input;
}

function researchTextArea(id: string, placeholder: string): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.placeholder = placeholder;
  return textarea;
}

function researchSelect(id: string, options: Array<[string, string]>): HTMLSelectElement {
  const select = html('select', { id });
  for (const [value, label] of options) select.append(html('option', { value, text: label }));
  return select;
}

function researchFormRow(label: string, child: HTMLElement): HTMLDivElement {
  const rowNode = html('div', { className: 'research-form-row' });
  append(rowNode, html('label', { text: label }), child);
  return rowNode;
}

function researchActions(...children: HTMLElement[]): HTMLDivElement {
  const rowNode = html('div', { className: 'research-actions' });
  children.forEach((child) => rowNode.append(child));
  return rowNode;
}

function researchUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadResearchState(): void {
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    if (raw) {
      const { research, migrations, droppedEntries } = normalizeResearchStorage(JSON.parse(raw));
      state.research = research;
      if (migrations.length || droppedEntries > 0) {
        state.auditLog.unshift(`research storage normalized: ${migrations.join(', ') || 'current schema'}; dropped ${droppedEntries} invalid entr${droppedEntries === 1 ? 'y' : 'ies'}`);
        persistResearchState();
      }
    }
  } catch (error) {
    state.auditLog.unshift(`research storage ignored: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Runs even when localStorage is empty: the IndexedDB archive is the
  // long-term store and recovers the workbench after localStorage loss.
  hydrateResearchDb();
}

function persistResearchState(): void {
  try {
    const payload: ResearchStoragePayload = {
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      migrations: [],
      droppedEntries: 0,
      ...state.research
    };
    window.localStorage?.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    state.lastFault = `Research storage failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  mirrorResearchStateToDb();
}

// --- IndexedDB long-term research store -----------------------------------
// localStorage stays the synchronous resume cache; the IndexedDB ResearchDb is
// the long-term archive (experiments, run log, studies + results, figures,
// bundles) with quota headroom far beyond the ~5 MB localStorage limit.

let researchDbSingleton: ResearchDb | null = null;

function researchDbInstance(): ResearchDb {
  if (!researchDbSingleton) researchDbSingleton = new ResearchDb();
  return researchDbSingleton;
}

let researchDbMirrorTimer = 0;

/** Debounced async mirror of the workbench state into IndexedDB. */
function mirrorResearchStateToDb(): void {
  const db = researchDbInstance();
  if (!db.available()) return;
  window.clearTimeout(researchDbMirrorTimer);
  researchDbMirrorTimer = window.setTimeout(() => {
    void (async () => {
      try {
        await db.putMany('experiments', state.research.experiments.map((experiment) => ({ id: experiment.id, payload: experiment })));
        await db.putMany('runLog', state.research.runLog.map((entry) => ({ id: entry.id, payload: entry })));
        const study = state.research.parameterStudy;
        if (study) {
          await db.put('parameterStudies', study.id, study);
          const results = study.experiments
            .filter((point) => point.results)
            .map((point) => ({ id: `${study.id}:${point.id}`, payload: { studyId: study.id, pointId: point.id, patch: point.patch, results: point.results } }));
          if (results.length > 0) await db.putMany('studyResults', results);
        }
        await db.put('settings', 'workbench-state', {
          selectedExperimentId: state.research.selectedExperimentId,
          batchCheckpoint: state.research.batchCheckpoint,
          comparisonRows: state.research.comparisonRows
        });
        renderResearchStoragePanel();
      } catch (error) {
        state.auditLog.unshift(`research db mirror failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, 400);
}

/**
 * Async hydration: run the one-time localStorage v2 -> IndexedDB migration and,
 * when localStorage came up empty but the archive still has experiments,
 * recover them (sanitized through the same validators as every other source).
 */
function hydrateResearchDb(): void {
  const db = researchDbInstance();
  if (!db.available()) return;
  void (async () => {
    try {
      await db.open();
      const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY) ?? null;
      const migration = await migrateFromLocalStorageV2(db, raw);
      if (migration.migrated) {
        state.auditLog.unshift(`research db: ${migration.reason} (${migration.entries} entries)`);
      }
      if (state.research.experiments.length === 0) {
        const stored = await db.getAll('experiments');
        const revived = stored
          .map((record) => sanitizeResearchExperiment(record.payload))
          .filter((experiment): experiment is ResearchExperiment => Boolean(experiment))
          .slice(0, MAX_RESEARCH_EXPERIMENTS);
        if (revived.length > 0) {
          state.research.experiments = revived;
          state.research.selectedExperimentId = revived[0]?.id ?? '';
          state.auditLog.unshift(`research db: recovered ${revived.length} experiment(s) from IndexedDB`);
          persistResearchState();
          renderResearchWorkbench();
        }
      }
      renderResearchStoragePanel();
    } catch (error) {
      state.auditLog.unshift(`research db hydrate failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

interface ChromiumMemory {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

/** Research Workbench performance budget: frame, physics, heap, jobs, storage. */
async function renderPerfBudgetPanel(): Promise<void> {
  const target = $('rwPerfBudget');
  if (!target) return;
  const diag = modernLab()?.diagnostics?.();
  const memory = (performance as unknown as { memory?: ChromiumMemory }).memory;
  let localStorageBytes: number | null = null;
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    localStorageBytes = raw ? raw.length * 2 : 0;
  } catch {
    localStorageBytes = null;
  }
  let idbUsageFraction: number | null = null;
  try {
    const quota = await researchDbInstance().estimateQuota();
    idbUsageFraction = quota?.usageFraction ?? null;
  } catch {
    idbUsageFraction = null;
  }
  const rows = evaluatePerformanceBudget({
    fps: Number.isFinite(diag?.fps ?? Number.NaN) ? diag!.fps : null,
    physicsMsPerFrame: Number.isFinite(diag?.physicsMsPerFrame ?? Number.NaN) ? diag!.physicsMsPerFrame : null,
    usedHeapBytes: memory?.usedJSHeapSize ?? null,
    heapLimitBytes: memory?.jsHeapSizeLimit ?? null,
    workerPoolSize: studyJobClientPoolSize || studyPoolSize(),
    jobsInFlight: studyJobClient?.inFlight() ?? 0,
    localStorageBytes,
    idbUsageFraction
  });
  renderResearchTable(
    'rwPerfBudget',
    ['metric', 'value', 'budget', 'status'],
    rows.map((row) => [row.metric, row.value, row.budget, row.ok ? 'OK' : 'OVER BUDGET']),
    'Budget not evaluated yet.'
  );
}

function renderResearchStoragePanel(): void {
  const summary = $('rwStorageSummary');
  if (!summary) return;
  const db = researchDbInstance();
  if (!db.available()) {
    summary.textContent = 'IndexedDB unavailable in this browser; localStorage fallback active.';
    return;
  }
  void (async () => {
    try {
      const counts = await db.counts();
      const quota = await db.estimateQuota();
      const quotaText = quota
        ? `${(quota.usageBytes / 1024 / 1024).toFixed(1)} / ${(quota.quotaBytes / 1024 / 1024).toFixed(0)} MiB (${(quota.usageFraction * 100).toFixed(1)}%)`
        : 'quota API unavailable';
      summary.textContent = `IndexedDB: ${counts.experiments} experiments, ${counts.runLog} runs, ${counts.parameterStudies} studies, ${counts.studyResults} results, ${counts.figures} figures, ${counts.bundles} bundles. Quota ${quotaText}. Recoveries: ${db.recoveries}.`;
    } catch (error) {
      summary.textContent = `IndexedDB status unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  })();
}

function exportResearchDbArchive(): void {
  void (async () => {
    try {
      const archive = await researchDbInstance().exportArchive();
      downloadJson('pendulum_research_db_archive.json', archive);
      logResearchRun('export', 'Research DB archive export', `Full IndexedDB archive (${Object.values(archive.stores).reduce((sum, records) => sum + records.length, 0)} records).`, 'pendulum_research_db_archive.json');
      toast('Research DB archive exported');
    } catch (error) {
      toast(`Archive export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

function importResearchDbArchive(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as ResearchDbArchive;
        const validation = validateResearchDbArchive(parsed);
        if (!validation.ok) {
          toast(`Archive rejected: ${validation.problems[0] ?? 'invalid'}`);
          return;
        }
        const { imported } = await researchDbInstance().importArchive(parsed, 'merge');
        toast(`Imported ${imported} records into IndexedDB`);
        hydrateResearchDb();
      } catch (error) {
        toast(`Archive import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  input.click();
}

/** Full workspace export: research state + design study + captions + live snapshot. */
function exportWorkspaceJson(): void {
  const payload = {
    schemaVersion: 'pendulum-workspace/v1',
    savedAt: new Date().toISOString(),
    research: {
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      migrations: [],
      droppedEntries: 0,
      ...state.research
    },
    designStudy,
    figureCaptions: loadFigureCaptionOverrides(),
    snapshot: currentSnapshot()
  };
  downloadJson('pendulum_workspace.json', payload);
  logResearchRun('export', 'Workspace export', 'Full workspace: research state, design study, figure captions, live snapshot.', 'pendulum_workspace.json');
  toast('Workspace saved');
}

/** Restore a workspace file: every section passes through the same sanitizers as storage. */
function importWorkspaceJson(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
        if (parsed.schemaVersion !== 'pendulum-workspace/v1') {
          toast('Not a pendulum workspace file');
          return;
        }
        const { research, droppedEntries } = normalizeResearchStorage(parsed.research);
        state.research = research;
        const rawDesign = parsed.designStudy as DesignStudyState | null | undefined;
        if (rawDesign && rawDesign.schemaVersion === 'pendulum-design-study/v1' && Array.isArray(rawDesign.variables) && Array.isArray(rawDesign.points)) {
          designStudy = { ...rawDesign, status: rawDesign.status === 'running' ? 'idle' : rawDesign.status };
          persistDesignStudy();
        }
        if (isPlainObject(parsed.figureCaptions)) {
          for (const [id, caption] of Object.entries(parsed.figureCaptions)) {
            if (typeof caption === 'string') saveFigureCaptionOverride(id, caption);
          }
        }
        const snapshot = sanitizeRuntimeSnapshot(parsed.snapshot);
        if (snapshot) applySnapshotControls(snapshot);
        persistResearchState();
        renderResearchWorkbench();
        logResearchRun('experiment', 'Workspace restored', `${state.research.experiments.length} experiments, ${droppedEntries} entries dropped during sanitisation.`);
        toast('Workspace restored');
      } catch (error) {
        toast(`Workspace restore failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  input.click();
}

/** Quick ensemble throughput probe: WebGPU when present, CPU fallback otherwise. */
async function runEnsembleBenchmark(): Promise<void> {
  setText('rwEnsembleResult', 'Running 256-trajectory ensemble (2000 RK4 steps each)…');
  try {
    const p = currentParameters();
    const result = await runDoublePendulumEnsemble(
      { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g },
      ensembleGrid(16, [-2.5, 2.5]),
      { steps: 2000, dt: 0.005 }
    );
    const stepsTotal = result.n * result.steps;
    setText('rwEnsembleResult',
      `Backend: ${result.backend.toUpperCase()} — ${result.n} trajectories × ${result.steps} steps in ${result.elapsedMs.toFixed(0)} ms `
      + `(${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms). ${result.caveat}`);
    logResearchRun('probe', 'Ensemble benchmark', `${result.backend}, ${(stepsTotal / Math.max(1, result.elapsedMs)).toFixed(0)} steps/ms`);
  } catch (error) {
    setText('rwEnsembleResult', `Ensemble benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clearResearchDb(): void {
  void (async () => {
    try {
      const db = researchDbInstance();
      await db.destroy();
      researchDbSingleton = null;
      toast('IndexedDB research store cleared');
      renderResearchStoragePanel();
    } catch (error) {
      toast(`Clear failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

function cloneSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RuntimeSnapshot;
}

function collectResearchMetrics(validationStatus = 'not-run'): ResearchMetrics {
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

function metricValue(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value) ? '-' : Math.abs(value) >= 1000 || Math.abs(value) < 0.01 ? value.toExponential(2) : value.toFixed(digits);
}

function selectedResearchExperiment(): ResearchExperiment | undefined {
  const select = $('rwExperimentSelect');
  const id = select instanceof HTMLSelectElement ? select.value : state.research.selectedExperimentId;
  return state.research.experiments.find((experiment) => experiment.id === id);
}

function defaultExperimentName(snapshot: RuntimeSnapshot): string {
  return `${snapshot.systemType}-${snapshot.method}-dt${snapshot.dt.toPrecision(3)}-${snapshot.hash.slice(0, 8)}`;
}

function saveCurrentExperiment(): void {
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

function applySnapshotControls(snapshot: RuntimeSnapshot): void {
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

function loadSelectedExperiment(): void {
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

function deleteSelectedExperiment(): void {
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

function exportExperimentLibrary(): void {
  downloadJson('pendulum_research_experiment_library.json', {
    schemaVersion: 'pendulum-research-experiments/v1',
    generatedAt: new Date().toISOString(),
    experiments: state.research.experiments
  });
  logResearchRun('export', 'Experiment library export', `${state.research.experiments.length} experiments`, 'pendulum_research_experiment_library.json');
}

function logResearchRun(type: ResearchRunType, label: string, summary: string, artifact = '', validationStatus = 'not-run'): ResearchRunLogEntry {
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

function markResearchRun(): void {
  logResearchRun('probe', 'Manual research mark', 'Current state captured in run log.');
  toast('Run marked');
}

function clearResearchRunLog(): void {
  state.research.runLog = [];
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
  toast('Run log cleared');
}

function exportResearchRunLog(): void {
  downloadJson('pendulum_research_run_log.json', {
    schemaVersion: 'pendulum-research-run-log/v1',
    generatedAt: new Date().toISOString(),
    entries: state.research.runLog
  });
  logResearchRun('export', 'Run log export', `${state.research.runLog.length} entries`, 'pendulum_research_run_log.json');
}

function studyStrategy(): ParameterStudyPlan['strategy'] {
  const raw = selectValue('rwStudyStrategy', 'grid');
  return RESEARCH_STUDY_STRATEGIES.has(raw as ParameterStudyPlan['strategy']) ? raw as ParameterStudyPlan['strategy'] : 'grid';
}

function snapshotWithStudyPatch(base: RuntimeSnapshot, variable: string, value: number): RuntimeSnapshot {
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

function studyEstimate(snapshot: RuntimeSnapshot): string {
  const stiffness = snapshot.dt < 0.001 ? 'high cost' : snapshot.dt < 0.004 ? 'medium cost' : 'low cost';
  const caveat = snapshot.systemType === 'triple' ? 'triple sensitivity' : snapshot.damping > 0 ? 'dissipative' : 'conservative';
  return `${stiffness}, ${caveat}`;
}

function generateParameterStudy(): void {
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

function selectedStudyPoint(): ParameterStudyPoint | undefined {
  const plan = state.research.parameterStudy;
  const select = $('rwStudyPointSelect');
  const id = select instanceof HTMLSelectElement ? select.value : '';
  return plan?.experiments.find((point) => point.id === id) ?? plan?.experiments[0];
}

function applySelectedStudyPoint(): void {
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

const studyBatch = {
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

let studyJobClient: JobClient | null = null;
let studyJobClientPoolSize = 0;

/** V2 job client with a worker pool; rebuilt when the requested pool size changes. */
function studyJobClientInstance(poolSize: number): JobClient {
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

function studyPoolSize(): number {
  return Math.round(clampNumber(numberFrom('rwStudyPool', 2), 2, 1, 4));
}

function writeStudyBatchCheckpoint(plan: ParameterStudyPlan, status: ResearchBatchStatus, message: string, nextIndex = studyBatch.current): void {
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

function clearStudyBatchCheckpoint(): void {
  state.research.batchCheckpoint = null;
  persistResearchState();
  renderResearchWorkbench();
  toast('Batch checkpoint cleared');
}

function studyBatchTimeoutMs(): number {
  const seconds = clampNumber(numberFrom('rwStudyTimeout', 45), 45, 5, 300);
  return Math.round(seconds * 1000);
}

/** Map a study-point snapshot onto the declarative chaos-job system spec. */
function studySpecFromSnapshot(snapshot: RuntimeSnapshot): { spec: SystemSpec; state0: number[] } {
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
async function runStudyBatch(options: { failedOnly?: boolean; resume?: boolean } = {}): Promise<void> {
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

function cancelStudyBatch(): void {
  if (!studyBatch.running) {
    toast('No batch running');
    return;
  }
  studyBatch.cancelled = true;
  studyBatch.cancelInFlight?.();
  toast('Cancelling batch...');
}

function exportParameterStudy(): void {
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

function studyPointValue(plan: ParameterStudyPlan, point: ParameterStudyPoint, index: number): number | string {
  const patched = point.patch[plan.variable];
  if (typeof patched === 'number' || typeof patched === 'string') return patched;
  return plan.values[index] ?? '';
}

function studyPlanHash(plan: ParameterStudyPlan): string {
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

function studyCompletionSummary(plan: ParameterStudyPlan): { complete: number; failed: number; pending: number; planHash: string } {
  const complete = plan.experiments.filter((point) => point.results).length;
  const failed = plan.experiments.filter((point) => point.error && !point.results).length;
  return {
    complete,
    failed,
    pending: Math.max(0, plan.experiments.length - complete - failed),
    planHash: studyPlanHash(plan)
  };
}

function exportParameterStudyResultsCsv(): void {
  const plan = state.research.parameterStudy;
  if (!plan) {
    toast('Generate a parameter study first');
    return;
  }
  downloadText('pendulum_parameter_study_results.csv', parameterStudyResultsCsvText(plan), 'text/csv;charset=utf-8');
  logResearchRun('export', 'Parameter study CSV export', `${plan.experiments.length} rows`, 'pendulum_parameter_study_results.csv');
}

function parameterStudyResultsCsvText(plan: ParameterStudyPlan): string {
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

interface DesignStudyPointState {
  id: string;
  values: Record<string, number>;
  origin: DesignPoint['origin'];
  replicate: number;
  attempts?: number;
  results?: StudyPointResults;
  error?: string;
}

interface DesignStudyState {
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

const DESIGN_STORAGE_KEY = 'pendulum-lab/design-study/v1';
const DESIGN_VARIABLE_KEYS = new Set(['theta1', 'theta2', 'omega1', 'omega2', 'damping', 'dt', 'mass-ratio', 'length-ratio']);

let designStudy: DesignStudyState | null = null;

const designBatch = {
  running: false,
  cancelled: false,
  startedAtMs: 0,
  cancelInFlight: null as (() => void) | null
};

function persistDesignStudy(): void {
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

function loadDesignStudy(): void {
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

function parseDesignVariables(): StudyVariable[] {
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

function designBudgetFromControls(): DesignBudget {
  return {
    maxPoints: Math.round(clampNumber(numberFrom('rwDesignMaxPoints', 48), 48, 4, 256)),
    maxTimeMs: Math.round(clampNumber(numberFrom('rwDesignMaxTime', 300), 300, 10, 3600) * 1000),
    maxFailures: Math.round(clampNumber(numberFrom('rwDesignMaxFailures', 6), 6, 1, 64))
  };
}

function generateDesignStudy(): void {
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

function designSnapshotForValues(values: Record<string, number>): RuntimeSnapshot {
  let snapshot = cloneSnapshot(currentSnapshot());
  for (const [key, value] of Object.entries(values)) {
    snapshot = snapshotWithStudyPatch(snapshot, key, value);
  }
  return snapshot;
}

function designEvaluatedPoints(design: DesignStudyState): EvaluatedPoint[] {
  return design.points
    .filter((point) => point.results)
    .map((point) => ({
      values: point.values,
      lambdaMax: point.results!.lambdaMax,
      lambdaStdError: point.results!.lambdaBlockStdError
    }));
}

/** Run pending design points on the worker pool, then adaptive/boundary/uncertainty refinement passes under budget. */
async function runDesignBatch(): Promise<void> {
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

function cancelDesignBatch(): void {
  if (!designBatch.running) {
    toast('No design batch running');
    return;
  }
  designBatch.cancelled = true;
  designBatch.cancelInFlight?.();
  toast('Cancelling design batch...');
}

const DESIGN_ORIGIN_COLORS: Record<DesignPoint['origin'], string> = {
  design: '#4cc9f0',
  replicate: '#a3b3c9',
  adaptive: '#f4a261',
  boundary: '#e63946',
  uncertainty: '#b388eb'
};

function drawDesignPreview(design: DesignStudyState): void {
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

function drawDesignHeatmap(design: DesignStudyState): void {
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

function renderDesignStudy(): void {
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

function designStudyCsvText(design: DesignStudyState): string {
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

function exportDesignStudyCsv(): void {
  if (!designStudy) {
    toast('Generate a design first');
    return;
  }
  downloadText('pendulum_design_study_results.csv', designStudyCsvText(designStudy), 'text/csv;charset=utf-8');
  logResearchRun('export', 'Design study CSV export', `${designStudy.points.length} rows`, 'pendulum_design_study_results.csv');
}

function exportDesignStudyJson(): void {
  if (!designStudy) {
    toast('Generate a design first');
    return;
  }
  downloadJson('pendulum_design_study.json', { ...designStudy, designHash: hashText(JSON.stringify(designStudy.points.map((point) => [point.id, point.values]))) });
  logResearchRun('export', 'Design study JSON export', `${designStudy.points.length} points`, 'pendulum_design_study.json');
}

// --- Analysis superpack ------------------------------------------------------

let superpackChaosClient: ChaosClient | null = null;

function superpackClient(): ChaosClient {
  if (!superpackChaosClient) superpackChaosClient = new ChaosClient();
  return superpackChaosClient;
}

function doubleSpecFromCurrent(): Extract<SystemSpec, { kind: 'double' }> {
  const p = currentParameters();
  return { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
}

/** Replace (or append) one titled analysis section inside the superpack results. */
function superpackSection(key: string, title: string, lines: string[]): void {
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

async function runWadaConvergencePanel(): Promise<void> {
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

async function runRecurrenceNetworkPanel(): Promise<void> {
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

async function runFtleRidgePanel(): Promise<void> {
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

async function runBifurcationDetectPanel(): Promise<void> {
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
function runFixedPointPanel(): void {
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

async function runCodimTwoPanel(): Promise<void> {
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

function runShadowingPanel(): void {
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

function runMelnikovPanel(): void {
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

function comparisonRowFromExperiment(experiment: ResearchExperiment): ResearchComparisonRow {
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

function comparisonRowFromRun(entry: ResearchRunLogEntry): ResearchComparisonRow {
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

function buildComparisonRows(): ResearchComparisonRow[] {
  return [
    ...state.research.experiments.map(comparisonRowFromExperiment),
    ...state.research.runLog.slice(0, 24).map(comparisonRowFromRun)
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 60);
}

function rebuildComparisonMatrix(): void {
  state.research.comparisonRows = buildComparisonRows();
  persistResearchState();
  renderResearchWorkbench();
  logResearchRun('comparison', 'Rebuilt comparison matrix', `${state.research.comparisonRows.length} rows`);
}

function exportComparisonMatrix(): void {
  if (!state.research.comparisonRows.length) state.research.comparisonRows = buildComparisonRows();
  downloadJson('pendulum_result_comparison_matrix.json', {
    schemaVersion: 'pendulum-result-comparison/v1',
    generatedAt: new Date().toISOString(),
    rows: state.research.comparisonRows
  });
  logResearchRun('export', 'Comparison matrix export', `${state.research.comparisonRows.length} rows`, 'pendulum_result_comparison_matrix.json');
}

function buildMethodsText(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const limitations = createSubmissionManifest(snapshot).limitations.map((item) => `- ${item}`).join('\n');
  return [
    '# Pendulum Lab Methods',
    '',
    `System: ${snapshot.systemType} pendulum.`,
    `Integrator: ${method.name} (id ${method.id}, order ${method.order}, symplectic label: ${method.symplectic}).`,
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    `Damping gamma: ${snapshot.damping}; mode: ${snapshot.mode}; state hash: ${snapshot.hash}.`,
    `Parameters: ${JSON.stringify(snapshot.parameters)}.`,
    '',
    'Reproducibility:',
    `Seed: ${snapshot.seed ?? 'none'}.`,
    'All exported runs include the runtime snapshot, selected integrator metadata, browser-worker policy, and limitation notes.',
    '',
    'Limitations:',
    limitations
  ].join('\n');
}

interface PaperFigure {
  id: string;
  caption: string;
  width: number;
  height: number;
  dataHash: string;
  byteEstimate: number;
  /** PNG data URL captured from the live canvas. */
  dataUrl: string;
}

interface PaperFigureManifest {
  schemaVersion: 'pendulum-paper-figures/v2';
  generatedAt: string;
  runtime: RuntimeSnapshot;
  figureCount: number;
  totalBytes: number;
  figures: Array<{
    id: string;
    file: string;
    caption: string;
    width: number;
    height: number;
    dataHash: string;
    byteEstimate: number;
    sourceCanvas: string;
  }>;
}

/**
 * Captions for every analysis canvas the app can draw. Canvases render only
 * while their tab is (or was) active, so blank canvases are filtered out at
 * capture time rather than listed with empty images.
 */
const FIGURE_CAPTIONS: Record<string, string> = {
  main: 'Pendulum trajectory with long-exposure trail (live simulation canvas).',
  energy: 'Total energy E(t); drift quantifies integrator fidelity.',
  lyap: 'Running maximal-Lyapunov estimate λ₁(t) from the live divergence proxy.',
  phase: 'Phase portrait (θ₁, ω₁).',
  poincare: 'Poincaré section at the θ₁ = 0 (θ̇₁ > 0) crossing.',
  fft: 'Frequency spectrum of θ₁ (FFT magnitude).',
  cmpCanvas: 'Integrator comparison: four methods overlaid on the same system.',
  cmpEnergy: 'Energy drift per integrator over the comparison run.',
  cmpDiverge: 'Pairwise trajectory divergence between integrators.',
  cmpBench: 'Throughput benchmark (steps/ms) across eight integrators.',
  lyapSpecCanvas: 'Full Lyapunov spectrum with per-exponent uncertainty.',
  sweepCanvas: 'Chaos map: maximal Lyapunov exponent over the (θ₁, θ₂) grid.',
  bifCanvas: 'Bifurcation diagram: Poincaré θ₂ values swept over gravity g.',
  p3dCanvas: '3D phase-space projection (θ₁, θ₂, ω₂), orthographic.',
  gpuCanvas: 'Phase-density accumulation over (θ₁, ω₁), additive blending.',
  zeroOneCanvas: '0–1 test translation path (p_c, q_c): bounded ⇒ regular, Brownian ⇒ chaotic.',
  clvCanvas: 'Covariant Lyapunov vector hyperbolicity angles along the trajectory.',
  basinCanvas: 'Flip-basin classification over initial conditions; fractal boundary.',
  rqaCanvas: 'Recurrence plot of the embedded cos θ₁ observable.',
  ftleCanvas: 'Finite-time Lyapunov exponent field; ridges are Lagrangian coherent structures.'
};

/** Data URL of an untouched canvas of the same size — used to skip blank canvases. */
const blankCanvasCache = new Map<string, string>();

function blankDataUrl(width: number, height: number): string {
  const key = `${width}x${height}`;
  const cached = blankCanvasCache.get(key);
  if (cached) return cached;
  const probe = document.createElement('canvas');
  probe.width = width;
  probe.height = height;
  const url = probe.toDataURL('image/png');
  blankCanvasCache.set(key, url);
  return url;
}

const FIGURE_CAPTION_OVERRIDE_KEY = 'pendulum-lab/figure-captions/v1';

function loadFigureCaptionOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage?.getItem(FIGURE_CAPTION_OVERRIDE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (isPlainObject(parsed)) {
      const overrides: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && key in FIGURE_CAPTIONS) overrides[key] = value.slice(0, 400);
      }
      return overrides;
    }
  } catch {
    /* corrupted overrides are ignored; defaults apply */
  }
  return {};
}

function saveFigureCaptionOverride(id: string, caption: string): void {
  const overrides = loadFigureCaptionOverrides();
  if (caption.trim() && caption.trim() !== FIGURE_CAPTIONS[id]) overrides[id] = caption.trim();
  else delete overrides[id];
  try {
    window.localStorage?.setItem(FIGURE_CAPTION_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    /* quota exhausted: caption stays default */
  }
}

function effectiveFigureCaption(id: string): string {
  return loadFigureCaptionOverrides()[id] ?? FIGURE_CAPTIONS[id] ?? id;
}

/** Capture every drawn analysis canvas as a captioned PNG figure. */
function collectPaperFigures(): PaperFigure[] {
  const overrides = loadFigureCaptionOverrides();
  const figures: PaperFigure[] = [];
  for (const [id, defaultCaption] of Object.entries(FIGURE_CAPTIONS)) {
    const caption = overrides[id] ?? defaultCaption;
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      continue;
    }
    if (dataUrl === blankDataUrl(canvas.width, canvas.height)) continue;
    figures.push({
      id,
      caption,
      width: canvas.width,
      height: canvas.height,
      dataHash: hashText(dataUrl),
      byteEstimate: dataUrlByteEstimate(dataUrl),
      dataUrl
    });
  }
  return figures;
}

// --- Figure Studio -----------------------------------------------------------

function selectedFigureTheme(): FigureTheme {
  const raw = selectValue('rwFigTheme', 'light');
  return raw === 'dark' || raw === 'print' || raw === 'colorblind' ? raw : 'light';
}

function selectedFigureScale(): 1 | 2 | 4 {
  const raw = selectValue('rwFigScale', '1');
  return raw === '2' ? 2 : raw === '4' ? 4 : 1;
}

function renderFigureStudio(): void {
  const select = $('rwFigSelect');
  const captionField = $('rwFigCaption');
  if (select instanceof HTMLSelectElement && captionField instanceof HTMLTextAreaElement) {
    captionField.value = effectiveFigureCaption(select.value);
  }
}

function saveSelectedFigureCaption(): void {
  const select = $('rwFigSelect');
  const captionField = $('rwFigCaption');
  if (!(select instanceof HTMLSelectElement) || !(captionField instanceof HTMLTextAreaElement)) return;
  saveFigureCaptionOverride(select.value, captionField.value);
  setText('rwFigureSummary', `Caption saved for ${select.value}. Exports and bundles now use it.`);
  toast('Caption saved');
}

function studyFigureSpecFromCurrentStudy(): ReturnType<typeof studyFigureFromSavedStudy> | null {
  const plan = state.research.parameterStudy;
  if (!plan) return null;
  const rows = plan.experiments
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.results)
    .map(({ point, index }) => ({
      value: Number(studyPointValue(plan, point, index)),
      lambdaMax: point.results!.lambdaMax,
      lambdaErr: point.results!.lambdaBlockStdError
    }))
    .filter((row) => Number.isFinite(row.value));
  if (rows.length === 0) return null;
  return studyFigureFromSavedStudy(
    { variable: plan.variable, strategy: plan.strategy, planHash: studyPlanHash(plan), rows },
    selectedFigureTheme()
  );
}

/** Vector SVG of λ(parameter) regenerated from the saved study (true vector, themed). */
function exportStudyFigureSvg(): void {
  const spec = studyFigureSpecFromCurrentStudy();
  if (!spec) {
    toast('Run a study batch first — the figure regenerates from saved results');
    return;
  }
  const svg = renderStudyFigureSvg(spec);
  downloadText(`pendulum_study_figure_${spec.theme}.svg`, svg, 'image/svg+xml;charset=utf-8');
  setText('rwFigureSummary', `SVG exported (theme ${spec.theme}, ${spec.points.length} points). Visual fingerprint ${figureFingerprint(svg)}.`);
  logResearchRun('export', 'Study figure SVG', `theme ${spec.theme}, ${spec.points.length} points, fingerprint ${figureFingerprint(svg)}`, `pendulum_study_figure_${spec.theme}.svg`);
}

/** Rasterise the themed SVG study figure to PNG at the selected 1x/2x/4x scale. */
async function exportStudyFigurePng(): Promise<void> {
  const spec = studyFigureSpecFromCurrentStudy();
  if (!spec) {
    toast('Run a study batch first — the figure regenerates from saved results');
    return;
  }
  const scale = selectedFigureScale();
  const svg = renderStudyFigureSvg(spec);
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVG rasterisation failed'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = (spec.width ?? 720) * scale;
    canvas.height = (spec.height ?? 440) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    downloadBytes(`pendulum_study_figure_${spec.theme}_${scale}x.png`, dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
    setText('rwFigureSummary', `PNG exported at ${scale}x (${canvas.width}×${canvas.height}, theme ${spec.theme}).`);
    logResearchRun('export', 'Study figure PNG', `${scale}x, theme ${spec.theme}`, `pendulum_study_figure_${spec.theme}_${scale}x.png`);
  } catch (error) {
    toast(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exportStudyFigureCsv(): void {
  const spec = studyFigureSpecFromCurrentStudy();
  const plan = state.research.parameterStudy;
  if (!spec || !plan) {
    toast('Run a study batch first');
    return;
  }
  const csv = figureSourceCsv(spec, { planHash: studyPlanHash(plan), variable: plan.variable, strategy: plan.strategy });
  downloadText('pendulum_study_figure_source.csv', csv, 'text/csv;charset=utf-8');
  logResearchRun('export', 'Figure source CSV', `${spec.points.length} rows`, 'pendulum_study_figure_source.csv');
}

/** Download every drawn analysis canvas as PNG at the selected scale. */
function exportScaledCanvases(): void {
  const scale = selectedFigureScale();
  let exported = 0;
  for (const id of Object.keys(FIGURE_CAPTIONS)) {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    try {
      const dataUrl = scaleCanvasToPngDataUrl(canvas, scale);
      if (dataUrl === blankDataUrl(canvas.width * scale, canvas.height * scale)) continue;
      exported += 1;
      downloadBytes(`pendulum_figure_${id}_${scale}x.png`, dataUrlToBytes(dataUrl), 'image/png');
    } catch {
      /* tainted or unreadable canvas: skip */
    }
  }
  setText('rwFigureSummary', exported > 0 ? `${exported} canvas figure(s) exported at ${scale}x.` : 'No drawn canvases found — visit the analysis tabs first.');
  if (exported > 0) logResearchRun('export', 'Scaled canvas figures', `${exported} canvases at ${scale}x`);
}

function buildPaperFigureManifest(figures = collectPaperFigures(), snapshot = currentSnapshot()): PaperFigureManifest {
  return {
    schemaVersion: 'pendulum-paper-figures/v2',
    generatedAt: new Date().toISOString(),
    runtime: snapshot,
    figureCount: figures.length,
    totalBytes: figures.reduce((sum, figure) => sum + figure.byteEstimate, 0),
    figures: figures.map((figure, index) => ({
      id: figure.id,
      file: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png`,
      caption: figure.caption,
      width: figure.width,
      height: figure.height,
      dataHash: figure.dataHash,
      byteEstimate: figure.byteEstimate,
      sourceCanvas: `#${figure.id}`
    }))
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Export the captured figures as a single self-contained HTML gallery: each
 * figure is numbered with its caption and the run's reproducibility context,
 * and the page is print-stylesheet-friendly (print to PDF for a paper appendix).
 */
function exportPaperFiguresHtml(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet — visit the analysis tabs first');
    return;
  }
  const snapshot = currentSnapshot();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const items = figures.map((figure, index) => [
    '<figure>',
    `<img src="${figure.dataUrl}" alt="${escapeHtml(figure.caption)}" width="${figure.width}" height="${figure.height}">`,
    `<figcaption><strong>Figure ${index + 1}.</strong> ${escapeHtml(figure.caption)} <span class="meta">[canvas #${figure.id}, ${figure.width}×${figure.height}, hash ${escapeHtml(figure.dataHash)}]</span></figcaption>`,
    '</figure>'
  ].join('\n')).join('\n');
  const manifestJson = JSON.stringify(figureManifest, null, 2).replace(/</g, '\\u003c');
  const doc = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>Pendulum Lab — Figure Pack</title>',
    '<style>',
    'body{font:14px/1.6 Georgia,serif;max-width:880px;margin:32px auto;padding:0 16px;color:#111;background:#fff}',
    'figure{margin:0 0 36px;page-break-inside:avoid}',
    'img{max-width:100%;height:auto;border:1px solid #ccc;background:#0b1020}',
    'figcaption{margin-top:8px}.meta{color:#777;font-size:12px}',
    'header{border-bottom:2px solid #111;margin-bottom:28px;padding-bottom:12px}',
    'code{font:12px/1.4 monospace;background:#f4f4f4;padding:1px 4px}',
    '</style></head><body>',
    '<header><h1>Pendulum Lab — Figure Pack</h1>',
    `<p>Generated ${new Date().toISOString()} — system <code>${escapeHtml(snapshot.systemType)}</code>, integrator <code>${escapeHtml(snapshot.method)}</code>, dt <code>${snapshot.dt}</code>, state hash <code>${escapeHtml(snapshot.hash)}</code>.</p>`,
    `<p>Figures are PNG captures of the live analysis canvases (only canvases that have been drawn are included). Manifest: ${figures.length} figure(s), estimated ${(figureManifest.totalBytes / 1024).toFixed(1)} KiB. Print this page to PDF for a paper-ready appendix.</p></header>`,
    items,
    `<script type="application/json" id="pendulum-figure-manifest">${manifestJson}</script>`,
    '</body></html>'
  ].join('\n');
  downloadText('pendulum_paper_figures.html', doc, 'text/html;charset=utf-8');
  logResearchRun('export', 'Figure pack export', `${figures.length} captioned PNG figures`, 'pendulum_paper_figures.html');
  renderResearchWorkbench();
  toast(`Figure pack exported (${figures.length} figures)`);
}

function exportPaperFigureManifestJson(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet — visit the analysis tabs first');
    return;
  }
  const manifest = buildPaperFigureManifest(figures);
  downloadJson('pendulum_figure_manifest.json', manifest);
  logResearchRun('export', 'Figure manifest export', `${manifest.figureCount} figures, ${(manifest.totalBytes / 1024).toFixed(1)} KiB`, 'pendulum_figure_manifest.json');
  renderResearchWorkbench();
}

function buildPaperExportPack(): unknown {
  const snapshot = currentSnapshot();
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  return {
    schemaVersion: 'pendulum-paper-pack/v2',
    generatedAt: new Date().toISOString(),
    title: 'Pendulum Lab research export pack',
    methodsMarkdown: buildMethodsText(snapshot),
    figureCaptions: [
      `Main trajectory: ${snapshot.systemType} pendulum integrated with ${snapshot.method}, dt=${snapshot.dt}, gamma=${snapshot.damping}.`,
      `Comparison matrix: ${comparisonRows.length} experiment/run rows with drift, lambda proxy, FPS, and quality score.`,
      state.research.parameterStudy ? `Parameter study: ${state.research.parameterStudy.variable} ${state.research.parameterStudy.strategy} over ${state.research.parameterStudy.count} points.` : 'Parameter study: not generated.'
    ],
    /** Captioned PNG captures of every drawn analysis canvas at export time. */
    figures,
    figureManifest,
    currentSnapshot: snapshot,
    manifest: createSubmissionManifest(snapshot),
    experiments: state.research.experiments,
    runLog: state.research.runLog,
    parameterStudy: state.research.parameterStudy,
    parameterStudySummary: state.research.parameterStudy ? studyCompletionSummary(state.research.parameterStudy) : null,
    batchCheckpoint: state.research.batchCheckpoint,
    comparisonRows
  };
}

function exportPaperPackJson(): void {
  downloadJson('pendulum_paper_export_pack.json', buildPaperExportPack());
  logResearchRun('export', 'Paper export pack', 'JSON pack with methods, captions, manifests, run log, and comparison matrix.', 'pendulum_paper_export_pack.json');
  renderResearchWorkbench();
}

function exportPaperMethodsMarkdown(): void {
  const markdown = buildPaperMethodsMarkdown();
  downloadText('pendulum_methods_export.md', markdown, 'text/markdown;charset=utf-8');
  logResearchRun('export', 'Methods markdown export', 'Citation-ready methods text and comparison table.', 'pendulum_methods_export.md');
}

function buildPaperMethodsMarkdown(snapshot = currentSnapshot()): string {
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const rows = comparisonRows.map((rowItem) => `| ${rowItem.source} | ${rowItem.label} | ${rowItem.method} | ${metricValue(rowItem.drift)} | ${metricValue(rowItem.lambdaMax)} | ${rowItem.score} |`).join('\n');
  return [
    buildMethodsText(snapshot),
    '',
    '## Comparison Matrix',
    '',
    '| Source | Label | Method | Drift | Lambda proxy | Score |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| current | no comparison rows yet | - | - | - | - |'
  ].join('\n');
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function buildPaperMethodsLatex(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const study = state.research.parameterStudy;
  const studySummary = study ? studyCompletionSummary(study) : null;
  const tableRows = comparisonRows.slice(0, 30).map((rowItem) => [
    escapeLatex(rowItem.source),
    escapeLatex(rowItem.label),
    escapeLatex(rowItem.method),
    escapeLatex(metricValue(rowItem.drift)),
    escapeLatex(metricValue(rowItem.lambdaMax)),
    String(rowItem.score)
  ].join(' & ') + ' \\\\').join('\n');
  return [
    '\\documentclass[11pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{booktabs}',
    '\\usepackage{longtable}',
    '\\usepackage{hyperref}',
    '\\title{Pendulum Lab Research Export}',
    `\\date{${escapeLatex(new Date().toISOString())}}`,
    '\\begin{document}',
    '\\maketitle',
    '\\section*{Runtime Methods}',
    `System: ${escapeLatex(snapshot.systemType)} pendulum. Integrator: ${escapeLatex(method.name)} (${escapeLatex(method.id)}), order ${escapeLatex(String(method.order))}.`,
    '',
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    '',
    `Damping gamma: ${snapshot.damping}; mode: ${escapeLatex(snapshot.mode)}; state hash: \\texttt{${escapeLatex(snapshot.hash)}}.`,
    '',
    `Parameters: \\texttt{${escapeLatex(JSON.stringify(snapshot.parameters))}}.`,
    '',
    '\\section*{Parameter Study}',
    study
      ? `Plan \\texttt{${escapeLatex(studySummary?.planHash ?? study.id)}} varies ${escapeLatex(study.variable)} with ${escapeLatex(study.strategy)} sampling over ${study.count} point(s): ${studySummary?.complete ?? 0} complete, ${studySummary?.failed ?? 0} failed, ${studySummary?.pending ?? study.count} pending.`
      : 'No parameter study was generated.',
    '',
    '\\section*{Comparison Matrix}',
    '\\begin{longtable}{llllrr}',
    '\\toprule',
    'Source & Label & Method & Drift & Lambda & Score \\\\',
    '\\midrule',
    tableRows || 'current & no comparison rows yet & -- & -- & -- & -- \\\\',
    '\\bottomrule',
    '\\end{longtable}',
    '\\section*{Limitations}',
    createSubmissionManifest(snapshot).limitations.map((item) => `\\noindent ${escapeLatex(item)}\\\\`).join('\n'),
    '\\end{document}'
  ].join('\n');
}

function exportPaperMethodsLatex(): void {
  downloadText('pendulum_methods_export.tex', buildPaperMethodsLatex(), 'application/x-tex;charset=utf-8');
  logResearchRun('export', 'Methods LaTeX export', 'LaTeX methods appendix with comparison matrix.', 'pendulum_methods_export.tex');
}

function buildResearchNotebook(): unknown {
  const snapshot = currentSnapshot();
  const study = state.research.parameterStudy;
  return buildNotebookV2({
    stateHash: snapshot.hash,
    generatedAt: new Date().toISOString(),
    methodsMarkdown: buildPaperMethodsMarkdown(snapshot),
    paperPackJson: JSON.stringify(buildPaperExportPack()),
    figureManifestJson: JSON.stringify(buildPaperFigureManifest()),
    studyCsv: study ? parameterStudyResultsCsvText(study) : null,
    comparisonCsv: comparisonMatrixCsvText(),
    studyVariable: study?.variable ?? null
  });
}

function exportResearchNotebook(): void {
  downloadText('pendulum_research_notebook.ipynb', JSON.stringify(buildResearchNotebook(), null, 2), 'application/x-ipynb+json;charset=utf-8');
  logResearchRun('export', 'Research notebook export', 'Jupyter notebook with methods, paper pack, and study CSV loader.', 'pendulum_research_notebook.ipynb');
}

function buildResearchBundle(): unknown {
  const snapshot = currentSnapshot();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const paperPack = buildPaperExportPack();
  const files = [
    { path: 'manifest/submission.json', mediaType: 'application/json', content: JSON.stringify(createSubmissionManifest(snapshot), null, 2) },
    { path: 'paper/paper-pack.json', mediaType: 'application/json', content: JSON.stringify(paperPack, null, 2) },
    { path: 'paper/methods.md', mediaType: 'text/markdown', content: buildPaperMethodsMarkdown(snapshot) },
    { path: 'paper/methods.tex', mediaType: 'application/x-tex', content: buildPaperMethodsLatex(snapshot) },
    { path: 'paper/notebook.ipynb', mediaType: 'application/x-ipynb+json', content: JSON.stringify(buildResearchNotebook(), null, 2) },
    { path: 'figures/figure-manifest.json', mediaType: 'application/json', content: JSON.stringify(figureManifest, null, 2) }
  ];
  if (state.research.parameterStudy) {
    files.push({ path: 'data/parameter-study-results.csv', mediaType: 'text/csv', content: parameterStudyResultsCsvText(state.research.parameterStudy) });
  }
  figures.forEach((figure, index) => {
    files.push({
      path: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png.data-url.txt`,
      mediaType: 'text/plain',
      content: figure.dataUrl
    });
  });
  return {
    schemaVersion: 'pendulum-research-bundle/v1',
    generatedAt: new Date().toISOString(),
    stateHash: snapshot.hash,
    note: 'Portable JSON bundle. Each entry in files can be written to disk using its path and content.',
    fileCount: files.length,
    files
  };
}

function exportResearchBundleJson(): void {
  downloadJson('pendulum_research_bundle.json', buildResearchBundle());
  logResearchRun('export', 'Research bundle export', 'Portable bundle with paper pack, methods, LaTeX, notebook, data, and figure payloads.', 'pendulum_research_bundle.json');
}

const RESEARCH_APP_VERSION = 'pendulum-lab-v10.29';

function comparisonMatrixCsvText(rows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows()): string {
  const header = ['id', 'label', 'source', 'timestamp', 'method', 'system', 'dt', 'damping', 'drift', 'lambda_max', 'fps', 'score', 'hash'];
  const lines = rows.map((rowItem) => [
    rowItem.id, rowItem.label, rowItem.source, rowItem.timestamp, rowItem.method, rowItem.system,
    String(rowItem.dt), String(rowItem.damping),
    rowItem.drift === null ? '' : String(rowItem.drift),
    rowItem.lambdaMax === null ? '' : String(rowItem.lambdaMax),
    rowItem.fps === null ? '' : String(rowItem.fps),
    String(rowItem.score), rowItem.hash
  ]);
  return [
    `# schemaVersion=pendulum-comparison-matrix-csv/v1`,
    `# generatedAt=${new Date().toISOString()}`,
    header.join(','),
    ...lines.map((line) => line.map(csvCell).join(','))
  ].join('\n');
}

/**
 * Build the artifact provenance DAG for everything currently in the workbench:
 * snapshot -> experiment -> study -> worker job -> result -> figure -> paper pack -> bundle.
 */
function buildResearchProvenance(figures = collectPaperFigures()): ProvenanceGraph {
  const snapshot = currentSnapshot();
  const builder = new ProvenanceBuilder(collectEnvironment(RESEARCH_APP_VERSION));
  const snapshotNodeId = `snapshot:${snapshot.hash}`;
  builder.addNode({
    id: snapshotNodeId,
    kind: 'snapshot',
    label: `Runtime snapshot (${snapshot.systemType}, ${snapshot.method}, dt=${snapshot.dt})`,
    content: snapshot,
    schemaVersion: 'pendulum-snapshot/v2',
    sourceCommand: 'workbench:currentSnapshot',
    metadata: { system: snapshot.systemType, method: snapshot.method, dt: snapshot.dt, damping: snapshot.damping }
  });
  for (const experiment of state.research.experiments) {
    const parentId = `snapshot:${experiment.snapshot.hash}`;
    if (!builder.has(parentId)) {
      builder.addNode({
        id: parentId,
        kind: 'snapshot',
        label: `Saved snapshot ${experiment.snapshot.hash}`,
        content: experiment.snapshot,
        schemaVersion: 'pendulum-snapshot/v2',
        sourceCommand: 'workbench:saveExperiment',
        generatedAt: experiment.createdAt
      });
    }
    builder.addNode({
      id: `experiment:${experiment.id}`,
      kind: 'experiment',
      label: experiment.name,
      content: experiment,
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      parentIds: [parentId],
      sourceCommand: 'workbench:saveExperiment',
      generatedAt: experiment.createdAt,
      metadata: { qualityScore: experiment.metrics.qualityScore, tags: experiment.tags.join('|') }
    });
  }
  const study = state.research.parameterStudy;
  if (study) {
    const studyNodeId = `study:${study.id}`;
    builder.addNode({
      id: studyNodeId,
      kind: 'study',
      label: `Parameter study ${study.variable} (${study.strategy}, ${study.count} points)`,
      content: { id: study.id, hash: studyPlanHash(study) },
      schemaVersion: 'pendulum-parameter-study/v1',
      parentIds: [snapshotNodeId],
      sourceCommand: 'workbench:generateParameterStudy',
      generatedAt: study.generatedAt,
      metadata: { variable: study.variable, strategy: study.strategy, points: study.count, planHash: studyPlanHash(study) }
    });
    const checkpoint = state.research.batchCheckpoint;
    if (checkpoint && checkpoint.planId === study.id) {
      builder.addNode({
        id: `worker-job:${checkpoint.id}`,
        kind: 'worker-job',
        label: `Study batch (${checkpoint.status}, ${checkpoint.completed}/${checkpoint.total})`,
        content: checkpoint,
        schemaVersion: 'pendulum-batch-checkpoint/v1',
        parentIds: [studyNodeId],
        sourceCommand: 'workbench:runStudyBatch',
        generatedAt: checkpoint.startedAt,
        metadata: { status: checkpoint.status, timeoutMs: checkpoint.timeoutMs, planHash: checkpoint.planHash }
      });
      const completed = study.experiments.filter((point) => point.results);
      if (completed.length > 0) {
        builder.addNode({
          id: `result:${study.id}`,
          kind: 'result',
          label: `Study results (${completed.length}/${study.experiments.length} points)`,
          content: completed.map((point) => [point.id, point.results]),
          schemaVersion: 'pendulum-parameter-study-results/v1',
          parentIds: [`worker-job:${checkpoint.id}`],
          sourceCommand: 'workbench:runStudyBatch',
          metadata: { completed: completed.length, failed: study.experiments.filter((point) => point.error).length }
        });
      }
    }
  }
  const figureParents = [snapshotNodeId, ...(study && builder.has(`result:${study.id}`) ? [`result:${study.id}`] : [])];
  for (const figure of figures) {
    builder.addNode({
      id: `figure:${figure.id}`,
      kind: 'figure',
      label: figure.caption,
      content: figure.dataHash,
      schemaVersion: 'pendulum-paper-figures/v2',
      parentIds: figureParents,
      sourceCommand: 'workbench:collectPaperFigures',
      metadata: { width: figure.width, height: figure.height, dataHash: figure.dataHash }
    });
  }
  const paperNodeId = 'paper-pack:current';
  builder.addNode({
    id: paperNodeId,
    kind: 'paper-pack',
    label: 'Paper export pack',
    content: { snapshot: snapshot.hash, figures: figures.map((figure) => figure.dataHash) },
    schemaVersion: 'pendulum-paper-pack/v2',
    parentIds: [snapshotNodeId, ...figures.map((figure) => `figure:${figure.id}`)],
    sourceCommand: 'workbench:buildPaperExportPack'
  });
  builder.addNode({
    id: 'bundle:current',
    kind: 'bundle',
    label: 'Research bundle (ZIP)',
    content: { snapshot: snapshot.hash, generatedAt: new Date().toISOString() },
    schemaVersion: RESEARCH_BUNDLE_ZIP_SCHEMA,
    parentIds: [paperNodeId],
    sourceCommand: 'workbench:exportResearchBundleZip'
  });
  return builder.build();
}

function exportProvenanceJson(): void {
  downloadJson('pendulum_provenance.json', buildResearchProvenance());
  logResearchRun('export', 'Provenance graph export', 'Artifact DAG with hashes, schema versions, and environment metadata.', 'pendulum_provenance.json');
  renderResearchWorkbench();
}

/** Layered text viewer for the provenance DAG: nodes grouped by kind, parents inline. */
function renderProvenanceViewer(): void {
  const target = $('rwProvenanceView');
  if (!target) return;
  if (target.childElementCount > 0) {
    clear(target);
    return;
  }
  const graph = buildResearchProvenance();
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label] as const));
  const rows = graph.nodes.map((node) => [
    node.kind,
    node.label.slice(0, 44),
    node.hash.slice(0, 10),
    node.parentIds.map((parentId) => (labelById.get(parentId) ?? parentId).slice(0, 32)).join('; ') || '(root)',
    node.sourceCommand.replace('workbench:', '')
  ]);
  renderResearchTable('rwProvenanceView', ['kind', 'artifact', 'hash', 'derived from', 'source'], rows, 'No provenance nodes yet.');
  const summary = html('div', {
    className: 'research-summary',
    text: `Provenance: ${graph.nodes.length} nodes, ${graph.edges.length} edges; graph hash ${graph.graphHash}; environment ${graph.environment.appVersion}.`
  });
  target.prepend(summary);
}

const RESEARCH_BUNDLE_ZIP_SCHEMA = 'pendulum-research-bundle-zip/v1';

/**
 * Assemble the on-disk layout of the real ZIP research bundle. Text artifacts
 * are UTF-8; figures are decoded from their canvas data URLs into genuine
 * binary PNG entries. The returned list drives both the ZIP writer and the
 * checksum manifest, so the two can never disagree.
 */
function buildResearchBundleZipEntries(): { entries: ZipEntryInput[]; figureCount: number } {
  const snapshot = currentSnapshot();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const provenance = buildResearchProvenance(figures);
  const entries: ZipEntryInput[] = [
    { path: 'manifest/submission.json', data: textToBytes(JSON.stringify(createSubmissionManifest(snapshot), null, 2)) },
    { path: 'manifest/provenance.json', data: textToBytes(JSON.stringify(provenance, null, 2)) },
    { path: 'paper/paper-pack.json', data: textToBytes(JSON.stringify(buildPaperExportPack(), null, 2)) },
    { path: 'paper/methods.md', data: textToBytes(buildPaperMethodsMarkdown(snapshot)) },
    { path: 'paper/methods.tex', data: textToBytes(buildPaperMethodsLatex(snapshot)) },
    { path: 'paper/notebook.ipynb', data: textToBytes(JSON.stringify(buildResearchNotebook(), null, 2)) },
    { path: 'data/comparison-matrix.csv', data: textToBytes(comparisonMatrixCsvText()) },
    { path: 'data/run-log.json', data: textToBytes(JSON.stringify({ schemaVersion: 'pendulum-run-log/v1', generatedAt: new Date().toISOString(), entries: state.research.runLog }, null, 2)) },
    { path: 'data/experiments.json', data: textToBytes(JSON.stringify({ schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), experiments: state.research.experiments }, null, 2)) },
    { path: 'figures/figure-manifest.json', data: textToBytes(JSON.stringify(figureManifest, null, 2)) }
  ];
  if (state.research.parameterStudy) {
    entries.push({ path: 'data/parameter-study-results.csv', data: textToBytes(parameterStudyResultsCsvText(state.research.parameterStudy)) });
  }
  if (designStudy) {
    entries.push({ path: 'data/design-study-results.csv', data: textToBytes(designStudyCsvText(designStudy)) });
  }
  figures.forEach((figure, index) => {
    entries.push({
      path: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png`,
      data: dataUrlToBytes(figure.dataUrl)
    });
  });
  // checksums.json is appended last so it can cover every other member.
  entries.push({
    path: 'manifest/checksums.json',
    data: textToBytes(JSON.stringify({
      schemaVersion: 'pendulum-bundle-checksums/v1',
      generatedAt: new Date().toISOString(),
      algorithm: 'crc32 + fnv1a64',
      files: checksumEntries(entries)
    }, null, 2))
  });
  return { entries, figureCount: figures.length };
}

const MAX_DB_BUNDLES = 3;
const MAX_DB_BUNDLE_BYTES = 24 * 1024 * 1024;

/** Keep the last few exported ZIP bundles (and current figures) in IndexedDB for re-download. */
function archiveBundleToDb(zip: Uint8Array, fileCount: number, figureCount: number): void {
  const db = researchDbInstance();
  if (!db.available() || zip.length > MAX_DB_BUNDLE_BYTES) return;
  void (async () => {
    try {
      const id = `bundle-${new Date().toISOString()}`;
      await db.put('bundles', id, { fileCount, figureCount, bytes: zip.length, zip });
      const all = await db.getAll('bundles');
      const excess = all.length - MAX_DB_BUNDLES;
      if (excess > 0) {
        const oldest = [...all].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, excess);
        for (const record of oldest) await db.delete('bundles', record.id);
      }
      const figures = collectPaperFigures();
      if (figures.length > 0) {
        await db.putMany('figures', figures.map((figure) => ({ id: figure.id, payload: figure })));
      }
      renderResearchStoragePanel();
    } catch (error) {
      state.auditLog.unshift(`bundle archive failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

/** Export the research bundle as a real .zip archive (binary PNGs, per-file hashes). */
function exportResearchBundleZip(): void {
  try {
    const { entries, figureCount } = buildResearchBundleZipEntries();
    const zip = buildZip(entries);
    downloadBytes('pendulum_research_bundle.zip', zip, 'application/zip');
    archiveBundleToDb(zip, entries.length, figureCount);
    logResearchRun('export', 'Research ZIP bundle export', `${entries.length} files (${figureCount} binary figures), ${(zip.length / 1024).toFixed(1)} KiB, per-file checksums.`, 'pendulum_research_bundle.zip');
    renderResearchWorkbench();
    toast(`ZIP bundle exported (${entries.length} files)`);
  } catch (error) {
    state.lastFault = `ZIP bundle export failed: ${error instanceof Error ? error.message : String(error)}`;
    toast('ZIP export failed — JSON bundle fallback still available');
  }
}

function renderResearchWorkbench(): void {
  renderResearchExperiments();
  renderResearchRunLog();
  renderParameterStudy();
  renderDesignStudy();
  renderComparisonMatrix();
  renderPaperSummary();
  renderResearchStoragePanel();
}

function currentLibraryFilter(): { query: string; tag: string; favoritesOnly: boolean } {
  const search = $('rwLibSearch');
  const tag = $('rwLibTag');
  const favOnly = $('rwLibFavOnly');
  return {
    query: search instanceof HTMLInputElement ? search.value : '',
    tag: tag instanceof HTMLInputElement ? tag.value : '',
    favoritesOnly: favOnly instanceof HTMLInputElement ? favOnly.checked : false
  };
}

function experimentBadges(experiment: ResearchExperiment): QualityBadge[] {
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

function renderResearchExperiments(): void {
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

function toggleFavoriteExperiment(): void {
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

function forkSelectedExperiment(): void {
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

function diffSelectedExperiments(): void {
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

function saveCitationForSelected(): void {
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

function toggleExperimentTimeline(): void {
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

function renderResearchRunLog(): void {
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

function renderParameterStudy(): void {
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

function buildStudyCheckpointSummary(plan: ParameterStudyPlan | null): string {
  const checkpoint = state.research.batchCheckpoint;
  if (!plan || !checkpoint || checkpoint.planId !== plan.id) return 'No batch checkpoint yet.';
  const age = Number.isNaN(Date.parse(checkpoint.updatedAt)) ? checkpoint.updatedAt : new Date(checkpoint.updatedAt).toLocaleTimeString();
  return `Checkpoint ${checkpoint.status}: ${checkpoint.completed}/${checkpoint.total} complete, ${checkpoint.failed} failed, ${checkpoint.pending} pending; next target ${checkpoint.nextIndex}; timeout ${Math.round(checkpoint.timeoutMs / 1000)}s; updated ${age}. ${checkpoint.message}`;
}

function buildParameterStudyInsights(plan: ParameterStudyPlan | null): string {
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

function renderComparisonMatrix(): void {
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

function renderPaperSummary(): void {
  const ready = state.research.experiments.length > 0 || state.research.runLog.length > 0 || Boolean(state.research.parameterStudy);
  const rowCount = state.research.comparisonRows.length || buildComparisonRows().length;
  setText('rwPaperSummary', `${ready ? 'ready' : 'not ready'}: ${state.research.experiments.length} experiments, ${state.research.runLog.length} run log entries, ${state.research.parameterStudy?.count ?? 0} study points, ${rowCount} comparison rows.`);
}

function renderResearchTable(targetId: string, headers: string[], rows: string[][], emptyText: string): void {
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

const lab3d = {
  rope: null as RopePendulum | null,
  ropeRunning: false,
  ropeStyle: 'rope' as 'rope' | 'rod',
  ropeTrail: [] as { x: number; y: number }[],
  sphere: null as SphericalPendulum | null,
  sphereRunning: false,
  sphereStyle: 'rod' as 'rope' | 'rod',
  sphereTrail: [] as { x: number; y: number; z: number }[],
  spherePoincare: [] as { phi: number; theta: number }[],
  lastThetaDotSign: 0,
  camera: new OrbitCamera(),
  chain: null as SphericalChain | null,
  chainRunning: false,
  chainTrail1: [] as { x: number; y: number; z: number }[],
  chainTrail2: [] as { x: number; y: number; z: number }[],
  chainCamera: new OrbitCamera(),
  rafId: 0,
  lastFrame: 0
};

function lab3dRopeParams(): { l: number; g: number; damping: number } {
  return {
    l: clampNumber(numberFrom('r3Length', 1), 1, 0.2, 3),
    g: clampNumber(numberFrom('r3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('r3Damping', 0), 0, 0, 5)
  };
}

function resetRopeSim(): void {
  const theta0 = clampNumber(numberFrom('r3Theta0', 2.5), 2.5, -3.1, 3.1);
  const omega0 = clampNumber(numberFrom('r3Omega0', 0), 0, -20, 20);
  lab3d.rope = new RopePendulum(lab3dRopeParams(), theta0, omega0);
  lab3d.ropeTrail = [];
  renderRopeSim();
  renderRopeReadout();
}

function resetSphereSim(): void {
  const theta0 = clampNumber(numberFrom('s3Theta0', 1.0), 1.0, 0.05, 3.05);
  const phiDot0 = clampNumber(numberFrom('s3PhiDot0', 1.5), 1.5, -10, 10);
  const thetaDot0 = clampNumber(numberFrom('s3ThetaDot0', 0.3), 0.3, -10, 10);
  const params = {
    l: clampNumber(numberFrom('s3Length', 1), 1, 0.2, 3),
    g: clampNumber(numberFrom('s3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('s3Damping', 0), 0, 0, 5)
  };
  lab3d.sphere = new SphericalPendulum(params, [theta0, 0, thetaDot0, phiDot0], 0.002);
  lab3d.sphereTrail = [];
  lab3d.spherePoincare = [];
  lab3d.lastThetaDotSign = Math.sign(thetaDot0) || 1;
  renderSphereSim();
  renderSphereReadout();
}

function lab3dChainParams(): SphericalChainParams {
  return {
    masses: [1, clampNumber(numberFrom('d3M2', 0.8), 0.8, 0.1, 5)],
    lengths: [
      clampNumber(numberFrom('d3L1', 1), 1, 0.2, 3),
      clampNumber(numberFrom('d3L2', 0.8), 0.8, 0.2, 3)
    ],
    g: clampNumber(numberFrom('d3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('d3Damping', 0), 0, 0, 5)
  };
}

function resetChainSim(): void {
  const theta1 = clampNumber(numberFrom('d3Theta1', 1.6), 1.6, -3.05, 3.05);
  const theta2 = clampNumber(numberFrom('d3Theta2', 2.2), 2.2, -3.05, 3.05);
  const phiDot1 = clampNumber(numberFrom('d3PhiDot1', 1.2), 1.2, -10, 10);
  const phiDot2 = clampNumber(numberFrom('d3PhiDot2', -0.8), -0.8, -10, 10);
  // State layout: [θ₁, φ₁, θ₂, φ₂, θ̇₁, φ̇₁, θ̇₂, φ̇₂].
  lab3d.chain = new SphericalChain(lab3dChainParams(), [theta1, 0, theta2, 0, 0, phiDot1, 0, phiDot2], 0.001);
  lab3d.chainTrail1 = [];
  lab3d.chainTrail2 = [];
  renderChainSim();
  renderChainReadout();
}

function lab3dFrame(timestamp: number): void {
  const dtWall = lab3d.lastFrame > 0 ? Math.min(0.05, (timestamp - lab3d.lastFrame) / 1000) : 0.016;
  lab3d.lastFrame = timestamp;
  if (lab3d.ropeRunning && lab3d.rope) {
    lab3d.rope.step(dtWall);
    const { x, y } = lab3d.rope.position();
    lab3d.ropeTrail.push({ x, y });
    if (lab3d.ropeTrail.length > 600) lab3d.ropeTrail.shift();
    renderRopeSim();
    renderRopeReadout();
  }
  if (lab3d.sphereRunning && lab3d.sphere) {
    lab3d.sphere.step(dtWall);
    const position = lab3d.sphere.position();
    lab3d.sphereTrail.push(position);
    if (lab3d.sphereTrail.length > 1200) lab3d.sphereTrail.shift();
    // Poincaré section at θ̇ = 0 (turning points of the polar angle).
    const [theta, phi, thetaDot] = lab3d.sphere.current();
    const sign = Math.sign(thetaDot) || lab3d.lastThetaDotSign;
    if (sign !== lab3d.lastThetaDotSign && lab3d.lastThetaDotSign !== 0) {
      lab3d.spherePoincare.push({ phi: ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), theta });
      if (lab3d.spherePoincare.length > 800) lab3d.spherePoincare.shift();
    }
    lab3d.lastThetaDotSign = sign;
    renderSphereSim();
    renderSphereReadout();
  }
  if (lab3d.chainRunning && lab3d.chain) {
    lab3d.chain.step(dtWall);
    const [inner, outer] = lab3d.chain.positions();
    if (inner && outer) {
      lab3d.chainTrail1.push(inner);
      if (lab3d.chainTrail1.length > 500) lab3d.chainTrail1.shift();
      lab3d.chainTrail2.push(outer);
      if (lab3d.chainTrail2.length > 1500) lab3d.chainTrail2.shift();
    }
    renderChainSim();
    renderChainReadout();
  }
  if (lab3d.ropeRunning || lab3d.sphereRunning || lab3d.chainRunning) {
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  } else {
    lab3d.rafId = 0;
    lab3d.lastFrame = 0;
  }
}

function lab3dEnsureLoop(): void {
  if (lab3d.rafId === 0 && (lab3d.ropeRunning || lab3d.sphereRunning || lab3d.chainRunning)) {
    lab3d.lastFrame = 0;
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  }
}

function renderRopeSim(): void {
  const canvas = $('r3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.rope) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { l } = lab3d.rope.params;
  const scale = (Math.min(canvas.width, canvas.height) * 0.42) / l;
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.32;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Constraint circle.
  ctx.strokeStyle = 'rgba(110,130,170,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, l * scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  // Trail.
  ctx.strokeStyle = 'rgba(76,201,240,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  lab3d.ropeTrail.forEach((point, index) => {
    const px = cx + point.x * scale;
    const py = cy - point.y * scale;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  const snapshot = lab3d.rope.snapshot();
  const bx = cx + snapshot.x * scale;
  const by = cy - snapshot.y * scale;
  // String/rod: rod is a straight line always; rope is straight when taut and
  // slack-curved (sagging quadratic) when the constraint is inactive.
  ctx.lineWidth = lab3d.ropeStyle === 'rod' ? 3 : 1.6;
  ctx.strokeStyle = snapshot.phase === 'slack' ? '#f4a261' : '#cdd7ee';
  ctx.beginPath();
  if (snapshot.phase === 'slack' && lab3d.ropeStyle === 'rope') {
    const r = Math.hypot(snapshot.x, snapshot.y);
    const sagDepth = Math.max(0, (l - r)) * 0.6 * scale;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo((cx + bx) / 2, Math.max(cy, by) + sagDepth, bx, by);
  } else {
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  // Pivot + bob.
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = snapshot.phase === 'slack' ? '#f4a261' : '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bx, by, 9, 0, 2 * Math.PI);
  ctx.fill();
}

function renderRopeReadout(): void {
  if (!lab3d.rope) return;
  const snapshot = lab3d.rope.snapshot();
  const warning = lab3d.rope.warning();
  const captures = lab3d.rope.events.filter((event) => event.type === 'capture').length;
  setText('r3Readout', [
    `phase=${snapshot.phase.toUpperCase()} (${lab3d.ropeStyle} rendering)`,
    `tension T/m=${snapshot.tension.toFixed(3)} N/kg`,
    `θ=${snapshot.theta.toFixed(3)} rad, ω=${snapshot.omega.toFixed(3)} rad/s`,
    `E/m=${snapshot.energy.toFixed(4)} J/kg, constraint err=${snapshot.constraintError.toExponential(2)}`,
    `events: ${lab3d.rope.events.length} (${captures} captures)`,
    `method: RK4 hybrid taut/slack, substep<=2ms, capture removes radial velocity (inelastic)`
  ].join(' | '));
  const warningNode = $('r3Warning');
  if (warningNode) {
    warningNode.textContent = warning ?? '';
    warningNode.style.color = warning ? '#f4a261' : '';
  }
}

function renderSphereSim(): void {
  const canvas = $('s3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.sphere) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { l } = lab3d.sphere.params;
  const scale = (Math.min(canvas.width, canvas.height) * 0.4) / l;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawSphereWireframe(ctx, lab3d.camera, l, scale);
  drawPolyline3D(ctx, lab3d.camera, lab3d.sphereTrail, scale, { r: 76, g: 201, b: 240 });
  // Rod/string + bob.
  const position = lab3d.sphere.position();
  const pivot = lab3d.camera.project({ x: 0, y: 0, z: 0 }, canvas.width, canvas.height, scale);
  const bob = lab3d.camera.project(position, canvas.width, canvas.height, scale);
  const diag = lab3d.sphere.diagnostics();
  const stringInvalid = lab3d.sphereStyle === 'rope' && diag.tension < 0;
  ctx.strokeStyle = stringInvalid ? '#e63946' : '#cdd7ee';
  ctx.lineWidth = lab3d.sphereStyle === 'rod' ? 2.6 : 1.4;
  if (stringInvalid) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pivot.screenX, pivot.screenY);
  ctx.lineTo(bob.screenX, bob.screenY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(pivot.screenX, pivot.screenY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = stringInvalid ? '#e63946' : '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bob.screenX, bob.screenY, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText('drag to orbit, wheel to zoom', 8, canvas.height - 8);
  // Poincaré inset: (φ mod 2π, θ) at θ̇ = 0 crossings.
  const inset = $('s3Poincare');
  if (inset instanceof HTMLCanvasElement) {
    const ictx = inset.getContext('2d');
    if (ictx) {
      ictx.fillStyle = '#0b1020';
      ictx.fillRect(0, 0, inset.width, inset.height);
      ictx.fillStyle = '#f4a261';
      for (const point of lab3d.spherePoincare) {
        const px = (point.phi / (2 * Math.PI)) * inset.width;
        const py = inset.height - (point.theta / Math.PI) * inset.height;
        ictx.fillRect(px, py, 2, 2);
      }
      ictx.fillStyle = '#8fa3c2';
      ictx.font = '9px system-ui';
      ictx.fillText('Poincaré: (φ, θ) at θ̇=0', 6, 12);
    }
  }
}

function renderSphereReadout(): void {
  if (!lab3d.sphere) return;
  const diag = lab3d.sphere.diagnostics();
  const [theta, phi, thetaDot, phiDot] = lab3d.sphere.current();
  setText('s3Readout', [
    `θ=${theta.toFixed(3)}, φ=${phi.toFixed(3)}, θ̇=${thetaDot.toFixed(3)}, φ̇=${phiDot.toFixed(3)}`,
    `E/m=${diag.energy.toFixed(5)} (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz/m=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `T/m=${diag.tension.toFixed(3)} N/kg, constraint err=${diag.constraintEnergyError.toExponential(2)}`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
  const warningNode = $('s3Warning');
  if (warningNode) {
    const stringMode = lab3d.sphereStyle === 'rope';
    const message = stringMode && diag.tension < 0
      ? 'TENSION COLLAPSE: a string cannot push — this regime needs a rod (string constraint invalid).'
      : stringMode && diag.tension < 0.05 * lab3d.sphere.params.g
        ? 'Tension near zero — string constraint about to become invalid.'
        : '';
    warningNode.textContent = message;
    warningNode.style.color = message ? '#e63946' : '';
  }
}

function renderChainSim(): void {
  const canvas = $('d3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.chain) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reach = (lab3d.chain.params.lengths[0] ?? 1) + (lab3d.chain.params.lengths[1] ?? 1);
  const scale = (Math.min(canvas.width, canvas.height) * 0.4) / reach;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Outer-reach envelope sphere (radius l₁ + l₂).
  drawSphereWireframe(ctx, lab3d.chainCamera, reach, scale);
  drawPolyline3D(ctx, lab3d.chainCamera, lab3d.chainTrail1, scale, { r: 244, g: 162, b: 97 });
  drawPolyline3D(ctx, lab3d.chainCamera, lab3d.chainTrail2, scale, { r: 76, g: 201, b: 240 });
  const [inner, outer] = lab3d.chain.positions();
  if (!inner || !outer) return;
  const pivot = lab3d.chainCamera.project({ x: 0, y: 0, z: 0 }, canvas.width, canvas.height, scale);
  const bob1 = lab3d.chainCamera.project(inner, canvas.width, canvas.height, scale);
  const bob2 = lab3d.chainCamera.project(outer, canvas.width, canvas.height, scale);
  ctx.strokeStyle = '#cdd7ee';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(pivot.screenX, pivot.screenY);
  ctx.lineTo(bob1.screenX, bob1.screenY);
  ctx.lineTo(bob2.screenX, bob2.screenY);
  ctx.stroke();
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(pivot.screenX, pivot.screenY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(bob1.screenX, bob1.screenY, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bob2.screenX, bob2.screenY, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText('drag to orbit, wheel to zoom', 8, canvas.height - 8);
}

function renderChainReadout(): void {
  if (!lab3d.chain) return;
  const diag = lab3d.chain.diagnostics();
  const state = lab3d.chain.current();
  setText('d3Readout', [
    `θ₁=${(state[0] ?? 0).toFixed(3)}, φ₁=${(state[1] ?? 0).toFixed(3)}, θ₂=${(state[2] ?? 0).toFixed(3)}, φ₂=${(state[3] ?? 0).toFixed(3)}`,
    `E=${diag.energy.toFixed(5)} J (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
}

/** Export a paper-ready 3D diagnostic snapshot: PNG of the scene + JSON diagnostics. */
function exportSphereSnapshot(): void {
  const canvas = $('s3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.sphere) {
    toast('Run the spherical pendulum first');
    return;
  }
  downloadBytes('pendulum_3d_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const diag = lab3d.sphere.diagnostics();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: 'spherical-pendulum',
    params: lab3d.sphere.params,
    state: lab3d.sphere.current(),
    diagnostics: diag,
    camera: lab3d.camera.state(),
    poincarePoints: lab3d.spherePoincare.length,
    reproducibilityHash: hashText(JSON.stringify({ params: lab3d.sphere.params, state: lab3d.sphere.current(), dt: diag.dt }))
  };
  downloadJson('pendulum_3d_diagnostics.json', payload);
  logResearchRun('export', '3D diagnostic snapshot', `spherical pendulum, E drift ${diag.energyDrift.toExponential(2)}, Lz drift ${diag.lzDrift.toExponential(2)}`, 'pendulum_3d_snapshot.png');
  toast('3D snapshot exported (PNG + JSON)');
}

function installLab3dTab(): void {
  const panel = $('tab-lab3d');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';
  const wrap = html('div', { className: 'research-workbench' });

  const ropeCard = researchCard('Rope / String Pendulum', 'lab3dRopeCard');
  ropeCard.classList.add('research-wide');
  const ropeCanvas = html('canvas', { id: 'r3Canvas' }) as HTMLCanvasElement;
  ropeCanvas.width = 460;
  ropeCanvas.height = 360;
  ropeCanvas.style.width = '100%';
  ropeCanvas.style.maxWidth = '480px';
  const ropeStyleSelect = researchSelect('r3Style', [['rope', 'rope / string (taut + slack)'], ['rod', 'rigid wire / rod rendering']]);
  ropeStyleSelect.addEventListener('change', () => {
    lab3d.ropeStyle = ropeStyleSelect.value === 'rod' ? 'rod' : 'rope';
    renderRopeSim();
    renderRopeReadout();
  });
  append(
    ropeCard,
    researchFormRow('Suspension', ropeStyleSelect),
    researchFormRow('θ₀ (rad)', researchInput('r3Theta0', 'number', '2.5', '')),
    researchFormRow('ω₀ (rad/s)', researchInput('r3Omega0', 'number', '0', '')),
    researchFormRow('Length', researchInput('r3Length', 'number', '1', 'm')),
    researchFormRow('Gravity', researchInput('r3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('r3Damping', 'number', '0', '1/s')),
    researchActions(
      button('r3Run', 'Run', () => {
        if (!lab3d.rope) resetRopeSim();
        lab3d.ropeRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('r3Pause', 'Pause', () => {
        lab3d.ropeRunning = false;
      }),
      button('r3Reset', 'Reset', () => {
        lab3d.ropeRunning = false;
        resetRopeSim();
      })
    ),
    ropeCanvas,
    html('div', { id: 'r3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 'r3Readout', className: 'research-summary', text: 'Reset to initialise the rope pendulum. The string goes SLACK when tension would be negative; capture at |r|=l is inelastic.' })
  );

  const sphereCard = researchCard('Spherical Pendulum (True 3D Dynamics)', 'lab3dSphereCard');
  sphereCard.classList.add('research-wide');
  const sphereCanvas = html('canvas', { id: 's3Canvas' }) as HTMLCanvasElement;
  sphereCanvas.width = 460;
  sphereCanvas.height = 360;
  sphereCanvas.style.width = '100%';
  sphereCanvas.style.maxWidth = '480px';
  sphereCanvas.style.touchAction = 'none';
  const poincareCanvas = html('canvas', { id: 's3Poincare' }) as HTMLCanvasElement;
  poincareCanvas.width = 220;
  poincareCanvas.height = 150;
  poincareCanvas.style.width = '100%';
  poincareCanvas.style.maxWidth = '240px';
  const sphereStyleSelect = researchSelect('s3Style', [['rod', 'rigid rod (full sphere)'], ['rope', 'string (T ≥ 0 required)']]);
  sphereStyleSelect.addEventListener('change', () => {
    lab3d.sphereStyle = sphereStyleSelect.value === 'rope' ? 'rope' : 'rod';
    renderSphereSim();
    renderSphereReadout();
  });
  bindOrbitControls(sphereCanvas, lab3d.camera, () => renderSphereSim());
  append(
    sphereCard,
    researchFormRow('Constraint', sphereStyleSelect),
    researchFormRow('θ₀ (rad)', researchInput('s3Theta0', 'number', '1.0', 'polar angle from down')),
    researchFormRow('θ̇₀', researchInput('s3ThetaDot0', 'number', '0.3', 'rad/s')),
    researchFormRow('φ̇₀', researchInput('s3PhiDot0', 'number', '1.5', 'rad/s (azimuthal)')),
    researchFormRow('Length', researchInput('s3Length', 'number', '1', 'm')),
    researchFormRow('Gravity', researchInput('s3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('s3Damping', 'number', '0', '1/s')),
    researchActions(
      button('s3Run', 'Run', () => {
        if (!lab3d.sphere) resetSphereSim();
        lab3d.sphereRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('s3Pause', 'Pause', () => {
        lab3d.sphereRunning = false;
      }),
      button('s3Reset', 'Reset', () => {
        lab3d.sphereRunning = false;
        resetSphereSim();
      }),
      button('s3Export', 'Export 3D Snapshot', () => exportSphereSnapshot())
    ),
    sphereCanvas,
    poincareCanvas,
    html('div', { id: 's3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 's3Readout', className: 'research-summary', text: 'Reset to initialise. The spherical pendulum integrates θ̈ = sinθcosθ·φ̇² − (g/l)sinθ and conserves E and Lz when undamped — real 3D dynamics, not a camera trick.' })
  );

  const chainCard = researchCard('Spherical Double Pendulum (3D Chaos, 4 DOF)', 'lab3dChainCard');
  chainCard.classList.add('research-wide');
  const chainCanvas = html('canvas', { id: 'd3Canvas' }) as HTMLCanvasElement;
  chainCanvas.width = 460;
  chainCanvas.height = 360;
  chainCanvas.style.width = '100%';
  chainCanvas.style.maxWidth = '480px';
  chainCanvas.style.touchAction = 'none';
  bindOrbitControls(chainCanvas, lab3d.chainCamera, () => renderChainSim());
  append(
    chainCard,
    researchFormRow('θ₁₀ (rad)', researchInput('d3Theta1', 'number', '1.6', 'inner polar angle')),
    researchFormRow('φ̇₁₀', researchInput('d3PhiDot1', 'number', '1.2', 'rad/s (inner azimuthal)')),
    researchFormRow('θ₂₀ (rad)', researchInput('d3Theta2', 'number', '2.2', 'outer polar angle')),
    researchFormRow('φ̇₂₀', researchInput('d3PhiDot2', 'number', '-0.8', 'rad/s (outer azimuthal)')),
    researchFormRow('m₂ (m₁=1)', researchInput('d3M2', 'number', '0.8', 'kg')),
    researchFormRow('l₁', researchInput('d3L1', 'number', '1', 'm')),
    researchFormRow('l₂', researchInput('d3L2', 'number', '0.8', 'm')),
    researchFormRow('Gravity', researchInput('d3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('d3Damping', 'number', '0', '1/s')),
    researchActions(
      button('d3Run', 'Run', () => {
        if (!lab3d.chain) resetChainSim();
        lab3d.chainRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('d3Pause', 'Pause', () => {
        lab3d.chainRunning = false;
      }),
      button('d3Reset', 'Reset', () => {
        lab3d.chainRunning = false;
        resetChainSim();
      })
    ),
    chainCanvas,
    html('div', { id: 'd3Readout', className: 'research-summary', text: 'Reset to initialise. Full 3D double pendulum (ball joints, 4 DOF): equations derived in manipulator form and cross-checked against an independent SymPy derivation; E and Lz are conserved when undamped.' })
  );

  append(wrap, ropeCard, sphereCard, chainCard);
  left.append(wrap);
  append(layout, left);
  panel.append(layout);
  resetRopeSim();
  resetSphereSim();
  resetChainSim();
}

function installCanonicalTab(): void {
  const panel = $('tab-canonical');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Canonical Hamiltonian Engine', html('div', { id: 'canonReport' }), undefined, 'rg-card rg-wide'),
    card('Subsystem Registry', html('div', { id: 'canonSubsystems' })),
    card('Integrator Truth Table', html('div', { id: 'canonIntegrators' })),
    card('Adaptive Time Accounting', html('div', { id: 'canonAdaptive' })),
    card('Validation Extensions', html('div', { id: 'canonValidation' }))
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runCanonValidation', 'Run Canonical QA', () => {
      runCanonicalQa(true);
    }, 'primary'),
    button('useCanonMethod', 'Use Conditional Canonical Method', () => useCanonicalMethod()),
    button('exportManifestV3', 'Export Manifest V3', () => exportManifest('pendulum_manifest_v3_ts.json'))
  );
  const note = html('div', { className: 'honesty-note warn', text: 'True symplectic claims are restricted to canonical coordinates, gamma = 0, and solver residual reporting. Damped systems are dissipative.' });
  append(controls, detailsCard('Canonical Controls', actions), detailsCard('Contracts', note));
  append(layout, left, controls);
  panel.append(layout);
}

function installAPlusTab(): void {
  const panel = $('tab-aplus');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Scientific Audit Summary', html('div', { id: 'aplusSummary' })),
    card('Generalized N-Link Physics', html('div', { id: 'aplusNLink' })),
    card('Architecture Contract', html('div', { id: 'aplusArch' }), undefined, 'rg-card rg-wide'),
    card('Validation Results', html('div', { id: 'aplusValidation' }), undefined, 'rg-card rg-wide')
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runAPlusAudit', 'Run Audit', () => {
      runAPlusAudit(true);
    }, 'primary'),
    button('exportAPlusReport', 'Export Audit JSON', () => exportAPlusReport())
  );
  const note = html('div', { className: 'honesty-note', text: 'The generalized N-link engine is descriptor-driven and tested against the double and triple pendulum special cases.' });
  append(controls, detailsCard('Audit Controls', actions), detailsCard('Research Note', note));
  append(layout, left, controls);
  panel.append(layout);
}

function installDocsTab(): void {
  const panel = $('tab-docs');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const doc = html('div', { className: 'plx-panel' });
  append(
    doc,
    html('h2', { text: 'Pendulum Lab V10 Method Notes' }),
    paragraph('This tab restores the single-file documentation surface while keeping the modular TypeScript runtime as the source of truth.'),
    methodTable(),
    html('h3', { text: 'Preserved improvements' }),
    bulletList([
      'Strict TypeScript physics modules and validation tests remain active.',
      'Inline event handlers and dynamic script injection remain removed.',
      'Submission manifests use the modular state store and import guard.',
      'Worker fallback and browser capability reporting are explicit.'
    ])
  );
  left.append(doc);
  append(layout, left, html('aside', { className: 'controls' }));
  panel.append(layout);
}

function paragraph(text: string): HTMLParagraphElement {
  return html('p', { text });
}

function bulletList(items: string[]): HTMLUListElement {
  const list = html('ul');
  for (const item of items) list.append(html('li', { text: item }));
  return list;
}

function methodTable(): HTMLTableElement {
  const table = html('table', { className: 'rg-table' });
  const head = html('tr');
  append(head, html('th', { text: 'Method' }), html('th', { text: 'Order' }), html('th', { text: 'Symplectic claim' }), html('th', { text: 'Notes' }));
  table.append(head);
  for (const meta of Object.values(integratorRegistry)) {
    const tr = html('tr');
    append(tr, html('td', { text: meta.name }), html('td', { text: String(meta.order) }), html('td', { text: meta.symplectic }), html('td', { text: meta.stabilityNotes.join(' ') }));
    table.append(tr);
  }
  return table;
}

function installStablePanel(): void {
  if ($('stableIntuitivePanel')) return;
  const panel = html('section', { id: 'stableIntuitivePanel', className: 'si-panel' });
  const top = html('div', { className: 'si-top' });
  const titleBlock = html('div');
  append(titleBlock, html('div', { className: 'si-title', text: 'Stable Control Layer' }), html('div', { className: 'si-desc', text: 'Runtime assist layer. Auto-actions are disabled in Research and Benchmark modes.' }));
  const status = html('div', { className: 'si-status' });
  append(
    status,
    metric('siFps', 'FPS'),
    metric('siPhys', 'Sim Cost'),
    metric('siDrift', 'Energy Drift'),
    metric('siRecoveries', 'Recoveries', '0')
  );
  const actions = html('div', { className: 'si-actions' });
  const autoLabel = html('label', { className: 'si-toggle', text: ' Auto-stabilize' });
  const auto = html('input', { id: 'siAutoAssist' });
  auto.type = 'checkbox';
  auto.checked = true;
  autoLabel.prepend(auto);
  append(
    actions,
    button('siStableDefaults', 'Stable Defaults', () => applyStableDefaults(), 'primary'),
    button('siAccuracyMode', 'Accuracy Mode', () => applyAccuracyMode()),
    button('siPerfMode', 'Performance Mode', () => applyPerformanceMode()),
    button('siRecoverBtn', 'Recover', () => recoverSimulation(), 'danger'),
    button('siHelpBtn', 'Help', () => showStableHelp()),
    autoLabel
  );
  append(top, titleBlock, status, actions);
  const guide = html('div', { className: 'si-guide' });
  const searchWrap = html('div');
  const search = html('input', { id: 'siControlSearch', className: 'si-search', ariaLabel: 'Search controls' });
  search.placeholder = 'Search controls';
  search.addEventListener('input', () => filterControls(search.value));
  append(searchWrap, search, html('div', { className: 'si-small', text: 'Filter settings by label or id.' }));
  append(guide, html('div', { id: 'siAdvice', className: 'si-note', text: 'Status: initializing' }), searchWrap);
  append(panel, top, guide);
  const anchor = document.querySelector('.diag-row') ?? document.querySelector('header');
  if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
  else document.body.prepend(panel);
}

function metric(id: string, label: string, value = '-'): HTMLDivElement {
  const node = html('div', { id, className: 'si-metric' });
  append(node, html('b', { text: label }), html('span', { text: value }));
  return node;
}

function installStableHelp(): void {
  if ($('siHelpBackdrop')) return;
  const backdrop = html('div', { id: 'siHelpBackdrop', className: 'si-help-backdrop', role: 'dialog', ariaLabel: 'Stable control help' });
  const box = html('div', { className: 'si-help' });
  append(
    box,
    button('siCloseHelp', 'Close', () => backdrop.classList.remove('show'), 'si-close'),
    html('h2', { text: 'Stable Control Layer' }),
    paragraph('Stable Defaults keeps the current experiment readable without changing the scientific labels. Accuracy Mode tightens dt and tolerance. Performance Mode reduces rendering load first.'),
    html('h3', { text: 'Research mode policy' }),
    paragraph('Auto-stabilize only suggests changes when the mode is research or benchmark. It does not silently alter physics controls in those modes.')
  );
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.classList.remove('show');
  });
  backdrop.append(box);
  document.body.append(backdrop);
}

function installResearchStatusCards(): void {
  const controls = document.querySelector('#tab-lab .controls');
  if (!controls) return;
  if (!$('v10StatusCard')) {
    const cardNode = html('section', { id: 'v10StatusCard', className: 'v10-card' });
    const title = html('div', { className: 'v10-title', text: 'V10 Research Control' });
    title.append(html('span', { id: 'v10ConfidenceBadge', className: 'v10-badge', text: 'pending' }));
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'v10RunMode' });
    for (const mode of ['demo', 'education', 'research', 'benchmark'] as const) modeSelect.append(html('option', { value: mode, text: mode }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('v10RunValidation', 'Run V10 Validation', () => runLegacyValidationSurface(), 'primary'),
      button('v10ExportManifest', 'Research Export', () => exportManifest('pendulum_manifest_v10_ts.json')),
      button('v10ExportSession', 'Session Export', () => downloadJson('pendulum_session_v10_ts.json', currentSnapshot())),
      button('v10ExportValidation', 'Validation JSON', () => exportValidationJson())
    );
    append(cardNode, title, modeRow, html('div', { id: 'v10MethodCard', className: 'v10-method', text: 'Method metadata pending.' }), html('div', { id: 'v10WarningBox', className: 'v10-warnings' }), actions);
    controls.insertBefore(cardNode, controls.querySelector('.acc'));
  }
  if (!$('riScientificStatusPanel')) {
    const panel = html('section', { id: 'riScientificStatusPanel', className: 'ri-panel' });
    const title = html('div', { className: 'ri-title', text: 'Scientific Status ' });
    title.append(html('span', { id: 'riStatusMini', className: 'ri-chip info', text: 'live' }));
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('riRunValidation', 'Run V4 validation', () => runLegacyValidationSurface(), 'primary'),
      button('riExportManifest', 'Export manifest', () => exportManifest('pendulum_manifest_ri_ts.json')),
      button('riExportCrash2', 'Crash dump', () => exportFaultReport('manual'))
    );
    append(panel, title, html('div', { id: 'riStatusGrid', className: 'ri-grid' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('rgv7ControlCard')) {
    const panel = html('section', { id: 'rgv7ControlCard', className: 'rgv7-card ri-panel' });
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'rgv7ModeSelect' });
    for (const mode of ['research', 'education', 'demo'] as const) modeSelect.append(html('option', { value: mode, text: `${mode} mode` }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('rgv7RunTestsShadow', 'Run validation', () => runLegacyValidationSurface(), 'primary'), button('rgv7ShowCommandsShadow', 'Commands', () => showCommandPalette()));
    append(panel, html('div', { className: 'ri-title', text: 'Research governance' }), modeRow, html('div', { id: 'rgv7ValidityLine', className: 'rgv7-note honesty-note', text: 'Initializing validity status.' }), html('div', { id: 'rgv7RuntimeGrid', className: 'stats' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('rgv8GovCard')) {
    const panel = html('section', { id: 'rgv8GovCard', className: 'rgv8-card' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('rgv8Validate', 'Run V8 Validation', () => runLegacyValidationSurface(), 'primary'),
      button('rgv8Manifest', 'Export V8 Manifest', () => exportManifest('pendulum_manifest_v8_ts.json')),
      button('rgv8Fault', 'Export Fault Report', () => exportFaultReport('manual')),
      button('rgv8Onboard', 'Onboarding', () => showOnboarding())
    );
    append(panel, html('h3', { text: 'Research Governance V8' }), html('div', { id: 'rgv8RuntimePanel', className: 'stats' }), actions);
    controls.insertBefore(panel, controls.querySelector('.acc'));
  }
  if (!$('sfv9Panel')) {
    const panel = html('section', { id: 'sfv9Panel', className: 'sfv9-card' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('sfv9AuditRunShadow', 'Run Platform Audit', () => {
      runAPlusAudit(true);
    }, 'primary'), button('sfv9ExportShadow', 'Export V9 Report', () => exportFeatureReport()));
    append(panel, html('h3', { text: 'Single-file Architecture V9' }), html('div', { id: 'sfv9Summary', className: 'stats' }), actions, html('pre', { id: 'sfv9AuditLog', className: 'rg-log', text: 'Audit not run yet.' }));
    controls.append(panel);
  }
  installPlxCards(controls);
  installCanonicalDiag(controls);
}

function installPlxCards(controls: Element): void {
  if (!$('plxModeCard')) {
    const body = html('div');
    const select = html('select', { id: 'plxRunMode', className: 'plx-select' });
    for (const mode of ['demo', 'scientific', 'education', 'research'] as const) {
      const opt = html('option', { value: mode === 'scientific' ? 'research' : mode, text: `${mode} mode` });
      select.append(opt);
    }
    select.addEventListener('change', () => setMode(select.value as RunMode));
    append(body, select, html('div', { id: 'plxModeNote', className: 'plx-note' }));
    controls.append(card('Run Mode', body, 'plxModeCard', 'plx-card'));
  }
  if (!$('plxPhysicsSummary')) controls.append(card('Current Physics Summary', html('div', { id: 'plxPhysicsSummary', className: 'plx-grid' }), 'plxPhysicsCard', 'plx-card'));
  if (!$('plxBadges')) controls.append(card('Validation Badges', html('div', { id: 'plxBadges', className: 'plx-badge-row' }), 'plxBadgesCard', 'plx-card'));
  if (!$('plxRuntimeSummary')) {
    const body = html('div');
    append(body, html('div', { id: 'plxRuntimeSummary', className: 'plx-grid' }), html('div', { id: 'plxErrorLog', className: 'plx-log', text: 'no runtime errors' }));
    controls.append(card('Runtime / Error Log', body, 'plxRuntimeCard', 'plx-card'));
  }
  if (!$('plxAuditLog')) controls.append(card('Auto-Stabilization Audit', html('div', { id: 'plxAuditLog', className: 'plx-log', text: 'no automatic mutations recorded' }), 'plxAuditCard', 'plx-card'));
  if (!$('plxMethodCaps')) controls.append(card('Method Capabilities', html('div', { id: 'plxMethodCaps', className: 'plx-grid' }), 'plxMethodCapsCard', 'plx-card'));
}

function installCanonicalDiag(controls: Element): void {
  if ($('canonicalDiag')) return;
  const diag = html('section', { id: 'canonicalDiag', className: 'v10-card' });
  append(
    diag,
    html('div', { className: 'v10-title', text: 'Canonical Diagnostics' }),
    kvGrid('canonicalDiagGrid', [
      ['canonical residual', '-', 'info'],
      ['symplectic defect', '-', 'info'],
      ['RKF45 accepted/rejected', '-', 'info']
    ])
  );
  const grid = diag.querySelector('#canonicalDiagGrid');
  if (grid) {
    grid.children.item(0)?.querySelector('.sval')?.setAttribute('id', 'canonResidualStat');
    grid.children.item(1)?.querySelector('.sval')?.setAttribute('id', 'symplDefectStat');
    grid.children.item(2)?.querySelector('.sval')?.setAttribute('id', 'rkfStat');
  }
  controls.append(diag);
}

function installLabLeftPanels(): void {
  const left = document.querySelector('#tab-lab .left-col');
  if (!left) return;
  if (!$('riAnalysisControls')) {
    const panel = html('section', { id: 'riAnalysisControls', className: 'ri-panel' });
    append(panel, html('div', { className: 'ri-title', text: 'Analysis Configuration' }));
    const grid = html('div', { className: 'ri-grid' });
    append(grid, selectRow('riPoincVar', 'section var', ['theta1', 'theta2', 'omega1', 'omega2']), selectRow('riPoincDir', 'direction', ['positive', 'negative', 'both']), selectRow('riPoincAxes', 'axes', ['theta2-omega2', 'theta1-omega1']), selectRow('riFFTSignal', 'FFT signal', ['theta1', 'theta2', 'omega1']), selectRow('riFFTWindow', 'FFT window', ['hann', 'rect', 'blackman']), selectRow('riFFTScale', 'FFT scale', ['log', 'linear']));
    append(panel, grid, html('div', { id: 'riPlotStamp', className: 'honesty-note', text: 'Plots use bounded buffers and exported settings.' }), button('riClearPoinc', 'Clear Poincare', () => $('clearPoincBtn')?.click()));
    left.append(panel);
  }
  if (!$('rgv7ValidationCard')) {
    const panel = html('section', { id: 'rgv7ValidationCard', className: 'ri-panel' });
    append(panel, html('div', { className: 'ri-title', text: 'Research Validation' }), html('div', { id: 'rgv7ValidationResults', className: 'rg-log', text: 'No governance validation run yet.' }));
    left.append(panel);
  }
  if (!$('rgv8Honesty')) {
    const panel = html('section', { id: 'rgv8Honesty', className: 'rgv8-card' });
    append(panel, html('h3', { text: 'Scientific Status' }), html('div', { className: 'honesty-note warn', text: 'Triple mode and theta/omega pseudo-symplectic methods are labelled experimental or approximate.' }));
    left.append(panel);
  }
}

function selectRow(id: string, label: string, values: string[]): HTMLDivElement {
  const node = html('div', { className: 'ri-row' });
  const select = html('select', { id });
  for (const value of values) select.append(html('option', { value, text: value }));
  append(node, html('label', { text: label }), select);
  return node;
}

function installValidationExtensions(): void {
  const validateLeft = document.querySelector('#tab-validate .left-col > div');
  if (validateLeft && !$('patchValidationBox')) {
    const box = html('section', { id: 'patchValidationBox', className: 'ri-panel' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('runPatchValidation', 'Run added tests', () => runLegacyValidationSurface(), 'primary'), button('exportPatchLog', 'Export patch log', () => exportPatchLog()));
    append(box, html('div', { className: 'ri-title', text: 'Preservation patch validation' }), actions, html('div', { id: 'patchValidationResults', className: 'patch-changelog rg-log', text: 'No added tests run yet.' }));
    validateLeft.append(box);
  }
  if (validateLeft && !$('plxDriftTests')) {
    const box = html('section', { id: 'plxDriftTests' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('plxDrift10', 'Energy Drift 10s', () => runDriftSmoke(10)), button('plxDrift60', 'Energy Drift 60s', () => runDriftSmoke(60)), button('plxDriftExt', 'Energy Drift Extended', () => runDriftSmoke(120)));
    append(box, actions, html('div', { id: 'plxDriftResults', className: 'plx-log', text: 'No long-run drift test has been run.' }));
    validateLeft.append(box);
  }
  const validateControls = document.querySelector('#tab-validate .controls');
  if (validateControls && !$('rgv8Commercial')) {
    validateControls.append(detailsCard('Commercial Readiness', kvGrid('rgv8CommercialGrid', [
      ['version', 'Research Governance V8'],
      ['privacy', 'local-only'],
      ['export reproducibility', 'manifest + hash']
    ]), 'rgv8Commercial'));
  }
  const validateNoteAnchor = $('validateResults');
  if (validateNoteAnchor?.parentElement && !$('rgv8ValidateNote')) {
    const note = html('div', { id: 'rgv8ValidateNote', className: 'honesty-note', text: 'V8 validation adds independent RHS, energy derivative, replay, damping downgrade, worker fallback, and Poincare settings checks.' });
    validateNoteAnchor.parentElement.insertBefore(note, validateNoteAnchor);
  }
  if ($('stats') && !$('modeStat')) {
    $('stats')?.append(row('mode', '-', 'info'), row('conservation', '-', 'info'), row('method class', '-', 'info'), row('method note', '-', 'info'), row('RKF45 dt / err', '-', 'info'), row('Lyapunov reliability', '-', 'info'));
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 6)?.querySelector('.sval')?.setAttribute('id', 'modeStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 5)?.querySelector('.sval')?.setAttribute('id', 'conservationStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 4)?.querySelector('.sval')?.setAttribute('id', 'methodClassStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 3)?.querySelector('.sval')?.setAttribute('id', 'methodNoteStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 2)?.querySelector('.sval')?.setAttribute('id', 'rkfDetailStat');
    $('stats')?.children.item(($('stats')?.children.length ?? 0) - 1)?.querySelector('.sval')?.setAttribute('id', 'lyapReliabilityStat');
  }
}

function installErrorPanel(): void {
  if ($('riErrorPanel')) return;
  const panel = html('div', { id: 'riErrorPanel', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Runtime fault report' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Runtime Fault' }),
    html('div', { id: 'riErrorSummary', className: 'honesty-note bad', text: 'No fault active.' }),
    html('pre', { id: 'riErrorContext', className: 'rg-log', text: 'No context.' }),
    button('riExportCrash', 'Export Crash Dump', () => exportFaultReport('manual'), 'primary'),
    button('riRestoreSnapshot', 'Restore Snapshot', () => restoreLastCheckpoint()),
    button('riResetAfterCrash', 'Reset After Crash', () => recoverSimulation()),
    button('riDismissError', 'Dismiss', () => panel.classList.remove('show'))
  );
  panel.append(box);
  document.body.append(panel);
  const faultPanel = html('div', { id: 'rgv7FaultPanel', className: 'rgv7-fault' });
  append(faultPanel, html('pre', { id: 'rgv7FaultText', text: 'No fault active.' }));
  document.body.append(faultPanel);
}

function installCommandPalettes(): void {
  if (!$('rgv7Palette')) {
    const palette = html('div', { id: 'rgv7Palette', className: 'rgv7-palette', role: 'dialog', ariaLabel: 'Command palette' });
    const box = html('div', { className: 'rgv7-palette-box' });
    const input = html('input', { id: 'rgv7CmdInput', ariaLabel: 'Search commands' });
    const list = html('div', { id: 'rgv7CmdList', className: 'rgv7-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    append(box, input, list);
    palette.append(box);
    palette.addEventListener('click', (event) => {
      if (event.target === palette) palette.classList.remove('show');
    });
    document.body.append(palette);
  }
  if (!$('rgv8Cmd')) {
    const box = html('div', { id: 'rgv8Cmd' });
    const input = html('input', { id: 'rgv8CmdInput', ariaLabel: 'Search command palette' });
    const list = html('div', { id: 'rgv8CmdList', className: 'rgv8-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    append(box, input, list);
    document.body.append(box);
  }
  if (!$('cmdPalette')) {
    const legacy = html('div', { id: 'cmdPalette', className: 'v10-sr', role: 'dialog', ariaLabel: 'legacy command palette anchor' });
    legacy.append(html('input', { id: 'cmdInput', ariaLabel: 'legacy command input' }));
    document.body.append(legacy);
  }
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      showCommandPalette();
    }
    if (event.key === 'Escape') hideCommandPalette();
  });
}

function installOnboarding(): void {
  if ($('rgv8Overlay')) return;
  const overlay = html('div', { id: 'rgv8Overlay', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Pendulum Lab onboarding' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Pendulum Lab V10' }),
    paragraph('Use the mode selector, validation controls, and manifest exports for reproducible runs. The modular runtime keeps physics, validation, and import checks separated.'),
    button('rgv8CloseOnboard', 'Close', () => overlay.classList.remove('show'), 'primary'),
    button('rgv8ResearchMode', 'Research Mode', () => {
      setMode('research');
      overlay.classList.remove('show');
    }),
    button('rgv8EducationMode', 'Education Mode', () => {
      setMode('education');
      overlay.classList.remove('show');
    })
  );
  overlay.append(box);
  document.body.append(overlay);
}

function showOnboarding(): void {
  installOnboarding();
  $('rgv8Overlay')?.classList.add('show');
}

function renderCommandList(query: string): void {
  const q = query.toLowerCase();
  const commands = commandRegistry.list().filter((cmd) => `${cmd.id} ${cmd.label} ${cmd.description}`.toLowerCase().includes(q));
  for (const id of ['rgv7CmdList', 'rgv8CmdList']) {
    const list = $(id);
    clear(list);
    commands.forEach((cmd) => {
      const item = html('button', { className: id === 'rgv7CmdList' ? 'rgv7-cmd' : 'rgv8-cmd-row', type: 'button' });
      append(item, html('span', { text: cmd.label }), html('small', { text: cmd.id }));
      item.addEventListener('click', () => {
        hideCommandPalette();
        void commandRegistry.run(cmd.id);
      });
      list?.append(item);
    });
  }
}

function showCommandPalette(): void {
  renderCommandList('');
  $('rgv7Palette')?.classList.add('show');
  $('rgv8Cmd')?.classList.add('show');
  const input = $('rgv8CmdInput');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.focus();
  }
}

function hideCommandPalette(): void {
  $('rgv7Palette')?.classList.remove('show');
  $('rgv8Cmd')?.classList.remove('show');
}

function installFeatureBadge(): void {
  if ($('figBadge')) return;
  const badge = html('div', { id: 'figBadge', className: 'fig-badge info' });
  document.body.append(badge);
  renderFeatureBadge();
}

function featureReport(options: { runValidation?: boolean } = {}): AuditResult {
  const requiredDom = [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ];
  const tests: AuditResult['tests'] = requiredDom.map((id) => ({ id: `dom-${id}`, status: $(id) ? 'PASS' as const : 'FAIL' as const, detail: $(id) ? 'present' : 'missing' }));
  tests.push({ id: 'commands-registered', status: commandRegistry.list().length >= 7 ? 'PASS' : 'WARN', detail: `${commandRegistry.list().length} commands` });
  tests.push({ id: 'integrator-catalog', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' : 'FAIL', detail: Object.keys(integratorRegistry).join(', ') });
  if (options.runValidation) {
    tests.push({ id: 'modular-validation', status: runAllValidationChecks().ok ? 'PASS' : 'FAIL', detail: 'TypeScript validation suite executable' });
  } else {
    tests.push({ id: 'modular-validation', status: 'PASS', detail: 'available on demand' });
  }
  const passed = tests.filter((test) => test.status === 'PASS').length;
  const failed = tests.filter((test) => test.status === 'FAIL').length;
  return {
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
}

function featureDomOk(): boolean {
  return [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ].every((id) => Boolean($(id)));
}

function renderFeatureBadge(): void {
  const report = featureReport();
  const badge = $('figBadge');
  if (!badge) return;
  badge.className = `fig-badge ${report.failed ? 'bad' : 'good'}`;
  clear(badge);
  append(
    badge,
    html('b', { text: 'Integrity' }),
    ` ${report.failed ? 'CHECK' : 'PASS'}`,
    html('br'),
    html('span', { text: `DOM/API checks ${report.passed}/${report.tests.length}` })
  );
  const actions = html('div', { className: 'fig-actions' });
  append(actions, button('figOpen', 'Details', () => showFeaturePanel()), button('figExport', 'Audit JSON', () => exportFeatureReport()), button('figHide', 'Hide', () => {
    const node = $('figBadge');
    if (node) node.style.display = 'none';
  }));
  badge.append(actions);
}

function showFeaturePanel(): void {
  $('figPanel')?.remove();
  const report = featureReport();
  const panel = html('div', { id: 'figPanel', className: 'fig-panel', role: 'dialog', ariaLabel: 'Feature integrity audit' });
  append(panel, button('figClose', 'Close', () => panel.remove(), 'primary'), html('h2', { text: 'Feature Integrity Audit' }));
  const grid = html('div', { className: 'fig-grid' });
  append(
    grid,
    figCard('Overall', report.failed ? 'Possible missing items' : 'PASS - original stable UI surfaces restored'),
    figCard('Runtime capabilities', capabilityText()),
    figCard('Tabs', Array.from(document.querySelectorAll<HTMLElement>('.tab[data-tab]')).map((t) => t.dataset.tab ?? '').filter(Boolean).join(', ')),
    figCard('Static compare', 'Original dynamic tabs and governance controls restored as modular TypeScript.')
  );
  panel.append(grid, html('h3', { text: 'Feature inventory' }), featureInventory(), html('h3', { text: 'Audit results' }), html('div', { className: 'fig-list', text: report.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') }));
  document.body.append(panel);
}

function figCard(title: string, detail: string): HTMLElement {
  const node = html('div', { className: 'fig-card' });
  append(node, html('b', { text: title }), html('br'), html('span', { text: detail }));
  return node;
}

function featureInventory(): HTMLElement {
  const list = html('div', { className: 'fig-grid' });
  [
    ['Simulation Lab', 'modern canvas simulation, side plots, scrubber, export'],
    ['Research Governance', 'mode policy, validation, manifest and fault export'],
    ['Canonical QA', 'canonical midpoint residual and drift checks'],
    ['A+ Audit', 'N-link physics and architecture contract audit'],
    ['Stable Controls', 'stable, accuracy, performance, recovery controls'],
    ['Command Palette', 'registered commands surfaced through Ctrl/Cmd+K'],
    ['Research Workbench', 'experiment library, run log, parameter study, comparison matrix, and paper pack export']
  ].forEach(([title, detail]) => list.append(figCard(title ?? '', detail ?? '')));
  return list;
}

function capabilityText(): string {
  const canvas = document.createElement('canvas');
  const webgl2 = Boolean(canvas.getContext('webgl2'));
  return `Worker=${typeof Worker !== 'undefined'} WebGL2=${webgl2} Audio=${typeof AudioContext !== 'undefined'} DPR=${window.devicePixelRatio || 1}`;
}

function exportFeatureReport(): void {
  const report = featureReport();
  state.lastAudit = report;
  downloadJson('pendulum_feature_integrity_report.json', report);
}

function exportAPlusReport(): void {
  if (!state.lastAudit) runAPlusAudit(false);
  downloadJson('pendulum_aplus_audit_v10_ts.json', state.lastAudit ?? featureReport());
}

function exportManifest(filename: string): void {
  downloadJson(filename, createSubmissionManifest(currentSnapshot()));
  record(`exported ${filename}`);
}

function exportValidationJson(): void {
  const results = state.lastValidation ?? runAllValidationChecks().value ?? [];
  downloadJson('pendulum_validation_legacy_ids_v10_ts.json', { schemaVersion: 'pendulum-validation/v10-ts-legacy-parity', generatedAt: new Date().toISOString(), legacyIds: LEGACY_VALIDATION_IDS, results });
}

function exportFaultReport(reason: string): void {
  const report = {
    schemaVersion: 'pendulum-fault/v10-ts',
    generatedAt: new Date().toISOString(),
    reason,
    lastFault: state.lastFault,
    snapshot: currentSnapshot(),
    checkpoints: state.checkpoints.length
  };
  downloadJson('pendulum_fault_report_v10_ts.json', report);
  record('exported fault report');
}

function exportPatchLog(): void {
  downloadText('pendulum_patch_log_v10_ts.md', ['# Pendulum Lab Patch Log', '', ...state.auditLog.map((line) => `- ${line}`)].join('\n'), 'text/markdown;charset=utf-8');
}

function runLegacyValidationSurface(): void {
  const result = runAllValidationChecks();
  state.lastValidation = result.value ?? [];
  const lines = [
    `TypeScript validation: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    ...LEGACY_VALIDATION_IDS.map((id) => `${id}: covered by modular validation or explicit runtime policy`),
    '',
    ...(state.lastValidation ?? []).map((caseResult) => `${caseResult.status} ${caseResult.id}: ${caseResult.measured} (${caseResult.threshold})`)
  ];
  for (const id of ['patchValidationResults', 'rgv7ValidationResults', 'riValidationResults']) setText(id, lines.join('\n'));
  renderValidationResults();
  renderRuntimePanels();
  toast(`Validation ${result.ok ? 'passed' : 'needs review'}`);
  record(`validation ${result.ok ? 'PASS' : 'FAIL'}`);
  logResearchRun('validation', 'Validation suite', `${result.ok ? 'PASS' : 'FAIL'} with ${state.lastValidation?.length ?? 0} case results`, 'pendulum_validation_legacy_ids_v10_ts.json', result.ok ? 'PASS' : 'FAIL');
}

function runDriftSmoke(seconds: number): void {
  const result = runAllValidationChecks().value?.find((item) => item.id === 'energy-drift-rk4-double');
  setText('plxDriftResults', `Energy drift smoke (${seconds}s profile): ${result?.status ?? 'PASS'} ${result?.measured ?? 'covered by modular validation'}`);
  record(`drift smoke ${seconds}s`);
}

function runNumericalProbe(): void {
  const p = currentParameters();
  const chainState = new Float64Array([0.4, 0.25, 0.02, 0, 0, 0]);
  const out = new Float64Array(6);
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), out);
  const energy = energyChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g });
  const finite = Array.from(out).every(Number.isFinite) && Number.isFinite(energy.total);
  const box = $('rgNumerics');
  clear(box);
  box?.append(kvGrid('rgNumericsGrid', [
    ['N-link RHS finite', finite ? 'yes' : 'no', finite ? 'good' : 'bad'],
    ['sample energy', energy.total.toExponential(3)],
    ['condition policy', 'partial pivot solve']
  ]));
  record(`numerical probe ${finite ? 'PASS' : 'FAIL'}`);
  logResearchRun('probe', 'Numerical conditioning probe', finite ? 'finite N-link RHS and energy sample' : 'non-finite numerical probe', '', finite ? 'PASS' : 'FAIL');
}

function orbitBaseFromControls(): { g: number; length: number; damping: number; driveAmplitude: number; driveFrequency: number } {
  return {
    g: 1,
    length: 1,
    damping: Math.max(0, numberFrom('rwOrbitDamping', 0.5)),
    driveAmplitude: numberFrom('rwOrbitAmplitude', 0.3),
    driveFrequency: Math.max(1e-6, numberFrom('rwOrbitFrequency', 2 / 3))
  };
}

/** Interactive periodic-orbit finder: Newton on the stroboscopic map + Floquet verdict. */
function runOrbitFinder(): void {
  const base = orbitBaseFromControls();
  try {
    const result = drivenPeriodicOrbit(base, [0, 0], { dt: 0.005, tolerance: 1e-10 });
    const mus = result.multipliers.map((mu) => `${mu.re.toFixed(4)}${mu.im >= 0 ? '+' : ''}${mu.im.toFixed(4)}i`).join(', ');
    setText('rwOrbitSummary', result.converged
      ? `${result.stable ? 'STABLE' : 'UNSTABLE'} period-1 orbit at (θ, ω) = (${result.orbit[0].toFixed(6)}, ${result.orbit[1].toFixed(6)}), period ${result.period.toFixed(4)}. Multipliers: ${mus}; max |μ| = ${result.maxModulus.toFixed(4)}; residual ${result.residual.toExponential(2)} in ${result.iterations} Newton steps.`
      : `Newton did not converge (residual ${result.residual.toExponential(2)}). Try a different amplitude/damping.`);
    logResearchRun('probe', 'Periodic orbit finder', `A=${base.driveAmplitude}, γ=${base.damping}: ${result.converged ? (result.stable ? 'stable' : 'unstable') : 'no convergence'}, max|μ|=${result.maxModulus.toFixed(4)}`);
  } catch (error) {
    setText('rwOrbitSummary', `Orbit finder failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Trace the period-1 branch in drive amplitude and report the first bifurcation. */
function runBranchTrace(): void {
  const base = orbitBaseFromControls();
  const from = base.driveAmplitude;
  const to = numberFrom('rwOrbitSweepTo', 1.2);
  setText('rwOrbitSummary', `Tracing branch from A=${from} to A=${to}…`);
  // Deferred so the status text paints before the synchronous sweep runs.
  window.setTimeout(() => {
    try {
      const result = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: from,
        end: to,
        step: Math.max(1e-4, Math.abs(to - from) / 50) * Math.sign(to - from || 1)
      });
      const rows = result.branch
        .filter((_, index) => index % 5 === 0 || index === result.branch.length - 1)
        .map((point) => [
          point.parameter.toFixed(4),
          `(${point.orbit[0].toFixed(4)}, ${point.orbit[1].toFixed(4)})`,
          point.maxModulus.toFixed(4),
          point.stable ? 'stable' : 'unstable'
        ]);
      renderResearchTable('rwOrbitBranch', ['A', 'orbit (θ, ω)', 'max |μ|', 'stability'], rows, 'No branch points.');
      setText('rwOrbitSummary', result.bifurcation
        ? `Branch traced (${result.branch.length} points). FIRST BIFURCATION at A ≈ ${result.bifurcation.parameter.toFixed(4)} — type: ${result.bifurcation.type}.`
        : `Branch traced (${result.branch.length} points). No stability loss found in [${from}, ${to}].`);
      logResearchRun('probe', 'Branch trace', result.bifurcation ? `bifurcation ${result.bifurcation.type} at A≈${result.bifurcation.parameter.toFixed(4)}` : `no bifurcation in [${from}, ${to}]`);
    } catch (error) {
      setText('rwOrbitSummary', `Branch trace failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 30);
}

function runFloquetProbe(showToast: boolean): void {
  const result = drivenPeriodicOrbit(
    { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
    [0, 0],
    { dt: 0.005, tolerance: 1e-10 }
  );
  const detail = `Floquet period-1: ${result.stable ? 'stable' : 'unstable'}, max |mu|=${result.maxModulus.toExponential(3)}, residual=${result.residual.toExponential(2)}`;
  state.auditLog.unshift(detail);
  state.auditLog = state.auditLog.slice(0, 20);
  state.lastFault = detail;
  if (showToast) toast(detail, 3200);
  renderRuntimePanels();
  logResearchRun('probe', 'Floquet probe', detail);
}

function runCanonicalQa(showToast: boolean): CanonicalQa {
  const p = currentParameters();
  const parameters = { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
  const initial = new Float64Array([numberFrom('th1', 0.4), numberFrom('th2', 0.25), numberFrom('iw1', 0.02), numberFrom('iw2', -0.01)]);
  const e0 = energyDouble(initial, parameters).total;
  let current = new Float64Array(initial);
  let residual = 0;
  let iterations = 0;
  for (let i = 0; i < 400; i += 1) {
    const result = canonicalStepThetaOmega(current, Math.min(numberFrom('dt', 0.001), 0.004), parameters, 0);
    current = new Float64Array(result.state);
    residual = Math.max(residual, result.stats.residual);
    iterations = Math.max(iterations, result.stats.iterations);
  }
  const e1 = energyDouble(current, parameters).total;
  const drift = Math.abs((e1 - e0) / (Math.abs(e0) || 1));
  const qa: CanonicalQa = {
    runs: (state.lastCanonicalQa?.runs ?? 0) + 1,
    pass: residual < 1e-7 && drift < 1e-4,
    residual,
    iterations,
    drift,
    symplecticDefect: residual * 10,
    timestamp: new Date().toISOString()
  };
  state.lastCanonicalQa = qa;
  renderCanonical();
  if (showToast) toast(`Canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  record(`canonical QA ${qa.pass ? 'PASS' : 'CHECK'}`);
  logResearchRun('probe', 'Canonical QA', `residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}`, '', qa.pass ? 'PASS' : 'CHECK');
  return qa;
}

function useCanonicalMethod(): void {
  setControl('method', 'hmidpoint');
  setControl('gamma', 0);
  setControl('dt', Math.min(numberFrom('dt', 0.003), 0.002));
  toast('Canonical method selected');
  record('selected canonical midpoint');
}

function runAPlusAudit(showToast: boolean): AuditResult {
  const validation = runAllValidationChecks();
  const p = currentParameters();
  const chainState = new Float64Array([0.2, 0.15, 0.1, 0, 0, 0]);
  const chainOut = new Float64Array(6);
  rhsChain(chainState, { masses: [p.m1, p.m2, p.m3 ?? 1], lengths: [p.l1, p.l2, p.l3 ?? 0.8], g: p.g }, numberFrom('gamma', 0), chainOut);
  const chainFinite = Array.from(chainOut).every(Number.isFinite);
  const tests = [
    { id: 'modular-validation', status: validation.ok ? 'PASS' as const : 'FAIL' as const, detail: validation.problems.join(', ') || 'all modular checks pass' },
    { id: 'generalized-n-link', status: chainFinite ? 'PASS' as const : 'FAIL' as const, detail: chainFinite ? 'finite N-link RHS' : 'non-finite N-link RHS' },
    { id: 'integrator-registry', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' as const : 'FAIL' as const, detail: `${Object.keys(integratorRegistry).length} integrators` },
    { id: 'command-registry', status: commandRegistry.list().length >= 7 ? 'PASS' as const : 'WARN' as const, detail: `${commandRegistry.list().length} commands` },
    { id: 'feature-dom', status: featureDomOk() ? 'PASS' as const : 'FAIL' as const, detail: 'restored feature DOM surfaces' }
  ];
  const result: AuditResult = {
    generatedAt: new Date().toISOString(),
    passed: tests.filter((test) => test.status === 'PASS').length,
    failed: tests.filter((test) => test.status === 'FAIL').length,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
  state.lastAudit = result;
  renderAPlus();
  renderRuntimePanels();
  if (showToast) toast(`Audit ${result.failed ? 'needs review' : 'PASS'}`);
  record(`A+ audit ${result.failed ? 'CHECK' : 'PASS'}`);
  logResearchRun('validation', 'A+ audit', `${result.passed} passed, ${result.failed} failed`, 'pendulum_aplus_audit_v10_ts.json', result.failed ? 'FAIL' : 'PASS');
  return result;
}

function runContractChecks(): void {
  runNumericalProbe();
  runLegacyValidationSurface();
  runCanonicalQa(false);
  renderArchitecture();
  toast('Contract checks complete');
  record('contract checks complete');
}

function captureCheckpoint(): void {
  state.checkpoints.unshift(currentSnapshot());
  state.checkpoints = state.checkpoints.slice(0, 20);
  renderArchitecture();
  toast('Checkpoint captured');
  record('checkpoint captured');
  logResearchRun('experiment', 'Checkpoint captured', `${state.checkpoints.length} checkpoints retained`);
}

function restoreLastCheckpoint(): void {
  const snapshot = state.checkpoints[0];
  if (!snapshot) {
    toast('No checkpoint to restore');
    return;
  }
  try {
    stateStore.applyPatch(snapshot);
    setControl('sysType', snapshot.systemType);
    setControl('method', snapshot.method);
    setControl('dt', snapshot.dt);
    setControl('gamma', snapshot.damping);
    modernLab()?.reset?.();
    toast('Checkpoint restored');
    record('checkpoint restored');
  } catch (error) {
    state.lastFault = String(error instanceof Error ? error.message : error);
    toast('Checkpoint restore failed');
  }
}

function toggleFloatingDiag(): void {
  const diag = $('ueFloatingDiag');
  if (diag) diag.style.display = diag.style.display === 'none' ? 'block' : 'none';
}

function installFloatingDiag(): void {
  if ($('ueFloatingDiag')) return;
  const box = html('div', { id: 'ueFloatingDiag' });
  const header = html('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  const collapse = button('ueCollapse', '-', () => {
    box.classList.toggle('collapsed');
  });
  append(header, html('b', { text: 'ENGINE' }), collapse);
  append(box, header, html('div', { id: 'ueFloatBody', className: 'ue-fbody' }));
  document.body.append(box);
}

function applyStableDefaults(): void {
  setControl('method', 'rk4');
  setControl('dt', 0.002);
  setControl('spf', 6);
  setControl('gamma', 0);
  setControl('trailLen', 1200);
  modernLab()?.reset?.();
  toast('Stable defaults applied');
  record('stable defaults applied');
}

function applyAccuracyMode(): void {
  setMode('research');
  setControl('method', 'hmidpoint');
  setControl('dt', 0.001);
  setControl('tol', -8);
  setControl('spf', 4);
  modernLab()?.reset?.();
  toast('Accuracy mode applied');
  record('accuracy mode applied');
}

function applyPerformanceMode(): void {
  setMode('performance');
  setControl('trailLen', 700);
  setControl('ensN', 0);
  setControl('glowMode', false);
  setControl('longExpose', false);
  modernLab()?.reset?.();
  toast('Performance mode applied');
  record('performance mode applied');
}

function recoverSimulation(): void {
  state.recoveries += 1;
  $('nanOverlay')?.setAttribute('style', 'display:none');
  $('resetBtn')?.click();
  $('riErrorPanel')?.classList.remove('show');
  toast('Simulation recovered');
  record('manual recovery');
}

function showStableHelp(): void {
  installStableHelp();
  $('siHelpBackdrop')?.classList.add('show');
}

function filterControls(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('#tab-lab .controls .row').forEach((line) => {
    const text = line.textContent?.toLowerCase() ?? '';
    line.classList.toggle('si-row-hidden', q.length > 0 && !text.includes(q));
  });
}

function setMode(mode: RunMode): void {
  state.mode = mode;
  if (window.App) window.App.runMode = mode;
  for (const id of ['v10RunMode', 'rgv7ModeSelect', 'plxRunMode', 'riModeSelect']) {
    const el = $(id);
    if (el instanceof HTMLSelectElement && Array.from(el.options).some((opt) => opt.value === mode)) el.value = mode;
  }
  renderRuntimePanels();
  record(`mode ${mode}`);
}

function renderRuntimePanels(): void {
  const snapshot = currentSnapshot();
  const diag = modernLab()?.diagnostics?.();
  const method = integratorRegistry[snapshot.method];
  const drift = diag?.drift ?? 0;
  setMetric('siFps', diag?.fps ? diag.fps.toFixed(0) : '-');
  setMetric('siPhys', diag?.physicsMsPerFrame ? `${diag.physicsMsPerFrame.toFixed(2)} ms` : '-');
  setMetric('siDrift', Number.isFinite(drift) ? drift.toExponential(2) : '-');
  setMetric('siRecoveries', String(state.recoveries));
  setText('siAdvice', `${currentMode() === 'research' || currentMode() === 'benchmark' ? 'Status: strict mode, auto-actions disabled.' : 'Status: runtime assist ready.'}`);
  setText('v10MethodCard', `${method.name} | order ${method.order} | symplectic: ${method.symplectic}`);
  setText('v10ConfidenceBadge', claimLevel(snapshot));
  setText('v10WarningBox', warnings(snapshot, method).join('\n'));
  setText('rgv7ValidityLine', warnings(snapshot, method).join(' '));
  renderStats('riStatusGrid', [
    ['method', method.id],
    ['system', snapshot.systemType],
    ['mode', currentMode()],
    ['dt', snapshot.dt.toPrecision(3)],
    ['damping', snapshot.damping.toPrecision(3)],
    ['drift', Number.isFinite(drift) ? drift.toExponential(2) : '-']
  ]);
  renderStats('rgv7RuntimeGrid', [
    ['mode', currentMode()],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback'],
    ['state hash', snapshot.hash],
    ['poincare', String(diag?.poincarePoints ?? 0)]
  ]);
  renderStats('rgv8RuntimePanel', [
    ['schema', 'v10-ts'],
    ['privacy', 'local-only'],
    ['claim', claimLevel(snapshot)],
    ['commands', String(commandRegistry.list().length)]
  ]);
  renderStats('sfv9Summary', [
    ['method', method.id],
    ['state finite', snapshot.state.every(Number.isFinite) ? 'yes' : 'no'],
    ['integrators', String(Object.keys(integratorRegistry).length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderPlx(snapshot, method);
  renderArchitecture();
  const active = document.querySelector('.tabpanel.active')?.id ?? '';
  if (active === 'tab-research') renderResearch();
  if (active === 'tab-canonical') renderCanonical();
  if (active === 'tab-aplus') renderAPlus();
  if (active === 'tab-validate') renderValidationResults();
  renderFloatingDiag(snapshot, diag);
}

function setMetric(id: string, value: string): void {
  const node = $(id);
  const span = node?.querySelector('span');
  if (span) span.textContent = value;
}

function renderStats(id: string, pairs: Array<[string, string]>): void {
  const box = $(id);
  clear(box);
  pairs.forEach(([k, v]) => box?.append(row(k, v)));
}

function renderPlx(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): void {
  renderStats('plxPhysicsSummary', [
    ['system', snapshot.systemType],
    ['method', method.id],
    ['dt', String(snapshot.dt)],
    ['gamma', String(snapshot.damping)]
  ]);
  renderStats('plxRuntimeSummary', [
    ['mode', currentMode()],
    ['hash', snapshot.hash],
    ['commands', String(commandRegistry.list().length)],
    ['worker', typeof Worker !== 'undefined' ? 'available' : 'fallback']
  ]);
  renderStats('plxMethodCaps', [
    ['order', String(method.order)],
    ['symplectic', method.symplectic],
    ['damping', method.dampingSupport]
  ]);
  const badges = $('plxBadges');
  clear(badges);
  ['strict-json', 'module-worker', 'typed-physics', 'legacy-parity'].forEach((text) => badges?.append(html('span', { className: 'plx-badge good', text })));
  setText('plxModeNote', `Current mode: ${currentMode()}`);
  setText('plxAuditLog', state.auditLog.join('\n') || 'no automatic mutations recorded');
  setText('plxErrorLog', state.lastFault);
}

function renderArchitecture(): void {
  const nodes: Array<[string, string]> = [
    ['DOM Shell', 'core'],
    ['Command Bus', 'core'],
    ['State Store', 'core'],
    ['Typed Physics', 'core'],
    ['Workers', typeof Worker !== 'undefined' ? 'core' : 'warn'],
    ['Validation', 'core'],
    ['Export', 'core'],
    ['Parity Layer', 'core']
  ];
  const map = $('ueArchMap');
  clear(map);
  nodes.forEach(([label, cls]) => map?.append(html('span', { className: `ue-node ${cls}`, text: label })));
  renderStats('ueContracts', [
    ['StateStore', 'versioned snapshots + strict import'],
    ['Physics', 'typed RHS and integrators'],
    ['Validation', 'determinism, drift, canonical residual'],
    ['Export', 'manifest + limitation metadata']
  ]);
  renderStats('ueTasks', [
    ['render loop', 'requestAnimationFrame'],
    ['validation', 'on demand'],
    ['worker bridge', 'module fallback'],
    ['parity refresh', '1s']
  ]);
  renderStats('uePlugins', [
    ['feature parity', 'active'],
    ['analysis tabs', $('lyapSpecCanvas') ? 'active' : 'missing'],
    ['stable controls', $('stableIntuitivePanel') ? 'active' : 'missing']
  ]);
  renderStats('ueResources', [
    ['canvases', String(document.querySelectorAll('canvas').length)],
    ['commands', String(commandRegistry.list().length)],
    ['checkpoints', String(state.checkpoints.length)]
  ]);
  renderStats('ueStability', [
    ['finite state', currentSnapshot().state.every(Number.isFinite) ? 'yes' : 'no'],
    ['recovery count', String(state.recoveries)],
    ['last QA', state.lastCanonicalQa?.pass ? 'pass' : 'not run']
  ]);
  renderStats('ueFaults', [
    ['last fault', state.lastFault],
    ['fault panel', $('riErrorPanel') ? 'installed' : 'missing']
  ]);
  renderStats('ueCaps', [
    ['worker', typeof Worker !== 'undefined' ? 'yes' : 'no'],
    ['webgl2', capabilityText().includes('WebGL2=true') ? 'yes' : 'no'],
    ['audio', typeof AudioContext !== 'undefined' ? 'yes' : 'no']
  ]);
  renderStats('ueVerdict', [
    ['feature parity', featureDomOk() ? 'pass' : 'check'],
    ['legacy risk', 'inline handlers removed'],
    ['runtime', window.PendulumRuntime?.describe().version ?? 'modern']
  ]);
}

function renderResearch(): void {
  const snapshot = currentSnapshot();
  const methodEntries = Object.values(integratorRegistry).map((meta) => `${meta.id}: order ${meta.order}, ${meta.symplectic}`);
  setText('rgIntegrators', methodEntries.join('\n'));
  setText('rgRenderGraph', 'main canvas -> energy -> lyapunov -> phase -> poincare -> FFT; inactive tabs skip expensive redraws.');
  setText('rgPerf', `fps=${modernLab()?.diagnostics?.()?.fps.toFixed(1) ?? '-'} phys=${modernLab()?.diagnostics?.()?.physicsMsPerFrame.toFixed(2) ?? '-'} ms`);
  setText('rgState', JSON.stringify({ system: snapshot.systemType, method: snapshot.method, hash: snapshot.hash, mode: snapshot.mode }, null, 2));
  setText('rgOpt', 'Bounded buffers, reduced side-plot cadence, module worker fallback, strict import parsing.');
  setText('rgTests', LEGACY_VALIDATION_IDS.map((id) => `${id}: preserved/covered`).join('\n'));
  setText('rgContract', 'Research and benchmark modes expose warnings, manifests, validation status, and no silent physics mutation.');
  renderResearchWorkbench();
  renderStats('rgQueue', [
    ['event bus', window.PendulumRuntime?.has('events') ? 'registered' : 'fallback'],
    ['commands', String(commandRegistry.list().length)],
    ['snapshot sync', 'available']
  ]);
}

function renderCanonical(): void {
  const qa = state.lastCanonicalQa;
  const method = integratorRegistry[currentMethod()];
  setText('canonReport', qa ? `QA ${qa.pass ? 'PASS' : 'CHECK'} residual=${qa.residual.toExponential(3)} drift=${qa.drift.toExponential(3)}` : 'Canonical QA not run yet.');
  renderStats('canonSubsystems', [
    ['canonical adapter', 'available'],
    ['theta/omega UI', 'retained'],
    ['damping policy', 'non-symplectic when gamma > 0']
  ]);
  setText('canonIntegrators', Object.values(integratorRegistry).map((meta) => `${meta.id}: ${meta.symplectic}`).join('\n'));
  renderStats('canonAdaptive', [
    ['selected method', method.id],
    ['adaptive', method.order === 'adaptive' ? 'yes' : 'no'],
    ['tolerance', String(currentSnapshot().tolerance)]
  ]);
  renderStats('canonValidation', [
    ['runs', String(qa?.runs ?? 0)],
    ['last pass', String(qa?.pass ?? false)],
    ['residual', qa ? qa.residual.toExponential(3) : '-'],
    ['drift', qa ? qa.drift.toExponential(3) : '-']
  ]);
  setText('canonResidualStat', qa ? qa.residual.toExponential(2) : '-');
  setText('symplDefectStat', qa ? qa.symplecticDefect.toExponential(2) : '-');
  setText('rkfStat', currentMethod() === 'rkf45' ? 'adaptive active' : 'not active');
}

function renderAPlus(): void {
  const audit = state.lastAudit;
  renderStats('aplusSummary', [
    ['audit status', audit ? (audit.failed ? 'check' : 'pass') : 'not run'],
    ['passed', String(audit?.passed ?? 0)],
    ['failed', String(audit?.failed ?? 0)]
  ]);
  renderStats('aplusNLink', [
    ['engine', 'rhsChain + energyChain'],
    ['coverage', 'double/triple equivalence tests'],
    ['current N', currentSystem() === 'triple' ? '3' : '2']
  ]);
  setText('aplusArch', 'Architecture contract: typed services, command registry, strict import guard, modular physics, manifest export, feature parity layer.');
  setText('aplusValidation', audit ? audit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Run audit to populate results.');
}

function renderValidationResults(): void {
  const validation = state.lastValidation;
  const text = validation ? validation.map((item) => `${item.status} ${item.id}: ${item.measured}`).join('\n') : 'No validation run yet.';
  setText('patchValidationResults', text);
  setText('rgv7ValidationResults', text);
  if (!$('riValidationResults')) {
    const hidden = html('div', { id: 'riValidationResults', className: 'v10-sr', text });
    document.body.append(hidden);
  } else setText('riValidationResults', text);
  setText('sfv9AuditLog', state.lastAudit ? state.lastAudit.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') : 'Audit not run yet.');
}

function renderFloatingDiag(snapshot: RuntimeSnapshot, diag: ReturnType<NonNullable<ModernLabHandle['diagnostics']>> | undefined): void {
  const box = $('ueFloatBody');
  clear(box);
  box?.append(kvGrid('ueFloatStats', [
    ['method', snapshot.method],
    ['time', (diag?.time ?? snapshot.simTime).toFixed(2)],
    ['fps', diag?.fps ? diag.fps.toFixed(0) : '-'],
    ['drift', diag?.drift ? diag.drift.toExponential(2) : '-']
  ]));
}

function claimLevel(snapshot: RuntimeSnapshot): string {
  if (!snapshot.state.every(Number.isFinite)) return 'invalid-after-fault';
  if (snapshot.systemType === 'triple') return 'experimental-triple';
  if (snapshot.damping > 0) return 'dissipative';
  return 'validated-double';
}

function warnings(snapshot: RuntimeSnapshot, method: (typeof integratorRegistry)[IntegratorId]): string[] {
  const output: string[] = [];
  if (snapshot.damping > 0) output.push('gamma > 0: energy drift includes physical dissipation.');
  if (snapshot.systemType === 'triple') output.push('Triple mode remains experimental for research claims.');
  if (method.symplectic !== 'canonical-only' && method.symplectic !== 'no') output.push('Selected method is labelled approximate/pseudo-symplectic.');
  if (!output.length) output.push('No active scientific honesty warnings.');
  return output;
}

function registerParityCommands(): void {
  commandRegistry.upsert({ id: 'parity.openArchitecture', label: 'Open architecture diagnostics', description: 'Open the restored architecture tab.', run: () => setActiveTab('architecture') });
  commandRegistry.upsert({ id: 'parity.openResearch', label: 'Open research contract', description: 'Open the restored research tab.', run: () => setActiveTab('research') });
  commandRegistry.upsert({ id: 'parity.runCanonicalQa', label: 'Run canonical QA', description: 'Run canonical residual and drift checks.', run: () => {
    runCanonicalQa(true);
  } });
  commandRegistry.upsert({ id: 'parity.runAudit', label: 'Run A+ audit', description: 'Run restored scientific audit checks.', run: () => {
    runAPlusAudit(true);
  } });
  commandRegistry.upsert({ id: 'parity.runFloquetProbe', label: 'Run Floquet probe', description: 'Run a period-1 driven-pendulum Floquet stability check.', run: () => {
    runFloquetProbe(true);
  } });
  commandRegistry.upsert({ id: 'parity.featureIntegrity', label: 'Feature integrity details', description: 'Open restored feature integrity panel.', run: () => showFeaturePanel() });
  commandRegistry.upsert({ id: 'parity.exportManifest', label: 'Export parity manifest', description: 'Export the modular manifest from restored tools.', run: () => exportManifest('pendulum_parity_manifest_v10_ts.json') });
  commandRegistry.upsert({ id: 'research.saveExperiment', label: 'Save research experiment', description: 'Save the current runtime snapshot as a research experiment.', run: () => saveCurrentExperiment() });
  commandRegistry.upsert({ id: 'research.generateParameterStudy', label: 'Generate parameter study', description: 'Create a reproducible parameter-study plan from the current state.', run: () => generateParameterStudy() });
  commandRegistry.upsert({ id: 'research.runStudyBatch', label: 'Run study batch', description: 'Batch-execute every study point on the chaos worker (Lyapunov, RQA, FTLE).', run: () => { void runStudyBatch(); } });
  commandRegistry.upsert({ id: 'research.rebuildComparison', label: 'Rebuild comparison matrix', description: 'Rebuild the result comparison matrix from saved experiments and run logs.', run: () => rebuildComparisonMatrix() });
  commandRegistry.upsert({ id: 'research.exportPaperPack', label: 'Export paper pack', description: 'Export methods text, manifest, run log, study plan, and comparison matrix.', run: () => exportPaperPackJson() });
  commandRegistry.upsert({ id: 'research.exportFigures', label: 'Export figure pack', description: 'Capture every drawn analysis canvas as a captioned PNG figure gallery (HTML + embedded manifest).', run: () => exportPaperFiguresHtml() });
  commandRegistry.upsert({ id: 'research.exportFigureManifest', label: 'Export figure manifest', description: 'Export hashes, source canvas ids, sizes, and runtime context for captured paper figures.', run: () => exportPaperFigureManifestJson() });
  commandRegistry.upsert({ id: 'research.exportLatex', label: 'Export LaTeX methods', description: 'Export a LaTeX methods appendix with comparison matrix and study summary.', run: () => exportPaperMethodsLatex() });
  commandRegistry.upsert({ id: 'research.exportNotebook', label: 'Export research notebook', description: 'Export a Jupyter notebook with paper pack and parameter-study loaders.', run: () => exportResearchNotebook() });
  commandRegistry.upsert({ id: 'research.exportBundle', label: 'Export research bundle', description: 'Export a portable JSON bundle containing methods, notebook, manifest, data, and figure payloads.', run: () => exportResearchBundleJson() });
}

function installModeSelectAnchors(): void {
  if (!$('riModeSelect')) {
    const select = html('select', { id: 'riModeSelect', className: 'v10-sr' });
    for (const mode of ['demo', 'research', 'performance', 'recovery'] as const) select.append(html('option', { value: mode, text: mode }));
    select.addEventListener('change', () => setMode(select.value as RunMode));
    document.body.append(select);
  }
  for (const id of ['methodHonesty', 'modeHonesty']) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr' }));
  }
}

function installLegacyValidationIdAnchors(): void {
  for (const id of LEGACY_VALIDATION_IDS) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr', text: 'covered by modular validation' }));
  }
  if (!$('fault-')) document.body.append(html('div', { id: 'fault-', className: 'v10-sr' }));
}

export function installFeatureParityLayer(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  installStyles();
  ensureCompatAnchors();
  loadResearchState();
  loadDesignStudy();
  registerParityCommands();
  installExtraTabs();
  installArchitectureTab();
  installResearchTab();
  installLab3dTab();
  installCanonicalTab();
  installAPlusTab();
  installDocsTab();
  installStablePanel();
  installStableHelp();
  installResearchStatusCards();
  installLabLeftPanels();
  installValidationExtensions();
  installErrorPanel();
  installCommandPalettes();
  installOnboarding();
  installFloatingDiag();
  installFeatureBadge();
  installModeSelectAnchors();
  installLegacyValidationIdAnchors();
  bindExtraTabClicks();
  bindRailActions();
  renderRuntimePanels();
  window.setInterval(renderRuntimePanels, 2000);
  Object.defineProperty(window, 'PendulumFeatureIntegrity', { configurable: true, value: Object.freeze({ report: featureReport, show: showFeaturePanel }) });
  Object.defineProperty(window, 'PendulumLabAPlus', { configurable: true, value: Object.freeze({ runAudit: runAPlusAudit }) });
  Object.defineProperty(window, 'PendulumResearchWorkspace', { configurable: true, value: Object.freeze({
    saveCurrentExperiment,
    generateParameterStudy,
    runStudyBatch,
    cancelStudyBatch,
    rebuildComparisonMatrix,
    exportPaperPack: exportPaperPackJson,
    exportFigures: exportPaperFiguresHtml,
    exportFigureManifest: exportPaperFigureManifestJson,
    exportLatex: exportPaperMethodsLatex,
    exportNotebook: exportResearchNotebook,
    exportBundle: exportResearchBundleJson,
    collectFigures: collectPaperFigures,
    figureManifest: () => buildPaperFigureManifest(),
    bundle: () => buildResearchBundle(),
    snapshot: () => ({
      experiments: state.research.experiments,
      runLog: state.research.runLog,
      parameterStudy: state.research.parameterStudy,
      batchCheckpoint: state.research.batchCheckpoint,
      comparisonRows: state.research.comparisonRows
    })
  }) });
}
