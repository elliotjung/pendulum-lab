/**
 * Shared parity-layer state, DOM builders, runtime readers, and styles.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../../types/domain';
import { stateStore } from '../../state/StateStore';
import { type ValidationCaseResult } from '../../validation/validationSuite';
import { integratorRegistry } from '../../physics/integrators';
import { type ParameterStudyStrategy } from '../../research/researchSampling';
import { installAdoptedStyle } from '../../ui/adoptedStyles';
import { canAccessAudienceTab, currentAudienceMode } from '../audienceMode';

export { downloadText } from './parityDownload';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

export interface ModernLabHandle {
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

export interface CanonicalQa {
  runs: number;
  pass: boolean;
  residual: number;
  iterations: number;
  drift: number;
  symplecticDefect: number;
  timestamp: string;
}

export interface AuditResult {
  generatedAt: string;
  passed: number;
  failed: number;
  tests: Array<{ id: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }>;
  manifest: unknown;
}

export type ResearchRunType =
  'experiment' | 'validation' | 'parameter-study' | 'comparison' | 'export' | 'probe' | 'workspace';

export interface ResearchMetrics {
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  physicsMsPerFrame: number | null;
  poincarePoints: number;
  qualityScore: number;
  validationStatus: string;
}

export interface ResearchExperiment {
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

export interface ResearchRunLogEntry {
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

export interface StudyPointResults {
  lambdaMax: number;
  lambdaBlockStdError: number;
  rqaDeterminism: number;
  rqaDivergence: number;
  ftle: number;
  durationMs?: number;
  completedAt: string;
}

export interface ParameterStudyPoint {
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

export interface ParameterStudyPlan {
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

export type ResearchBatchStatus = 'running' | 'cancelled' | 'complete' | 'failed';

export interface ResearchBatchCheckpoint {
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

export interface ResearchComparisonRow {
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

export interface ResearchWorkspaceProfile {
  id: string;
  name: string;
  objective: string;
  flagshipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchArtifactManifestEntry {
  id: string;
  label: string;
  path: string;
  kind: 'report' | 'figure' | 'dataset' | 'workspace' | 'export';
  createdAt: string;
  hash?: string;
}

export interface ResearchSessionProfile {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  pinnedRunIds: string[];
  artifactManifest: ResearchArtifactManifestEntry[];
  comparisonHistory: string[];
}

export interface ResearchProjectProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeSessionId: string;
  sessionIds: string[];
}

export interface ResearchLayoutPreferences {
  density: 'comfortable' | 'compact';
  lastTab: string;
  panelCollapsed: boolean;
}

export interface ResearchWorkbenchState {
  project: ResearchProjectProfile;
  sessions: ResearchSessionProfile[];
  workspace: ResearchWorkspaceProfile;
  workspaces: ResearchWorkspaceProfile[];
  layout: ResearchLayoutPreferences;
  experiments: ResearchExperiment[];
  selectedExperimentId: string;
  runLog: ResearchRunLogEntry[];
  parameterStudy: ParameterStudyPlan | null;
  batchCheckpoint: ResearchBatchCheckpoint | null;
  comparisonRows: ResearchComparisonRow[];
}

export interface ResearchStoragePayload extends ResearchWorkbenchState {
  schemaVersion: string;
  savedAt: string;
  migrations: string[];
  droppedEntries: number;
}

export function defaultResearchWorkspaceProfile(now = new Date().toISOString()): ResearchWorkspaceProfile {
  return {
    id: 'workspace-certified-chaotic-dynamics',
    name: 'Certified Chaotic Dynamics Workbench',
    objective:
      'Build a reviewer-ready flagship result around the Melnikov gap map, with every quoted number carrying provenance, uncertainty, validation, and caveats.',
    flagshipId: 'melnikov-gap-map',
    createdAt: now,
    updatedAt: now
  };
}

export function defaultResearchSessionProfile(
  projectId = 'project-certified-chaotic-dynamics',
  now = new Date().toISOString()
): ResearchSessionProfile {
  return {
    id: 'session-melnikov-gap-map',
    projectId,
    name: 'Melnikov Gap Map Certification',
    objective:
      'Accumulate runs, artifacts, and caveats for the flagship Melnikov threshold vs period-doubling gap map.',
    createdAt: now,
    updatedAt: now,
    pinnedRunIds: [],
    artifactManifest: [],
    comparisonHistory: []
  };
}

export function defaultResearchProjectProfile(now = new Date().toISOString()): ResearchProjectProfile {
  const session = defaultResearchSessionProfile('project-certified-chaotic-dynamics', now);
  return {
    id: 'project-certified-chaotic-dynamics',
    name: 'Certified Chaotic Dynamics Workbench',
    createdAt: now,
    updatedAt: now,
    activeSessionId: session.id,
    sessionIds: [session.id]
  };
}

export function defaultResearchLayoutPreferences(): ResearchLayoutPreferences {
  return {
    density: 'comfortable',
    lastTab: 'research',
    panelCollapsed: false
  };
}

export const LEGACY_VALIDATION_IDS = [
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

export const COMPAT_ANCHOR_IDS = [
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

const initialResearchWorkspace = defaultResearchWorkspaceProfile();
const initialResearchProject = defaultResearchProjectProfile(initialResearchWorkspace.createdAt);
const initialResearchSession = defaultResearchSessionProfile(
  initialResearchProject.id,
  initialResearchWorkspace.createdAt
);

export const state = {
  mode: 'demo' as RunMode,
  recoveries: 0,
  auditLog: [] as string[],
  checkpoints: [] as RuntimeSnapshot[],
  lastValidation: null as ValidationCaseResult[] | null,
  lastCanonicalQa: null as CanonicalQa | null,
  lastAudit: null as AuditResult | null,
  lastFault: 'No runtime faults recorded.',
  research: {
    project: initialResearchProject,
    sessions: [initialResearchSession],
    workspace: initialResearchWorkspace,
    workspaces: [initialResearchWorkspace],
    layout: defaultResearchLayoutPreferences(),
    experiments: [] as ResearchExperiment[],
    selectedExperimentId: '',
    runLog: [] as ResearchRunLogEntry[],
    parameterStudy: null as ParameterStudyPlan | null,
    batchCheckpoint: null as ResearchBatchCheckpoint | null,
    comparisonRows: [] as ResearchComparisonRow[]
  } as ResearchWorkbenchState
};

export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function html<K extends keyof HTMLElementTagNameMap>(
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
  if (
    options.value !== undefined &&
    (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLOptionElement)
  ) {
    node.value = options.value;
  }
  return node;
}

export function append(parent: Node, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(child));
  }
}

export function clear(node: Element | null): void {
  if (node) node.replaceChildren();
}

export function setText(id: string, text: string): void {
  const node = $(id);
  if (node) node.textContent = text;
}

export function button(id: string, label: string, run: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const node = html('button', { id, text: label, type: 'button', className });
  node.addEventListener('click', () => {
    void run();
  });
  return node;
}

export function row(label: string, value: string, tone: Tone = ''): HTMLDivElement {
  const node = html('div', { className: 'srow' });
  const key = html('span', { className: 'skey', text: label });
  const val = html('span', { className: `sval ${tone}`.trim(), text: value });
  append(node, key, val);
  return node;
}

export function kvGrid(id: string, pairs: Array<[string, string, Tone?]>): HTMLDivElement {
  const grid = html('div', { id, className: 'stats' });
  pairs.forEach(([k, v, tone]) => grid.append(row(k, v, tone ?? '')));
  return grid;
}

export function card(title: string, body: Node, id?: string, className = 'rg-card'): HTMLElement {
  const section = id === undefined ? html('section', { className }) : html('section', { id, className });
  append(section, html('div', { className: 'rg-title', text: title }), body);
  return section;
}

export function detailsCard(title: string, body: Node, id?: string): HTMLDetailsElement {
  const details = id === undefined ? html('details', { className: 'acc' }) : html('details', { id, className: 'acc' });
  details.open = true;
  const summary = html('summary');
  append(
    summary,
    html('span', { className: 'acc-icon', text: '>' }),
    html('span', { className: 'acc-label', text: title }),
    html('span', { className: 'acc-arrow', text: '>' })
  );
  append(details, summary, html('div', { className: 'acc-body' }));
  details.querySelector('.acc-body')?.append(body);
  return details;
}

export function numberFrom(id: string, fallback: number): number {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  const value = Number.parseFloat(el.value);
  return Number.isFinite(value) ? value : fallback;
}

export function selectValue(id: string, fallback: string): string {
  const el = $(id);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return fallback;
  return el.value || fallback;
}

export function setControl(id: string, value: string | number | boolean): void {
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

export function modernLab(): ModernLabHandle | undefined {
  return (window as Window & { __modernLab?: ModernLabHandle }).__modernLab;
}

export function currentParameters(): PendulumParameters {
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

export function currentSystem(): SystemType {
  return selectValue('sysType', 'double') === 'triple' ? 'triple' : 'double';
}

export function currentMethod(): IntegratorId {
  const raw = selectValue('method', 'rk4');
  if (raw === 'verlet') return 'leapfrog';
  return raw in integratorRegistry ? (raw as IntegratorId) : 'rk4';
}

export function currentMode(): RunMode {
  const raw = state.mode;
  return raw === 'research' || raw === 'benchmark' || raw === 'education' || raw === 'performance' || raw === 'recovery'
    ? raw
    : 'demo';
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
  const baseState =
    system === 'triple'
      ? [
          numberFrom('th1', 2),
          numberFrom('th2', 2.5),
          numberFrom('th3', 1),
          numberFrom('iw1', 0),
          numberFrom('iw2', 0),
          numberFrom('iw3', 0)
        ]
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
    state: window.App?.state
      ? Array.from(window.App.state).slice(0, window.App.stateLen || window.App.state.length)
      : baseState,
    simTime: diag?.time ?? synced.simTime,
    hash: window.App?._stateHash ?? synced.hash
  };
  return snapshot;
}

export function toast(message: string, timeout = 2200): void {
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

/**
 * Re-render hook for the audit log. The runtime-diagnostics module registers
 * its panel renderer here so `shared` stays a leaf module (no upward imports).
 */
