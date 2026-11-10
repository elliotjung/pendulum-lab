import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { LegacyLinkConsumerSettings } from '../../persistence/legacy-link-consumer';
import { experimentRecipe, EXPERIMENT_RECIPES } from '../../../app/experimentRecipes';
import {
  WORKFLOW_STEPS,
  TRAJECTORY_STAGES,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from '../../../app/experimentWorkflowContract';
import {
  nextGoalWorkflowStep,
  normalizeGoalWorkflowState,
  trajectoryStageCount
} from '../../../app/experimentWorkflowPolicy';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../adapters/physics/planar';
import { createExperimentRoute } from '../../persistence/share-route';

export function legacyRecipeExperiment(source: ExperimentStateV1, goal: string): ExperimentStateV1 {
  const recipe = experimentRecipe(goal),
    setup = recipe.setup;
  if (source.runtime.domain !== 'time') throw new Error('시간 기반 source가 필요합니다.');
  const tolerance = source.integrator.settings.tolerance;
  const next = toCanonicalPlanar({
    ...defaultPlanarConfig(),
    parameters: { m1: setup.m1, m2: setup.m2, l1: setup.l1, l2: setup.l2, g: setup.g },
    gamma: setup.gamma,
    initialState: [...setup.theta, ...setup.omega],
    integratorId: `integrator:${setup.method}`,
    step: setup.dt,
    ...(tolerance?.kind === 'scalar' ? { tolerance: tolerance.value } : {}),
    duration: source.runtime.duration.value,
    ...(source.seed ? { seed: source.seed } : {}),
    provenance: {
      createdByVersion: 'legacy-workflow-v1',
      source: { kind: 'derived', id: `recipe-${recipe.id}` },
      parentExperimentIds: source.provenance?.source.id ? [source.provenance.source.id] : []
    }
  });
  if (!next.ok) throw new Error(next.issues.map((i) => i.message).join(' '));
  return next.value;
}

/** The native goal/state policies drive an explicit preparation guide. Running
 * a queue or replacing the active physical experiment remains a named action. */
export function createLegacyWorkflow(
  document: Document,
  source: ExperimentStateV1 | (() => ExperimentStateV1),
  initial: LegacyLinkConsumerSettings,
  prepare: (count: number) => void,
  openTarget: (tab: string) => void,
  options: { idPrefix?: string; ensemble?: () => LegacyLinkConsumerSettings['ensemble'] } = {}
) {
  const prefix = options.idPrefix ?? 'legacy-workflow';
  const readSource = () => (typeof source === 'function' ? source() : source);
  const readEnsemble = () => options.ensemble?.() ?? initial.ensemble;
  const root = element(document, 'section', 'ds-section');
  root.id = prefix;
  root.append(element(document, 'h3', '', '실험 목표 · 관찰 단계'));
  const goal = select(
    `${prefix}-goal`,
    '실험 목표',
    EXPERIMENT_RECIPES.map((r) => [r.id, r.title.ko] as const),
    initial.workflow.goal
  );
  const step = select(
    `${prefix}-step`,
    '현재 관찰 단계',
    WORKFLOW_STEPS.map((v) => [v, v] as const),
    initial.workflow.step
  );
  const stage = select(
    `${prefix}-stage`,
    '관찰할 궤적 구성',
    TRAJECTORY_STAGES.map((v) => [v, v] as const),
    initial.workflow.trajectoryStage
  );
  const purpose = element(document, 'p', 'lab-muted'),
    measurement = element(document, 'p', 'lab-muted'),
    status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const notes = element(document, 'textarea', 'ds-field__control');
  notes.id = `${prefix}-notes`;
  notes.rows = 4;
  notes.maxLength = 4000;
  const label = element(document, 'label', 'ds-field__label', '관찰·설명 기록');
  label.htmlFor = notes.id;
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  const urls = new Set<string>();
  function select(id: string, title: string, choices: readonly (readonly [string, string])[], value: string) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    for (const [v, t] of choices) {
      const option = element(document, 'option', '', t);
      option.value = v;
      control.append(option);
    }
    control.value = value;
    root.append(label, control);
    return control;
  }
  const requested = () => {
    const count = readEnsemble().count;
    return count > 1 ? count : experimentRecipe(goal.value).perturbation.count;
  };
  function state() {
    return normalizeGoalWorkflowState(
      experimentRecipe(goal.value),
      step.value as ExperimentWorkflowStep,
      stage.value as TrajectoryStage
    );
  }
  function update() {
    const recipe = experimentRecipe(goal.value),
      current = state();
    step.value = current.step;
    stage.value = current.stage;
    purpose.textContent = recipe.purpose.ko;
    measurement.textContent = `측정: ${recipe.measurement.ko} · 예상 관찰: ${recipe.expected.ko}`;
    status.textContent = `${current.step} / ${current.stage} · native 규칙으로 준비할 근접 궤적 ${trajectoryStageCount(recipe, current.stage, requested())}개`;
    root.dataset.workflowStep = current.step;
    root.dataset.trajectoryStage = current.stage;
  }
  for (const control of [goal, step, stage]) control.addEventListener('change', update);
  const next = createButton(document, {
    label: '다음 관찰 단계',
    variant: 'secondary',
    onClick() {
      const current = step.value as ExperimentWorkflowStep,
        recipe = experimentRecipe(goal.value);
      if (current === 'choose' || current === 'reference') stage.value = 'reference';
      else if (current === 'perturb') stage.value = recipe.perturbation.count ? 'perturbed' : 'reference';
      else if (current === 'observe') stage.value = recipe.perturbation.count ? 'ensemble' : 'reference';
      else if (current === 'measure') openTarget(recipe.diagnostic.target);
      else if (current === 'explain') {
        const evidence = new URL(recipe.evidenceHref, 'https://pendulum.invalid/app.html');
        openTarget(evidence.searchParams.get('tab') ?? 'theory');
      }
      step.value = nextGoalWorkflowStep(recipe, current);
      update();
    }
  });
  const build = createButton(document, {
    label: '이 단계의 기준·섭동 목록 준비',
    onClick() {
      try {
        const current = state();
        prepare(trajectoryStageCount(experimentRecipe(goal.value), current.stage, requested()));
        error.textContent = '';
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '조건 목록을 준비하지 못했습니다.';
      }
    }
  });
  const recipe = createButton(document, {
    label: '목표 recipe의 정확한 조건으로 새 실험 열기',
    variant: 'secondary',
    onClick() {
      try {
        const next = legacyRecipeExperiment(readSource(), goal.value);
        const route = createExperimentRoute(next);
        if (!route.ok) throw new Error(route.issues.map((i) => i.message).join(' '));
        document.defaultView!.location.hash = route.value;
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '새 recipe를 열지 못했습니다.';
      }
    }
  });
  const download = createButton(document, {
    label: '목표·단계·관찰 기록 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        const url = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                {
                  schema: 'pendulum-workflow-observation/v1',
                  source: readSource(),
                  goal: goal.value,
                  ...state(),
                  notes: notes.value,
                  perturbation: readEnsemble()
                },
                null,
                2
              )
            ],
            { type: 'application/json' }
          )
        );
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-workflow-observation.json';
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
      } catch {
        error.textContent = '기록 파일을 만들지 못했습니다. 입력은 이 화면에 유지됩니다.';
      }
    }
  });
  root.append(
    purpose,
    measurement,
    status,
    next,
    build,
    recipe,
    label,
    notes,
    download,
    error,
    element(
      document,
      'p',
      'lab-muted',
      '단계 선택과 목록 준비는 계산을 시작하지 않습니다. recipe 열기는 표시된 목표의 기존 정확한 조건으로 새 실험을 만들며, 가져온 원본은 전체 호환 설정에 남아 있습니다.'
    )
  );
  update();
  return {
    element: root,
    settings() {
      const current = state();
      return { goal: experimentRecipe(goal.value).id, step: current.step, trajectoryStage: current.stage };
    },
    dispose() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
