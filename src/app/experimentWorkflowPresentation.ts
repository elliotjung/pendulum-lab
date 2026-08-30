import type { AudienceMode } from './audienceMode';
import { perturbationVariableLabel, type PerturbationPattern } from './ensemblePerturbation';
import type { ExperimentRecipe } from './experimentRecipes';
import type { SharedExperimentV4 } from './experimentShareTypes';
import type { ExperimentWorkflowStep } from './experimentWorkflowContract';
import { formatPreciseDecimal } from './precisionControls';

export interface WorkflowRecommendation {
  copy: { en: string; ko: string };
  target: 'lab' | 'lyap' | 'compare' | 'theory' | 'validate' | 'research' | 'share';
}

export interface PerturbationSeedCopy {
  token: { en: string; ko: string };
  regeneration: { en: string; ko: string };
  rationale: { en: string; ko: string };
}

export type ExactExperimentState = Pick<ExperimentRecipe, 'setup' | 'perturbation'> | SharedExperimentV4;

/** Explain seed semantics without implying deterministic sign patterns consume the seed. */
export function perturbationSeedCopy(pattern: PerturbationPattern, seed: number): PerturbationSeedCopy {
  if (pattern === 'random' || pattern === 'normalized')
    return {
      token: { en: `seed=${seed}`, ko: `seed=${seed}` },
      regeneration: {
        en: 'The same settings and seed regenerate the same ensemble.',
        ko: '동일한 설정과 시드는 동일한 앙상블을 만듭니다.'
      },
      rationale: {
        en: 'ε defines the nearby comparison; seed reproduces the generated random directions.',
        ko: 'ε는 비교 가능한 작은 차이를 정의하고, seed는 생성된 무작위 방향을 재현합니다.'
      }
    };
  return {
    token: {
      en: `seed=${seed} (unused by deterministic ${pattern})`,
      ko: `seed=${seed} (결정적 ${pattern} 패턴에서는 미사용)`
    },
    regeneration: {
      en: `The deterministic ${pattern} rule ignores seed; changing it does not change the generated states.`,
      ko: `결정적 ${pattern} 규칙은 seed를 사용하지 않으므로 seed를 바꿔도 생성 상태가 달라지지 않습니다.`
    },
    rationale: {
      en: `ε defines the nearby comparison; ${pattern} uses a fixed sign rule, so seed has no effect.`,
      ko: `ε는 비교 가능한 작은 차이를 정의하고, ${pattern}은 고정 부호 규칙을 사용하므로 seed는 결과에 영향을 주지 않습니다.`
    }
  };
}

const NEXT_RECOMMENDATIONS: Record<AudienceMode, Record<ExperimentWorkflowStep, WorkflowRecommendation>> = {
  beginner: {
    choose: { copy: { en: 'Run reference', ko: '기준 실행' }, target: 'lab' },
    reference: {
      copy: { en: 'Change one Δ', ko: 'Δ 하나 변경' },
      target: 'lab'
    },
    perturb: {
      copy: { en: 'Watch δ(t)', ko: 'δ(t) 관찰' },
      target: 'lab'
    },
    observe: { copy: { en: 'Measure λ₁', ko: 'λ₁ 측정' }, target: 'lyap' },
    measure: { copy: { en: 'Read theory', ko: '이론 읽기' }, target: 'theory' },
    explain: { copy: { en: 'Share setup', ko: '설정 공유' }, target: 'share' }
  },
  student: {
    choose: {
      copy: { en: 'Record exact reference', ko: '정확한 기준 기록' },
      target: 'lab'
    },
    reference: { copy: { en: 'Add controlled Δ', ko: '통제된 Δ 추가' }, target: 'lab' },
    perturb: { copy: { en: 'Compare ensemble', ko: '앙상블 비교' }, target: 'lab' },
    observe: { copy: { en: 'Measure finite λ₁', ko: '유한시간 λ₁ 측정' }, target: 'lyap' },
    measure: { copy: { en: 'Compare phase space', ko: '위상공간 비교' }, target: 'compare' },
    explain: { copy: { en: 'Export bundle', ko: '번들 내보내기' }, target: 'research' }
  },
  research: {
    choose: {
      copy: { en: 'Lock reference', ko: '기준 고정' },
      target: 'lab'
    },
    reference: {
      copy: { en: 'Define Δ rule', ko: 'Δ 규칙 정의' },
      target: 'lab'
    },
    perturb: {
      copy: { en: 'Inspect ensemble', ko: '앙상블 검사' },
      target: 'lab'
    },
    observe: { copy: { en: 'Compare finite λ₁', ko: '유한시간 λ₁ 비교' }, target: 'lyap' },
    measure: { copy: { en: 'Inspect validation', ko: '검증 검사' }, target: 'validate' },
    explain: {
      copy: { en: 'Export evidence', ko: '근거 내보내기' },
      target: 'research'
    }
  }
};

