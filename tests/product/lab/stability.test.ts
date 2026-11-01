import { describe, expect, it } from 'vitest';
import {
  STABILITY_KINDS,
  type StabilityArtifact,
  type StabilityKind
} from '../../../src/product/adapters/analysis/stability/contracts';
import { STABILITY_SOURCES, defaultStabilitySettings } from '../../../src/product/adapters/analysis/stability/settings';
import { defaultDrivenConfig, toCanonicalDriven } from '../../../src/product/adapters/physics/driven';
import {
  stabilityAssumptions,
  stabilityFieldLabels,
  stabilityParameterNames,
  stabilityRestartFromArtifact,
  stabilityHandoffFromArtifact,
  stabilitySettingDescription,
  stabilitySourceNames
} from '../../../src/product/lab/views/stability-settings';

function artifact(kind: StabilityKind = 'pseudo-arclength'): StabilityArtifact {
  const experiment = toCanonicalDriven(defaultDrivenConfig('system:driven'));
  if (!experiment.ok) throw new Error('invalid canonical test fixture');
  return {
    schema: 'pendulum-stability-workflow/v1',
    algorithmVersion: 'stability-workflow-v1',
    artifactId: 'parent-result',
    inputRunId: 'input-experiment',
    createdAt: '2026-10-31T00:00:00.000Z',
    request: { id: 'parent-request', kind, experiment: experiment.value, settings: defaultStabilitySettings(kind) },
    result: {
      kind,
      source: 'fold-normal-form',
      summary: 'endpoint presentation fixture',
      columns: ['parameter', 'state'],
      units: ['1', '1'],
      rows: [],
      warnings: [],
      method: 'presentation fixture',
      log: [],
      status: 'partial',
      details: { restartDirection: 1 },
      branch: [
        { parameter: 0.1, state: [-0.3], residual: 1e-12, converged: true, stable: null },
        { parameter: 0.2, state: [-0.4], residual: 1e-12, converged: true, stable: null },
        { parameter: 0.3, state: [-0.5], residual: 1, converged: false, stable: null }
      ]
    }
  };
}

describe('S20 stability workflow scientific setting help', () => {
  for (const kind of STABILITY_KINDS)
    for (const source of STABILITY_SOURCES[kind])
      it(`${kind} / ${source} exposes source, units, ranges and correct source defaults`, () => {
        const settings = defaultStabilitySettings(kind, undefined, source);
        expect(stabilitySourceNames[source]).toBeTruthy();
        expect(stabilityAssumptions[kind]).toContain('비용');
        expect(stabilityAssumptions[kind]).toMatch(/확인|민감|증명|인증|유한|실패/);
        for (const [key, value] of Object.entries(settings)) {
          expect(stabilityFieldLabels[key]).toBeTruthy();
          const description = stabilitySettingDescription(kind, settings, key);
          expect(description).toContain(`기본값 ${value}`);
          expect(description).not.toMatch(/undefined|NaN/);
          if (typeof value === 'number') expect(description).toContain('범위 ');
        }
      });
  it('distinguishes physical angular acceleration and independent linear observation period', () => {
    expect(stabilityParameterNames.forcingAmplitude).toContain('rad/s²');
    const physical = defaultStabilitySettings('floquet');
    const linear = defaultStabilitySettings('floquet', undefined, 'linear-oscillator');
    expect(stabilitySettingDescription('floquet', physical, 'period')).toContain('구동 한 주기');
    expect(stabilitySettingDescription('floquet', linear, 'period')).toContain('범위 0.001–50.');
    expect(stabilitySettingDescription('floquet', linear, 'period')).not.toContain('범위 1–8 정수');
    expect(stabilitySettingDescription('floquet', physical, 'guess1')).toContain('rad/s');
    expect(stabilitySettingDescription('neimark-sacker', { source: 'delayed-logistic' }, 'guess1')).toContain('무차원');
  });
});

describe('S20 converged branch endpoint restart presentation', () => {
  it('retains parent identities, skips a failed final point and preserves tangent direction', () => {
    const parent = artifact();
    const before = structuredClone(parent);
    const restart = stabilityRestartFromArtifact(parent);
    expect(restart).toEqual({
      artifactId: 'parent-result',
      inputRunId: 'input-experiment',
      source: 'fold-normal-form',
      state: [-0.4],
      parameter: 0.2,
      direction: 1
    });
    restart!.state[0] = 99;
    expect(parent).toEqual(before);
  });
  it('does not invent an orientation when fold tangent metadata is unavailable', () => {
    const parent = artifact();
    parent.result.details = {};
    expect(stabilityRestartFromArtifact(parent)).toBeNull();
    parent.result.details = { restartDirection: -1 };
    expect(stabilityRestartFromArtifact(parent)?.direction).toBe(-1);
  });
  it('never restarts a nonconverged branch or unsupported torus curve', () => {
    const failed = artifact();
    failed.result.branch.forEach((point) => {
      point.converged = false;
    });
    expect(stabilityRestartFromArtifact(failed)).toBeNull();
    for (const kind of ['torus', 'fixed-point', 'floquet', 'melnikov', 'arnold-tongue', 'codim-two'] as const)
      expect(stabilityRestartFromArtifact(artifact(kind))).toBeNull();
  });
  it.each(['continuation', 'branch-switch', 'neimark-sacker'] as const)(
    '%s can reuse a converged native endpoint',
    (kind) => {
      const parent = artifact(kind);
      if (kind === 'branch-switch') parent.result.source = 'pitchfork-normal-form';
      parent.result.details = {};
      expect(stabilityRestartFromArtifact(parent)?.state).toEqual([-0.4]);
    }
  );
  it('does not offer unsupported physical period-doubling restart', () => {
    const parent = artifact('branch-switch');
    parent.result.source = 'current-driven';
    expect(stabilityRestartFromArtifact(parent)).toBeNull();
  });
  it.each(['fixed-point', 'periodic-shooting', 'floquet'] as const)(
    '%s hands a period-one solution to compatible physical tools',
    (kind) => {
      const parent = artifact(kind);
      parent.result.source = 'current-driven';
      parent.result.status = 'converged';
      parent.result.branch.pop();
      parent.request = { ...parent.request, settings: { source: 'current-driven', period: 1 } };
      const seed = stabilityHandoffFromArtifact(parent);
      expect(seed?.artifactId).toBe('parent-result');
      expect(seed?.inputRunId).toBe('input-experiment');
      expect(seed?.state).toEqual([-0.4]);
      parent.request.settings.period = 2;
      expect(stabilityHandoffFromArtifact(parent)).toBeNull();
      parent.request.settings.period = 1;
      parent.result.status = 'nonconverged';
      expect(stabilityHandoffFromArtifact(parent)).toBeNull();
    }
  );
});
