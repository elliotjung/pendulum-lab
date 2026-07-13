/**
 * Result-credibility badges. Every quantitative output in the app carries one
 * of five levels so a reader always knows how much weight a number can bear:
 *
 * - `visual-only`          — rendering/animation; nothing quantitative claimed.
 * - `finite-time-estimate` — a numerical estimate over a finite horizon
 *                            (Lyapunov, FTLE, RQA, 0–1 K…); converges only in
 *                            the infinite-time limit and carries an uncertainty.
 * - `validated`            — checked against an independent reference
 *                            (analytic limit, cross-integrator, SymPy, dt-halving).
 * - `publication-ready`    — validated AND reproducible: parameters, dt,
 *                            tolerance, script and hash are exported with it.
 * - `caveat`               — a documented limitation applies (chart limit,
 *                            slack-phase hybrid events, low taut fraction…).
 */

import { hasAdoptedStyle, installAdoptedStyle } from '../ui/adoptedStyles';

export type ResultBadgeLevel = 'visual-only' | 'finite-time-estimate' | 'validated' | 'publication-ready' | 'caveat';

export interface ResultBadge {
  level: ResultBadgeLevel;
  label: string;
  description: string;
}

export type TrustFieldValue = string | number | boolean | null | undefined;

export interface TrustInspection {
  /** Human-facing result name, e.g. "Floquet period-1 orbit". */
  title?: string;
  /** Where the value came from: UI tab, worker job, CLI, validation suite. */
  source?: string;
  /** Reproducible parameter/tolerance snapshot for the displayed number. */
  parameters?: Record<string, TrustFieldValue>;
  /** Uncertainty statement or estimator used for the output. */
  uncertainty?: string;
  /** Independent validation anchor: analytic, literature, SymPy/SciPy, CPU reference. */
  externalValidation?: string;
  /** Exact command or test that regenerates the value. */
  reproduce?: string;
  /** Caveat / domain of validity. */
  caveat?: string;
  /** Artifact file or report carrying the same result. */
  artifact?: string;
  /** Content/provenance hash when available. */
  hash?: string;
  /** Free-form context shown after the standard badge description. */
  note?: string;
}

export interface NormalizedTrustInspection extends Required<
  Pick<
    TrustInspection,
    'title' | 'source' | 'uncertainty' | 'externalValidation' | 'reproduce' | 'caveat' | 'artifact' | 'hash' | 'note'
  >
> {
  level: ResultBadgeLevel;
  badgeLabel: string;
  badgeDescription: string;
  parameters: Record<string, string>;
}

export const RESULT_BADGES: Record<ResultBadgeLevel, ResultBadge> = {
  'visual-only': {
    level: 'visual-only',
    label: 'VISUAL ONLY',
    description: 'Animation/rendering output; no quantitative claim is made.'
  },
  'finite-time-estimate': {
    level: 'finite-time-estimate',
    label: 'FINITE-TIME ESTIMATE',
    description: 'Numerical estimate over a finite horizon; quote with its uncertainty and horizon.'
  },
  validated: {
    level: 'validated',
    label: 'VALIDATED',
    description:
      'Checked against an independent reference (analytic limit, cross-integrator, symbolic derivation, or dt-halving).'
  },
  'publication-ready': {
    level: 'publication-ready',
    label: 'PUBLICATION-READY',
    description: 'Validated and fully reproducible: parameters, dt, tolerance, script and hash ship with the artifact.'
  },
  caveat: {
    level: 'caveat',
    label: 'CAVEAT',
    description: 'A documented limitation applies; read the accompanying note before quoting.'
  }
};

/**
 * Classify a finite-time chaos estimate: it stays `finite-time-estimate`
 * unless a validity problem demotes it to `caveat`.
 */
export function classifyEstimate(options: {
  uncertainty?: number | null;
  validityProblem?: string | null;
}): ResultBadgeLevel {
  if (options.validityProblem) return 'caveat';
  return 'finite-time-estimate';
}

/** Classify a validation-suite outcome. */
export function classifyValidation(passed: number, failed: number): ResultBadgeLevel {
  if (failed > 0) return 'caveat';
  return passed > 0 ? 'validated' : 'visual-only';
}

/**
 * Classify an export artifact: publication-ready needs reproducibility info
 * (hash + numeric provenance) on top of validation.
 */
