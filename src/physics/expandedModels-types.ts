import type { IntegratorId } from '../types/domain';
import type { SpectrumConsistency } from './spectrumConsistency';
import type { Derivative } from './types';

export const EXPANSION_MODEL_IDS = [
  'driven',
  'coupled',
  'inverted',
  'cartpole',
  'parametric',
  'spherical',
  'chain'
] as const;

export type ExpansionModelId = (typeof EXPANSION_MODEL_IDS)[number];

export type ExpansionParameterMap = Record<string, number>;

export interface ExpansionPoint {
  x: number;
  y: number;
}

export interface ExpansionSweepSpec {
  parameter: string;
  label: string;
  min: number;
  max: number;
}

export interface ExpansionModelDefinition {
  id: ExpansionModelId;
  label: string;
  family: string;
  dimension: number;
  conservative: boolean;
  defaultDt: number;
  defaultHorizon: number;
  defaultState: readonly number[];
  defaultParameters: ExpansionParameterMap;
  sweep: ExpansionSweepSpec;
  equation: string;
  energyNote: string;
  caveat: string;
}

export interface ExpansionSystem {
  definition: ExpansionModelDefinition;
  parameters: ExpansionParameterMap;
  initialState: Float64Array;
  rhs: Derivative;
  energy: (state: ArrayLike<number>) => number;
  coordinates: (state: ArrayLike<number>) => ExpansionPoint[];
  phasePoint: (state: ArrayLike<number>) => ExpansionPoint;
}

export interface ExpansionSuiteConfig {
  model: ExpansionModelId;
  methods?: readonly IntegratorId[];
  parameterOverrides?: Partial<ExpansionParameterMap>;
  initialState?: readonly number[];
  dt?: number;
  horizon?: number;
  sampleLimit?: number;
  ghostEpsilon?: number;
  bifurcationColumns?: number;
}

export interface ExpansionPreset {
  id: string;
  label: string;
  model: ExpansionModelId;
  description: string;
  config: ExpansionSuiteConfig;
}

export interface GoldenExperimentResult {
  presetId: string;
  label: string;
  ok: boolean;
  hash: string;
  bestMethod: IntegratorId;
  energyShellSpan: number;
  maxGhostDivergence: number;
  reason: string;
}

export interface BatchExperimentResult {
  presetId: string;
  label: string;
  result: ExpansionSuiteResult;
}

export type ResearchComparisonKind = 'parameter' | 'integrator';

export interface ResearchComparisonRun {
  id: string;
  label: string;
  kind: ResearchComparisonKind;
  hash: string;
  model: ExpansionModelId;
  variedParameter: string;
  parameterValue: number;
  method: IntegratorId;
  stable: boolean;
  stabilityScore: number;
  energyDrift: number;
  referenceDivergence: number;
  runtimeMs: number;
  miniGraph: number[];
}

export interface ExpansionSweepAxis {
  parameter: string;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export interface ExpansionMatrixCell {
  x: number;
  y: number;
  score: number;
  stable: boolean;
  energyDrift: number;
  runtimeMs: number;
  finalPhase: ExpansionPoint;
}

export interface ExpansionDimensionlessMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  note: string;
}

export interface ExpansionPoincarePoint {
  x: number;
  y: number;
  time: number;
}

export interface ExpansionLyapunovTimelinePoint {
  time: number;
  leading: number;
  secondary: number;
}

/**
 * A true Lyapunov profile for an expansion model, computed from the variational
 * (tangent-linear) flow with Gram-Schmidt/QR reorthonormalization — not the
 * single-perturbation ghost divergence. `spectrum` holds all `count` exponents
 * in descending order; `timeline` is the running estimate of the leading and
 * secondary exponents versus time (which converge to `spectrum[0]`/`spectrum[1]`).
 */
export interface ExpansionLyapunovProfile {
  /** All exponents, descending. Length = the model state dimension. */
  spectrum: number[];
  /**
   * Batched-means ("block bootstrap") standard error per exponent, aligned with
   * `spectrum`. Decorrelates neighbouring renormalization intervals, so it is an
   * honest uncertainty rather than the optimistic naive standard error.
   */
  blockStdError: number[];
  /** Σλ (≈ 0 for a conservative/Hamiltonian model; ≈ −trace(damping) for dissipative). */
  sum: number;
  /** Kaplan–Yorke (Lyapunov) dimension from the spectrum. */
  kaplanYorkeDimension: number;
  /** Largest exponent (= spectrum[0]); >0 signals sensitive dependence. */
  leadingExponent: number;
  /**
   * Hamiltonian self-consistency verdict (Σλ ≈ 0, symplectic pairing, zero-exponent
   * count) — a free, independent validation of the whole tangent-space pipeline,
   * meaningful for the conservative models. Reported, not assumed.
   */
  consistency: SpectrumConsistency;
  /** Running (leading, secondary) exponents versus time. */
  timeline: ExpansionLyapunovTimelinePoint[];
  /** The settings the estimate was computed with (a bare number is not reproducible). */
  settings: {
    dt: number;
    steps: number;
    renormEvery: number;
    transientSteps: number;
    count: number;
    jacobian: 'exact' | 'central-difference';
  };
}

export interface ExpansionBasinCell {
  x: number;
  y: number;
  basin: number;
  stable: boolean;
}

