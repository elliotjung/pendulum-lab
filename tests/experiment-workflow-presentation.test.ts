import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_CONTROLS_COMMITTED_EVENT, type LabControlCommitDetail } from '../src/app/controlCommit';
import { experimentRecipe } from '../src/app/experimentRecipes';
import { captureSharedExperiment } from '../src/app/experimentShare';
import { applyRecipe } from '../src/app/experimentWorkflow';
import { trajectoryStageCount } from '../src/app/experimentWorkflowPolicy';
import {
  exactExperimentRecipeCopy,
  nextWorkflowRecommendation,
  perturbationSeedCopy
} from '../src/app/experimentWorkflowPresentation';

class FakeControl extends EventTarget {
  value: string;
  type = 'text';
  dataset: Record<string, string | undefined> = {};

  constructor(value: string) {
    super();
    this.value = value;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('persona-specific workflow recommendations', () => {
  it('sends the same measured state to an audience-appropriate next surface', () => {
    expect(nextWorkflowRecommendation('measure', 'beginner').target).toBe('theory');
    expect(nextWorkflowRecommendation('measure', 'student').target).toBe('compare');
    expect(nextWorkflowRecommendation('measure', 'research').target).toBe('validate');
    expect(
      new Set(
        (['beginner', 'student', 'research'] as const).map(
          (audience) => nextWorkflowRecommendation('measure', audience).copy.en
        )
      ).size
    ).toBe(3);
    const recipe = experimentRecipe('sensitive-dependence');
    expect(recipe).toMatchObject({
      setup: {
        system: 'double',
        theta: [2.18, 2.64],
        omega: [0, 0],
        m1: 1,
        m2: 1,
        l1: 1,
        l2: 1,
        g: 9.81,
        gamma: 0.06,
        method: 'rk4',
        dt: 0.001
      },
      perturbation: { variable: 'th1', pattern: 'symmetric', epsilon: 0.001, seed: 20260826, count: 12 }
    });
    expect(exactExperimentRecipeCopy(recipe)).toEqual({
      en: 'Exact recipe: system=double · θ=(2.18, 2.64) rad · ω=(0, 0) rad/s · m=(1, 1) kg · l=(1, 1) m · g=9.81 m/s² · γ=0.06 · RK4 dt=0.001 · Δθ₁=0.001 rad · symmetric, seed=20260826 (unused by deterministic symmetric), n=12 · Measure: Separation δ(t), then finite-time λ₁',
      ko: '정확한 레시피: system=double · θ=(2.18, 2.64) rad · ω=(0, 0) rad/s · m=(1, 1) kg · l=(1, 1) m · g=9.81 m/s² · γ=0.06 · RK4 dt=0.001 · Δθ₁=0.001 rad · symmetric, seed=20260826 (결정적 symmetric 패턴에서는 미사용), n=12 · 측정: 거리 δ(t), 이후 유한시간 λ₁'
    });
    expect(
      exactExperimentRecipeCopy(recipe, {
        setup: recipe.setup,
        perturbation: { ...recipe.perturbation, epsilon: 0.00012345678901234567 }
      }).en
    ).toContain('Δθ₁=0.00012345678901234567 rad');
  });

  it('describes seed influence truthfully for every perturbation pattern in English and Korean', () => {
    for (const pattern of ['symmetric', 'alternating'] as const) {
      const copy = perturbationSeedCopy(pattern, 17);
      expect(copy.token.en).toContain('unused');
      expect(copy.regeneration.en).toContain('changing it does not change');
      expect(copy.rationale.en).toContain('seed has no effect');
      expect(copy.token.ko).toContain('미사용');
      expect(copy.regeneration.ko).toContain('달라지지 않습니다');
      expect(copy.rationale.ko).toContain('영향을 주지 않습니다');
    }
    for (const pattern of ['random', 'normalized'] as const) {
      const copy = perturbationSeedCopy(pattern, 17);
      expect(copy.token).toEqual({ en: 'seed=17', ko: 'seed=17' });
      expect(copy.regeneration.en).toContain('same settings and seed');
      expect(copy.rationale.en).toContain('reproduces');
      expect(copy.regeneration.ko).toContain('동일한 앙상블');
      expect(copy.rationale.ko).toContain('재현');
    }
  });

  it('applies the complete recipe once and shares the exact physical state', () => {
    const ids = [
      'experimentGoal',
      'sysType',
      'th1',
      'th2',
      'iw1',
      'iw2',
      'm1',
      'm2',
      'l1',
      'l2',
      'g',
      'gamma',
      'method',
      'dt',
      'ensVariable',
      'ensPattern',
      'ensEps',
      'ensSeed',
      'ensembleRequestedCount',
      'ensN',
      'trajectoryStage'
    ];
    const controls = new Map(
      ids.map((id) => [id, new FakeControl(id === 'experimentGoal' ? 'sensitive-dependence' : '-1')])
    );
    const epsilonControl = controls.get('ensEps')!;
    epsilonControl.type = 'range';
    epsilonControl.dataset.precisionKeyboardStep = '0.1';
    epsilonControl.dataset.precisionCanonical = '-4';
    epsilonControl.dataset.precisionEpsilonCanonical = '0.0001';
    const documentEvents = new EventTarget();
    vi.stubGlobal('HTMLInputElement', class {});
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      querySelector: () => null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    const commits: LabControlCommitDetail[] = [];
    documentEvents.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, (event) => {
      commits.push((event as CustomEvent<LabControlCommitDetail>).detail);
    });

    applyRecipe('sensitive-dependence', 'ensemble');
    const shared = captureSharedExperiment();

    expect(commits).toHaveLength(1);
    expect(commits[0]?.source).toBe('preset');
    expect(commits[0]?.controlIds).toEqual(expect.arrayContaining(['method', 'm1', 'm2', 'l1', 'l2', 'g']));
    expect(shared.physics).toMatchObject({
      system: 'double',
      method: 'rk4',
      dt: 0.001,
      damping: 0.06,
      parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }
    });
    expect(shared.physics.initial.theta.slice(0, 2)).toEqual([2.18, 2.64]);
    expect(shared.physics.initial.omega.slice(0, 2)).toEqual([0, 0]);
    expect(shared.execution.ensemble?.epsilon).toBe(0.001);

    const exactTheta = (2 * Math.PI) / 3;
    const theta = controls.get('th1')!;
    theta.type = 'range';
    theta.dataset.precisionKeyboardStep = '0.001';
    theta.dataset.precisionCanonical = String(exactTheta);
    theta.value = '2.094395102393195';
    controls.get('m1')!.value = '1.73';
    controls.get('method')!.value = 'yoshida4';
    controls.get('ensPattern')!.value = 'random';
    controls.get('ensSeed')!.value = '77';
    controls.get('ensembleRequestedCount')!.value = '17';
    epsilonControl.value = String(Math.log10(0.00012345678901234567));
    epsilonControl.dataset.precisionCanonical = epsilonControl.value;
    epsilonControl.dataset.precisionEpsilonCanonical = '0.00012345678901234567';

    const liveShare = captureSharedExperiment();
    const liveCopy = exactExperimentRecipeCopy(experimentRecipe('sensitive-dependence'), liveShare);
    expect(liveCopy.en).toContain(`θ=(${exactTheta}, 2.64) rad`);
    expect(liveCopy.en).toContain('m=(1.73, 1) kg');
    expect(liveCopy.en).toContain('YOSHIDA4 dt=0.001');
    expect(liveCopy.en).toContain('Δθ₁=0.00012345678901234567 rad · random, seed=77, n=17');
    expect(liveCopy.en).not.toContain('θ=(2.18, 2.64)');
    expect(liveCopy.ko).toContain('random, seed=77, n=17');
    expect(liveShare.physics.initial.theta[0]).toBe(exactTheta);
    expect(liveShare.physics.parameters.m1).toBe(1.73);
    expect(liveShare.physics.method).toBe('yoshida4');
    expect(liveShare.execution.ensemble).toMatchObject({
      epsilon: 0.00012345678901234567,
      pattern: 'random',
      seed: 77,
      count: 17
    });
  });

  it('recommends an explicit user action rather than forcing navigation', () => {
    expect(nextWorkflowRecommendation('explain', 'beginner').target).toBe('share');
    expect(nextWorkflowRecommendation('explain', 'student').target).toBe('research');
    expect(nextWorkflowRecommendation('explain', 'research').target).toBe('research');
  });

  it('keeps each goal on the workflow and diagnostic it actually implements', () => {
    const sensitive = experimentRecipe('sensitive-dependence');
    const periodic = experimentRecipe('periodic-vs-chaotic');
    const energy = experimentRecipe('energy-drift');
    const poincare = experimentRecipe('poincare-structure');

    expect({ usesEnsemble: sensitive.perturbation.count > 0, target: sensitive.diagnostic.target }).toEqual({
      usesEnsemble: true,
      target: 'lyap'
    });
    expect({ usesEnsemble: periodic.perturbation.count > 0, target: periodic.diagnostic.target }).toEqual({
      usesEnsemble: true,
      target: 'lab'
    });
    expect({ usesEnsemble: energy.perturbation.count > 0, target: energy.diagnostic.target }).toEqual({
      usesEnsemble: false,
      target: 'validate'
    });
    expect({ usesEnsemble: poincare.perturbation.count > 0, target: poincare.diagnostic.target }).toEqual({
      usesEnsemble: false,
      target: 'lab'
    });
    expect(energy.diagnostic.copy.en).toBe('Open independent validation');
    expect(nextWorkflowRecommendation('reference', 'beginner', experimentRecipe('energy-drift')).copy.en).not.toMatch(
      /perturb|Δ|ensemble/iu
    );
    expect(nextWorkflowRecommendation('measure', 'beginner', experimentRecipe('poincare-structure')).target).toBe(
      'lab'
    );
  });

  it('does not invent a perturbation contract for a reference-only recipe', () => {
    const recipe = experimentRecipe('energy-drift');
    const energy = exactExperimentRecipeCopy(recipe);
    expect(energy.en).toContain('Measure: Fixed-fixture drift and convergence order');
    expect(energy.en).not.toContain('n=0');
    expect(energy.en).not.toContain('seed=');
    expect(trajectoryStageCount(recipe, 'ensemble', 80)).toBe(0);
    expect(experimentRecipe('periodic-vs-chaotic').purpose.en).not.toContain('Compare a regular start');
  });
});
