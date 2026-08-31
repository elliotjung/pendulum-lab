import {
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  type PerturbationPattern,
  type PerturbationVariable
} from './ensemblePerturbation';
import { EXPERIMENT_RECIPES } from './experimentRecipes';
import { TRAJECTORY_STAGES, WORKFLOW_STEPS, type TrajectoryStage } from './experimentWorkflowContract';
import { addLocalizedOption as option } from './experimentWorkflowPresentation';
import { syncPerturbationVariableOptions } from './experimentWorkflowControls';

const UINT32_MAX = 0xffff_ffff;

export interface ExperimentWorkflowViewHooks {
  setStep(step: (typeof WORKFLOW_STEPS)[number]): void;
  setTrajectoryStage(stage: TrajectoryStage): void;
  runCurrentStep(): void;
  skipCurrentStep(): void;
  selectGoal(): void;
  openNextAction(target: string, focus?: string): void;
  refresh(): void;
}

function labeledRow(labelEn: string, labelKo: string, control: HTMLElement): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.htmlFor = control.id;
  label.dataset.en = labelEn;
  label.dataset.ko = labelKo;
  row.append(label, control);
  return row;
}

/** Mount the reproducible perturbation rule beside the existing ensemble controls. */
export function mountEnsembleControls(onRefresh: () => void): void {
  const epsilonRow = document.getElementById('ensEps')?.closest('.row');
  const body = epsilonRow?.parentElement;
  if (!body || document.getElementById('ensVariable')) return;

  const variable = document.createElement('select');
  variable.id = 'ensVariable';
  variable.dataset.testid = 'perturbation-variable';
  const names: Record<PerturbationVariable, string> = {
    th1: 'θ₁',
    th2: 'θ₂',
    th3: 'θ₃',
    iw1: 'ω₁',
    iw2: 'ω₂',
    iw3: 'ω₃'
  };
  for (const value of PERTURBATION_VARIABLES) option(variable, value, names[value], names[value]);

  const pattern = document.createElement('select');
  pattern.id = 'ensPattern';
  pattern.dataset.testid = 'perturbation-pattern';
  const patterns: Record<PerturbationPattern, readonly [string, string]> = {
    alternating: ['Alternating ±kε', '교대 ±kε'],
    symmetric: ['Symmetric pairs ±kε', '대칭 쌍 ±kε'],
    random: ['Seeded random', '시드 기반 무작위'],
    normalized: ['Canonical-coordinate normalized', '정준 좌표 정규화']
  };
  for (const value of PERTURBATION_PATTERNS) option(pattern, value, patterns[value][0], patterns[value][1]);

  const seed = document.createElement('input');
  seed.id = 'ensSeed';
  seed.type = 'number';
  seed.min = '0';
  seed.max = String(UINT32_MAX);
  seed.step = '1';
  seed.value = '1';
  seed.inputMode = 'numeric';
  seed.dataset.testid = 'perturbation-seed';

  const readout = document.createElement('p');
  readout.id = 'ensembleRuleReadout';
  readout.className = 'ensemble-rule-readout';
  readout.setAttribute('role', 'status');
  readout.setAttribute('aria-live', 'polite');
  body.append(
    labeledRow('Perturb variable', '교란 변수', variable),
    labeledRow('Pattern', '패턴', pattern),
    labeledRow('Pattern seed', '패턴 시드', seed),
    readout
  );
  syncPerturbationVariableOptions();
  for (const control of [variable, pattern, seed]) {
    control.addEventListener('change', () => {
      document.getElementById('ensEps')?.dispatchEvent(new Event('change', { bubbles: true }));
      onRefresh();
    });
  }
}

