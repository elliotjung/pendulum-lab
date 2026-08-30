import { installAdoptedStyle } from '../ui/adoptedStyles';
import { LAB_CONTROLS_COMMITTED_EVENT } from './controlCommit';

export type AngleUnitPreference = 'rad' | 'deg';

export interface ParsedScientificValue {
  ok: boolean;
  value?: number;
  unit?: AngleUnitPreference;
  reason?: 'empty' | 'syntax' | 'range';
}

type AngularUnitPolicy = 'angle' | 'angular-velocity' | 'none';

interface PrecisionControlSpec {
  id: string;
  kind: 'angle' | 'angular-velocity' | 'scalar' | 'epsilon-exponent';
  label: { en: string; ko: string };
  min?: number;
  max?: number;
}

const STYLE_ID = 'precision-controls-style';
const PI_EXPRESSION = /^([+-]?)(?:(\d+(?:\.\d*)?|\.\d+)\s*\*?\s*)?pi(?:\s*\/\s*(\d+(?:\.\d*)?|\.\d+))?$/u;
const DECIMAL_EXPRESSION = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

const CONTROL_SPECS: readonly PrecisionControlSpec[] = [
  { id: 'th1', kind: 'angle', label: { en: 'Exact θ₁', ko: '정밀 θ₁' }, min: -Math.PI, max: Math.PI },
  { id: 'th2', kind: 'angle', label: { en: 'Exact θ₂', ko: '정밀 θ₂' }, min: -Math.PI, max: Math.PI },
  { id: 'th3', kind: 'angle', label: { en: 'Exact θ₃', ko: '정밀 θ₃' }, min: -Math.PI, max: Math.PI },
  { id: 'iw1', kind: 'angular-velocity', label: { en: 'Exact ω₁', ko: '정밀 ω₁' }, min: -64, max: 64 },
  { id: 'iw2', kind: 'angular-velocity', label: { en: 'Exact ω₂', ko: '정밀 ω₂' }, min: -64, max: 64 },
  { id: 'iw3', kind: 'angular-velocity', label: { en: 'Exact ω₃', ko: '정밀 ω₃' }, min: -64, max: 64 },
  { id: 'm1', kind: 'scalar', label: { en: 'Exact m₁', ko: '정밀 m₁' }, min: 0.1, max: 5 },
  { id: 'm2', kind: 'scalar', label: { en: 'Exact m₂', ko: '정밀 m₂' }, min: 0.1, max: 5 },
  { id: 'm3', kind: 'scalar', label: { en: 'Exact m₃', ko: '정밀 m₃' }, min: 0.1, max: 5 },
  { id: 'l1', kind: 'scalar', label: { en: 'Exact ℓ₁', ko: '정밀 ℓ₁' }, min: 0.3, max: 2 },
  { id: 'l2', kind: 'scalar', label: { en: 'Exact ℓ₂', ko: '정밀 ℓ₂' }, min: 0.3, max: 2 },
  { id: 'l3', kind: 'scalar', label: { en: 'Exact ℓ₃', ko: '정밀 ℓ₃' }, min: 0.3, max: 2 },
  { id: 'g', kind: 'scalar', label: { en: 'Exact g', ko: '정밀 g' }, min: 0, max: 20 },
  { id: 'gamma', kind: 'scalar', label: { en: 'Exact γ', ko: '정밀 γ' }, min: 0, max: 10 },
  { id: 'dt', kind: 'scalar', label: { en: 'Exact dt', ko: '정밀 dt' }, min: 0.0001, max: 0.05 },
  { id: 'ensEps', kind: 'epsilon-exponent', label: { en: 'Exact ε', ko: '정밀 ε' }, min: 1e-7, max: 1e-2 }
];

/**
 * Parse the deliberately small expression language used by precision fields.
 * It accepts one complete decimal/scientific token or one rational multiple
 * of pi; no evaluation, identifiers, operators, or executable syntax exist.
 */
