import { integratorRegistry } from '../physics/integratorRegistry';
import { APP_VERSION } from '../runtime/version';
import type { IntegratorId } from '../types/domain';
import { LAB_CONTROL_BOUNDS } from '../validation/sessionConstraints';
import { currentAudienceMode, type AudienceMode } from './audienceMode';
import { commitLabControls } from './controlCommit';

type Parameters = { m1: number; m2: number; m3: number; l1: number; l2: number; l3: number; g: number };
type Initial = { theta: [number, number, number]; omega: [number, number, number] };
export type SharedTimingMode = 'deterministic' | 'wall-clock';
export type SharedQualityMode = 'performance' | 'balanced' | 'cinematic';
export type SharedTrailMode = 'rainbow' | 'heat' | 'ice' | 'plasma' | 'white' | 'green';
export type SharedPhaseAxis = '1' | '2' | 'both';

/** Legacy URL payload. Decode remains supported and migrates it to V2. */
// prettier-ignore
export interface SharedExperimentV1 { v: 1; system: 'double' | 'triple'; method: IntegratorId; dt: number; damping: number; toleranceExponent: number; parameters: Parameters; initial: Initial; tab: string }
// Null execution values mean a migrated payload omitted the setting; restore leaves its control unchanged.
// prettier-ignore
export interface SharedExperimentV2 { v: 2; scope: { kind: 'setup-only'; includesResults: false; omittedUnsafeControls: ['audioOn', 'backgroundSim'] }; provenance: { packageName: string; packageVersion: string; physicsVersion: string; physicsSchema: 'pendulum-session/v10-ts'; sourceCommit: string | null; parameterHash: { algorithm: 'fnv1a32-canonical-json'; value: string } }; physics: { system: 'double' | 'triple'; method: IntegratorId; dt: number; damping: number; toleranceExponent: number; parameters: Parameters; initial: Initial }; execution: { seed: number | null; timingMode: SharedTimingMode | null; speed: number | null; stepsPerFrame: number | null; ensemble: { count: number; epsilonExponent: number } | null }; render: { trailMode: SharedTrailMode; trailLength: number; phaseAxis: SharedPhaseAxis; qualityMode: SharedQualityMode; glow: boolean; longExposure: boolean; interpolate: boolean; autoQuality: boolean } | null; tab: string }
export type SharedExperimentPayload = SharedExperimentV1 | SharedExperimentV2;
// prettier-ignore
export interface SharedExperimentDiagnostic { severity: 'info' | 'warning' | 'error'; code: string; message: string; fields?: string[] }
// prettier-ignore
export interface SharedExperimentDecodeResult { ok: boolean; payload: SharedExperimentV2 | null; diagnostics: SharedExperimentDiagnostic[] }
// prettier-ignore
export interface SharedExperimentRestoreResult { ok: boolean; appliedControlIds: string[]; changedControlIds: string[]; skippedControlIds: string[]; diagnostics: SharedExperimentDiagnostic[] }
// prettier-ignore
export interface SharedExperimentUrlDiagnostics { status: 'portable' | 'warning' | 'rejected'; length: number; warningLength: number; maximumLength: number; diagnostics: SharedExperimentDiagnostic[] }

const HASH_PREFIX = '#experiment=';
export const SHARE_URL_WARNING_LENGTH = 2_048;
export const MAX_SHARE_URL_LENGTH = 8_192;
export const MAX_SHARE_HASH_LENGTH = 8_192;
const PACKAGE_NAME = '@elliotjung/pendulum-lab';
const PHYSICS_SCHEMA = 'pendulum-session/v10-ts' as const;
const HASH_ALGORITHM = 'fnv1a32-canonical-json' as const;
const UINT32_MAX = 0xffff_ffff;
const SHA = /^[0-9a-f]{40}$/u;
const SAFE_TEXT = /^[A-Za-z0-9@/._+-]{1,96}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
// prettier-ignore
const TABS = ['lab', 'compare', 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'expansion', 'matrix', 'validate', 'golden', 'zeroone', 'clv', 'basin', 'rqa', 'ftle', 'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs', 'theory'] as const;
const TIMING = ['deterministic', 'wall-clock'] as const;
const QUALITY = ['performance', 'balanced', 'cinematic'] as const;
const TRAILS = ['rainbow', 'heat', 'ice', 'plasma', 'white', 'green'] as const;
const PHASES = ['1', '2', 'both'] as const;

