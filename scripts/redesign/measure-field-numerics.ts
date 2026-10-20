import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  createFputModeState,
  createFputVerletScratch,
  fputEnergy,
  fputModeEnergies,
  fputVelocityVerletStep
} from '../../src/physics/fput';
import { rhsPendulumNetwork, ringPhononDispersion } from '../../src/physics/pendulumNetwork';
import {
  createSineGordonField,
  frenkelKontorovaEnergy,
  relaxFrenkelKontorovaKink,
  sineGordonFieldEnergy,
  sineGordonKink,
  sineGordonKinkRate,
  stepSineGordon,
  topologicalCharge
} from '../../src/physics/sineGordon';
import { eulerMaruyamaStep, gaussianSampler } from '../../src/physics/stochastic';
import {
  createFieldSimulation,
  defaultFieldConfig,
  FIELD_SYSTEM_IDS,
  fieldMemberSeed,
  fromCanonicalField,
  resizeFieldConfig,
  toCanonicalField,
  type FieldConfig
} from '../../src/product/adapters/physics/field';
import { createFieldWorkerSession } from '../../src/product/adapters/physics/field-worker-protocol';

const started = performance.now(),
  tolerance = 1e-12;
const maxDifference = (a: readonly number[] | Float64Array, b: readonly number[] | Float64Array) =>
  a.length !== b.length ? Infinity : Array.from(a).reduce((max, value, i) => Math.max(max, Math.abs(value - b[i]!)), 0);
function run(config: FieldConfig) {
  const simulation = createFieldSimulation(config);
  while (!simulation.done) simulation.step();
  return simulation.snapshot();
}
const canonicalRoundtrips = FIELD_SYSTEM_IDS.map((systemId) => {
  const config = { ...defaultFieldConfig(systemId), duration: 0.2 },
    canonical = toCanonicalField(config);
  if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
  const restored = fromCanonicalField(canonical.value);
  return {
    systemId,
    roundtrip: restored.ok && isDeepStrictEqual(config, restored.value),
    modelVersion: canonical.value.modelVersion,
    seed: canonical.value.seed
  };
});
const fputConfig = { ...defaultFieldConfig('system:fput'), duration: 1 },
  fputSample = run(fputConfig),
  fputNative = Float64Array.from(fputConfig.initialState),
  fputParams = { size: fputConfig.grid.points, alpha: fputConfig.parameters.alpha!, beta: fputConfig.parameters.beta! },
  fputScratch = createFputVerletScratch(fputConfig.grid.points);
