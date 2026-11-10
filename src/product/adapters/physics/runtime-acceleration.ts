import {
  compareEnsembleStatistics,
  ensembleGrid,
  ensembleStatistics,
  runDoublePendulumEnsemble,
  webgpuEnsembleStatistics,
  type EnsembleResult,
  type EnsembleStatistics,
  type EnsembleStatisticsComparison
} from '../../../runtime/gpuEnsemble';
import {
  runDoublePendulumEnsembleWasm,
  wasmEnsembleAvailable,
  type WasmEnsembleResult
} from '../../../runtime/wasmEnsemble';
import { buildNChainJacobianTapeWasm, wasmNChainAvailable, wasmSimdSupported } from '../../../runtime/wasmNChain';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { fields, invalid } from '../../contracts/contract-checks';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { canonicalJson, DATA_LIMITS, inspectSafeData, type JsonValue } from '../../persistence/safe-data';
import { fromCanonicalPlanar } from './planar';
import { fromCanonicalChain } from './chain';

export type RuntimeAccelerationSettings =
  | {
      readonly kind: 'double-ensemble';
      readonly dt: number;
      readonly steps: number;
      readonly gridSize: number;
      readonly angleRadius: number;
      readonly forceCpu: boolean;
    }
  | {
      readonly kind: 'chain-jacobian-tape';
      readonly dt: number;
      readonly renormEvery: number;
      readonly forwardTransient: number;
      readonly window: number;
      readonly forceCpu: boolean;
    };
export const RUNTIME_ENSEMBLE_DEFAULTS = Object.freeze({
  kind: 'double-ensemble',
  dt: 0.005,
  steps: 10,
  gridSize: 3,
  angleRadius: 0.001,
  forceCpu: false
} as const);
export const RUNTIME_TAPE_DEFAULTS = Object.freeze({
  kind: 'chain-jacobian-tape',
  dt: 0.005,
  renormEvery: 2,
  forwardTransient: 1,
  window: 4,
  forceCpu: false
} as const);
/** Each complete tape stays within the existing plain-data transport limit. */
export const RUNTIME_TAPE_MAX_SCALARS = DATA_LIMITS.array;
export interface RuntimeCapabilities {
  readonly webgpuApi: boolean;
  readonly webgpuAdapter: 'available' | 'unavailable' | 'error' | 'not-probed';
  readonly wasmEnsembleKernel: 'available' | 'unavailable' | 'not-probed';
  readonly wasmSimdSupported: boolean;
  readonly wasmNChainKernel: 'available' | 'unavailable' | 'not-probed';
}
type PlainStatistics = Omit<EnsembleStatistics, 'mean' | 'variance' | 'covariance'> & {
  readonly mean: readonly number[];
  readonly variance: readonly number[];
  readonly covariance: readonly number[];
};
type PlainEnsemble = Omit<EnsembleResult | WasmEnsembleResult, 'states'> & {
  readonly states: readonly number[];
  readonly statistics: PlainStatistics;
};
export interface RuntimeDifference {
  readonly elements: number;
  readonly maxAbsolute: number;
  readonly exactEqual: boolean;
}
interface RuntimeBase {
  readonly schema: 'pendulum-runtime-acceleration/v1';
  readonly algorithmVersion: 'native-backend-comparison-v1';
  readonly experiment: ExperimentStateV1;
  readonly capabilities: RuntimeCapabilities;
  readonly warnings: readonly string[];
  /** JSON has one zero representation; native input/output buffers remain unchanged. */
  readonly normalization: { readonly policy: 'finite-json-zero/v1'; readonly negativeZeroToZero: number };
}
export type RuntimeAccelerationResult = RuntimeBase &
  (
    | {
        readonly kind: 'double-ensemble';
        readonly settings: Extract<RuntimeAccelerationSettings, { kind: 'double-ensemble' }>;
        readonly initialStates: readonly number[];
        readonly source: {
          readonly gpu: 'runDoublePendulumEnsemble';
          readonly wasm: 'runDoublePendulumEnsembleWasm';
          readonly reduction: 'webgpuEnsembleStatistics';
        };
        readonly cpuOracle: PlainEnsemble;
        readonly gpu: PlainEnsemble;
        readonly wasm: PlainEnsemble;
        readonly gpuStateDifference: RuntimeDifference;
        readonly wasmStateDifference: RuntimeDifference;
        readonly gpuStatisticsComparison: EnsembleStatisticsComparison;
        readonly gpuReduction: null | {
          readonly statistics: PlainStatistics;
          readonly comparison: EnsembleStatisticsComparison;
        };
      }
    | {
        readonly kind: 'chain-jacobian-tape';
        readonly settings: Extract<RuntimeAccelerationSettings, { kind: 'chain-jacobian-tape' }>;
        readonly source: 'buildNChainJacobianTapeWasm';
        readonly backend: 'wasm-simd' | 'cpu';
        readonly abiVersion: number | null;
        readonly promoted: false;
        readonly caveat: string;
        readonly elapsedMs: number;
        readonly cpuElapsedMs: number;
        readonly tape: readonly number[];
        readonly cpuTape: readonly number[];
        readonly tapeDifference: RuntimeDifference;
      }
  );
