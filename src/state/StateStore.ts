import type {
  ImportValidationResult,
  IntegratorId,
  PendulumParameters,
  RunMode,
  RuntimeSnapshot,
  SystemType
} from '../types/domain';
import { integratorRegistry } from '../physics/integrators';
import { eventBus } from '../runtime/EventBus';
import { legacyApp } from '../runtime/legacyCompat';
import type { PendulumLegacyApp } from '../types/globals';
import { inBounds, principalAngle, SESSION_SAFETY_BOUNDS } from '../validation/sessionConstraints';

const schemaVersion = 'pendulum-session/v10-ts';
const schemaPattern = /^pendulum-session\/v(\d+)-ts$/;
const currentSchemaDigits = '10';
const systemTypes = new Set<SystemType>(['double', 'triple']);
const modes = new Set<RunMode>(['demo', 'education', 'research', 'benchmark', 'performance', 'recovery']);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  try {
    if (Object.prototype.toString.call(value) !== '[object Object]') return false;
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function sanitizeParameters(value: unknown, problems: string[]): PendulumParameters | undefined {
  const initialProblemCount = problems.length;
  if (!plainObject(value)) {
    problems.push('parameters must be a plain object');
    return undefined;
  }
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    if (Object.hasOwn(value, key)) problems.push(`parameters cannot contain ${key}`);
  }
  const p = value as Record<string, unknown>;
  for (const key of ['m1', 'm2'] as const) {
    if (!finite(p[key]) || !inBounds(p[key], SESSION_SAFETY_BOUNDS.mass)) {
      problems.push(`${key} is outside solver-safe mass bounds`);
    }
  }
  for (const key of ['l1', 'l2'] as const) {
    if (!finite(p[key]) || !inBounds(p[key], SESSION_SAFETY_BOUNDS.length)) {
      problems.push(`${key} is outside solver-safe length bounds`);
    }
  }
  if (!finite(p.g) || !inBounds(p.g, SESSION_SAFETY_BOUNDS.gravity)) {
    problems.push('g is outside solver-safe gravity bounds');
  }
  if (Object.hasOwn(p, 'm3') && (!finite(p.m3) || !inBounds(p.m3, SESSION_SAFETY_BOUNDS.mass))) {
    problems.push('m3 is outside solver-safe mass bounds');
  }
  if (Object.hasOwn(p, 'l3') && (!finite(p.l3) || !inBounds(p.l3, SESSION_SAFETY_BOUNDS.length))) {
    problems.push('l3 is outside solver-safe length bounds');
  }
  if (problems.length > initialProblemCount) return undefined;
  const parameters: PendulumParameters = {
    m1: Number(p.m1),
    m2: Number(p.m2),
    l1: Number(p.l1),
    l2: Number(p.l2),
    g: Number(p.g)
  };
  if (finite(p.m3)) parameters.m3 = p.m3;
  if (finite(p.l3)) parameters.l3 = p.l3;
  return parameters;
}

function sanitizeState(value: unknown, systemType: unknown, problems: string[]): number[] | undefined {
  const expectedLength = systemType === 'triple' ? 6 : 4;
  if (!Array.isArray(value) || value.length !== expectedLength) {
    problems.push(`state must have length ${expectedLength}`);
    return undefined;
  }
  const angleCount = systemType === 'triple' ? 3 : 2;
  const state: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const component = value[index];
    if (!finite(component)) {
      problems.push(`state[${index}] must be finite`);
      continue;
    }
    if (index >= angleCount && !inBounds(component, SESSION_SAFETY_BOUNDS.angularVelocity)) {
      problems.push(`state[${index}] is outside solver-safe angular-velocity bounds`);
      continue;
    }
    state.push(index < angleCount ? principalAngle(component) : component);
  }
  return state.length === expectedLength ? state : undefined;
}