let auditRenderHook: (() => void) | null = null;

export function setAuditRenderHook(hook: () => void): void {
  auditRenderHook = hook;
}

export function record(message: string): void {
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  state.auditLog.unshift(line);
  state.auditLog = state.auditLog.slice(0, 80);
  auditRenderHook?.();
}

export function installStyle(id: string, css: string): void {
  // Adopted stylesheets are exempt from `style-src` (no 'unsafe-inline' in
  // the CSP), unlike runtime-injected <style> elements.
  installAdoptedStyle(id, css);
}

export function installStyles(): void {
  installStyle(
    'rg-style',
    `
.rg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rg-card{background:rgba(12,16,28,.78);border:1px solid var(--glass-stroke);border-radius:8px;padding:12px;box-shadow:var(--shadow-xs)}
.rg-card.rg-wide{grid-column:1/-1}.rg-title{font:800 9.5px/1.2 var(--font-display);letter-spacing:1.6px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px}
.rg-table{width:100%;border-collapse:collapse;font-size:10.5px}.rg-table td,.rg-table th{border:1px solid var(--glass-stroke);padding:6px;vertical-align:top}.rg-table th{color:var(--cyan);text-align:left;background:rgba(24,212,248,.04)}
.rg-log{white-space:pre-wrap;max-height:240px;overflow:auto;background:rgba(0,0,0,.22);border:1px solid var(--glass-stroke);border-radius:7px;padding:8px;font:10px/1.45 var(--font-mono);color:var(--text)}
.research-workbench{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
.research-workbench.research-compact{gap:6px}
.research-workbench.research-compact .research-card{padding:8px}
.research-workbench.research-compact .research-actions{margin:5px 0}
.research-workbench.research-compact .research-table-wrap{max-height:180px}
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
.rgv7-palette,.rgv8-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10000;align-items:flex-start;justify-content:center;padding:12vh 16px}.rgv7-palette.show,.rgv8-overlay.show{display:flex}.rgv7-palette-box,.rgv8-modal{width:min(660px,96vw);background:rgba(8,10,20,.98);border:1px solid rgba(24,212,248,.36);border-radius:12px;box-shadow:var(--shadow-lg);padding:12px}.rgv7-cmd-list{max-height:330px;overflow:auto;margin-top:8px}.rgv7-cmd{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;padding:8px 9px;border-radius:8px;margin:4px 0}.rgv7-cmd small{color:var(--muted);font-family:var(--font-mono)}
#rgv8Cmd{position:fixed;inset:0;z-index:13000;display:none;place-items:start center;padding:clamp(54px,10vh,96px) 16px 18px;background:radial-gradient(900px 520px at 50% 8%,rgba(24,212,248,.12),transparent 58%),linear-gradient(rgba(5,8,16,.74),rgba(3,5,12,.86));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}#rgv8Cmd.show{display:grid}#rgv8Cmd[hidden]{display:none!important}body.command-palette-open{overflow:hidden}.rgv8-cmd-panel{width:min(720px,calc(100vw - 28px));max-height:min(620px,calc(100dvh - 84px));display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:9px;padding:14px;border:1px solid transparent;border-radius:14px;background:linear-gradient(180deg,rgba(9,13,25,.98),rgba(6,9,18,.98)) padding-box,linear-gradient(135deg,rgba(24,212,248,.72),rgba(157,120,255,.36),rgba(255,122,44,.34)) border-box;box-shadow:var(--shadow-lg),0 0 80px -32px rgba(24,212,248,.75)}.rgv8-cmd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.rgv8-cmd-title{display:grid;gap:3px}.rgv8-cmd-title span{font:800 13px/1.1 var(--font-display);letter-spacing:2.4px;text-transform:uppercase;color:var(--fg-bright)}.rgv8-cmd-title small{font:10px/1.4 var(--font-mono);color:var(--muted)}.rgv8-cmd-close{flex:0 0 auto;min-width:44px;min-height:36px;padding:6px 9px;border-radius:7px;font:700 10px/1 var(--font-mono);text-transform:uppercase;color:var(--text);background:rgba(255,255,255,.035);border:1px solid var(--glass-stroke)}#rgv8Cmd input,#rgv7Palette input{width:100%;margin:0}#rgv8Cmd input{height:44px;border-radius:10px;border:1px solid rgba(24,212,248,.34);background:rgba(2,5,12,.86);color:var(--fg-bright);font:12px var(--font-mono);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}#rgv8Cmd input::placeholder{color:var(--muted)}.rgv8-cmd-status{min-height:14px;color:var(--muted);font:9px/1.4 var(--font-mono);letter-spacing:.08em;text-transform:uppercase}.rgv8-cmd-list{min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain;margin:0;display:grid;gap:6px;padding-right:2px}.rgv8-cmd-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;padding:10px 11px;border-radius:9px;margin:0;border:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.028);color:var(--text)}.rgv8-cmd-row:hover,.rgv8-cmd-row:focus-visible,.rgv8-cmd-row.is-active{border-color:rgba(24,212,248,.42);background:linear-gradient(120deg,rgba(24,212,248,.11),rgba(157,120,255,.055));color:var(--fg-bright)}.rgv8-cmd-copy{min-width:0;display:grid;gap:3px}.rgv8-cmd-copy strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:650 11px/1.25 var(--font-display);letter-spacing:.02em}.rgv8-cmd-copy em{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font:normal 9px/1.35 var(--font-mono)}.rgv8-cmd-row small{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-family:var(--font-mono);font-size:9px}.rgv8-cmd-empty{padding:16px;border:1px dashed var(--border-strong);border-radius:9px;color:var(--muted);text-align:center;font:11px var(--font-mono)}.rgv8-cmd-hint{color:var(--muted);font:10px/1.4 var(--font-mono);text-align:right}
#ueFloatingDiag{position:fixed;right:12px;bottom:12px;z-index:900;width:min(300px,90vw);background:rgba(6,8,12,.88);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:10px;box-shadow:0 18px 80px rgba(0,0,0,.45)}#ueFloatingDiag.collapsed{width:auto}#ueFloatingDiag.collapsed .ue-fbody{display:none}
@media(max-width:780px){.rg-grid,.ue-grid,.ri-grid{grid-template-columns:1fr}.fig-badge{display:none}}
@media(max-width:560px){#rgv8Cmd{padding:10px;place-items:center}.rgv8-cmd-panel{width:100%;max-height:calc(100dvh - 20px);padding:12px;border-radius:12px}.rgv8-cmd-title small{max-width:240px}.rgv8-cmd-row{min-height:52px}.rgv8-cmd-row small{max-width:110px}.rgv8-cmd-hint{text-align:center}#ueFloatingDiag{right:10px;bottom:78px;z-index:80;max-width:calc(100vw - 20px);max-height:34vh;overflow:auto}#ueFloatingDiag.collapsed{max-height:38px}.rail{z-index:960}.rail-submenu{z-index:980}}
`
  );
  installStyle(
    'riV4Style',
    '.ri-chip{display:inline-flex;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text)}.ri-chip.info{color:var(--cyan)}.ri-chip.good{color:var(--green)}.ri-chip.warn{color:var(--orange)}.ri-chip.bad{color:var(--red)}'
  );
  installStyle('rgv8-style', '');
  installStyle('sfv9-style', '');
  installStyle('finalPreservationStyle', '');
  installStyle('figStyle', '');
}

export function ensureCompatAnchors(): void {
  for (const id of COMPAT_ANCHOR_IDS) {
    if ($(id)) continue;
    const template = html('template', { id });
    template.textContent = 'Preserved by src/app/FeatureParityLayer.ts';
    document.body.append(template);
  }
}

export function setActiveTab(name: string): void {
  if (!canAccessAudienceTab(currentAudienceMode(), name)) return;
  const shell = (window as Window & { __modernShell?: { switchTo(tab: string): void } }).__modernShell;
  if (shell) {
    shell.switchTo(name);
    return;
  }
  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${name}`);
  });
  if (window.App) window.App.activeTab = name;
}

export function researchUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