export function classifyExport(options: { hash?: string | null; validated?: boolean }): ResultBadgeLevel {
  if (options.hash && options.validated) return 'publication-ready';
  if (options.hash) return 'finite-time-estimate';
  return 'visual-only';
}

const BADGE_STYLE_ID = 'result-badge-style';
const BADGE_CSS = `
.rb-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;font:700 8.5px/1.4 var(--font-mono,monospace);letter-spacing:0;border:1px solid;vertical-align:middle;margin-right:6px;cursor:pointer}
.rb-badge:focus-visible{outline:2px solid rgba(24,212,248,.75);outline-offset:2px}
.rb-visual-only{color:#8fa3c2;border-color:rgba(143,163,194,.45);background:rgba(143,163,194,.08)}
.rb-finite-time-estimate{color:#18d4f8;border-color:rgba(24,212,248,.45);background:rgba(24,212,248,.07)}
.rb-validated{color:#38e88c;border-color:rgba(56,232,140,.5);background:rgba(56,232,140,.07)}
.rb-publication-ready{color:#f0c419;border-color:rgba(240,196,25,.55);background:rgba(240,196,25,.08)}
.rb-caveat{color:#ff7a2c;border-color:rgba(255,122,44,.55);background:rgba(255,122,44,.08)}
.trust-inspector-backdrop{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:18px;background:rgba(2,5,12,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.trust-inspector-panel{width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 36px);overflow:auto;border:1px solid rgba(24,212,248,.34);border-radius:12px;background:rgba(7,10,20,.98);box-shadow:0 28px 90px rgba(0,0,0,.48);color:var(--text,#dfe9ff);padding:16px}
.trust-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(143,163,194,.2);padding-bottom:10px;margin-bottom:10px}
.trust-inspector-kicker{font:700 9px/1.2 var(--font-mono,monospace);color:var(--cyan,#18d4f8);text-transform:uppercase;letter-spacing:0;margin-bottom:5px}
.trust-inspector-title{font:700 18px/1.25 var(--font-display,system-ui);color:var(--fg-bright,#fff)}
.trust-inspector-close{width:32px;height:32px;border-radius:8px;padding:0}
.trust-inspector-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 12px;font-size:12px;line-height:1.45}
.trust-inspector-label{font:700 10px/1.45 var(--font-mono,monospace);color:var(--muted,#8fa3c2);text-transform:uppercase}
.trust-inspector-value{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
.trust-inspector-params{display:flex;flex-wrap:wrap;gap:6px}
.trust-inspector-param{border:1px solid rgba(143,163,194,.24);border-radius:7px;padding:3px 6px;background:rgba(255,255,255,.035);font:10px/1.35 var(--font-mono,monospace)}
@media(max-width:560px){.trust-inspector-grid{grid-template-columns:1fr}.trust-inspector-label{margin-top:6px}}
`;

function ensureBadgeStyle(): void {
  if (typeof document === 'undefined' || hasAdoptedStyle(BADGE_STYLE_ID)) return;
  installAdoptedStyle(BADGE_STYLE_ID, BADGE_CSS);
}

function stringifyField(value: TrustFieldValue): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? (Number.isFinite(value) ? String(value) : 'non-finite') : String(value);
}

export function normalizeTrustInspection(
  level: ResultBadgeLevel,
  note?: string,
  inspection: TrustInspection = {}
): NormalizedTrustInspection {
  const meta = RESULT_BADGES[level];
  const parameters: Record<string, string> = {};
  for (const [key, value] of Object.entries(inspection.parameters ?? {})) {
    const rendered = stringifyField(value);
    if (rendered) parameters[key] = rendered;
  }
  return {
    level,
    badgeLabel: meta.label,
    badgeDescription: meta.description,
    title: inspection.title ?? meta.label,
    source: inspection.source ?? 'Pendulum Lab UI',
    parameters,
    uncertainty:
      inspection.uncertainty ??
      (level === 'finite-time-estimate'
        ? 'Finite-horizon estimate; quote with its displayed settings and uncertainty.'
        : 'No additional uncertainty field supplied.'),
    externalValidation:
      inspection.externalValidation ??
      (level === 'validated' || level === 'publication-ready'
        ? meta.description
        : 'No independent validation attached to this badge.'),
    reproduce: inspection.reproduce ?? 'Use the active tab/export or the nearest README command for this result.',
    caveat: inspection.caveat ?? (level === 'caveat' ? meta.description : 'No extra caveat supplied.'),
    artifact: inspection.artifact ?? '',
    hash: inspection.hash ?? '',
    note: inspection.note ?? note ?? ''
  };
}

