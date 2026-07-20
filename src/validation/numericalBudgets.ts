/**
 * Central work limits for synchronous numerical routines.
 *
 * These are safety ceilings, not recommended scientific settings. They are
 * deliberately far above every built-in workflow while preventing malformed
 * API/worker input from turning a finite number into an effectively unbounded
 * loop or allocation. Keep the limits in one place so related solvers make the
 * same promise and future increases receive an explicit review.
 */
type BudgetSection<Key extends string> = Readonly<Record<Key, number>>;

export interface NumericalWorkBudgets {
  readonly events: BudgetSection<'maxIntegrationSteps' | 'maxRecordedEvents' | 'maxEventFunctionEvaluations'>;
  readonly lyapunov: BudgetSection<
    'maxMeasurementSteps' | 'maxTransientSteps' | 'maxRenormalizationSteps' | 'maxTotalSteps'
  >;
  readonly clv: BudgetSection<'maxStateDimension' | 'maxTotalIntegrationSteps' | 'maxStoredFloat64Cells'>;
  readonly observableSampling: BudgetSection<'maxSamples' | 'maxSampleStride' | 'maxTransientSteps' | 'maxTotalSteps'>;
  readonly rqa: BudgetSection<
    | 'maxEmbeddedPoints'
    | 'maxEmbeddingCells'
    | 'maxDenseMatrixCells'
    | 'maxDistanceComponentEvaluations'
    | 'maxUncertaintyBlocks'
  >;
  readonly ftle: BudgetSection<
    'maxStateDimension' | 'maxStepsPerTrajectory' | 'maxGridResolution' | 'maxGridTrajectorySteps'
  >;
  readonly flipBasin: BudgetSection<'maxResolution' | 'maxStepsPerCell' | 'maxGridTrajectorySteps'>;
  readonly wada: BudgetSection<'maxResolutions' | 'maxGridTrajectorySteps'>;
  readonly parameterEstimation: BudgetSection<
    'maxForwardStepsPerEvaluation' | 'maxOptimizerIterations' | 'maxDampingAttemptsPerIteration'
  >;
  readonly bifurcation: BudgetSection<'maxParameters' | 'maxSweepIntegrationSteps'>;
  readonly codimTwo: BudgetSection<'maxResolution' | 'maxGridIntegrationSteps'>;
}

export const NUMERICAL_WORK_BUDGETS: Readonly<NumericalWorkBudgets> = Object.freeze({
  events: Object.freeze({
    maxIntegrationSteps: 10_000_000,
    maxRecordedEvents: 1_000_000,
    maxEventFunctionEvaluations: 50_000_000
  }),
  lyapunov: Object.freeze({
    maxMeasurementSteps: 5_000_000,
    maxTransientSteps: 5_000_000,
    maxRenormalizationSteps: 1_000_000,
    maxTotalSteps: 8_000_000
  }),
  clv: Object.freeze({
    maxStateDimension: 64,
    maxTotalIntegrationSteps: 8_000_000,
    maxStoredFloat64Cells: 8_000_000
  }),
  observableSampling: Object.freeze({
    maxSamples: 1_000_000,
    maxSampleStride: 1_000_000,
    maxTransientSteps: 5_000_000,
    maxTotalSteps: 50_000_000
  }),
  rqa: Object.freeze({
    maxEmbeddedPoints: 4_000,
    maxEmbeddingCells: 16_000_000,
    maxDenseMatrixCells: 16_000_000,
    maxDistanceComponentEvaluations: 64_000_000,
    maxUncertaintyBlocks: 1_024
  }),
  ftle: Object.freeze({
    maxStateDimension: 128,
    maxStepsPerTrajectory: 2_000_000,
    maxGridResolution: 512,
    maxGridTrajectorySteps: 150_000_000
  }),
  flipBasin: Object.freeze({
    maxResolution: 512,
    maxStepsPerCell: 1_000_000,
    maxGridTrajectorySteps: 150_000_000
  }),
  wada: Object.freeze({
    maxResolutions: 8,
    maxGridTrajectorySteps: 150_000_000
  }),
  parameterEstimation: Object.freeze({
    maxForwardStepsPerEvaluation: 2_000_000,
    maxOptimizerIterations: 100_000,
    maxDampingAttemptsPerIteration: 1_024
  }),
  bifurcation: Object.freeze({
    maxParameters: 4_096,
    maxSweepIntegrationSteps: 150_000_000
  }),
  codimTwo: Object.freeze({
    maxResolution: 40,
    maxGridIntegrationSteps: 150_000_000
  })
});

/** Smallest normal float64; subnormal RK stages lose their fractional substeps. */
export const MIN_NORMAL_INTEGRATION_STEP: number = 2 ** -1022;

export function assertUsableIntegrationStep(dt: number, caller: string): void {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error(`${caller}: dt must be positive and finite.`);
  }
  if (dt < MIN_NORMAL_INTEGRATION_STEP) {
    throw new Error(`${caller}: dt is too small for reliable float64 integration.`);
  }
}

/** Return ceil(span / dt), rejecting ratios that cannot be safely budgeted. */
export function integrationStepCount(span: number, dt: number, caller: string): number {
  assertUsableIntegrationStep(dt, caller);
  if (!Number.isFinite(span) || span < 0) {
    throw new Error(`${caller}: integration span must be finite and non-negative.`);
  }
  if (span > 0 && span < MIN_NORMAL_INTEGRATION_STEP) {
    throw new Error(`${caller}: integration span is too small for reliable float64 integration.`);
  }
  const ratio = span / dt;
  if (!Number.isFinite(ratio) || ratio > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${caller}: integration step count must be finite and safely representable.`);
  }
  return Math.ceil(ratio);
}

/** Multiply non-negative integer work factors without unsafe-integer rounding. */
export function checkedWorkProduct(factors: readonly number[], caller: string): number {
  let product = 1;
  for (const factor of factors) {
    if (!Number.isSafeInteger(factor) || factor < 0) {
      throw new Error(`${caller}: work factors must be non-negative safe integers.`);
    }
    if (factor !== 0 && product > Math.floor(Number.MAX_SAFE_INTEGER / factor)) {
      throw new Error(`${caller}: total work must be safely representable.`);
    }
    product *= factor;
  }
  return product;
}
