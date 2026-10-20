import {
  fromCanonicalDiscrete,
  toCanonicalDiscrete,
  validateDiscreteConfig,
  type DiscreteConfig,
  type DiscreteSample,
  type DiscreteSystemId
} from '../../adapters/physics/discrete';
import { parseExperiment, serializeExperiment } from '../../persistence';
import { parseContractJson } from '../../persistence/json';

export const DISCRETE_STORAGE_PREFIX = 'pendulum-product/discrete/v1/';
export const DISCRETE_IMPORT_MAX_BYTES = 256 * 1024;
export type DiscreteExportKind = 'retained-raw' | 'downsampled';
function checkedConfig(config: unknown): DiscreteConfig {
  const checked = validateDiscreteConfig(config);
  if (!checked.ok) throw new Error(checked.issues.map((issue) => issue.message).join(' '));
  return checked.value;
}
export function serializeDiscreteConfig(config: DiscreteConfig): string {
  const canonical = toCanonicalDiscrete(config);
  if (!canonical.ok) throw new Error(canonical.issues.map((issue) => issue.message).join(' '));
  const text = serializeExperiment(canonical.value);
  if (!text.ok) throw new Error(text.issues.map((issue) => issue.message).join(' '));
  return text.value;
}
export function parseDiscreteConfig(text: string, systemId: DiscreteSystemId): DiscreteConfig {
  if (new TextEncoder().encode(text).length > DISCRETE_IMPORT_MAX_BYTES)
    throw new Error('파일은 256 KiB 이하여야 합니다.');
  const parsed = parseContractJson(text);
  if (!parsed.ok) throw new Error(parsed.issues.map((issue) => issue.message).join(' '));
  // Continuation envelopes are closed and versioned so future data is never silently discarded.
  if (
    parsed.value &&
    typeof parsed.value === 'object' &&
    'schema' in parsed.value &&
    parsed.value.schema === 'pendulum-discrete-state/v1'
  ) {
    const envelope = parsed.value as Record<string, unknown>,
      keys = [
        'schema',
        'configuration',
        'restartConfiguration',
        'iteration',
        'relativeStep',
        'state',
        'wavefunction',
        'probability',
        'momentum',
        'norm',
        'normDrift',
        'meanSquareMomentum',
        'meanPhysicalMomentumSquared',
        'spectrum',
        'rawProjection',
        'automaticRenormalization',
        'retainedRecords',
        'sourceStrideIterations',
        'retention',
        'convention'
      ];
    if (Object.keys(envelope).length !== keys.length || Object.keys(envelope).some((key) => !keys.includes(key)))
      throw new Error('지원하지 않는 복소 상태 자료 필드입니다. 원본 파일을 보존하세요.');
    const config = checkedConfig(envelope.restartConfiguration),
      original = checkedConfig(envelope.configuration);
    if (config.systemId !== systemId) throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 열어 주세요.');
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
      finiteArray = (value: unknown): value is number[] =>
        Array.isArray(value) && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
    const relativeStep = envelope.relativeStep,
      iteration = envelope.iteration;
    if (
      typeof relativeStep !== 'number' ||
      !Number.isSafeInteger(relativeStep) ||
      relativeStep < 0 ||
      relativeStep > original.iterations ||
      typeof iteration !== 'number' ||
      !Number.isSafeInteger(iteration) ||
      iteration !== config.startIteration ||
      iteration !== original.startIteration + relativeStep ||
      envelope.rawProjection !== false ||
      envelope.automaticRenormalization !== false ||
      typeof envelope.retention !== 'string' ||
      typeof envelope.convention !== 'string' ||
      typeof envelope.retainedRecords !== 'number' ||
      !Number.isInteger(envelope.retainedRecords) ||
      envelope.retainedRecords < 1 ||
      typeof envelope.sourceStrideIterations !== 'number' ||
      !Number.isInteger(envelope.sourceStrideIterations) ||
      envelope.sourceStrideIterations < 1
    )
      throw new Error('복소 상태의 iteration·보존 규칙이 일치하지 않습니다.');
    for (const key of [
      'systemId',
      'parameters',
      'gridSize',
      'integratorId',
      'iterations',
      'sampleEvery',
      'matrix',
      'analyses',
      'provenance'
    ] as const)
      if (!same(config[key], original[key])) throw new Error('초기 설정과 재시작 설정의 모델 조건이 다릅니다.');
    if (
      !finiteArray(envelope.state) ||
      !finiteArray(envelope.probability) ||
      !finiteArray(envelope.momentum) ||
      !envelope.wavefunction ||
      typeof envelope.wavefunction !== 'object' ||
      Array.isArray(envelope.wavefunction)
    )
      throw new Error('복소 상태 배열이 유효하지 않습니다.');
    const wave = envelope.wavefunction as Record<string, unknown>;
    if (Object.keys(wave).length !== 2 || !finiteArray(wave.re) || !finiteArray(wave.im))
      throw new Error('복소 상태는 re·im 배열이어야 합니다.');
    const re = wave.re,
      im = wave.im;
    const quantum = config.systemId === 'system:quantum-kicked-rotor',
      map = config.systemId === 'system:standard-map';
    if (map ? !same(config.initialState, envelope.state) : !same(envelope.state, []))
      throw new Error('재시작 초기 상태가 결과 상태와 다릅니다.');
    if (
      quantum
        ? !same(config.wavefunction, wave) ||
          wave.re.length !== config.gridSize ||
          wave.im.length !== config.gridSize ||
          envelope.probability.length !== config.gridSize ||
          envelope.momentum.length !== config.gridSize
        : wave.re.length !== 0 ||
          wave.im.length !== 0 ||
          envelope.probability.length !== 0 ||
          envelope.momentum.length !== 0
    )
      throw new Error('재시작 복소 상태의 차원이 일치하지 않습니다.');
    const numbers = [envelope.norm, envelope.normDrift, envelope.meanSquareMomentum];
    if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value)))
      throw new Error('유한한 norm과 운동량 진단이 필요합니다.');
    if (quantum) {
      const expectedMomentum = Array.from({ length: config.gridSize }, (_, i) =>
        i < config.gridSize / 2 ? i : i - config.gridSize
      );
      if (!same(envelope.momentum, expectedMomentum)) throw new Error('native FFT 운동량 인덱스가 일치하지 않습니다.');
      const probabilities = re.map((real, i) => real ** 2 + im[i]! ** 2),
        norm = probabilities.reduce((sum, value) => sum + value, 0),
        mean =
          probabilities.reduce((sum, value, i) => sum + value * (envelope.momentum as number[])[i]! ** 2, 0) / norm;
      const close = (a: unknown, b: number) =>
        typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(b));
      if (
        envelope.probability.some((value, i) => !close(value, probabilities[i]!)) ||
        !close(envelope.norm, norm) ||
        !close(envelope.normDrift, Math.abs(norm - 1)) ||
        !close(envelope.meanSquareMomentum, mean) ||
        !close(envelope.meanPhysicalMomentumSquared, config.parameters.hbar! ** 2 * mean)
      )
        throw new Error('복소 상태와 확률·norm·운동량 진단이 일치하지 않습니다.');
    } else if (envelope.meanPhysicalMomentumSquared !== null)
      throw new Error('이 모델에는 양자 운동량 진단이 적용되지 않습니다.');
    if (envelope.spectrum !== null) {
      if (map || (quantum && config.gridSize > 8))
        throw new Error('현재 모델·격자에는 이 스펙트럼이 적용되지 않습니다.');
      const spectrum = envelope.spectrum as Record<string, unknown>;
      if (
        !spectrum ||
        typeof spectrum !== 'object' ||
        Object.keys(spectrum).length !== 5 ||
        !finiteArray(spectrum.phases) ||
        !finiteArray(spectrum.quasiEnergies) ||
        !Array.isArray(spectrum.eigenvalues) ||
        spectrum.phases.length !== config.gridSize ||
        spectrum.quasiEnergies.length !== config.gridSize ||
        spectrum.eigenvalues.length !== config.gridSize ||
        ![spectrum.unitarityDefect, spectrum.maxUnitCircleDrift].every(
          (value) => typeof value === 'number' && Number.isFinite(value)
        ) ||
        spectrum.eigenvalues.some(
          (value) =>
            !value ||
            typeof value !== 'object' ||
            Object.keys(value).length !== 2 ||
            !Object.entries(value).every(
              ([key, entry]) => ['re', 'im'].includes(key) && typeof entry === 'number' && Number.isFinite(entry)
            )
        )
      )
        throw new Error('raw 스펙트럼 자료가 유효하지 않습니다.');
    }
    if (config.systemId === 'system:unitary-floquet' && envelope.spectrum === null)
      throw new Error('Floquet 스펙트럼 자료가 없습니다.');
    return config;
  }
  const canonical = parseExperiment(text);
  if (!canonical.ok) throw new Error(canonical.issues.map((issue) => issue.message).join(' '));
  if (canonical.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 열어 주세요.');
  const config = fromCanonicalDiscrete(canonical.value);
  if (!config.ok) throw new Error(config.issues.map((issue) => issue.message).join(' '));
  return config.value;
}
export function saveDiscreteConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: DiscreteConfig): void {
  const key = `${DISCRETE_STORAGE_PREFIX}${config.systemId}`,
    original = storage.getItem(key);
  if (original !== null) parseDiscreteConfig(original, config.systemId);
  storage.setItem(key, serializeDiscreteConfig(config));
}
export function loadDiscreteConfig(storage: Pick<Storage, 'getItem'>, id: DiscreteSystemId): DiscreteConfig | null {
  const original = storage.getItem(`${DISCRETE_STORAGE_PREFIX}${id}`);
  return original === null ? null : parseDiscreteConfig(original, id);
}
export function downsampleDiscreteSamples<T>(samples: readonly T[], max = 121): readonly T[] {
  if (!Number.isInteger(max) || max < 2) throw new Error('축약 표본 한도는 2 이상이어야 합니다.');
  return samples.length <= max
    ? samples
    : Array.from({ length: max }, (_, i) => samples[Math.floor((i * (samples.length - 1)) / (max - 1))]!);
}
function validateSamples(samples: readonly DiscreteSample[], config: DiscreteConfig): void {
  if (!samples.length) throw new Error('기록한 표본이 필요합니다.');
  let previous = -Infinity;
  for (const sample of samples) {
    const numeric = [
      sample.step,
      sample.iteration,
      sample.theta,
      sample.p,
      sample.norm,
      sample.normDrift,
      sample.meanSquareMomentum,
      ...sample.state,
      ...sample.re,
      ...sample.im,
      ...sample.momentum,
      ...sample.probability
    ];
    if (
      !numeric.every(Number.isFinite) ||
      !Number.isSafeInteger(sample.iteration) ||
      !Number.isSafeInteger(sample.step) ||
      sample.step < 0 ||
      sample.step > config.iterations ||
      sample.iteration !== config.startIteration + sample.step ||
      sample.iteration < previous
    )
      throw new Error('유한한 iteration 순서의 표본이 필요합니다.');
    if (
      config.systemId === 'system:standard-map'
        ? sample.state.length !== 2
        : config.systemId === 'system:quantum-kicked-rotor' &&
          [sample.re, sample.im, sample.momentum, sample.probability].some(
            (values) => values.length !== config.gridSize
          )
    )
      throw new Error('표본의 상태 차원이 다릅니다.');
    if (
      config.systemId === 'system:standard-map'
        ? sample.theta !== sample.state[0] || sample.p !== sample.state[1]
        : sample.state.length !== 0
    )
      throw new Error('표본의 상태 성분이 일치하지 않습니다.');
    if (config.systemId === 'system:unitary-floquet' && !sample.spectrum)
      throw new Error('Floquet 스펙트럼 자료가 없습니다.');
    if (
      sample.spectrum &&
      ([sample.spectrum.phases, sample.spectrum.quasiEnergies, sample.spectrum.eigenvalues].some(
        (values) => values.length !== config.gridSize
      ) ||
        ![
          sample.spectrum.unitarityDefect,
          sample.spectrum.maxUnitCircleDrift,
          ...sample.spectrum.phases,
          ...sample.spectrum.quasiEnergies,
          ...sample.spectrum.eigenvalues.flatMap((value) => [value.re, value.im])
        ].every(Number.isFinite))
    )
      throw new Error('유한한 스펙트럼 진단이 필요합니다.');
    previous = sample.iteration;
  }
}
/** Raw means all retained observations; skipped iterations cannot be reconstructed by export. */
export function discreteTrajectoryCsv(
  samples: readonly DiscreteSample[],
  config: DiscreteConfig,
  kind: DiscreteExportKind = 'retained-raw',
  sourceStride = 1
): string {
  checkedConfig(config);
  validateSamples(samples, config);
  if (!Number.isInteger(sourceStride) || sourceStride < 1 || !['retained-raw', 'downsampled'].includes(kind))
    throw new Error('유효한 기록 간격과 내보내기 종류가 필요합니다.');
  const selected = kind === 'downsampled' ? downsampleDiscreteSamples(samples) : samples;
  const rows = [
    'data_kind,source_stride_iterations,iteration,relative_step,index,theta_rad_wrapped,p_unwrapped_normalized,momentum_index_m,psi_real,psi_imag,probability,norm_squared,norm_squared_drift,mean_m_squared,mean_p_squared_normalized,phase_rad,quasi_energy_normalized,unitarity_defect,unit_circle_drift'
  ];
  for (const sample of selected) {
    const count =
      config.systemId === 'system:standard-map'
        ? 1
        : config.systemId === 'system:unitary-floquet'
          ? (sample.spectrum?.phases.length ?? 0)
          : sample.re.length;
    for (let i = 0; i < count; i++) {
      const map = config.systemId === 'system:standard-map',
        quantum = config.systemId === 'system:quantum-kicked-rotor';
      const values: (number | string)[] = [
        kind,
        sourceStride,
        sample.iteration,
        sample.step,
        i,
        map ? sample.theta : '',
        map ? sample.p : '',
        quantum ? sample.momentum[i]! : '',
        quantum ? sample.re[i]! : '',
        quantum ? sample.im[i]! : '',
        quantum ? sample.probability[i]! : '',
        quantum ? sample.norm : '',
        quantum ? sample.normDrift : '',
        quantum ? sample.meanSquareMomentum : '',
        quantum ? config.parameters.hbar! ** 2 * sample.meanSquareMomentum : '',
        sample.spectrum?.phases[i] ?? '',
        sample.spectrum?.quasiEnergies[i] ?? '',
        sample.spectrum?.unitarityDefect ?? '',
        sample.spectrum?.maxUnitCircleDrift ?? ''
      ];
      rows.push(values.join(','));
    }
  }
  return `${rows.join('\r\n')}\r\n`;
}
export function discreteStateJson(
  config: DiscreteConfig,
  samples: readonly DiscreteSample[],
  sourceStride: number
): string {
  checkedConfig(config);
  validateSamples(samples, config);
  if (!Number.isInteger(sourceStride) || sourceStride < 1) throw new Error('유효한 기록 간격이 필요합니다.');
  const last = samples.at(-1)!,
    quantum = config.systemId === 'system:quantum-kicked-rotor';
  const restartConfiguration: DiscreteConfig = checkedConfig({
    ...config,
    startIteration: last.iteration,
    initialState: config.systemId === 'system:standard-map' ? [...last.state] : [],
    ...(quantum ? { wavefunction: { re: [...last.re], im: [...last.im] } } : {})
  });
  return JSON.stringify(
    {
      schema: 'pendulum-discrete-state/v1',
      configuration: config,
      restartConfiguration,
      iteration: last.iteration,
      relativeStep: last.step,
      state: last.state,
      wavefunction: { re: last.re, im: last.im },
      probability: last.probability,
      momentum: last.momentum,
      norm: last.norm,
      normDrift: last.normDrift,
      meanSquareMomentum: last.meanSquareMomentum,
      meanPhysicalMomentumSquared: quantum ? config.parameters.hbar! ** 2 * last.meanSquareMomentum : null,
      spectrum: last.spectrum ?? null,
      rawProjection: false,
      automaticRenormalization: false,
      retainedRecords: samples.length,
      sourceStrideIterations: sourceStride,
      retention:
        'All retained observations; current/final endpoint may be off stride. Unrecorded iterations are absent.',
      convention:
        'Standard map: theta wrapped, p unwrapped. QKR: centered integer m, p=hbar*m, norm is sum |psi|^2. Floquet epsilon=-hbar*phase/period on principal branch; no unit-circle projection.'
    },
    null,
    2
  );
}
