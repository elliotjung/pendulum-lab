import type { ExperimentRecipe } from './experimentRecipes';
import type { ExperimentWorkflowStep, TrajectoryStage } from './experimentWorkflowContract';

export function normalizeGoalWorkflowState(
  recipe: ExperimentRecipe,
  step: ExperimentWorkflowStep,
  stage: TrajectoryStage
): { step: ExperimentWorkflowStep; stage: TrajectoryStage } {
  if (recipe.perturbation.count > 0) return { step, stage };
  return {
    step: step === 'perturb' ? 'reference' : step === 'observe' ? 'measure' : step,
    stage: 'reference'
  };
}

export function nextGoalWorkflowStep(
  recipe: ExperimentRecipe,
  current: ExperimentWorkflowStep
): ExperimentWorkflowStep {
  const steps: readonly ExperimentWorkflowStep[] = recipe.perturbation.count
    ? ['choose', 'reference', 'perturb', 'observe', 'measure', 'explain']
    : ['choose', 'reference', 'measure', 'explain'];
  const index = steps.indexOf(current);
  return steps[Math.min(steps.length - 1, Math.max(0, index + 1))]!;
}

export function trajectoryStageCount(recipe: ExperimentRecipe, stage: TrajectoryStage, requested: number): number {
  if (!recipe.perturbation.count || stage === 'reference') return 0;
  if (stage === 'perturbed') return 1;
  return Number.isFinite(requested) ? Math.max(2, Math.min(80, Math.round(requested))) : recipe.perturbation.count;
}
