import { writeFileSync } from 'node:fs';
import { lyapunovSpectrum } from '../../src/chaos/lyapunov';
import { saliIndicator, fliIndicator } from '../../src/chaos/indicators';
import { poincareSection } from '../../src/chaos/poincare';
import { shadowingHorizon } from '../../src/chaos/shadowing';
import { mulberry32 } from '../../src/chaos/variational';
import { rhsVanDerPol } from '../../src/physics/vanDerPol';
import type { Derivative } from '../../src/physics/types';
import { defaultNonlinearConfig, toCanonicalNonlinear } from '../../src/product/adapters/physics/nonlinear';
import { runCoreDiagnostic } from '../../src/product/adapters/analysis/core/execute';
import { defaultCoreSettings } from '../../src/product/adapters/analysis/core/settings';
import type {
  CoreDiagnosticKind,
  CoreDiagnosticRequest,
  CoreDiagnosticSettings,
  DiagnosticSeries
} from '../../src/product/adapters/analysis/core/contracts';

const config = {
  ...defaultNonlinearConfig('system:van-der-pol'),
  parameters: { mu: 0 },
  initialState: [1, 0],
  step: 0.01,
  duration: 20
};
const canonical = toCanonicalNonlinear(config);
if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
const experiment = canonical.value;
const signal = (n: number, dt: number, value: (t: number, i: number) => number): DiagnosticSeries => ({
  axisUnit: 's',
  labels: ['synthetic-observable', 'synthetic-quadrature'],
  units: ['1', '1'],
  times: Array.from({ length: n }, (_, i) => i * dt),
  states: Array.from({ length: n }, (_, i) => [value(i * dt, i), Math.sin(i * dt)]),
  warnings: ['Synthetic fixture observations; not a recorded physical run.']
});
const harmonic = signal(2001, 0.01, Math.cos);
harmonic.states = harmonic.times.map((t) => [Math.cos(t), -Math.sin(t)]);
harmonic.energy = harmonic.times.map(() => 0.5);
harmonic.energyUnit = '1';
const request = (
  kind: CoreDiagnosticKind,
  series = harmonic,
  settings: CoreDiagnosticSettings = {}
): CoreDiagnosticRequest => ({
  id: `metrics-${kind}`,
  kind,
  experiment,
  series,
  settings: { ...defaultCoreSettings(kind, experiment), ...settings }
});
const details = (result: ReturnType<typeof runCoreDiagnostic>) => result.details as Record<string, unknown>;
const maxDifference = (left: unknown, right: unknown): number => {
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right);
  if (ArrayBuffer.isView(right)) right = Array.from(right as unknown as ArrayLike<number>);
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return Infinity;
    return Math.max(0, ...left.map((value, i) => maxDifference(value, right[i])));
  }
  return left === right ? 0 : Infinity;
};

const before = JSON.stringify({ experiment, harmonic });
const state = runCoreDiagnostic(request('state-time'));
const phase = runCoreDiagnostic(request('phase'));
const energy = runCoreDiagnostic(request('energy'));
const fft = runCoreDiagnostic(
  request(
    'fft',
    signal(1024, 0.01, (t) => 7 + 1.5 * Math.cos(2 * Math.PI * 6.25 * t)),
    { window: 'none' }
  )
);
const fftPeak = fft.rows.reduce((best, row) => (row[1]! > best[1]! ? row : best));
const naff = runCoreDiagnostic(
  request(
    'naff',
    signal(1024, 0.1, (t) => Math.cos(1.2345 * t)),
    { terms: 2 }
  )
);
const frequencyError = Math.min(...naff.rows.map((row) => Math.abs(Math.abs(row[0]!) - 1.2345)));
const periodic = runCoreDiagnostic(
  request(
    'zero-one',
    signal(2000, 1, (_, i) => Math.sin(0.4 * i) + 0.5 * Math.cos(0.13 * i))
  )
);
const random = mulberry32(12345);
const noise = runCoreDiagnostic(
  request(
    'zero-one',
    signal(2000, 1, () => random() - 0.5)
  )
);

