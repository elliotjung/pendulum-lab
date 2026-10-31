import { describe, expect, it } from 'vitest';
import { rk4Step } from '../../../../../src/physics/integrators';
import {
  createDrivenFlow,
  defaultDrivenConfig,
  toCanonicalDriven
} from '../../../../../src/product/adapters/physics/driven';
import {
  drivenMap,
  readStabilityDriven,
  StabilityWork
} from '../../../../../src/product/adapters/analysis/stability/source';
import { runStability } from '../../../../../src/product/adapters/analysis/stability/execute';
import { defaultStabilitySettings } from '../../../../../src/product/adapters/analysis/stability/settings';
import {
  createStabilityArtifact,
  exportStabilityArtifact,
  importStabilityArtifact
} from '../../../../../src/product/adapters/analysis/stability/artifact';
import type { StabilityRequest } from '../../../../../src/product/adapters/analysis/stability/contracts';

describe('S20 independent review regressions: actual product forcing section', () => {
  it.each([
    [0, 0],
    [0.7, -0.4],
    [-1.1, 1.8],
    [2.3, -2.1]
  ])('matches the production sine flow at phase %s and offset %s', (phase, offset) => {
    const config = {
      ...defaultDrivenConfig(),
      parameters: { g: 1, length: 1, damping: 0.3 },
      initialState: [0.3, -0.2, phase],
      forcing: { waveform: 'sine' as const, amplitude: 0.3, frequency: 1.1, phase: offset }
    };
    const canonical = toCanonicalDriven(config);
    if (!canonical.ok) throw new Error('valid driven review fixture');
    const before = structuredClone(canonical.value);
    const source = readStabilityDriven(canonical.value);
    const steps = 256;
    const actual = new Array<number>(2).fill(0);
    drivenMap(source.parameters, source.phase, steps, new StabilityWork())(source.initial, actual);

    // Independent oracle: integrate the actual product flow, whose persisted
    // drive phase and sine offset differ from the legacy cosine convention.
    const product = createDrivenFlow(config);
    const state = Float64Array.from(product.initial);
    const next = new Float64Array(state.length);
    const dt = (2 * Math.PI) / config.forcing.frequency / steps;
    for (let step = 0; step < steps; step++) {
      rk4Step(state, dt, product.rhs, next);
      state.set(next);
    }
    expect(Math.abs(actual[0]! - state[0]!)).toBeLessThan(1e-11);
    expect(Math.abs(actual[1]! - state[1]!)).toBeLessThan(1e-11);
    expect(canonical.value).toEqual(before);
  });

  it('refuses an unsupported waveform before constructing a different physical return map', () => {
    const config = defaultDrivenConfig();
    const canonical = toCanonicalDriven({
      ...config,
      forcing: { ...config.forcing!, waveform: 'triangle' }
    });
    if (!canonical.ok) throw new Error('valid triangle review fixture');
    expect(() => readStabilityDriven(canonical.value)).toThrow(/sine/);
  });

  it('resumes the lower fold sheet in its original direction after a file round trip', () => {
    const canonical = toCanonicalDriven(defaultDrivenConfig());
    if (!canonical.ok) throw new Error('valid fold context fixture');
    const request: StabilityRequest = {
      id: 'review-fold-parent',
      kind: 'pseudo-arclength',
      experiment: canonical.value,
      settings: defaultStabilitySettings('pseudo-arclength')
    };
    const result = runStability(request);
    expect(result.status).toBe('converged');
    const artifact = importStabilityArtifact(
      exportStabilityArtifact(
        createStabilityArtifact(request, result, {
          artifactId: 'review-fold-artifact',
          inputRunId: 'review-fold-input',
          createdAt: '2026-10-31T00:00:00.000Z'
        })
      )
    );
    const before = structuredClone(artifact);
    const endpoint = artifact.result.branch.at(-1)!;
    expect(endpoint.state[0]).toBeLessThan(-1);
    const details = artifact.result.details as Record<string, unknown>;
    expect(details.restartDirection).toBe(1);
    const resumed = runStability({
      id: 'review-fold-child',
      kind: request.kind,
      experiment: artifact.request.experiment,
      // Deliberately keep the parent's original direction=-1: the stored
      // post-fold tangent must override it, otherwise the curve retraces.
      settings: { ...artifact.request.settings, steps: 10 },
      restart: {
        artifactId: artifact.artifactId,
        inputRunId: artifact.inputRunId,
        source: artifact.result.source,
        state: [...endpoint.state],
        parameter: endpoint.parameter,
        direction: 1
      }
    });
    expect(resumed.status).toBe('converged');
    expect(resumed.branch[0]!.state).toEqual(endpoint.state);
    expect(resumed.branch.at(-1)!.state[0]).toBeLessThan(endpoint.state[0]! - 0.05);
    expect(resumed.branch.at(-1)!.parameter).toBeGreaterThan(endpoint.parameter);
    for (const point of resumed.branch) expect(Math.abs(point.state[0]! ** 2 - point.parameter)).toBeLessThan(1e-8);
    expect(artifact).toEqual(before);
  });
});