// prettier-ignore
function diag(severity: SharedExperimentDiagnostic['severity'], code: string, message: string, fields?: Iterable<string>): SharedExperimentDiagnostic { const unique = fields ? [...new Set(fields)] : []; return { severity, code, message, ...(unique.length ? { fields: unique } : {}) }; }
// prettier-ignore
function object(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
// prettier-ignore
function numberValue(value: unknown, fallback: number, min: number, max: number, field: string, changed: Set<string>, integer = false): number { if (typeof value !== 'number' || !Number.isFinite(value)) { changed.add(field); return fallback; } const normalized = integer ? Math.round(Math.min(max, Math.max(min, value))) : Math.min(max, Math.max(min, value)); if (normalized !== value) changed.add(field); return normalized; }
// prettier-ignore
function optionalNumber(value: unknown, min: number, max: number, field: string, changed: Set<string>, integer = false): number | null { if (value == null) return null; if (typeof value !== 'number' || !Number.isFinite(value)) { changed.add(field); return null; } return numberValue(value, 0, min, max, field, changed, integer); }
// prettier-ignore
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string, changed: Set<string>): T { if (typeof value === 'string' && allowed.includes(value as T)) return value as T; changed.add(field); return fallback; }
// prettier-ignore
function optionalPick<T extends string>(value: unknown, allowed: readonly T[], field: string, changed: Set<string>): T | null { if (value == null) return null; if (typeof value === 'string' && allowed.includes(value as T)) return value as T; changed.add(field); return null; }
// prettier-ignore
function bool(value: unknown, fallback: boolean, field: string, changed: Set<string>): boolean { if (typeof value === 'boolean') return value; changed.add(field); return fallback; }
// prettier-ignore
function text(value: unknown, fallback: string, field: string, changed: Set<string>): string { if (typeof value === 'string' && SAFE_TEXT.test(value)) return value; changed.add(field); return fallback; }
// prettier-ignore
function tuple(value: unknown, fallback: [number, number, number], min: number, max: number, field: string, changed: Set<string>): [number, number, number] { const source = Array.isArray(value) ? value : []; if (source.length !== 3) changed.add(field); return source.length === 3 ? source.map((item, index) => numberValue(item, fallback[index]!, min, max, `${field}[${index}]`, changed)) as [number, number, number] : fallback; }
function physicsFrom(source: Record<string, unknown>, changed: Set<string>): SharedExperimentV2['physics'] {
  const p = object(source.parameters) ?? (changed.add('parameters'), {});
  const initial = object(source.initial) ?? (changed.add('initial'), {});
  const mass = (key: 'm1' | 'm2' | 'm3', fallback: number) =>
    numberValue(
      p[key],
      fallback,
      LAB_CONTROL_BOUNDS.mass.min,
      LAB_CONTROL_BOUNDS.mass.max,
      `parameters.${key}`,
      changed
    );
  const length = (key: 'l1' | 'l2' | 'l3', fallback: number) =>
    numberValue(
      p[key],
      fallback,
      LAB_CONTROL_BOUNDS.length.min,
      LAB_CONTROL_BOUNDS.length.max,
      `parameters.${key}`,
      changed
    );
  return {
    system: pick(source.system, ['double', 'triple'], 'double', 'physics.system', changed),
    method:
      typeof source.method === 'string' && Object.hasOwn(integratorRegistry, source.method)
        ? (source.method as IntegratorId)
        : (changed.add('physics.method'), 'rk4'),
    dt: numberValue(source.dt, 0.003, LAB_CONTROL_BOUNDS.dt.min, LAB_CONTROL_BOUNDS.dt.max, 'physics.dt', changed),
    damping: numberValue(source.damping, 0, 0, 10, 'physics.damping', changed),
    toleranceExponent: numberValue(source.toleranceExponent, -6, -12, -3, 'physics.toleranceExponent', changed),
    parameters: {
      m1: mass('m1', 1),
      m2: mass('m2', 1),
      m3: mass('m3', 1),
      l1: length('l1', 1.2),
      l2: length('l2', 1),
      l3: length('l3', 0.8),
      g: numberValue(p.g, 9.81, 0, 20, 'parameters.g', changed)
    },
    initial: {
      theta: tuple(initial.theta, [2, 2.5, 1], -Math.PI, Math.PI, 'initial.theta', changed),
      omega: tuple(initial.omega, [0, 0, 0], -64, 64, 'initial.omega', changed)
    }
  };
}
// prettier-ignore
function appendChanges(diagnostics: SharedExperimentDiagnostic[], changed: Set<string>): void { if (changed.size) diagnostics.push(diag('warning', 'sanitized-fields', 'Unsafe, unsupported, or malformed shared fields were replaced, clamped, or left unchanged.', changed)); }