function required<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(result.issues.map((entry) => `${entry.path}: ${entry.message}`).join(' '));
  return result.value;
}
function canonicalRuntimeResult(result: RuntimeAccelerationResult): RuntimeAccelerationResult {
  let negativeZeroToZero = 0;
  function copy(value: unknown): unknown {
    if (typeof value === 'number' && Object.is(value, -0)) {
      negativeZeroToZero++;
      return 0;
    }
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
    return value;
  }
  const cloned = copy(result) as RuntimeAccelerationResult;
  return {
    ...cloned,
    normalization: { policy: 'finite-json-zero/v1', negativeZeroToZero },
    warnings: [
      ...cloned.warnings,
      ...(negativeZeroToZero
        ? [
            `native 출력의 signed zero ${negativeZeroToZero}개를 JSON 숫자0으로 표현했습니다. 원래 native buffer와 입력은 변경하지 않았습니다.`
          ]
        : [])
    ]
  };
}
function range(value: unknown, min: number, max: number, path: string, issues: ContractIssue[], integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(issues, path, `${min}–${max}${integer ? ' 정수' : ''} 범위의 유한한 수가 필요합니다.`);
}
export function validateRuntimeAccelerationSettings(input: unknown): ContractResult<RuntimeAccelerationSettings> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [],
    value = safe.value;
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value.kind !== 'double-ensemble' && value.kind !== 'chain-jacobian-tape')
  )
    return {
      ok: false,
      issues: [
        issue('unsupported-runtime-kind', '$.kind', 'double-ensemble 또는 chain-jacobian-tape 진단을 선택하세요.')
      ]
    };
  fields(
    value,
    [
      'kind',
      'dt',
      'forceCpu',
      ...(value.kind === 'double-ensemble'
        ? ['steps', 'gridSize', 'angleRadius']
        : ['renormEvery', 'forwardTransient', 'window'])
    ],
    [],
    '$',
    issues
  );
  range(value.dt, 1e-6, 0.02, '$.dt', issues);
  if (typeof value.forceCpu !== 'boolean')
    invalid(issues, '$.forceCpu', 'CPU 전용 선택은 명시한 boolean이어야 합니다.');
  if (value.kind === 'double-ensemble') {
    range(value.steps, 1, 1000, '$.steps', issues, true);
    range(value.gridSize, 2, 8, '$.gridSize', issues, true);
    range(value.angleRadius, 0, 0.1, '$.angleRadius', issues);
    if (typeof value.steps === 'number' && typeof value.dt === 'number' && value.steps * value.dt > 1)
      invalid(issues, '$.steps', '단기 backend 비교는 최대1초입니다. 장시간 혼돈 궤적의 일치를 주장하지 않습니다.');
  } else {
    range(value.renormEvery, 1, 8, '$.renormEvery', issues, true);
    range(value.forwardTransient, 0, 32, '$.forwardTransient', issues, true);
    range(value.window, 1, 32, '$.window', issues, true);
  }
  return issues.length ? { ok: false, issues } : success(value as unknown as RuntimeAccelerationSettings);
}
async function capabilities(settings: RuntimeAccelerationSettings): Promise<RuntimeCapabilities> {
  const gpu =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  let adapter: RuntimeCapabilities['webgpuAdapter'] = 'not-probed';
  if (!settings.forceCpu && settings.kind === 'double-ensemble') {
    try {
      adapter =
        gpu && typeof gpu.requestAdapter === 'function' && (await gpu.requestAdapter()) ? 'available' : 'unavailable';
    } catch {
      adapter = 'error';
    }
  }
  return {
    webgpuApi: !!gpu,
    webgpuAdapter: adapter,
    wasmEnsembleKernel:
      settings.forceCpu || settings.kind !== 'double-ensemble'
        ? 'not-probed'
        : (await wasmEnsembleAvailable())
          ? 'available'
          : 'unavailable',
    wasmSimdSupported: wasmSimdSupported(),
    wasmNChainKernel:
      settings.forceCpu || settings.kind !== 'chain-jacobian-tape'
        ? 'not-probed'
        : (await wasmNChainAvailable())
          ? 'available'
          : 'unavailable'
  };
}
function statistics(value: EnsembleStatistics): PlainStatistics {
  return { ...value, mean: [...value.mean], variance: [...value.variance], covariance: [...value.covariance] };
}
function ensemble(value: EnsembleResult | WasmEnsembleResult): PlainEnsemble {
  if (![...value.states, value.elapsedMs].every(Number.isFinite) || value.elapsedMs < 0)
    throw new Error('native backend의 상태·실행 시간이 유한하지 않습니다. 완료 결과를 발행하지 않았습니다.');
  return { ...value, states: [...value.states], statistics: statistics(ensembleStatistics(value.states)) };
}
export function runtimeDifference(candidate: ArrayLike<number>, reference: ArrayLike<number>): RuntimeDifference {
  if (candidate.length !== reference.length) throw new Error('native backend 출력 차원이 CPU oracle과 다릅니다.');
  let maxAbsolute = 0;
  for (let i = 0; i < reference.length; i++) {
    if (!Number.isFinite(candidate[i]) || !Number.isFinite(reference[i]))
      throw new Error('비유한 native backend 비교 결과입니다.');
    maxAbsolute = Math.max(maxAbsolute, Math.abs(candidate[i]! - reference[i]!));
  }
  return { elements: candidate.length, maxAbsolute, exactEqual: maxAbsolute === 0 };
}
/** Opt-in independent native workloads. Returned backend, not API presence, identifies execution. */
export async function computeRuntimeAcceleration(
  experiment: unknown,
  input: unknown
): Promise<RuntimeAccelerationResult> {
  const settings = required(validateRuntimeAccelerationSettings(input)),
    safeExperiment = required(inspectSafeData(experiment)) as unknown as ExperimentStateV1,
    warnings = [
      '현재 적용된 초기 조건의 독립 workload입니다. 원래 run·선택 적분기·상태·시간을 변경하지 않습니다.',
      'API·adapter·kernel probe와 실제 반환 backend는 서로 다릅니다. WebGPU 경로는 소프트웨어 구현일 수도 있으며 물리 GPU·속도 향상을 인증하지 않습니다.',
      '실행 시간은 이 단일 작업의 관측값입니다. 반복 측정이나 보편적 성능 우위의 증거가 아닙니다.'
    ];
  if (settings.kind === 'double-ensemble') {
    const config = required(fromCanonicalPlanar(safeExperiment));
    if (config.systemId !== 'system:double')
      throw new Error('이 ensemble backend는 점질량 이중진자 native RK4만 지원합니다. 원래 모델을 바꾸지 않았습니다.');
    const initial = ensembleGrid(settings.gridSize, [-settings.angleRadius, settings.angleRadius]);
    for (let i = 0; i < initial.length; i += 4)
      for (let j = 0; j < 4; j++) initial[i + j] = initial[i + j]! + config.initialState[j]!;
    const options = { dt: settings.dt, steps: settings.steps },
      probed = await capabilities(settings),
      cpu = await runDoublePendulumEnsemble(config.parameters, initial, { ...options, forceCpu: true }, config.gamma),
      gpu = await runDoublePendulumEnsemble(
        config.parameters,
        initial,
        { ...options, forceCpu: settings.forceCpu },
        config.gamma
      ),
      wasm = await runDoublePendulumEnsembleWasm(config.parameters, config.gamma, initial, {
        ...options,
        forceCpu: settings.forceCpu
      }),
      cpuStats = ensembleStatistics(cpu.states),
      gpuStats = ensembleStatistics(gpu.states),
      reduction = settings.forceCpu || gpu.backend !== 'webgpu' ? null : await webgpuEnsembleStatistics(gpu.states);
    const result: RuntimeAccelerationResult = {
      schema: 'pendulum-runtime-acceleration/v1',
      algorithmVersion: 'native-backend-comparison-v1',
      normalization: { policy: 'finite-json-zero/v1', negativeZeroToZero: 0 },
      kind: 'double-ensemble',
      experiment: safeExperiment,
      settings,
      capabilities: probed,
      initialStates: [...initial],
      source: {
        gpu: 'runDoublePendulumEnsemble',
        wasm: 'runDoublePendulumEnsembleWasm',
        reduction: 'webgpuEnsembleStatistics'
      },
      cpuOracle: ensemble(cpu),
      gpu: ensemble(gpu),
      wasm: ensemble(wasm),
      gpuStateDifference: runtimeDifference(gpu.states, cpu.states),
      wasmStateDifference: runtimeDifference(wasm.states, cpu.states),
      gpuStatisticsComparison: compareEnsembleStatistics(gpuStats, cpuStats),
      gpuReduction: reduction
        ? { statistics: statistics(reduction), comparison: compareEnsembleStatistics(reduction, gpuStats) }
        : null,
      warnings: [
        ...warnings,
        '독립 RK4의 두 초기 각도에 지정한 반경의 정사각 격자를 더했습니다. 각속도는 원래 초기값을 유지합니다.',
        'WebGPU f32는 ensemble 통계용입니다. 개별 궤적 오차는 측정만 보고하며 궤적 등가를 판정하지 않습니다. 통계 비교는 기존 native compareEnsembleStatistics 기본 허용오차를 그대로 사용합니다.',
        'Wasm f64의 단기 CPU 차이는 측정값입니다. 장기 혼돈 궤적 등가나 보편적인 오차 한계를 선언하지 않습니다.',
        ...(gpu.backend === 'cpu'
          ? [
              'WebGPU 실행이 불가하거나 CPU 전용으로 선택하여 실제 CPU f64 fallback을 실행했습니다. GPU 통과로 기록하지 않습니다.'
            ]
          : []),
        ...(wasm.backend === 'cpu'
          ? [
              'Wasm 실행이 불가하거나 CPU 전용으로 선택하여 실제 CPU f64 fallback을 실행했습니다. Wasm 통과로 기록하지 않습니다.'
            ]
          : [])
      ]
    };
    const canonical = canonicalRuntimeResult(result);
    required(inspectSafeData(canonical));
    return canonical;
  }
  const config = required(fromCanonicalChain(safeExperiment)),
    n = config.parameters.masses.length,
    steps = (settings.forwardTransient + settings.window) * settings.renormEvery;
  if (n > 8 || steps * (2 * n) ** 3 > 2_000_000)
    throw new Error(
      'native Wasm SIMD 후보는 최대8개 링크·정해진 작업 상한 안에서만 비교합니다. 링크·window·transient를 줄이세요.'
    );
  if (steps * (2 * n) ** 2 > RUNTIME_TAPE_MAX_SCALARS)
    throw new Error(
      `각 backend의 완전한 tape는 최대${RUNTIME_TAPE_MAX_SCALARS} scalar입니다. window·transient·구간 단계를 줄이세요. 계산하거나 결과를 자르지 않았습니다.`
    );
  const probed = await capabilities(settings),
    nativeSettings = {
      dt: settings.dt,
      renormEvery: settings.renormEvery,
      forwardTransient: settings.forwardTransient,
      window: settings.window
    },
    cpu = await buildNChainJacobianTapeWasm(config.parameters, config.initialState, config.gamma, {
      ...nativeSettings,
      forceCpu: true
    }),
    candidate = await buildNChainJacobianTapeWasm(config.parameters, config.initialState, config.gamma, {
      ...nativeSettings,
      forceCpu: settings.forceCpu
    });
  const result: RuntimeAccelerationResult = {
    schema: 'pendulum-runtime-acceleration/v1',
    algorithmVersion: 'native-backend-comparison-v1',
    normalization: { policy: 'finite-json-zero/v1', negativeZeroToZero: 0 },
    kind: 'chain-jacobian-tape',
    experiment: safeExperiment,
    settings,
    capabilities: probed,
    source: 'buildNChainJacobianTapeWasm',
    backend: candidate.backend,
    abiVersion: candidate.abiVersion,
    promoted: candidate.promoted,
    caveat: candidate.caveat,
    elapsedMs: candidate.elapsedMs,
    cpuElapsedMs: cpu.elapsedMs,
    tape: [...candidate.tape],
    cpuTape: [...cpu.tape],
    tapeDifference: runtimeDifference(candidate.tape, cpu.tape),
    warnings: [
      ...warnings,
      'native N-chain Jacobian tape를 같은 실행의 CPU f64 oracle과 비교합니다. 후보의 promoted:false 상태·ABI·caveat를 유지합니다. 전체 CLV/FTLE나 성능 승격을 인증하지 않습니다.',
      ...(candidate.backend === 'cpu'
        ? ['SIMD 후보 대신 실제 CPU f64 fallback을 실행했습니다. SIMD 하드웨어 통과를 주장하지 않습니다.']
        : [])
    ]
  };
  const canonical = canonicalRuntimeResult(result);
  required(inspectSafeData(canonical));
  return canonical;
}
export function serializeRuntimeAcceleration(result: RuntimeAccelerationResult): string {
  return canonicalJson(required(inspectSafeData(result)) as JsonValue);
}
