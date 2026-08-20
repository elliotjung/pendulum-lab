export interface NumericControlContract {
  min?: number;
  max?: number;
  step?: number;
  stepBase?: number;
}

export interface NumericControlParseResult {
  ok: boolean;
  value?: number;
  reason?: 'syntax' | 'range' | 'step';
}

// URL controls are a public input boundary. Number.parseFloat accepts prefixes
// such as `1abc`; this grammar accepts one complete decimal/scientific token.
const DECIMAL_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const NUMERIC_CONTROL_IDS = [
  'th1',
  'th2',
  'th3',
  'iw1',
  'iw2',
  'iw3',
  'm1',
  'm2',
  'm3',
  'l1',
  'l2',
  'l3',
  'g',
  'gamma',
  'dt',
  'speed',
  'spf'
] as const;

export function parseNumericControlParam(
  raw: string,
  contract: NumericControlContract = {}
): NumericControlParseResult {
  if (!DECIMAL_TOKEN.test(raw)) return { ok: false, reason: 'syntax' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, reason: 'range' };
  if (contract.min !== undefined && value < contract.min) return { ok: false, reason: 'range' };
  if (contract.max !== undefined && value > contract.max) return { ok: false, reason: 'range' };
  if (contract.step !== undefined && contract.step > 0) {
    const base = contract.stepBase ?? contract.min ?? 0;
    const steps = (value - base) / contract.step;
    const nearest = Math.round(steps);
    const tolerance = 1e-9 * Math.max(1, Math.abs(steps));
    if (Math.abs(steps - nearest) > tolerance) return { ok: false, reason: 'step' };
  }
  return { ok: true, value };
}

export function numericInputContract(input: HTMLInputElement): NumericControlContract {
  const finiteAttribute = (value: string): number | undefined => {
    if (value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  };
  const min = finiteAttribute(input.min);
  const max = finiteAttribute(input.max);
  // `step` controls keyboard/spinner increments; it is not a serialization
  // boundary. Several canonical presets and Landing links intentionally use
  // meaningful values (for example g=9.81) that are off the slider's visual
  // increment grid. URL inputs therefore enforce syntax and physical range,
  // while preserving the authored value exactly.
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max })
  };
}

/** Replace accepted legacy landing aliases without adding a history entry. */
export function canonicalizeVelocityAliases(href: string, accepted: ReadonlyMap<'w1' | 'w2', string>): string | null {
  const url = new URL(href);
  let changed = false;
  for (const [legacy, canonical] of [
    ['w1', 'iw1'],
    ['w2', 'iw2']
  ] as const) {
    if (!url.searchParams.has(legacy)) continue;
    if (!url.searchParams.has(canonical)) {
      const value = accepted.get(legacy);
      if (value === undefined) continue;
      url.searchParams.set(canonical, value);
    }
    url.searchParams.delete(legacy);
    changed = true;
  }
  return changed ? url.toString() : null;
}

export interface AppliedNumericControlParams {
  acceptedCount: number;
  canonicalHref: string | null;
}

function isNumericInput(value: unknown): value is HTMLInputElement {
  if (typeof HTMLInputElement !== 'undefined') return value instanceof HTMLInputElement;
  // Headless contract tests intentionally provide DOM-shaped controls without
  // installing a browser realm. Production always takes the strict branch.
  return Boolean(value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string');
}

/** Validate and apply the complete public numeric deep-link contract. */
export function applyNumericControlParams(
  href: string,
  root: Pick<Document, 'getElementById'>,
  apply: (id: string, value: number) => void
): AppliedNumericControlParams {
  const url = new URL(href);
  const acceptedAliases = new Map<'w1' | 'w2', string>();
  let acceptedCount = 0;
  for (const id of NUMERIC_CONTROL_IDS) {
    const legacyAlias = id === 'iw1' ? 'w1' : id === 'iw2' ? 'w2' : null;
    const canonicalValue = url.searchParams.get(id);
    const value = canonicalValue ?? (legacyAlias ? url.searchParams.get(legacyAlias) : null);
    if (value === null) continue;
    const input = root.getElementById(id);
    if (!isNumericInput(input)) continue;
    const parsed = parseNumericControlParam(value, numericInputContract(input));
    if (!parsed.ok || parsed.value === undefined) continue;
    apply(id, parsed.value);
    acceptedCount += 1;
    if (canonicalValue === null && legacyAlias) acceptedAliases.set(legacyAlias, value);
  }
  return { acceptedCount, canonicalHref: canonicalizeVelocityAliases(href, acceptedAliases) };
}