export function parseScientificValue(
  source: string,
  options: {
    defaultUnit?: AngleUnitPreference;
    min?: number;
    max?: number;
    angularUnits?: AngularUnitPolicy;
  } = {}
): ParsedScientificValue {
  let text = source.trim().toLowerCase().replaceAll('π', 'pi').replaceAll('−', '-');
  if (!text) return { ok: false, reason: 'empty' };

  let explicitUnit: AngleUnitPreference | undefined;
  const unitMatch = /(?:\s*(deg|rad|°)(\/s)?)$/u.exec(text);
  if (unitMatch) {
    const policy = options.angularUnits ?? 'angle';
    if (policy === 'none' || (unitMatch[2] && policy !== 'angular-velocity')) return { ok: false, reason: 'syntax' };
    explicitUnit = unitMatch[1] === 'rad' ? 'rad' : 'deg';
    text = text.slice(0, unitMatch.index).trim();
  }
  // A single decimal comma is accepted for locales that expose it from a
  // virtual keyboard. Thousands separators remain intentionally unsupported.
  if (!text.includes('.') && (text.match(/,/gu)?.length ?? 0) === 1) text = text.replace(',', '.');

  const pi = PI_EXPRESSION.exec(text);
  let numeric: number;
  let impliedUnit: AngleUnitPreference | undefined;
  if (pi) {
    const sign = pi[1] === '-' ? -1 : 1;
    const coefficient = pi[2] === undefined ? 1 : Number(pi[2]);
    const denominator = pi[3] === undefined ? 1 : Number(pi[3]);
    if (!Number.isFinite(coefficient) || !Number.isFinite(denominator) || denominator === 0)
      return { ok: false, reason: 'syntax' };
    numeric = (sign * coefficient * Math.PI) / denominator;
    impliedUnit = 'rad';
  } else if (DECIMAL_EXPRESSION.test(text)) {
    numeric = Number(text);
  } else return { ok: false, reason: 'syntax' };

  const unit = explicitUnit ?? impliedUnit ?? options.defaultUnit;
  const value = unit === 'deg' ? (numeric * Math.PI) / 180 : numeric;
  if (!Number.isFinite(value)) return { ok: false, reason: 'range' };
  if (options.min !== undefined && value < options.min) return { ok: false, reason: 'range' };
  if (options.max !== undefined && value > options.max) return { ok: false, reason: 'range' };
  return { ok: true, value, ...(unit ? { unit } : {}) };
}

/** A concise decimal that round-trips through Number without slider rounding. */
export function formatPreciseDecimal(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0)) return '0';
  const nearestInteger = Math.round(value);
  if (Math.abs(value - nearestInteger) <= 8 * Number.EPSILON * Math.max(1, Math.abs(value)))
    return String(nearestInteger);
  // Number#toString is specified to emit the shortest decimal that round-trips
  // to the same IEEE-754 value. Do not cap significant digits here.
  return String(value);
}

export function displayedControlValue(
  canonicalValue: number,
  kind: PrecisionControlSpec['kind'],
  angleUnit: AngleUnitPreference
): number {
  if (kind === 'epsilon-exponent') return 10 ** canonicalValue;
  if ((kind === 'angle' || kind === 'angular-velocity') && angleUnit === 'deg') return (canonicalValue * 180) / Math.PI;
  return canonicalValue;
}

function projectionTolerance(first: number, second: number): number {
  return Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 64;
}

/** Preserve the authored float even when Chromium shortens a range readback. */
export function setPrecisionCanonicalValue(range: HTMLInputElement, value: number, displayValue?: number): void {
  range.dataset.precisionCanonical = String(value);
  range.value = String(value);
  const spec = CONTROL_SPECS.find((entry) => entry.id === range.id);
  const ownerDocument = range.ownerDocument;
  const companion = ownerDocument?.getElementById(`${range.id}Exact`) as HTMLInputElement | null;
  if (!spec || !companion || range.ownerDocument.activeElement === companion) return;
  const angleUnit =
    (ownerDocument.getElementById('angleUnit') as HTMLSelectElement | null)?.value === 'deg' ? 'deg' : 'rad';
  companion.value = formatPreciseDecimal(displayValue ?? displayedControlValue(value, spec.kind, angleUnit));
  clearError(companion);
}

