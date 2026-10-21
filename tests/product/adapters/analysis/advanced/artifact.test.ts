import { describe, expect, it, vi } from 'vitest';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../../../../src/product/adapters/analysis/core/source';
import { runAdvancedDiagnostic } from '../../../../../src/product/adapters/analysis/advanced/execute';
import { defaultAdvancedSettings } from '../../../../../src/product/adapters/analysis/advanced/settings';
import {
  createAdvancedDiagnosticArtifact,
  exportAdvancedDiagnosticArtifact,
  importAdvancedDiagnosticArtifact,
  validateAdvancedDiagnosticArtifact
} from '../../../../../src/product/adapters/analysis/advanced/artifact';
import {
  ADVANCED_DIAGNOSTIC_KINDS,
  ADVANCED_DIAGNOSTIC_LIMITS,
  type AdvancedDiagnosticKind,
  type AdvancedDiagnosticRequest
} from '../../../../../src/product/adapters/analysis/advanced/contracts';

const metadata = {
  artifactId: 'advanced-artifact-test',
  inputRunId: 'run-test',
  createdAt: '2026-10-21T00:00:00.000Z'
};
function request(kind: AdvancedDiagnosticKind): AdvancedDiagnosticRequest {
  const config = { ...defaultPlanarConfig(), gamma: 0, step: 0.01, duration: 2.56 };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('canonical fixture');
  const simulation = createPlanarSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  return {
    id: 'advanced-artifact-job',
    kind,
    experiment: canonical.value,
    series: createDiagnosticSeries(canonical.value, samples),
    settings: defaultAdvancedSettings(kind, canonical.value)
  };
}
function fixture(kind: AdvancedDiagnosticKind = 'topological-entropy') {
  const r = request(kind);
  return createAdvancedDiagnosticArtifact(r, runAdvancedDiagnostic(r), metadata);
}

