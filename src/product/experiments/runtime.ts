import { MAX_LEARN_FOCUS_STEPS, MAX_LEARN_FOCUS_SECONDS, type FocusExperimentDefinition } from '../learn/schema';
import {
  PLANAR_FIELDS,
  defaultPlanarConfig,
  validatePlanarConfig,
  createPlanarSimulation,
  type PlanarConfig,
  type PlanarSample,
  type PlanarState,
  type PlanarSimulation
} from '../adapters/physics/planar';
import {
  createFocusDiagnostics,
  createFocusLinearReference,
  focusStateDistance,
  focusFiniteTimeRate,
  type FocusDiagnostics,
  type LinearMode,
  type FocusLinearReference
} from '../adapters/physics/focus-diagnostics';
import { issue, success, type ContractResult } from '../contracts/validation';
import type { AnalysisState } from '../contracts/experiment';

export const MAX_FOCUS_STEPS = MAX_LEARN_FOCUS_STEPS;
export const MAX_FOCUS_SECONDS = MAX_LEARN_FOCUS_SECONDS;
export const MAX_FOCUS_SAMPLES = 801;
export const FOCUS_NEARBY_OFFSET = 1e-6;
export type FocusStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
export interface FocusFrame {
  readonly sample: PlanarSample;
  readonly diagnostics: FocusDiagnostics;
  readonly linearState?: PlanarState;
  readonly nearbyState?: PlanarState;
  readonly distance?: number;
  readonly growthRate?: number | null;
}
export interface FocusSnapshot extends FocusFrame {
  readonly status: FocusStatus;
  readonly config: PlanarConfig;
  readonly series: readonly FocusFrame[];
  readonly modes?: readonly [LinearMode, LinearMode];
  readonly progress: number;
  readonly error: string | null;
}
export interface FocusRuntime {
  getSnapshot(): FocusSnapshot;
  subscribe(listener: (snapshot: FocusSnapshot) => void): () => void;
  setField(id: string, value: number): ContractResult<PlanarConfig>;
  setFields(values: Readonly<Record<string, number>>): ContractResult<PlanarConfig>;
  run(): void;
  cancel(): void;
  restart(): void;
  dispose(): void;
}
export interface FocusRuntimeOptions {
  /** Settings restored from this unit's canonical draft; fixed fields remain enforced. */
  config?: PlanarConfig;
  /** A scheduler must enqueue (never invoke synchronously) and return its cancel function. */
  schedule?: (callback: () => void) => () => void;
  /** Injectable engine boundary for deterministic scheduling/failure characterization. */
  simulationFactory?: (config: PlanarConfig) => PlanarSimulation;
}

function fieldValue(config: PlanarConfig, id: string): number | undefined {
  const index = ['theta1', 'theta2', 'omega1', 'omega2'].indexOf(id);
  if (index >= 0) return config.initialState[index];
  if (id === 'gamma' || id === 'step' || id === 'duration') return config[id];
  return config.parameters[id as keyof PlanarConfig['parameters']];
}

function withField(config: PlanarConfig, id: string, value: number): PlanarConfig {
  const index = ['theta1', 'theta2', 'omega1', 'omega2'].indexOf(id);
  if (index >= 0) {
    const state = [...config.initialState];
    state[index] = value;
    return { ...config, initialState: state as unknown as PlanarState };
  }
  if (id === 'gamma' || id === 'step' || id === 'duration') return { ...config, [id]: value };
  return { ...config, parameters: { ...config.parameters, [id]: value } };
}

