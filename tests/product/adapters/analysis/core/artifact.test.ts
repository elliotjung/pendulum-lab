import { describe, expect, it, vi } from 'vitest';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../../../../src/product/adapters/analysis/core/source';
import { runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import { defaultCoreSettings } from '../../../../../src/product/adapters/analysis/core/settings';
import {
  createCoreDiagnosticArtifact,
  exportCoreDiagnosticArtifact,
  importCoreDiagnosticArtifact,
  validateCoreDiagnosticArtifact
} from '../../../../../src/product/adapters/analysis/core/artifact';
import {
  CORE_DIAGNOSTIC_KINDS,
  type CoreDiagnosticKind
} from '../../../../../src/product/adapters/analysis/core/contracts';

const metadata = { artifactId: 'artifact-test', inputRunId: 'run-test', createdAt: '2026-10-20T00:00:00.000Z' };
function fixture(kind: CoreDiagnosticKind, duration = 0.4) {
  const config = { ...defaultPlanarConfig(), step: 0.01, duration },
    canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('canonical fixture');
  const simulation = createPlanarSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const request = {
    id: 'artifact-job',
    kind,
    experiment: canonical.value,
    series: createDiagnosticSeries(canonical.value, samples),
    settings: defaultCoreSettings(kind, canonical.value)
  };
  return createCoreDiagnosticArtifact(request, runCoreDiagnostic(request), metadata);
}
describe('S18 versioned core diagnostic artifact', () => {
  for (const kind of CORE_DIAGNOSTIC_KINDS)
    it(`${kind} reload preserves native result, input experiment, settings, units, and lineage`, () => {
      const original = fixture(kind),
        imported = importCoreDiagnosticArtifact(exportCoreDiagnosticArtifact(original));
      expect(imported).toEqual(original);
      expect(imported.request.experiment.schema).toBe('pendulum-experiment/v1');
      expect(imported.inputRunId).toBe('run-test');
    });
  it('supports a real large retained series beyond the existing experiment/share limits', () => {
    const artifact = fixture('state-time', 30),
      text = exportCoreDiagnosticArtifact(artifact);
    expect(text.length).toBeGreaterThan(256 * 1024);
    expect(importCoreDiagnosticArtifact(text)).toEqual(artifact);
  });
  it('refuses unknown versions, settings, native model units, and result units/methods', () => {
    const original = fixture('fft');
    for (const mutate of [
      (a: typeof original) => {
        a.algorithmVersion = 'future' as typeof a.algorithmVersion;
      },
      (a: typeof original) => {
        a.request.experiment = { ...a.request.experiment, modelVersion: 'future' };
      },
      (a: typeof original) => {
        a.request.settings.ignored = 1;
      },
      (a: typeof original) => {
        a.request.series.units[0] = 'degree';
      },
      (a: typeof original) => {
        a.request.series.energyUnit = 'erg';
      },
      (a: typeof original) => {
        a.result.units[0] = 'rad/s';
      },
      (a: typeof original) => {
        a.result.method = 'invented';
      }
    ]) {
      const copy = structuredClone(original);
      mutate(copy);
      expect(() => importCoreDiagnosticArtifact(JSON.stringify(copy))).toThrow();
      expect(original).toEqual(fixture('fft'));
    }
  });
  it('rejects unknown envelope/series fields, unsafe keys, sparse arrays, and getter execution', () => {
    const artifact = fixture('state-time');
    expect(() => importCoreDiagnosticArtifact(JSON.stringify({ ...artifact, extra: 1 }))).toThrow('필드');
    expect(() =>
      importCoreDiagnosticArtifact(
        JSON.stringify({
          ...artifact,
          request: { ...artifact.request, series: { ...artifact.request.series, extra: true } }
        })
      )
    ).toThrow('필드');
    expect(() => importCoreDiagnosticArtifact('{"__proto__":{"polluted":true}}')).toThrow('키');
    const getter = vi.fn(() => 'oops'),
      malicious = { ...artifact };
    Object.defineProperty(malicious, 'result', { enumerable: true, get: getter });
    expect(() => validateCoreDiagnosticArtifact(malicious)).toThrow('getter');
    expect(getter).not.toHaveBeenCalled();
    const sparse = structuredClone(artifact);
    delete sparse.request.series.states[1]![0];
    expect(() => validateCoreDiagnosticArtifact(sparse)).toThrow('조밀 배열');
    expect(() => importCoreDiagnosticArtifact('{bad')).toThrow('손상');
  });
  it('rejects invalid lineage, timestamps, result kind/rows, and horizon encodings', () => {
    const original = fixture('shadowing');
    for (const mutate of [
      (a: typeof original) => {
        a.inputRunId = '../local-path';
      },
      (a: typeof original) => {
        a.createdAt = '2026-02-31T00:00:00.000Z';
      },
      (a: typeof original) => {
        a.result.kind = 'fft';
      },
      (a: typeof original) => {
        a.result.rows[0]!.pop();
      },
      (a: typeof original) => {
        (a.result.details as Record<string, unknown>).nullHorizonMeaning = 'unknown';
      }
    ]) {
      const copy = structuredClone(original);
      mutate(copy);
      expect(() => importCoreDiagnosticArtifact(JSON.stringify(copy))).toThrow();
    }
    expect((original.result.details as Record<string, unknown>).horizon).toBeNull();
  });
});
