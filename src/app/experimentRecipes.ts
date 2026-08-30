import type { PerturbationPattern, PerturbationVariable } from './ensemblePerturbation';

export type ExperimentGoal = 'sensitive-dependence' | 'periodic-vs-chaotic' | 'energy-drift' | 'poincare-structure';

export interface ExperimentRecipe {
  id: ExperimentGoal;
  title: { en: string; ko: string };
  purpose: { en: string; ko: string };
  expected: { en: string; ko: string };
  measurement: { en: string; ko: string };
  diagnostic: {
    copy: { en: string; ko: string };
    target: 'lab' | 'lyap' | 'validate';
    focus?: string;
  };
  evidenceHref: string;
  setup: {
    system: 'double';
    theta: readonly [number, number];
    omega: readonly [number, number];
    m1: number;
    m2: number;
    l1: number;
    l2: number;
    g: number;
    gamma: number;
    method: 'rk4' | 'yoshida4';
    dt: number;
  };
  perturbation: {
    variable: PerturbationVariable;
    pattern: PerturbationPattern;
    epsilon: number;
    seed: number;
    count: number;
  };
}

const BASE_SETUP = {
  system: 'double',
  omega: [0, 0],
  m1: 1,
  m2: 1,
  l1: 1.2,
  l2: 1,
  g: 9.81,
  gamma: 0,
  method: 'rk4'
} as const;

/** Shared, exact experiment definitions consumed by the Lab workflow and cards. */
export const EXPERIMENT_RECIPES: readonly ExperimentRecipe[] = [
  {
    id: 'sensitive-dependence',
    title: { en: 'Sensitive dependence', ko: '초기조건 민감도' },
    purpose: {
      en: 'Watch one exact nearby start leave its reference.',
      ko: '정확한 근접 시작이 기준에서 갈라지는지 봅니다.'
    },
    expected: {
      en: 'Separation—not trail shape—is the result.',
      ko: '결과는 궤적 모양이 아니라 분리입니다.'
    },
    measurement: { en: 'Separation δ(t), then finite-time λ₁', ko: '거리 δ(t), 이후 유한시간 λ₁' },
    diagnostic: { copy: { en: 'Open Lyapunov analysis', ko: '랴푸노프 분석 열기' }, target: 'lyap' },
    evidenceHref: '?tab=theory#theory-chaos-lyapunov',
    setup: {
      ...BASE_SETUP,
      theta: [2.18, 2.64],
      l1: 1,
      gamma: 0.06,
      dt: 0.001
    },
    perturbation: { variable: 'th1', pattern: 'symmetric', epsilon: 1e-3, seed: 20260826, count: 12 }
  },
  {
    id: 'periodic-vs-chaotic',
    title: { en: 'Periodic vs chaotic', ko: '주기 운동과 혼돈 비교' },
    purpose: {
      en: 'Classify one start in phase space.',
      ko: '한 시작을 위상공간에서 분류합니다.'
    },
    expected: {
      en: 'Closed paths suggest regularity; spread suggests chaos.',
      ko: '닫힘은 규칙성, 퍼짐은 혼돈을 시사합니다.'
    },
    measurement: { en: 'Phase portrait and Poincaré crossings', ko: '위상 궤적과 푸앵카레 교차점' },
    diagnostic: {
      copy: { en: 'Inspect phase + Poincaré plots', ko: '위상·푸앵카레 플롯 보기' },
      target: 'lab',
      focus: 'phase'
    },
    evidenceHref: '?tab=theory#theory-poincare',
    setup: {
      ...BASE_SETUP,
      theta: [0.65, 0.35],
      dt: 0.002
    },
    perturbation: { variable: 'th1', pattern: 'symmetric', epsilon: 1e-5, seed: 20260827, count: 8 }
  },
  {
    id: 'energy-drift',
    title: { en: 'Integrator energy drift', ko: '적분기 에너지 오차' },
    purpose: {
      en: 'Record a conservative run; then open independent validation.',
      ko: '보존계 실행을 기록한 뒤 독립 검증을 엽니다.'
    },
    expected: {
      en: 'Fixed fixtures—not this live path—test dt halving.',
      ko: '현재 궤적이 아닌 고정 fixture로 dt 절반 감소를 시험합니다.'
    },
    measurement: {
      en: 'Fixed-fixture drift and convergence order',
      ko: '고정 fixture의 오차와 수렴 차수'
    },
    diagnostic: {
      copy: { en: 'Open independent validation', ko: '독립 검증 열기' },
      target: 'validate',
      focus: 'runConvergence'
    },
    evidenceHref: '?tab=validate#runConvergence',
    setup: {
      ...BASE_SETUP,
      theta: [1.2, 0.8],
      dt: 0.003
    },
    perturbation: { variable: 'th1', pattern: 'alternating', epsilon: 1e-6, seed: 20260828, count: 0 }
  },
  {
    id: 'poincare-structure',
    title: { en: 'Poincaré structure', ko: '푸앵카레 구조' },
    purpose: {
      en: 'Classify crossings: points, curves, or area.',
      ko: '교차를 점·곡선·영역으로 분류합니다.'
    },
    expected: {
      en: 'Short, sparse runs are inconclusive.',
      ko: '짧고 희소한 실행은 결론을 주지 못합니다.'
    },
    measurement: { en: 'Refined θ₁=0 rising crossings', ko: '정제된 θ₁=0 상승 교차점' },
    diagnostic: {
      copy: { en: 'Inspect the Poincaré section', ko: '푸앵카레 단면 보기' },
      target: 'lab',
      focus: 'poincare'
    },
    evidenceHref: '?tab=theory#theory-poincare',
    setup: {
      ...BASE_SETUP,
      theta: [1.35, 1.7],
      dt: 0.002
    },
    perturbation: { variable: 'th2', pattern: 'symmetric', epsilon: 1e-5, seed: 20260829, count: 0 }
  }
] as const;

export function experimentRecipe(goal: unknown): ExperimentRecipe {
  return EXPERIMENT_RECIPES.find((recipe) => recipe.id === goal) ?? EXPERIMENT_RECIPES[0]!;
}
