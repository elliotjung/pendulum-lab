import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { runStability } from '../../src/product/adapters/analysis/stability/execute';
import { defaultStabilitySettings } from '../../src/product/adapters/analysis/stability/settings';
import type {
  StabilityKind,
  StabilityRequest,
  StabilityResult,
  StabilitySettings
} from '../../src/product/adapters/analysis/stability/contracts';
import { defaultDrivenConfig, toCanonicalDriven, createDrivenFlow } from '../../src/product/adapters/physics/driven';
import { rk4Step } from '../../src/physics/integrators';
import { continueDrivenPeriodicOrbit } from '../../src/chaos/continuation';
import type { JsonValue } from '../../src/product/persistence/safe-data';

// Measurements run through the actual product adapter. Closed-form expectations
// and existing native boundaries are independent checks, not substitute engines.
function request(
  kind: StabilityKind,
  settings: StabilitySettings = {},
  amplitude = 0.3,
  forcingPhase = Math.PI / 2
): StabilityRequest {
  const canonical = toCanonicalDriven({
    ...defaultDrivenConfig(),
    parameters: { g: 1, length: 1, damping: 0.5 },
    initialState: [0.1, 0, 0],
    forcing: { waveform: 'sine', amplitude, frequency: 2 / 3, phase: forcingPhase }
  });
  assert(canonical.ok, 'Measurement fixture must remain valid under the existing physical adapter.');
  const source = typeof settings.source === 'string' ? settings.source : undefined;
  return {
    id: 'S20-numerical-metrics',
    kind,
    experiment: canonical.value,
    settings: { ...defaultStabilitySettings(kind, canonical.value, source), ...settings }
  };
}
function detail(result: StabilityResult, key: string): JsonValue {
  assert(result.details && typeof result.details === 'object' && !Array.isArray(result.details));
  const value = result.details[key];
  assert(value !== undefined, `Missing numerical detail: ${key}`);
  return value;
}
function object(value: JsonValue): Record<string, JsonValue> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function number(value: JsonValue | undefined): number {
  assert(typeof value === 'number' && Number.isFinite(value));
  return value;
}
function maximum(values: number[]): number {
  assert(values.length > 0 && values.every(Number.isFinite));
  return Math.max(...values);
}
function numericalSummary(job: StabilityRequest, result: StabilityResult) {
  return {
    source: result.source,
    status: result.status,
    settings: job.settings,
    rows: result.rows.length,
    branchPoints: result.branch.length,
    maxVerifiedBranchResidual: result.branch.length ? maximum(result.branch.map((point) => point.residual)) : null
  };
}

const phaseJob = request('fixed-point', { tolerance: 1e-10 }, 0.3, 0.37);
const unchangedPhaseSnapshot = JSON.stringify(phaseJob.experiment);
const phaseResult = runStability(phaseJob),
  phasePoint = phaseResult.branch[0]!;
const flow = createDrivenFlow({
  ...defaultDrivenConfig(),
  parameters: { g: 1, length: 1, damping: 0.5 },
  initialState: [...phasePoint.state, 0],
  forcing: { waveform: 'sine', amplitude: 0.3, frequency: 2 / 3, phase: 0.37 }
});
const phaseState = Float64Array.from(flow.initial),
  phaseNext = new Float64Array(3),
  drivePeriod = 3 * Math.PI;
for (let i = 0; i < 256; i++) {
  rk4Step(phaseState, drivePeriod / 256, flow.rhs, phaseNext);
  phaseState.set(phaseNext);
}
const productSectionResidual = maximum(phasePoint.state.map((value, index) => Math.abs(phaseState[index]! - value)));
const floquetJob = request('floquet', { tolerance: 1e-10 }, 0.3, 0.37),
  floquet = runStability(floquetJob);
const floquetDeterminant = number(object(detail(floquet, 'native')).determinant);
const expectedDeterminant = Math.exp(-0.5 * drivePeriod),
  determinantError = Math.abs(floquetDeterminant - expectedDeterminant);
const linearJob = request('floquet', {
  source: 'linear-oscillator',
  period: 1,
  linearFrequency: 0.7,
  linearDamping: 0.2
});
const linear = runStability(linearJob),
  linearModulusError = maximum(linear.rows.map((row) => Math.abs(row[3]! - Math.exp(-0.1))));

