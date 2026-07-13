import type { IntegratorId } from '../types/domain';
import { step } from './integrators';
import {
  DEFAULT_EXPANSION_METHODS,
  GOLDEN_EXPANSION_PRESET_IDS,
  createExpansionSystem,
  expansionModelDefinition,
  finiteParam,
  numberAt
} from './expandedModels-factory';
import { expansionLyapunovProfile } from './expandedModels-lyapunov';
import {
  cloneState,
  configFromPreset,
  expansionPreset,
  runExpansionSuite,
  scoreRow,
  simulateMethod,
  stableExperimentHash
} from './expandedModels-runners';
import type {
  ExpansionBasinCell,
  ExpansionDimensionlessMetric,
  ExpansionEnergyCell,
  ExpansionLyapunovProfiler,
  ExpansionMatrixCell,
  ExpansionMethodResult,
  ExpansionModelId,
  ExpansionParameterMap,
  ExpansionPoincarePoint,
  ExpansionPoint,
  ExpansionResearchMatrixResult,
  ExpansionSuiteConfig,
  ExpansionSuiteResult,
  ExpansionSweepAxis,
  ExpansionTrajectorySample,
  GoldenCenterResult,
  ResearchComparisonKind,
  ResearchComparisonRun
} from './expandedModels-types';

function parameterUnit(model: ExpansionModelId, parameter: string): string {
  const units: Record<string, string> = {
    g: 'm/s^2',
    length: 'm',
    length1: 'm',
    length2: 'm',
    length3: 'm',
    length4: 'm',
    damping: '1/s',
    driveAmplitude: 'rad/s^2',
    driveFrequency: 'rad/s',
    frequency: 'rad/s',
    amplitude: '1',
    coupling: '1/s^2',
    force: 'N',
    friction: 'N s/m',
    cartMass: 'kg',
    poleMass: 'kg',
    links: 'count',
    lengthScale: '1'
  };
  if (model === 'spherical' && parameter === 'length') return 'm';
  return units[parameter] ?? 'model unit';
}

function modelAxis(
  model: ExpansionModelId,
  parameter: string,
  label: string,
  min: number,
  max: number
): ExpansionSweepAxis {
  return { parameter, label, unit: parameterUnit(model, parameter), min, max };
}

function researchAxes(model: ExpansionModelId): { xAxis: ExpansionSweepAxis; yAxis: ExpansionSweepAxis } {
  switch (model) {
    case 'driven':
      return {
        xAxis: modelAxis(model, 'driveAmplitude', 'drive amplitude', 0.7, 1.45),
        yAxis: modelAxis(model, 'damping', 'damping', 0.05, 0.9)
      };
    case 'cartpole':
      return {
        xAxis: modelAxis(model, 'force', 'cart force', -3, 3),
        yAxis: modelAxis(model, 'length', 'pole length', 0.35, 1.4)
      };
    case 'parametric':
      return {
        xAxis: modelAxis(model, 'amplitude', 'modulation amplitude', 0, 0.7),
        yAxis: modelAxis(model, 'frequency', 'modulation frequency', 3, 9)
      };
    case 'coupled':
      return {
        xAxis: modelAxis(model, 'coupling', 'coupling', 0.1, 5),
        yAxis: modelAxis(model, 'length', 'length', 0.45, 1.8)
      };
    case 'inverted':
      return {
        xAxis: modelAxis(model, 'g', 'gravity', 2, 18),
        yAxis: modelAxis(model, 'length', 'length', 0.35, 1.8)
      };
    case 'spherical':
      return {
        xAxis: modelAxis(model, 'g', 'gravity', 2, 18),
        yAxis: modelAxis(model, 'length', 'length', 0.45, 1.8)
      };
    case 'chain':
      return {
        xAxis: modelAxis(model, 'g', 'gravity', 2, 18),
        yAxis: modelAxis(model, 'lengthScale', 'link length scale', 0.65, 1.35)
      };
    default: {
      const exhaustive: never = model;
      throw new Error(`unknown research axis model: ${String(exhaustive)}`);
    }
  }
}

