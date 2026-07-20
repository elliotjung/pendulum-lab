import { describe, expect, it } from 'vitest';
import { StateStore } from '../src/state/StateStore';

function validSnapshot(): ReturnType<StateStore['snapshot']> {
  return new StateStore().snapshot();
}

describe('StateStore hostile programmatic input', () => {
  it('rejects root accessors without invoking them', () => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    let executed = false;
    Object.defineProperty(candidate, 'systemType', {
      enumerable: true,
      get() {
        executed = true;
        throw new Error('getter executed');
      }
    });
    expect(() => StateStore.validate(candidate)).not.toThrow();
    expect(StateStore.validate(candidate).ok).toBe(false);
    expect(executed).toBe(false);
  });

  it('rejects nested parameter and state accessors without invoking them', () => {
    const candidate = validSnapshot();
    let executed = 0;
    Object.defineProperty(candidate.parameters, 'm1', {
      enumerable: true,
      get() {
        executed += 1;
        return 1;
      }
    });
    Object.defineProperty(candidate.state, '0', {
      enumerable: true,
      get() {
        executed += 1;
        return 0;
      }
    });
    const result = StateStore.validate(candidate);
    expect(result.ok).toBe(false);
    expect(executed).toBe(0);
  });

  it('turns hostile proxy inspection failures into validation problems', () => {
    const proxy = new Proxy(Object.create(null) as Record<string, unknown>, {
      getPrototypeOf: () => Object.prototype,
      ownKeys: () => {
        throw new Error('hostile ownKeys trap');
      }
    });
    expect(() => StateStore.validate(proxy)).not.toThrow();
    expect(StateStore.validate(proxy)).toMatchObject({ ok: false });
  });

  it('rejects unknown root and parameter fields instead of silently dropping schema drift', () => {
    const root = { ...validSnapshot(), unexpected: true };
    expect(StateStore.validate(root)).toMatchObject({ ok: false });
    const nested = validSnapshot() as ReturnType<StateStore['snapshot']> & {
      parameters: ReturnType<StateStore['snapshot']>['parameters'] & { unexpected?: number };
    };
    nested.parameters.unexpected = 1;
    expect(StateStore.validate(nested)).toMatchObject({ ok: false });
  });
});
