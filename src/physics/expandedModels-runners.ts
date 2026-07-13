import type { IntegratorId } from '../types/domain';
import { step } from './integrators';
import {
  DEFAULT_EXPANSION_METHODS,
  EXPANSION_PRESETS,
  GOLDEN_EXPANSION_PRESET_IDS,
  createExpansionSystem,
  expansionModelDefinition,
  numberAt
} from './expandedModels-factory';
import { expansionLyapunovProfile } from './expandedModels-lyapunov';
import {
  EXPANSION_MODEL_IDS,
  type BatchExperimentResult,
  type ExpansionBifurcationColumn,
  type ExpansionGhostFrame,
  type ExpansionHeatmap,
  type ExpansionLyapunovProfiler,
  type ExpansionMethodResult,
  type ExpansionParameterMap,
  type ExpansionPreset,
  type ExpansionSuiteConfig,
  type ExpansionSuiteResult,
  type ExpansionSystem,
  type ExpansionTrajectorySample,
  type GoldenExperimentResult
} from './expandedModels-types';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function relativeDrift(value: number, initial: number): number {
  return Math.abs(value - initial) / Math.max(1e-12, Math.abs(initial));
}

function maxAbs(state: ArrayLike<number>): number {
  let value = 0;
  for (let i = 0; i < state.length; i += 1) value = Math.max(value, Math.abs(numberAt(state, i)));
  return value;
}

export function cloneState(state: ArrayLike<number>): Float64Array {
  return Float64Array.from(Array.from({ length: state.length }, (_, i) => numberAt(state, i)));
}

export function simulateMethod(
  system: ExpansionSystem,
  method: IntegratorId,
  dt: number,
  steps: number,
  sampleStride: number
): ExpansionMethodResult {
  const state = cloneState(system.initialState);
  const out = new Float64Array(state.length);
  const previousError = { value: 0 };
  const e0 = system.energy(state);
  let eMin = e0;
  let eMax = e0;
  let stable = true;
  let completedSteps = 0;
  const samples: ExpansionTrajectorySample[] = [];
  const started = nowMs();

  for (let i = 0; i < steps; i += 1) {
    step(method, state, dt, system.rhs, out, { tolerance: 1e-9, previousError });
    state.set(out);
    completedSteps = i + 1;
    const energy = system.energy(state);
    eMin = Math.min(eMin, energy);
    eMax = Math.max(eMax, energy);
    if (!Number.isFinite(energy) || maxAbs(state) > 1e6) {
      stable = false;
      break;
    }
    if (i % sampleStride === 0 || i === steps - 1) {
      samples.push({
        time: (i + 1) * dt,
        state: Array.from(state),
        energy,
        phase: system.phasePoint(state),
        coordinates: system.coordinates(state)
      });
    }
  }

  const elapsedMs = Math.max(0.001, nowMs() - started);
  const finalEnergy = system.energy(state);
  return {
    method,
    stable,
    completedSteps,
    elapsedMs,
    stepsPerMs: completedSteps / elapsedMs,
    energyDrift: relativeDrift(finalEnergy, e0),
    energySpan: Math.abs(eMax - eMin) / Math.max(1e-12, Math.abs(e0)),
    referenceDivergence: 0,
    maxAbsState: maxAbs(state),
    embeddedError: previousError.value > 0 ? previousError.value : null,
    finalState: Array.from(state),
    samples
  };
}

function stateDistance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function scoreRow(row: ExpansionMethodResult, conservative: boolean): number {
  const driftPenalty = conservative
    ? Math.log10(1 + row.energyDrift * 1e6)
    : Math.log10(1 + row.referenceDivergence * 1e4);
  const stabilityPenalty = row.stable ? 0 : 100;
  const speedBonus = Math.log10(1 + row.stepsPerMs);
  return Math.max(
    0,
    100 - driftPenalty * 12 - Math.log10(1 + row.referenceDivergence * 1e6) * 9 - stabilityPenalty + speedBonus * 2
  );
}