const continuationJob = request('continuation', { start: 0.2, end: 0.4, points: 3, tolerance: 1e-10 });
const continuation = runStability(continuationJob);
const nativeContinuation = continueDrivenPeriodicOrbit(
  { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
  {
    parameter: 'driveAmplitude',
    start: 0.2,
    end: 0.4,
    step: 0.1,
    guess: [0.1, 0],
    dt: drivePeriod / 256,
    tolerance: 1e-10,
    maxIterations: 20
  }
);
const continuationParityError = maximum(
  continuation.branch.flatMap((point, i) =>
    point.state.map((v, j) => Math.abs(v - nativeContinuation.branch[i]!.orbit[j]!))
  )
);
const melnikovJob = request('melnikov', { phaseCount: 13, intervals: 2048 }),
  melnikov = runStability(melnikovJob);
const melnikovQuadratureError = maximum(melnikov.rows.map((row) => row[3]!));

const foldJob = request('pseudo-arclength'),
  fold = runStability(foldJob);
const endpoint = fold.branch.at(-1)!,
  restartDirection = number(detail(fold, 'restartDirection')) as 1 | -1;
const foldRestartJob: StabilityRequest = {
  ...foldJob,
  settings: { ...foldJob.settings, steps: 8 },
  restart: {
    artifactId: 'S20-fold-parent',
    inputRunId: 'S20-fold-input',
    source: fold.source,
    state: [...endpoint.state],
    parameter: endpoint.parameter,
    direction: restartDirection
  }
};
const foldRestart = runStability(foldRestartJob);
const foldNative = object(detail(fold, 'native'));
assert(Array.isArray(foldNative.folds));
const foldCount = foldNative.folds.length;
const foldResidual = maximum(fold.branch.map((point) => Math.abs(point.state[0]! ** 2 - point.parameter)));
const foldRestartContinuesForward = foldRestart.branch.at(-1)!.state[0]! < endpoint.state[0]! && restartDirection === 1;

const pitchforkJob = request('branch-switch'),
  pitchfork = runStability(pitchforkJob);
const pitchforkSqrtError = maximum(
  pitchfork.branch.map((point) => Math.abs(Math.abs(point.state[0]!) - Math.sqrt(point.parameter)))
);
const nsJob = request('neimark-sacker'),
  ns = runStability(nsJob),
  nsScan = object(detail(ns, 'scan'));
assert(Array.isArray(nsScan.points));
const nsCrossings = nsScan.points.length;
const nsCritical = nsScan.points.length ? number(object(nsScan.points[0]!).paramCritical) : null;
const nsCriticalError = nsCritical === null ? null : Math.abs(nsCritical - 2);
const torusJob = request('torus'),
  torus = runStability(torusJob),
  torusNative = object(detail(torus, 'native'));
assert(Array.isArray(torusNative.points));
const savedCurveLengths = torusNative.points.map((point) => {
  const curve = object(point).curve;
  assert(Array.isArray(curve));
  return curve.length;
});
const torusOffGridResidual = maximum(torus.rows.map((row) => row[3]!));
const circleJob = request('arnold-tongue', { coupling: 0, points: 7 }),
  circle = runStability(circleJob);
const rigidRotationError = maximum(circle.rows.map((row) => Math.abs(row[0]! - row[1]!)));
const p2Job = request(
  'branch-switch',
  {
    source: 'current-driven',
    guess0: -0.2926,
    guess1: 1.9745,
    stepsPerPeriod: 512,
    maxIterations: 10,
    tolerance: 1e-8
  },
  1.07
);
const p2 = runStability(p2Job),
  p2Residual = number(detail(p2, 'verifiedResidual')),
  p2Separation = number(detail(p2, 'primitiveSeparation'));

const tolerances = {
  productSectionResidual: 1e-9,
  floquetDeterminantAbsoluteError: 1e-6,
  linearModulusAbsoluteError: 1e-8,
  nativeContinuationStateParity: 1e-7,
  melnikovQuadratureAbsoluteError: 1e-8,
  foldResidual: 1e-8,
  pitchforkSqrtAbsoluteError: 1e-6,
  nsCriticalAbsoluteError: 1e-4,
  torusOffGridResidual: 1e-6,
  rigidRotationAbsoluteError: 1e-10,
  p2Residual: 1e-8,
  p2MinimumSeparation: 0.05
};
const checks = {
  currentPhasePreserved:
    phaseResult.status === 'converged' &&
    productSectionResidual < tolerances.productSectionResidual &&
    JSON.stringify(phaseJob.experiment) === unchangedPhaseSnapshot,
  floquetLiouvilleDeterminant:
    floquet.status === 'converged' && determinantError < tolerances.floquetDeterminantAbsoluteError,
  linearOscillatorClosedForm: linearModulusError < tolerances.linearModulusAbsoluteError,
  nativeContinuationParity:
    continuation.status === 'converged' && continuationParityError < tolerances.nativeContinuationStateParity,
  melnikovQuadrature: melnikovQuadratureError < tolerances.melnikovQuadratureAbsoluteError,
  foldResidualAndCount: fold.status === 'converged' && foldCount === 1 && foldResidual < tolerances.foldResidual,
  foldRestartOrientation: foldRestart.status === 'converged' && foldRestartContinuesForward,
  pitchforkSymmetricRoots:
    pitchfork.status === 'converged' && pitchforkSqrtError < tolerances.pitchforkSqrtAbsoluteError,
  delayedLogisticCriticalParameter:
    ns.status === 'converged' &&
    nsCrossings === 1 &&
    nsCriticalError !== null &&
    nsCriticalError < tolerances.nsCriticalAbsoluteError,
  nonzeroInvariantCircles:
    torus.status === 'converged' &&
    torusOffGridResidual < tolerances.torusOffGridResidual &&
    torus.rows.every((row) => row[1]! > 0.01),
  fullTorusCurveSaved: savedCurveLengths.length === 3 && savedCurveLengths.every((length) => length === 42),
  circleRigidRotation: rigidRotationError < tolerances.rigidRotationAbsoluteError,
  actualPeriodDoubling:
    p2.status === 'converged' && p2Residual <= tolerances.p2Residual && p2Separation > tolerances.p2MinimumSeparation
};
const report = {
  schemaVersion: 'pendulum-S20-numerical-metrics/v1',
  recordedAt: new Date().toISOString(),
  implementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version,
  command:
    'npx tsx scripts/redesign/measure-stability-workflow.ts documents/redesign/stage-runs/S20-numerical-metrics.json',
  passed: Object.values(checks).filter(Boolean).length,
  total: Object.keys(checks).length,
  checks,
  tolerances,
  measurements: {
    currentPhase: {
      ...numericalSummary(phaseJob, phaseResult),
      forcingPhase: 0.37,
      nativeSectionPhase: detail(phaseResult, 'nativeSectionPhase'),
      productSectionResidual,
      immutableSnapshot: JSON.stringify(phaseJob.experiment) === unchangedPhaseSnapshot
    },
    floquet: {
      ...numericalSummary(floquetJob, floquet),
      determinant: floquetDeterminant,
      analyticDeterminant: expectedDeterminant,
      absoluteError: determinantError
    },
    linearOscillator: {
      ...numericalSummary(linearJob, linear),
      analyticModulus: Math.exp(-0.1),
      maxAbsoluteError: linearModulusError
    },
    continuation: {
      ...numericalSummary(continuationJob, continuation),
      maxNativeStateParityError: continuationParityError
    },
    melnikov: { ...numericalSummary(melnikovJob, melnikov), maxAnalyticQuadratureError: melnikovQuadratureError },
    fold: {
      ...numericalSummary(foldJob, fold),
      foldCount,
      maxNormalFormResidual: foldResidual,
      endpoint,
      restartDirection,
      restartedEndpoint: foldRestart.branch.at(-1),
      restartContinuesForward: foldRestartContinuesForward
    },
    pitchfork: { ...numericalSummary(pitchforkJob, pitchfork), maxSqrtRootError: pitchforkSqrtError },
    neimarkSacker: {
      ...numericalSummary(nsJob, ns),
      crossingCount: nsCrossings,
      estimatedCriticalParameter: nsCritical,
      analyticCriticalParameter: 2,
      absoluteError: nsCriticalError
    },
    torus: {
      ...numericalSummary(torusJob, torus),
      savedCurveLengths,
      maxOffGridResidual: torusOffGridResidual,
      amplitudes: torus.rows.map((row) => row[1]),
      rotationNumbers: torus.rows.map((row) => row[2])
    },
    circle: { ...numericalSummary(circleJob, circle), maxRigidRotationError: rigidRotationError },
    periodDoubling: { ...numericalSummary(p2Job, p2), verifiedResidual: p2Residual, primitiveSeparation: p2Separation }
  },
  sourceDistinction: {
    currentDriven:
      'Actual canonical g, length, damping, forcing amplitude/frequency/phase and the existing native RHS; phase-aware product-map parity is independently checked with createDrivenFlow.',
    independentBenchmarks:
      'fold-normal-form, pitchfork-normal-form, delayed-logistic, sine-circle and linear-oscillator are named independent models, never physical results attributed to the current pendulum.',
    currentContinuation:
      'Phase-aware orchestration uses native findPeriodicOrbit. Phase-zero output is compared to the existing specialized continueDrivenPeriodicOrbit scanner.'
  },
  limitations: [
    'Bounded selected fixtures establish numerical evidence only; they do not certify arbitrary physical parameters or all branches.',
    'Melnikov is a weak-perturbation approximation. NS crossings, finite-time exponents, locking intervals and fold locations are numerical candidates, not existence proofs.',
    'Torus full curves reload exactly; endpoint warm-start is not claimed because the existing solver has no saved-curve seed API.',
    'Unwrapped-angle shooting excludes relative rotating cycles with nonzero winding number.',
    'No human scientific review is implied.'
  ]
};
const output = process.argv[2] ?? 'documents/redesign/stage-runs/S20-numerical-metrics.json';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, passed: report.passed, total: report.total, checks }));
assert(
  Object.values(checks).every(Boolean),
  'S20 numerical metrics contain a failed assertion; inspect the saved report.'
);