describe('S19 versioned advanced artifacts', () => {
  for (const kind of ADVANCED_DIAGNOSTIC_KINDS)
    it(`${kind} reload preserves source, settings, native results, units and lineage`, () => {
      const artifact = fixture(kind);
      const imported = importAdvancedDiagnosticArtifact(exportAdvancedDiagnosticArtifact(artifact));
      expect(imported).toEqual(artifact);
      expect(imported.request.experiment.schema).toBe('pendulum-experiment/v1');
      expect(imported.inputRunId).toBe('run-test');
      expect(imported.result.warnings.length).toBeGreaterThan(0);
    });

  it('copies rather than retaining caller-owned input and result references', () => {
    const r = request('topological-entropy'),
      result = runAdvancedDiagnostic(r);
    const artifact = createAdvancedDiagnosticArtifact(r, result, metadata),
      snapshot = structuredClone(artifact);
    r.settings.source = 'logistic';
    r.series.states[0]![0] = 100;
    result.rows[0]![0] = 100;
    expect(artifact).toEqual(snapshot);
  });

  it('validates raw lineage and settings before copying or JSON normalization', () => {
    const r = request('topological-entropy'),
      result = runAdvancedDiagnostic(r),
      getter = vi.fn(() => 'executed');
    const unsafeMetadata = { ...metadata };
    Object.defineProperty(unsafeMetadata, 'artifactId', { enumerable: true, get: getter });
    expect(() => createAdvancedDiagnosticArtifact(r, result, unsafeMetadata)).toThrow('getter');
    expect(getter).not.toHaveBeenCalled();
    r.settings.discarded = undefined as never;
    expect(() => createAdvancedDiagnosticArtifact(r, result, metadata)).toThrow();
  });

  it('rejects unknown versions, native units, method signatures and unsupported settings', () => {
    const original = fixture();
    for (const mutate of [
      (copy: typeof original) => {
        copy.schema = 'pendulum-advanced-diagnostic/v2' as typeof copy.schema;
      },
      (copy: typeof original) => {
        copy.algorithmVersion = 'future' as typeof copy.algorithmVersion;
      },
      (copy: typeof original) => {
        copy.request.experiment = { ...copy.request.experiment, modelVersion: 'future' };
      },
      (copy: typeof original) => {
        copy.request.settings.unsupported = 1;
      },
      (copy: typeof original) => {
        copy.request.series.units[0] = 'degree';
      },
      (copy: typeof original) => {
        copy.request.series.energyUnit = 'erg';
      },
      (copy: typeof original) => {
        copy.result.columns[0] = 'unverified';
      },
      (copy: typeof original) => {
        copy.result.units[0] = 'J';
      },
      (copy: typeof original) => {
        copy.result.method = 'unverified';
      },
      (copy: typeof original) => {
        copy.request.settings.source = 'eval';
      },
      (copy: typeof original) => {
        const details = copy.result.details as Record<string, unknown>;
        (details.source as Record<string, unknown>).physicalExperimentUsed = true;
      }
    ]) {
      const copy = structuredClone(original);
      mutate(copy);
      expect(() => importAdvancedDiagnosticArtifact(JSON.stringify(copy))).toThrow();
    }
    expect(original).toEqual(fixture());
  });

  it('rejects closed-record violations, unsafe keys, sparse arrays and accessors without execution', () => {
    const artifact = fixture();
    expect(() => importAdvancedDiagnosticArtifact(JSON.stringify({ ...artifact, extra: 1 }))).toThrow('필드');
    expect(() =>
      importAdvancedDiagnosticArtifact(
        JSON.stringify({
          ...artifact,
          request: { ...artifact.request, series: { ...artifact.request.series, extra: true } }
        })
      )
    ).toThrow('필드');
    expect(() => importAdvancedDiagnosticArtifact('{"__proto__":{"polluted":true}}')).toThrow('키');
    const getter = vi.fn(() => 'executed'),
      malicious = { ...artifact };
    Object.defineProperty(malicious, 'result', { enumerable: true, get: getter });
    expect(() => validateAdvancedDiagnosticArtifact(malicious)).toThrow('getter');
    expect(getter).not.toHaveBeenCalled();
    const sparse = structuredClone(artifact);
    delete sparse.request.series.states[1]![0];
    expect(() => validateAdvancedDiagnosticArtifact(sparse)).toThrow('조밀 배열');
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => validateAdvancedDiagnosticArtifact(cycle)).toThrow('순환');
    expect(() => importAdvancedDiagnosticArtifact('{bad')).toThrow('손상');
  });

  it('rejects malformed lineage, time, kind, rows, nonfinite values and oversized payloads', () => {
    const original = fixture();
    for (const mutate of [
      (copy: typeof original) => {
        copy.inputRunId = '../private-path';
      },
      (copy: typeof original) => {
        copy.createdAt = '2026-02-31T00:00:00.000Z';
      },
      (copy: typeof original) => {
        copy.result.kind = 'basin';
      },
      (copy: typeof original) => {
        copy.result.rows[0]!.pop();
      },
      (copy: typeof original) => {
        copy.result.rows[0]![0] = Infinity;
      },
      (copy: typeof original) => {
        copy.result.details = { hidden: undefined } as never;
      }
    ]) {
      const copy = structuredClone(original);
      mutate(copy);
      expect(() => validateAdvancedDiagnosticArtifact(copy)).toThrow();
    }
    expect(() => importAdvancedDiagnosticArtifact(' '.repeat(ADVANCED_DIAGNOSTIC_LIMITS.artifactBytes + 1))).toThrow(
      '크기'
    );
    const huge = structuredClone(original);
    huge.result.rows = Array.from({ length: ADVANCED_DIAGNOSTIC_LIMITS.samples + 1 }, () => [
      ...original.result.rows[0]!
    ]);
    expect(() => validateAdvancedDiagnosticArtifact(huge)).toThrow('표본');
  });

  it('rejects malformed native matrix, CLV vector and grid projections before rendering', () => {
    for (const kind of ['rqa', 'clv', 'basin', 'lcs-ridge'] as const) {
      const artifact = fixture(kind),
        details = artifact.result.details as Record<string, unknown>;
      if (kind === 'rqa') (details.matrix as number[])[0] = 0.5;
      else if (kind === 'clv') (details.vectors as number[][])[0]!.pop();
      else if (kind === 'basin') (details.grid as { labels: number[] }).labels[0] = 100;
      else (details.ridges as { mask: unknown[] }).mask[0] = '1';
      expect(() => validateAdvancedDiagnosticArtifact(artifact)).toThrow();
    }
  });
});