function heatmapFromSamples(samples: readonly ExpansionTrajectorySample[], bins = 36): ExpansionHeatmap {
  const yMaxRaw = Math.max(1, ...samples.map((sample) => Math.abs(sample.phase.y)));
  const yMax = Math.min(40, Math.max(2, yMaxRaw));
  const counts = Array.from({ length: bins }, () => Array.from({ length: bins }, () => 0));
  let maxCount = 0;
  for (const sample of samples) {
    const xi = Math.max(0, Math.min(bins - 1, Math.floor(((sample.phase.x + Math.PI) / (Math.PI * 2)) * bins)));
    const yi = Math.max(0, Math.min(bins - 1, Math.floor(((sample.phase.y + yMax) / (2 * yMax)) * bins)));
    const row = counts[yi]!;
    row[xi] = (row[xi] ?? 0) + 1;
    maxCount = Math.max(maxCount, row[xi] ?? 0);
  }
  return { xMin: -Math.PI, xMax: Math.PI, yMin: -yMax, yMax, bins, counts, maxCount };
}

function ghostFrames(
  system: ExpansionSystem,
  method: IntegratorId,
  dt: number,
  steps: number,
  sampleStride: number,
  epsilon: number
): ExpansionGhostFrame[] {
  const base = cloneState(system.initialState);
  const ghost = cloneState(system.initialState);
  ghost[0] = numberAt(ghost, 0) + epsilon;
  const outA = new Float64Array(base.length);
  const outB = new Float64Array(ghost.length);
  const frames: ExpansionGhostFrame[] = [];
  for (let i = 0; i < steps; i += 1) {
    step(method, base, dt, system.rhs, outA);
    step(method, ghost, dt, system.rhs, outB);
    base.set(outA);
    ghost.set(outB);
    if (i % sampleStride === 0 || i === steps - 1) {
      frames.push({
        time: (i + 1) * dt,
        divergence: stateDistance(Array.from(base), Array.from(ghost)),
        base: system.coordinates(base),
        ghost: system.coordinates(ghost)
      });
    }
  }
  return frames;
}

function bifurcationPreview(
  config: Required<Pick<ExpansionSuiteConfig, 'model' | 'dt' | 'horizon' | 'bifurcationColumns'>> & {
    parameterOverrides: Partial<ExpansionParameterMap>;
    initialState?: readonly number[];
  }
): ExpansionBifurcationColumn[] {
  const definition = expansionModelDefinition(config.model);
  const columns: ExpansionBifurcationColumn[] = [];
  const count = Math.max(4, Math.min(32, Math.round(config.bifurcationColumns)));
  const steps = Math.max(100, Math.min(5000, Math.round((config.horizon * 0.7) / config.dt)));
  const transient = Math.floor(steps * 0.65);
  const stride = Math.max(1, Math.floor((steps - transient) / 24));
  for (let c = 0; c < count; c += 1) {
    const u = count === 1 ? 0 : c / (count - 1);
    const value = definition.sweep.min + (definition.sweep.max - definition.sweep.min) * u;
    const system = createExpansionSystem(
      config.model,
      { ...config.parameterOverrides, [definition.sweep.parameter]: value },
      config.initialState
    );
    const state = cloneState(system.initialState);
    const out = new Float64Array(state.length);
    const values: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      step('rk4', state, config.dt, system.rhs, out);
      state.set(out);
      if (i >= transient && i % stride === 0) values.push(system.phasePoint(state).x);
    }
    columns.push({ parameter: value, values });
  }
  return columns;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

// ===== Section: Utilities (hash, parse, preset lookup, report builder) ========

export function stableExperimentHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `exp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function shareHash(config: ExpansionSuiteConfig): string {
  const payload = stableStringify({
    model: config.model,
    dt: config.dt,
    horizon: config.horizon,
    methods: config.methods,
    parameterOverrides: config.parameterOverrides
  });
  if (typeof btoa === 'function') return `#expansion=${btoa(payload).replace(/=+$/g, '')}`;
  return `#expansion=${encodeURIComponent(payload)}`;
}

