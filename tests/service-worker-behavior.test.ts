import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, test, vi } from 'vitest';

const ORIGIN = 'https://pendulum.test';
const SHELL_CACHE = 'pendulum-lab-v10.36.0-__BUILD_REVISION__-shell';
const RUNTIME_CACHE = 'pendulum-lab-v10.36.0-__BUILD_REVISION__-runtime';

interface RequestLike {
  method: string;
  mode: string;
  url: string;
}

type CacheKey = string | RequestLike;
type EventListener = (event: Record<string, unknown>) => void;

function keyOf(request: CacheKey): string {
  return typeof request === 'string' ? request : request.url;
}

class MemoryCache {
  readonly addAllCalls: string[][] = [];
  readonly deleteCalls: string[] = [];
  readonly putCalls: Array<{ request: CacheKey; response: unknown }> = [];
  private readonly entries = new Map<string, { request: CacheKey; response: unknown }>();

  async addAll(requests: string[]): Promise<void> {
    this.addAllCalls.push([...requests]);
    for (const request of requests) {
      this.entries.set(keyOf(request), { request, response: new Response(`shell:${request}`) });
    }
  }

  async delete(request: CacheKey): Promise<boolean> {
    const key = keyOf(request);
    this.deleteCalls.push(key);
    return this.entries.delete(key);
  }

  async keys(): Promise<CacheKey[]> {
    return [...this.entries.values()].map(({ request }) => request);
  }

  async match(request: CacheKey): Promise<unknown> {
    return this.entries.get(keyOf(request))?.response;
  }

  async put(request: CacheKey, response: unknown): Promise<void> {
    this.putCalls.push({ request, response });
    this.entries.set(keyOf(request), { request, response });
  }

  has(request: CacheKey): boolean {
    return this.entries.has(keyOf(request));
  }

  get size(): number {
    return this.entries.size;
  }
}

class MemoryCacheStorage {
  readonly deletedNames: string[] = [];
  private readonly stores = new Map<string, MemoryCache>();

  async delete(name: string): Promise<boolean> {
    this.deletedNames.push(name);
    return this.stores.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async match(request: CacheKey): Promise<unknown> {
    for (const cache of this.stores.values()) {
      const response = await cache.match(request);
      if (response !== undefined) return response;
    }
    return undefined;
  }

  async open(name: string): Promise<MemoryCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.stores.set(name, cache);
    }
    return cache;
  }
}

class TrackedResponse {
  consumed = false;
  cloneCalls = 0;
  clonedBeforeConsumption = false;

  constructor(
    readonly label: string,
    readonly ok = true
  ) {}

  clone(): { source: string; type: 'clone' } {
    this.cloneCalls += 1;
    this.clonedBeforeConsumption = !this.consumed;
    if (this.consumed) throw new TypeError('Body has already been consumed');
    return { source: this.label, type: 'clone' };
  }
}

interface DispatchedEvent {
  readonly response: Promise<unknown> | undefined;
  readonly waits: Promise<unknown>[];
  settle(): Promise<unknown[]>;
}

interface Harness {
  readonly caches: MemoryCacheStorage;
  readonly claim: ReturnType<typeof vi.fn>;
  readonly fetch: ReturnType<typeof vi.fn>;
  readonly skipWaiting: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  dispatch(type: string, request?: RequestLike): DispatchedEvent;
}

let serviceWorkerSource = '';

beforeAll(async () => {
  serviceWorkerSource = await readFile('public/sw.js', 'utf8');
});

function request(path: string, mode = 'cors', method = 'GET'): RequestLike {
  return { method, mode, url: new URL(path, ORIGIN).href };
}

function createHarness(
  fetchImplementation: (request: RequestLike) => Promise<unknown> = async () => {
    throw new Error('Unexpected fetch');
  }
): Harness {
  const listeners = new Map<string, EventListener>();
  const caches = new MemoryCacheStorage();
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn(async () => undefined);
  const warn = vi.fn();
  const fetchMock = vi.fn(fetchImplementation);
  const serviceWorkerGlobal = {
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    clients: { claim },
    location: { origin: ORIGIN },
    skipWaiting
  };

  runInNewContext(
    serviceWorkerSource,
    {
      Response,
      Request,
      URL,
      caches,
      console: { warn },
      fetch: fetchMock,
      self: serviceWorkerGlobal
    },
    { filename: 'public/sw.js', timeout: 1_000 }
  );

  return {
    caches,
    claim,
    fetch: fetchMock,
    skipWaiting,
    warn,
    dispatch(type, eventRequest) {
      const listener = listeners.get(type);
      if (!listener) throw new Error(`No ${type} listener registered`);
      const waits: Promise<unknown>[] = [];
      let responsePromise: Promise<unknown> | undefined;
      listener({
        request: eventRequest,
        respondWith(response: PromiseLike<unknown> | unknown) {
          responsePromise = Promise.resolve(response);
        },
        waitUntil(work: PromiseLike<unknown> | unknown) {
          waits.push(Promise.resolve(work));
        }
      });
      return {
        response: responsePromise,
        waits,
        settle: () => Promise.all(waits)
      };
    }
  };
}

