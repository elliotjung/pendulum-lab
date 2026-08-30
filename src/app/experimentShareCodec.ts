import { integratorRegistry } from '../physics/integratorRegistry';
import type { IntegratorId } from '../types/domain';
import { LAB_CONTROL_BOUNDS } from '../validation/sessionConstraints';
import { decodeBase64UrlText as decode64, encodeBase64UrlText as encode64 } from './base64UrlText';
import {
  SHARED_EXPERIMENT_TABS,
  type SharedExperimentDecodeResult,
  type SharedExperimentDiagnostic,
  type SharedExperimentPayload,
  type SharedExperimentV2,
  type SharedExperimentV3,
  type SharedExperimentV4
} from './experimentShareTypes';
import {
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  normalizePerturbationVariableForSystem,
  type PerturbationPattern,
  type PerturbationVariable
} from './ensemblePerturbation';
import { EXPERIMENT_RECIPES, experimentRecipe, type ExperimentGoal } from './experimentRecipes';
import {
  TRAJECTORY_STAGES,
  WORKFLOW_STEPS,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from './experimentWorkflowContract';
import { normalizeGoalWorkflowState } from './experimentWorkflowPolicy';

export const HASH_PREFIX = '#experiment=';
export const SHARE_URL_WARNING_LENGTH = 2_048;
export const MAX_SHARE_URL_LENGTH = 8_192;
export const MAX_SHARE_HASH_LENGTH = 8_192;
export const PACKAGE_NAME = '@elliotjung/pendulum-lab';
const LEGACY_PHYSICS_SCHEMA = 'pendulum-session/v10-ts' as const;
export const PHYSICS_SCHEMA = 'pendulum-session/v11-ts' as const;
const HASH_ALGORITHM = 'fnv1a32-canonical-json' as const;
export const UINT32_MAX = 0xffff_ffff;
export const SHA = /^[0-9a-f]{40}$/u;
const SAFE_TEXT = /^[A-Za-z0-9@/._+-]{1,96}$/u;
// prettier-ignore
export const TABS = SHARED_EXPERIMENT_TABS;
export const TIMING = ['deterministic', 'wall-clock'] as const;
export const QUALITY = ['performance', 'balanced', 'cinematic'] as const;
export const TRAILS = ['rainbow', 'heat', 'ice', 'plasma', 'white', 'green'] as const;
export const PHASES = ['1', '2', 'both'] as const;
export const ANGLE_UNITS = ['rad', 'deg'] as const;
export const EXPERIMENT_GOALS = EXPERIMENT_RECIPES.map((recipe) => recipe.id);

// prettier-ignore
export function diag(severity: SharedExperimentDiagnostic['severity'], code: string, message: string, fields?: Iterable<string>): SharedExperimentDiagnostic { const unique = fields ? [...new Set(fields)] : []; return { severity, code, message, ...(unique.length ? { fields: unique } : {}) }; }
// prettier-ignore
function object(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
// prettier-ignore
function numberValue(value: unknown, fallback: number, min: number, max: number, field: string, changed: Set<string>, integer = false): number { if (typeof value !== 'number' || !Number.isFinite(value)) { changed.add(field); return fallback; } const normalized = integer ? Math.round(Math.min(max, Math.max(min, value))) : Math.min(max, Math.max(min, value)); if (normalized !== value) changed.add(field); return normalized; }
// prettier-ignore
function optionalNumber(value: unknown, min: number, max: number, field: string, changed: Set<string>, integer = false): number | null { if (value == null) return null; if (typeof value !== 'number' || !Number.isFinite(value)) { changed.add(field); return null; } return numberValue(value, 0, min, max, field, changed, integer); }
// prettier-ignore
export function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string, changed: Set<string>): T { if (typeof value === 'string' && allowed.includes(value as T)) return value as T; changed.add(field); return fallback; }
// prettier-ignore
function optionalPick<T extends string>(value: unknown, allowed: readonly T[], field: string, changed: Set<string>): T | null { if (value == null) return null; if (typeof value === 'string' && allowed.includes(value as T)) return value as T; changed.add(field); return null; }
// prettier-ignore
function bool(value: unknown, fallback: boolean, field: string, changed: Set<string>): boolean { if (typeof value === 'boolean') return value; changed.add(field); return fallback; }
// prettier-ignore
function text(value: unknown, fallback: string, field: string, changed: Set<string>): string { if (typeof value === 'string' && SAFE_TEXT.test(value)) return value; changed.add(field); return fallback; }
// prettier-ignore
function tuple(value: unknown, fallback: [number, number, number], min: number, max: number, field: string, changed: Set<string>): [number, number, number] { const source = Array.isArray(value) ? value : []; if (source.length !== 3) changed.add(field); return source.length === 3 ? source.map((item, index) => numberValue(item, fallback[index]!, min, max, `${field}[${index}]`, changed)) as [number, number, number] : fallback; }
function physicsFrom(
  source: Record<string, unknown>,
  changed: Set<string>,
  allowCompound: boolean
): SharedExperimentV4['physics'] {
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
    system: pick(
      source.system,
      allowCompound ? ['double', 'compound-double', 'triple'] : ['double', 'triple'],
      'double',
      'physics.system',
      changed
    ),
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

/** Stable and explicitly non-cryptographic fingerprint of physics and execution inputs. */
export function canonicalSharedExperimentParameterHash(
  payload: SharedExperimentV2 | SharedExperimentV3 | SharedExperimentV4
): string {
  const canonical = JSON.stringify({ physics: payload.physics, execution: payload.execution });
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function hashed(payload: SharedExperimentV4): SharedExperimentV4 {
  return {
    ...payload,
    provenance: {
      ...payload.provenance,
      parameterHash: { algorithm: HASH_ALGORITHM, value: canonicalSharedExperimentParameterHash(payload) }
    }
  };
}
export function basePayload(
  physics: SharedExperimentV4['physics'],
  tab: string,
  provenance: Omit<SharedExperimentV4['provenance'], 'parameterHash'>,
  execution: SharedExperimentV4['execution'],
  render: SharedExperimentV4['render'],
  preferences: SharedExperimentV4['preferences'] = { angleUnit: 'rad' },
  workflow: SharedExperimentV4['workflow'] = {
    goal: 'sensitive-dependence',
    step: 'choose',
    trajectoryStage: 'reference'
  }
): SharedExperimentV4 {
  return hashed({
    v: 4,
    scope: { kind: 'setup-only', includesResults: false, omittedUnsafeControls: ['audioOn', 'backgroundSim'] },
    provenance: { ...provenance, parameterHash: { algorithm: HASH_ALGORITHM, value: '' } },
    physics,
    execution,
    render,
    preferences,
    workflow,
    tab
  });
}

function reportUnsupportedV4Fields(source: Record<string, unknown>, diagnostics: SharedExperimentDiagnostic[]): void {
  const fields: string[] = [];
  const collect = (value: Record<string, unknown> | null, prefix: string, allowed: readonly string[]) => {
    if (!value) return;
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fields.push(prefix ? `${prefix}.${key}` : key);
  };
  collect(source, '', ['v', 'scope', 'provenance', 'physics', 'execution', 'render', 'preferences', 'workflow', 'tab']);
  collect(object(source.scope), 'scope', ['kind', 'includesResults', 'omittedUnsafeControls']);
  collect(object(source.provenance), 'provenance', [
    'packageName',
    'packageVersion',
    'physicsVersion',
    'physicsSchema',
    'sourceCommit',
    'parameterHash'
  ]);
  collect(object(object(source.provenance)?.parameterHash), 'provenance.parameterHash', ['algorithm', 'value']);
  collect(object(source.physics), 'physics', [
    'system',
    'method',
    'dt',
    'damping',
    'toleranceExponent',
    'parameters',
    'initial'
  ]);
  collect(object(object(source.physics)?.parameters), 'physics.parameters', ['m1', 'm2', 'm3', 'l1', 'l2', 'l3', 'g']);
  collect(object(object(source.physics)?.initial), 'physics.initial', ['theta', 'omega']);
  collect(object(source.execution), 'execution', ['seed', 'timingMode', 'speed', 'stepsPerFrame', 'ensemble']);
  collect(object(object(source.execution)?.ensemble), 'execution.ensemble', [
    'count',
    'epsilon',
    'variable',
    'pattern',
    'seed'
  ]);
  collect(object(source.render), 'render', [
    'trailMode',
    'trailLength',
    'phaseAxis',
    'qualityMode',
    'glow',
    'longExposure',
    'interpolate',
    'autoQuality'
  ]);
  collect(object(source.preferences), 'preferences', ['angleUnit']);
  collect(object(source.workflow), 'workflow', ['goal', 'step', 'trajectoryStage']);
  if (fields.length)
    diagnostics.push(
      diag('warning', 'unsupported-fields', 'Unknown shared setup fields were ignored by this schema version.', fields)
    );
}

export function sanitizeVersioned(
  source: Record<string, unknown>,
  diagnostics: SharedExperimentDiagnostic[],
  sourceVersion: 2 | 3 | 4
): SharedExperimentV4 {
  const changed = new Set<string>();
  const scope = object(source.scope);
  if (scope?.kind !== 'setup-only' || scope.includesResults !== false) changed.add('scope');
  const rawProvenance = object(source.provenance) ?? (changed.add('provenance'), {});
  const rawPhysics = object(source.physics) ?? (changed.add('physics'), {});
  const rawExecution = object(source.execution);
  const rawEnsemble = object(rawExecution?.ensemble);
  const rawRender = object(source.render);
  const rawPreferences = object(source.preferences);
  const rawWorkflow = object(source.workflow);
  const physics = physicsFrom(rawPhysics, changed, sourceVersion >= 3);
  if (!rawExecution) changed.add('execution');
  if (source.render !== null && source.render !== undefined && !rawRender) changed.add('render');
  const sourceCommit =
    typeof rawProvenance.sourceCommit === 'string' && SHA.test(rawProvenance.sourceCommit)
      ? rawProvenance.sourceCommit
      : null;
  if (rawProvenance.sourceCommit != null && sourceCommit === null) changed.add('provenance.sourceCommit');
  let ensemble: SharedExperimentV4['execution']['ensemble'] = rawEnsemble
    ? sourceVersion === 4
      ? (() => {
          const requestedVariable = pick(
            rawEnsemble.variable,
            PERTURBATION_VARIABLES,
            'th1',
            'execution.ensemble.variable',
            changed
          ) as PerturbationVariable;
          const variable = normalizePerturbationVariableForSystem(requestedVariable, physics.system);
          if (variable !== requestedVariable) changed.add('execution.ensemble.variable');
          return {
            count: numberValue(rawEnsemble.count, 12, 2, 80, 'execution.ensemble.count', changed, true),
            epsilon: numberValue(rawEnsemble.epsilon, 1e-4, 1e-7, 1e-2, 'execution.ensemble.epsilon', changed),
            variable,
            pattern: pick(
              rawEnsemble.pattern,
              PERTURBATION_PATTERNS,
              'alternating',
              'execution.ensemble.pattern',
              changed
            ) as PerturbationPattern,
            seed: numberValue(rawEnsemble.seed, 1, 0, UINT32_MAX, 'execution.ensemble.seed', changed, true)
          };
        })()
      : {
          count: numberValue(rawEnsemble.count, 12, 0, 80, 'execution.ensemble.count', changed, true),
          epsilon:
            10 ** numberValue(rawEnsemble.epsilonExponent, -4, -7, -2, 'execution.ensemble.epsilonExponent', changed),
          variable: 'th1',
          pattern: 'alternating',
          seed: 1
        }
    : null;
  const inferredStage: TrajectoryStage =
    !ensemble || ensemble.count === 0 ? 'reference' : ensemble.count === 1 ? 'perturbed' : 'ensemble';
  const preferences: SharedExperimentV4['preferences'] =
    sourceVersion === 4
      ? { angleUnit: pick(rawPreferences?.angleUnit, ANGLE_UNITS, 'rad', 'preferences.angleUnit', changed) }
      : { angleUnit: 'rad' };
  const workflow: SharedExperimentV4['workflow'] =
    sourceVersion === 4
      ? {
          goal: pick(
            rawWorkflow?.goal,
            EXPERIMENT_GOALS,
            'sensitive-dependence',
            'workflow.goal',
            changed
          ) as ExperimentGoal,
          step: pick(rawWorkflow?.step, WORKFLOW_STEPS, 'choose', 'workflow.step', changed) as ExperimentWorkflowStep,
          trajectoryStage: pick(
            rawWorkflow?.trajectoryStage,
            TRAJECTORY_STAGES,
            inferredStage,
            'workflow.trajectoryStage',
            changed
          ) as TrajectoryStage
        }
      : { goal: 'sensitive-dependence', step: 'choose', trajectoryStage: inferredStage };
  const goalState = normalizeGoalWorkflowState(
    experimentRecipe(workflow.goal),
    workflow.step,
    workflow.trajectoryStage
  );
  if (goalState.step !== workflow.step) changed.add('workflow.step');
  if (goalState.stage !== workflow.trajectoryStage) changed.add('workflow.trajectoryStage');
  workflow.step = goalState.step;
  workflow.trajectoryStage = goalState.stage;
  if (!experimentRecipe(workflow.goal).perturbation.count && ensemble) {
    ensemble = null;
    changed.add('execution.ensemble');
  }
  if (!ensemble && workflow.trajectoryStage !== 'reference') {
    workflow.trajectoryStage = 'reference';
    changed.add('workflow.trajectoryStage');
  }
  const normalized = basePayload(
    physics,
    pick(source.tab, TABS, 'lab', 'tab', changed),
    {
      packageName: text(rawProvenance.packageName, 'unknown', 'provenance.packageName', changed),
      packageVersion: text(rawProvenance.packageVersion, 'unknown', 'provenance.packageVersion', changed),
      physicsVersion: text(rawProvenance.physicsVersion, 'unknown', 'provenance.physicsVersion', changed),
      physicsSchema:
        rawProvenance.physicsSchema === (sourceVersion === 2 ? LEGACY_PHYSICS_SCHEMA : PHYSICS_SCHEMA)
          ? PHYSICS_SCHEMA
          : (changed.add('provenance.physicsSchema'), PHYSICS_SCHEMA),
      sourceCommit
    },
    {
      seed: optionalNumber(rawExecution?.seed, 0, UINT32_MAX, 'execution.seed', changed, true),
      timingMode: optionalPick(rawExecution?.timingMode, TIMING, 'execution.timingMode', changed),
      speed: optionalNumber(rawExecution?.speed, 0.1, 4, 'execution.speed', changed),
      stepsPerFrame: optionalNumber(rawExecution?.stepsPerFrame, 1, 60, 'execution.stepsPerFrame', changed, true),
      ensemble
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
      : null,
    preferences,
    workflow
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
  if (sourceVersion === 4) reportUnsupportedV4Fields(source, diagnostics);
  if (sourceVersion === 2) {
    diagnostics.push(
      diag(
        'warning',
        'migrated-v2',
        'V2 point-mass setup migrated to V4; the historical schema did not define compound rods or workflow state.'
      )
    );
  } else if (sourceVersion === 3) {
    diagnostics.push(
      diag(
        'warning',
        'migrated-v3',
        'V3 setup migrated to V4; perturbation rule, angle display, and workflow state use explicit safe defaults.'
      )
    );
  }
  return normalized;
}
function migrateV1(source: Record<string, unknown>, diagnostics: SharedExperimentDiagnostic[]): SharedExperimentV4 {
  const changed = new Set<string>();
  const payload = basePayload(
    physicsFrom(source, changed, false),
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
      'V1 migrated to V4. Seed, timing, ensemble, render, workflow, source commit, and results were absent and were not inferred.'
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
  if (source.v === 2) return { ok: true, payload: sanitizeVersioned(source, diagnostics, 2), diagnostics };
  if (source.v === 3) return { ok: true, payload: sanitizeVersioned(source, diagnostics, 3), diagnostics };
  if (source.v === 4) return { ok: true, payload: sanitizeVersioned(source, diagnostics, 4), diagnostics };
  return decodeFailure('unsupported-version', `Shared setup version ${String(source.v ?? 'missing')} is unsupported.`);
}
