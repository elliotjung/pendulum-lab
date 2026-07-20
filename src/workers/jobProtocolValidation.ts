import type { ChaosRequest } from './chaosProtocol';
import { validateChaosRequestPayload } from './chaosRequestValidation';
import {
  JOB_PROTOCOL_V2,
  jobPhases,
  type JobCheckpointState,
  type JobControlMessage,
  type JobEventMessage,
  type JobInboundMessage,
  type JobStatus,
  type JobSubmitMessage
} from './jobProtocolTypes';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  integrationStepCount,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';

const MAX_JOB_ID_LENGTH = 160;
const MAX_JOB_PRIORITY = 1_000_000;
const MAX_JOB_TIMEOUT_MS = 3_600_000;
const MAX_CHECKPOINT_INTERVAL = 10_000;
export const STUDY_PHASE_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  lyapunov: Object.freeze(['lambdaMax', 'lambdaBlockStdError']),
  rqa: Object.freeze(['rqaDeterminism', 'rqaDivergence']),
  ftle: Object.freeze(['ftle', 'ftleHorizon'])
});
const JOB_STATUSES = new Set<JobStatus>([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'timed-out'
]);

type DataRecord = Record<string, unknown>;

export function dataRecord(value: unknown, label: string): DataRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value as DataRecord;
}

function optionalRecord(value: unknown, label: string): DataRecord {
  return value === undefined ? {} : dataRecord(value, label);
}