/** Read the independent canonical float owned by a precision-managed range. */
export function precisionCanonicalValue(range: HTMLInputElement | null | undefined, fallback = Number.NaN): number {
  if (!range) return fallback;
  const projected = Number(range.value);
  const stored = Number(range.dataset.precisionCanonical);
  if (
    Number.isFinite(stored) &&
    Number.isFinite(projected) &&
    Math.abs(stored - projected) <= projectionTolerance(stored, projected)
  )
    return stored;
  if (Number.isFinite(projected)) {
    range.dataset.precisionCanonical = String(projected);
    return projected;
  }
  return fallback;
}

/**
 * Read the exact perturbation epsilon independently of the logarithmic range
 * projection. A real range interaction intentionally replaces the authored
 * epsilon with the value represented by its new log10 position; passive
 * projection/readback never does.
 */
export function epsilonCanonicalValue(range: HTMLInputElement | null | undefined, fallback = 1e-4): number {
  if (!range) return fallback;
  const exponent = precisionCanonicalValue(range, Math.log10(fallback));
  const stored = Number(range.dataset.precisionEpsilonCanonical);
  if (
    Number.isFinite(stored) &&
    stored > 0 &&
    Number.isFinite(exponent) &&
    Math.abs(Math.log10(stored) - exponent) <= projectionTolerance(Math.log10(stored), exponent)
  )
    return stored;
  const projected = 10 ** exponent;
  if (Number.isFinite(projected) && projected > 0) {
    range.dataset.precisionEpsilonCanonical = String(projected);
    return projected;
  }
  return fallback;
}

/** Store an exact epsilon while exposing only log10(epsilon) to the range. */
export function setEpsilonCanonicalValue(range: HTMLInputElement, epsilon: number): void {
  if (!Number.isFinite(epsilon) || epsilon <= 0) return;
  const exponent = Math.log10(epsilon);
  if (!Number.isFinite(exponent)) return;
  setPrecisionCanonicalValue(range, exponent, epsilon);
  range.dataset.precisionEpsilonCanonical = String(epsilon);
}

function canonicalControlValue(
  displayedValue: number,
  kind: PrecisionControlSpec['kind'],
  _angleUnit: AngleUnitPreference
): number {
  if (kind === 'epsilon-exponent') return Math.log10(displayedValue);
  // parseScientificValue already converts an explicit/default degree value to
  // the canonical radian representation used by the solver.
  return displayedValue;
}

function css(): string {
  return `
.precision-unit-row{display:grid;grid-template-columns:90px minmax(0,1fr);gap:7px;align-items:center;margin:5px 0 8px}
.precision-unit-row label{color:var(--muted);font-size:10.5px}
.precision-control-row>.val{display:none}
.precision-control-row .precision-entry{flex:0 0 104px;width:104px;min-width:82px;height:28px;padding:4px 7px;border:1px solid var(--border-strong);border-radius:6px;background:var(--panel2);color:var(--fg-bright);font:10.5px/1.2 var(--font-mono);font-variant-numeric:tabular-nums}
.precision-control-row .precision-entry:focus-visible{outline:2px solid var(--focus,#b7afff);outline-offset:2px}
.precision-control-row .precision-entry[aria-invalid="true"]{border-color:var(--red,#ff6b81)}
.precision-hint{grid-column:1/-1;margin:-2px 0 6px 97px;color:var(--muted);font-size:9px;line-height:1.4}
.precision-error{grid-column:1/-1;margin:-2px 0 6px 97px;color:var(--red,#ff8195);font-size:9px;line-height:1.4}
@media(max-width:780px){.precision-control-row{grid-template-columns:minmax(76px,92px) minmax(70px,1fr) minmax(86px,110px)}.precision-control-row .precision-entry{width:100%;min-width:0}.precision-hint,.precision-error{margin-left:0}}
@media(forced-colors:active){.precision-control-row .precision-entry{forced-color-adjust:auto;border:1px solid ButtonText;background:Field;color:FieldText}.precision-control-row .precision-entry[aria-invalid="true"]{outline:2px solid Mark}}
`;
}

