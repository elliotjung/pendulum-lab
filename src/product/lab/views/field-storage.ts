import {
  fromCanonicalField,
  toCanonicalField,
  validateFieldConfig,
  FIELD_SYSTEM_IDS,
  type FieldConfig,
  type FieldSample,
  type FieldSystemId
} from '../../adapters/physics/field';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const FIELD_STORAGE_PREFIX = 'pendulum-product/field/v1/';
export const FIELD_IMPORT_MAX_BYTES = 256 * 1024;
export type FieldExportKind = 'retained-raw' | 'downsampled';
export const fieldTimeLabel = '정규화 시간 τ';

export function serializeFieldConfig(config: FieldConfig): string {
  const state = toCanonicalField(config);
  if (!state.ok) throw new Error(state.issues.map((entry) => entry.message).join(' '));
  const serialized = serializeExperiment(state.value);
  if (!serialized.ok) throw new Error(serialized.issues.map((entry) => entry.message).join(' '));
  return serialized.value;
}
export function parseFieldConfig(text: string, systemId: FieldSystemId): FieldConfig {
  if (new TextEncoder().encode(text).length > FIELD_IMPORT_MAX_BYTES)
    throw new Error('파일은 256 KiB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((entry) => entry.message).join(' '));
  if (state.value.systemId !== systemId) throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 열어 주세요.');
  const checked = fromCanonicalField(state.value);
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  return checked.value;
}
export function saveFieldConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: FieldConfig): void {
  const key = `${FIELD_STORAGE_PREFIX}${config.systemId}`;
  const original = storage.getItem(key);
  if (original !== null) parseFieldConfig(original, config.systemId);
  storage.setItem(key, serializeFieldConfig(config));
}
export function loadFieldConfig(storage: Pick<Storage, 'getItem'>, id: FieldSystemId): FieldConfig | null {
  const original = storage.getItem(`${FIELD_STORAGE_PREFIX}${id}`);
  return original === null ? null : parseFieldConfig(original, id);
}
/** Returns an endpoint-preserving subset of recorded samples, never inventing solver steps. */
export function downsampleFieldSamples<T>(samples: readonly T[], max = 121): readonly T[] {
  if (!Number.isInteger(max) || max < 2) throw new Error('축약 표본 한도는 2 이상이어야 합니다.');
  if (samples.length <= max) return samples;
  return Array.from({ length: max }, (_, i) => samples[Math.floor((i * (samples.length - 1)) / (max - 1))]!);
}
function checkedConfig(config: FieldConfig) {
  const checked = validateFieldConfig(config);
  if (!checked.ok || !(FIELD_SYSTEM_IDS as readonly string[]).includes(config.systemId))
    throw new Error('유효한 확률·격자·장 설정이 필요합니다.');
}
/** Export labels describe retained records separately from display downsampling and integration. */
export function fieldTrajectoryCsv(
  samples: readonly FieldSample[],
  config: FieldConfig,
  kind: FieldExportKind = 'retained-raw',
  sourceStride = 1
): string {
  checkedConfig(config);
  if (
    !samples.length ||
    !Number.isInteger(sourceStride) ||
    sourceStride < 1 ||
    !['retained-raw', 'downsampled'].includes(kind)
  )
    throw new Error('유효한 기록 표본과 내보내기 종류가 필요합니다.');
  const selected = kind === 'downsampled' ? downsampleFieldSamples(samples) : samples;
  const header = [
    'data_kind',
    'source_stride_steps',
    'time_normalized',
    'solver_step',
    'entity_index',
    'member_seed',
    'coordinate_normalized',
    'value_normalized',
    'rate_applicable_1',
    'rate_normalized',
    'mean_normalized',
    'variance_applicable_1',
    'variance_normalized',
    'energy_normalized'
  ];
  const rows = [header.join(',')];
  let previous = -Infinity;
  for (const sample of selected) {
    if (!Number.isFinite(sample.time) || sample.time < previous || !Number.isInteger(sample.step) || sample.step < 0)
      throw new Error('유한한 시간순 표본이 필요합니다.');
    const stochastic = config.systemId === 'system:langevin',
      n = stochastic ? config.ensemble.members : config.grid.points;
    if (
      sample.profile.length !== (stochastic ? 1 : n) ||
      (stochastic && sample.variance.length !== 1) ||
      (stochastic && sample.memberStates.length !== n)
    )
      throw new Error('표본의 격자·앙상블 차원이 다릅니다.');
    for (let i = 0; i < n; i++) {
      const value = stochastic ? sample.memberStates[i]![0]! : sample.profile[i]!,
        rate = stochastic ? sample.memberStates[i]![1]! : (sample.state[config.grid.points + i] ?? 0),
        seed = stochastic ? sample.ensemble.seeds[i]! : sample.ensemble.seeds[0]!,
        point = stochastic
          ? 0
          : config.systemId === 'system:lattice-fk-limit'
            ? i
            : (config.grid.length * i) / (config.grid.boundary === 'periodic' ? n : Math.max(1, n - 1)),
        mean = stochastic ? sample.profile[0]! : value,
        variance = stochastic ? sample.variance[0]! : 0;
      const rateApplicable = ['system:langevin', 'system:fput', 'system:sine-gordon'].includes(config.systemId) ? 1 : 0;
      const numbers = [
        sourceStride,
        sample.time,
        sample.step,
        i,
        seed,
        point,
        value,
        rateApplicable,
        rate,
        mean,
        stochastic ? 1 : 0,
        variance,
        sample.energy
      ];
      if (!numbers.every((entry) => typeof entry === 'number' && Number.isFinite(entry)))
        throw new Error('유한한 수치만 CSV로 내보낼 수 있습니다.');
      rows.push([kind, ...numbers].join(','));
    }
    previous = sample.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
export function fieldProvenanceJson(
  config: FieldConfig,
  samples: readonly FieldSample[],
  sourceStride: number
): string {
  checkedConfig(config);
  const last = samples.at(-1);
  if (!last) throw new Error('기록한 표본이 필요합니다.');
  const numeric = [
    last.time,
    last.step,
    last.energy,
    last.charge,
    last.gradNorm,
    last.iterations,
    ...last.state,
    ...last.profile,
    ...last.variance,
    ...last.mean,
    ...last.previousField,
    ...last.memberStates.flat(),
    ...last.ensemble.seeds
  ];
  if (!Number.isInteger(sourceStride) || sourceStride < 1 || !numeric.every(Number.isFinite))
    throw new Error('유한한 표본과 유효한 기록 간격이 필요합니다.');
  return JSON.stringify(
    {
      schema: 'pendulum-field-run-export/v1',
      configuration: config,
      ensemble: last.ensemble,
      memberSeeds: last.ensemble.seeds,
      recordedSamples: samples.length,
      sourceStrideSteps: sourceStride,
      sourceStrideConvention: 'Nominal scheduled stride. The current/final retained endpoint may be off stride.',
      firstTime: samples[0]!.time,
      lastTime: last.time,
      lastStep: last.step,
      units: 'normalized',
      coordinateMeaning:
        config.systemId === 'system:lattice-fk-limit' ? 'mode-index' : 'space-coordinate-or-zero-for-Langevin',
      rateConvention:
        config.systemId === 'system:sine-gordon'
          ? 'backward-time-difference-after-first-step'
          : 'native-state-rate; zero when rate_applicable_1=0',
      varianceConvention: 'n-1 sample variance for Langevin; zero when variance_applicable_1=0',
      retainedRaw: 'All records retained in memory; unrecorded intermediate solver steps are not included.',
      downsampled: 'At most 121 retained time records, with both endpoints.',
      solverState: last.state,
      memberStates: last.memberStates,
      continuation:
        'Replay from initial configuration and independent seeds. This artifact does not contain Gaussian sampler continuation state.',
      previousField: last.previousField,
      diagnostics: {
        charge: last.charge,
        gradNorm: last.gradNorm,
        converged: last.converged,
        iterations: last.iterations
      }
    },
    null,
    2
  );
}
