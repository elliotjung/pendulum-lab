import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_CONTROLS_COMMITTED_EVENT } from '../src/app/controlCommit';
import { Shell, shouldIgnoreShellShortcut, TAB_REQUESTED_EVENT } from '../src/app/Shell';
import { TabRouting, type TabRequestedDetail, urlForTab } from '../src/app/tabRouting';

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

describe('Shell tab URL routing', () => {
  it('canonicalizes the tab while preserving unrelated query parameters and the hash', () => {
    expect(urlForTab('https://example.test/lab?ref=landing&lang=ko&tab=compare#motion', 'lab')).toBe(
      'https://example.test/lab?ref=landing&lang=ko&tab=lab#motion'
    );
  });

  it('collapses duplicate tab parameters without reordering unrelated state', () => {
    expect(urlForTab('https://example.test/lab?seed=42&tab=compare&tab=lyap#run', 'lab')).toBe(
      'https://example.test/lab?seed=42&tab=lab#run'
    );
  });

  it('preserves replace intent without changing the URL before a lazy tab mounts', () => {
    const documentEvents = new EventTarget();
    vi.stubGlobal('document', {
      getElementById: () => null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/lab?ref=landing&tab=lab#run' },
      history: { state: { run: 7 }, replaceState }
    });
    let request: TabRequestedDetail | undefined;
    documentEvents.addEventListener(TAB_REQUESTED_EVENT, (event) => {
      request = (event as CustomEvent<TabRequestedDetail>).detail;
    });

    new Shell().switchTo('matrix', 'replace');

    expect(replaceState).not.toHaveBeenCalled();
    expect(request).toEqual({ tab: 'matrix', historyMode: 'replace', fallbackTab: 'lab', requestId: 1 });
  });

  it('rejects a stale lazy completion after newer navigation takes ownership', () => {
    const documentEvents = new EventTarget();
    const getElementById = vi.fn(() => null);
    vi.stubGlobal('document', {
      getElementById,
      querySelector: () => ({ id: 'tab-lab' }),
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/lab?tab=lab' },
      history: { state: null, pushState: vi.fn(), replaceState: vi.fn() }
    });
    const requests: TabRequestedDetail[] = [];
    documentEvents.addEventListener(TAB_REQUESTED_EVENT, (event) => {
      requests.push((event as CustomEvent<TabRequestedDetail>).detail);
    });
    const shell = new Shell();

    shell.switchTo('matrix');
    shell.switchTo('expansion');
    const lookupsBeforeCompletion = getElementById.mock.calls.length;

    expect(requests).toHaveLength(2);
    expect(shell.isCurrentTabRequest(requests[0]!.requestId)).toBe(false);
    expect(shell.isCurrentTabRequest(requests[1]!.requestId)).toBe(true);
    expect(shell.completeTabRequest(requests[0]!)).toBe(false);
    expect(getElementById).toHaveBeenCalledTimes(lookupsBeforeCompletion);
  });

  it('owns one popstate listener and invalidates pending work when disposed', () => {
    const windowEvents = new EventTarget();
    const requests: TabRequestedDetail[] = [];
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/lab?tab=matrix' },
      history: { state: null, pushState: vi.fn(), replaceState: vi.fn() },
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents)
    });
    const routing = new TabRouting({
      canActivate: (tab) => tab === 'lab' || tab === 'matrix',
      syncRail: vi.fn(),
      request: (detail) => requests.push(detail),
      activated: vi.fn()
    });

    routing.bindPopstate();
    routing.bindPopstate();
    windowEvents.dispatchEvent(new Event('popstate'));

    expect(requests).toEqual([{ tab: 'matrix', historyMode: 'none', fallbackTab: 'lab', requestId: 1 }]);
    expect(routing.isCurrentRequest(requests[0]!.requestId)).toBe(true);

    routing.dispose();
    windowEvents.dispatchEvent(new Event('popstate'));
    expect(requests).toHaveLength(1);
    expect(routing.isCurrentRequest(requests[0]!.requestId)).toBe(false);
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