function currentAngleUnit(): AngleUnitPreference {
  return (document.getElementById('angleUnit') as HTMLSelectElement | null)?.value === 'deg' ? 'deg' : 'rad';
}

function specUnit(spec: PrecisionControlSpec, angleUnit: AngleUnitPreference): string {
  if (spec.kind === 'angle') return angleUnit === 'deg' ? 'deg' : 'rad';
  if (spec.kind === 'angular-velocity') return angleUnit === 'deg' ? 'deg/s' : 'rad/s';
  if (spec.kind === 'epsilon-exponent') return 'canonical units';
  return '';
}

function parseForSpec(
  input: string,
  spec: PrecisionControlSpec,
  angleUnit: AngleUnitPreference
): ParsedScientificValue {
  if (spec.kind === 'epsilon-exponent')
    return parseScientificValue(input, {
      angularUnits: 'none',
      ...(spec.min === undefined ? {} : { min: spec.min }),
      ...(spec.max === undefined ? {} : { max: spec.max })
    });
  const angular = spec.kind === 'angle' || spec.kind === 'angular-velocity';
  const parsed = parseScientificValue(input, {
    angularUnits: spec.kind === 'angular-velocity' ? 'angular-velocity' : spec.kind === 'angle' ? 'angle' : 'none',
    ...(angular ? { defaultUnit: angleUnit } : {}),
    ...(spec.min === undefined ? {} : { min: spec.min }),
    ...(spec.max === undefined ? {} : { max: spec.max })
  });
  return parsed;
}

function dispatchPrecisionInput(range: HTMLInputElement, value: number, epsilon = false): void {
  const changed = !Object.is(epsilon ? epsilonCanonicalValue(range) : precisionCanonicalValue(range), value);
  if (epsilon) setEpsilonCanonicalValue(range, value);
  else setPrecisionCanonicalValue(range, value);
  if (changed) for (const type of ['input', 'change']) range.dispatchEvent(new Event(type, { bubbles: true }));
}