export function parseExpansionShareHash(hash: string): ExpansionSuiteConfig | null {
  const marker = '#expansion=';
  if (!hash.startsWith(marker)) return null;
  const raw = hash.slice(marker.length);
  try {
    const json = typeof atob === 'function' ? atob(raw) : decodeURIComponent(raw);
    const parsed = JSON.parse(json) as Partial<ExpansionSuiteConfig>;
    if (!parsed.model || !EXPANSION_MODEL_IDS.includes(parsed.model)) return null;
    return {
      model: parsed.model,
      ...(Array.isArray(parsed.methods)
        ? {
            methods: parsed.methods.filter(
              (method): method is IntegratorId => typeof method === 'string'
            ) as IntegratorId[]
          }
        : {}),
      ...(typeof parsed.dt === 'number' ? { dt: parsed.dt } : {}),
      ...(typeof parsed.horizon === 'number' ? { horizon: parsed.horizon } : {}),
      ...(parsed.parameterOverrides && typeof parsed.parameterOverrides === 'object'
        ? { parameterOverrides: parsed.parameterOverrides as ExpansionParameterMap }
        : {})
    };
  } catch {
    return null;
  }
}

export function expansionPreset(id: string): ExpansionPreset {
  const preset = EXPANSION_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`unknown expansion preset: ${id}`);
  return preset;
}

export function configFromPreset(id: string): ExpansionSuiteConfig {
  const preset = expansionPreset(id);
  return {
    ...preset.config,
    parameterOverrides: { ...(preset.config.parameterOverrides ?? {}) },
    ...(preset.config.initialState === undefined ? {} : { initialState: [...preset.config.initialState] }),
    ...(preset.config.methods === undefined ? {} : { methods: [...preset.config.methods] })
  };
}

export function buildExpansionReport(result: ExpansionSuiteResult): string {
  const rows = result.rows
    .map(
      (row) =>
        `| ${row.method} | ${row.stable ? 'yes' : 'no'} | ${row.energyDrift.toExponential(3)} | ${row.referenceDivergence.toExponential(3)} | ${row.stepsPerMs.toFixed(1)} |`
    )
    .join('\n');
  const params = Object.entries(result.parameters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  const definition = expansionModelDefinition(result.model);
  return [
    `# Pendulum Expansion Report`,
    ``,
    `Model: ${result.modelLabel}`,
    `Family: ${result.family}`,
    `Hash: ${result.manifest.hash}`,
    `Generated: ${result.generatedAt}`,
    ``,
    `## Model`,
    definition.equation,
    ``,
    `Energy: ${definition.energyNote}`,
    `Caveat: ${definition.caveat}`,
    ``,
    `## Parameters`,
    params,
    ``,
    `## Integrator Comparison`,
    `| Method | Stable | Energy drift | Ref divergence | Steps/ms |`,
    `|---|---:|---:|---:|---:|`,
    rows,
    ``,
    `## Summary`,
    `- Best method: ${result.summary.bestMethod}`,
    `- Best score: ${result.summary.bestScore}`,
    `- Stable methods: ${result.summary.stableMethods}/${result.rows.length}`,
    `- Energy shell span: ${result.summary.energyShellSpan.toExponential(3)}`,
    `- Max ghost divergence: ${result.summary.maxGhostDivergence.toExponential(3)}`,
    ``,
    `## Reproducibility`,
    `- dt: ${result.dt}`,
    `- horizon: ${result.horizon}`,
    `- initial state: [${result.initialState.join(', ')}]`,
    `- share: ${result.manifest.shareHash}`
  ].join('\n');
}

export function runGoldenExpansionChecks(
  presetIds: readonly string[] = GOLDEN_EXPANSION_PRESET_IDS
): GoldenExperimentResult[] {
  return presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    const result = runExpansionSuite({
      ...configFromPreset(presetId),
      methods: ['rk4', 'dopri5', 'leapfrog'],
      sampleLimit: 80,
      bifurcationColumns: 5
    });
    const conservativeLimit = result.conservative ? 0.08 : 1;
    const ok =
      result.summary.stableMethods >= 2 &&
      result.summary.energyShellSpan <= conservativeLimit &&
      Number.isFinite(result.summary.maxGhostDivergence);
    return {
      presetId,
      label: preset.label,
      ok,
      hash: result.manifest.hash,
      bestMethod: result.summary.bestMethod,
      energyShellSpan: result.summary.energyShellSpan,
      maxGhostDivergence: result.summary.maxGhostDivergence,
      reason: ok
        ? 'within golden thresholds'
        : `threshold miss: shell=${result.summary.energyShellSpan.toExponential(2)}, stable=${result.summary.stableMethods}`
    };
  });
}

