import { lyapunovSpectrum } from '../../../../chaos/lyapunov';
import { saliIndicator, fliIndicator } from '../../../../chaos/indicators';
import { poincareSection } from '../../../../chaos/poincare';
import { shadowingHorizon } from '../../../../chaos/shadowing';
import type { Derivative } from '../../../../physics/types';
import type { IntegratorId } from '../../../../types/domain';
import type { CoreDiagnosticProgress, CoreDiagnosticRequest, CoreDiagnosticResult } from './contracts';
import { createDiagnosticFlow } from './source';
import { numeric } from './settings';
import { diagnosticResult } from './result';

export function runFlowDiagnostic(
  request: CoreDiagnosticRequest,
  progress: (value: CoreDiagnosticProgress) => void
): CoreDiagnosticResult {
  const flow = createDiagnosticFlow(request.experiment),
    { kind, settings: s } = request;
  const timeUnit = flow.timeUnit,
    exponentUnit = timeUnit === 's' ? 's⁻¹' : '1/normalized-time';
  const warnings = [...flow.warnings],
    dt = flow.dt,
    steps = Math.ceil(numeric(s, 'duration') / dt),
    transientSteps = s.transient === undefined ? 0 : Math.ceil(numeric(s, 'transient') / dt);
  let work = 0;
  const rhs: Derivative = (state, out) => {
    if (!Array.from(state).every(Number.isFinite)) throw new RangeError('분석 도중 비유한 입력 상태가 발생했습니다.');
    flow.rhs(state, out);
    if (!Array.from(out).every(Number.isFinite))
      throw new RangeError('분석 도중 비유한 도함수가 발생했습니다. 시간 간격과 초기조건을 확인하세요.');
    work++;
    if (work % 512 === 0) progress({ fraction: null, work, phase: 'calculating' });
  };
  // Preserve exact tangent provenance while observing work around the same native field.
  if (flow.rhs.jacobian) rhs.jacobian = flow.rhs.jacobian;
  if (flow.rhs.jacobianProvenance) rhs.jacobianProvenance = flow.rhs.jacobianProvenance;
  const rawMethod =
    request.experiment.integrator.kind === 'selectable'
      ? request.experiment.integrator.id.slice('integrator:'.length)
      : 'internal';
  const method: IntegratorId = ['euler', 'rk2', 'rk4'].includes(rawMethod) ? (rawMethod as IntegratorId) : 'rk4';
  warnings.push(
    '현재 실험의 원래 초기조건에서 별도 적분합니다. 기록된 궤적을 재사용하는 계산이 아닙니다. 실제 측정·과도 기간은 dt의 정수 배로 올림됩니다.'
  );
  warnings.push(
    '상태의 원래 좌표와 혼합 단위에 대한 유클리드 접선/최대 좌표 거리입니다. 좌표·단위 스케일을 바꾸면 유한시간 결과가 달라질 수 있습니다.'
  );
  if (rawMethod !== method)
    warnings.push(
      `이 진단은 ${rawMethod} 대신 독립 RK4를 사용합니다. 시스템의 native 실행과 수치 적분 결과가 다를 수 있습니다.`
    );
  let result: CoreDiagnosticResult;
  if (kind === 'poincare') {
    const coordinate = numeric(s, 'coordinate');
    const data = poincareSection(flow.initial, rhs, {
      dt,
      maxTime: numeric(s, 'duration'),
      section: (state) => state[coordinate]! - numeric(s, 'sectionValue'),
      direction: s.direction as 'rising' | 'falling' | 'both',
      transientCrossings: numeric(s, 'transientCrossings'),
      maxPoints: numeric(s, 'maxPoints'),
      rootTol: 1e-9
    });
    const projected = flow.initial.length > 1 ? (coordinate + 1) % flow.initial.length : 0;
    warnings.push(
      '기존 RK4 사건 근 찾기를 사용합니다. 감기지 않은 절대 좌표 단면이며 root residual은 적분 궤적 전체 오차를 보증하지 않습니다.'
    );
    if (data.points.length === 0)
      warnings.push('설정한 기간과 방향에서 단면 교차가 없습니다. 기간·단면값·방향을 확인하세요.');
    if (data.points.length === s.maxPoints) warnings.push('최대 단면 점 수에 도달해 계산을 종료했습니다.');
    result = diagnosticResult(
      kind,
      `단면 교차 ${data.points.length}개 · RK4 근 정밀화`,
      ['교차 시간', `상태 ${projected}`],
      [timeUnit, request.series.units[projected] ?? 'native'],
      data.points.map((point, i) => [data.times[i]!, point[projected]!]),
      { ...data, points: data.points.map((p) => Array.from(p)), coordinate, projected },
      warnings,
      'chaos/poincare.poincareSection / rk4'
    );
  } else if (kind === 'lyapunov') {
    const count = numeric(s, 'count') === 0 ? flow.initial.length : numeric(s, 'count');
    const data = lyapunovSpectrum(flow.initial, rhs, count, {
      dt,
      steps,
      transientSteps,
      renormEvery: numeric(s, 'renormEvery'),
      seed: numeric(s, 'seed'),
      method
    });
    warnings.push(
      '유한시간 변분/QR 추정입니다. 양의 지수 하나는 카오스의 증명이 아니며 기간·dt·과도 구간·재규격화 간격 수렴을 확인하세요. SE는 통계적 지표로 적분·체계 오차를 포함하지 않습니다.'
    );
    warnings.push(
      data.jacobianTrust?.caveat ??
        '접선은 중앙 유한차분 Jacobian을 사용합니다. 차분 스케일과 시간 간격 민감도를 확인하세요.'
    );
    warnings.push(
      'native consistency의 합0/심플렉틱 쌍 검사는 정준 Hamiltonian 전제와 점근 수렴의 독립 검증이 필요합니다. 혼합 좌표·유한시간·추가 구동 위상에서 보존 에너지 여부만으로 이 전제를 인증하지 않습니다.'
    );
    result = diagnosticResult(
      kind,
      `λ = [${data.spectrum.map((x) => x.toPrecision(5)).join(', ')}] ${exponentUnit}`,
      ['지수 순서', 'Lyapunov 지수', 'SE', 'block SE'],
      ['1', exponentUnit, exponentUnit, exponentUnit],
      data.spectrum.map((x, i) => [i + 1, x, data.stdError[i]!, data.blockStdError[i]!]),
      { ...data, energyConservativeModel: flow.conservative, conservativeConsistencyApplicable: false },
      warnings,
      `chaos/lyapunov.lyapunovSpectrum / ${method}`
    );
  } else if (kind === 'sali' || kind === 'fli') {
    const options = { dt, steps, transientSteps, seed: numeric(s, 'seed'), sampleEvery: numeric(s, 'sampleEvery') };
    const data = kind === 'sali' ? saliIndicator(flow.initial, rhs, options) : fliIndicator(flow.initial, rhs, options);
    warnings.push(
      `기존 RK4 변분 적분의 유한시간 ${kind.toUpperCase()}입니다. 지표 하나로 카오스를 확정하지 마세요. 접선은 ${flow.rhs.jacobian ? '모델이 제공한 Jacobian' : '중앙 유한차분 Jacobian'}을 사용합니다.`
    );
    warnings.push(
      'native 시계열은 첫 step 뒤 값을 t=0으로 표기합니다. 원래 시간 convention을 보존하며 표시시간에 dt를 더하면 실제 측정 경과시간입니다.'
    );
    const value = 'finalSali' in data ? data.finalSali : data.fli;
    const rows =
      'finalSali' in data ? data.series.map((p) => [p.time, p.sali]) : data.series.map((p) => [p.time, p.fli]);
    result = diagnosticResult(
      kind,
      `${kind.toUpperCase()} = ${value.toPrecision(6)}`,
      ['native 측정 시간', kind.toUpperCase()],
      [timeUnit, '1'],
      rows,
      data,
      warnings,
      `chaos/indicators.${kind}Indicator / rk4`
    );
  } else if (kind === 'shadowing') {
    const data = shadowingHorizon(flow.initial, rhs, {
      dt,
      T: numeric(s, 'duration'),
      threshold: numeric(s, 'threshold'),
      method,
      referenceMethod: 'gbs',
      referenceDt: dt / numeric(s, 'referenceRatio'),
      sampleEvery: numeric(s, 'sampleEvery'),
      estimateReferenceUncertainty: true
    });
    const encodeHorizon = (value: number) => (value === Infinity ? null : value);
    const details = {
      ...data,
      horizon: encodeHorizon(data.horizon),
      possibleHorizon: encodeHorizon(data.possibleHorizon),
      certifiedHorizon: encodeHorizon(data.certifiedHorizon),
      nullHorizonMeaning: 'threshold-not-exceeded-within-observation-window'
    };
    warnings.push(
      '더 촘촘한 GBS 수치 참조와 비교합니다. 엄밀한 참 궤적·shadowing 정리의 보증이 아닙니다. 참조 불확실성 밴드는 두 참조 분할의 차이이며 엄밀한 상계가 아닙니다. null horizon은 측정 기간 내 초과 없음입니다.'
    );
    result = diagnosticResult(
      kind,
      data.horizon === Infinity
        ? '측정 기간 안에서 허용치를 넘지 않았습니다.'
        : `허용치 첫 초과 ${data.horizon.toPrecision(6)} ${timeUnit}`,
      ['시간', '궤도 차이', '참조 불확실성', '하한', '상한'],
      [timeUnit, 'native max norm', 'native max norm', 'native max norm', 'native max norm'],
      data.series.map((p) => [p.time, p.separation, p.referenceUncertainty, p.lowerBound, p.upperBound]),
      details,
      warnings,
      `chaos/shadowing.shadowingHorizon / ${method} vs gbs`
    );
  } else throw new RangeError('이 진단은 관측 시계열을 사용합니다.');
  progress({ fraction: 1, work, phase: 'complete' });
  return result;
}
