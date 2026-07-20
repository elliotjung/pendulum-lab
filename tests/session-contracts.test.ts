import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySnapshotControls, snapshotControlValues } from '../src/browser/savedRunImport';
import { StateStore } from '../src/state/StateStore';
import type { RuntimeSnapshot } from '../src/types/domain';
import {
  LAB_CONTROL_BOUNDS,
  LAB_INTEGRATOR_IDS,
  SESSION_SAFETY_BOUNDS,
  validateLabSnapshot
} from '../src/validation/sessionConstraints';
import { parseStrictJsonImport } from '../src/validation/importSchema';
import type { PendulumLegacyApp } from '../src/types/globals';
import { integratorRegistry } from '../src/physics/integrators';

const BASE: RuntimeSnapshot = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.003,
  tolerance: 1e-7,
  stepsPerFrame: 6,
  damping: 0,
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
  state: [0.1, 0.2, 0, 0],
  simTime: 0,
  seed: 1,
  hash: 'fixture'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session safety and interactive Lab contracts', () => {
  it('deep-freezes every exported safety bound', () => {
    for (const bounds of [...Object.values(SESSION_SAFETY_BOUNDS), ...Object.values(LAB_CONTROL_BOUNDS)]) {
      expect(Object.isFrozen(bounds)).toBe(true);
      expect(() => {
        (bounds as { min: number }).min = Number.NEGATIVE_INFINITY;
      }).toThrow(TypeError);
    }
  });

  it('keeps the headless StateStore contract wider than the interactive controls', () => {
    const research = StateStore.validate({
      ...BASE,
      dt: LAB_CONTROL_BOUNDS.dt.min / 2,
      tolerance: LAB_CONTROL_BOUNDS.tolerance.min / 10,
      stepsPerFrame: LAB_CONTROL_BOUNDS.stepsPerFrame.max + 1,
      parameters: { ...BASE.parameters, m1: LAB_CONTROL_BOUNDS.mass.max + 1 }
    });
    expect(research.ok).toBe(true);
    expect(validateLabSnapshot(research.value!).ok).toBe(false);
  });

  it('rejects values beyond broad solver-safety limits before StateStore mutation', () => {
    const cases: RuntimeSnapshot[] = [
      { ...BASE, dt: SESSION_SAFETY_BOUNDS.dt.min / 2 },
      { ...BASE, damping: SESSION_SAFETY_BOUNDS.damping.max + 1 },
      { ...BASE, stepsPerFrame: SESSION_SAFETY_BOUNDS.stepsPerFrame.max + 1 },
      { ...BASE, simTime: SESSION_SAFETY_BOUNDS.simTime.max + 1 },
      { ...BASE, parameters: { ...BASE.parameters, l1: SESSION_SAFETY_BOUNDS.length.max + 1 } },
      { ...BASE, state: [0, 0, SESSION_SAFETY_BOUNDS.angularVelocity.max + 1, 0] }
    ];
    for (const candidate of cases) expect(StateStore.validate(candidate).ok).toBe(false);
  });

  it('canonicalizes periodic angles and the historical verlet method alias', () => {
    const parsed = parseStrictJsonImport(
      JSON.stringify({ ...BASE, method: 'verlet', state: [9 * Math.PI, -8 * Math.PI, 0, 0] })
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.method).toBe('leapfrog');
    expect(parsed.value?.state[0]).toBeCloseTo(Math.PI, 12);
    expect(parsed.value?.state[1]).toBeCloseTo(0, 12);
  });

  it('applies one canonical snapshot to StateStore and the adopted runtime', () => {
    const app: PendulumLegacyApp = {
      P: { ...BASE.parameters },
      gamma: 0,
      sysType: 'double',
      method: 'rk4',
      runMode: 'demo',
      DT: 0.003,
      tol: 1e-7,
      SPF: 6,
      state: new Float64Array([0, 0, 0, 0]),
      stateLen: 4,
      paused: false,
      simTime: 0
    };
    const store = new StateStore();
    const restored = store.applyPatch(
      { ...BASE, method: 'verlet', state: [5 * Math.PI, 0.25, 1, -2], simTime: 42.5, seed: 77 },
      app
    );
    expect(restored.method).toBe('leapfrog');
    expect(app.method).toBe(restored.method);
    expect(app.DT).toBe(restored.dt);
    expect(app.tol).toBe(restored.tolerance);
    expect(app.SPF).toBe(restored.stepsPerFrame);
    expect(app.gamma).toBe(restored.damping);
    expect(app.runMode).toBe(restored.mode);
    expect(app.simTime).toBe(restored.simTime);
    expect(app.seed).toBe(restored.seed);
    expect(Array.from(app.state)).toEqual(restored.state);
    expect(app._stateHash).toBe(restored.hash);
  });

  it('keeps the app markup synchronized with the declared Lab contract', () => {
    const html = readFileSync(resolve(import.meta.dirname, '..', 'app.html'), 'utf8');
    const tag = (id: string): string => html.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`))?.[0] ?? '';
    const attr = (input: string, name: string): number => Number(input.match(new RegExp(`${name}="([^"]+)"`))?.[1]);
    expect(attr(tag('dt'), 'min')).toBe(LAB_CONTROL_BOUNDS.dt.min);
    expect(attr(tag('dt'), 'max')).toBe(LAB_CONTROL_BOUNDS.dt.max);
    expect(10 ** attr(tag('tol'), 'min')).toBeCloseTo(LAB_CONTROL_BOUNDS.tolerance.min, 15);
    expect(10 ** attr(tag('tol'), 'max')).toBeCloseTo(LAB_CONTROL_BOUNDS.tolerance.max, 15);
    expect(attr(tag('spf'), 'max')).toBe(LAB_CONTROL_BOUNDS.stepsPerFrame.max);
    expect(attr(tag('gamma'), 'max')).toBe(LAB_CONTROL_BOUNDS.damping.max);
    expect(attr(tag('iw1'), 'min')).toBe(LAB_CONTROL_BOUNDS.angularVelocity.min);
    expect(attr(tag('iw1'), 'max')).toBe(LAB_CONTROL_BOUNDS.angularVelocity.max);
    const methodMarkup = html.match(/<select id="method">([\s\S]*?)<\/select>/)?.[1] ?? '';
    const options = new Set(Array.from(methodMarkup.matchAll(/<option value="([^"]+)"/g), (match) => match[1]));
    for (const method of LAB_INTEGRATOR_IDS) expect(options.has(method), `missing #method option ${method}`).toBe(true);
    expect([...options].sort()).toEqual([...LAB_INTEGRATOR_IDS].sort());
    expect(
      Object.keys(integratorRegistry)
        .filter((method) => method !== 'verlet')
        .sort()
    ).toEqual([...LAB_INTEGRATOR_IDS].sort());
  });
});

