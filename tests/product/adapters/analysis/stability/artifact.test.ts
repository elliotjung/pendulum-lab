import { describe, expect, it, vi } from 'vitest';
import { defaultDrivenConfig, toCanonicalDriven } from '../../../../../src/product/adapters/physics/driven';
import {
  STABILITY_KINDS,
  STABILITY_LIMITS,
  type StabilityKind,
  type StabilityRequest
} from '../../../../../src/product/adapters/analysis/stability/contracts';
import { defaultStabilitySettings } from '../../../../../src/product/adapters/analysis/stability/settings';
import { runStability } from '../../../../../src/product/adapters/analysis/stability/execute';
import {
  createStabilityArtifact,
  exportStabilityArtifact,
  importStabilityArtifact,
  validateStabilityArtifact
} from '../../../../../src/product/adapters/analysis/stability/artifact';

const metadata = { artifactId: 'stability-artifact', inputRunId: 'source-run', createdAt: '2026-10-31T00:00:00.000Z' };
function request(kind: StabilityKind = 'pseudo-arclength'): StabilityRequest {
  const parsed = toCanonicalDriven(defaultDrivenConfig('system:driven'));
  if (!parsed.ok) throw new Error('fixture');
  return { id: 'artifact-job', kind, experiment: parsed.value, settings: defaultStabilitySettings(kind, parsed.value) };
}
function fixture(kind: StabilityKind = 'pseudo-arclength') {
  const r = request(kind);
  return createStabilityArtifact(r, runStability(r), metadata);
}
describe('S20 solution and branch persistence', () => {
  for (const kind of STABILITY_KINDS)
    it(`${kind}: reload preserves exact input, source, solution and lineage`, () => {
      const artifact = fixture(kind);
      expect(importStabilityArtifact(exportStabilityArtifact(artifact))).toEqual(artifact);
      expect(artifact.request.experiment.systemId).toBe('system:driven');
      expect(artifact.result.warnings.length).toBeGreaterThan(0);
      expect(artifact.inputRunId).toBe(metadata.inputRunId);
    });
  it('takes an immutable input and result snapshot', () => {
    const r = request(),
      result = runStability(r),
      artifact = createStabilityArtifact(r, result, metadata);
    const saved = structuredClone(artifact);
    r.settings.steps = 1;
    result.branch[0]!.state[0] = 123;
    expect(artifact).toEqual(saved);
  });
  it('rejects current-driven source metadata that contradicts the stored physical experiment and section', () => {
    const config = defaultDrivenConfig();
    const experiment = toCanonicalDriven({
      ...config,
      initialState: [0.3, -0.2, 0.7],
      forcing: { waveform: 'sine', amplitude: 0.3, frequency: 1.1, phase: -0.4 }
    });
    if (!experiment.ok) throw new Error('phase-aware metadata fixture');
    const r: StabilityRequest = {
      id: 'physical-source-artifact',
      kind: 'fixed-point',
      experiment: experiment.value,
      settings: defaultStabilitySettings('fixed-point', experiment.value)
    };
    const saved = createStabilityArtifact(r, runStability(r), metadata);
    const mutations: ((details: Record<string, unknown>) => void)[] = [
      ...['g', 'length', 'damping', 'driveAmplitude', 'driveFrequency'].map(
        (key) => (details: Record<string, unknown>) => {
          const parameters = details.physicalParameters as Record<string, number>;
          parameters[key] = parameters[key]! + 0.25;
        }
      ),
      (details) => {
        details.nativeSectionPhase = Number(details.nativeSectionPhase) + 0.25;
      },
      (details) => {
        details.nativeSectionPhase = 0;
      },
      (details) => {
        details.phaseTransform = 'unshifted cosine section';
      },
      (details) => {
        details.integrator = 'unverified numerical propagator';
      },
      (details) => {
        details.sourceDescription = 'A different physical source';
      },
      (details) => {
        delete details.physicalParameters;
      },
      (details) => {
        delete (details.physicalParameters as Record<string, unknown>).length;
      },
      (details) => {
        (details.physicalParameters as Record<string, unknown>).unknown = 1;
      }
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(saved);
      mutate(changed.result.details as Record<string, unknown>);
      expect(() => importStabilityArtifact(JSON.stringify(changed))).toThrow();
    }
    const changedRequest = structuredClone(saved);
    changedRequest.request.experiment = {
      ...changedRequest.request.experiment,
      parameters: {
        ...changedRequest.request.experiment.parameters,
        forcingPhase: { kind: 'scalar', value: 0.2, unit: 'rad' }
      }
    };
    expect(() => importStabilityArtifact(JSON.stringify(changedRequest))).toThrow(/source/);
    expect(importStabilityArtifact(exportStabilityArtifact(saved))).toEqual(saved);
  });
  it('binds the analytic/Simpson Melnikov method without mislabelling it as RK4 propagation', () => {
    const artifact = fixture('melnikov');
    expect(artifact.result.details).toHaveProperty('integrator', 'analytic + Simpson quadrature');
    expect(importStabilityArtifact(exportStabilityArtifact(artifact))).toEqual(artifact);
    const changed = structuredClone(artifact);
    (changed.result.details as Record<string, unknown>).integrator = 'native RK4';
    expect(() => importStabilityArtifact(JSON.stringify(changed))).toThrow(/source/);
  });
  it('keeps independent benchmark metadata separate from current-driven source fields', () => {
    const r = request('floquet');
    r.settings = defaultStabilitySettings('floquet', r.experiment, 'linear-oscillator');
    const artifact = createStabilityArtifact(r, runStability(r), metadata);
    expect(artifact.result.details).not.toHaveProperty('physicalParameters');
    expect(importStabilityArtifact(exportStabilityArtifact(artifact))).toEqual(artifact);
    // Structural/source consistency does not establish that a third party
    // actually computed the numbers: numeric analysis outputs are not rerun.
    const importedData = structuredClone(artifact);
    importedData.result.rows[0]![1]! += 0.01;
    expect(importStabilityArtifact(JSON.stringify(importedData))).toEqual(importedData);
  });
  it('rejects future versions, changed native signatures, unknown fields and inconsistent source', () => {
    const saved = fixture();
    const changes: ((a: typeof saved) => void)[] = [
      (a) => {
        a.schema = 'pendulum-stability-workflow/v2' as never;
      },
      (a) => {
        a.algorithmVersion = 'future' as never;
      },
      (a) => {
        a.request.settings.extra = 1;
      },
      (a) => {
        a.request.experiment = { ...a.request.experiment, modelVersion: 'future' };
      },
      (a) => {
        a.result.source = 'current-driven';
      },
      (a) => {
        a.result.kind = 'melnikov';
      },
      (a) => {
        a.result.units[0] = 'J';
      },
      (a) => {
        a.result.columns[0] = 'changed';
      },
      (a) => {
        a.result.method = 'unverified';
      },
      (a) => {
        a.result.rows[0]!.pop();
      },
      (a) => {
        a.result.branch[0]!.state.push(1);
      },
      (a) => {
        a.result.branch[0]!.residual = -1;
      },
      (a) => {
        a.result.branch[0]!.converged = false;
        a.result.branch[0]!.stable = true;
      },
      (a) => {
        a.result.log[0]!.step = -1;
      },
      (a) => {
        a.createdAt = '2026-02-31T00:00:00.000Z';
      },
      (a) => {
        a.inputRunId = '../private';
      }
    ];
    for (const change of changes) {
      const changed = structuredClone(saved);
      change(changed);
      expect(() => importStabilityArtifact(JSON.stringify(changed))).toThrow();
    }
    expect(importStabilityArtifact(exportStabilityArtifact(saved))).toEqual(saved);
  });
  it('rejects executable descriptors, sparse arrays, cycles, malformed and oversized files', () => {
    const saved = fixture(),
      getter = vi.fn(() => 'execute');
    Object.defineProperty(saved, 'result', { enumerable: true, get: getter });
    expect(() => validateStabilityArtifact(saved)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const sparse = fixture();
    delete sparse.result.branch[0]!.state[0];
    expect(() => validateStabilityArtifact(sparse)).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => validateStabilityArtifact(cyclic)).toThrow();
    expect(() => importStabilityArtifact('{"__proto__":{"polluted":true}}')).toThrow();
    expect(() => importStabilityArtifact('{bad')).toThrow();
    expect(() => importStabilityArtifact(' '.repeat(STABILITY_LIMITS.artifactBytes + 1))).toThrow();
    const r = request(),
      result = runStability(r),
      unsafe = { ...metadata };
    Object.defineProperty(unsafe, 'artifactId', { enumerable: true, get: getter });
    expect(() => createStabilityArtifact(r, result, unsafe)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('preserves a fold endpoint restart and its original input run without reversing branch direction', () => {
    const parent = fixture(),
      endpoint = parent.result.branch.at(-1)!;
    const detail = parent.result.details as Record<string, unknown>;
    const r: StabilityRequest = {
      ...structuredClone(parent.request),
      id: 'restarted-job',
      restart: {
        artifactId: parent.artifactId,
        inputRunId: parent.inputRunId,
        source: parent.result.source,
        state: [...endpoint.state],
        parameter: endpoint.parameter,
        direction: detail.restartDirection as 1 | -1
      }
    };
    const result = runStability(r);
    const child = createStabilityArtifact(r, result, { ...metadata, artifactId: 'child-artifact' });
    expect(importStabilityArtifact(exportStabilityArtifact(child))).toEqual(child);
    expect(child.result.branch[0]!.parameter).toBeCloseTo(endpoint.parameter, 10);
    expect(child.result.branch[1]!.state[0]).toBeLessThan(endpoint.state[0]!);
    expect(() =>
      createStabilityArtifact(r, result, { ...metadata, artifactId: 'wrong-run', inputRunId: 'other-run' })
    ).toThrow();
  });
});
