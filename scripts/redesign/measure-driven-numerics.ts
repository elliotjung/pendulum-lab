import { writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  createDrivenSimulation,
  defaultDrivenConfig,
  DRIVEN_SYSTEM_IDS,
  type DrivenConfig
} from '../../src/product/adapters/physics/driven';
import { createExpansionSystem } from '../../src/physics/expandedModels-factory';
import { rk4Step } from '../../src/physics/integrators';

const started = performance.now();
const parity = DRIVEN_SYSTEM_IDS.map((systemId) => {
  const config: DrivenConfig = { ...defaultDrivenConfig(systemId), step: 0.002, duration: 0.2 };
  const id = systemId.slice(7) as 'driven' | 'coupled' | 'inverted' | 'cartpole' | 'parametric';
  const originalParameters = {
    ...config.parameters,
    ...(id === 'driven'
      ? { driveAmplitude: config.forcing!.amplitude, driveFrequency: config.forcing!.frequency }
      : {}),
    ...(id === 'parametric' ? { amplitude: config.forcing!.amplitude, frequency: config.forcing!.frequency } : {})
  };
  const engine = createExpansionSystem(id, originalParameters, config.initialState),
    simulation = createDrivenSimulation(config);
  let native = Float64Array.from(config.initialState),
    maxStateAbsDifference = 0,
    maxEnergyAbsDifferenceJ = 0,
    comparisons = 0;
  while (true) {
    const sample = simulation.snapshot();
    sample.state.forEach((value, index) => {
      maxStateAbsDifference = Math.max(maxStateAbsDifference, Math.abs(value - native[index]!));
    });
    maxEnergyAbsDifferenceJ = Math.max(maxEnergyAbsDifferenceJ, Math.abs(sample.energy - engine.energy(native)));
    comparisons++;
    if (simulation.done) break;
    const next = new Float64Array(native.length);
    rk4Step(native, config.step, engine.rhs, next);
    native = next;
    simulation.step();
  }
  return {
    systemId,
    config,
    originalParameters,
    comparisonsIncludingInitial: comparisons,
    executedSteps: comparisons - 1,
    finished: simulation.done,
    maxStateAbsDifference,
    stateDifferenceUnits:
      'Per component: rad, rad/s; cart x m and v m/s; native drive phase rad. Maximum mixes units and is a parity metric only.',
    maxEnergyAbsDifferenceJ
  };
});

const closedLoop = (['system:inverted', 'system:cartpole'] as const).map((systemId) => {
  const base = defaultDrivenConfig(systemId),
    config: DrivenConfig = { ...base, controller: { ...base.controller!, enabled: true }, step: 0.002, duration: 5 };
  const simulation = createDrivenSimulation(config),
    angleIndex = systemId === 'system:cartpole' ? 1 : 0,
    initial = simulation.snapshot();
  let maxAbsControl = Math.abs(initial.control),
    maxAbsAngleRad = Math.abs(initial.state[angleIndex]!),
    maxAbsError = Math.abs(initial.error),
    saturatedSamples = 0;
  while (!simulation.done) {
    const sample = simulation.step();
    maxAbsControl = Math.max(maxAbsControl, Math.abs(sample.control));
    maxAbsAngleRad = Math.max(maxAbsAngleRad, Math.abs(sample.state[angleIndex]!));
    maxAbsError = Math.max(maxAbsError, Math.abs(sample.error));
    if (sample.warnings.some((warning) => warning.includes('포화'))) saturatedSamples++;
  }
  const final = simulation.snapshot();
  return {
    systemId,
    config,
    finished: simulation.done,
    executedSteps: final.step,
    initialAngleRad: initial.state[angleIndex],
    finalAngleRad: final.state[angleIndex],
    finalToInitialAbsoluteAngleRatio: Math.abs(final.state[angleIndex]! / initial.state[angleIndex]!),
    maxAbsAngleRad,
    maxAbsControl,
    controlUnit: systemId === 'system:cartpole' ? 'N' : 'rad/s^2',
    maxAbsError,
    errorUnit: systemId === 'system:cartpole' ? 'm' : 'rad',
    saturatedSamples,
    finalState: final.state
  };
});

function cartImpulse(config: DrivenConfig) {
  const simulation = createDrivenSimulation(config);
  while (!simulation.done) simulation.step();
  const sample = simulation.snapshot(),
    state = sample.state,
    p = config.parameters,
    forcing = config.forcing!;
  const initial = config.initialState;
  const momentum = (s: readonly number[]) =>
    (p.cartMass! + p.poleMass!) * s[2]! + p.poleMass! * p.length! * Math.cos(s[1]!) * s[3]!;
  const analyticalImpulseNs =
    (forcing.amplitude / forcing.frequency) *
    (Math.cos(forcing.frequency * (config.startTime ?? 0) + forcing.phase) -
      Math.cos(forcing.frequency * ((config.startTime ?? 0) + config.duration) + forcing.phase));
  const measuredMomentumChangeNs = momentum(state) - momentum(initial);
  return {
    config,
    finished: simulation.done,
    executedSteps: sample.step,
    actualFinalTimeS: sample.time,
    analyticalImpulseNs,
    measuredMomentumChangeNs,
    absoluteImpulseErrorNs: Math.abs(measuredMomentumChangeNs - analyticalImpulseNs),
    finalNativeDimension: state.length
  };
}
const cartBase = defaultDrivenConfig('system:cartpole');
const stageConfig: DrivenConfig = {
  ...cartBase,
  parameters: { ...cartBase.parameters, g: 0, force: 0, friction: 0 },
  initialState: [0, 0, 0, 0],
  forcing: { waveform: 'sine', amplitude: 0.5, frequency: 7, phase: 0.4 },
  startTime: 2,
  duration: 0.4,
  step: 0.05
};
const coarse = cartImpulse(stageConfig),
  fine = cartImpulse({ ...stageConfig, step: 0.025 });
