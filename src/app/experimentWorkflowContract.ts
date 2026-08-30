export const EXPERIMENT_HANDOFF_SCHEMA = 'pendulum-sensitive-dependence/v1';
export const WORKFLOW_STEPS = ['choose', 'reference', 'perturb', 'observe', 'measure', 'explain'] as const;
export type ExperimentWorkflowStep = (typeof WORKFLOW_STEPS)[number];
export const TRAJECTORY_STAGES = ['reference', 'perturbed', 'ensemble'] as const;
export type TrajectoryStage = (typeof TRAJECTORY_STAGES)[number];

export function normalizeWorkflowStep(value: string | null): ExperimentWorkflowStep | null {
  return WORKFLOW_STEPS.includes(value as ExperimentWorkflowStep) ? (value as ExperimentWorkflowStep) : null;
}

export function normalizeTrajectoryStage(value: string | null): TrajectoryStage | null {
  return TRAJECTORY_STAGES.includes(value as TrajectoryStage) ? (value as TrajectoryStage) : null;
}

export function trajectoryStageForStep(step: ExperimentWorkflowStep): TrajectoryStage {
  if (step === 'choose' || step === 'reference') return 'reference';
  if (step === 'perturb' || step === 'observe') return 'perturbed';
  return 'ensemble';
}