for (let i = 0; i < fputSample.step; i++) fputVelocityVerletStep(fputNative, fputConfig.step, fputParams, fputScratch);
const fputParity = {
  config: fputConfig,
  steps: fputSample.step,
  stateMaxAbsDifference: maxDifference(fputSample.state, fputNative),
  energyAbsDifference: Math.abs(fputSample.energy - fputEnergy(fputNative, fputParams)),
  modeEnergyMaxAbsDifference: maxDifference(fputSample.modeEnergies, fputModeEnergies(fputNative, fputParams))
};
function measureFput(step: number) {
  const parameters = { size: 16, alpha: 0, beta: 0 },
    state = createFputModeState(16, 3, 0.5),
    scratch = createFputVerletScratch(16),
    energy0 = fputEnergy(state, parameters);
  let drift = 0;
  for (let i = 0; i < Math.round(10 / step); i++) {
    fputVelocityVerletStep(state, step, parameters, scratch);
    drift = Math.max(drift, Math.abs(fputEnergy(state, parameters) - energy0) / energy0);
  }
  return {
    step,
    totalTime: 10,
    maxRelativeEnergyDrift: drift,
    harmonicModeSumAbsDifference: Math.abs(
      fputModeEnergies(state, parameters).reduce((sum, e) => sum + e, 0) - fputEnergy(state, parameters)
    )
  };
}
const fputRefinement = [0.04, 0.02].map(measureFput);
const sineGordonParity = (['fixed', 'periodic'] as const).map((boundary) => {
  const base = resizeFieldConfig(defaultFieldConfig('system:sine-gordon'), 41),
    config: FieldConfig = {
      ...base,
      duration: 0.2,
      grid: { ...base.grid, boundary },
      initialState: [
        ...Array.from({ length: 41 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * i) / (boundary === 'fixed' ? 40 : 41))),
        ...Array(41).fill(0)
      ]
    },
    n = config.grid.points,
    grid = createSineGordonField({
      points: n,
      length: config.grid.length,
      dt: config.step,
      boundary,
      initial: (x) =>
        config.initialState[Math.round(x / (config.grid.length / (boundary === 'periodic' ? n : n - 1)))]!,
      initialRate: (x) =>
        config.initialState[n + Math.round(x / (config.grid.length / (boundary === 'periodic' ? n : n - 1)))]!
    }),
    sample = run(config);
  for (let i = 0; i < sample.step; i++) stepSineGordon(grid);
  return {
    boundary,
    points: n,
    dx: grid.dx,
    step: config.step,
    executedSteps: sample.step,
    profileMaxAbsDifference: maxDifference(sample.profile, grid.u),
    previousMaxAbsDifference: maxDifference(sample.previousField, grid.uPrev),
    energyAbsDifference: Math.abs(sample.energy - sineGordonFieldEnergy(grid)),
    chargeAbsDifference: Math.abs(sample.charge - topologicalCharge(grid.u)),
    fixedEndpointMaxChange:
      boundary === 'fixed'
        ? Math.max(
            Math.abs(grid.u[0]! - config.initialState[0]!),
            Math.abs(grid.u[n - 1]! - config.initialState[n - 1]!)
          )
        : null
  };
});
const sineGordonContinuum = [41, 81].map((points) => {
  const length = 30,
    dt = 0.01,
    velocity = 0.2,
    center = 15,
    params = { velocity, center },
    grid = createSineGordonField({
      points,
      length,
      dt,
      boundary: 'fixed',
      initial: (x) => sineGordonKink(x, 0, params),
      initialRate: (x) => sineGordonKinkRate(x, 0, params)
    }),
    energy0 = sineGordonFieldEnergy(grid);
  for (let i = 0; i < 100; i++) stepSineGordon(grid);
  const exact = Array.from({ length: points }, (_, i) => sineGordonKink(i * grid.dx, grid.time, params));
  return {
    points,
    length,
    dx: grid.dx,
    dt,
    time: grid.time,
    velocity,
    profileMaxAbsError: maxDifference(grid.u, exact),
    charge: topologicalCharge(grid.u),
    relativeEnergyChange: Math.abs(sineGordonFieldEnergy(grid) - energy0) / energy0
  };
});
const latticeBase = defaultFieldConfig('system:lattice-fk-limit'),
  latticeSample = run(latticeBase),
  latticeOmegaSq = ringPhononDispersion(
    latticeBase.parameters.onsiteOmegaSq!,
    latticeBase.parameters.couplingRate!,
    latticeBase.grid.points
  ),
  lattice = {
    config: latticeBase,
    modeCount: latticeSample.profile.length,
    angularFrequencySquaredMaxAbsDifference: maxDifference(latticeSample.profile, latticeOmegaSq),
    nativeReturns: 'omega squared; adapter profile preserves normalized omega squared',
    zeroMode: latticeSample.profile[0],
    nyquistMode: latticeSample.profile[latticeBase.grid.points / 2]
  };
