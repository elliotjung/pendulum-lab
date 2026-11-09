import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPANSION_MODEL_IDS, type ExpansionSuiteConfig } from '../../../../src/physics/expandedModels-types';
import { integratorRegistry } from '../../../../src/physics/integratorRegistry';
import { expansionModelDefinition } from '../../../../src/physics/expandedModels-factory';
import { runExpansionSuite } from '../../../../src/physics/expandedModels-runners';
import {
  archiveLegacyExpansion,
  buildLegacyExpansionRequest,
  decodeLegacyExpansionResult,
  encodeLegacyExpansionResult,
  executeLegacyExpansion,
  parseLegacyExpansion
} from '../../../../src/product/lab/experiments/legacy-expansion';
import {
  createLegacyExpansionExecutor,
  type LegacyExpansionEvent,
  type LegacyExpansionWorker
} from '../../../../src/product/lab/experiments/legacy-expansion-client';
import type { IntegratorId } from '../../../../src/types/domain';
const methods = Object.keys(integratorRegistry) as IntegratorId[];
const configuration = (model: ExpansionSuiteConfig['model'] = 'driven'): ExpansionSuiteConfig => ({
  model,
  methods,
  dt: 0.01,
  horizon: 0.1,
  sampleLimit: 24,
  bifurcationColumns: 4
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('S28 complete preserved native expansion suite', () => {
  it.each(EXPANSION_MODEL_IDS)('%s retains all16 native methods and the complete original outputs', async (model) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    vi.spyOn(performance, 'now').mockReturnValue(10);
    const config = configuration(model),
      request = buildLegacyExpansionRequest(config, { sourceText: '#expansion=exact-source' });
    const archive = await executeLegacyExpansion(request);
    const actual = decodeLegacyExpansionResult(archive.result),
      native = runExpansionSuite(config);
    expect(methods).toHaveLength(16);
    expect(actual).toEqual(native);
    expect(actual.rows.map((row) => row.method)).toEqual(methods);
    expect(actual.rows.every((row) => row.completedSteps === 10)).toBe(true);
    expect(archive.request.config).toEqual(config);
    expect(archive.request.sourceText).toBe('#expansion=exact-source');
    expect(archive.resultSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await parseLegacyExpansion(JSON.stringify(archive))).toEqual(archive);
  });
  it('retains native whole-spectrum Lyapunov computation and exact original settings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    vi.spyOn(performance, 'now').mockReturnValue(10);
    const config = { ...configuration(), methods: ['rk4'] as const };
    const request = buildLegacyExpansionRequest(config, { includeLyapunov: true });
    const actual = decodeLegacyExpansionResult((await executeLegacyExpansion(request)).result);
    expect(actual).toEqual(runExpansionSuite(config, { includeLyapunov: true }));
    expect(actual.lyapunov!.spectrum).toHaveLength(expansionModelDefinition('driven').dimension);
    expect(actual.lyapunov!.settings.dt).toBe(request.resolved.lyapunov!.dt);
    expect(actual.lyapunov!.settings.steps).toBe(request.resolved.lyapunov!.steps);
  });
  it('declares native defaults and effective rounded/clamped steps, samples and columns without changing source config', () => {
    const config = { model: 'driven' as const, dt: 0.01, horizon: 0.001, sampleLimit: 1, bifurcationColumns: 1 };
    const request = buildLegacyExpansionRequest(config);
    expect(request.config).toEqual(config);
    expect(request.resolved).toMatchObject({
      steps: 10,
      effectiveDuration: 0.1,
      requestedHorizon: 0.001,
      sampleLimit: 24,
      bifurcationColumns: 4,
      bifurcationSteps: 100,
      ghostEpsilon: 1e-5
    });
    expect(request.resolved.methods.length).toBeGreaterThan(1);
    config.horizon = 1;
    expect(request.config.horizon).toBe(0.001);
  });
  it('preserves IEEE nonfinite and negative-zero native output values with explicit versioned tags', () => {
    const native = runExpansionSuite({ ...configuration(), methods: ['rk4'] });
    native.rows[0]!.finalState = [NaN, Infinity, -Infinity];
    native.rows[0]!.energyDrift = -0;
    const encoded = encodeLegacyExpansionResult(native),
      decoded = decodeLegacyExpansionResult(encoded);
    expect(Number.isNaN(decoded.rows[0]!.finalState[0])).toBe(true);
    expect(decoded.rows[0]!.finalState[1]).toBe(Infinity);
    expect(decoded.rows[0]!.finalState[2]).toBe(-Infinity);
    expect(Object.is(decoded.rows[0]!.energyDrift, -0)).toBe(true);
    expect(JSON.stringify(encoded)).toContain('$nativeNumber');
  });
  it.each([
    { model: 'unknown' },
    { model: 'driven', methods: [] },
    { model: 'driven', methods: ['rk4', 'rk4'] },
    { model: 'driven', methods: ['not-a-method'] },
    { model: 'driven', dt: 0 },
    { model: 'driven', horizon: 301 },
    { model: 'driven', initialState: [1] },
    { model: 'driven', parameterOverrides: { ignored: 1 } },
    { model: 'driven', parameterOverrides: { length: 0 } },
    { model: 'chain', parameterOverrides: { links: 2.5 } },
    { model: 'driven', ghostEpsilon: '0.01' },
    { model: 'driven', ignored: true }
  ])('rejects malformed/ignored source settings %j', (invalid) => {
    expect(() => buildLegacyExpansionRequest(invalid as unknown as ExpansionSuiteConfig)).toThrow();
  });
  it('rejects excessive work and source accessors without coercion or invocation', () => {
    expect(() =>
      buildLegacyExpansionRequest({ model: 'chain', methods, horizon: 300, dt: 1e-6 }, { includeLyapunov: true })
    ).toThrow(/32000000/);
    const source = {};
    Object.defineProperty(source, 'model', {
      enumerable: true,
      get() {
        throw new Error('invoked');
      }
    });
    expect(() => buildLegacyExpansionRequest(source as ExpansionSuiteConfig)).toThrow(/접근자/);
    const native = runExpansionSuite({ ...configuration(), methods: ['rk4'] });
    Object.defineProperty(native.rows[0], 'elapsedMs', {
      enumerable: true,
      get() {
        throw new Error('invoked');
      }
    });
    expect(() => encodeLegacyExpansionResult(native)).toThrow(/접근자/);
  });
  it('rejects stale lineage, changed methods, malformed native plots and checksum tampering', async () => {
    const request = buildLegacyExpansionRequest({ ...configuration(), methods: ['rk4'] });
    const archive = await executeLegacyExpansion(request);
    const changed = structuredClone(archive);
    (changed.request.resolved as { steps: number }).steps++;
    await expect(parseLegacyExpansion(JSON.stringify(changed))).rejects.toThrow(/계보/);
    const wrongMethods = decodeLegacyExpansionResult(archive.result);
    wrongMethods.rows[0]!.method = 'euler';
    await expect(archiveLegacyExpansion(request, wrongMethods)).rejects.toThrow(/계보/);
    const malformed = decodeLegacyExpansionResult(archive.result);
    malformed.phaseHeatmap.counts[0] = [];
    await expect(archiveLegacyExpansion(request, malformed)).rejects.toThrow(/heatmap/);
    const corrupted = structuredClone(archive);
    (corrupted as { resultSha256: string }).resultSha256 = '0'.repeat(64);
    await expect(parseLegacyExpansion(JSON.stringify(corrupted))).rejects.toThrow(/checksum/);
    await expect(parseLegacyExpansion('{"schema":"a","schema":"b"}')).rejects.toThrow(/Duplicate/);
    await expect(parseLegacyExpansion('{"schema":"old"}')).rejects.toThrow();
  });
});