class FakeInput {
  type: string;
  min: string;
  max: string;
  step: string;
  private current: string;
  readonly dispatchEvent = vi.fn(() => true);
  readonly addEventListener = vi.fn();
  readonly dataset: Record<string, string> = {};

  constructor(value: string, type = 'range', min = '', max = '', step = '') {
    this.current = value;
    this.type = type;
    this.min = min;
    this.max = max;
    this.step = step;
  }

  get value(): string {
    return this.current;
  }

  set value(value: string) {
    if (this.type !== 'range') {
      this.current = value;
      return;
    }
    const numeric = Number(value);
    const min = this.min === '' ? Number.NEGATIVE_INFINITY : Number(this.min);
    const max = this.max === '' ? Number.POSITIVE_INFINITY : Number(this.max);
    let projected = Math.min(max, Math.max(min, numeric));
    const numericStep = Number(this.step);
    if (this.step !== '' && this.step !== 'any' && Number.isFinite(numericStep) && numericStep > 0) {
      const base = Number.isFinite(min) ? min : 0;
      projected = Math.min(max, Math.max(min, base + Math.round((projected - base) / numericStep) * numericStep));
    }
    this.current = String(projected);
  }

  get valueAsNumber(): number {
    return Number(this.current);
  }
}

class FakeSelect {
  readonly options: Array<{ value: string }>;
  private current: string;
  readonly dispatchEvent = vi.fn(() => true);

  constructor(value: string, options: readonly string[]) {
    this.current = value;
    this.options = options.map((option) => ({ value: option }));
  }

  get value(): string {
    return this.current;
  }

  set value(value: string) {
    this.current = this.options.some((option) => option.value === value) ? value : '';
  }
}