export function nonEmptyString(value: unknown, label: string, maximumLength: number = MAX_JOB_ID_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maximumLength} characters`);
  }
  return value;
}

export function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be finite and in [${minimum}, ${maximum}]`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be a safe integer in [${minimum}, ${maximum}]`);
  }
  return value as number;
}

function numberOption(
  options: DataRecord,
  key: string,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  return finiteNumber(options[key] ?? fallback, `${label}.${key}`, minimum, maximum);
}

function integerOption(
  options: DataRecord,
  key: string,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  return safeInteger(options[key] ?? fallback, `${label}.${key}`, minimum, maximum);
}

function rangeOption(
  options: DataRecord,
  key: string,
  fallback: readonly [number, number],
  label: string
): [number, number] {
  const value = options[key] ?? fallback;
  if (!Array.isArray(value) || value.length !== 2 || !Object.hasOwn(value, 0) || !Object.hasOwn(value, 1)) {
    throw new RangeError(`${label}.${key} must contain exactly two values`);
  }
  const lower = finiteNumber(value[0], `${label}.${key}[0]`, -Number.MAX_VALUE, Number.MAX_VALUE);
  const upper = finiteNumber(value[1], `${label}.${key}[1]`, -Number.MAX_VALUE, Number.MAX_VALUE);
  if (!(upper > lower) || !Number.isFinite(upper - lower)) {
    throw new RangeError(`${label}.${key} must be finite and strictly increasing`);
  }
  return [lower, upper];
}

function assertWorkAtMost(work: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(work) || work < 0 || work > maximum) {
    throw new RangeError(`${label} work exceeds ${maximum}`);
  }
  return work;
}

function validateLyapunovWork(
  settingsValue: unknown,
  dimension: number,
  label: string,
  defaultSteps = 20_000,
  countValue?: unknown
): number {
  const settings = optionalRecord(settingsValue, label);
  const dt = numberOption(settings, 'dt', 0.01, label, Number.MIN_VALUE, 1);
  assertUsableIntegrationStep(dt, label);
  const steps = integerOption(
    settings,
    'steps',
    defaultSteps,
    label,
    1,
    NUMERICAL_WORK_BUDGETS.lyapunov.maxMeasurementSteps
  );
  const transientSteps = integerOption(
    settings,
    'transientSteps',
    2_000,
    label,
    0,
    NUMERICAL_WORK_BUDGETS.lyapunov.maxTransientSteps
  );
  const renormEvery = integerOption(
    settings,
    'renormEvery',
    10,
    label,
    1,
    NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps
  );
  if (renormEvery > steps) throw new RangeError(`${label}.renormEvery must not exceed steps`);
  const totalSteps = steps + transientSteps;
  assertWorkAtMost(totalSteps, NUMERICAL_WORK_BUDGETS.lyapunov.maxTotalSteps, label);
  const seed = settings.seed;
  if (seed !== undefined && (typeof seed !== 'number' || !Number.isFinite(seed))) {
    throw new RangeError(`${label}.seed must be finite`);
  }
  if (settings.method !== undefined && typeof settings.method !== 'string') {
    throw new TypeError(`${label}.method must be a string`);
  }
  const count = countValue === undefined ? 1 : safeInteger(countValue, `${label}.count`, 1, Math.max(1, dimension));
  return checkedWorkProduct([totalSteps, count, dimension], label);
}

function validateSamplingWork(
  settingsValue: unknown,
  label: string,
  defaults: { sampleEvery: number; samples: number; transientSteps: number },
  rqa = false
): number {
  const settings = optionalRecord(settingsValue, label);
  const dt = numberOption(settings, 'dt', 0.01, label, Number.MIN_VALUE, 1);
  assertUsableIntegrationStep(dt, label);
  const sampleEvery = integerOption(
    settings,
    'sampleEvery',
    defaults.sampleEvery,
    label,
    1,
    NUMERICAL_WORK_BUDGETS.observableSampling.maxSampleStride
  );
  const maximumSamples = rqa
    ? NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddedPoints
    : NUMERICAL_WORK_BUDGETS.observableSampling.maxSamples;
  const samples = integerOption(settings, 'samples', defaults.samples, label, 20, maximumSamples);
  const transientSteps = integerOption(
    settings,
    'transientSteps',
    defaults.transientSteps,
    label,
    0,
    NUMERICAL_WORK_BUDGETS.observableSampling.maxTransientSteps
  );
  const sampledSteps = checkedWorkProduct([samples, sampleEvery], label);
  const integrationWork = sampledSteps + transientSteps;
  assertWorkAtMost(integrationWork, NUMERICAL_WORK_BUDGETS.observableSampling.maxTotalSteps, label);
  if (!rqa) return integrationWork;

  const dimension = integerOption(settings, 'dimension', 2, label, 1, samples);
  const delay = integerOption(settings, 'delay', 5, label, 1, samples);
  integerOption(settings, 'lMin', 2, label, 1, samples);
  integerOption(settings, 'vMin', 2, label, 1, samples);
  integerOption(settings, 'theiler', 1, label, 0, samples);
  if (settings.epsilon !== undefined) finiteNumber(settings.epsilon, `${label}.epsilon`, 0, Number.MAX_VALUE);
  if (settings.targetRecurrenceRate !== undefined) {
    const target = finiteNumber(settings.targetRecurrenceRate, `${label}.targetRecurrenceRate`, 0, 1);
    if (target === 0 || target === 1) throw new RangeError(`${label}.targetRecurrenceRate must be in (0, 1)`);
  }
  const embeddedPoints = samples - (dimension - 1) * delay;
  if (embeddedPoints < 2) throw new RangeError(`${label} embedding leaves fewer than two points`);
  assertWorkAtMost(
    checkedWorkProduct([embeddedPoints, dimension], label),
    NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddingCells,
    label
  );
  const denseWork = assertWorkAtMost(
    checkedWorkProduct([embeddedPoints, embeddedPoints], label),
    NUMERICAL_WORK_BUDGETS.rqa.maxDenseMatrixCells,
    label
  );
  const distanceWork = assertWorkAtMost(
    checkedWorkProduct([denseWork, dimension], label),
    NUMERICAL_WORK_BUDGETS.rqa.maxDistanceComponentEvaluations,
    label
  );
  return integrationWork + distanceWork;
}

function validateGridWork(
  settingsValue: unknown,
  label: string,
  defaults: { n: number; dt: number; span: number },
  budget: { maxResolution: number; maxStepsPerTrajectory: number; maxGridWork: number },
  spanKey: 'maxTime' | 'totalTime'
): number {
  const settings = optionalRecord(settingsValue, label);
  const n = integerOption(settings, 'n', defaults.n, label, 2, budget.maxResolution);
  const dt = numberOption(settings, 'dt', defaults.dt, label, Number.MIN_VALUE, 1);
  const span = numberOption(settings, spanKey, defaults.span, label, 0, Number.MAX_VALUE);
  rangeOption(settings, 'range', [-3, 3], label);
  const steps = integrationStepCount(span, dt, label);
  assertWorkAtMost(steps, budget.maxStepsPerTrajectory, label);
  return assertWorkAtMost(checkedWorkProduct([n, n, steps], label), budget.maxGridWork, label);
}

/** Validate every loop/allocation-driving option and return a conservative work estimate. */
export function validateChaosJobRequest(requestValue: unknown): number {
  validateChaosRequestPayload(requestValue);
  const request = requestValue as ChaosRequest;
  nonEmptyString(request.id, 'chaos request id');
  switch (request.kind) {
    case 'lyapunov':
      return validateLyapunovWork(request.settings, request.state0.length, 'lyapunov settings');
    case 'lyapunovSpectrum':
      return validateLyapunovWork(
        request.settings,
        request.state0.length,
        'lyapunov spectrum settings',
        20_000,
        request.count ?? request.state0.length
      );
    case 'bifurcation': {
      const settings = dataRecord(request.settings, 'bifurcation settings');
      const dt = numberOption(settings, 'dt', 0.01, 'bifurcation settings', Number.MIN_VALUE, 1);
      const maxTime = numberOption(settings, 'maxTime', 20, 'bifurcation settings', 0, Number.MAX_VALUE);
      integerOption(
        settings,
        'transientCrossings',
        20,
        'bifurcation settings',
        0,
        NUMERICAL_WORK_BUDGETS.events.maxRecordedEvents
      );
      integerOption(
        settings,
        'maxPointsPerParam',
        200,
        'bifurcation settings',
        1,
        NUMERICAL_WORK_BUDGETS.events.maxRecordedEvents
      );
      const steps = integrationStepCount(maxTime, dt, 'bifurcation settings');
      assertWorkAtMost(steps, NUMERICAL_WORK_BUDGETS.events.maxIntegrationSteps, 'bifurcation settings');
      return assertWorkAtMost(
        checkedWorkProduct([request.amplitudes.length, steps], 'bifurcation settings'),
        NUMERICAL_WORK_BUDGETS.bifurcation.maxSweepIntegrationSteps,
        'bifurcation settings'
      );
    }
    case 'zeroOne': {
      const samplingWork = validateSamplingWork(request.settings, 'zero-one settings', {
        sampleEvery: 30,
        samples: 3_000,
        transientSteps: 2_000
      });
      const settings = optionalRecord(request.settings, 'zero-one settings');
      const samples = integerOption(
        settings,
        'samples',
        3_000,
        'zero-one settings',
        20,
        NUMERICAL_WORK_BUDGETS.observableSampling.maxSamples
      );
      const ncut = Math.max(2, Math.floor(samples * 0.1));
      const statisticWork = checkedWorkProduct([100, samples, ncut], 'zero-one settings');
      return assertWorkAtMost(samplingWork + statisticWork, 150_000_000, 'zero-one settings');
    }
    case 'clv': {
      const settings = optionalRecord(request.settings, 'CLV settings');
      const dt = numberOption(settings, 'dt', 0.01, 'CLV settings', Number.MIN_VALUE, 1);
      assertUsableIntegrationStep(dt, 'CLV settings');
      const renormEvery = integerOption(
        settings,
        'renormEvery',
        10,
        'CLV settings',
        1,
        NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps
      );
      const forward = integerOption(settings, 'forwardTransient', 200, 'CLV settings', 0, 1_000_000);
      const window = integerOption(settings, 'window', 400, 'CLV settings', 1, 1_000_000);
      const backward = integerOption(settings, 'backwardTransient', 200, 'CLV settings', 0, 1_000_000);
      if (backward >= window) throw new RangeError('CLV settings.backwardTransient must be smaller than window');
      if (settings.seed !== undefined) {
        safeInteger(settings.seed, 'CLV settings.seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      }
      const count = safeInteger(
        request.count ?? request.state0.length,
        'CLV count',
        1,
        Math.min(request.state0.length, NUMERICAL_WORK_BUDGETS.clv.maxStateDimension)
      );
      const intervals = forward + window;
      const totalSteps = assertWorkAtMost(
        checkedWorkProduct([intervals, renormEvery], 'CLV settings'),
        NUMERICAL_WORK_BUDGETS.clv.maxTotalIntegrationSteps,
        'CLV settings'
      );
      const frameCells = checkedWorkProduct([window + 1, count, request.state0.length], 'CLV settings');
      const factorCells = checkedWorkProduct([window, count, count], 'CLV settings');
      const vectorCells = checkedWorkProduct([window, count, request.state0.length], 'CLV settings');
      assertWorkAtMost(
        frameCells + factorCells + vectorCells,
        NUMERICAL_WORK_BUDGETS.clv.maxStoredFloat64Cells,
        'CLV settings'
      );
      return checkedWorkProduct([totalSteps, request.state0.length, count], 'CLV settings');
    }
    case 'basin':
      return validateGridWork(
        request.settings,
        'basin settings',
        { n: 60, dt: 0.01, span: 20 },
        {
          maxResolution: NUMERICAL_WORK_BUDGETS.flipBasin.maxResolution,
          maxStepsPerTrajectory: NUMERICAL_WORK_BUDGETS.flipBasin.maxStepsPerCell,
          maxGridWork: NUMERICAL_WORK_BUDGETS.flipBasin.maxGridTrajectorySteps
        },
        'maxTime'
      );
    case 'rqa':
      return validateSamplingWork(
        request.settings,
        'RQA settings',
        { sampleEvery: 20, samples: 360, transientSteps: 2_000 },
        true
      );
    case 'ftle':
      return validateGridWork(
        request.settings,
        'FTLE settings',
        { n: 60, dt: 0.01, span: 3 },
        {
          maxResolution: NUMERICAL_WORK_BUDGETS.ftle.maxGridResolution,
          maxStepsPerTrajectory: NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory,
          maxGridWork: NUMERICAL_WORK_BUDGETS.ftle.maxGridTrajectorySteps
        },
        'totalTime'
      );
    case 'studyPoint': {
      const settings = optionalRecord(request.settings, 'study-point settings');
      const lyapunovWork = validateLyapunovWork(
        settings.lyapunov,
        request.state0.length,
        'study-point Lyapunov settings',
        8_000
      );
      const rqaWork = validateSamplingWork(
        settings.rqa,
        'study-point RQA settings',
        { sampleEvery: 20, samples: 360, transientSteps: 2_000 },
        true
      );
      const ftleDt = finiteNumber(settings.ftleDt ?? 0.01, 'study-point ftleDt', Number.MIN_VALUE, 1);
      const horizon = finiteNumber(settings.ftleHorizon ?? 5, 'study-point ftleHorizon', 0, Number.MAX_VALUE);
      const ftleWork = integrationStepCount(horizon, ftleDt, 'study-point FTLE settings');
      const total = lyapunovWork + rqaWork + ftleWork;
      if (!Number.isSafeInteger(total)) throw new RangeError('study-point work must be safely representable');
      return total;
    }
    case 'wadaConvergence': {
      const settings = optionalRecord(request.settings, 'Wada settings');
      const rawResolutions = settings.resolutions ?? [40, 60, 90];
      if (
        !Array.isArray(rawResolutions) ||
        rawResolutions.length < 1 ||
        rawResolutions.length > NUMERICAL_WORK_BUDGETS.wada.maxResolutions
      ) {
        throw new RangeError('Wada resolutions exceed the supported count');
      }
      const resolutions = rawResolutions.map((value, index) =>
        safeInteger(value, `Wada resolutions[${index}]`, 16, 240)
      );
      if (new Set(resolutions).size !== resolutions.length) throw new RangeError('Wada resolutions must be unique');
      const dt = numberOption(settings, 'dt', 0.01, 'Wada settings', Number.MIN_VALUE, 1);
      const maxTime = numberOption(settings, 'maxTime', 20, 'Wada settings', 0, Number.MAX_VALUE);
      rangeOption(settings, 'range', [-3, 3], 'Wada settings');
      const radius = integerOption(settings, 'radius', 2, 'Wada settings', 0, 240);
      finiteNumber(settings.threshold ?? 0.95, 'Wada settings.threshold', 0, 1);
      finiteNumber(settings.convergenceTolerance ?? 0.05, 'Wada settings.convergenceTolerance', 0, 1);
      const steps = integrationStepCount(maxTime, dt, 'Wada settings');
      assertWorkAtMost(steps, NUMERICAL_WORK_BUDGETS.flipBasin.maxStepsPerCell, 'Wada settings');
      let total = 0;
      for (const n of resolutions) {
        total += checkedWorkProduct([n, n, steps], 'Wada settings');
        const diameter = Math.min(n, 2 * radius + 1);
        total += checkedWorkProduct([n, n, diameter, diameter], 'Wada settings');
        assertWorkAtMost(total, NUMERICAL_WORK_BUDGETS.wada.maxGridTrajectorySteps, 'Wada settings');
      }
      return total;
    }
    case 'codim2': {
      const settings = optionalRecord(request.settings, 'codimension-two settings');
      const n = integerOption(
        settings,
        'n',
        12,
        'codimension-two settings',
        4,
        NUMERICAL_WORK_BUDGETS.codimTwo.maxResolution
      );
      const steps = integerOption(settings, 'steps', 4_000, 'codimension-two settings', 500, 5_000_000);
      const dt = numberOption(settings, 'dt', 0.01, 'codimension-two settings', Number.MIN_VALUE, 1);
      assertUsableIntegrationStep(dt, 'codimension-two settings');
      numberOption(settings, 'neutralBand', 5e-3, 'codimension-two settings', 0, Number.MAX_VALUE);
      return assertWorkAtMost(
        checkedWorkProduct([n, n, steps], 'codimension-two settings'),
        NUMERICAL_WORK_BUDGETS.codimTwo.maxGridIntegrationSteps,
        'codimension-two settings'
      );
    }
    default:
      throw new TypeError(`unsupported chaos request kind: ${String((request as { kind?: unknown }).kind)}`);
  }
}

function validateCheckpointShape(value: unknown, label: string): JobCheckpointState {
  const checkpoint = dataRecord(value, label);
  if (!Array.isArray(checkpoint.completedPhases)) throw new TypeError(`${label}.completedPhases must be an array`);
  const completedPhases = checkpoint.completedPhases.map((phase, index) =>
    nonEmptyString(phase, `${label}.completedPhases[${index}]`, 64)
  );
  if (new Set(completedPhases).size !== completedPhases.length) {
    throw new RangeError(`${label}.completedPhases must be unique`);
  }
  const partial = dataRecord(checkpoint.partial, `${label}.partial`);
  for (const [key, entry] of Object.entries(partial)) {
    nonEmptyString(key, `${label}.partial key`, 64);
    finiteNumber(entry, `${label}.partial.${key}`, -Number.MAX_VALUE, Number.MAX_VALUE);
  }
  return { completedPhases, partial: partial as Record<string, number> };
}

export function validateJobCheckpoint(value: unknown, request: ChaosRequest): JobCheckpointState {
  const checkpoint = validateCheckpointShape(value, 'job checkpoint');
  const phases = jobPhases(request);
  for (let index = 0; index < checkpoint.completedPhases.length; index += 1) {
    const phase = checkpoint.completedPhases[index]!;
    if (!phases.includes(phase)) throw new RangeError(`job checkpoint contains unsupported phase ${phase}`);
    if (phase !== phases[index]) {
      throw new RangeError('job checkpoint phases must be a completed prefix in execution order');
    }
  }
  if (request.kind !== 'studyPoint') {
    if (Object.keys(checkpoint.partial).length > 0) {
      throw new RangeError('single-phase job checkpoints cannot contain partial scalar results');
    }
    return checkpoint;
  }
  const allowed = new Set(checkpoint.completedPhases.flatMap((phase) => STUDY_PHASE_FIELDS[phase] ?? []));
  for (const key of Object.keys(checkpoint.partial)) {
    if (!allowed.has(key)) throw new RangeError(`job checkpoint partial ${key} has no completed phase`);
  }
  for (const phase of checkpoint.completedPhases) {
    for (const key of STUDY_PHASE_FIELDS[phase] ?? []) {
      if (!Object.hasOwn(checkpoint.partial, key)) throw new RangeError(`job checkpoint is missing ${key}`);
    }
  }
  return checkpoint;
}

export function validateJobInboundMessage(value: unknown): JobInboundMessage {
  const message = dataRecord(value, 'job message');
  if (message.protocol !== JOB_PROTOCOL_V2) throw new TypeError('job message protocol is unsupported');
  const type = nonEmptyString(message.type, 'job message type', 16);
  nonEmptyString(message.jobId, 'job message jobId');
  if (type === 'submit') {
    safeInteger(message.priority, 'job priority', -MAX_JOB_PRIORITY, MAX_JOB_PRIORITY);
    const work = validateChaosJobRequest(message.request);
    if (!Number.isSafeInteger(work) || work < 0) throw new RangeError('job work estimate is invalid');
    if (message.timeoutMs !== undefined) {
      safeInteger(message.timeoutMs, 'job timeoutMs', 1, MAX_JOB_TIMEOUT_MS);
    }
    if (message.checkpointEvery !== undefined) {
      safeInteger(message.checkpointEvery, 'job checkpointEvery', 0, MAX_CHECKPOINT_INTERVAL);
    }
    if (message.checkpoint !== undefined) validateJobCheckpoint(message.checkpoint, message.request as ChaosRequest);
    return value as JobSubmitMessage;
  }
  if (type !== 'cancel' && type !== 'pause' && type !== 'resume' && type !== 'status') {
    throw new TypeError(`unsupported job message type: ${type}`);
  }
  return value as JobControlMessage;
}

export function isJobInboundMessage(value: unknown): value is JobInboundMessage {
  try {
    validateJobInboundMessage(value);
    return true;
  } catch {
    return false;
  }
}

function validateEventCheckpoint(value: unknown): void {
  validateCheckpointShape(value, 'job event checkpoint');
}

export function isJobEventMessage(value: unknown): value is JobEventMessage {
  try {
    const event = dataRecord(value, 'job event');
    if (event.protocol !== JOB_PROTOCOL_V2) return false;
    const type = nonEmptyString(event.type, 'job event type', 16);
    nonEmptyString(event.jobId, 'job event jobId');
    const elapsed = (): void => {
      finiteNumber(event.elapsedMs, 'job event elapsedMs', 0, Number.MAX_VALUE);
    };
    if (type === 'accepted') {
      safeInteger(event.queuePosition, 'job event queuePosition', 0, Number.MAX_SAFE_INTEGER);
    } else if (type === 'progress') {
      nonEmptyString(event.phase, 'job event phase', 64);
      const completed = safeInteger(event.completedPhases, 'job event completedPhases', 0, 1_000);
      const total = safeInteger(event.totalPhases, 'job event totalPhases', 1, 1_000);
      if (completed > total) throw new RangeError('job event completedPhases exceeds totalPhases');
      elapsed();
    } else if (type === 'checkpoint') {
      validateEventCheckpoint(event.checkpoint);
      elapsed();
    } else if (type === 'status') {
      if (typeof event.status !== 'string' || !JOB_STATUSES.has(event.status as JobStatus)) return false;
    } else if (type === 'result') {
      const response = dataRecord(event.response, 'job event response');
      nonEmptyString(response.id, 'job event response id');
      if (response.ok !== true) return false;
      nonEmptyString(response.kind, 'job event response kind', 32);
      elapsed();
    } else if (type === 'failed') {
      nonEmptyString(event.error, 'job event error', 4_096);
      nonEmptyString(event.phase, 'job event phase', 64);
      validateEventCheckpoint(event.checkpoint);
      elapsed();
    } else if (type === 'cancelled') {
      nonEmptyString(event.atPhase, 'job event atPhase', 64);
      validateEventCheckpoint(event.checkpoint);
    } else if (type === 'timed-out') {
      validateEventCheckpoint(event.checkpoint);
      elapsed();
    } else if (type === 'paused') {
      nonEmptyString(event.atPhase, 'job event atPhase', 64);
    } else if (type !== 'resumed') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Names of the phases a request decomposes into. */