export function nextWorkflowRecommendation(
  step: ExperimentWorkflowStep,
  audience: AudienceMode,
  recipe?: ExperimentRecipe
): WorkflowRecommendation {
  if (recipe) {
    if (
      recipe.id !== 'sensitive-dependence' &&
      (step === 'observe' || step === 'measure' || (!recipe.perturbation.count && step === 'reference'))
    )
      return recipe.diagnostic;
  }
  return NEXT_RECOMMENDATIONS[audience][step];
}

export function exactExperimentRecipeCopy(
  recipe: ExperimentRecipe,
  state: ExactExperimentState = recipe
): { en: string; ko: string } {
  const shared = 'physics' in state;
  const physics = shared ? (state as SharedExperimentV4).physics : null;
  const setup = shared ? null : (state as Pick<ExperimentRecipe, 'setup'>).setup;
  const system = physics?.system ?? setup!.system;
  const rule = shared ? state.execution.ensemble : state.perturbation;
  const seed = rule && perturbationSeedCopy(rule.pattern, rule.seed);
  const delta = rule?.count
    ? ` · Δ${perturbationVariableLabel(rule.variable)}=${formatPreciseDecimal(rule.epsilon)} rad · ${rule.pattern}, ${seed!.token.en}, n=${rule.count}`
    : '';
  const deltaKo = rule?.count ? delta.replace(seed!.token.en, seed!.token.ko) : '';
  const numbers = (values: readonly number[]) => values.map(formatPreciseDecimal).join(', ');
  const count = system === 'triple' ? 3 : 2;
  const theta = physics ? physics.initial.theta.slice(0, count) : setup!.theta;
  const omega = physics ? physics.initial.omega.slice(0, count) : setup!.omega;
  const physical = physics?.parameters ?? setup!;
  const masses = [physical.m1, physical.m2, ...(count === 3 ? [(physical as { m3: number }).m3] : [])];
  const lengths = [physical.l1, physical.l2, ...(count === 3 ? [(physical as { l3: number }).l3] : [])];
  const exact = `system=${system} · θ=(${numbers(theta)}) rad · ω=(${numbers(omega)}) rad/s · m=(${numbers(masses)}) kg · l=(${numbers(lengths)}) m · g=${formatPreciseDecimal(physical.g)} m/s² · γ=${formatPreciseDecimal(physics?.damping ?? setup!.gamma)} · ${(physics?.method ?? setup!.method).toUpperCase()} dt=${formatPreciseDecimal(physics?.dt ?? setup!.dt)}`;
  return {
    en: `Exact recipe: ${exact}${delta} · Measure: ${recipe.measurement.en}`,
    ko: `정확한 레시피: ${exact}${deltaKo} · 측정: ${recipe.measurement.ko}`
  };
}

export interface PersonaEntry {
  id: string;
  label: { en: string; ko: string };
  mode: AudienceMode;
  tab: string;
}

const PERSONAS: readonly PersonaEntry[] = [
  { id: 'curious', label: { en: 'Curious beginner', ko: '호기심 많은 초보자' }, mode: 'beginner', tab: 'lab' },
  { id: 'student', label: { en: 'Student', ko: '학생' }, mode: 'student', tab: 'lyap' },
  {
    id: 'numerics',
    label: { en: 'Numerical methods learner', ko: '수치해석 학습자' },
    mode: 'student',
    tab: 'compare'
  },
  {
    id: 'reviewer',
    label: { en: 'Research / reviewer', ko: '연구자 / 리뷰어' },
    mode: 'research',
    tab: 'validate'
  },
  {
    id: 'developer',
    label: { en: 'Developer / contributor', ko: '개발자 / 기여자' },
    mode: 'research',
    tab: 'architecture'
  }
];

export const STEP_COPY: Record<
  ExperimentWorkflowStep,
  { title: { en: string; ko: string }; body?: { en: string; ko: string }; action?: { en: string; ko: string } }
