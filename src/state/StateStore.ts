import type { ImportValidationResult, IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../types/domain';
import { integratorRegistry } from '../physics/integrators';
import { eventBus } from '../runtime/EventBus';
import { legacyApp } from '../runtime/legacyCompat';

const schemaVersion = 'pendulum-session/v10-ts';
const systemTypes = new Set<SystemType>(['double', 'triple']);
const modes = new Set<RunMode>(['demo', 'education', 'research', 'benchmark', 'performance', 'recovery']);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitizeParameters(value: unknown, problems: string[]): PendulumParameters | undefined {
  if (!plainObject(value)) {
    problems.push('parameters must be a plain object');
    return undefined;
  }
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    if (Object.hasOwn(value, key)) problems.push(`parameters cannot contain ${key}`);
  }
  const p = value as Record<string, unknown>;
  const required = ['m1', 'm2', 'l1', 'l2', 'g'] as const;
  for (const key of required) {
    if (!finite(p[key])) problems.push(`${key} must be finite`);
    else if (Number(p[key]) <= 0 && key !== 'g') problems.push(`${key} must be positive`);
  }
  if (problems.length) return undefined;
  const parameters: PendulumParameters = {
    m1: Number(p.m1),
    m2: Number(p.m2),
    l1: Number(p.l1),
    l2: Number(p.l2),
    g: Number(p.g)
  };
  if (finite(p.m3)) parameters.m3 = Number(p.m3);
  if (finite(p.l3)) parameters.l3 = Number(p.l3);
  return parameters;
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
    this.snapshotValue = {
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
    this.snapshotValue = { ...this.snapshotValue, hash: stateHash(this.snapshotValue.state) };
  }

  snapshot(): RuntimeSnapshot {
    return structuredClone(this.snapshotValue);
  }

  syncFromLegacy(app = legacyApp()): RuntimeSnapshot {
    if (!app) return this.snapshot();
    const state = Array.from(app.state ?? []).slice(0, app.stateLen ?? app.state?.length ?? 0);
    this.snapshotValue = {
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
    eventBus.emit('state:changed', { reason: 'legacy-sync' });
    return this.snapshot();
  }

  applyPatch(patch: Partial<RuntimeSnapshot>, app = legacyApp()): RuntimeSnapshot {
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
    const systemType = v.systemType;
    const method = v.method;
    const mode = v.mode ?? 'demo';
    if (systemType !== 'double' && systemType !== 'triple') problems.push('systemType must be double or triple');
    if (typeof method !== 'string' || !(method in integratorRegistry)) problems.push('method must be a known integrator');
    if (typeof mode !== 'string' || !modes.has(mode as RunMode)) problems.push('mode is not allowed');
    for (const key of ['dt', 'tolerance', 'stepsPerFrame', 'damping', 'simTime']) {
      if (!finite(v[key])) problems.push(`${key} must be finite`);
    }
    if (finite(v.dt) && (v.dt <= 0 || v.dt > 0.1)) problems.push('dt is outside safe bounds');
    if (finite(v.damping) && (v.damping < 0 || v.damping > 10)) problems.push('damping is outside safe bounds');
    const state = v.state;
    const expectedStateLength = systemType === 'triple' ? 6 : 4;
    if (!Array.isArray(state) || state.length !== expectedStateLength) problems.push(`state must have length ${expectedStateLength}`);
    else if (state.some((x) => !finite(x) || Math.abs(x) > 1e8)) problems.push('state contains non-finite or extreme values');
    const parameters = sanitizeParameters(v.parameters, problems);
    if (problems.length || !parameters || !Array.isArray(state) || typeof method !== 'string' || typeof mode !== 'string' || !systemTypes.has(systemType as SystemType)) {
      return { ok: false, problems };
    }
    return {
      ok: true,
      problems: [],
      value: {
        schemaVersion: typeof v.schemaVersion === 'string' ? v.schemaVersion : schemaVersion,
        systemType: systemType as SystemType,
        method: method as IntegratorId,
        mode: mode as RunMode,
        dt: Number(v.dt),
        tolerance: Number(v.tolerance),
        stepsPerFrame: Number(v.stepsPerFrame),
        damping: Number(v.damping),
        parameters,
        state: state.map(Number),
        simTime: Number(v.simTime),
        seed: finite(v.seed) ? Number(v.seed) : null,
        hash: typeof v.hash === 'string' ? v.hash : stateHash(state)
      }
    };
  }
}

export const stateStore = new StateStore();
