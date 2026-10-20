import { validateExperimentState } from '../../../contracts/experiment-validation';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import {
  CORE_DIAGNOSTIC_LIMITS as limits,
  type CoreDiagnosticKind,
  type CoreDiagnosticRequest,
  type CoreDiagnosticSettings,
  type DiagnosticSeries
} from './contracts';
import { numeric, validateCoreSettings } from './settings';
import { createDiagnosticFlow, diagnosticFlowRejection, validateDiagnosticExperiment } from './source';

export const FLOW_DIAGNOSTICS: readonly CoreDiagnosticKind[] = ['poincare', 'lyapunov', 'sali', 'fli', 'shadowing'];
export function validateDiagnosticSeries(series: DiagnosticSeries): void {
  if (
    !series ||
    !['s', 'iteration', 'normalized-time'].includes(series.axisUnit) ||
    !Array.isArray(series.labels) ||
    !Array.isArray(series.units) ||
    !Array.isArray(series.times) ||
    !Array.isArray(series.states) ||
    !Array.isArray(series.warnings)
  )
    throw new TypeError('기록된 진단 입력의 모양과 시간 단위를 확인하세요.');
  const n = series.labels.length,
    m = series.times.length;
  if (n > limits.dimension || m > limits.samples || n * m > limits.scalars)
    throw new RangeError(
      `관측 입력은 ${limits.samples}표본·${limits.dimension}좌표·${limits.scalars}상태값 이하여야 합니다. 기록 표본 간격을 늘려 다시 실행하세요.`
    );
  if (
    series.units.length !== n ||
    series.states.length !== m ||
    series.labels.some((x) => typeof x !== 'string' || !x || x.length > 100) ||
    series.units.some((x) => typeof x !== 'string' || !x || x.length > 100) ||
    series.warnings.some((x) => typeof x !== 'string' || x.length > 2000)
  )
    throw new RangeError('좌표 이름·단위와 기록 길이가 일치해야 합니다.');
  let previous = -Infinity;
  for (let i = 0; i < m; i++) {
    const time = series.times[i]!,
      state = series.states[i]!;
    if (
      !Number.isFinite(time) ||
      time <= previous ||
      !Array.isArray(state) ||
      state.length !== n ||
      Array.from(state).some((value) => typeof value !== 'number' || !Number.isFinite(value))
    )
      throw new RangeError('관측 시간은 엄격히 증가하며 모든 상태는 같은 차원의 유한한 수여야 합니다.');
    previous = time;
  }
  if (
    series.energy !== undefined &&
    (!Array.isArray(series.energy) ||
      series.energy.length !== m ||
      !series.energy.every(Number.isFinite) ||
      typeof series.energyUnit !== 'string' ||
      !series.energyUnit ||
      series.energyUnit.length > 100)
  )
    throw new RangeError('유한한 에너지 기록과 명시적인 에너지 단위가 필요합니다.');
}
export function selectedSignal(
  series: DiagnosticSeries,
  settings: CoreDiagnosticSettings
): { values: number[]; times: number[]; dt: number } {
  const coordinate = numeric(settings, 'coordinate');
  if (coordinate >= series.labels.length)
    throw new RangeError('선택한 관측 좌표가 없습니다. 좌표 번호와 기록을 확인하세요.');
  const first = series.times[0] ?? 0,
    transient = settings.transient === undefined ? 0 : numeric(settings, 'transient');
  const stride = settings.stride === undefined ? 1 : numeric(settings, 'stride');
  const indices = series.times
    .flatMap((time, index) => (time - first >= transient ? [index] : []))
    .filter((_, i) => i % stride === 0);
  const times = indices.map((i) => series.times[i]!);
  const values = indices.map((i) => series.states[i]![coordinate]!);
  const dt = times.length > 1 ? times[1]! - times[0]! : 0;
  return { values, times, dt };
}
export function assertUniform(times: readonly number[], dt: number): void {
  if (times.length < 4 || !(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('균일한 간격의 표본이 최소 4개 필요합니다. 실행 기간과 표본 간격을 확인하세요.');
  for (let i = 1; i < times.length; i++) {
    const tolerance = 1e-7 * dt + 64 * Number.EPSILON * Math.max(1, Math.abs(times[i]!), Math.abs(times[i - 1]!));
    if (Math.abs(times[i]! - times[i - 1]! - dt) > tolerance)
      throw new RangeError(
        '관측 시간 간격이 균일하지 않습니다. 마지막 짧은 step을 피하도록 기간을 표본 간격의 정수 배로 설정하세요. 자동 보간하지 않습니다.'
      );
  }
}
export function validateCoreDiagnosticRequest(request: CoreDiagnosticRequest): void {
  if (!request || typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.id))
    throw new RangeError('진단 작업 ID가 유효하지 않습니다.');
  validateCoreSettings(request.kind, request.settings);
  const experiment = validateExperimentState(request.experiment);
  if (!experiment.ok)
    throw new RangeError(`실험 설정이 유효하지 않습니다: ${experiment.issues.map((x) => x.message).join(' ')}`);
  validateDiagnosticExperiment(request.experiment);
  validateDiagnosticSeries(request.series);
  const s = request.settings,
    kind = request.kind;
  if (FLOW_DIAGNOSTICS.includes(kind)) {
    const rejection = diagnosticFlowRejection(request.experiment);
    if (rejection) throw new RangeError(rejection);
    const flow = createDiagnosticFlow(request.experiment),
      steps = Math.ceil(numeric(s, 'duration') / flow.dt),
      transient = s.transient === undefined ? 0 : Math.ceil(numeric(s, 'transient') / flow.dt);
    if (kind === 'sali' && flow.initial.length < 2)
      throw new RangeError(
        'SALI에는 독립적인 접선 방향이 두 개 필요합니다. 1차원 상태의 정렬을 혼돈 지표로 해석할 수 없습니다.'
      );
    if (!Number.isSafeInteger(steps + transient) || steps + transient > limits.steps)
      throw new RangeError(`분석 기간과 과도 구간의 합은 ${limits.steps} step 이하여야 합니다.`);
    if (kind === 'poincare' && numeric(s, 'coordinate') >= flow.initial.length)
      throw new RangeError('단면 좌표가 실제 모델 상태 차원을 벗어났습니다.');
    if (
      ['lyapunov', 'sali', 'fli'].includes(kind) &&
      (flow.initial.length > limits.tangentDimension ||
        (steps + transient) * flow.initial.length ** 2 > limits.tangentWork)
    )
      throw new RangeError('접선 계산 예산을 초과했습니다. 상태 차원 또는 분석·과도 기간을 줄이세요.');
    if (kind === 'lyapunov' && (numeric(s, 'renormEvery') > steps || numeric(s, 'count') > flow.initial.length))
      throw new RangeError('재규격화 간격은 측정 step 수 이하, 지수 수는 실제 상태 차원 이하여야 합니다.');
    if (kind === 'shadowing' && steps * (1 + 3 * numeric(s, 'referenceRatio')) * flow.initial.length > 10_000_000)
      throw new RangeError('참조 궤도 계산 예산을 초과했습니다. 기간 또는 참조 분할 비율을 줄이세요.');
    if (
      ['sali', 'fli', 'shadowing'].includes(kind) &&
      Math.ceil(steps / numeric(s, 'sampleEvery')) + 1 > limits.samples
    )
      throw new RangeError(`결과 표본이 ${limits.samples}개를 넘습니다. 결과 기록 간격 sampleEvery를 늘리세요.`);
    return;
  }
  if (request.series.times.length < 2) {
    if (
      ['system:lattice-fk-limit', 'system:frenkel-kontorova', 'system:unitary-floquet'].includes(
        request.experiment.systemId
      )
    )
      throw new RangeError(
        '시간 궤적이 없는 정적·스펙트럼 평가입니다. 이 결과에는 시간·위상·카오스 시계열 진단을 적용할 수 없습니다.'
      );
    throw new RangeError('기록된 시간 또는 반복 관측이 최소 2개 필요합니다. 먼저 시스템을 실행하세요.');
  }
  if (kind === 'energy') {
    if (!request.series.energy?.length)
      throw new RangeError('이 모델에는 물리적 의미와 단위를 갖춘 에너지 관측이 없습니다.');
    return;
  }
  const signal = selectedSignal(request.series, s);
  if (kind === 'phase' && numeric(s, 'phaseCoordinate') >= request.series.labels.length)
    throw new RangeError('두 번째 위상 좌표가 기록에 없습니다.');
  if (['fft', 'naff', 'zero-one'].includes(kind)) assertUniform(signal.times, signal.dt);
  if (kind === 'naff' && numeric(s, 'terms') > signal.values.length)
    throw new RangeError('NAFF 항 수는 사용 표본 수 이하여야 합니다.');
  if (kind === 'zero-one') {
    const ncut = Math.floor(signal.values.length * numeric(s, 'ncutFraction'));
    if (signal.values.length < 20 || ncut < 2)
      throw new RangeError(
        '0–1 검사는 최소 20표본과 두 개 이상의 지연을 요구합니다. 과도 구간·stride를 줄이거나 더 길게 기록하세요.'
      );
    if (signal.values.length * ncut * numeric(s, 'cSamples') > 30_000_000)
      throw new RangeError('0–1 계산 예산을 초과했습니다. stride를 늘리거나 주파수 수·지연 비율을 줄이세요.');
  }
}
export function coreDiagnosticRejection(
  kind: CoreDiagnosticKind,
  experiment: ExperimentStateV1,
  series: DiagnosticSeries,
  settings: CoreDiagnosticSettings
): string | null {
  try {
    validateCoreDiagnosticRequest({ id: 'compatibility', kind, experiment, series, settings });
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : '진단 입력을 사용할 수 없습니다.';
  }
}