const largeStartClock = cartImpulse({
  ...stageConfig,
  forcing: { waveform: 'sine', amplitude: 0.5, frequency: 1, phase: 0 },
  startTime: 1e9,
  duration: 0.1,
  step: 1e-5
});
const report = {
  schemaVersion: 'S13-numerical-metrics/v1',
  recordedAtUtc: new Date().toISOString(),
  // The checkout HEAD identifies the product adapter version measured, not a scientific certification or generator hash.
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: 'node --import tsx scripts/redesign/measure-driven-numerics.ts',
  environment: {
    platform: process.platform,
    release: release(),
    arch: process.arch,
    node: process.version,
    cpu: cpus()[0]?.model
  },
  method:
    'Small direct adapter observations using the existing createExpansionSystem factory and rk4Step boundary. Every default parity sample is compared including the initial and final states. No product edits, golden regeneration, statistical inference or scientific certification.',
  parity,
  closedLoop,
  impulse: {
    formula:
      'P=(M+m)v + m*l*cos(theta)*omega; with g=0, friction=0 and constant force=0, dP/dt=A*sin(Omega*t+phase). Exact input impulse=A/Omega*[cos(Omega*t0+phase)-cos(Omega*(t0+T)+phase)].',
    conditions:
      'Legacy cart-pole equations with the exact configs below; private elapsed clock is integrated with derivative 1 at RK stages. Only native four-dimensional states are exposed. This momentum identity follows directly from the inherited cart acceleration equation despite its 4/3 pole inertia approximation.',
    coarse,
    fine,
    observedErrorReductionRatio: coarse.absoluteImpulseErrorNs / fine.absoluteImpulseErrorNs,
    observedOrderFromStepHalving: Math.log2(coarse.absoluteImpulseErrorNs / fine.absoluteImpulseErrorNs),
    largeStartClock
  },
  limitations: [
    'These are selected finite-time fixtures, not accuracy or stability guarantees for arbitrary gains, states, waveforms, durations or devices.',
    'The adapter uses sine(nativePhase+offset); default offset pi/2 reproduces the original cosine drive up to floating-point rounding. Parity uses controller disabled and zero cart-pole waveform amplitude.',
    'Mechanical energy is inherited diagnostic output. Drive, damping and controller exchange energy; no passive energy conservation claim is made here.',
    'The legacy cart-pole 4/3 inertia RHS and point-bob energy diagnostic use different inertia approximations. Coupled energy omits a length-squared factor in its coupling term and is not a consistent invariant at non-unit length.',
    'Default feedback observations concern only the reported local perturbations and final angle ratio; they do not establish global/asymptotic stability or validate every state variable.',
    'Impulse observations use smooth sine forcing. Square-wave discontinuity timing is not resolved by an event solver.',
    'Large absolute arguments retain JavaScript trigonometric and floating-point time precision limits. Elapsed clock avoids repeated addition of tiny dt onto 1e9, but does not remove argument-reduction limitations.',
    'Elapsed measurement is a single concurrent-machine observation including setup, diagnostics and cloning, not a performance budget or portable benchmark. Human/expert scientific review has not been performed.'
  ],
  elapsedMs: performance.now() - started
};
const destination = new URL('../../documents/redesign/stage-runs/S13-numerical-metrics.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      destination: destination.pathname,
      sourceHead: report.sourceHead,
      elapsedMs: report.elapsedMs,
      parity: parity.map(({ systemId, maxStateAbsDifference, maxEnergyAbsDifferenceJ }) => ({
        systemId,
        maxStateAbsDifference,
        maxEnergyAbsDifferenceJ
      })),
      closedLoop: closedLoop.map(({ systemId, finalToInitialAbsoluteAngleRatio, maxAbsControl }) => ({
        systemId,
        finalToInitialAbsoluteAngleRatio,
        maxAbsControl
      })),
      coarseImpulseErrorNs: coarse.absoluteImpulseErrorNs,
      fineImpulseErrorNs: fine.absoluteImpulseErrorNs,
      observedErrorReductionRatio: report.impulse.observedErrorReductionRatio,
      observedOrder: report.impulse.observedOrderFromStepHalving,
      largeStartImpulseErrorNs: largeStartClock.absoluteImpulseErrorNs
    },
    null,
    2
  )
);
