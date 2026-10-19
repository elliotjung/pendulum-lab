import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, release } from 'node:os';
import {
  createNonlinearSimulation,
  defaultNonlinearConfig,
  nonlinearPresetConfig,
  toCanonicalNonlinear,
  fromCanonicalNonlinear,
  type NonlinearConfig
} from '../../src/product/adapters/physics/nonlinear';
import { rhsDuffing, type DuffingParameters } from '../../src/physics/duffing';
import { rhsVanDerPol, type VanDerPolParameters } from '../../src/physics/vanDerPol';
import { rhsKapitza, type KapitzaParameters } from '../../src/physics/kapitza';
import { integratePyragasPendulumDde, type PyragasPendulumParameters } from '../../src/physics/pyragasDde';
import { rk4Step } from '../../src/physics/integrators';

const started = performance.now();
const parity = (['system:duffing', 'system:van-der-pol', 'system:kapitza'] as const).map((systemId) => {
  const config: NonlinearConfig = { ...defaultNonlinearConfig(systemId), duration: 0.2 };
  const simulation = createNonlinearSimulation(config);
  let state = Float64Array.from(config.initialState),
    maxStateAbsDifference = 0;
  const rhs = (input: Float64Array, out: Float64Array) =>
    systemId === 'system:duffing'
      ? rhsDuffing(input, config.parameters as unknown as DuffingParameters, out)
      : systemId === 'system:van-der-pol'
        ? rhsVanDerPol(input, config.parameters as unknown as VanDerPolParameters, out)
        : rhsKapitza(input, config.parameters as unknown as KapitzaParameters, out);
  while (!simulation.done) {
    const out = new Float64Array(state.length);
    rk4Step(state, config.step, rhs, out);
    state = out;
    simulation.step().state.forEach((value, index) => {
      maxStateAbsDifference = Math.max(maxStateAbsDifference, Math.abs(value - state[index]!));
    });
  }
  return { systemId, config, maxStateAbsDifference, executedSteps: simulation.snapshot().step };
});

function observe(config: NonlinearConfig) {
  const simulation = createNonlinearSimulation(config, { stability: true });
  let maxAbsCoordinate = 0,
    maxAbsVelocity = 0,
    maxInvertedDeviation = 0;
  let tailMin = Infinity,
    tailMax = -Infinity,
    stickSamples = 0,
    slipSamples = 0,
    modeTransitions = 0;
  let maxMomentumResidual = 0;
  let previousMode = simulation.snapshot().mode;
  while (!simulation.done) {
    const sample = simulation.step();
    maxAbsCoordinate = Math.max(maxAbsCoordinate, Math.abs(sample.state[0]!));
    maxAbsVelocity = Math.max(maxAbsVelocity, Math.abs(sample.state[1]!));
    maxInvertedDeviation = Math.max(maxInvertedDeviation, Math.abs(sample.state[0]! - Math.PI));
    maxMomentumResidual = Math.max(maxMomentumResidual, Math.abs(sample.momentumResidual));
    if (sample.mode === 'stick') stickSamples++;
    if (sample.mode === 'slip') slipSamples++;
    if (sample.mode !== previousMode) modeTransitions++;
    previousMode = sample.mode;
    if (sample.time >= (config.startTime ?? 0) + config.duration * 0.75) {
      tailMin = Math.min(tailMin, sample.state[0]!);
      tailMax = Math.max(tailMax, sample.state[0]!);
    }
  }
  const final = simulation.snapshot();
  return {
    config,
    finalTime: final.time,
    executedSteps: final.step,
    finalState: final.state,
    maxAbsCoordinate,
    maxAbsVelocity,
    ...(config.systemId === 'system:kapitza' ? { maxInvertedDeviationRad: maxInvertedDeviation } : {}),
    tailCoordinateRange: [tailMin, tailMax],
    ...(config.systemId === 'system:friction'
      ? { stickSamples, slipSamples, modeTransitions, maxMomentumResidual }
      : {}),
    ...(final.stability ? { floquet: final.stability } : {})
  };
}
const phenomena = [
  observe(nonlinearPresetConfig('system:duffing', 'harmonic')),
  observe(defaultNonlinearConfig('system:van-der-pol')),
  observe(defaultNonlinearConfig('system:kapitza')),
  observe(nonlinearPresetConfig('system:kapitza', 'no-drive')),
  observe(defaultNonlinearConfig('system:mathieu')),
  observe(nonlinearPresetConfig('system:mathieu', 'stable')),
  observe(defaultNonlinearConfig('system:friction')),
  observe(nonlinearPresetConfig('system:friction', 'stuck'))
];

