import { fitDoublePendulum } from '../../../../research/parameterEstimation';
import { toDoublePendulumObservation } from '../../../observations/index';
import { integrationStepCount } from '../../../../validation/numericalBudgets';
import { readDiagnosticConfiguration } from '../core/source-config';
import { PLANAR_FIELDS } from '../../physics/planar-schema';
import { INVERSE_LIMITS, type EstimateSettings, type InverseRequest, type InverseProgress } from './contracts';
import { finiteData } from './data';
export const ESTIMATE_WARNINGS = [
  '알려진 초기 각도·각속도와 고정 감쇠를 가정한 국소 최소제곱 추정입니다. 최적해·전역 유일성·식별 가능성을 보장하지 않습니다.',
  'native fitDoublePendulum은 각 관측 시각에 정확히 도달하도록 간격을 세분화한 RK4와 wrap된 각도 잔차를 사용합니다. 관측 시각이 고정 격자와 다르면 Lab 고정 step 궤적과 마지막 비율 step이 다를 수 있습니다.',
  '공분산·표준오차는 국소 선형화·독립 잔차 가정의 근사입니다. unavailable 값은 null이며 0 불확실성으로 해석하지 않습니다.'
] as const;

export function runEstimate(request: InverseRequest, settings: EstimateSettings, progress: InverseProgress) {
  const source = readDiagnosticConfiguration(request.experiment);
  if (source.family !== 'planar' || source.config.systemId !== 'system:double')
    throw new Error('이중진자 추정만 지원합니다.');
  const observation = toDoublePendulumObservation(settings.observation),
    c = source.config;
  if (observation.times.length < 3 || observation.times.length > INVERSE_LIMITS.observations)
    throw new Error('추정 관측은 3–1024개여야 합니다.');
  if (observation.times[0] !== 0)
    throw new Error('관측 시간축과 알려진 초기 상태는 t=0으로 정렬되어야 합니다. 시간 offset을 확인하세요.');
  let steps = 0,
    previous = 0;
  for (const time of observation.times) {
    steps += integrationStepCount(time - previous, c.step, '관측 매개변수 추정');
    previous = time;
  }
  // Accepted native LM steps can reduce lambda to 1e-15; x10 growth through 1e12
  // needs at most 29 evaluations (including floating-point endpoint slack). Use 30.
  const work = steps * ((settings.parameters.length + 30) * settings.maxIterations + settings.parameters.length + 1);
  if (steps > INVERSE_LIMITS.forwardSteps || work > INVERSE_LIMITS.work)
    throw new Error('추정의 전방 적분·Jacobian·damping 반복 예산을 넘습니다. 기간·표본·반복 수를 줄이세요.');
  progress({ fraction: null, work: 0 });
  const fit = fitDoublePendulum(
    observation,
    {
      initialState: c.initialState,
      base: { ...c.parameters },
      gamma: c.gamma,
      estimate: settings.parameters.map((p) => p.key),
      initialGuess: settings.parameters.map((p) => c.parameters[p.key]),
      dt: c.step
    },
    {
      maxIterations: settings.maxIterations,
      lowerBounds: settings.parameters.map((p) => p.min),
      upperBounds: settings.parameters.map((p) => p.max)
    }
  );
  const warnings = [...ESTIMATE_WARNINGS, ...settings.observation.warnings];
  if (!fit.converged)
    warnings.push(
      `추정이 수렴하지 않았습니다 (${fit.status}). 최선의 후보만 반환했으며 성공한 물성 복원으로 표시하지 않습니다.`
    );
  if (!fit.covariance.length)
    warnings.push(
      'Jacobian이 특이하여 공분산을 계산할 수 없습니다. 식별 불가능한 조합·짧은 관측·정지 궤적을 확인하세요.'
    );
  if (
    settings.parameters.some(
      (p, i) => Math.min(Math.abs(fit.parameters[i]! - p.min), Math.abs(fit.parameters[i]! - p.max)) < 1e-8
    )
  )
    warnings.push('추정값이 경계에 가깝습니다. 범위와 식별 가능성을 다시 확인하세요.');
  return {
    columns: ['매개변수 번호', '추정값', '최솟값', '최댓값'],
    units: ['1', '아래 매개변수 단위', '동일', '동일'],
    rows: settings.parameters.map((p, i) => [i + 1, fit.parameters[i]!, p.min, p.max]),
    details: [
      `native Levenberg–Marquardt / RK4; ${fit.status}; converged=${fit.converged}`,
      `RMSE ${fit.rmse} rad; cost ${fit.cost}; 반복 ${fit.iterations}; 자유도 ${fit.degreesOfFreedom}`,
      ...settings.parameters.map(
        (p, i) =>
          `${i + 1}. ${p.key} (${PLANAR_FIELDS.find((f) => f.id === p.key)!.unit}), 초기 추정 ${c.parameters[p.key]}, 표준오차 ${Number.isFinite(fit.standardErrors[i]) ? fit.standardErrors[i] : 'unavailable'}`
      )
    ],
    warnings,
    evaluations: fit.iterations,
    payload: finiteData({ fit, forwardStepsPerEvaluation: steps, estimatedWork: work })
  };
}