export function trustInspectionSummary(data: NormalizedTrustInspection): string {
  const bits = [data.title, data.source, data.reproduce, data.caveat].filter(Boolean);
  return bits.join(' · ');
}

function appendField(grid: HTMLElement, label: string, value: string | HTMLElement): void {
  const key = document.createElement('div');
  key.className = 'trust-inspector-label';
  key.textContent = label;
  const val = document.createElement('div');
  val.className = 'trust-inspector-value';
  if (typeof value === 'string') val.textContent = value || '—';
  else val.append(value);
  grid.append(key, val);
}

function paramsElement(params: Record<string, string>): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'trust-inspector-params';
  const entries = Object.entries(params);
  if (!entries.length) {
    wrap.textContent = '—';
    return wrap;
  }
  for (const [key, value] of entries) {
    const item = document.createElement('span');
    item.className = 'trust-inspector-param';
    item.textContent = `${key}=${value}`;
    wrap.append(item);
  }
  return wrap;
}

export function openTrustInspector(data: NormalizedTrustInspection): void {
  if (typeof document === 'undefined') return;
  ensureBadgeStyle();
  document.querySelector('.trust-inspector-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'trust-inspector-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const panel = document.createElement('section');
  panel.className = 'trust-inspector-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `Trust Inspector: ${data.title}`);

  const head = document.createElement('div');
  head.className = 'trust-inspector-head';
  const titleBox = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'trust-inspector-kicker';
  kicker.textContent = data.badgeLabel;
  const title = document.createElement('div');
  title.className = 'trust-inspector-title';
  title.textContent = data.title;
  titleBox.append(kicker, title);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'trust-inspector-close';
  close.setAttribute('aria-label', 'Close Trust Inspector');
  close.textContent = '×';
  close.addEventListener('click', () => backdrop.remove());
  head.append(titleBox, close);

  const grid = document.createElement('div');
  grid.className = 'trust-inspector-grid';
  appendField(grid, 'Meaning', data.badgeDescription);
  appendField(grid, 'Source', data.source);
  appendField(grid, 'Parameters', paramsElement(data.parameters));
  appendField(grid, 'Uncertainty', data.uncertainty);
  appendField(grid, 'Validation', data.externalValidation);
  appendField(grid, 'Reproduce', data.reproduce);
  appendField(grid, 'Caveat', data.caveat);
  if (data.artifact) appendField(grid, 'Artifact', data.artifact);
  if (data.hash) appendField(grid, 'Hash', data.hash);
  if (data.note) appendField(grid, 'Note', data.note);

  panel.append(head, grid);
  backdrop.append(panel);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') backdrop.remove();
  });
  document.body.append(backdrop);
  close.focus();
}

/** Build a badge element (tooltip carries the description + optional note). */
export function badgeElement(level: ResultBadgeLevel, note?: string, inspection?: TrustInspection): HTMLSpanElement {
  ensureBadgeStyle();
  const meta = RESULT_BADGES[level];
  const trust = normalizeTrustInspection(level, note, inspection);
  const span = document.createElement('span');
  span.className = `rb-badge rb-${level}`;
  span.textContent = meta.label;
  span.title = note ? `${meta.description}\n${note}` : meta.description;
  span.setAttribute('data-badge-level', level);
  span.setAttribute('role', 'button');
  span.setAttribute('tabindex', '0');
  span.setAttribute('aria-label', `Open Trust Inspector: ${trustInspectionSummary(trust)}`);
  span.addEventListener('click', () => openTrustInspector(trust));
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTrustInspector(trust);
    }
  });
  return span;
}

/**
 * Attach (or update) the badge in front of a status element. Idempotent per
 * element: re-attaching replaces the previous badge.
 */
export function attachBadge(
  statusElementId: string,
  level: ResultBadgeLevel,
  note?: string,
  inspection?: TrustInspection
): void {
  if (typeof document === 'undefined') return;
  const target = document.getElementById(statusElementId);
  if (!target) return;
  const existing = target.previousElementSibling;
  if (existing instanceof HTMLElement && existing.classList.contains('rb-badge')) existing.remove();
  target.before(badgeElement(level, note, inspection));
}