function mountTrajectoryRoles(hooks: ExperimentWorkflowViewHooks): HTMLElement {
  const roles = document.createElement('section');
  roles.className = 'trajectory-role-panel';
  roles.setAttribute('aria-labelledby', 'trajectoryRolesTitle');
  const roleTitle = document.createElement('strong');
  roleTitle.id = 'trajectoryRolesTitle';
  roleTitle.dataset.en = 'What is on the canvas?';
  roleTitle.dataset.ko = '캔버스에는 무엇이 있나요?';

  const stageButtons = document.createElement('div');
  stageButtons.className = 'trajectory-stage-buttons';
  const stageCopy: Record<TrajectoryStage, readonly [string, string]> = {
    reference: ['Reference only', '기준 궤적만'],
    perturbed: ['+ one perturbation', '+ 교란 하나'],
    ensemble: ['+ ensemble', '+ 앙상블']
  };
  for (const value of TRAJECTORY_STAGES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.trajectoryStageButton = value;
    button.dataset.en = stageCopy[value][0];
    button.dataset.ko = stageCopy[value][1];
    button.addEventListener('click', () => hooks.setTrajectoryStage(value));
    stageButtons.append(button);
  }

  const legend = document.createElement('div');
  legend.className = 'trajectory-legend';
  for (const [role, en, ko] of [
    ['reference', 'Reference · solid, thick', '기준 · 굵은 실선'],
    ['perturbed', 'Perturbed · dashed, diamond', '교란 · 파선, 마름모'],
    ['ensemble', 'Ensemble statistics · median and 90% interval', '앙상블 통계 · 중앙값과 90% 구간']
  ] as const) {
    const entry = document.createElement('span');
    const sample = document.createElement('i');
    sample.className = `role-line role-${role}`;
    sample.setAttribute('aria-hidden', 'true');
    const label = document.createElement('b');
    label.dataset.en = en;
    label.dataset.ko = ko;
    entry.append(sample, label);
    legend.append(entry);
  }

  const readout = document.createElement('p');
  readout.id = 'trajectoryReadout';
  readout.className = 'trajectory-readout';
  const why = document.createElement('p');
  why.className = 'trajectory-why';
  why.id = 'trajectoryWhy';

  const statistics = document.createElement('section');
  statistics.id = 'ensembleStatistics';
  statistics.className = 'ensemble-statistics';
  statistics.dataset.testid = 'ensemble-statistics';
  statistics.setAttribute('aria-label', 'Separation distribution / 분리 거리 분포');
  const spaghettiLabel = document.createElement('label');
  spaghettiLabel.className = 'ensemble-spaghetti-toggle';
  const spaghetti = document.createElement('input');
  spaghetti.type = 'checkbox';
  spaghetti.id = 'ensembleSpaghetti';
  spaghetti.dataset.testid = 'ensemble-spaghetti';
  spaghetti.addEventListener('change', () => {
    document.dispatchEvent(new CustomEvent('pendulum:ensemble-render-mode-changed'));
  });
  const spaghettiCopy = document.createElement('span');
  spaghettiCopy.dataset.en = 'Show individual traces';
  spaghettiCopy.dataset.ko = '개별 궤적 표시';
  spaghettiLabel.append(spaghetti, spaghettiCopy);
  const summary = document.createElement('p');
  summary.id = 'ensembleStatisticsSummary';
  summary.className = 'ensemble-statistics-summary';
  summary.textContent =
    document.documentElement.lang === 'ko'
      ? '앙상블을 실행하면 p05, p50, p95 분리 거리를 측정합니다.'
      : 'Run the ensemble to measure p05, p50, and p95 separation.';
  const plot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  plot.id = 'ensembleStatisticsPlot';
  plot.setAttribute('viewBox', '0 0 100 12');
  plot.setAttribute('role', 'img');
  plot.setAttribute('aria-label', 'Ensemble endpoint separation distribution');
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  band.dataset.ensembleBand = '';
  band.setAttribute('x', '5');
  band.setAttribute('y', '3');
  band.setAttribute('width', '0');
  band.setAttribute('height', '6');
  const median = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  median.dataset.ensembleMedian = '';
  median.setAttribute('x1', '5');
  median.setAttribute('x2', '5');
  median.setAttribute('y1', '1');
  median.setAttribute('y2', '11');
  plot.append(band, median);
  statistics.append(spaghettiLabel, summary, plot);
  roles.append(roleTitle, stageButtons, legend, readout, why, statistics);
  return roles;
}

