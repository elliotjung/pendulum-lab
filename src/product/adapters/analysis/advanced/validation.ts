import { validateExperimentState } from '../../../contracts/experiment-validation';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { createDiagnosticFlow, diagnosticFlowRejection, validateDiagnosticExperiment } from '../core/source';
import { assertUniform, selectedSignal, validateDiagnosticSeries } from '../core/validation';
import { readDiagnosticConfiguration } from '../core/source-config';
import type { DiagnosticSeries } from '../core/contracts';
import {
  ADVANCED_DIAGNOSTIC_LIMITS as limits,
  type AdvancedDiagnosticKind,
  type AdvancedDiagnosticRequest,
  type AdvancedDiagnosticSettings
} from './contracts';
import { numeric, validateAdvancedSettings } from './settings';

export const SERIES_DIAGNOSTICS: readonly AdvancedDiagnosticKind[] = [
  'rqa',
  'recurrence-network',
  'correlation-dimension',
  'multifractal'
];
export const GRID_DIAGNOSTICS: readonly AdvancedDiagnosticKind[] = ['lcs-ridge', 'basin', 'uncertainty', 'wada'];
/** Selection is explicit and preserved in settings: first maxSamples after transient and stride. */
export function advancedSignal(request: AdvancedDiagnosticRequest): { values: number[]; times: number[]; dt: number } {
  const signal = selectedSignal(request.series, request.settings);
  const count = numeric(request.settings, 'maxSamples');
  return { values: signal.values.slice(0, count), times: signal.times.slice(0, count), dt: signal.dt };
}
export function validateAdvancedDiagnosticRequest(request: AdvancedDiagnosticRequest): void {
  if (!request || typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.id))
    throw new RangeError('고급 진단 작업 ID가 유효하지 않습니다.');
  validateAdvancedSettings(request.kind, request.settings);
  const experiment = validateExperimentState(request.experiment);
  if (!experiment.ok)
    throw new RangeError(`실험 설정이 유효하지 않습니다: ${experiment.issues.map((x) => x.message).join(' ')}`);
  validateDiagnosticExperiment(request.experiment);
  validateDiagnosticSeries(request.series);
  const { kind, settings: s } = request;
  if (SERIES_DIAGNOSTICS.includes(kind)) {
    if (request.series.times.length < 16)
      throw new RangeError('시간 또는 반복 관측이 최소 16개 필요합니다. 먼저 시스템을 실행하세요.');
    const signal = advancedSignal(request);
    assertUniform(signal.times, signal.dt);
    const embedded = signal.values.length - (numeric(s, 'dimension') - 1) * numeric(s, 'delay');
    if (embedded < 10) throw new RangeError('과도 구간·stride·delay embedding 뒤 최소 10개 점이 필요합니다.');
    if (Math.max(...signal.values) === Math.min(...signal.values))
      throw new RangeError('상수 관측에는 기하·스케일링 진단을 적용할 수 없습니다. 다른 좌표나 구간을 선택하세요.');
    if ('theiler' in s && numeric(s, 'theiler') >= embedded - 2)
      throw new RangeError('Theiler 창이 너무 커서 독립 표본 쌍이 없습니다.');
    if (
      kind === 'rqa' &&
      Math.floor(signal.values.length / numeric(s, 'blocks')) < (numeric(s, 'dimension') - 1) * numeric(s, 'delay') + 2
    )
      throw new RangeError(
        'RQA 불확실성 block마다 embedding 뒤 최소 2개 점이 필요합니다. blocks 또는 delay를 줄이세요.'
      );
    return;
  }
  if (['topological-entropy', 'transfer-operator'].includes(kind)) return;
  if (GRID_DIAGNOSTICS.includes(kind)) {
    if (request.experiment.systemId !== 'system:double')
      throw new RangeError('이 격자 도구는 검증된 무감쇠 이중 진자 반전/FTLE 스캔 전용입니다.');
    const gamma = request.experiment.parameters.gamma;
    if (!gamma || gamma.kind !== 'scalar' || gamma.value !== 0)
      throw new RangeError('native 격자 도구는 gamma=0 전용입니다. 감쇠를 조용히 무시하지 않습니다.');
    const config = readDiagnosticConfiguration(request.experiment);
    if (config.family !== 'planar') throw new RangeError('이중 진자 격자 설정을 읽을 수 없습니다.');
    const p = config.config.parameters;
    const scale = numeric(s, 'dt') * Math.sqrt((p.g * (p.m1 + p.m2)) / (Math.min(p.m1, p.m2) * Math.min(p.l1, p.l2)));
    if (!Number.isFinite(scale) || scale > 0.1)
      throw new RangeError(
        '격자 적분의 무차원 step 안전 상한을 초과했습니다. dt를 줄이세요. 매우 다른 질량·짧은 길이·큰 g는 작은 dt가 필요합니다.'
      );
    const n = numeric(s, 'resolution'),
      steps = Math.ceil(numeric(s, 'duration') / numeric(s, 'dt'));
    const trajectories = kind === 'wada' ? n * n + Math.ceil(1.5 * n) ** 2 + 4 * n * n : n * n;
    if (!Number.isSafeInteger(steps) || trajectories * steps > limits.gridWork)
      throw new RangeError(`격자 계산은 총 ${limits.gridWork} 궤적 step 이하여야 합니다. 해상도·관찰 기간을 줄이세요.`);
    return;
  }
  const reason = diagnosticFlowRejection(request.experiment);
  if (reason) throw new RangeError(reason);
  const flow = createDiagnosticFlow(request.experiment),
    n = flow.initial.length;
  if (n > limits.tangentDimension) throw new RangeError(`접선 상태 차원은 ${limits.tangentDimension} 이하여야 합니다.`);
  const steps =
    kind === 'clv'
      ? (numeric(s, 'forwardTransient') + numeric(s, 'window')) * numeric(s, 'renormEvery')
      : Math.ceil(numeric(s, 'duration') / numeric(s, 'dt'));
  if (!Number.isSafeInteger(steps) || steps * n * n > limits.tangentWork)
    throw new RangeError(`접선 계산은 ${limits.tangentWork} step×차원² 이하여야 합니다.`);
  if (kind === 'clv' && numeric(s, 'count') > n) throw new RangeError('CLV 벡터 수는 실제 상태 차원 이하여야 합니다.');
  if (
    kind === 'clv' &&
    Math.min(numeric(s, 'window'), numeric(s, 'window') - numeric(s, 'backwardTransient') + 1) *
      (numeric(s, 'count') || n) >
      limits.samples
  )
    throw new RangeError(`CLV 출력 행은 ${limits.samples}개 이하여야 합니다. window 또는 벡터 수를 줄이세요.`);
}
export function advancedDiagnosticRejection(
  kind: AdvancedDiagnosticKind,
  experiment: ExperimentStateV1,
  series: DiagnosticSeries,
  settings: AdvancedDiagnosticSettings
): string | null {
  try {
    validateAdvancedDiagnosticRequest({ id: 'compatibility', kind, experiment, series, settings });
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : '고급 분석 입력을 사용할 수 없습니다.';
  }
}