function withAxisValue(
  model: ExpansionModelId,
  base: Partial<ExpansionParameterMap>,
  axis: ExpansionSweepAxis,
  value: number
): Partial<ExpansionParameterMap> {
  const next: ExpansionParameterMap = {};
  for (const [key, item] of Object.entries(base)) {
    if (item !== undefined) next[key] = item;
  }
  if (model === 'chain' && axis.parameter === 'lengthScale') {
    const definition = expansionModelDefinition(model);
    const links = Math.max(
      2,
      Math.min(8, Math.round(finiteParam(next, 'links', definition.defaultParameters.links ?? 4)))
    );
    for (let i = 1; i <= links; i += 1) {
      const key = `length${i}`;
      const baseLength = finiteParam(definition.defaultParameters, key, Math.max(0.25, 1 - (i - 1) * 0.15));
      next[key] = baseLength * value;
    }
    return next;
  }
  next[axis.parameter] = value;
  return next;
}

function phaseIndexes(model: ExpansionModelId, stateLength: number): { position: number; velocity: number } {
  switch (model) {
    case 'cartpole':
      return { position: 1, velocity: 3 };
    case 'coupled':
      return { position: 0, velocity: 2 };
    case 'spherical':
      return { position: 0, velocity: 2 };
    case 'chain':
      return { position: 0, velocity: Math.max(1, Math.floor(stateLength / 2)) };
    case 'driven':
    case 'inverted':
    case 'parametric':
      return { position: 0, velocity: 1 };
    default: {
      const exhaustive: never = model;
      throw new Error(`unknown phase-index model: ${String(exhaustive)}`);
    }
  }
}

