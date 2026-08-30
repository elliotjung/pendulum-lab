import { installAdoptedStyle } from '../ui/adoptedStyles';
import { applyAudienceMode, currentAudienceMode } from './audienceMode';
import { commitLabControls, LAB_CONTROLS_COMMITTED_EVENT } from './controlCommit';
import {
  buildPerturbedStates,
  normalizePerturbationPattern,
  normalizePerturbationVariableForSystem,
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  perturbationVariableLabel,
  stateIndexForPerturbation,
  type PerturbationPattern,
  type PerturbationVariable
} from './ensemblePerturbation';
import { EXPERIMENT_RECIPES, experimentRecipe, type ExperimentGoal } from './experimentRecipes';
import {
  EXPERIMENT_HANDOFF_SCHEMA,
  normalizeTrajectoryStage as normalizeStage,
  normalizeWorkflowStep,
  TRAJECTORY_STAGES,
  trajectoryStageForStep as stageForStep,
  WORKFLOW_STEPS,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from './experimentWorkflowContract';
import {
  addLocalizedOption as option,
  EXPERIMENT_WORKFLOW_CSS,
  exactExperimentRecipeCopy,
  localize as local,
  mountHandoffNotice,
  mountPersonaPaths,
  nextWorkflowRecommendation,
  perturbationSeedCopy,
  STEP_COPY
} from './experimentWorkflowPresentation';
import { parseNumericControlParam } from './deepLinkControls';
import { formatPreciseDecimal } from './precisionControls';
import { captureSharedExperiment, sharedControlNumber as numeric } from './experimentShareRuntime';
import {
  experimentRecipeControlValues,
  perturbationSystem,
  readExperimentGoal as readGoal,
  readTrajectoryStage as readStage,
  readWorkflowStep as readStep,
  setWorkflowValue as setValue,
  syncPerturbationVariableOptions
} from './experimentWorkflowControls';
import { openWorkflowTarget } from './experimentWorkflowNavigation';
import { nextGoalWorkflowStep, normalizeGoalWorkflowState, trajectoryStageCount } from './experimentWorkflowPolicy';

export { EXPERIMENT_HANDOFF_SCHEMA, TRAJECTORY_STAGES, WORKFLOW_STEPS } from './experimentWorkflowContract';
export type { ExperimentWorkflowStep, TrajectoryStage } from './experimentWorkflowContract';

const [STYLE_ID, UINT32_MAX] = ['experiment-workflow-style', 0xffff_ffff] as const;

function emitWorkflowChange(): void {
  document.dispatchEvent(
    new CustomEvent('pendulum:workflow-state-changed', {
      detail: { goal: readGoal(), step: readStep(), trajectoryStage: readStage() }
    })
  );
}

function setStep(step: ExperimentWorkflowStep): void {
  const control = document.getElementById('workflowStep') as HTMLInputElement | null;
  if (control) control.value = step;
  refreshWorkflow();
  emitWorkflowChange();
}

function stageCount(stage: TrajectoryStage): number {
  const requested = Number((document.getElementById('ensembleRequestedCount') as HTMLInputElement | null)?.value);
  return trajectoryStageCount(experimentRecipe(readGoal()), stage, requested);
}

export function setTrajectoryStage(stage: TrajectoryStage, commit = true): void {
  const stageInput = document.getElementById('trajectoryStage') as HTMLInputElement | null;
  const count = document.getElementById('ensN') as HTMLInputElement | null;
  if (!stageInput || !count) return;
  if (Number(count.value) > 1) {
    const remembered = document.getElementById('ensembleRequestedCount') as HTMLInputElement | null;
    if (remembered) remembered.value = count.value;
  }
  const resolved = experimentRecipe(readGoal()).perturbation.count ? stage : 'reference';
  stageInput.value = resolved;
  const changed = new Set<string>();
  setValue('ensN', stageCount(resolved), changed);
  if (commit) commitLabControls('preset', changed);
  refreshTrajectoryReadout();
  refreshWorkflow();
  emitWorkflowChange();
}

export function applyRecipe(goal: ExperimentGoal, stage: TrajectoryStage = 'reference'): void {
  const recipe = experimentRecipe(goal);
  const resolved = recipe.perturbation.count ? stage : 'reference';
  const changed = new Set<string>();
  for (const [id, value] of experimentRecipeControlValues(recipe, resolved)) setValue(id, value, changed);
  commitLabControls('preset', changed);
  refreshTrajectoryReadout();
}

function runStepAction(step: ExperimentWorkflowStep): void {
  const recipe = experimentRecipe(readGoal());
  const usesEnsemble = recipe.perturbation.count > 0;
  switch (step) {
    case 'choose':
      applyRecipe(readGoal(), 'reference');
      setStep('reference');
      break;
    case 'reference':
      setTrajectoryStage('reference');
      setStep(usesEnsemble ? 'perturb' : 'measure');
      break;
    case 'perturb':
      setTrajectoryStage(usesEnsemble ? 'perturbed' : 'reference');
      setStep(usesEnsemble ? 'observe' : 'measure');
      break;
    case 'observe':
      setTrajectoryStage(usesEnsemble ? 'ensemble' : 'reference');
      setStep('measure');
      document.getElementById('main')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      break;
    case 'measure':
      if (currentAudienceMode() === 'beginner') applyAudienceMode('student');
      openWorkflowTarget(recipe.diagnostic.target, recipe.diagnostic.focus);
      setStep('explain');
      break;
    case 'explain': {
      const evidence = new URL(recipe.evidenceHref, window.location.href);
      openWorkflowTarget(evidence.searchParams.get('tab') ?? 'theory', evidence.hash.slice(1) || undefined);
      break;
    }
  }
}

function mountEnsembleControls(): void {
  const epsilonRow = document.getElementById('ensEps')?.closest('.row');
  const body = epsilonRow?.parentElement;
  if (!body || document.getElementById('ensVariable')) return;
  const createRow = (labelEn: string, labelKo: string, control: HTMLElement): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.htmlFor = control.id;
    label.dataset.en = labelEn;
    label.dataset.ko = labelKo;
    row.append(label, control);
    return row;
  };
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
    createRow('Perturb variable', '교란 변수', variable),
    createRow('Pattern', '패턴', pattern),
    createRow('Pattern seed', '패턴 시드', seed),
    readout
  );
  syncPerturbationVariableOptions();
  for (const control of [variable, pattern, seed]) {
    control.addEventListener('change', () => {
      const trigger = document.getElementById('ensEps');
      trigger?.dispatchEvent(new Event('change', { bubbles: true }));
      refreshTrajectoryReadout();
    });
  }
}

