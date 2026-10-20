/** S17 native parity and selected analytic fixtures; never regenerates numerical golden values. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { resolve } from 'node:path';
import { standardMapStep } from '../../src/physics/standardMap';
import { createQkrPlan, qkrStep, qkrNorm } from '../../src/physics/quantumKickedRotor';
import { complexUnitaryFloquetSpectrum, type ComplexMatrix } from '../../src/research/unitaryFloquet';
import {
  DISCRETE_SYSTEM_IDS,
  defaultDiscreteConfig,
  createDiscreteSimulation,
  toCanonicalDiscrete,
  fromCanonicalDiscrete,
  type DiscreteConfig
} from '../../src/product/adapters/physics/discrete';
import { parseExperiment, serializeExperiment } from '../../src/product/persistence';

const started = performance.now();
const parityTolerance = 1e-12;
const spectrumTolerance = 1e-9;
function difference(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Mismatched metric dimensions.');
  return Math.max(0, ...a.map((x, i) => Math.abs(x - b[i]!)));
}
function run(config: DiscreteConfig) {
  const simulation = createDiscreteSimulation(config);
  while (!simulation.done) simulation.step();
  return simulation.snapshot();
}
const canonicalRoundtrips = DISCRETE_SYSTEM_IDS.map((id) => {
  const first = toCanonicalDiscrete(defaultDiscreteConfig(id));
  if (!first.ok) throw new Error(JSON.stringify(first.issues));
  const json = serializeExperiment(first.value);
  if (!json.ok) throw new Error(JSON.stringify(json.issues));
  const parsed = parseExperiment(json.value);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const restored = fromCanonicalDiscrete(parsed.value);
  if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
  const second = toCanonicalDiscrete(restored.value);
  const result = second.ok ? serializeExperiment(second.value) : second;
  return { id, bytes: new TextEncoder().encode(json.value).length, equal: result.ok && result.value === json.value };
});
const mapConfig = { ...defaultDiscreteConfig('system:standard-map'), iterations: 1000 };
const map = run(mapConfig);
let nativeMap = { theta: mapConfig.initialState[0]!, p: mapConfig.initialState[1]! };
for (let i = 0; i < mapConfig.iterations; i++)
  nativeMap = standardMapStep(nativeMap.theta, nativeMap.p, mapConfig.parameters.kickStrength!);
const standardMap = {
  iterations: mapConfig.iterations,
  thetaAbsDifference: Math.abs(map.theta - nativeMap.theta),
  momentumAbsDifference: Math.abs(map.p - nativeMap.p),
  thetaWrapped: map.theta >= 0 && map.theta < 2 * Math.PI,
  deterministic: JSON.stringify(map) === JSON.stringify(run(mapConfig))
};
const qkrConfig: DiscreteConfig = {
  ...defaultDiscreteConfig('system:quantum-kicked-rotor'),
  gridSize: 64,
  iterations: 2048,
  wavefunction: {
    re: Array.from({ length: 64 }, (_, i) => (i === 0 ? Math.SQRT1_2 : 0)),
    im: Array.from({ length: 64 }, (_, i) => (i === 1 ? Math.SQRT1_2 : 0))
  }
};
const qkr = run(qkrConfig);
const nativeState = {
  re: Float64Array.from(qkrConfig.wavefunction!.re),
  im: Float64Array.from(qkrConfig.wavefunction!.im)
};
const plan = createQkrPlan({
  gridSize: qkrConfig.gridSize,
  kickStrength: qkrConfig.parameters.kickStrength!,
  hbar: qkrConfig.parameters.hbar!
});
const initialNorm = qkrNorm(nativeState);
for (let i = 0; i < qkrConfig.iterations; i++) qkrStep(nativeState, plan);
const quantum = {
  gridSize: qkrConfig.gridSize,
  iterations: qkrConfig.iterations,
  realMaxAbsDifference: difference(qkr.re, Array.from(nativeState.re)),
  imaginaryMaxAbsDifference: difference(qkr.im, Array.from(nativeState.im)),
  finalNorm: qkr.norm,
  absoluteNormDrift: Math.abs(qkr.norm - initialNorm),
  reportedDrift: qkr.normDrift,
  nativeNormDifference: Math.abs(qkr.norm - qkrNorm(nativeState)),
  deterministic: JSON.stringify(qkr) === JSON.stringify(run(qkrConfig)),
  largeGridSpectrumAbsent: qkr.spectrum === undefined
};
const phases = [-1.2, 0.3, 2.4];
const matrix: ComplexMatrix = {
  re: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.cos(p) : 0))),
  im: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.sin(p) : 0)))
};
const spectrumConfig: DiscreteConfig = {
  ...defaultDiscreteConfig('system:unitary-floquet'),
  gridSize: phases.length,
  parameters: { hbar: 0.5, period: 2 },
  matrix
};
const spectrum = run(spectrumConfig).spectrum!;
const nativeSpectrum = complexUnitaryFloquetSpectrum(matrix, { hbar: 0.5, period: 2, projectToUnitCircle: false });
const knownSpectrum = {
  dimension: phases.length,
  phasesMaxAbsError: difference(spectrum.phases, phases),
  quasiEnergyMaxAbsError: difference(
    spectrum.quasiEnergies,
    phases.map((p) => (-0.5 * p) / 2)
  ),
  nativePhaseMaxAbsDifference: difference(spectrum.phases, nativeSpectrum.phases),
  unitarityDefect: spectrum.unitarityDefect,
  rawUnitCircleDrift: spectrum.maxUnitCircleDrift
};
const leaky = run({
  ...defaultDiscreteConfig('system:unitary-floquet'),
  gridSize: 2,
  matrix: {
    re: [
      [0.9, 0],
      [0, 0.7]
    ],
    im: [
      [0, 0],
      [0, 0]
    ]
  }
}).spectrum!;
const nonunitary = {
  defect: leaky.unitarityDefect,
  rawCircleDrift: leaky.maxUnitCircleDrift,
  eigenvalueMagnitudes: leaky.eigenvalues.map((z) => Math.hypot(z.re, z.im)).sort((a, b) => a - b)
};
const freeRotor = run({
  ...defaultDiscreteConfig('system:quantum-kicked-rotor'),
  gridSize: 2,
  parameters: { kickStrength: 0, hbar: 1 },
  iterations: 1,
  wavefunction: { re: [1, 0], im: [0, 0] }
});
const checks = {
  canonicalComplexRoundtrips: canonicalRoundtrips.every((r) => r.equal),
  standardMapNativeParity:
    standardMap.thetaAbsDifference < parityTolerance &&
    standardMap.momentumAbsDifference < parityTolerance &&
    standardMap.thetaWrapped &&
    standardMap.deterministic,
  qkrNativeParity:
    quantum.realMaxAbsDifference < parityTolerance &&
    quantum.imaginaryMaxAbsDifference < parityTolerance &&
    quantum.nativeNormDifference < parityTolerance &&
    quantum.deterministic,
  selectedNormConservation: quantum.absoluteNormDrift < 1e-9,
  analyticDiagonalSpectrum:
    knownSpectrum.phasesMaxAbsError < spectrumTolerance &&
    knownSpectrum.quasiEnergyMaxAbsError < spectrumTolerance &&
    knownSpectrum.nativePhaseMaxAbsDifference < parityTolerance,
  rawNonunitaryEvidence:
    nonunitary.defect > 0.1 &&
    nonunitary.rawCircleDrift > 0.2 &&
    difference(nonunitary.eigenvalueMagnitudes, [0.7, 0.9]) < spectrumTolerance,
  knownQkrFreeSpectrum: !!freeRotor.spectrum && difference(freeRotor.spectrum.phases, [-0.5, 0]) < spectrumTolerance,
  spectrumUsesActualBoundedGrid: quantum.largeGridSpectrumAbsent
};
const report = {
  schemaVersion: 'S17-numerical-metrics/v1',
  recordedAtUtc: new Date().toISOString(),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceScope: 'Working-tree S17 adapter sources at measurement; sourceHead identifies the parent Git HEAD.',
  command: 'node --import tsx scripts/redesign/measure-discrete-numerics.ts',
  environment: { platform: process.platform, release: release(), node: process.version, cpu: cpus()[0]?.model },
  tolerances: { parityTolerance, spectrumTolerance, selectedNorm: 1e-9 },
  canonicalRoundtrips,
  standardMap,
  quantum,
  knownSpectrum,
  nonunitary,
  checks,
  limitations: [
    'Selected finite fixtures and native parity do not certify arbitrary input spectra or infinite-grid quantum dynamics.',
    'Native dense characteristic-polynomial roots have no convergence flag; degeneracies can be ill-conditioned. No eigenvector residual certification is claimed.',
    'Quasi-energies use the principal branch E=-hbar*arg(lambda)/T and are defined modulo 2*pi*hbar/T for a unitary operator.',
    'QKR uses FFT-ordered finite momentum states; norm conservation does not establish adequate grid resolution or dynamical localization.',
    'No human scientific review, model selector verification, or physical-device performance certification occurred.'
  ],
  elapsedMs: performance.now() - started
};
writeFileSync(
  process.argv[2]
    ? resolve(process.argv[2])
    : new URL('../../documents/redesign/stage-runs/S17-numerical-metrics.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  JSON.stringify({ checks, standardMap, quantum, knownSpectrum, nonunitary, elapsedMs: report.elapsedMs }, null, 2)
);
if (Object.values(checks).some((passed) => !passed))
  throw new Error('S17 numerical fixture failed; inspect without weakening fixed tolerances.');