> = {
  choose: {
    title: { en: '1 · Choose exact state', ko: '1 · 정확한 상태 선택' },
    body: { en: 'Load exact angles first.', ko: '정확한 각도를 먼저 불러옵니다.' },
    action: { en: 'Load state', ko: '상태 불러오기' }
  },
  reference: {
    title: { en: '2 · Run the reference', ko: '2 · 기준 궤적 실행' },
    body: {
      en: 'Start one solid reference; no Δ yet.',
      ko: '굵은 기준 경로 하나로 시작합니다. Δ는 아직 없습니다.'
    },
    action: { en: 'Run reference', ko: '기준 실행' }
  },
  perturb: {
    title: { en: '3 · Add one perturbation', ko: '3 · 교란 하나 추가' },
    body: {
      en: 'Add one dashed path; keep Δ visible.',
      ko: '점선 경로 하나와 Δ를 표시합니다.'
    },
    action: { en: 'Add perturbation', ko: '교란 추가' }
  },
  observe: {
    title: { en: '4 · Observe', ko: '4 · 관찰' },
    body: {
      en: 'Read the named quantity, not trail shape.',
      ko: '궤적 모양이 아닌 지정된 양을 읽습니다.'
    },
    action: { en: 'Expand ensemble', ko: '앙상블 확장' }
  },
  measure: {
    title: { en: '5 · Measure the result', ko: '5 · 결과 측정' }
  },
  explain: {
    title: { en: '6 · Explain with evidence', ko: '6 · 근거로 설명' },
    body: {
      en: 'Connect the result to assumptions and limits.',
      ko: '결과를 가정과 한계에 연결합니다.'
    },
    action: { en: 'Open evidence', ko: '근거 열기' }
  }
};

export function localize<T extends { en: string; ko: string }>(copy: T): string {
  return document.documentElement.lang === 'ko' ? copy.ko : copy.en;
}

export function addLocalizedOption(select: HTMLSelectElement, value: string, en: string, ko: string): void {
  const entry = document.createElement('option');
  entry.value = value;
  entry.dataset.en = en;
  entry.dataset.ko = ko;
  entry.textContent = document.documentElement.lang === 'ko' ? ko : en;
  select.append(entry);
}

export function mountPersonaPaths(anchor: Element, selectPersona: (persona: PersonaEntry) => void): void {
  const root = document.createElement('details');
  root.className = 'persona-paths';
  const summary = document.createElement('summary');
  summary.dataset.en = 'Choose a focused path';
  summary.dataset.ko = '집중 경로 선택';
  const grid = document.createElement('div');
  grid.className = 'persona-grid';
  for (const persona of PERSONAS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'persona-entry';
    button.dataset.persona = persona.id;
    button.dataset.en = persona.label.en;
    button.dataset.ko = persona.label.ko;
    button.addEventListener('click', () => selectPersona(persona));
    grid.append(button);
  }
  root.append(summary, grid);
  anchor.insertAdjacentElement('afterend', root);
}

export function mountHandoffNotice(
  guidedExperiment: Element,
  experimentTitle: string,
  summary: string | null,
  warnings: readonly string[]
): void {
  if (document.getElementById('handoffContinuity')) return;
  const status = document.createElement('div');
  status.id = 'handoffContinuity';
  status.className = 'handoff-continuity';
  status.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent =
    document.documentElement.lang === 'ko' ? 'Landing 실험 이어가기' : 'Continuing your Landing experiment';
  status.append(heading);
  for (const line of [summary ? `${experimentTitle} · ${summary}` : experimentTitle, ...warnings])
    status.append(document.createElement('br'), document.createTextNode(line));
  guidedExperiment.insertAdjacentElement('beforebegin', status);
}

