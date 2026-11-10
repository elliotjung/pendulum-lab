import { afterEach, describe, expect, it, vi } from 'vitest';
import { physicsAdapter } from '../../../src/physics';
import { rhsDouble } from '../../../src/physics/double';
import { StateStore, stateHash } from '../../../src/state/StateStore';
import { eventBus } from '../../../src/runtime/EventBus';
import { CommandRegistry } from '../../../src/runtime/CommandRegistry';
import {
  bindProductRuntime,
  requireProductRuntime,
  type ProductRuntimeProvider
} from '../../../src/product/app/browser-api-binding';
import { createProductRuntimeApi, publishProductRuntimeApi } from '../../../src/product/app/browser-api-runtime';
import type { RuntimeSnapshot } from '../../../src/types/domain';

function setup() {
  const document = {} as Document;
  let value = new StateStore().snapshot();
  let running = false;
  const provider: ProductRuntimeProvider = {
    snapshot: () => structuredClone(value),
    applySnapshot: (next) => {
      value = structuredClone(next);
      return structuredClone(value);
    },
    toggle: () => {
      running = !running;
    },
    reset: () => {
      value.simTime = 0;
    }
  };
  const unbind = bindProductRuntime(document, provider);
  const runtime = createProductRuntimeApi(document);
  return { document, provider, unbind, runtime, running: () => running };
}
afterEach(() => vi.unstubAllGlobals());

