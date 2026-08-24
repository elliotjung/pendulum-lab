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
  rejected: RejectedNumericControlParam[];
}

export interface RejectedNumericControlParam {
  id: (typeof NUMERIC_CONTROL_IDS)[number];
  source: 'canonical' | 'legacy';
  value: string;
  reason: NonNullable<NumericControlParseResult['reason']>;
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
  const rejected: RejectedNumericControlParam[] = [];
  for (const id of NUMERIC_CONTROL_IDS) {
    const legacyAlias = id === 'iw1' ? 'w1' : id === 'iw2' ? 'w2' : null;
    const canonicalValue = url.searchParams.get(id);
    const value = canonicalValue ?? (legacyAlias ? url.searchParams.get(legacyAlias) : null);
    if (value === null) continue;
    const input = root.getElementById(id);
    if (!isNumericInput(input)) continue;
    const parsed = parseNumericControlParam(value, numericInputContract(input));
    if (!parsed.ok || parsed.value === undefined) {
      rejected.push({
        id,
        source: canonicalValue === null ? 'legacy' : 'canonical',
        value,
        reason: parsed.reason ?? 'range'
      });
      continue;
    }
    apply(id, parsed.value);
    acceptedCount += 1;
    if (canonicalValue === null && legacyAlias) acceptedAliases.set(legacyAlias, value);
  }
  return { acceptedCount, canonicalHref: canonicalizeVelocityAliases(href, acceptedAliases), rejected };
}

function visibleParamValue(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '�');
  return normalized.length <= 32 ? normalized : `${normalized.slice(0, 29)}…`;
}

/** Human-readable, bounded explanation for URL values that were ignored. */
export function formatNumericControlRejections(
  rejected: readonly RejectedNumericControlParam[],
  korean: boolean
): string {
  const reason = korean
    ? { syntax: '숫자 형식', range: '허용 범위', step: '허용 간격' }
    : { syntax: 'number syntax', range: 'allowed range', step: 'allowed increment' };
  const details = rejected
    .slice(0, 4)
    .map((entry) => `${entry.id}="${visibleParamValue(entry.value)}" (${reason[entry.reason]})`)
    .join(', ');
  const remaining = Math.max(0, rejected.length - 4);
  const suffix = remaining > 0 ? (korean ? ` 외 ${remaining}개` : ` and ${remaining} more`) : '';
  return korean
    ? `URL 제어값을 적용하지 않았습니다: ${details}${suffix}. 완전한 유한 소수이고 표시된 범위 안이어야 합니다.`
    : `Ignored URL control value${rejected.length === 1 ? '' : 's'}: ${details}${suffix}. Values must be complete finite decimals inside the displayed control ranges.`;
}