export const EXPERIMENT_WORKFLOW_CSS = `
.product-statement{margin:-2px 0 10px;color:var(--workbench-text-secondary,#a8b0c2);font:500 11px/1.5 var(--font-sans,system-ui);letter-spacing:.01em}
.persona-paths{margin:0 0 12px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:10px;background:var(--workbench-panel,#10141f)}
.persona-paths>summary{cursor:pointer;padding:10px 12px;color:var(--workbench-text,#f1f3f8);font-size:11px;font-weight:650}
.persona-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;padding:0 10px 10px}
.persona-entry{min-width:0;padding:9px;text-align:left;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:7px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text,#f1f3f8);font-size:10.5px}
.guided-experiment{margin:0 0 13px;padding:13px;border:1px solid var(--workbench-border-selected,rgba(139,124,246,.55));border-radius:12px;background:linear-gradient(135deg,var(--workbench-panel,#10141f),var(--workbench-raised,#0b0e17));box-shadow:0 14px 34px rgba(0,0,0,.14)}
.guided-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.guided-eyebrow{color:var(--workbench-live,#72d6e5);font:650 9px/1.2 var(--font-mono,monospace);text-transform:uppercase;letter-spacing:.09em}.guided-head h2{margin:5px 0 3px;color:var(--workbench-text,#f1f3f8);font-size:16px}.guided-head p{margin:0;color:var(--workbench-text-secondary,#a8b0c2);font-size:10.5px;line-height:1.45;max-width:670px}.guided-head select{min-width:178px}
.workflow-progress{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin:11px 0}.workflow-step{min-width:0;padding:7px 5px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:6px;background:var(--workbench-control,#181d2b);color:var(--workbench-text-muted,#737e92);font:600 9px/1.25 var(--font-sans,system-ui)}.workflow-step[aria-current="step"]{border-color:var(--workbench-live,#72d6e5);color:var(--workbench-text,#f1f3f8);box-shadow:inset 0 -2px 0 var(--workbench-live,#72d6e5)}
.workflow-current{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px;border-radius:8px;background:var(--workbench-control,#181d2b)}.workflow-current strong{display:block;color:var(--workbench-text,#f1f3f8);font-size:12px}.workflow-current span{display:block;margin-top:3px;color:var(--workbench-text-secondary,#a8b0c2);font-size:10px;line-height:1.45}.workflow-actions{display:flex;gap:6px;align-items:center}.workflow-actions button:first-child{border-color:var(--workbench-live,#72d6e5)}
.workflow-measurement{display:block;margin-top:6px;color:var(--workbench-text-muted,#737e92);font-size:9.5px;line-height:1.45}
.trajectory-role-panel{margin:9px 0 0;padding:10px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-raised,#0b0e17)}
.trajectory-stage-buttons{display:flex;gap:6px;flex-wrap:wrap}.trajectory-stage-buttons button[aria-pressed="true"]{border-color:var(--workbench-live,#72d6e5);background:var(--workbench-selected,#242a3d);color:var(--workbench-text,#f1f3f8)}
.trajectory-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.trajectory-legend>span{display:flex;align-items:center;gap:7px;color:var(--workbench-text-secondary,#a8b0c2);font-size:9.5px}.role-line{display:inline-block;width:30px;height:0;border-top:2px solid currentColor}.role-reference{color:#f4f5f8}.role-perturbed{color:#ffc25c;border-top-style:dashed}.role-ensemble{color:#00d4ff;border-top-style:dotted}
.trajectory-readout{margin:9px 0 0;color:var(--workbench-text-secondary,#a8b0c2);font:9.5px/1.55 var(--font-mono,monospace);white-space:pre-line}.trajectory-why{margin:7px 0 0;color:var(--workbench-text-muted,#737e92);font-size:9.5px;line-height:1.45}.trajectory-why a{color:var(--workbench-live,#72d6e5)}
.handoff-continuity{margin:0 0 10px;padding:9px 11px;border-left:3px solid var(--workbench-live,#72d6e5);border-radius:6px;background:var(--workbench-control,#181d2b);color:var(--workbench-text-secondary,#a8b0c2);font-size:10px;line-height:1.45}.handoff-continuity strong{color:var(--workbench-text,#f1f3f8)}
.ensemble-rule-readout{margin:8px 0 2px;color:var(--workbench-text-secondary,#a8b0c2);font:9.5px/1.45 var(--font-mono,monospace)}
body.audience-research .guided-experiment{border-color:var(--workbench-border,rgba(205,214,245,.08))}.next-action-note{display:inline-block;margin-top:8px;padding:0;border:0;background:transparent;color:var(--workbench-live,#72d6e5);font-size:9.5px;text-align:left;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
@media(max-width:980px){.persona-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.workflow-progress{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:650px){.guided-head,.workflow-current{grid-template-columns:1fr}.guided-head select{width:100%}.workflow-actions{justify-content:flex-start}.trajectory-legend{grid-template-columns:1fr}.persona-grid{grid-template-columns:1fr}.workflow-progress{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media print{.workflow-actions,.trajectory-stage-buttons,.persona-paths{display:none!important}.guided-experiment,.trajectory-role-panel{box-shadow:none;background:white;color:black;border-color:black}.role-reference{color:black}.role-perturbed{color:#555}.role-ensemble{color:#888}}
@media(forced-colors:active){.guided-experiment,.trajectory-role-panel,.workflow-current,.persona-paths,.persona-entry{forced-color-adjust:auto;background:Canvas;color:CanvasText;border-color:CanvasText}.workflow-step[aria-current="step"],.trajectory-stage-buttons button[aria-pressed="true"]{outline:2px solid Highlight}.role-line{color:CanvasText}}
`;