const fk = [0.2, 1, 3].map((coupling) => {
  const base = defaultFieldConfig('system:frenkel-kontorova'),
    config: FieldConfig = { ...base, parameters: { ...base.parameters, coupling } },
    sample = run(config),
    native = relaxFrenkelKontorovaKink(coupling, {
      sites: config.grid.points,
      centerOffset: config.parameters.centerOffset!,
      maxIterations: config.parameters.maxIterations!,
      tolerance: config.parameters.tolerance!
    });
  return {
    coupling,
    points: config.grid.points,
    profileMaxAbsDifference: maxDifference(sample.profile, native.angles),
    energyAbsDifference: Math.abs(sample.energy - frenkelKontorovaEnergy(native.angles, coupling)),
    charge: sample.charge,
    nativeGradNorm: native.gradNorm,
    reportedGradNorm: sample.gradNorm,
    converged: sample.converged,
    iterations: sample.iterations
  };
});
const langevinConfig = { ...defaultFieldConfig('system:langevin'), duration: 0.2 },
  langevinSample = run(langevinConfig),
  nativeMembers = Array.from({ length: langevinConfig.ensemble.members }, (_, member) => {
    let state: Float64Array = Float64Array.from(langevinConfig.initialState);
    const gaussian = gaussianSampler(fieldMemberSeed(langevinConfig.seed.value, member)),
      p = { masses: [1], lengths: [1], g: 1, coupling: [0], damping: [langevinConfig.parameters.damping!] };
    for (let i = 0; i < langevinSample.step; i++) {
      const out = new Float64Array(2);
      eulerMaruyamaStep(
        state,
        langevinConfig.step,
        (s, o) => rhsPendulumNetwork(s, p, o),
        [0, langevinConfig.parameters.noise!],
        gaussian,
        out
      );
      state = out;
    }
    return Array.from(state);
  }),
  nativeMean = [0, 0],
  nativeM2 = [0, 0];
nativeMembers.forEach((state, r) =>
  state.forEach((x, i) => {
    const delta = x - nativeMean[i]!;
    nativeMean[i]! += delta / (r + 1);
    nativeM2[i]! += delta * (x - nativeMean[i]!);
  })
);
const nativeVariance = nativeM2.map((x) => x / (nativeMembers.length - 1)),
  langevinRepeated = run(langevinConfig),
  prefix = run({ ...langevinConfig, ensemble: { members: 4 } }),
  langevin = {
    config: langevinConfig,
    memberMaxAbsDifference: Math.max(
      ...nativeMembers.map((state, i) => maxDifference(state, langevinSample.memberStates[i]!))
    ),
    meanMaxAbsDifference: maxDifference(nativeMean, langevinSample.mean),
    varianceMaxAbsDifference: maxDifference(nativeVariance.slice(0, 1), langevinSample.variance),
    seedRepeatability: isDeepStrictEqual(langevinSample, langevinRepeated),
    stableMemberPrefix: isDeepStrictEqual(langevinSample.memberStates.slice(0, 4), prefix.memberStates),
    ensembleProvenance: langevinSample.ensemble
  };