function primaryLength(parameters: ExpansionParameterMap): number {
  const direct = finiteParam(parameters, 'length', Number.NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const length1 = finiteParam(parameters, 'length1', Number.NaN);
  return Number.isFinite(length1) && length1 > 0 ? length1 : 1;
}

function primaryMass(parameters: ExpansionParameterMap): number {
  const cartMass = finiteParam(parameters, 'cartMass', Number.NaN);
  const poleMass = finiteParam(parameters, 'poleMass', Number.NaN);
  if (Number.isFinite(cartMass) && Number.isFinite(poleMass)) return Math.max(1e-9, cartMass + poleMass);
  return Math.max(1e-9, finiteParam(parameters, 'mass1', 1));
}

function rounded(value: number, digits = 6): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function miniGraphFromSamples(samples: readonly ExpansionTrajectorySample[], count = 28): number[] {
  if (samples.length === 0) return [];
  const stride = Math.max(1, Math.floor(samples.length / count));
  const values = samples
    .filter((_, index) => index % stride === 0)
    .slice(0, count)
    .map((sample) => sample.energy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-12, max - min);
  return values.map((value) => rounded((value - min) / span, 4));
}

function comparisonRow(
  suite: ExpansionSuiteResult,
  row: ExpansionMethodResult,
  label: string,
  kind: ResearchComparisonKind,
  variedParameter: string,
  parameterValue: number
): ResearchComparisonRun {
  return {
    id: `${kind}-${label}-${row.method}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    kind,
    hash: suite.manifest.hash,
    model: suite.model,
    variedParameter,
    parameterValue,
    method: row.method,
    stable: row.stable,
    stabilityScore: Number(scoreRow(row, suite.conservative).toFixed(2)),
    energyDrift: row.energyDrift,
    referenceDivergence: row.referenceDivergence,
    runtimeMs: row.elapsedMs,
    miniGraph: miniGraphFromSamples(row.samples)
  };
}

function quickProbe(
  config: ExpansionSuiteConfig,
  method: IntegratorId,
  horizonCap = 5
): {
  row: ExpansionMethodResult;
  score: number;
  finalPhase: ExpansionPoint;
} {
  const definition = expansionModelDefinition(config.model);
  const dt = config.dt ?? definition.defaultDt;
  const horizon = Math.min(config.horizon ?? definition.defaultHorizon, horizonCap);
  const steps = Math.max(10, Math.min(16_000, Math.round(horizon / dt)));
  const stride = Math.max(1, Math.floor(steps / 60));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const row = simulateMethod(system, method, dt, steps, stride);
  const finalPhase = row.samples[row.samples.length - 1]?.phase ?? system.phasePoint(row.finalState);
  return { row, score: scoreRow(row, definition.conservative), finalPhase };
}

function interpolate(min: number, max: number, index: number, size: number): number {
  return size <= 1 ? (min + max) / 2 : min + (max - min) * (index / (size - 1));
}

function build2dSweep(config: ExpansionSuiteConfig, gridSize: number): ExpansionResearchMatrixResult['sweep2d'] {
  const { xAxis, yAxis } = researchAxes(config.model);
  const size = Math.max(4, Math.min(12, Math.round(gridSize)));
  const cells: ExpansionMatrixCell[] = [];
  for (let yIndex = 0; yIndex < size; yIndex += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yIndex, size);
    for (let xIndex = 0; xIndex < size; xIndex += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xIndex, size);
      const baseOverrides = config.parameterOverrides ?? {};
      const axisOverrides = withAxisValue(config.model, withAxisValue(config.model, baseOverrides, xAxis, x), yAxis, y);
      const { row, score, finalPhase } = quickProbe(
        {
          ...config,
          methods: ['rk4'],
          parameterOverrides: axisOverrides,
          sampleLimit: 48,
          bifurcationColumns: 4
        },
        'rk4',
        4
      );
      cells.push({
        x,
        y,
        score: Number(score.toFixed(2)),
        stable: row.stable,
        energyDrift: row.energyDrift,
        runtimeMs: row.elapsedMs,
        finalPhase
      });
    }
  }
  return { xAxis, yAxis, size, cells };
}

function physicalMetricsFor(
  config: ExpansionSuiteConfig,
  result: ExpansionSuiteResult
): ExpansionDimensionlessMetric[] {
  const parameters = result.parameters;
  const g = Math.max(1e-9, finiteParam(parameters, 'g', 9.81));
  const length = Math.max(1e-9, primaryLength(parameters));
  const characteristicTime = Math.sqrt(length / g);
  const dt = result.dt;
  const horizon = result.horizon;
  const damping = finiteParam(parameters, 'damping', 0);
  const driveFrequency = finiteParam(parameters, 'driveFrequency', finiteParam(parameters, 'frequency', 0));
  const force = finiteParam(parameters, 'force', 0);
  const coupling = finiteParam(parameters, 'coupling', 0);
  const driveAmplitude = finiteParam(parameters, 'driveAmplitude', finiteParam(parameters, 'amplitude', 0));
  const metrics: ExpansionDimensionlessMetric[] = [
    { id: 't0', label: 'Characteristic time', value: characteristicTime, unit: 's', note: 'sqrt(length / gravity)' },
    { id: 'dt-star', label: 'dt / t0', value: dt / characteristicTime, unit: '1', note: 'time-step resolution' },
    {
      id: 'horizon-star',
      label: 'T / t0',
      value: horizon / characteristicTime,
      unit: '1',
      note: 'dimensionless experiment horizon'
    }
  ];
  if (damping > 0)
    metrics.push({
      id: 'damping-star',
      label: 'gamma t0',
      value: damping * characteristicTime,
      unit: '1',
      note: 'dimensionless damping'
    });
  if (driveFrequency > 0)
    metrics.push({
      id: 'drive-frequency-star',
      label: 'Omega t0',
      value: driveFrequency * characteristicTime,
      unit: '1',
      note: 'drive frequency ratio'
    });
  if (driveAmplitude !== 0)
    metrics.push({
      id: 'forcing-star',
      label: 'forcing ratio',
      value: Math.abs(driveAmplitude) / Math.max(1e-9, g / length),
      unit: '1',
      note: 'forcing versus gravity scale'
    });
  if (force !== 0)
    metrics.push({
      id: 'force-star',
      label: 'F / mg',
      value: force / (primaryMass(parameters) * g),
      unit: '1',
      note: 'cart-pole open-loop force ratio'
    });
  if (coupling !== 0)
    metrics.push({
      id: 'coupling-star',
      label: 'k / (g/l)',
      value: coupling / (g / length),
      unit: '1',
      note: 'coupling versus pendulum frequency squared'
    });
  if (config.model === 'cartpole') {
    const cart = finiteParam(parameters, 'cartMass', 1);
    const pole = finiteParam(parameters, 'poleMass', 0.16);
    metrics.push({
      id: 'mass-ratio',
      label: 'pole/cart mass',
      value: pole / Math.max(1e-9, cart),
      unit: '1',
      note: 'underactuated mass ratio'
    });
  }
  return metrics.map((metric) => ({ ...metric, value: rounded(metric.value, 6) }));
}

function poincareSection(config: ExpansionSuiteConfig, method: IntegratorId): ExpansionPoincarePoint[] {
  const definition = expansionModelDefinition(config.model);
  const dt = config.dt ?? definition.defaultDt;
  const horizon = Math.min(config.horizon ?? definition.defaultHorizon, 20);
  const steps = Math.max(10, Math.min(45_000, Math.round(horizon / dt)));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const state = cloneState(system.initialState);
  const out = new Float64Array(state.length);
  const points: ExpansionPoincarePoint[] = [];
  let previousDriveTurn = Math.floor(numberAt(state, 2) / (Math.PI * 2));
  let previousPhase = system.phasePoint(state);
  for (let i = 0; i < steps && points.length < 180; i += 1) {
    step(method, state, dt, system.rhs, out);
    state.set(out);
    const phase = system.phasePoint(state);
    const time = (i + 1) * dt;
    let hit = false;
    if (config.model === 'driven' || config.model === 'parametric') {
      const turn = Math.floor(numberAt(state, 2) / (Math.PI * 2));
      hit = turn > previousDriveTurn;
      previousDriveTurn = turn;
    } else {
      hit = previousPhase.x < 0 && phase.x >= 0 && phase.y > 0;
    }
    if (hit) points.push({ x: phase.x, y: phase.y, time });
    previousPhase = phase;
  }
  return points;
}

function basinGrid(
  config: ExpansionSuiteConfig,
  gridSize: number
): ExpansionResearchMatrixResult['diagnostics']['basin'] {
  const definition = expansionModelDefinition(config.model);
  const size = Math.max(5, Math.min(13, Math.round(gridSize)));
  const state0 = [...(config.initialState ?? definition.defaultState)];
  const indexes = phaseIndexes(config.model, state0.length);
  const xAxis = modelAxis(config.model, 'initial position', 'initial phase coordinate', -Math.PI, Math.PI);
  const yAxis = modelAxis(config.model, 'initial velocity', 'initial phase velocity', -4, 4);
  const cells: ExpansionBasinCell[] = [];
  for (let yi = 0; yi < size; yi += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yi, size);
    for (let xi = 0; xi < size; xi += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xi, size);
      const state = [...state0];
      state[indexes.position] = x;
      state[indexes.velocity] = y;
      const { row, finalPhase } = quickProbe(
        { ...config, initialState: state, methods: ['rk4'], sampleLimit: 24, bifurcationColumns: 4 },
        'rk4',
        3
      );
      const basin = !row.stable ? 3 : finalPhase.x < -0.35 ? 0 : finalPhase.x > 0.35 ? 1 : 2;
      cells.push({ x, y, basin, stable: row.stable });
    }
  }
  return { xAxis, yAxis, size, cells };
}

function energyLandscape(
  config: ExpansionSuiteConfig,
  gridSize: number
): ExpansionResearchMatrixResult['diagnostics']['energyLandscape'] {
  const definition = expansionModelDefinition(config.model);
  const size = Math.max(9, Math.min(31, Math.round(gridSize * 2 + 3)));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const state0 = [...system.initialState];
  const indexes = phaseIndexes(config.model, state0.length);
  const referenceEnergy = system.energy(system.initialState);
  const xAxis = modelAxis(config.model, 'phase position', 'phase coordinate', -Math.PI, Math.PI);
  const yAxis = modelAxis(config.model, 'phase velocity', 'phase velocity', -6, 6);
  const cells: ExpansionEnergyCell[] = [];
  const scale = Math.max(1e-9, Math.abs(referenceEnergy));
  for (let yi = 0; yi < size; yi += 1) {
    const y = interpolate(yAxis.min, yAxis.max, yi, size);
    for (let xi = 0; xi < size; xi += 1) {
      const x = interpolate(xAxis.min, xAxis.max, xi, size);
      const state = [...state0];
      state[indexes.position] = x;
      state[indexes.velocity] = y;
      const energy = system.energy(state);
      cells.push({ x, y, energy, separatrix: Math.abs(energy - referenceEnergy) / scale < 0.06 });
    }
  }
  const note = definition.conservative
    ? 'Conservative model: white marks approximate equal-energy shell samples, not an event-located separatrix.'
    : 'Driven/dissipative model: this is diagnostic mechanical energy only; white marks are not a true separatrix.';
  return { xAxis, yAxis, size, cells, referenceEnergy, note };
}

function comparisonSuiteConfig(config: ExpansionSuiteConfig, parameter: string, value: number): ExpansionSuiteConfig {
  const definition = expansionModelDefinition(config.model);
  return {
    ...config,
    parameterOverrides: { ...(config.parameterOverrides ?? {}), [parameter]: value },
    methods: ['rk4', 'dopri5', 'symplectic'],
    horizon: Math.min(config.horizon ?? definition.defaultHorizon, 8),
    sampleLimit: 80,
    bifurcationColumns: 5
  };
}

// ===== Section: Research Matrix Study (runResearchMatrixStudy) ===============

export function runResearchMatrixStudy(
  config: ExpansionSuiteConfig,
  options: { gridSize?: number; lyapunovProfiler?: ExpansionLyapunovProfiler } = {}
): ExpansionResearchMatrixResult {
  const definition = expansionModelDefinition(config.model);
  const gridSize = options.gridSize ?? 8;
  const base = runExpansionSuite({
    ...config,
    methods: config.methods?.length ? config.methods : DEFAULT_EXPANSION_METHODS,
    sampleLimit: config.sampleLimit ?? 160,
    bifurcationColumns: config.bifurcationColumns ?? 8
  });
  const comparison: ResearchComparisonRun[] = [];
  for (const row of base.rows) {
    comparison.push(
      comparisonRow(
        base,
        row,
        `same condition / ${row.method}`,
        'integrator',
        definition.sweep.parameter,
        base.parameters[definition.sweep.parameter] ?? 0
      )
    );
  }

  const current = base.parameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2;
  const parameterValues = [
    definition.sweep.min,
    Math.max(definition.sweep.min, Math.min(definition.sweep.max, current)),
    definition.sweep.max
  ];
  for (const value of parameterValues) {
    const suite = runExpansionSuite(comparisonSuiteConfig(config, definition.sweep.parameter, value));
    const best = suite.rows.reduce(
      (acc, row) => (scoreRow(row, suite.conservative) > scoreRow(acc, suite.conservative) ? row : acc),
      suite.rows[0]!
    );
    comparison.push(
      comparisonRow(
        suite,
        best,
        `${definition.sweep.label} ${value.toPrecision(3)}`,
        'parameter',
        definition.sweep.parameter,
        value
      )
    );
  }

  const sweep2d = build2dSweep(config, gridSize);
  const method = base.summary.bestMethod;
  const poincare = poincareSection(config, method);
  const lyapunov = (options.lyapunovProfiler ?? expansionLyapunovProfile)(config);
  const timeline = lyapunov.timeline;
  const basin = basinGrid(config, gridSize);
  const landscape = energyLandscape(config, gridSize);
  const stableComparisons = comparison.filter((row) => row.stable).length;
  const bestComparison = comparison.reduce(
    (acc, row) => (row.stabilityScore > acc.stabilityScore ? row : acc),
    comparison[0]!
  );
  const maxLyapunovEstimate = lyapunov.leadingExponent;
  const createdAt = new Date().toISOString();
  const summary = {
    bestComparison: bestComparison.label,
    bestScore: bestComparison.stabilityScore,
    stableComparisons,
    sweepStableRatio: sweep2d.cells.filter((cell) => cell.stable).length / Math.max(1, sweep2d.cells.length),
    maxLyapunovEstimate: Number.isFinite(maxLyapunovEstimate) ? rounded(maxLyapunovEstimate, 6) : 0
  };
  const hash = stableExperimentHash({
    schema: 'pendulum-research-matrix/v1',
    model: config.model,
    parameters: base.parameters,
    initialState: base.initialState,
    dt: base.dt,
    horizon: base.horizon,
    comparison: comparison.map((row) => ({
      id: row.id,
      score: row.stabilityScore,
      stable: row.stable,
      hash: row.hash
    })),
    sweep: sweep2d.cells.map((cell) => ({
      x: rounded(cell.x, 4),
      y: rounded(cell.y, 4),
      score: rounded(cell.score, 2),
      stable: cell.stable
    })),
    summary
  });
  return {
    schemaVersion: 'pendulum-research-matrix/v1',
    generatedAt: createdAt,
    base,
    comparison,
    sweep2d,
    physicalMetrics: physicalMetricsFor(config, base),
    diagnostics: {
      poincare,
      lyapunovTimeline: timeline,
      lyapunovSpectrum: lyapunov.spectrum,
      kaplanYorkeDimension: lyapunov.kaplanYorkeDimension,
      lyapunovConsistency: lyapunov.consistency,
      basin,
      energyLandscape: landscape
    },
    summary,
    manifest: {
      schemaVersion: 'pendulum-research-matrix-manifest/v1',
      hash,
      createdAt
    }
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
}

// ===== Section: Golden Regression (GOLDEN_REGRESSION_BASELINES, runGoldenExpansionCenter) =

export const GOLDEN_REGRESSION_BASELINES: Readonly<Record<string, Partial<Record<IntegratorId, string>>>> =
  Object.freeze({
    'driven-chaos': {
      rk4: 'exp-d4df1991',
      dopri5: 'exp-02e3f836',
      leapfrog: 'exp-46ffd90b',
      symplectic: 'exp-a15c4262',
      euler: 'exp-8633ecb8'
    },
    'coupled-normal-mode': {
      rk4: 'exp-50ed08d1',
      dopri5: 'exp-cde68620',
      leapfrog: 'exp-903d21ef',
      symplectic: 'exp-2f56e213',
      euler: 'exp-6bdd225a'
    },
    'inverted-growth': {
      rk4: 'exp-26212d81',
      dopri5: 'exp-ea58c760',
      leapfrog: 'exp-49255901',
      symplectic: 'exp-2bc2741c',
      euler: 'exp-b7ce02a9'
    },
    'cartpole-open-loop': {
      rk4: 'exp-f2b35906',
      dopri5: 'exp-3d195f04',
      leapfrog: 'exp-0d97aad4',
      symplectic: 'exp-6053f497',
      euler: 'exp-1fb29c06'
    },
    'parametric-resonance': {
      rk4: 'exp-5d7918d0',
      dopri5: 'exp-9d76947e',
      leapfrog: 'exp-0de34b55',
      symplectic: 'exp-29a1bdb7',
      euler: 'exp-90e7641f'
    },
    'spherical-conical': {
      rk4: 'exp-e32cfcda',
      dopri5: 'exp-59d1105c',
      leapfrog: 'exp-6b1635f9',
      symplectic: 'exp-ef0f627c',
      euler: 'exp-df184220'
    },
    'chain-cascade': {
      rk4: 'exp-cc31d2b4',
      dopri5: 'exp-beff4a42',
      leapfrog: 'exp-c77e95b3',
      symplectic: 'exp-5591e72b',
      euler: 'exp-f1b6295e'
    }
  });

export function runGoldenExpansionCenter(
  presetIds: readonly string[] = GOLDEN_EXPANSION_PRESET_IDS,
  methods: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler']
): GoldenCenterResult {
  const generatedAt = new Date().toISOString();
  const presets = presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    const result = runExpansionSuite({
      ...configFromPreset(presetId),
      methods,
      sampleLimit: 80,
      bifurcationColumns: 5
    });
    const driftLimit = result.conservative ? 8e-2 : 1.2;
    const runtimeLimit = 2_000;
    const rows = result.rows.map((row) => {
      const stabilityScore = Number(scoreRow(row, result.conservative).toFixed(2));
      const driftPass = row.energyDrift <= driftLimit;
      const runtimePass = row.elapsedMs <= runtimeLimit;
      const regressionHash = stableExperimentHash({
        presetId,
        method: row.method,
        stable: row.stable,
        energyDrift: rounded(row.energyDrift, 8),
        referenceDivergence: rounded(row.referenceDivergence, 8),
        finalState: row.finalState.map((value) => rounded(value, 6))
      });
      const expectedRegressionHash = GOLDEN_REGRESSION_BASELINES[presetId]?.[row.method] ?? null;
      const regressionPass = expectedRegressionHash !== null && regressionHash === expectedRegressionHash;
      return {
        presetId,
        presetLabel: preset.label,
        method: row.method,
        pass: row.stable && driftPass && runtimePass && regressionPass,
        driftPass,
        runtimePass,
        regressionPass,
        energyDrift: row.energyDrift,
        runtimeMs: row.elapsedMs,
        stabilityScore,
        regressionHash,
        expectedRegressionHash,
        threshold: `drift <= ${driftLimit.toExponential(1)}, runtime <= ${runtimeLimit} ms, regression == ${expectedRegressionHash ?? 'untracked'}`
      };
    });
    return { presetId, label: preset.label, pass: rows.every((row) => row.pass), methods: rows };
  });
  const flat = presets.flatMap((preset) => preset.methods);
  const summary = {
    passed: flat.filter((row) => row.pass).length,
    failed: flat.filter((row) => !row.pass).length,
    totalMethods: flat.length,
    medianRuntimeMs: median(flat.map((row) => row.runtimeMs))
  };
  const hash = stableExperimentHash({
    schema: 'pendulum-golden-center/v1',
    presets: presets.map((preset) => ({
      id: preset.presetId,
      pass: preset.pass,
      rows: preset.methods.map((row) => ({ method: row.method, pass: row.pass, hash: row.regressionHash }))
    })),
    summary
  });
  return {
    schemaVersion: 'pendulum-golden-center/v1',
    generatedAt,
    presets,
    summary,
    manifest: { hash, createdAt: generatedAt }
  };
}
