import { describe, expect, it } from 'vitest';
import { createOgyJob } from '../../../src/product/lab/compatibility-tools/ogy-client';
import { defaultOgySettings, type OgyRequest } from '../../../src/product/lab/compatibility-tools/contracts';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import { executeOgyRequest } from '../../../src/product/lab/compatibility-tools/ogy';

function fixture(): OgyRequest {
  const source = toCanonicalPlanar(defaultPlanarConfig());
  if (!source.ok) throw new Error('Fixture');
  return { id: 'job-1', source: source.value, settings: { ...defaultOgySettings(), steps: 32 } };
}
class WorkerStub {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = 0;
  posted: unknown;
  postMessage(value: unknown) {
    this.posted = value;
  }
  terminate() {
    this.terminated++;
  }
  send(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent);
  }
}
describe('S28 isolated OGY worker lifecycle', () => {
  it('preserves detached inputs, ignores stale replies and closes on a real native result', async () => {
    const request = fixture(),
      worker = new WorkerStub(),
      progress: number[] = [];
    const job = createOgyJob(
      request,
      (value) => progress.push(value),
      () => worker as unknown as Worker
    );
    expect(worker.posted).toEqual(request);
    expect(worker.posted).not.toBe(request);
    worker.send({ id: 'old', type: 'progress', value: 1 });
    worker.send({ id: request.id, type: 'progress', value: 0.5, message: 'half' });
    expect(progress).toEqual([0.5]);
    const artifact = executeOgyRequest(request);
    worker.send({ id: request.id, type: 'result', artifact });
    expect(await job.result).toEqual(artifact);
    job.cancel();
    expect(worker.terminated).toBe(1);
  });
  it('cancels by terminating immediately and discards every late result', async () => {
    const request = fixture(),
      worker = new WorkerStub();
    const job = createOgyJob(
      request,
      () => {},
      () => worker as unknown as Worker
    );
    const assertion = expect(job.result).rejects.toMatchObject({ name: 'AbortError' });
    job.cancel();
    job.cancel();
    worker.send({ id: request.id, type: 'result', artifact: executeOgyRequest(request) });
    await assertion;
    expect(worker.terminated).toBe(1);
  });
  it('surfaces native errors and startup failure without partial results', async () => {
    const request = fixture(),
      worker = new WorkerStub();
    const job = createOgyJob(
      request,
      () => {},
      () => worker as unknown as Worker
    );
    const assertion = expect(job.result).rejects.toThrow('native failure');
    worker.send({ id: request.id, type: 'error', message: 'native failure' });
    await assertion;
    expect(worker.terminated).toBe(1);
    const broken = createOgyJob(
      request,
      () => {},
      () => {
        throw new Error('offline');
      }
    );
    await expect(broken.result).rejects.toThrow('worker');
  });
  it('terminates a crashed worker and allows the caller to construct a fresh job', async () => {
    const request = fixture(),
      worker = new WorkerStub();
    const job = createOgyJob(
      request,
      () => {},
      () => worker as unknown as Worker
    );
    const assertion = expect(job.result).rejects.toThrow('worker');
    worker.onerror?.();
    await assertion;
    expect(worker.terminated).toBe(1);
    const retry = new WorkerStub();
    const restarted = createOgyJob(
      request,
      () => {},
      () => retry as unknown as Worker
    );
    retry.send({ id: request.id, type: 'result', artifact: executeOgyRequest(request) });
    expect((await restarted.result).request.id).toBe(request.id);
  });
});
