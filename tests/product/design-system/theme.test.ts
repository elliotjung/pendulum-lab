import { describe, expect, it, vi } from 'vitest';
import {
  createThemeControl,
  resolveThemePreference,
  THEME_STORAGE_KEY
} from '../../../src/product/design-system/theme';

function fixture(stored?: string) {
  const data = new Map([
    ['pendulum-lab/ui/color-theme', 'dark'],
    ['user-original', '{"opaque":1.234567890123}']
  ]);
  if (stored !== undefined) data.set(THEME_STORAGE_KEY, stored);
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value))
  };
  const nodes: Node[] = [];
  class Node {
    value = '';
    handlers = new Map<string, () => void>();
    children: Node[] = [];
    append(...nodes: Node[]) {
      this.children.push(...nodes);
    }
    addEventListener(type: string, handler: () => void) {
      this.handlers.set(type, handler);
    }
    removeEventListener(type: string, handler: () => void) {
      if (this.handlers.get(type) === handler) this.handlers.delete(type);
    }
    change() {
      this.handlers.get('change')?.();
    }
  }
  const document = {
    documentElement: { dataset: { theme: 'light' } },
    defaultView: { localStorage: storage },
    createElement() {
      const node = new Node();
      nodes.push(node);
      return node;
    }
  };
  const create = () => {
    const control = createThemeControl(document as unknown as Document, 'product-theme');
    return { control, select: nodes[2]! };
  };
  return { data, storage, document, create };
}

describe('S28 separate product theme preference', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'strictly restores own valid %s without writing storage',
    (preference) => {
      const f = fixture(preference),
        before = [...f.data];
      const { select } = f.create();
      expect(select.value).toBe(preference);
      expect(f.document.documentElement.dataset.theme).toBe(preference);
      expect(f.storage.getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
      expect(f.storage.setItem).not.toHaveBeenCalled();
      expect([...f.data]).toEqual(before);
    }
  );
  it('keeps default light and every legacy/original value unchanged when own preference is absent', () => {
    const f = fixture(),
      before = [...f.data];
    expect(f.create().select.value).toBe('light');
    expect(f.storage.getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect([...f.data]).toEqual(before);
  });
  it.each([undefined, null, ' DARK ', 'Dark', '', 0, true, {}, ['dark']])(
    'rejects non-exact theme data %s without coercion',
    (input) => {
      expect(resolveThemePreference(input)).toBeNull();
    }
  );
  it('preserves an invalid own value on load and only writes the own key after an explicit valid choice', () => {
    const f = fixture(' DARK '),
      before = [...f.data];
    const { control, select } = f.create();
    expect(select.value).toBe('light');
    expect([...f.data]).toEqual(before);
    select.value = 'dark';
    select.change();
    expect(f.document.documentElement.dataset.theme).toBe('dark');
    expect(f.storage.setItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY, 'dark');
    expect(f.data.get('pendulum-lab/ui/color-theme')).toBe('dark');
    expect(f.data.get('user-original')).toBe('{"opaque":1.234567890123}');
    control.dispose();
    select.value = 'system';
    select.change();
    expect(f.document.documentElement.dataset.theme).toBe('dark');
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
  });
  it('keeps the active explicit choice when writes fail and tolerates blocked storage reads', () => {
    const f = fixture();
    f.storage.getItem.mockImplementation(() => {
      throw new Error('blocked read');
    });
    f.storage.setItem.mockImplementation(() => {
      throw new Error('blocked write');
    });
    const before = [...f.data],
      { select } = f.create();
    expect(select.value).toBe('light');
    select.value = 'system';
    expect(() => select.change()).not.toThrow();
    expect(f.document.documentElement.dataset.theme).toBe('system');
    expect([...f.data]).toEqual(before);
  });
  it('keeps functioning when accessing the storage property itself is blocked', () => {
    const f = fixture();
    Object.defineProperty(f.document.defaultView, 'localStorage', {
      get() {
        throw new Error('storage disabled');
      }
    });
    const { select } = f.create();
    select.value = 'dark';
    expect(() => select.change()).not.toThrow();
    expect(f.document.documentElement.dataset.theme).toBe('dark');
  });
});
