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
import { activateModalSurface, deactivateModalSurface, trapModalFocus } from './modalSurface';

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
.rb-badge{display:inline-flex;align-items:center;gap:4px;border-radius:5px;padding:2px 7px;font:600 8.5px/1.4 var(--font-mono,monospace);letter-spacing:0;border:1px solid;vertical-align:middle;margin-right:6px;cursor:pointer;background:var(--workbench-raised,#0b0e17)}
.rb-badge:focus-visible{outline:2px solid var(--focus,#b7afff);outline-offset:2px}
.rb-visual-only{color:var(--workbench-text-muted,#737e92);border-color:var(--workbench-border-strong,rgba(205,214,245,.14))}
.rb-finite-time-estimate{color:var(--workbench-live,#72d6e5);border-color:color-mix(in srgb,var(--workbench-live,#72d6e5) 44%,transparent)}
.rb-validated{color:var(--workbench-green,#58c99b);border-color:color-mix(in srgb,var(--workbench-green,#58c99b) 44%,transparent)}
.rb-publication-ready{color:var(--workbench-info,#7ca8f6);border-color:color-mix(in srgb,var(--workbench-info,#7ca8f6) 44%,transparent)}
.rb-caveat{color:var(--workbench-amber,#e0ae68);border-color:color-mix(in srgb,var(--workbench-amber,#e0ae68) 44%,transparent)}
.trust-inspector-backdrop{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;overflow:hidden;overscroll-behavior:contain;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(4,6,10,.78)}
.trust-inspector-panel{width:min(680px,100%);max-height:min(calc(100dvh - 36px),var(--ui-viewport-height,100dvh));overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;background:var(--workbench-elevated,#151a28);box-shadow:0 24px 56px rgba(0,0,0,.36);color:var(--workbench-text-secondary,#a8b0c2);padding:16px}
.trust-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid var(--workbench-border,rgba(205,214,245,.08));padding-bottom:10px;margin-bottom:10px}
.trust-inspector-kicker{font:600 9px/1.2 var(--font-mono,monospace);color:var(--workbench-live,#72d6e5);margin-bottom:5px}
.trust-inspector-title{font:650 18px/1.25 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8)}
.trust-inspector-close{width:44px;height:44px;min-width:44px;min-height:44px;border-radius:8px;padding:0;touch-action:manipulation}
.trust-inspector-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 12px;font-size:12px;line-height:1.45}
.trust-inspector-label{font:600 10px/1.45 var(--font-mono,monospace);color:var(--workbench-text-muted,#737e92)}
.trust-inspector-value{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
.trust-inspector-params{display:flex;flex-wrap:wrap;gap:6px}
.trust-inspector-param{border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:5px;padding:3px 6px;background:var(--workbench-panel,#10141f);font:10px/1.35 var(--font-mono,monospace)}
@media(max-width:560px){.trust-inspector-backdrop{padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}.trust-inspector-panel{max-height:min(calc(100dvh - 20px),var(--ui-viewport-height,100dvh));padding:14px}.trust-inspector-grid{grid-template-columns:1fr}.trust-inspector-label{margin-top:6px}}
@media(forced-colors:active){.trust-inspector-backdrop,.trust-inspector-panel{forced-color-adjust:auto;background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}}
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

let inspectorReturnFocus: HTMLElement | null = null;

function closeTrustInspector(backdrop: HTMLElement, restoreFocus = true): void {
  deactivateModalSurface(backdrop);
  backdrop.remove();
  const target = inspectorReturnFocus;
  inspectorReturnFocus = null;
  if (restoreFocus && target?.isConnected) queueMicrotask(() => target.focus());
}

export function openTrustInspector(data: NormalizedTrustInspection): void {
  if (typeof document === 'undefined') return;
  ensureBadgeStyle();
  const active = document.activeElement;
  const previous = document.querySelector<HTMLElement>('.trust-inspector-backdrop');
  if (previous) closeTrustInspector(previous, false);
  inspectorReturnFocus = active instanceof HTMLElement && !previous?.contains(active) ? active : null;
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
  title.id = 'trustInspectorTitle';
  title.textContent = data.title;
  panel.removeAttribute('aria-label');
  panel.setAttribute('aria-labelledby', title.id);
  titleBox.append(kicker, title);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'trust-inspector-close';
  close.setAttribute('aria-label', 'Close Trust Inspector');
  close.textContent = '×';
  close.addEventListener('click', () => closeTrustInspector(backdrop));
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
    if (event.target === backdrop) closeTrustInspector(backdrop);
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeTrustInspector(backdrop);
    } else if (event.key === 'Tab') {
      trapModalFocus(event, backdrop);
    }
  });
  document.body.append(backdrop);
  activateModalSurface(backdrop);
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
  span.setAttribute('aria-haspopup', 'dialog');
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

const attachedBadgeIdentity = new WeakMap<HTMLElement, string>();

function badgeIdentity(level: ResultBadgeLevel, note?: string, inspection?: TrustInspection): string {
  const trust = normalizeTrustInspection(level, note, inspection);
  return JSON.stringify({
    ...trust,
    parameters: Object.fromEntries(
      Object.entries(trust.parameters).sort(([left], [right]) => left.localeCompare(right))
    )
  });
}

/**
 * Attach (or update) the badge in front of a status element. Identical
 * re-renders retain the existing node so a focused badge is not discarded by
 * the periodic diagnostics refresh.
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
  const identity = badgeIdentity(level, note, inspection);
  if (existing instanceof HTMLElement && existing.classList.contains('rb-badge')) {
    if (attachedBadgeIdentity.get(existing) === identity) return;
    existing.remove();
  }
  const badge = badgeElement(level, note, inspection);
  attachedBadgeIdentity.set(badge, identity);
  target.before(badge);
}
