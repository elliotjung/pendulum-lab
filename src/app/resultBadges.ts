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
    description: 'Checked against an independent reference (analytic limit, cross-integrator, symbolic derivation, or dt-halving).'
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
export function classifyEstimate(options: { uncertainty?: number | null; validityProblem?: string | null }): ResultBadgeLevel {
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
.rb-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;font:700 8.5px/1.4 var(--font-mono,monospace);letter-spacing:.8px;border:1px solid;vertical-align:middle;margin-right:6px;cursor:help}
.rb-visual-only{color:#8fa3c2;border-color:rgba(143,163,194,.45);background:rgba(143,163,194,.08)}
.rb-finite-time-estimate{color:#18d4f8;border-color:rgba(24,212,248,.45);background:rgba(24,212,248,.07)}
.rb-validated{color:#38e88c;border-color:rgba(56,232,140,.5);background:rgba(56,232,140,.07)}
.rb-publication-ready{color:#f0c419;border-color:rgba(240,196,25,.55);background:rgba(240,196,25,.08)}
.rb-caveat{color:#ff7a2c;border-color:rgba(255,122,44,.55);background:rgba(255,122,44,.08)}
`;

function ensureBadgeStyle(): void {
  if (typeof document === 'undefined' || hasAdoptedStyle(BADGE_STYLE_ID)) return;
  installAdoptedStyle(BADGE_STYLE_ID, BADGE_CSS);
}

/** Build a badge element (tooltip carries the description + optional note). */
export function badgeElement(level: ResultBadgeLevel, note?: string): HTMLSpanElement {
  ensureBadgeStyle();
  const meta = RESULT_BADGES[level];
  const span = document.createElement('span');
  span.className = `rb-badge rb-${level}`;
  span.textContent = meta.label;
  span.title = note ? `${meta.description}\n${note}` : meta.description;
  span.setAttribute('data-badge-level', level);
  return span;
}

/**
 * Attach (or update) the badge in front of a status element. Idempotent per
 * element: re-attaching replaces the previous badge.
 */
export function attachBadge(statusElementId: string, level: ResultBadgeLevel, note?: string): void {
  if (typeof document === 'undefined') return;
  const target = document.getElementById(statusElementId);
  if (!target) return;
  const existing = target.previousElementSibling;
  if (existing instanceof HTMLElement && existing.classList.contains('rb-badge')) existing.remove();
  target.before(badgeElement(level, note));
}