describe('S28 native public scripting namespace with a live workspace provider', () => {
  it('returns detached live snapshots and commits a native-validated patch through the active provider', () => {
    const { runtime, provider, unbind } = setup();
    const original = runtime.api.state.snapshot();
    original.state[0] = 999;
    expect(runtime.api.state.snapshot().state[0]).not.toBe(999);
    const changed = runtime.api.state.applyPatch({ state: [9 * Math.PI, 0.2, 0.3, 0.4], dt: 0.004 });
    const expected = StateStore.validate({ ...provider.snapshot(), state: [9 * Math.PI, 0.2, 0.3, 0.4] });
    expect(expected.ok).toBe(true);
    expect(changed.state).toEqual(expected.value!.state);
    expect(changed.dt).toBe(0.004);
    expect(changed.hash).toBe(stateHash(changed.state));
    expect(runtime.api.state.snapshot()).toEqual(changed);
    changed.parameters.m1 = 999;
    expect(runtime.api.state.snapshot().parameters.m1).not.toBe(999);
    unbind();
    runtime.dispose();
  });

  it('preserves state and emits no patch event on malformed inputs or failed workspace commit', () => {
    const { document, runtime, provider, unbind } = setup();
    const before = runtime.api.state.snapshot();
    const events: string[] = [];
    const off = eventBus.on('state:changed', (entry) => events.push(entry.reason));
    let getter = false;
    const unsafe = {} as Partial<RuntimeSnapshot>;
    Object.defineProperty(unsafe, 'dt', {
      enumerable: true,
      get() {
        getter = true;
        return 0.02;
      }
    });
    expect(() => runtime.api.state.applyPatch(unsafe)).toThrow();
    expect(getter).toBe(false);
    expect(() => runtime.api.state.applyPatch({ dt: NaN })).toThrow();
    expect(() => runtime.api.state.applyPatch({ parameters: { m1: -1 } } as Partial<RuntimeSnapshot>)).toThrow();
    const restore = bindProductRuntime(document, {
      ...provider,
      applySnapshot: () => {
        throw new Error('read-only workspace');
      }
    });
    expect(() => runtime.api.state.applyPatch({ dt: 0.004 })).toThrow('read-only');
    expect(runtime.api.state.snapshot()).toEqual(before);
    expect(events).toEqual([]);
    off();
    restore();
    unbind();
    runtime.dispose();
  });

  it('uses the preserved native physics adapter and all seven actual command identifiers', async () => {
    const { runtime, running, unbind } = setup();
    expect(runtime.api.physics).toBe(physicsAdapter);
    const input = new Float64Array([0.3, -0.2, 0.1, -0.05]);
    const p = { m1: 1.2, m2: 0.8, l1: 1.1, l2: 0.7, g: 9.81 };
    expect(Array.from(runtime.api.physics.derivative('double', input, p, 0.04, new Float64Array(4)))).toEqual(
      Array.from(rhsDouble(input, p, 0.04, new Float64Array(4)))
    );
    expect(runtime.api.commands).toBeInstanceOf(CommandRegistry);
    expect(runtime.api.commands.list().map((command) => command.id)).toEqual([
      'export.manifest',
      'index.exportSubmissionManifest',
      'index.validationReport',
      'index.workerSmoke',
      'simulation.reset',
      'simulation.toggle',
      'validation.run'
    ]);
    await runtime.api.commands.run('simulation.toggle');
    expect(running()).toBe(true);
    await runtime.api.commands.run('simulation.toggle');
    expect(running()).toBe(false);
    runtime.api.state.applyPatch({ simTime: 12 });
    await runtime.api.commands.run('simulation.reset');
    expect(runtime.api.state.snapshot().simTime).toBe(0);
    expect(Object.isFrozen(runtime.api)).toBe(true);
    unbind();
    runtime.dispose();
  });

  it('drops stale providers on route exit and never substitutes an unrelated default StateStore', async () => {
    const { document, runtime, provider, unbind } = setup();
    const current = bindProductRuntime(document, {
      ...provider,
      snapshot: () => ({ ...provider.snapshot(), simTime: 123 })
    });
    unbind();
    expect(runtime.api.state.snapshot().simTime).toBe(123);
    current();
    expect(() => requireProductRuntime(document)).toThrow();
    expect(() => runtime.api.state.snapshot()).toThrow('실험실');
    await expect(runtime.api.commands.run('simulation.toggle')).rejects.toThrow('실험실');
    expect(
      Number.isFinite(
        runtime.api.physics.energy('double', new Float64Array([0, 0, 0, 0]), { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 })
          .total
      )
    ).toBe(true);
    runtime.dispose();
  });

  it('refuses external legacy App arguments explicitly instead of silently changing an unrelated object', () => {
    const { runtime, unbind } = setup();
    const external = { opaque: 'keep-original' };
    const before = runtime.api.state.snapshot();
    expect(() => runtime.api.state.applyPatch({ dt: 0.004 }, external)).toThrow('외부 App');
    expect(() => runtime.api.state.syncFromLegacy(external)).toThrow('외부 legacy App');
    expect(runtime.api.state.syncFromLegacy()).toEqual(before);
    expect(external).toEqual({ opaque: 'keep-original' });
    unbind();
    runtime.dispose();
  });

  it('publishes only public namespaces after explicit opt-in and preserves unknown user globals', () => {
    const view = {} as Window;
    const document = { defaultView: view } as Document;
    vi.stubGlobal('window', view);
    const published = publishProductRuntimeApi(document);
    const windowApi = (view as Window & { PendulumLab: typeof published.api }).PendulumLab;
    expect(windowApi.version).toBe(published.api.version);
    expect(windowApi.physics).toBe(physicsAdapter);
    expect((view as Window & { PendulumLabIndex: unknown }).PendulumLabIndex).toBe(published.api);
    expect(Object.isFrozen(windowApi)).toBe(true);
    expect('PendulumRuntime' in view).toBe(false);
    expect('PendulumLabDebug' in view).toBe(false);
    expect('PendulumResearchWorkspace' in view).toBe(false);
    published.dispose();
    expect('PendulumLab' in view).toBe(false);
    expect('PendulumLabIndex' in view).toBe(false);
    const original = { user: 'preserve' };
    Object.defineProperty(view, 'PendulumLab', { configurable: true, value: original });
    expect(() => publishProductRuntimeApi(document)).toThrow('이미 사용 중');
    expect((view as Window & { PendulumLab: unknown }).PendulumLab).toBe(original);
    expect('PendulumLabIndex' in view).toBe(false);
  });

  it('does not remove a namespace the user replaced after publication', () => {
    const view = {} as Window;
    const document = { defaultView: view } as Document;
    vi.stubGlobal('window', view);
    const published = publishProductRuntimeApi(document);
    const user = { own: true };
    Object.defineProperty(view, 'PendulumLab', { configurable: true, value: user });
    published.dispose();
    expect((view as Window & { PendulumLab: unknown }).PendulumLab).toBe(user);
  });
});