const delayBase = defaultNonlinearConfig('system:pyragas');
const delayConfig: NonlinearConfig = {
  ...delayBase,
  parameters: { ...delayBase.parameters, delay: 0.073 },
  duration: 0.4,
  step: 0.002,
  history: { kind: 'linear', state: [0.3, 0.2] }
};
const delayed = createNonlinearSimulation(delayConfig);
const nativeDelay = integratePyragasPendulumDde(
  delayConfig.initialState as readonly [number, number],
  delayConfig.parameters as unknown as PyragasPendulumParameters,
  {
    duration: delayConfig.duration,
    dt: delayConfig.step,
    history: (time) => [
      delayConfig.history!.state[0]! + time * delayConfig.history!.state[1]!,
      delayConfig.history!.state[1]!
    ]
  }
);
for (let count = 0; count < 57; count++) delayed.step();
const continuation = delayed.serialize();
const canonical = toCanonicalNonlinear(continuation);
if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
const parsed = fromCanonicalNonlinear(canonical.value);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
const restored = createNonlinearSimulation(parsed.value);
let continuationMaxStateDifference = 0;
while (!delayed.done) {
  const direct = delayed.step(),
    continued = restored.step();
  direct.state.forEach((value, index) => {
    continuationMaxStateDifference = Math.max(
      continuationMaxStateDifference,
      Math.abs(value - continued.state[index]!)
    );
  });
}
const delay = {
  config: delayConfig,
  nativeFinalState: nativeDelay.finalState,
  adapterFinalState: delayed.snapshot().state,
  nativeFinalMaxAbsDifference: Math.max(
    ...nativeDelay.finalState.map((value, index) => Math.abs(value - delayed.snapshot().state[index]!))
  ),
  continuationOrigin: continuation.startTime,
  preservedDelayPoints: continuation.delayState?.times.length,
  continuationMaxStateDifference,
  continuationMeaning:
    'Same configured observation duration starts at the current time. Comparison uses only the overlapping original horizon; this is a continuation initial condition, not an integrator object dump.'
};

const earlyConfig: NonlinearConfig = {
  ...delayBase,
  duration: 0.4,
  startTime: 2,
  parameters: { ...delayBase.parameters, delay: 0.2, driveAmplitude: 0.4, driveFrequency: 1.7 },
  history: { kind: 'linear', state: [0.7, -0.3] }
};
const earlyDirect = createNonlinearSimulation(earlyConfig);
for (let count = 0; count < 9; count++) earlyDirect.step();
const earlyContinuation = earlyDirect.serialize();
const earlyCanonical = toCanonicalNonlinear(earlyContinuation);
if (!earlyCanonical.ok) throw new Error(JSON.stringify(earlyCanonical.issues));
const earlyParsed = fromCanonicalNonlinear(earlyCanonical.value);
if (!earlyParsed.ok) throw new Error(JSON.stringify(earlyParsed.issues));
const earlyRestored = createNonlinearSimulation(earlyParsed.value);
let earlyMaxDifference = 0;
while (!earlyDirect.done) {
  const direct = earlyDirect.step(),
    continued = earlyRestored.step();
  direct.state.forEach((value, index) => {
    earlyMaxDifference = Math.max(earlyMaxDifference, Math.abs(value - continued.state[index]!));
  });
}
const earlyDelay = {
  config: earlyConfig,
  continuationOrigin: earlyContinuation.startTime,
  delayState: earlyContinuation.delayState,
  maxStateDifference: earlyMaxDifference,
  method:
    'Save after 0.018s before the 0.2s delay elapses; discontinuous linear prehistory and nonzero absolute forcing clock; compare every remaining original step.'
};

const report = {
  schemaVersion: 'S14-numerical-metrics/v1',
  recordedAtUtc: new Date().toISOString(),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: 'node --import tsx scripts/redesign/measure-nonlinear-numerics.ts',
  environment: { platform: process.platform, release: release(), node: process.version, cpu: cpus()[0]?.model },
  parity,
  phenomena,
  delay,
  earlyDelay,
  checks: {
    nativeRk4Parity: parity.every((entry) => entry.maxStateAbsDifference < 1e-12),
    nativeDelayParity: delay.nativeFinalMaxAbsDifference < 1e-12,
    continuationParity: delay.continuationMaxStateDifference < 1e-12,
    earlyDiscontinuousContinuationParity: earlyDelay.maxStateDifference < 1e-12
  },
  limitations: [
    'Selected finite-time observations only; no universal stability, limit-cycle, chaos-control or event-time certification.',
    'Duffing, Van der Pol and Mathieu use normalized displacement and time; numerical parity maxima mix native components and are comparison metrics only.',
    'Kapitza averaged effective potential is not its directly forced energy; inverted stability requires checking forcing scale and step convergence.',
    'Friction transitions occur at grid steps; the native scalar contact solve is exact stiction for the frozen force, not an event-time spring/block integrator.',
    'Pyragas delay history uses linear interpolation; continuation equality is assessed on the overlapping horizon, with a nonintegral delay/step ratio and a nonconstant prehistory.',
    'A single local elapsed time is not a performance benchmark. No human scientific review was performed.'
  ],
  elapsedMs: performance.now() - started
};
writeFileSync(
  new URL('../../documents/redesign/stage-runs/S14-numerical-metrics.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      parity,
      phenomena: phenomena.map(({ config, ...values }) => ({ systemId: config.systemId, ...values })),
      delay,
      earlyDelay,
      elapsedMs: report.elapsedMs
    },
    null,
    2
  )
);
if (Object.values(report.checks).some((passed) => !passed)) {
  throw new Error('A numerical comparison exceeds the fixed 1e-12 component tolerance. Inspect the saved metrics.');
}
