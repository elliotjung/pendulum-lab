import { describe, expect, it, vi } from 'vitest';
import { STABILITY_KINDS } from '../../../src/product/adapters/analysis/stability/contracts';
import { STABILITY_SOURCES, defaultStabilitySettings } from '../../../src/product/adapters/analysis/stability/settings';
import {
  fromStabilityAnalysis,
  restoredStability,
  toStabilityAnalysis
} from '../../../src/product/adapters/analysis/stability/state';
import {
  defaultDrivenConfig,
  toCanonicalDriven,
  fromCanonicalDriven,
  createDrivenSimulation
} from '../../../src/product/lab/views/driven-diagnostics';
import { encodeShareToken, decodeShareToken } from '../../../src/product/persistence/share';
import type { AnalysisState } from '../../../src/product/contracts/experiment';
import * as nativeDriven from '../../../src/product/adapters/physics/driven';
import { createDrivenModel } from '../../../src/product/lab/views/driven-model';
import { serializeDrivenConfig, parseDrivenConfig } from '../../../src/product/lab/views/driven-storage';
import {
  createDrivenWorkerSession,
  type DrivenWorkerEvent,
  type DrivenWorkerRequest
} from '../../../src/product/adapters/physics/driven-worker-protocol';
import type { DrivenWorker } from '../../../src/product/adapters/physics/driven-client';
import { unwrap } from '../experiments/fixtures';

describe('S27 exact stability workflow settings in Lab', () => {
  for (const kind of STABILITY_KINDS)
    for (const source of STABILITY_SOURCES[kind])
      it(`${kind}/${source} retains settings, units and physical restart through sharing`, () => {
        const settings = defaultStabilitySettings(kind, undefined, source),
          entry = toStabilityAnalysis({ kind, settings });
        expect(fromStabilityAnalysis(entry)).toEqual({ kind, settings });
        const config = { ...defaultDrivenConfig(), duration: 0.02, analyses: [entry] },
          canonical = unwrap(toCanonicalDriven(config));
        expect(unwrap(decodeShareToken(unwrap(encodeShareToken(canonical))))).toEqual(canonical);
        expect(restoredStability(canonical)).toEqual({ kind, settings });
        const restored = unwrap(fromCanonicalDriven(canonical));
        expect(restored.analyses).toEqual([entry]);
        expect(createDrivenSimulation(restored).step()).toEqual(createDrivenSimulation(config).step());
      });
  it('keeps native rejection intact and sends only physical inputs to the existing worker', () => {
    const entry = toStabilityAnalysis({ kind: 'floquet', settings: defaultStabilitySettings('floquet') });
    const config = { ...defaultDrivenConfig(), duration: 0.02, analyses: [entry] };
    expect(nativeDriven.validateDrivenConfig(config).ok).toBe(false);
    expect(nativeDriven.toCanonicalDriven(config).ok).toBe(false);
    expect(parseDrivenConfig(serializeDrivenConfig(config), config.systemId)).toEqual(config);
    const requests: DrivenWorkerRequest[] = [],
      session = createDrivenWorkerSession(() => 0);
    const worker: DrivenWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (r) => requests.push(r),
      terminate: vi.fn()
    };
    const model = createDrivenModel(config, () => worker);
    model.step();
    expect(requests[0]).toMatchObject({ type: 'initialize', config: { analyses: [] } });
    while (requests.length) {
      const event = session.handle(requests.shift()!);
      worker.onmessage?.({ data: event } as MessageEvent<DrivenWorkerEvent>);
    }
    expect(model.state.sample).toEqual(nativeDriven.createDrivenSimulation({ ...config, analyses: [] }).step());
    expect(model.state.config.analyses).toEqual([entry]);
    model.dispose();
  });
  it('keeps SI guess/frequency/forcing units distinct from independent normal-form coordinates', () => {
    const settings = { ...defaultStabilitySettings('continuation'), parameter: 'forcingAmplitude' },
      entry = toStabilityAnalysis({ kind: 'continuation', settings });
    expect(entry.settings.guess0?.unit).toBe('rad');
    expect(entry.settings.guess1?.unit).toBe('rad/s');
    expect(entry.settings.start?.unit).toBe('rad/s^2');
    const benchmark = toStabilityAnalysis({
      kind: 'pseudo-arclength',
      settings: defaultStabilitySettings('pseudo-arclength')
    });
    expect(benchmark.settings.start?.unit).toBe('1');
  });
  it.each(['unit', 'missing', 'extra', 'id', 'version', 'duplicate', 'boolean', 'vector', 'range'])(
    'rejects malformed %s without reverting to defaults',
    (mutation) => {
      const entry = structuredClone(
        toStabilityAnalysis({ kind: 'floquet', settings: defaultStabilitySettings('floquet') })
      ) as unknown as {
        id: string;
        algorithmVersion: string;
        settings: Record<string, unknown>;
        options: Record<string, unknown>;
      };
      if (mutation === 'unit') entry.settings.guess0 = { kind: 'scalar', value: 0, unit: '1' };
      if (mutation === 'missing') delete entry.settings.stepsPerPeriod;
      if (mutation === 'extra') entry.settings.extra = { kind: 'scalar', value: 1, unit: '1' };
      if (mutation === 'id') entry.id = 'analysis:melnikov';
      if (mutation === 'version') entry.algorithmVersion = 'stability-workflow-v2';
      if (mutation === 'duplicate') entry.options.period = '1';
      if (mutation === 'boolean') entry.options.source = true;
      if (mutation === 'vector') entry.settings.guess0 = { kind: 'vector', values: [0], unit: 'rad' };
      if (mutation === 'range') entry.settings.stepsPerPeriod = { kind: 'scalar', value: 999999, unit: '1' };
      expect(() => fromStabilityAnalysis(entry as unknown as AnalysisState)).toThrow();
    }
  );
  it('does not execute accessors in untrusted saved settings', () => {
    let reads = 0;
    const entry = Object.defineProperty({}, 'algorithmVersion', {
      enumerable: true,
      get() {
        reads++;
        return 'stability-workflow-v1';
      }
    });
    expect(() => fromStabilityAnalysis(entry as AnalysisState)).toThrow();
    expect(reads).toBe(0);
  });
});
