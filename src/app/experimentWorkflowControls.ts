import {
  normalizePerturbationVariableForSystem,
  stateIndexForPerturbation,
  type PerturbationVariable
} from './ensemblePerturbation';
import { experimentRecipe, type ExperimentGoal, type ExperimentRecipe } from './experimentRecipes';
import {
  TRAJECTORY_STAGES,
  WORKFLOW_STEPS,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from './experimentWorkflowContract';
import { setEpsilonCanonicalValue, setPrecisionCanonicalValue } from './precisionControls';

export function readTrajectoryStage(): TrajectoryStage {
  const value = (document.getElementById('trajectoryStage') as HTMLInputElement | null)?.value;
  return TRAJECTORY_STAGES.includes(value as TrajectoryStage) ? (value as TrajectoryStage) : 'reference';
}

export function readWorkflowStep(): ExperimentWorkflowStep {
  const value = (document.getElementById('workflowStep') as HTMLInputElement | null)?.value;
  return WORKFLOW_STEPS.includes(value as ExperimentWorkflowStep) ? (value as ExperimentWorkflowStep) : 'choose';
}

export function readExperimentGoal(): ExperimentGoal {
  return experimentRecipe((document.getElementById('experimentGoal') as HTMLSelectElement | null)?.value).id;
}

export function setWorkflowValue(id: string, value: string | number, changed: Set<string>): void {
  const control = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!control) return;
  const next = String(value);
  if (control.value !== next) changed.add(id);
  const precisionRange =
    control.type === 'range' &&
    control.dataset?.precisionKeyboardStep !== undefined &&
    (typeof HTMLInputElement === 'undefined' || control instanceof HTMLInputElement || !('options' in control));
  if (id === 'ensEps') setEpsilonCanonicalValue(control as HTMLInputElement, Number(value));
  else if (precisionRange) setPrecisionCanonicalValue(control as HTMLInputElement, Number(value));
  else control.value = next;
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

export function experimentRecipeControlValues(
  recipe: ExperimentRecipe,
  stage: TrajectoryStage
): ReadonlyArray<readonly [string, string | number]> {
  return [
    ['sysType', recipe.setup.system],
    ['th1', recipe.setup.theta[0]],
    ['th2', recipe.setup.theta[1]],
    ['iw1', recipe.setup.omega[0]],
    ['iw2', recipe.setup.omega[1]],
    ['m1', recipe.setup.m1],
    ['m2', recipe.setup.m2],
    ['l1', recipe.setup.l1],
    ['l2', recipe.setup.l2],
    ['g', recipe.setup.g],
    ['gamma', recipe.setup.gamma],
    ['method', recipe.setup.method],
    ['dt', recipe.setup.dt],
    ['ensVariable', recipe.perturbation.variable],
    ['ensPattern', recipe.perturbation.pattern],
    ['ensEps', recipe.perturbation.epsilon],
    ['ensSeed', recipe.perturbation.seed],
    ['ensembleRequestedCount', recipe.perturbation.count],
    ['ensN', stage === 'ensemble' ? recipe.perturbation.count : stage === 'perturbed' ? 1 : 0],
    ['trajectoryStage', stage]
  ];
}

/** Read the canonical controls used by both the visible exact recipe and share payload. */
export function perturbationSystem(): 'double' | 'compound-double' | 'triple' {
  const value = (document.getElementById('sysType') as HTMLSelectElement | null)?.value;
  return value === 'triple' ? 'triple' : value === 'compound-double' ? 'compound-double' : 'double';
}

/** Keep the perturbation selector aligned with the coordinates owned by the active model. */
export function syncPerturbationVariableOptions(): boolean {
  const select = document.getElementById('ensVariable') as HTMLSelectElement | null;
  if (!select) return false;
  const system = perturbationSystem();
  for (const entry of Array.from(select.options)) {
    const unavailable = stateIndexForPerturbation(entry.value as PerturbationVariable, system) === null;
    entry.disabled = unavailable;
    entry.hidden = unavailable;
  }
  const normalized = normalizePerturbationVariableForSystem(select.value, system);
  if (normalized === select.value) return false;
  select.value = normalized;
  return true;
}