class WorkerStub implements LegacyExpansionWorker {
  onmessage: LegacyExpansionWorker['onmessage'] = null;
  onerror: LegacyExpansionWorker['onerror'] = null;
  onmessageerror: LegacyExpansionWorker['onmessageerror'] = null;
  terminated = false;
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
  send(event: LegacyExpansionEvent) {
    this.onmessage?.({ data: event } as MessageEvent<LegacyExpansionEvent>);
  }
}
describe('S28 native expansion worker lifecycle', () => {
  it('reports actual phases, validates checksum, and terminates after a complete result', async () => {
    const request = buildLegacyExpansionRequest({ ...configuration(), methods: ['rk4'] }),
      archive = await executeLegacyExpansion(request);
    const worker = new WorkerStub(),
      events: LegacyExpansionEvent[] = [];
    const job = createLegacyExpansionExecutor(() => worker)(request, (event) => events.push(event));
    worker.send({ type: 'started', id: request.id });
    worker.send({ type: 'calculated', id: request.id });
    worker.send({ type: 'result', id: request.id, archive });
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('result'));
    expect(events.map((event) => event.type)).toEqual(['started', 'calculated', 'result']);
    expect(worker.terminated).toBe(true);
    job.dispose();
  });
  it('rejects out-of-order stages and invalid result checksums', async () => {
    const request = buildLegacyExpansionRequest({ ...configuration(), methods: ['rk4'] }),
      worker = new WorkerStub(),
      events: LegacyExpansionEvent[] = [];
    createLegacyExpansionExecutor(() => worker)(request, (event) => events.push(event));
    worker.send({ type: 'calculated', id: request.id });
    expect(events.at(-1)?.type).toBe('error');
    expect(worker.terminated).toBe(true);
    const second = new WorkerStub(),
      archive = await executeLegacyExpansion(request);
    (archive as { resultSha256: string }).resultSha256 = '0'.repeat(64);
    createLegacyExpansionExecutor(() => second)(request, (event) => events.push(event));
    second.send({ type: 'started', id: request.id });
    second.send({ type: 'calculated', id: request.id });
    second.send({ type: 'result', id: request.id, archive });
    await vi.waitFor(() => expect(second.terminated).toBe(true));
    expect(events.at(-1)?.type).toBe('error');
  });
  it('cancels cleanly, ignores late results and times out unresponsive native workers', () => {
    vi.useFakeTimers();
    const request = buildLegacyExpansionRequest(configuration());
    const worker = new WorkerStub(),
      events: LegacyExpansionEvent[] = [];
    const job = createLegacyExpansionExecutor(() => worker)(request, (event) => events.push(event));
    const late = worker.onmessage;
    job.dispose();
    late?.({ data: { type: 'started', id: request.id } } as MessageEvent<LegacyExpansionEvent>);
    vi.advanceTimersByTime(120_000);
    expect(events).toEqual([]);
    expect(worker.terminated).toBe(true);
    const stalled = new WorkerStub();
    createLegacyExpansionExecutor(() => stalled)(request, (event) => events.push(event));
    vi.advanceTimersByTime(120_000);
    expect(events.at(-1)?.type).toBe('error');
    expect(stalled.terminated).toBe(true);
  });
});