function mountGuidedExperiment(anchor: Element): void {
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
  const initialEnsembleCount = Number((document.getElementById('ensN') as HTMLInputElement | null)?.value);
  stage.value =
    Number.isFinite(initialEnsembleCount) && initialEnsembleCount > 1
      ? 'ensemble'
      : initialEnsembleCount === 1
        ? 'perturbed'
        : 'reference';
  const remembered = document.createElement('input');
  remembered.type = 'hidden';
  remembered.id = 'ensembleRequestedCount';
  remembered.value =
    Number.isFinite(initialEnsembleCount) && initialEnsembleCount > 1
      ? String(Math.min(80, Math.round(initialEnsembleCount)))
      : '12';

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
    button.addEventListener('click', () => setStep(value));
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
  action.addEventListener('click', () => runStepAction(readStep()));
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.id = 'workflowSkip';
  skip.addEventListener('click', () => {
    setStep(nextGoalWorkflowStep(experimentRecipe(readGoal()), readStep()));
  });
  actions.append(action, skip);
  current.append(currentCopy, actions);

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
    button.addEventListener('click', () => setTrajectoryStage(value));
    stageButtons.append(button);
  }
  const legend = document.createElement('div');
  legend.className = 'trajectory-legend';
  for (const [role, en, ko] of [
    ['reference', 'Reference · solid, thick', '기준 · 굵은 실선'],
    ['perturbed', 'Perturbed · dashed, diamond', '교란 · 파선, 마름모'],
    ['ensemble', 'Ensemble · dotted, circles', '앙상블 · 점선, 원']
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
  roles.append(roleTitle, stageButtons, legend, readout, why);

  const next = document.createElement('button');
  next.type = 'button';
  next.id = 'workflowNextAction';
  next.className = 'next-action-note';
  next.addEventListener('click', () => {
    const target = next.dataset.target;
    if (target === 'share') (document.getElementById('shareUrl') as HTMLButtonElement | null)?.click();
    else if (target) openWorkflowTarget(target, next.dataset.focus || undefined);
  });
  root.append(step, stage, remembered, head, progress, current, roles, next);
  anchor.insertAdjacentElement('afterend', root);

  goal.addEventListener('change', () => {
    applyRecipe(readGoal(), 'reference');
    setStep('reference');
  });
}

function refreshTrajectoryReadout(): void {
  const readout = document.getElementById('trajectoryReadout');
  const ensembleReadout = document.getElementById('ensembleRuleReadout');
  if (!readout && !ensembleReadout) return;
  const system = perturbationSystem();
  const dimension = system === 'triple' ? 6 : 4;
  const initial =
    system === 'triple'
      ? [
          numeric('th1', 2),
          numeric('th2', 2.5),
          numeric('th3', 1),
          numeric('iw1', 0),
          numeric('iw2', 0),
          numeric('iw3', 0)
        ]
      : [numeric('th1', 2), numeric('th2', 2.5), numeric('iw1', 0), numeric('iw2', 0)];
  const variable = normalizePerturbationVariableForSystem(
    (document.getElementById('ensVariable') as HTMLSelectElement | null)?.value,
    system
  );
  const pattern = normalizePerturbationPattern(
    (document.getElementById('ensPattern') as HTMLSelectElement | null)?.value
  );
  const epsilon = numeric('ensEps', 1e-4);
  const seed = Math.max(0, Math.min(UINT32_MAX, Math.round(numeric('ensSeed', 1))));
  const built = buildPerturbedStates(initial, dimension, 1, 1, system, { variable, pattern, epsilon, seed });
  const index = stateIndexForPerturbation(variable, system) ?? 0;
  const reference = initial[index] ?? initial[0] ?? 0;
  const perturbed = built.members[0]?.[index] ?? reference;
  const delta = built.firstDelta?.[index] ?? 0;
  const label = perturbationVariableLabel(variable);
  const unit = variable.startsWith('th') ? 'rad' : 'rad/s';
  const stage = readStage();
  const korean = document.documentElement.lang === 'ko';
  const seedCopy = perturbationSeedCopy(pattern, seed);
  const lines = [
    `${korean ? '기준' : 'Reference'}: ${label} = ${formatPreciseDecimal(reference)} ${unit}`,
    `${korean ? '교란' : 'Perturbed'}: ${label} = ${formatPreciseDecimal(perturbed)} ${unit}`,
    `Δ${label} = ${delta >= 0 ? '+' : ''}${delta.toExponential(6)} ${unit}`,
    `${korean ? '단계' : 'Stage'}: ${stage} · ${korean ? '패턴' : 'pattern'} ${pattern} · ε=${epsilon.toExponential(6)} · ${local(seedCopy.token)}`
  ];
  if (pattern === 'normalized')
    lines.push(
      korean
        ? '주의: 각도(rad)와 각속도(rad/s)를 그대로 섞은 정준 좌표 Euclidean norm입니다. 단위 불변 물리 거리로 해석하지 마세요.'
        : 'Caveat: this is a Euclidean norm over canonical angle (rad) and angular-velocity (rad/s) coordinates; it is not a unit-invariant physical distance.'
    );
  if (readout) readout.textContent = lines.join('\n');
  if (ensembleReadout)
    ensembleReadout.textContent = korean
      ? `${label} · ${pattern} · ε=${epsilon.toExponential(3)} · ${seedCopy.token.ko}. ${seedCopy.regeneration.ko}`
      : `${label} · ${pattern} · ε=${epsilon.toExponential(3)} · ${seedCopy.token.en}. ${seedCopy.regeneration.en}`;
  const why = document.getElementById('trajectoryWhy');
  if (why) {
    const recipe = experimentRecipe(readGoal());
    const prefix = `${korean ? '왜 이 값인가요?' : 'Why this?'} ${local(seedCopy.rationale)} `;
    why.replaceChildren(document.createTextNode(prefix));
    const link = document.createElement('a');
    link.href = recipe.evidenceHref;
    link.textContent = korean ? '관련 이론과 가정' : 'Related theory and assumptions';
    why.append(link);
  }
}

function refreshWorkflow(): void {
  if (!document.getElementById('guidedExperiment')) return;
  const recipe = experimentRecipe(readGoal());
  const usesEnsemble = recipe.perturbation.count > 0;
  const step = readStep();
  const copy = STEP_COPY[step];
  const title = document.getElementById('guidedExperimentTitle');
  const intro = title?.nextElementSibling;
  if (title) title.textContent = local(recipe.title);
  if (intro) intro.textContent = `${local(recipe.purpose)} ${local(recipe.expected)}`;
  const currentTitle = document.getElementById('workflowCurrentTitle');
  const currentBody = document.getElementById('workflowCurrentBody');
  if (currentTitle) currentTitle.textContent = local(copy.title).replace(/^\d+\s*·\s*/u, '');
  if (currentBody) currentBody.textContent = local(step === 'measure' ? recipe.measurement : copy.body!);
  const measurement = document.getElementById('workflowMeasurement');
  if (measurement) Object.assign(measurement.dataset, exactExperimentRecipeCopy(recipe, captureSharedExperiment()));
  const action = document.getElementById('workflowPrimaryAction');
  if (action) action.textContent = local(step === 'measure' ? recipe.diagnostic.copy : copy.action!);
  const skip = document.getElementById('workflowSkip');
  if (skip) skip.textContent = document.documentElement.lang === 'ko' ? '건너뛰기' : 'Skip';
  for (const value of WORKFLOW_STEPS) {
    const button = document.querySelector<HTMLElement>(`[data-workflow-step-button="${value}"]`);
    if (!button) continue;
    button.textContent = local(STEP_COPY[value].title).replace(/^\d+\s*·\s*/u, '');
    button.hidden = !usesEnsemble && (value === 'perturb' || value === 'observe');
    if (value === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  const roles = document.querySelector<HTMLElement>('.trajectory-role-panel');
  if (roles) roles.hidden = !usesEnsemble;
  const ensembleControl = document.getElementById('ensN') as HTMLInputElement | null;
  if (ensembleControl) ensembleControl.disabled = !usesEnsemble;
  for (const value of TRAJECTORY_STAGES) {
    document
      .querySelector<HTMLElement>(`[data-trajectory-stage-button="${value}"]`)
      ?.setAttribute('aria-pressed', String(value === readStage()));
  }
  const next = document.getElementById('workflowNextAction');
  if (next) {
    const recommendation = nextWorkflowRecommendation(step, currentAudienceMode(), recipe);
    next.textContent = local(recommendation.copy);
    next.dataset.target = recommendation.target;
    next.dataset.focus =
      (step === 'observe' || step === 'measure' || (!usesEnsemble && step === 'reference')) &&
      recommendation.target === recipe.diagnostic.target
        ? (recipe.diagnostic.focus ?? '')
        : '';
  }
  document.querySelectorAll<HTMLElement>('[data-en][data-ko]').forEach((element) => {
    element.textContent =
      document.documentElement.lang === 'ko' ? (element.dataset.ko ?? '') : (element.dataset.en ?? '');
  });
  refreshTrajectoryReadout();
}

/** Restore the compact Landing query contract after the generated controls exist. */
export function applyExperimentHandoff(href = window.location.href): { applied: boolean; warnings: string[] } {
  const url = new URL(href);
  // A versioned setup hash is the authoritative, later snapshot. Its URL may
  // still carry the original Landing query for attribution, so do not replay a
  // stale handoff over it or present a misleading continuity banner.
  if (url.hash.startsWith('#experiment=')) return { applied: false, warnings: [] };
  const goalValue = url.searchParams.get('experiment');
  const schema = url.searchParams.get('experimentSchema');
  const relevant = goalValue !== null || schema !== null || url.searchParams.has('workflowStep');
  if (!relevant) return { applied: false, warnings: [] };
  const warnings: string[] = [];
  const recipe = experimentRecipe(goalValue);
  if (schema && schema !== EXPERIMENT_HANDOFF_SCHEMA) {
    warnings.push(`Unsupported experiment schema: ${schema}`);
    const guided = document.getElementById('guidedExperiment');
    if (guided) mountHandoffNotice(guided, local(recipe.title), null, warnings);
    return { applied: false, warnings };
  }
  const changed = new Set<string>();
  setValue('experimentGoal', recipe.id, changed);

  const angleUnit = url.searchParams.get('angleUnit');
  if (angleUnit === 'rad' || angleUnit === 'deg') setValue('angleUnit', angleUnit, changed);
  else if (angleUnit !== null) warnings.push(`Unsupported angleUnit: ${angleUnit}`);

  const variable = url.searchParams.get('perturbationVar');
  if (variable && PERTURBATION_VARIABLES.includes(variable as PerturbationVariable)) {
    const normalized = normalizePerturbationVariableForSystem(variable, perturbationSystem());
    setValue('ensVariable', normalized, changed);
    if (normalized !== variable)
      warnings.push(`perturbationVar ${variable} is unavailable for this system; using ${normalized}`);
  } else if (variable !== null) warnings.push(`Unsupported perturbationVar: ${variable}`);
  const pattern = url.searchParams.get('perturbationPattern');
  if (pattern && PERTURBATION_PATTERNS.includes(pattern as PerturbationPattern))
    setValue('ensPattern', pattern, changed);
  else if (pattern !== null) warnings.push(`Unsupported perturbationPattern: ${pattern}`);
  const seedText = url.searchParams.get('perturbationSeed');
  if (seedText !== null) {
    const seed = Number(seedText);
    if (Number.isSafeInteger(seed) && seed >= 0 && seed <= UINT32_MAX) setValue('ensSeed', seed, changed);
    else warnings.push(`Invalid perturbationSeed: ${seedText}`);
  }
  const epsilonText = url.searchParams.get('epsilon') ?? url.searchParams.get('deltaTheta');
  if (epsilonText !== null) {
    const parsed = parseNumericControlParam(epsilonText, { min: 1e-7, max: 1e-2 });
    if (parsed.ok && parsed.value !== undefined && parsed.value > 0) setValue('ensEps', parsed.value, changed);
    else warnings.push(`Invalid perturbation epsilon: ${epsilonText}`);
  }
  const countText = url.searchParams.get('ensembleCount');
  if (countText !== null) {
    const count = Number(countText);
    if (Number.isSafeInteger(count) && count >= 2 && count <= 80) setValue('ensembleRequestedCount', count, changed);
    else warnings.push(`Invalid ensembleCount: ${countText}`);
  }
  const requestedStep = normalizeWorkflowStep(url.searchParams.get('workflowStep')) ?? 'choose';
  const requestedStage = normalizeStage(url.searchParams.get('trajectoryStage')) ?? stageForStep(requestedStep);
  const state = normalizeGoalWorkflowState(recipe, requestedStep, requestedStage);
  if (state.step !== requestedStep || state.stage !== requestedStage)
    warnings.push(`${recipe.id} skips perturbation stages`);
  setValue('workflowStep', state.step, changed);
  setValue('trajectoryStage', state.stage, changed);
  setValue('ensN', stageCount(state.stage), changed);
  if (changed.size) commitLabControls('deep-link', changed);
  refreshWorkflow();

  const guided = document.getElementById('guidedExperiment');
  if (guided)
    mountHandoffNotice(
      guided,
      local(recipe.title),
      `θ₁=${formatPreciseDecimal(numeric('th1', recipe.setup.theta[0]))} rad · θ₂=${formatPreciseDecimal(numeric('th2', recipe.setup.theta[1]))} rad · ε=${formatPreciseDecimal(numeric('ensEps', recipe.perturbation.epsilon))}`,
      warnings
    );
  return { applied: changed.size > 0, warnings };
}

function installProductStatement(): Element | null {
  const header = document.querySelector('.main-col > header');
  if (!header) return null;
  let statement = document.getElementById('productStatement');
  if (!statement) {
    statement = document.createElement('p');
    statement.id = 'productStatement';
    statement.className = 'product-statement';
    statement.dataset.en = 'An interactive laboratory for understanding and measuring nonlinear dynamics.';
    statement.dataset.ko = '비선형 동역학을 이해하고 측정하는 인터랙티브 실험실입니다.';
    header.insertAdjacentElement('afterend', statement);
  }
  return statement;
}

let installed = false;

export function installExperimentWorkflow(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  installAdoptedStyle(STYLE_ID, EXPERIMENT_WORKFLOW_CSS);
  const statement = installProductStatement();
  if (statement)
    mountPersonaPaths(statement, (persona) => {
      applyAudienceMode(persona.mode);
      openWorkflowTarget(persona.tab);
    });
  mountEnsembleControls();
  const presets = document.querySelector('.presets');
  if (presets) mountGuidedExperiment(presets);
  document.getElementById('ensN')?.addEventListener('input', () => {
    let count = numeric('ensN', 0);
    if (!experimentRecipe(readGoal()).perturbation.count && count !== 0) {
      const changed = new Set<string>();
      setValue('ensN', 0, changed);
      setValue('trajectoryStage', 'reference', changed);
      commitLabControls('preset', changed);
      count = 0;
    }
    const stage: TrajectoryStage = count <= 0 ? 'reference' : count === 1 ? 'perturbed' : 'ensemble';
    const stageInput = document.getElementById('trajectoryStage') as HTMLInputElement | null;
    if (stageInput) stageInput.value = stage;
    if (count > 1) {
      const remembered = document.getElementById('ensembleRequestedCount') as HTMLInputElement | null;
      if (remembered) remembered.value = String(count);
    }
    refreshWorkflow();
  });
  document.getElementById('ensEps')?.addEventListener('input', () => {
    refreshTrajectoryReadout();
    refreshWorkflow();
  });
  document.getElementById('sysType')?.addEventListener('change', () => {
    syncPerturbationVariableOptions();
  });
  for (const id of [
    'th1',
    'th2',
    'th3',
    'iw1',
    'iw2',
    'iw3',
    'm1',
    'm2',
    'm3',
    'l1',
    'l2',
    'l3',
    'g',
    'gamma',
    'method',
    'dt',
    'ensVariable',
    'ensPattern',
    'ensSeed'
  ])
    document.getElementById(id)?.addEventListener('change', refreshWorkflow);
  document.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, () => {
    syncPerturbationVariableOptions();
    refreshWorkflow();
  });
  document.addEventListener('pendulum:ui-locale-changed', refreshWorkflow);
  document.addEventListener('pendulum:audience-mode-changed', refreshWorkflow);
  refreshWorkflow();
  applyExperimentHandoff();
}