/** Full preset coverage and fixed variables are checked again at the execution boundary. */
export function focusPresetConfig(definition: FocusExperimentDefinition): ContractResult<PlanarConfig> {
  if (definition.status !== 'ready' || definition.systemId !== 'system:double')
    return { ok: false, issues: [issue('unavailable-focus', '$', '실행 가능한 과정 1 전용 실험이 필요합니다.')] };
  const fields = definition.defaultPreset.fields;
  const ids = fields.map((field) => field.id);
  if (new Set(ids).size !== ids.length || PLANAR_FIELDS.some((field) => !ids.includes(field.id)))
    return {
      ok: false,
      issues: [issue('invalid-preset', '$', '모든 물성·초기조건·시간 설정을 한 번씩 선언해야 합니다.')]
    };
  let config = defaultPlanarConfig();
  for (const field of fields) {
    const meta = PLANAR_FIELDS.find((entry) => entry.id === field.id);
    if (!meta || meta.unit !== field.unit)
      return { ok: false, issues: [issue('invalid-field', '$', '전용 실험 변수 또는 SI 단위가 일치하지 않습니다.')] };
    config = withField(config, field.id, field.value);
  }
  config = {
    ...config,
    integratorId: definition.defaultPreset.integratorId as PlanarConfig['integratorId'],
    // The adapter's canonical validation below checks registry IDs and support.
    analyses: definition.analysisIds.map((id) => ({
      id: id as AnalysisState['id'],
      algorithmVersion: '1',
      settings: {}
    }))
  };
  return validateFocusConfig(definition, config);
}

export function validateFocusConfig(
  definition: FocusExperimentDefinition,
  input: unknown
): ContractResult<PlanarConfig> {
  const result = validatePlanarConfig(input);
  if (!result.ok) return result;
  const config = result.value;
  if (definition.status !== 'ready' || config.systemId !== 'system:double' || config.systemId !== definition.systemId)
    return {
      ok: false,
      issues: [issue('unsupported-focus', '$.systemId', '이 단원의 질점 이중진자 설정이 필요합니다.')]
    };
  if (config.duration > MAX_FOCUS_SECONDS || Math.ceil(config.duration / config.step) > MAX_FOCUS_STEPS)
    return {
      ok: false,
      issues: [
        issue(
          'focus-budget',
          '$.runtime',
          '전용 실험은 20초·20000 단계까지 실행합니다. 더 긴 실험은 실험실에서 계속하세요.'
        )
      ]
    };
  if (config.integratorId !== definition.defaultPreset.integratorId)
    return { ok: false, issues: [issue('fixed-integrator', '$.integrator', '단원에서 정한 적분기를 사용하세요.')] };
  const declaredFixed = new Set(definition.fixedFields.map((field) => field.id));
  if (
    definition.exposedFields.some((id) => declaredFixed.has(id)) ||
    declaredFixed.size !== definition.fixedFields.length ||
    new Set(definition.exposedFields).size !== definition.exposedFields.length ||
    definition.exposedFields.some((id) => !PLANAR_FIELDS.some((field) => field.id === id))
  )
    return {
      ok: false,
      issues: [issue('invalid-focus-fields', '$', '노출 변수와 고정 변수는 중복 없이 선언해야 합니다.')]
    };
  for (const field of definition.fixedFields) {
    const meta = PLANAR_FIELDS.find((entry) => entry.id === field.id);
    if (!meta || field.unit !== meta.unit || fieldValue(config, field.id) !== field.value)
      return {
        ok: false,
        issues: [issue('fixed-field', `$.${field.id}`, '단원에서 정한 고정값과 단위를 유지하세요.')]
      };
  }
  // Values hidden from the small inspector cannot silently drift during restore.
  for (const field of definition.defaultPreset.fields) {
    if (!definition.exposedFields.includes(field.id) && fieldValue(config, field.id) !== field.value)
      return {
        ok: false,
        issues: [
          issue(
            'hidden-field',
            `$.${field.id}`,
            '전용 실험에서 노출하지 않는 값이 다릅니다. 실험실에서 원본을 확인하세요.'
          )
        ]
      };
  }
  if (definition.kind === 'normal-modes' && (config.gamma !== 0 || config.parameters.g <= 0))
    return {
      ok: false,
      issues: [issue('linear-reference', '$', '정상모드 비교는 중력이 양수이고 감쇠가 없는 경우에 정의됩니다.')]
    };
  if (definition.kind === 'sensitivity' && config.initialState[0] + FOCUS_NEARBY_OFFSET > 1e6)
    return {
      ok: false,
      issues: [issue('nearby-boundary', '$.theta1', '이웃 초기조건도 유효 범위 안에 있도록 첫 각도를 줄이세요.')]
    };
  return success(config);
}

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(result.issues.map((entry) => entry.message).join('\n'));
  return result.value;
}