const rhs: Derivative = (s, out) => {
  rhsVanDerPol(s, { mu: 0 }, out);
};
const base = { dt: config.step, steps: 2000, transientSteps: 0, seed: 40503 };
const lyapunov = runCoreDiagnostic(request('lyapunov', harmonic, { duration: 20 }));
const nativeLyapunov = lyapunovSpectrum(config.initialState, rhs, 2, { ...base, renormEvery: 10, method: 'rk4' });
const sali = runCoreDiagnostic(request('sali', harmonic, { duration: 20 }));
const nativeSali = saliIndicator(config.initialState, rhs, { ...base, sampleEvery: 10 });
const fli = runCoreDiagnostic(request('fli', harmonic, { duration: 20 }));
const nativeFli = fliIndicator(config.initialState, rhs, { ...base, sampleEvery: 10 });
const section = runCoreDiagnostic(request('poincare', harmonic, { duration: 20 }));
const nativeSection = poincareSection(config.initialState, rhs, {
  dt: config.step,
  maxTime: 20,
  section: (s) => s[0]!,
  direction: 'both',
  transientCrossings: 0,
  maxPoints: 512,
  rootTol: 1e-9
});
const shadow = runCoreDiagnostic(request('shadowing', harmonic, { duration: 20 }));
const nativeShadow = shadowingHorizon(config.initialState, rhs, {
  dt: config.step,
  T: 20,
  threshold: 0.001,
  method: 'rk4',
  referenceMethod: 'gbs',
  referenceDt: config.step / 8,
  sampleEvery: 10,
  estimateReferenceUncertainty: true
});
const differences = {
  lyapunovSpectrum: maxDifference(details(lyapunov).spectrum, nativeLyapunov.spectrum),
  saliSeries: maxDifference(
    sali.rows,
    nativeSali.series.map((p) => [p.time, p.sali])
  ),
  fliSeries: maxDifference(
    fli.rows,
    nativeFli.series.map((p) => [p.time, p.fli])
  ),
  sectionTimes: maxDifference(details(section).times, nativeSection.times),
  sectionPoints: maxDifference(
    details(section).points,
    nativeSection.points.map((p) => Array.from(p))
  ),
  shadowSeries: maxDifference(
    shadow.rows,
    nativeShadow.series.map((p) => [p.time, p.separation, p.referenceUncertainty, p.lowerBound, p.upperBound])
  )
};
const rootResidual = Math.max(0, ...nativeSection.rootResiduals);
const maxExponent = Math.max(...nativeLyapunov.spectrum.map(Math.abs));
const periodicK = details(periodic).K as number,
  noiseK = details(noise).K as number;
const all = [state, phase, energy, fft, naff, periodic, noise, lyapunov, sali, fli, section, shadow];
const checks = {
  inputNotMutated: before === JSON.stringify({ experiment, harmonic }),
  stateProjection:
    state.rows.length === harmonic.times.length && state.rows.every((row, i) => row[1] === harmonic.states[i]![0]),
  phaseProjection: phase.rows.every((row, i) => row[0] === harmonic.states[i]![0] && row[1] === harmonic.states[i]![1]),
  energyObservation: energy.rows.every((row) => row[1] === 0.5 && row[2] === 0),
  analyticFft: Math.abs(fftPeak[0]! - 6.25) < 1e-12 && Math.abs(fftPeak[1]! - 1.5) < 1e-12,
  analyticNaff: frequencyError < 1e-4,
  periodicZeroOne: periodicK < 0.2,
  stochasticZeroOne: noiseK > 0.8,
  harmonicSpectrum: maxExponent < 0.01,
  harmonicSali: nativeSali.finalSali > 0.1,
  harmonicFli: nativeFli.fli < 1,
  harmonicSection: nativeSection.points.length >= 6 && rootResidual < 1e-8,
  shadowNoExceedance: details(shadow).horizon === null && nativeShadow.horizon === Infinity,
  nativeParity: Object.values(differences).every((difference) => difference <= 1e-12),
  allElevenKinds: new Set(all.map((result) => result.kind)).size === 11,
  finitePlotValues: all.every((result) => result.rows.every((row) => row.every(Number.isFinite)))
};
const report = {
  schema: 'pendulum-core-diagnostic-numerics/v1',
  recordedAt: new Date().toISOString(),
  checks,
  tolerances: { nativeParity: 1e-12, fft: 1e-12, naff: 1e-4, sectionResidual: 1e-8, harmonicExponent: 0.01 },
  fft: { samples: 1024, dt: 0.01, frequency: fftPeak[0], amplitude: fftPeak[1] },
  naff: { expectedAngularFrequency: 1.2345, absoluteFrequencyError: frequencyError },
  zeroOne: {
    samples: 2000,
    periodicK,
    seededNoiseK: noiseK,
    interpretation: 'High K is compatible with noise and is not a proof of deterministic chaos.'
  },
  harmonic: {
    model: 'system:van-der-pol',
    parameters: { mu: 0 },
    initialState: [1, 0],
    timeUnit: 'normalized-time',
    duration: 20,
    dt: config.step,
    spectrum: nativeLyapunov.spectrum,
    sali: nativeSali.finalSali,
    fli: nativeFli.fli,
    sectionCount: nativeSection.points.length,
    maxSectionResidual: rootResidual,
    shadowHorizon: details(shadow).horizon
  },
  nativeDifferences: differences,
  limitations: [
    'Selected analytic/synthetic fixtures and native parity do not establish convergence for arbitrary model settings.',
    'No human scientific review or real-device performance certification is implied.'
  ]
};
const output = process.argv[2] ?? 'tmp/S18-numerical-metrics.json';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