const performanceSamples = [8, 32, 64].map((members) => {
  const config = { ...langevinConfig, duration: 5, ensemble: { members } },
    session = createFieldWorkerSession(),
    init = performance.now(),
    ready = session.handle({ type: 'initialize', id: 'size', sequence: 0, config }),
    initializationMs = performance.now() - init,
    advanceStarted = performance.now(),
    progress = session.handle({ type: 'advance', id: 'size', sequence: 1, count: 64 }),
    requestMs = performance.now() - advanceStarted,
    cancel = session.handle({ type: 'cancel', id: 'size', sequence: 2 });
  return {
    members,
    initializationMs,
    requestMs,
    ready: ready.type,
    advanced: progress.type === 'progress' ? progress.advanced : 0,
    done: progress.type === 'progress' ? progress.done : null,
    cancelled: cancel.type === 'cancelled',
    note: 'Single local wall-clock observation; between-step soft budget does not set a hard per-step deadline.'
  };
});
const report = {
  schemaVersion: 'S16-numerical-metrics/v1',
  recordedAtUtc: new Date().toISOString(),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: 'node --import tsx scripts/redesign/measure-field-numerics.ts',
  environment: { platform: process.platform, release: release(), node: process.version, cpu: cpus()[0]?.model },
  tolerance,
  canonicalRoundtrips,
  fputParity,
  fputRefinement,
  sineGordonParity,
  sineGordonContinuum,
  lattice,
  fk,
  langevin,
  performanceSamples,
  checks: {
    canonicalRoundtrips: canonicalRoundtrips.every((x) => x.roundtrip),
    fputParity: [
      fputParity.stateMaxAbsDifference,
      fputParity.energyAbsDifference,
      fputParity.modeEnergyMaxAbsDifference
    ].every((x) => x < tolerance),
    fputHarmonicRefinement:
      fputRefinement[1]!.maxRelativeEnergyDrift < fputRefinement[0]!.maxRelativeEnergyDrift / 3 &&
      fputRefinement.every((x) => x.harmonicModeSumAbsDifference < tolerance),
    sineGordonParity: sineGordonParity.every(
      (x) =>
        [x.profileMaxAbsDifference, x.previousMaxAbsDifference, x.energyAbsDifference, x.chargeAbsDifference].every(
          (d) => d < tolerance
        ) &&
        (x.fixedEndpointMaxChange === null || x.fixedEndpointMaxChange === 0)
    ),
    sineGordonSelectedRefinement:
      sineGordonContinuum[1]!.profileMaxAbsError < sineGordonContinuum[0]!.profileMaxAbsError / 2,
    latticeParity: lattice.angularFrequencySquaredMaxAbsDifference < tolerance,
    staticFkParity: fk.every(
      (x) =>
        x.profileMaxAbsDifference < tolerance &&
        x.energyAbsDifference < tolerance &&
        Math.abs(x.charge - 1) < tolerance &&
        x.reportedGradNorm < 1e-7
    ),
    seededNativeLangevin:
      [langevin.memberMaxAbsDifference, langevin.meanMaxAbsDifference, langevin.varianceMaxAbsDifference].every(
        (x) => x < tolerance
      ) &&
      langevin.seedRepeatability &&
      langevin.stableMemberPrefix,
    boundedWorkerCancellation: performanceSamples.every(
      (x) => x.ready === 'ready' && x.advanced >= 1 && x.advanced <= 64 && x.done === false && x.cancelled
    )
  },
  limitations: [
    'Selected finite fixtures characterize native parity and refinement only; no general stability, accuracy, thermodynamic equilibrium or continuum-limit proof.',
    'All S16 models use normalized time/state/energy. Canonical runtime seconds are a carrier qualified by timeConvention metadata.',
    'Stable FNV member seed mapping is a new versioned product contract; it differs from native runLangevinEnsemble SplitMix mapping.',
    'Langevin is a single normalized pendulum with additive velocity Ito noise and arithmetic unwrapped-angle moments. Noise and damping are independent.',
    'FPUT mode energies are harmonic projections; the fixed-wall chain differs from periodic ring dispersion.',
    'Sine-Gordon discrete energy uses a backward difference; finite boundaries and startup endpoint rates affect comparisons.',
    'FK is a stationary Newton kink, potentially a saddle, with fixed endpoints. This does not compute driven depinning or mobility.',
    'Single-device timing is observational, not a cross-device or percentile guarantee. No human scientific review occurred.'
  ],
  elapsedMs: performance.now() - started
};
writeFileSync(
  process.argv[2]
    ? resolve(process.argv[2])
    : new URL('../../documents/redesign/stage-runs/S16-numerical-metrics.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      checks: report.checks,
      fputRefinement,
      sineGordonContinuum,
      lattice,
      fk,
      langevin: { ...langevin, config: undefined },
      performanceSamples,
      elapsedMs: report.elapsedMs
    },
    null,
    2
  )
);
if (Object.values(report.checks).some((passed) => !passed))
  throw new Error('S16 numerical check failed. Inspect the report without changing fixed tolerances.');