export interface ExpansionEnergyCell {
  x: number;
  y: number;
  energy: number;
  separatrix: boolean;
}

export interface ExpansionResearchMatrixResult {
  schemaVersion: 'pendulum-research-matrix/v1';
  generatedAt: string;
  base: ExpansionSuiteResult;
  comparison: ResearchComparisonRun[];
  sweep2d: {
    xAxis: ExpansionSweepAxis;
    yAxis: ExpansionSweepAxis;
    size: number;
    cells: ExpansionMatrixCell[];
  };
  physicalMetrics: ExpansionDimensionlessMetric[];
  diagnostics: {
    poincare: ExpansionPoincarePoint[];
    lyapunovTimeline: ExpansionLyapunovTimelinePoint[];
    /** Full variational/QR Lyapunov spectrum (descending) for the base condition. */
    lyapunovSpectrum: number[];
    /** Kaplan–Yorke dimension implied by `lyapunovSpectrum`. */
    kaplanYorkeDimension: number;
    /** Hamiltonian self-consistency verdict for `lyapunovSpectrum` (Σλ≈0, symplectic pairing). */
    lyapunovConsistency: SpectrumConsistency;
    basin: {
      xAxis: ExpansionSweepAxis;
      yAxis: ExpansionSweepAxis;
      size: number;
      cells: ExpansionBasinCell[];
    };
    energyLandscape: {
      xAxis: ExpansionSweepAxis;
      yAxis: ExpansionSweepAxis;
      size: number;
      cells: ExpansionEnergyCell[];
      referenceEnergy: number;
      note: string;
    };
  };
  summary: {
    bestComparison: string;
    bestScore: number;
    stableComparisons: number;
    sweepStableRatio: number;
    maxLyapunovEstimate: number;
  };
  manifest: {
    schemaVersion: 'pendulum-research-matrix-manifest/v1';
    hash: string;
    createdAt: string;
  };
}

export interface GoldenCenterMethodResult {
  presetId: string;
  presetLabel: string;
  method: IntegratorId;
  pass: boolean;
  driftPass: boolean;
  runtimePass: boolean;
  regressionPass: boolean;
  energyDrift: number;
  runtimeMs: number;
  stabilityScore: number;
  regressionHash: string;
  expectedRegressionHash: string | null;
  threshold: string;
}

export interface GoldenCenterPresetResult {
  presetId: string;
  label: string;
  pass: boolean;
  methods: GoldenCenterMethodResult[];
}

export interface GoldenCenterResult {
  schemaVersion: 'pendulum-golden-center/v1';
  generatedAt: string;
  presets: GoldenCenterPresetResult[];
  summary: {
    passed: number;
    failed: number;
    totalMethods: number;
    medianRuntimeMs: number;
  };
  manifest: {
    hash: string;
    createdAt: string;
  };
}

export interface ExpansionTrajectorySample {
  time: number;
  state: number[];
  energy: number;
  phase: ExpansionPoint;
  coordinates: ExpansionPoint[];
}

export interface ExpansionMethodResult {
  method: IntegratorId;
  stable: boolean;
  completedSteps: number;
  elapsedMs: number;
  stepsPerMs: number;
  energyDrift: number;
  energySpan: number;
  referenceDivergence: number;
  maxAbsState: number;
  embeddedError: number | null;
  finalState: number[];
  samples: ExpansionTrajectorySample[];
}

export interface ExpansionHeatmap {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  bins: number;
  counts: number[][];
  maxCount: number;
}

export interface ExpansionGhostFrame {
  time: number;
  divergence: number;
  base: ExpansionPoint[];
  ghost: ExpansionPoint[];
}

export interface ExpansionBifurcationColumn {
  parameter: number;
  values: number[];
}

export interface ExpansionSuiteResult {
  schemaVersion: 'pendulum-expansion-suite/v1';
  generatedAt: string;
  model: ExpansionModelId;
  modelLabel: string;
  family: string;
  conservative: boolean;
  parameters: ExpansionParameterMap;
  initialState: number[];
  methods: IntegratorId[];
  referenceMethod: IntegratorId;
  dt: number;
  horizon: number;
  rows: ExpansionMethodResult[];
  phaseHeatmap: ExpansionHeatmap;
  ghost: ExpansionGhostFrame[];
  /**
   * True variational/QR Lyapunov spectrum for the run, populated when the suite
   * is asked for it (`runExpansionSuite(config, { includeLyapunov: true })`).
   * The ghost frames above are a single-perturbation divergence illustration;
   * this is the research-grade exponent estimate.
   */
  lyapunov?: ExpansionLyapunovProfile;
  bifurcation: ExpansionBifurcationColumn[];
  replay: ExpansionPoint[][];
  summary: {
    bestMethod: IntegratorId;
    bestScore: number;
    stableMethods: number;
    maxGhostDivergence: number;
    energyShellSpan: number;
  };
  manifest: {
    schemaVersion: 'pendulum-expansion-manifest/v1';
    hash: string;
    shareHash: string;
    createdAt: string;
  };
}

export type ExpansionLyapunovProfiler = (
  config: ExpansionSuiteConfig,
  options?: { maxTimelinePoints?: number; horizonCap?: number; forceNumericalJacobian?: boolean }
) => ExpansionLyapunovProfile;