function fakeControls(snapshot: RuntimeSnapshot): Map<string, FakeInput | FakeSelect> {
  const bounds: Record<string, { min: number; max: number }> = {
    dt: LAB_CONTROL_BOUNDS.dt,
    tol: { min: Math.log10(LAB_CONTROL_BOUNDS.tolerance.min), max: Math.log10(LAB_CONTROL_BOUNDS.tolerance.max) },
    spf: LAB_CONTROL_BOUNDS.stepsPerFrame,
    gamma: LAB_CONTROL_BOUNDS.damping,
    m1: LAB_CONTROL_BOUNDS.mass,
    m2: LAB_CONTROL_BOUNDS.mass,
    m3: LAB_CONTROL_BOUNDS.mass,
    l1: LAB_CONTROL_BOUNDS.length,
    l2: LAB_CONTROL_BOUNDS.length,
    l3: LAB_CONTROL_BOUNDS.length,
    g: LAB_CONTROL_BOUNDS.gravity,
    th1: LAB_CONTROL_BOUNDS.angle,
    th2: LAB_CONTROL_BOUNDS.angle,
    th3: LAB_CONTROL_BOUNDS.angle,
    iw1: LAB_CONTROL_BOUNDS.angularVelocity,
    iw2: LAB_CONTROL_BOUNDS.angularVelocity,
    iw3: LAB_CONTROL_BOUNDS.angularVelocity
  };
  const controls = new Map<string, FakeInput | FakeSelect>();
  for (const [id, value] of snapshotControlValues(snapshot)) {
    if (id === 'sysType') controls.set(id, new FakeSelect('double', ['double', 'triple']));
    else if (id === 'method') controls.set(id, new FakeSelect('rk4', LAB_INTEGRATOR_IDS));
    else {
      const bound = bounds[id];
      controls.set(
        id,
        new FakeInput(
          id === 'seed' ? '' : String(value),
          id === 'seed' ? 'number' : 'range',
          bound ? String(bound.min) : '',
          bound ? String(bound.max) : ''
        )
      );
    }
  }
  return controls;
}

function installFakeDom(controls: Map<string, FakeInput | FakeSelect>): ReturnType<typeof vi.fn> {
  const dispatchEvent = vi.fn(() => true);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLSelectElement', FakeSelect);
  vi.stubGlobal(
    'CustomEvent',
    class<T> {
      readonly type: string;
      readonly detail: T;
      constructor(type: string, init: { detail: T }) {
        this.type = type;
        this.detail = init.detail;
      }
    }
  );
  vi.stubGlobal('document', {
    getElementById: (id: string) => controls.get(id) ?? null,
    dispatchEvent
  });
  return dispatchEvent;
}

describe('saved-run DOM application', () => {
  it('rejects an absent integrator option before changing any control', () => {
    const snapshot = {
      ...BASE,
      systemType: 'triple' as const,
      method: 'yoshida8' as const,
      parameters: { ...BASE.parameters, m3: 1, l3: 1 },
      state: [0, 0, 0, 0, 0, 0]
    };
    const controls = fakeControls(snapshot);
    controls.set('method', new FakeSelect('rk4', ['rk4', 'leapfrog']));
    installFakeDom(controls);
    const result = applySnapshotControls(snapshot);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('no option');
    expect(controls.get('sysType')?.value).toBe('double');
  });

  it('rejects browser range clamping atomically instead of diverging from LabApp', () => {
    const snapshot = { ...BASE, dt: 0.02, damping: 0.5 };
    const controls = fakeControls(snapshot);
    controls.set('dt', new FakeInput('0.003', 'range', '0.0005', '0.01'));
    const gamma = controls.get('gamma')!;
    gamma.value = '0';
    installFakeDom(controls);
    const result = applySnapshotControls(snapshot);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('cannot represent');
    expect(controls.get('dt')?.value).toBe('0.003');
    expect(gamma.value).toBe('0');
  });

  it('preserves exact imported values in range controls and the scientific snapshot', () => {
    const snapshot = {
      ...BASE,
      state: [0.123456789, -0.234567891, 0.345678912, -0.456789123]
    };
    const controls = fakeControls(snapshot);
    controls.set('th1', new FakeInput('0', 'range', String(-Math.PI), String(Math.PI), '0.001'));
    controls.set('iw1', new FakeInput('0', 'range', '-64', '64', '0.1'));
    const dispatchEvent = installFakeDom(controls);

    const result = applySnapshotControls(snapshot);

    expect(result.ok).toBe(true);
    expect(Number(controls.get('th1')?.value)).toBe(snapshot.state[0]);
    expect(Number(controls.get('iw1')?.value)).toBe(snapshot.state[2]);
    expect((controls.get('th1') as FakeInput).step).toBe('any');
    const commit = dispatchEvent.mock.calls.at(-1)?.[0] as CustomEvent<{ snapshot: RuntimeSnapshot }>;
    expect(commit.detail.snapshot.state).toEqual(snapshot.state);
  });
});