/** Small bounded, cancellable runs of the same S07 simulation used by Lab. */
export function createFocusRuntime(
  definition: FocusExperimentDefinition,
  options: FocusRuntimeOptions = {}
): FocusRuntime {
  const declaration = structuredClone(definition);
  const preset = unwrap(focusPresetConfig(declaration));
  let config = options.config === undefined ? preset : unwrap(validateFocusConfig(declaration, options.config));
  const factory = options.simulationFactory ?? createPlanarSimulation;
  const schedule =
    options.schedule ??
    ((callback: () => void) => {
      const timer = setTimeout(callback, 16);
      return () => clearTimeout(timer);
    });
  const listeners = new Set<(snapshot: FocusSnapshot) => void>();
  let simulation: PlanarSimulation;
  let nearby: PlanarSimulation | undefined;
  let linear: FocusLinearReference | undefined;
  let diagnostics: ReturnType<typeof createFocusDiagnostics>;
  let initialDistance = 0;
  let frame: FocusFrame;
  let series: FocusFrame[] = [];
  let status: FocusStatus = 'idle';
  let error: string | null = null;
  let cancelScheduled: (() => void) | undefined;
  let generation = 0;
  let disposed = false;
  let stride = 1;

  function makeFrame(
    sample: PlanarSample,
    runConfig: PlanarConfig,
    evaluate: ReturnType<typeof createFocusDiagnostics>,
    reference: FocusLinearReference | undefined,
    companion: PlanarSimulation | undefined,
    startDistance: number
  ): FocusFrame {
    // Step count avoids catastrophic subtraction at a large absolute start time.
    const elapsed = Math.min(sample.step * runConfig.step, runConfig.duration);
    const nearbyState = companion?.snapshot().state;
    const distance = nearbyState ? focusStateDistance(sample.state, nearbyState) : undefined;
    return {
      sample,
      diagnostics: evaluate(sample.state),
      ...(reference ? { linearState: reference.stateAt(elapsed) } : {}),
      ...(nearbyState
        ? { nearbyState, distance: distance!, growthRate: focusFiniteTimeRate(distance!, startDistance, elapsed) }
        : {})
    };
  }
  function buildFrame(sample: PlanarSample): FocusFrame {
    return makeFrame(sample, config, diagnostics, linear, nearby, initialDistance);
  }
  function initialize(nextConfig = config): void {
    // Prepare everything before accepting it; a failed edited preset must leave
    // the prior configuration, observation and running buffers intact.
    const nextSimulation = factory(nextConfig);
    const nextDiagnostics = createFocusDiagnostics(nextConfig);
    const nextLinear = declaration.kind === 'normal-modes' ? createFocusLinearReference(nextConfig) : undefined;
    const nextNearby =
      declaration.kind === 'sensitivity'
        ? factory({
            ...nextConfig,
            initialState: [
              nextConfig.initialState[0] + FOCUS_NEARBY_OFFSET,
              ...nextConfig.initialState.slice(1)
            ] as unknown as PlanarState
          })
        : undefined;
    const nextDistance = nextNearby ? focusStateDistance(nextConfig.initialState, nextNearby.snapshot().state) : 0;
    const nextFrame = makeFrame(
      nextSimulation.snapshot(),
      nextConfig,
      nextDiagnostics,
      nextLinear,
      nextNearby,
      nextDistance
    );
    config = nextConfig;
    simulation = nextSimulation;
    diagnostics = nextDiagnostics;
    linear = nextLinear;
    nearby = nextNearby;
    initialDistance = nextDistance;
    stride = Math.max(
      config.sampleEvery ?? 1,
      Math.ceil(Math.ceil(config.duration / config.step) / (MAX_FOCUS_SAMPLES - 1))
    );
    frame = nextFrame;
    series = [frame];
    status = 'idle';
    error = null;
  }
  function getSnapshot(): FocusSnapshot {
    return structuredClone({
      ...frame,
      config,
      series,
      status,
      error,
      progress: Math.min(1, (frame.sample.step * config.step) / config.duration),
      ...(linear ? { modes: linear.modes } : {})
    });
  }
  function notify(): void {
    if (!disposed) for (const listener of listeners) listener(getSnapshot());
  }
  function invalidate(): void {
    generation += 1;
    cancelScheduled?.();
    cancelScheduled = undefined;
  }
  function fail(reason: unknown): void {
    invalidate();
    status = 'error';
    error =
      reason instanceof Error
        ? reason.message.slice(0, 500)
        : '실험 계산에 실패했습니다. 설정을 확인하고 다시 시작하세요.';
    notify();
  }
  function enqueue(token: number): void {
    try {
      cancelScheduled = schedule(() => {
        if (disposed || token !== generation || status !== 'running') return;
        cancelScheduled = undefined;
        try {
          const began = performance.now();
          let count = 0;
          while (!simulation.done && count < 64 && performance.now() - began < 8) {
            const sample = simulation.step();
            nearby?.step();
            count += 1;
            if (sample.step % stride === 0 || simulation.done) {
              frame = buildFrame(sample);
              series.push(frame);
            }
          }
          frame = buildFrame(simulation.snapshot());
          if (simulation.done) status = 'completed';
          notify();
          if (status === 'running' && !disposed && token === generation) enqueue(token);
        } catch (reason) {
          fail(reason);
        }
      });
    } catch (reason) {
      fail(reason);
    }
  }
  initialize();
  function setFields(values: Readonly<Record<string, number>>): ContractResult<PlanarConfig> {
    if (disposed || status === 'running')
      return { ok: false, issues: [issue('focus-busy', '$', '실험을 취소한 뒤 값을 바꾸세요.')] };
    let nextConfig = config;
    for (const [id, value] of Object.entries(values)) {
      if (!declaration.exposedFields.includes(id))
        return { ok: false, issues: [issue('fixed-field', `$.${id}`, '이 변수는 단원에서 고정되어 있습니다.')] };
      nextConfig = withField(nextConfig, id, value);
    }
    const result = validateFocusConfig(declaration, nextConfig);
    if (!result.ok) return result;
    try {
      initialize(result.value);
    } catch (reason) {
      return {
        ok: false,
        issues: [
          issue('focus-evaluation', '$', reason instanceof Error ? reason.message : '초기 상태를 계산할 수 없습니다.')
        ]
      };
    }
    invalidate();
    notify();
    return success(structuredClone(config));
  }
  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setField: (id, value) => setFields({ [id]: value }),
    setFields,
    run() {
      if (disposed || status === 'running') return;
      invalidate();
      try {
        // Every run starts from its declared initial state, including after cancellation.
        initialize();
        status = 'running';
        notify();
        if (status === 'running' && !disposed) enqueue(generation);
      } catch (reason) {
        fail(reason);
      }
    },
    cancel() {
      if (disposed || status !== 'running') return;
      invalidate();
      status = 'cancelled';
      notify();
    },
    restart() {
      if (disposed) return;
      invalidate();
      try {
        initialize();
        notify();
      } catch (reason) {
        fail(reason);
      }
    },
    dispose() {
      invalidate();
      disposed = true;
      listeners.clear();
    }
  };
}