function encode64(textValue: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(textValue)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
function decode64(value: string): string {
  if (!BASE64URL.test(value) || value.length % 4 === 1) throw new Error('invalid base64url');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(`${base64}${'='.repeat((4 - (value.length % 4)) % 4)}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (item) => item.charCodeAt(0)));
}

/** Stable and explicitly non-cryptographic fingerprint of physics and execution inputs. */
export function canonicalSharedExperimentParameterHash(payload: SharedExperimentV2): string {
  const canonical = JSON.stringify({ physics: payload.physics, execution: payload.execution });
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function hashed(payload: SharedExperimentV2): SharedExperimentV2 {
  return {
    ...payload,
    provenance: {
      ...payload.provenance,
      parameterHash: { algorithm: HASH_ALGORITHM, value: canonicalSharedExperimentParameterHash(payload) }
    }
  };
}
function basePayload(
  physics: SharedExperimentV2['physics'],
  tab: string,
  provenance: Omit<SharedExperimentV2['provenance'], 'parameterHash'>,
  execution: SharedExperimentV2['execution'],
  render: SharedExperimentV2['render']
): SharedExperimentV2 {
  return hashed({
    v: 2,
    scope: { kind: 'setup-only', includesResults: false, omittedUnsafeControls: ['audioOn', 'backgroundSim'] },
    provenance: { ...provenance, parameterHash: { algorithm: HASH_ALGORITHM, value: '' } },
    physics,
    execution,
    render,
    tab
  });
}
function sanitizeV2(source: Record<string, unknown>, diagnostics: SharedExperimentDiagnostic[]): SharedExperimentV2 {
  const changed = new Set<string>();
  const scope = object(source.scope);
  if (scope?.kind !== 'setup-only' || scope.includesResults !== false) changed.add('scope');
  const rawProvenance = object(source.provenance) ?? (changed.add('provenance'), {});
  const rawPhysics = object(source.physics) ?? (changed.add('physics'), {});
  const rawExecution = object(source.execution);
  const rawEnsemble = object(rawExecution?.ensemble);
  const rawRender = object(source.render);
  if (!rawExecution) changed.add('execution');
  if (source.render !== null && source.render !== undefined && !rawRender) changed.add('render');
  const sourceCommit =
    typeof rawProvenance.sourceCommit === 'string' && SHA.test(rawProvenance.sourceCommit)
      ? rawProvenance.sourceCommit
      : null;
  if (rawProvenance.sourceCommit != null && sourceCommit === null) changed.add('provenance.sourceCommit');
  const normalized = basePayload(
    physicsFrom(rawPhysics, changed),
    pick(source.tab, TABS, 'lab', 'tab', changed),
    {
      packageName: text(rawProvenance.packageName, 'unknown', 'provenance.packageName', changed),
      packageVersion: text(rawProvenance.packageVersion, 'unknown', 'provenance.packageVersion', changed),
      physicsVersion: text(rawProvenance.physicsVersion, 'unknown', 'provenance.physicsVersion', changed),
      physicsSchema:
        rawProvenance.physicsSchema === PHYSICS_SCHEMA
          ? PHYSICS_SCHEMA
          : (changed.add('provenance.physicsSchema'), PHYSICS_SCHEMA),
      sourceCommit
    },
    {
      seed: optionalNumber(rawExecution?.seed, 0, UINT32_MAX, 'execution.seed', changed, true),
      timingMode: optionalPick(rawExecution?.timingMode, TIMING, 'execution.timingMode', changed),
      speed: optionalNumber(rawExecution?.speed, 0.1, 4, 'execution.speed', changed),
      stepsPerFrame: optionalNumber(rawExecution?.stepsPerFrame, 1, 60, 'execution.stepsPerFrame', changed, true),
      ensemble: rawEnsemble
        ? {
            count: numberValue(rawEnsemble.count, 12, 0, 80, 'execution.ensemble.count', changed, true),
            epsilonExponent: numberValue(
              rawEnsemble.epsilonExponent,
              -4,
              -7,
              -2,
              'execution.ensemble.epsilonExponent',
              changed
            )
          }
        : null
    },
    rawRender
      ? {
          trailMode: pick(rawRender.trailMode, TRAILS, 'rainbow', 'render.trailMode', changed),
          trailLength: numberValue(rawRender.trailLength, 1200, 100, 3000, 'render.trailLength', changed, true),
          phaseAxis: pick(rawRender.phaseAxis, PHASES, '1', 'render.phaseAxis', changed),
          qualityMode: pick(rawRender.qualityMode, QUALITY, 'balanced', 'render.qualityMode', changed),
          glow: bool(rawRender.glow, false, 'render.glow', changed),
          longExposure: bool(rawRender.longExposure, false, 'render.longExposure', changed),
          interpolate: bool(rawRender.interpolate, true, 'render.interpolate', changed),
          autoQuality: bool(rawRender.autoQuality, true, 'render.autoQuality', changed)
        }
      : null
  );
  const incomingHash = object(rawProvenance.parameterHash);
  if (incomingHash?.algorithm !== HASH_ALGORITHM || incomingHash.value !== normalized.provenance.parameterHash.value) {
    diagnostics.push(
      diag(
        'warning',
        'parameter-hash-mismatch',
        'The shared parameter fingerprint was missing or mismatched; the canonical fingerprint was recomputed.'
      )
    );
  }
  appendChanges(diagnostics, changed);
  return normalized;
}
function migrateV1(source: Record<string, unknown>, diagnostics: SharedExperimentDiagnostic[]): SharedExperimentV2 {
  const changed = new Set<string>();
  const payload = basePayload(
    physicsFrom(source, changed),
    pick(source.tab, TABS, 'lab', 'tab', changed),
    {
      packageName: PACKAGE_NAME,
      packageVersion: 'unknown',
      physicsVersion: 'unknown',
      physicsSchema: PHYSICS_SCHEMA,
      sourceCommit: null
    },
    { seed: null, timingMode: null, speed: null, stepsPerFrame: null, ensemble: null },
    null
  );
  diagnostics.push(
    diag(
      'warning',
      'migrated-v1',
      'V1 migrated. Seed, timing, ensemble, render, source commit, and results were absent and were not inferred.'
    )
  );
  appendChanges(diagnostics, changed);
  return payload;
}

export function encodeSharedExperiment(payload: SharedExperimentPayload): string {
  const hash = `${HASH_PREFIX}${encode64(JSON.stringify(payload))}`;
  if (hash.length > MAX_SHARE_HASH_LENGTH)
    throw new RangeError(`Shared setup hash exceeds ${MAX_SHARE_HASH_LENGTH} characters.`);
  return hash;
}
function decodeFailure(
  code: string,
  message: string,
  severity: 'info' | 'error' = 'error'
): SharedExperimentDecodeResult {
  return { ok: false, payload: null, diagnostics: [diag(severity, code, message)] };
}
/** Decode untrusted state with explicit migration, repair, and failure diagnostics. */
export function decodeSharedExperiment(hash: string): SharedExperimentDecodeResult {
  if (!hash.startsWith(HASH_PREFIX)) return decodeFailure('not-share-hash', 'Not a Pendulum Lab shared setup.', 'info');
  if (hash.length > MAX_SHARE_HASH_LENGTH)
    return decodeFailure('hash-too-long', 'Shared setup exceeds the safety limit.');
  let decoded: string;
  try {
    decoded = decode64(hash.slice(HASH_PREFIX.length));
  } catch {
    return decodeFailure('malformed-base64', 'Shared setup encoding is malformed.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return decodeFailure('invalid-json', 'Shared setup JSON is malformed.');
  }
  const source = object(parsed);
  if (!source) return decodeFailure('invalid-payload', 'Shared setup must be a JSON object.');
  const diagnostics: SharedExperimentDiagnostic[] = [];
  if (source.v === 1) return { ok: true, payload: migrateV1(source, diagnostics), diagnostics };
  if (source.v === 2) return { ok: true, payload: sanitizeV2(source, diagnostics), diagnostics };
  return decodeFailure('unsupported-version', `Shared setup version ${String(source.v ?? 'missing')} is unsupported.`);
}

export function diagnoseExperimentShareUrl(value: URL | string): SharedExperimentUrlDiagnostics {
  const length = String(value).length;
  const common = { length, warningLength: SHARE_URL_WARNING_LENGTH, maximumLength: MAX_SHARE_URL_LENGTH };
  if (length > MAX_SHARE_URL_LENGTH)
    return {
      status: 'rejected',
      ...common,
      diagnostics: [diag('error', 'url-too-long', `Shared setup URL exceeds ${MAX_SHARE_URL_LENGTH} characters.`)]
    };
  if (length > SHARE_URL_WARNING_LENGTH)
    return {
      status: 'warning',
      ...common,
      diagnostics: [
        diag(
          'warning',
          'url-length-warning',
          `The ${length}-character URL may be unreliable in QR codes, LMS tools, or messaging apps.`
        )
      ]
    };
  return { status: 'portable', ...common, diagnostics: [] };
}
export function experimentShareUrl(
  href: string,
  payload: SharedExperimentPayload,
  audience: AudienceMode,
  locale: 'en' | 'ko'
): URL {
  const url = new URL(href);
  url.searchParams.delete('mode');
  url.searchParams.set('audience', audience);
  url.searchParams.set('lang', locale);
  url.hash = encodeSharedExperiment(payload);
  const length = diagnoseExperimentShareUrl(url);
  if (length.status === 'rejected')
    throw new RangeError(`Shared setup URL is too long: ${length.diagnostics[0]?.message ?? 'safety limit exceeded.'}`);
  return url;
}

function controlNumber(id: string, fallback: number): number {
  const value = Number.parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '');
  return Number.isFinite(value) ? value : fallback;
}
function selected<T extends string>(id: string, allowed: readonly T[], fallback: T): T {
  const value = (document.getElementById(id) as HTMLSelectElement | null)?.value;
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}
function checked(id: string, fallback: boolean): boolean {
  const input = document.getElementById(id) as HTMLInputElement | null;
  return typeof input?.checked === 'boolean' ? input.checked : fallback;
}
function sourceCommit(): string | null {
  const value = document.querySelector<HTMLMetaElement>('meta[name="pendulum-source-commit"]')?.content ?? '';
  return SHA.test(value) ? value : null;
}
export function captureSharedExperiment(): SharedExperimentV2 {
  const methodValue = (document.getElementById('method') as HTMLSelectElement | null)?.value ?? 'rk4';
  const seed = controlNumber('seed', Number.NaN);
  const panel = document.querySelector<HTMLElement>('.tabpanel.active');
  return basePayload(
    {
      system: selected('sysType', ['double', 'triple'], 'double'),
      method: Object.hasOwn(integratorRegistry, methodValue) ? (methodValue as IntegratorId) : 'rk4',
      dt: controlNumber('dt', 0.003),
      damping: controlNumber('gamma', 0),
      toleranceExponent: controlNumber('tol', -6),
      parameters: {
        m1: controlNumber('m1', 1),
        m2: controlNumber('m2', 1),
        m3: controlNumber('m3', 1),
        l1: controlNumber('l1', 1.2),
        l2: controlNumber('l2', 1),
        l3: controlNumber('l3', 0.8),
        g: controlNumber('g', 9.81)
      },
      initial: {
        theta: [controlNumber('th1', 2), controlNumber('th2', 2.5), controlNumber('th3', 1)],
        omega: [controlNumber('iw1', 0), controlNumber('iw2', 0), controlNumber('iw3', 0)]
      }
    },
    pick(panel?.id.startsWith('tab-') ? panel.id.slice(4) : 'lab', TABS, 'lab', 'tab', new Set()),
    {
      packageName: PACKAGE_NAME,
      packageVersion: APP_VERSION,
      physicsVersion: APP_VERSION,
      physicsSchema: PHYSICS_SCHEMA,
      sourceCommit: sourceCommit()
    },
    {
      seed: Number.isSafeInteger(seed) && seed >= 0 && seed <= UINT32_MAX ? seed : null,
      timingMode: selected('timeMode', TIMING, 'wall-clock'),
      speed: controlNumber('speed', 1),
      stepsPerFrame: controlNumber('spf', 6),
      ensemble: { count: controlNumber('ensN', 12), epsilonExponent: controlNumber('ensEps', -4) }
    },
    {
      trailMode: selected('trailMode', TRAILS, 'rainbow'),
      trailLength: controlNumber('trailLen', 1200),
      phaseAxis: selected('phaseAxis', PHASES, '1'),
      qualityMode: selected('qualityMode', QUALITY, 'balanced'),
      glow: checked('glowMode', false),
      longExposure: checked('longExpose', false),
      interpolate: checked('interpolateRender', true),
      autoQuality: checked('autoQual', true)
    }
  );
}

type Control = { value?: string; checked?: boolean; options?: ArrayLike<{ value: string }> };
const FORMATS: Record<string, (value: string) => string> = {
  th1: (v) => Number(v).toFixed(3),
  th2: (v) => Number(v).toFixed(3),
  th3: (v) => Number(v).toFixed(3),
  iw1: (v) => Number(v).toFixed(1),
  iw2: (v) => Number(v).toFixed(1),
  iw3: (v) => Number(v).toFixed(1),
  m1: (v) => Number(v).toFixed(2),
  m2: (v) => Number(v).toFixed(2),
  m3: (v) => Number(v).toFixed(2),
  l1: (v) => Number(v).toFixed(2),
  l2: (v) => Number(v).toFixed(2),
  l3: (v) => Number(v).toFixed(2),
  g: (v) => Number(v).toFixed(2),
  gamma: (v) => Number(v).toFixed(2),
  dt: (v) => Number(v).toFixed(4),
  tol: (v) => `1.0e${v}`,
  speed: (v) => `${Number(v).toFixed(1)}×`,
  spf: String,
  trailLen: String,
  ensN: String,
  ensEps: (v) => `1.0e${Number(v).toFixed(1)}`
};
function applyValue(
  id: string,
  value: string | number,
  applied: Set<string>,
  changed: Set<string>,
  skipped: Set<string>
): void {
  const control = document.getElementById(id) as Control | null;
  const next = String(value);
  if (
    !control ||
    typeof control.value !== 'string' ||
    (control.options?.length && !Array.from(control.options).some((option) => option.value === next))
  ) {
    skipped.add(id);
    return;
  }
  applied.add(id);
  if (control.value !== next) changed.add(id);
  control.value = next;
  const output = document.getElementById(`${id}V`);
  if (output && FORMATS[id]) output.textContent = FORMATS[id]!(next);
}
function applyChecked(
  id: string,
  value: boolean,
  applied: Set<string>,
  changed: Set<string>,
  skipped: Set<string>
): void {
  const control = document.getElementById(id) as Control | null;
  if (!control || typeof control.checked !== 'boolean') {
    skipped.add(id);
    return;
  }
  applied.add(id);
  if (control.checked !== value) changed.add(id);
  control.checked = value;
}
/** Populate controls atomically, then emit exactly one semantic Lab commit and no native input storm. */
export function restoreSharedExperiment(payload: SharedExperimentV2): SharedExperimentRestoreResult {
  if (typeof document === 'undefined')
    return {
      ok: false,
      appliedControlIds: [],
      changedControlIds: [],
      skippedControlIds: [],
      diagnostics: [diag('error', 'document-unavailable', 'Shared setup restoration requires a document.')]
    };
  const diagnostics: SharedExperimentDiagnostic[] = [];
  const setup = sanitizeV2(payload as unknown as Record<string, unknown>, diagnostics);
  const applied = new Set<string>(),
    changed = new Set<string>(),
    skipped = new Set<string>();
  const set = (id: string, value: string | number) => applyValue(id, value, applied, changed, skipped);
  const p = setup.physics;
  [
    ['sysType', p.system],
    ['method', p.method],
    ['dt', p.dt],
    ['gamma', p.damping],
    ['tol', p.toleranceExponent]
  ].forEach(([id, value]) => set(id as string, value!));
  Object.entries(p.parameters).forEach(([id, value]) => set(id, value));
  p.initial.theta.forEach((value, index) => set(`th${index + 1}`, value));
  p.initial.omega.forEach((value, index) => set(`iw${index + 1}`, value));
  const executionValues: [string, string | number | null][] = [
    ['seed', setup.execution.seed],
    ['timeMode', setup.execution.timingMode],
    ['speed', setup.execution.speed],
    ['spf', setup.execution.stepsPerFrame],
    ['ensN', setup.execution.ensemble?.count ?? null],
    ['ensEps', setup.execution.ensemble?.epsilonExponent ?? null]
  ];
  executionValues.forEach(([id, value]) => {
    if (value !== null) set(id, value);
  });
  if (setup.render) {
    [
      ['trailMode', setup.render.trailMode],
      ['trailLen', setup.render.trailLength],
      ['phaseAxis', setup.render.phaseAxis],
      ['qualityMode', setup.render.qualityMode]
    ].forEach(([id, value]) => set(id as string, value!));
    [
      ['glowMode', setup.render.glow],
      ['longExpose', setup.render.longExposure],
      ['interpolateRender', setup.render.interpolate],
      ['autoQual', setup.render.autoQuality]
    ].forEach(([id, value]) => applyChecked(id as string, value as boolean, applied, changed, skipped));
  }
  if (skipped.size)
    diagnostics.push(
      diag(
        'warning',
        'control-unavailable',
        'Some controls are unavailable in this build and were left unchanged.',
        skipped
      )
    );
  if (applied.size) commitLabControls('deep-link', changed);
  const shell =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { __modernShell?: { switchTo(name: string): void } }).__modernShell;
  if (shell) shell.switchTo(setup.tab);
  else diagnostics.push(diag('warning', 'tab-unavailable', 'The shared tab could not be activated yet.'));
  return {
    ok: applied.size > 0,
    appliedControlIds: [...applied],
    changedControlIds: [...changed],
    skippedControlIds: [...skipped],
    diagnostics
  };
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
function notify(message: string, duration = 2_800): void {
  const toast = (window as Window & { toast?: unknown }).toast;
  if (typeof toast === 'function') {
    (toast as (text: string, timeout?: number) => void)(message, duration);
    return;
  }
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  window.setTimeout(() => box.classList.remove('show'), duration);
}
const localized = (en: string, ko: string) => (document.documentElement.lang === 'ko' ? ko : en);
export function installExperimentShare(): void {
  if (typeof document === 'undefined') return;
  const restoreHash = () => {
    if (!location.hash.startsWith(HASH_PREFIX)) return;
    const decoded = decodeSharedExperiment(location.hash);
    if (!decoded.ok || !decoded.payload) {
      notify(
        localized('Shared setup is invalid or unsupported.', '공유 설정 링크가 잘못되었거나 지원되지 않습니다.'),
        4_200
      );
      return;
    }
    const restored = restoreSharedExperiment(decoded.payload);
    const warned = [...decoded.diagnostics, ...restored.diagnostics].some((item) => item.severity !== 'info');
    notify(
      restored.ok
        ? localized(
            warned
              ? 'Shared setup restored with warnings; results were not included.'
              : 'Shared setup restored; results were not included.',
            warned
              ? '경고와 함께 공유 설정을 복원했습니다. 결과는 포함되지 않았습니다.'
              : '공유 설정을 복원했습니다. 결과는 포함되지 않았습니다.'
          )
        : localized('Shared setup controls are unavailable.', '공유 설정 컨트롤을 사용할 수 없습니다.'),
      warned ? 4_200 : 2_800
    );
  };
  restoreHash();
  window.addEventListener('hashchange', restoreHash);
  const button = document.getElementById('shareUrl') as HTMLButtonElement | null;
  if (!button || button.dataset.shareBound === '1') return;
  button.dataset.shareBound = '1';
  button.dataset.testid = 'share-experiment';
  button.addEventListener('click', () => {
    const locale = document.documentElement.lang === 'ko' ? 'ko' : 'en';
    let url: URL;
    try {
      url = experimentShareUrl(location.href, captureSharedExperiment(), currentAudienceMode(), locale);
    } catch {
      notify(
        localized('Setup link is too long to share safely.', '설정 링크가 너무 길어 안전하게 공유할 수 없습니다.'),
        4_200
      );
      return;
    }
    const length = diagnoseExperimentShareUrl(url);
    history.replaceState(history.state, '', url);
    void copyText(url.href)
      .then(() =>
        notify(
          localized(
            length.status === 'warning'
              ? 'Setup link copied, but it may be too long for QR/LMS tools. Results are not included.'
              : 'Setup-only link copied; results are not included.',
            length.status === 'warning'
              ? '설정 링크를 복사했지만 QR/LMS에서 너무 길 수 있습니다. 결과는 포함되지 않습니다.'
              : '설정 전용 링크를 복사했습니다. 결과는 포함되지 않습니다.'
          ),
          length.status === 'warning' ? 4_200 : 2_800
        )
      )
      .catch(() =>
        notify(
          localized(
            'Setup-only link created in the address bar; results are not included.',
            '주소창에 설정 전용 링크를 만들었습니다. 결과는 포함되지 않습니다.'
          )
        )
      );
  });
}