/** Mount the guided experiment structure; workflow policy remains in the controller module. */
export function mountGuidedExperiment(anchor: Element, hooks: ExperimentWorkflowViewHooks): void {
  if (document.getElementById('guidedExperiment')) return;
  const root = document.createElement('section');
  root.id = 'guidedExperiment';
  root.className = 'guided-experiment';
  root.setAttribute('aria-labelledby', 'guidedExperimentTitle');

  const goal = document.createElement('select');
  goal.id = 'experimentGoal';
  goal.dataset.testid = 'experiment-goal';
  for (const recipe of EXPERIMENT_RECIPES) option(goal, recipe.id, recipe.title.en, recipe.title.ko);

  const step = document.createElement('input');
  step.type = 'hidden';
  step.id = 'workflowStep';
  step.dataset.testid = 'workflow-step';
  step.value = 'choose';
  const stage = document.createElement('input');
  stage.type = 'hidden';
  stage.id = 'trajectoryStage';
  stage.dataset.testid = 'trajectory-stage';
  const initialCount = Number((document.getElementById('ensN') as HTMLInputElement | null)?.value);
  stage.value =
    Number.isFinite(initialCount) && initialCount > 1 ? 'ensemble' : initialCount === 1 ? 'perturbed' : 'reference';
  const remembered = document.createElement('input');
  remembered.type = 'hidden';
  remembered.id = 'ensembleRequestedCount';
  remembered.value =
    Number.isFinite(initialCount) && initialCount > 1 ? String(Math.min(80, Math.round(initialCount))) : '12';

  const head = document.createElement('div');
  head.className = 'guided-head';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'guided-eyebrow';
  eyebrow.dataset.en = 'Guided chaos experiment · about 5 minutes';
  eyebrow.dataset.ko = '안내형 혼돈 실험 · 약 5분';
  const title = document.createElement('h2');
  title.id = 'guidedExperimentTitle';
  const intro = document.createElement('p');
  copy.append(eyebrow, title, intro);
  head.append(copy, goal);

  const progress = document.createElement('div');
  progress.className = 'workflow-progress';
  progress.setAttribute('aria-label', 'Experiment progress');
  for (const value of WORKFLOW_STEPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workflow-step';
    button.dataset.workflowStepButton = value;
    button.addEventListener('click', () => hooks.setStep(value));
    progress.append(button);
  }

  const current = document.createElement('div');
  current.className = 'workflow-current';
  const currentCopy = document.createElement('div');
  const currentTitle = document.createElement('strong');
  currentTitle.id = 'workflowCurrentTitle';
  const currentBody = document.createElement('span');
  currentBody.id = 'workflowCurrentBody';
  const measurement = document.createElement('small');
  measurement.id = 'workflowMeasurement';
  measurement.className = 'workflow-measurement';
  measurement.dataset.en = 'Use the diagnostic card for value, meaning, and trust conditions.';
  measurement.dataset.ko = '값, 의미, 신뢰 조건은 진단 카드를 확인하세요.';
  currentCopy.append(currentTitle, currentBody, measurement);
  const actions = document.createElement('div');
  actions.className = 'workflow-actions';
  const action = document.createElement('button');
  action.type = 'button';
  action.id = 'workflowPrimaryAction';
  action.dataset.testid = 'workflow-primary-action';
  action.addEventListener('click', hooks.runCurrentStep);
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.id = 'workflowSkip';
  skip.addEventListener('click', hooks.skipCurrentStep);
  actions.append(action, skip);
  current.append(currentCopy, actions);

  const next = document.createElement('button');
  next.type = 'button';
  next.id = 'workflowNextAction';
  next.className = 'next-action-note';
  next.addEventListener('click', () => {
    const target = next.dataset.target;
    if (target) hooks.openNextAction(target, next.dataset.focus || undefined);
  });
  root.append(step, stage, remembered, head, progress, current, mountTrajectoryRoles(hooks), next);
  anchor.insertAdjacentElement('afterend', root);
  goal.addEventListener('change', hooks.selectGoal);
}