function sanitizeSchemaVersion(value: unknown, problems: string[]): string {
  if (value === undefined) return schemaVersion;
  if (typeof value !== 'string') {
    problems.push('schemaVersion must be a string');
    return schemaVersion;
  }
  const match = schemaPattern.exec(value);
  if (!match) {
    problems.push('schemaVersion is not a supported pendulum session schema');
    return schemaVersion;
  }
  const versionDigits = match[1]!.replace(/^0+/, '') || '0';
  const isFuture =
    versionDigits.length > currentSchemaDigits.length ||
    (versionDigits.length === currentSchemaDigits.length && versionDigits > currentSchemaDigits);
  if (isFuture) {
    problems.push(`schemaVersion ${value} is newer than the supported ${schemaVersion}`);
  } else if (value !== schemaVersion) {
    problems.push(`schemaVersion ${value} requires an explicit migration to ${schemaVersion}`);
  }
  return value;
}

function stateHash(state: ArrayLike<number>): string {
  if (typeof window !== 'undefined' && typeof window.hashState === 'function') {
    return window.hashState(Array.from(state));
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < state.length; i += 1) {
    const value = Math.trunc(Number(state[i] ?? 0) * 1e9);
    h ^= value;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export class StateStore {
  private snapshotValue: RuntimeSnapshot;

  constructor(initial?: Partial<RuntimeSnapshot>) {
    const candidate: RuntimeSnapshot = {
      schemaVersion,
      systemType: 'double',
      method: 'rk4',
      mode: 'demo',
      dt: 0.003,
      tolerance: 1e-7,
      stepsPerFrame: 6,
      damping: 0,
      parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
      state: [1, 1, 0, 0],
      simTime: 0,
      seed: null,
      hash: 'uninitialized',
      ...initial
    };
    const validation = StateStore.validate(candidate);
    if (!validation.ok || !validation.value) {
      throw new Error(`invalid initial state: ${validation.problems.join('; ')}`);
    }
    this.snapshotValue = { ...validation.value, hash: stateHash(validation.value.state) };
  }

  snapshot(): RuntimeSnapshot {
    return structuredClone(this.snapshotValue);
  }

  syncFromLegacy(app: PendulumLegacyApp | undefined = legacyApp()): RuntimeSnapshot {
    if (!app) return this.snapshot();
    const state = Array.from(app.state ?? []).slice(0, app.stateLen ?? app.state?.length ?? 0);
    const candidate: RuntimeSnapshot = {
      schemaVersion,
      systemType: app.sysType,
      method: app.method,
      mode: app.runMode ?? 'demo',
      dt: Number(app.DT),
      tolerance: Number(app.tol),
      stepsPerFrame: Number(app.SPF),
      damping: Number(app.gamma),
      parameters: { ...app.P },
      state,
      simTime: Number(app.simTime ?? 0),
      seed: typeof app.seed === 'number' ? app.seed : null,
      hash: app._stateHash ?? stateHash(state)
    };
    const validation = StateStore.validate(candidate);
    if (!validation.ok || !validation.value) {
      throw new Error(`invalid legacy runtime state: ${validation.problems.join('; ')}`);
    }
    this.snapshotValue = { ...validation.value, hash: stateHash(validation.value.state) };
    eventBus.emit('state:changed', { reason: 'legacy-sync' });
    return this.snapshot();
  }

  applyPatch(patch: Partial<RuntimeSnapshot>, app: PendulumLegacyApp | undefined = legacyApp()): RuntimeSnapshot {
    const candidate = { ...this.snapshotValue, ...patch, hash: this.snapshotValue.hash };
    const validation = StateStore.validate(candidate);
    if (!validation.ok || !validation.value) {
      throw new Error(`invalid state patch: ${validation.problems.join('; ')}`);
    }
    this.snapshotValue = { ...validation.value, hash: stateHash(validation.value.state) };
    if (app) {
      app.sysType = this.snapshotValue.systemType;
      app.method = this.snapshotValue.method;
      app.DT = this.snapshotValue.dt;
      app.tol = this.snapshotValue.tolerance;
      app.SPF = this.snapshotValue.stepsPerFrame;
      app.gamma = this.snapshotValue.damping;
      app.runMode = this.snapshotValue.mode;
      app.P = { ...this.snapshotValue.parameters };
      app.state = new Float64Array(this.snapshotValue.state);
      app.stateLen = this.snapshotValue.state.length;
      app.simTime = this.snapshotValue.simTime;
      if (this.snapshotValue.seed === null) delete app.seed;
      else app.seed = this.snapshotValue.seed;
      app._stateHash = this.snapshotValue.hash;
    }
    eventBus.emit('state:changed', { reason: 'patch' });
    return this.snapshot();
  }

  static validate(value: unknown): ImportValidationResult<RuntimeSnapshot> {
    const problems: string[] = [];
    if (!plainObject(value)) return { ok: false, problems: ['snapshot must be a plain object'] };
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      if (Object.hasOwn(value, key)) problems.push(`snapshot cannot contain ${key}`);
    }
    const v = value as Record<string, unknown>;
    const validatedSchemaVersion = sanitizeSchemaVersion(v.schemaVersion, problems);
    const systemType = v.systemType;
    const method = v.method;
    const canonicalMethod = method === 'verlet' ? 'leapfrog' : method;
    const mode = v.mode ?? 'demo';
    if (systemType !== 'double' && systemType !== 'triple') problems.push('systemType must be double or triple');
    if (typeof canonicalMethod !== 'string' || !Object.hasOwn(integratorRegistry, canonicalMethod))
      problems.push('method must be a known integrator');
    if (typeof mode !== 'string' || !modes.has(mode as RunMode)) problems.push('mode is not allowed');
    for (const key of ['dt', 'tolerance', 'stepsPerFrame', 'damping', 'simTime']) {
      if (!finite(v[key])) problems.push(`${key} must be finite`);
    }
    if (finite(v.dt) && !inBounds(v.dt, SESSION_SAFETY_BOUNDS.dt)) problems.push('dt is outside safe bounds');
    if (finite(v.tolerance) && !inBounds(v.tolerance, SESSION_SAFETY_BOUNDS.tolerance))
      problems.push('tolerance is outside safe bounds');
    if (
      finite(v.stepsPerFrame) &&
      (!Number.isSafeInteger(v.stepsPerFrame) || !inBounds(v.stepsPerFrame, SESSION_SAFETY_BOUNDS.stepsPerFrame))
    )
      problems.push('stepsPerFrame is outside safe integer bounds');
    if (finite(v.damping) && !inBounds(v.damping, SESSION_SAFETY_BOUNDS.damping))
      problems.push('damping is outside safe bounds');
    if (finite(v.simTime) && !inBounds(v.simTime, SESSION_SAFETY_BOUNDS.simTime))
      problems.push('simTime is outside safe bounds');
    if (v.seed !== null && v.seed !== undefined) {
      if (!finite(v.seed)) problems.push('seed must be finite or null');
      else if (!Number.isSafeInteger(v.seed)) problems.push('seed must be a safe integer');
    }
    const state = sanitizeState(v.state, systemType, problems);
    const parameters = sanitizeParameters(v.parameters, problems);
    if (systemType === 'triple' && parameters && (parameters.m3 === undefined || parameters.l3 === undefined)) {
      problems.push('triple parameters require positive m3 and l3');
    }
    if (
      problems.length ||
      !parameters ||
      !state ||
      typeof canonicalMethod !== 'string' ||
      typeof mode !== 'string' ||
      !systemTypes.has(systemType as SystemType)
    ) {
      return { ok: false, problems };
    }
    return {
      ok: true,
      problems: [],
      value: {
        schemaVersion: validatedSchemaVersion,
        systemType: systemType as SystemType,
        method: canonicalMethod as IntegratorId,
        mode: mode as RunMode,
        dt: Number(v.dt),
        tolerance: Number(v.tolerance),
        stepsPerFrame: Number(v.stepsPerFrame),
        damping: Number(v.damping),
        parameters,
        state,
        simTime: Number(v.simTime),
        seed: finite(v.seed) ? Number(v.seed) : null,
        hash: typeof v.hash === 'string' ? v.hash : stateHash(state)
      }
    };
  }
}

export const stateStore: StateStore = new StateStore();