function mountUnitSelector(): HTMLSelectElement | null {
  const firstAngle = document.getElementById('th1')?.closest('.row');
  if (!firstAngle?.parentElement) return null;
  const existing = document.getElementById('angleUnit');
  if (existing instanceof HTMLSelectElement) return existing;
  const row = document.createElement('div');
  row.className = 'precision-unit-row';
  const label = document.createElement('label');
  label.htmlFor = 'angleUnit';
  label.dataset.en = 'Angle display';
  label.dataset.ko = '각도 표시';
  const select = document.createElement('select');
  select.id = 'angleUnit';
  select.dataset.testid = 'angle-unit';
  for (const [value, text] of [
    ['rad', 'Radians (rad)'],
    ['deg', 'Degrees (deg)']
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  row.append(label, select);
  firstAngle.parentElement.insertBefore(row, firstAngle);
  return select;
}

function localizeMountedControls(): void {
  const korean = document.documentElement.lang === 'ko';
  document.querySelectorAll<HTMLElement>('[data-en][data-ko]').forEach((element) => {
    element.textContent = korean ? (element.dataset.ko ?? '') : (element.dataset.en ?? '');
  });
  for (const spec of CONTROL_SPECS) {
    const input = document.getElementById(`${spec.id}Exact`) as HTMLInputElement | null;
    if (!input) continue;
    const unit = specUnit(spec, currentAngleUnit());
    input.setAttribute('aria-label', `${korean ? spec.label.ko : spec.label.en}${unit ? ` (${unit})` : ''}`);
    if (spec.kind === 'angle' || spec.kind === 'angular-velocity') {
      const label = document.querySelector<HTMLElement>(`label[for="${spec.id}"]`);
      const symbol = spec.label.en.replace('Exact ', '');
      if (label) {
        label.textContent = `${symbol} (${unit})`;
        label.dataset.tip = korean
          ? `${symbol}의 초기값을 ${unit} 단위로 표시합니다. 내부 계산과 공유 상태는 rad${spec.kind === 'angular-velocity' ? '/s' : ''}를 사용합니다.`
          : `Initial ${symbol} displayed in ${unit}. Internal calculations and shared state use rad${spec.kind === 'angular-velocity' ? '/s' : ''}.`;
      }
    }
  }
}

function validationText(spec: PrecisionControlSpec): string {
  const korean = document.documentElement.lang === 'ko';
  const angleUnit = currentAngleUnit();
  const unit = specUnit(spec, angleUnit);
  const displayBound = (value: number) =>
    spec.kind === 'angle' || spec.kind === 'angular-velocity'
      ? formatPreciseDecimal(displayedControlValue(value, spec.kind, angleUnit))
      : formatPreciseDecimal(value);
  const range =
    spec.min !== undefined && spec.max !== undefined
      ? ` ${displayBound(spec.min)}–${displayBound(spec.max)} ${unit}`
      : '';
  return korean
    ? `완전한 숫자 또는 π 식을 입력하세요.${range ? ` 허용 범위:${range}.` : ''}`
    : `Enter a complete number or π expression.${range ? ` Allowed range:${range}.` : ''}`;
}

function clearError(input: HTMLInputElement): void {
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-errormessage');
  document.getElementById(`${input.id}Error`)?.remove();
}

function showError(input: HTMLInputElement, spec: PrecisionControlSpec): void {
  input.setAttribute('aria-invalid', 'true');
  const errorId = `${input.id}Error`;
  input.setAttribute('aria-errormessage', errorId);
  let error = document.getElementById(errorId);
  if (!error) {
    error = document.createElement('div');
    error.id = errorId;
    error.className = 'precision-error';
    error.setAttribute('role', 'status');
    input.closest('.row')?.insertAdjacentElement('afterend', error);
  }
  error.textContent = validationText(spec);
}

function installCompanion(spec: PrecisionControlSpec): void {
  const range = document.getElementById(spec.id);
  if (!(range instanceof HTMLInputElement) || range.type !== 'range') return;
  if (document.getElementById(`${spec.id}Exact`)) return;
  const row = range.closest<HTMLElement>('.row');
  if (!row) return;
  row.classList.add('precision-control-row');
  // Keep the browser/deep-link boundary identical to the canonical precision
  // contract. (ensEps is exceptional: its range stores log10(epsilon).)
  if (spec.kind !== 'epsilon-exponent') {
    if (spec.min !== undefined) range.min = String(spec.min);
    if (spec.max !== undefined) range.max = String(spec.max);
  }
  // A range control may otherwise expose an off-step exact value as invalid or
  // sanitize it in a browser implementation. Keep its authored step solely as
  // a keyboard increment and let the canonical value be any finite in-range
  // float.
  const authoredStep = Number(range.dataset.precisionKeyboardStep ?? range.step);
  range.dataset.precisionKeyboardStep = Number.isFinite(authoredStep) && authoredStep > 0 ? String(authoredStep) : '1';
  range.dataset.precisionCanonical = range.value;
  if (spec.kind === 'epsilon-exponent') epsilonCanonicalValue(range);
  range.step = 'any';
  const input = document.createElement('input');
  input.id = `${spec.id}Exact`;
  input.className = 'precision-entry';
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dataset.precisionFor = spec.id;
  input.dataset.testid = `precision-${spec.id}`;
  const output = row.querySelector('.val');
  row.insertBefore(input, output);

  const displayed = (): number =>
    spec.kind === 'epsilon-exponent'
      ? epsilonCanonicalValue(range)
      : displayedControlValue(precisionCanonicalValue(range), spec.kind, currentAngleUnit());
  const sync = (): void => {
    const value = displayed();
    if (!Number.isFinite(value) || document.activeElement === input) return;
    input.value = formatPreciseDecimal(value);
    clearError(input);
  };
  const commit = (): boolean => {
    const parsed = parseForSpec(input.value, spec, currentAngleUnit());
    if (!parsed.ok || parsed.value === undefined) {
      showError(input, spec);
      return false;
    }
    const canonical = canonicalControlValue(parsed.value, spec.kind, currentAngleUnit());
    if (!Number.isFinite(canonical)) {
      showError(input, spec);
      return false;
    }
    clearError(input);
    dispatchPrecisionInput(
      range,
      spec.kind === 'epsilon-exponent' ? parsed.value : canonical,
      spec.kind === 'epsilon-exponent'
    );
    input.value = formatPreciseDecimal(displayed());
    return true;
  };
  input.addEventListener('change', () => void commit());
  input.addEventListener('blur', () => {
    if (!commit()) sync();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (commit()) input.select();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const parsed = parseForSpec(input.value, spec, currentAngleUnit());
    const current =
      parsed.ok && parsed.value !== undefined
        ? canonicalControlValue(parsed.value, spec.kind, currentAngleUnit())
        : precisionCanonicalValue(range);
    const sliderStep = Number(range.dataset.precisionKeyboardStep);
    let step = Number.isFinite(sliderStep) && sliderStep > 0 ? sliderStep : 1;
    if (spec.kind === 'epsilon-exponent') step = 0.1;
    if (event.shiftKey) step *= 10;
    if (event.altKey) step *= 0.1;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const steppedCanonical = current + direction * step;
    input.value = formatPreciseDecimal(displayedControlValue(steppedCanonical, spec.kind, currentAngleUnit()));
    void commit();
  });
  range.addEventListener('input', () => {
    if (spec.kind === 'epsilon-exponent') epsilonCanonicalValue(range);
    else precisionCanonicalValue(range);
    sync();
  });
  range.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const current = precisionCanonicalValue(range);
    const baseStep = Number(range.dataset.precisionKeyboardStep);
    if (!Number.isFinite(current) || !Number.isFinite(baseStep) || baseStep <= 0) return;
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
    const minimum = Number(range.min);
    const maximum = Number(range.max);
    const next = Math.max(
      Number.isFinite(minimum) ? minimum : -Number.MAX_VALUE,
      Math.min(Number.isFinite(maximum) ? maximum : Number.MAX_VALUE, current + direction * baseStep * multiplier)
    );
    dispatchPrecisionInput(range, next);
  });
  sync();
}

function syncAllCompanions(): void {
  for (const spec of CONTROL_SPECS) {
    const range = document.getElementById(spec.id) as HTMLInputElement | null;
    const input = document.getElementById(`${spec.id}Exact`) as HTMLInputElement | null;
    if (!range || !input || document.activeElement === input) continue;
    const displayed =
      spec.kind === 'epsilon-exponent'
        ? epsilonCanonicalValue(range)
        : displayedControlValue(precisionCanonicalValue(range), spec.kind, currentAngleUnit());
    if (Number.isFinite(displayed)) input.value = formatPreciseDecimal(displayed);
  }
  localizeMountedControls();
}

let installed = false;

/** Mount paired scientific text entry beside every core Lab range control. */
export function installPrecisionControls(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  installAdoptedStyle(STYLE_ID, css());
  const unit = mountUnitSelector();
  for (const spec of CONTROL_SPECS) installCompanion(spec);
  unit?.addEventListener('change', syncAllCompanions);
  document.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, syncAllCompanions);
  document.addEventListener('pendulum:ui-locale-changed', syncAllCompanions);
  syncAllCompanions();
}