export function runExpansionBatch(
  presetIds: readonly string[] = EXPANSION_PRESETS.map((preset) => preset.id)
): BatchExperimentResult[] {
  return presetIds.map((presetId) => {
    const preset = expansionPreset(presetId);
    return {
      presetId,
      label: preset.label,
      result: runExpansionSuite({
        ...configFromPreset(presetId),
        methods: ['rk4', 'dopri5', 'symplectic'],
        sampleLimit: 72,
        bifurcationColumns: 5
      })
    };
  });
}

// ===== Section: Suite Runners (runGoldenExpansionChecks, runExpansionBatch, runExpansionSuite) =

export function runExpansionSuite(
  config: ExpansionSuiteConfig,
  options: { includeLyapunov?: boolean; lyapunovProfiler?: ExpansionLyapunovProfiler } = {}
): ExpansionSuiteResult {
  const definition = expansionModelDefinition(config.model);
  const methods = [...(config.methods?.length ? config.methods : DEFAULT_EXPANSION_METHODS)];
  const dt = config.dt ?? definition.defaultDt;
  const horizon = config.horizon ?? definition.defaultHorizon;
  const steps = Math.max(10, Math.min(80_000, Math.round(horizon / dt)));
  const sampleLimit = Math.max(24, Math.min(600, Math.round(config.sampleLimit ?? 240)));
  const sampleStride = Math.max(1, Math.floor(steps / sampleLimit));
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const rows = methods.map((method) => simulateMethod(system, method, dt, steps, sampleStride));
  const reference = rows[0]!;
  for (const row of rows)
    row.referenceDivergence = row === reference ? 0 : stateDistance(row.finalState, reference.finalState);
  const best = rows.reduce(
    (acc, row) => (scoreRow(row, definition.conservative) > scoreRow(acc, definition.conservative) ? row : acc),
    rows[0]!
  );
  const primarySamples = best.samples.length > 0 ? best.samples : reference.samples;
  const ghost = ghostFrames(
    system,
    best.method,
    dt,
    Math.min(steps, Math.round(18 / dt)),
    sampleStride,
    config.ghostEpsilon ?? 1e-5
  );
  const profileLyapunov = options.lyapunovProfiler ?? expansionLyapunovProfile;
  const lyapunov = options.includeLyapunov ? profileLyapunov(config, { maxTimelinePoints: 120 }) : undefined;
  const maxGhostDivergence = Math.max(0, ...ghost.map((frame) => frame.divergence));
  const energyShellSpan = Math.max(0, ...rows.map((row) => row.energySpan));
  const createdAt = new Date().toISOString();
  const summary = {
    bestMethod: best.method,
    bestScore: Number(scoreRow(best, definition.conservative).toFixed(2)),
    stableMethods: rows.filter((row) => row.stable).length,
    maxGhostDivergence,
    energyShellSpan
  };
  const hashPayload = {
    model: config.model,
    parameters: system.parameters,
    initialState: Array.from(system.initialState),
    methods,
    dt,
    horizon,
    summary,
    rows: rows.map((row) => ({
      method: row.method,
      energyDrift: row.energyDrift,
      referenceDivergence: row.referenceDivergence,
      stable: row.stable
    }))
  };
  const hash = stableExperimentHash(hashPayload);
  return {
    schemaVersion: 'pendulum-expansion-suite/v1',
    generatedAt: createdAt,
    model: config.model,
    modelLabel: definition.label,
    family: definition.family,
    conservative: definition.conservative,
    parameters: system.parameters,
    initialState: Array.from(system.initialState),
    methods,
    referenceMethod: reference.method,
    dt,
    horizon,
    rows,
    phaseHeatmap: heatmapFromSamples(primarySamples),
    ghost,
    ...(lyapunov ? { lyapunov } : {}),
    bifurcation: bifurcationPreview({
      model: config.model,
      dt,
      horizon,
      bifurcationColumns: config.bifurcationColumns ?? 12,
      parameterOverrides: config.parameterOverrides ?? {},
      ...(config.initialState === undefined ? {} : { initialState: config.initialState })
    }),
    replay: primarySamples.map((sample) => sample.coordinates),
    summary,
    manifest: {
      schemaVersion: 'pendulum-expansion-manifest/v1',
      hash,
      shareHash: shareHash({ ...config, dt, horizon, methods }),
      createdAt
    }
  };
}
