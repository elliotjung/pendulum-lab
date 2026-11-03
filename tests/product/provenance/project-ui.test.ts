import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResearchProject } from '../../../src/product/provenance/project';
import {
  decodeLocalResearchArchive,
  encodeLocalResearchArchive,
  loadLocalResearchArchive,
  PROJECT_LOCAL_ARCHIVE_BYTES,
  PROJECT_STORAGE_KEY,
  saveLocalResearchArchive
} from '../../../src/product/lab/projects/storage';
import {
  createProjectPackageJob,
  PROJECT_PACKAGE_TIMEOUT_MS,
  type ProjectPackageWorker
} from '../../../src/product/lab/projects/client';
import type { ProjectPackageEvent, ProjectPackageRequest } from '../../../src/product/lab/projects/package-contracts';
import { readResearchProjectSession, saveResearchProjectSession } from '../../../src/product/lab/projects/session';

class FakePackageWorker implements ProjectPackageWorker {
  onmessage: ((event: MessageEvent<ProjectPackageEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  sent: ProjectPackageRequest[] = [];
  terminated = 0;
  postMessage(request: ProjectPackageRequest) {
    this.sent.push(request);
  }
  terminate() {
    this.terminated += 1;
  }
  send(event: ProjectPackageEvent) {
    this.onmessage?.({ data: event } as MessageEvent<ProjectPackageEvent>);
  }
}

afterEach(() => vi.useRealTimers());

describe('S24 local project UI boundary', () => {
  it('round trips every byte through a separate versioned key and leaves existing data untouched', () => {
    const bytes = Uint8Array.from({ length: 65_537 }, (_, index) => index % 256);
    const values = new Map([['pendulum-lab/legacy/fixture', 'original data']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    saveLocalResearchArchive(storage, bytes);
    expect(loadLocalResearchArchive(storage)).toEqual(bytes);
    expect(values.get('pendulum-lab/legacy/fixture')).toBe('original data');
    expect([...values.keys()]).toEqual(['pendulum-lab/legacy/fixture', PROJECT_STORAGE_KEY]);
  });

  it('keeps prior local bytes when quota rejects a new save', () => {
    const original = encodeLocalResearchArchive(new Uint8Array([1, 2, 3]));
    const storage = {
      getItem: () => original,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    expect(() => saveLocalResearchArchive(storage, new Uint8Array([4, 5, 6]))).toThrow('QuotaExceededError');
    expect(loadLocalResearchArchive(storage)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects absent, malformed, unsupported, extra-key and oversized local data without deleting it', () => {
    expect(() => loadLocalResearchArchive({ getItem: () => null })).toThrow(/없습니다/);
    for (const body of [
      '{',
      '[]',
      JSON.stringify({ schema: 'pendulum-research-local/v2', encoding: 'base64', data: 'AAAA' }),
      JSON.stringify({ schema: 'pendulum-research-local/v1', encoding: 'base64', data: 'AAAA', extra: true }),
      '{"schema":"pendulum-research-local/v1","encoding":"base64","data":"AAAA","__proto__":{}}',
      JSON.stringify({ schema: 'pendulum-research-local/v1', encoding: 'base64', data: 'A===' }),
      JSON.stringify({ schema: 'pendulum-research-local/v1', encoding: 'base64', data: '' })
    ])
      expect(() => decodeLocalResearchArchive(body)).toThrow();
    expect(() => encodeLocalResearchArchive(new Uint8Array())).toThrow(/3 MiB/);
    expect(() => encodeLocalResearchArchive(new Uint8Array(PROJECT_LOCAL_ARCHIVE_BYTES + 1))).toThrow(/3 MiB/);
    expect(() => decodeLocalResearchArchive('x'.repeat(4 * 1024 * 1024 + 1025))).toThrow(/상한/);
  });
});

describe('S24 terminable package UI jobs', () => {
  function harness() {
    const worker = new FakePackageWorker();
    const events: ProjectPackageEvent[] = [];
    const request: ProjectPackageRequest = {
      id: 'package-job-1',
      operation: 'import',
      bytes: new Uint8Array([1, 2, 3])
    };
    const job = createProjectPackageJob(
      request,
      (event) => events.push(event),
      () => worker
    );
    return { worker, events, request, job };
  }

  it('terminates cancellation immediately and ignores an already queued terminal response', () => {
    const { worker, events, job } = harness();
    const receive = worker.onmessage!;
    job.cancel();
    receive({
      data: { type: 'imported', id: 'package-job-1', bundle: createResearchProject({ title: 'Late result' }) }
    } as MessageEvent<ProjectPackageEvent>);
    job.cancel();
    job.dispose();
    expect(worker.terminated).toBe(1);
    expect(events).toEqual([{ type: 'cancelled', id: 'package-job-1' }]);
  });

  it('accepts verified import metadata once and ignores unrelated IDs', () => {
    const { worker, events, job } = harness();
    const bundle = createResearchProject({ title: 'Preserved identity' });
    worker.send({ type: 'error', id: 'other-job', message: 'unrelated' });
    worker.send({ type: 'progress', id: 'package-job-1', fraction: 0.25, message: 'Verifying' });
    worker.send({ type: 'imported', id: 'package-job-1', bundle });
    expect(events.map((event) => event.type)).toEqual(['progress', 'imported']);
    expect(worker.terminated).toBe(1);
    job.dispose();
  });

  it('rejects decreasing progress and unexpected terminal operation types', () => {
    const first = harness();
    first.worker.send({ type: 'progress', id: 'package-job-1', fraction: 0.7, message: 'Verifying' });
    first.worker.send({ type: 'progress', id: 'package-job-1', fraction: 0.2, message: 'Regressed' });
    expect(first.events.at(-1)?.type).toBe('error');
    expect(first.worker.terminated).toBe(1);
    const second = harness();
    second.worker.send({ type: 'exported', id: 'package-job-1', bytes: new Uint8Array([1]) });
    expect(second.events[0]?.type).toBe('error');
    expect(second.worker.terminated).toBe(1);
  });

  it('rejects malformed project metadata or file inventory returned from the worker', () => {
    const { worker, events } = harness();
    const bundle = createResearchProject({ title: 'Valid metadata' });
    bundle.files.push({ path: '../unsafe.json', data: new Uint8Array([1]) });
    worker.send({ type: 'imported', id: 'package-job-1', bundle });
    expect(events.at(-1)?.type).toBe('error');
    expect(worker.terminated).toBe(1);
  });

  it('terminates unresponsive work after bounded inactivity', () => {
    vi.useFakeTimers();
    const { worker, events } = harness();
    vi.advanceTimersByTime(PROJECT_PACKAGE_TIMEOUT_MS);
    expect(events).toEqual([{ type: 'error', id: 'package-job-1', message: expect.stringContaining('30초') }]);
    expect(worker.terminated).toBe(1);
  });

  it('does not create a worker for empty or oversized archive input', async () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(64 * 1024 * 1024 + 1)]) {
      const factory = vi.fn(() => new FakePackageWorker());
      const events: ProjectPackageEvent[] = [];
      createProjectPackageJob(
        { id: 'invalid-file', operation: 'import', bytes },
        (event) => events.push(event),
        factory
      );
      await Promise.resolve();
      expect(factory).not.toHaveBeenCalled();
      expect(events[0]?.type).toBe('error');
    }
  });

  it('routes a verified worker reviewer result and capture result to their corresponding jobs', () => {
    const bundle = createResearchProject({ title: 'Independent review' });
    const reviewWorker = new FakePackageWorker();
    const reviewEvents: ProjectPackageEvent[] = [];
    createProjectPackageJob(
      { id: 'review-job', operation: 'reviewer', bundle },
      (event) => reviewEvents.push(event),
      () => reviewWorker
    );
    reviewWorker.send({ type: 'reviewed', id: 'review-job', bytes: new TextEncoder().encode('<!doctype html>') });
    expect(reviewEvents.map((event) => event.type)).toEqual(['reviewed']);
    expect(reviewWorker.terminated).toBe(1);

    const attachWorker = new FakePackageWorker();
    const attachEvents: ProjectPackageEvent[] = [];
    createProjectPackageJob(
      {
        id: 'attach-job',
        operation: 'attach',
        bundle,
        options: { runId: 'run-1', filename: 'native.json', data: new Uint8Array([1]) }
      },
      (event) => attachEvents.push(event),
      () => attachWorker
    );
    attachWorker.send({ type: 'updated', id: 'attach-job', bundle });
    expect(attachEvents.map((event) => event.type)).toEqual(['updated']);
    expect(attachWorker.terminated).toBe(1);
  });
});

describe('S24 project memory across internal routes', () => {
  it('restores the active project, undo project and verified preview in the same document without storage writes', () => {
    const storageAccess = vi.fn(() => {
      throw new Error('Memory retention must not access browser storage');
    });
    const document = Object.defineProperty({}, 'defaultView', { get: storageAccess }) as Document;
    const bundle = createResearchProject({ title: 'Active multi-system project' });
    const previous = createResearchProject({ title: 'Prior project remains available' });
    const pending = createResearchProject({ title: 'Unadopted verified preview' });
    saveResearchProjectSession(document, { bundle, previous, pending });
    const afterRoute = readResearchProjectSession(document);
    expect(afterRoute).toEqual({ bundle, previous, pending });
    expect(afterRoute.bundle).toBe(bundle);
    expect(afterRoute.previous).toBe(previous);
    expect(afterRoute.pending).toBe(pending);
    expect(storageAccess).not.toHaveBeenCalled();
  });

  it('isolates documents and cannot mutate the stored selection by modifying a read wrapper', () => {
    const first = {} as Document,
      second = {} as Document;
    const bundle = createResearchProject({ title: 'Same page route history' });
    saveResearchProjectSession(first, { bundle, previous: undefined, pending: undefined });
    const read = readResearchProjectSession(first);
    read.bundle = undefined;
    expect(readResearchProjectSession(first).bundle).toBe(bundle);
    expect(readResearchProjectSession(second)).toEqual({ bundle: undefined, previous: undefined, pending: undefined });
  });

  it('records adoption and rollback references without altering either project or original artifact bytes', () => {
    const document = {} as Document;
    const original = createResearchProject({ title: 'Original captured project' });
    const imported = createResearchProject({ title: 'Verified imported project' });
    const originalManifest = JSON.stringify(original.project);
    saveResearchProjectSession(document, { bundle: original, previous: undefined, pending: imported });
    saveResearchProjectSession(document, { bundle: imported, previous: original, pending: undefined });
    const adopted = readResearchProjectSession(document);
    expect(adopted.bundle).toBe(imported);
    expect(adopted.previous).toBe(original);
    expect(adopted.pending).toBeUndefined();
    expect(JSON.stringify(original.project)).toBe(originalManifest);
    saveResearchProjectSession(document, { bundle: original, previous: imported, pending: undefined });
    expect(readResearchProjectSession(document).bundle).toBe(original);
    expect(readResearchProjectSession(document).previous).toBe(imported);
  });
});