describe('service worker behavior', () => {
  test('install precaches the shell and waits for explicit user activation', async () => {
    const harness = createHarness();
    const event = harness.dispatch('install');

    expect(event.waits).toHaveLength(1);
    await event.settle();

    const shell = await harness.caches.open(SHELL_CACHE);
    expect(shell.addAllCalls).toEqual([['./', './index.html', './app.html', './manifest.webmanifest']]);
    expect(harness.skipWaiting).not.toHaveBeenCalled();
  });

  test('activate retains the current and previous cache generations and claims clients', async () => {
    const harness = createHarness();
    await harness.caches.open(SHELL_CACHE);
    await harness.caches.open(RUNTIME_CACHE);
    await harness.caches.open('pendulum-lab-v10.34.0-shell');
    await harness.caches.open('pendulum-lab-v10.34.0-runtime');
    await harness.caches.open('pendulum-lab-v10.35.0-shell');
    await harness.caches.open('pendulum-lab-v10.35.0-runtime');
    await harness.caches.open('another-application-cache');

    const event = harness.dispatch('activate');
    expect(event.waits).toHaveLength(1);
    await event.settle();

    expect(await harness.caches.keys()).toEqual([
      SHELL_CACHE,
      RUNTIME_CACHE,
      'pendulum-lab-v10.35.0-shell',
      'pendulum-lab-v10.35.0-runtime',
      'another-application-cache'
    ]);
    expect(harness.caches.deletedNames).toEqual(['pendulum-lab-v10.34.0-shell', 'pendulum-lab-v10.34.0-runtime']);
    expect(harness.claim).toHaveBeenCalledOnce();
  });

  test.each([
    ['asset', request('/assets/app.js')],
    ['navigation', request('/app.html', 'navigate')]
  ])('clones a successful same-origin %s response before it can be consumed', async (_label, target) => {
    const networkResponse = new TrackedResponse(target.url);
    const harness = createHarness(async () => networkResponse);

    const event = harness.dispatch('fetch', target);
    expect(event.waits).toHaveLength(1);
    const delivered = await event.response;
    expect(delivered).toBe(networkResponse);
    networkResponse.consumed = true;
    await event.settle();

    const runtime = await harness.caches.open(RUNTIME_CACHE);
    expect(networkResponse.cloneCalls).toBe(1);
    expect(networkResponse.clonedBeforeConsumption).toBe(true);
    if (target.mode === 'navigate') {
      expect(runtime.putCalls).toHaveLength(1);
      expect(keyOf(runtime.putCalls[0]!.request)).toBe(new URL(target.url).origin + new URL(target.url).pathname);
    } else {
      expect(runtime.putCalls).toEqual([{ request: target, response: { source: target.url, type: 'clone' } }]);
    }
  });

  test('does not cache a non-ok network response', async () => {
    const networkResponse = new TrackedResponse('unavailable', false);
    const harness = createHarness(async () => networkResponse);
    const event = harness.dispatch('fetch', request('/assets/unavailable.js'));

    expect(await event.response).toBe(networkResponse);
    await event.settle();

    const runtime = await harness.caches.open(RUNTIME_CACHE);
    expect(networkResponse.cloneCalls).toBe(0);
    expect(runtime.size).toBe(0);
  });

  test('settles background work and serves the shell when navigation fetch fails', async () => {
    const harness = createHarness(async () => {
      throw new TypeError('offline');
    });
    const shell = await harness.caches.open(SHELL_CACHE);
    const offlineShell = new Response('offline shell');
    await shell.put('./index.html', offlineShell);

    const event = harness.dispatch('fetch', request('/missing-route', 'navigate'));
    expect(await event.response).toBe(offlineShell);
    await expect(event.settle()).resolves.toHaveLength(1);
    expect(harness.warn).toHaveBeenCalledWith('Pendulum Lab navigation cache update failed.', expect.any(TypeError));
    expect((await harness.caches.open(RUNTIME_CACHE)).size).toBe(0);
  });

  test('settles cache-update work even when an asset network request rejects', async () => {
    const harness = createHarness(async () => {
      throw new TypeError('offline');
    });
    const event = harness.dispatch('fetch', request('/assets/offline.js'));

    await expect(event.response).rejects.toThrow('offline');
    await expect(event.settle()).resolves.toHaveLength(1);
    expect(harness.warn).toHaveBeenCalledWith('Pendulum Lab runtime cache update failed.', expect.any(TypeError));
  });

  test('keeps at most 96 runtime entries by evicting the oldest insertion', async () => {
    const harness = createHarness(async (target) => new TrackedResponse(target.url));
    const runtime = await harness.caches.open(RUNTIME_CACHE);
    for (let index = 0; index < 96; index += 1) {
      const target = request(`/runtime/${index}.js`);
      await runtime.put(target, new Response(String(index)));
    }

    const newest = request('/runtime/newest.js');
    const event = harness.dispatch('fetch', newest);
    await event.response;
    await event.settle();

    expect(runtime.size).toBe(96);
    expect(runtime.has(request('/runtime/0.js'))).toBe(false);
    expect(runtime.has(request('/runtime/1.js'))).toBe(true);
    expect(runtime.has(newest)).toBe(true);
  });

  test('uses cached assets without a network request or redundant write', async () => {
    const harness = createHarness();
    const runtime = await harness.caches.open(RUNTIME_CACHE);
    const target = request('/assets/cached.js');
    const cached = new Response('cached');
    await runtime.put(target, cached);
    runtime.putCalls.length = 0;

    const event = harness.dispatch('fetch', target);
    expect(await event.response).toBe(cached);
    await event.settle();

    expect(harness.fetch).not.toHaveBeenCalled();
    expect(runtime.putCalls).toHaveLength(0);
  });

  test.each([
    request('/submit', 'cors', 'POST'),
    { method: 'GET', mode: 'cors', url: 'https://cdn.example/assets/app.js' }
  ])('ignores non-cacheable request %#', (target) => {
    const harness = createHarness();
    const event = harness.dispatch('fetch', target);

    expect(event.response).toBeUndefined();
    expect(event.waits).toHaveLength(0);
    expect(harness.fetch).not.toHaveBeenCalled();
  });
});
