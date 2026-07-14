import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_CONTROLS_COMMITTED_EVENT } from '../src/app/controlCommit';
import { Shell, shouldIgnoreShellShortcut } from '../src/app/Shell';

function shortcutEvent(overrides: Record<string, unknown> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    metaKey: false,
    target: null,
    ...overrides
  } as unknown as KeyboardEvent;
}

class FakeControl extends EventTarget {
  value: string;
  options: Array<{ value: string }> = [];

  constructor(value: string) {
    super();
    this.value = value;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('Shell keyboard guard', () => {
  it('leaves ctrl/meta/alt shortcuts to the browser and application widgets', () => {
    expect(shouldIgnoreShellShortcut(shortcutEvent({ ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreShellShortcut(shortcutEvent({ metaKey: true }))).toBe(true);
    expect(shouldIgnoreShellShortcut(shortcutEvent({ altKey: true }))).toBe(true);
  });

  it('ignores interactive and editable targets, including nested targets', () => {
    const interactive = { closest: () => ({}) };
    const nested = { parentElement: interactive };
    expect(shouldIgnoreShellShortcut(shortcutEvent({ target: interactive }))).toBe(true);
    expect(shouldIgnoreShellShortcut(shortcutEvent({ target: nested }))).toBe(true);
    expect(shouldIgnoreShellShortcut(shortcutEvent())).toBe(false);
  });
});

describe('Shell batched control updates', () => {
  it('commits a preset exactly once instead of emitting one change per control', () => {
    const sysType = new FakeControl('double');
    sysType.options = [{ value: 'double' }, { value: 'triple' }];
    const th1 = new FakeControl('0');
    const controls = new Map<string, unknown>([
      ['sysType', sysType],
      ['th1', th1],
      ['th1V', { textContent: '' }]
    ]);
    const documentEvents = new EventTarget();
    const fakeDocument = {
      getElementById: (id: string) => controls.get(id) ?? null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    };
    vi.stubGlobal('document', fakeDocument);
    let commits = 0;
    let nativeChanges = 0;
    documentEvents.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, () => (commits += 1));
    th1.addEventListener('change', () => (nativeChanges += 1));

    new Shell().applyPreset('classic');

    expect(commits).toBe(1);
    expect(nativeChanges).toBe(0);
    expect(th1.value).toBe('2');
  });

  it('merges preset and URL overrides into one deep-link commit', () => {
    const sysType = new FakeControl('double');
    sysType.options = [{ value: 'double' }, { value: 'triple' }];
    const th1 = new FakeControl('0');
    const controls = new Map<string, unknown>([
      ['sysType', sysType],
      ['th1', th1],
      ['th1V', { textContent: '' }]
    ]);
    const documentEvents = new EventTarget();
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    vi.stubGlobal('window', { location: { href: 'https://example.test/app?preset=classic&th1=1.25' } });
    let commits = 0;
    documentEvents.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, () => (commits += 1));

    (new Shell() as unknown as { applyUrlDeepLink(): void }).applyUrlDeepLink();

    expect(commits).toBe(1);
    expect(th1.value).toBe('1.25');
  });
});
