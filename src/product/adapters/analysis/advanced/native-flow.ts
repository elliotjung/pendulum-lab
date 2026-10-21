import { covariantLyapunovVectors } from '../../../../chaos/clv';
import { flowMapGradient, largestSingularValue } from '../../../../chaos/ftle';
import { jacobianTrustMetadata } from '../../../../chaos/variational';
import { createDiagnosticFlow } from '../core/source';
import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';
import { numeric } from './settings';
import { advancedResult } from './result';

export function runAdvancedFlow(request: AdvancedDiagnosticRequest): AdvancedDiagnosticResult {
  const flow = createDiagnosticFlow(request.experiment),
    s = request.settings;
  const warnings = [
    ...flow.warnings,
    '같은 native RHS를 별도로 RK4 적분한 접선 진단입니다. dt·기간·순/역방향 수렴과 좌표 척도에 대한 민감도를 확인하세요. 유한 시간 지표는 카오스의 증명이 아닙니다.'
  ];
  if (request.kind === 'ftle') {
    const gradient = flowMapGradient(
      flow.initial,
      flow.rhs,
      numeric(s, 'duration'),
      { dt: numeric(s, 'dt') },
      flow.rhs.jacobian
    );
    const maxMagnitude = Math.max(...Array.from(gradient.stm, Math.abs));
    if (maxMagnitude < 2.2250738585072014e-308)
      throw new RangeError(
        'FTLE 상태 전이 행렬이 0 또는 subnormal 범위로 underflow했습니다. 기간·dt·모델 척도를 바꾸세요. 유한 지수로 해석할 수 없습니다.'
      );
    const sigma = largestSingularValue(gradient.stm, gradient.n);
    if (!(sigma > 0) || !Number.isFinite(sigma))
      throw new RangeError('FTLE 최대 특이값의 유한 동적 범위를 벗어났습니다.');
    const native = {
      value: Math.log(sigma) / numeric(s, 'duration'),
      totalTime: numeric(s, 'duration'),
      dt: numeric(s, 'dt'),
      jacobianTrust: gradient.jacobianTrust
    };
    return advancedResult(
      request,
      `FTLE ${native.value.toPrecision(5)} / ${flow.timeUnit}`,
      [[native.totalTime, native.value]],
      { native, timeUnit: flow.timeUnit, initial: flow.initial },
      warnings
    );
  }
  const count = numeric(s, 'count') || flow.initial.length;
  const native = covariantLyapunovVectors(
    flow.initial,
    flow.rhs,
    count,
    {
      dt: numeric(s, 'dt'),
      renormEvery: numeric(s, 'renormEvery'),
      forwardTransient: numeric(s, 'forwardTransient'),
      window: numeric(s, 'window'),
      backwardTransient: numeric(s, 'backwardTransient'),
      seed: numeric(s, 'seed')
    },
    flow.rhs.jacobian
  );
  const hasAngles = Number.isFinite(native.meanHyperbolicityAngle) && Number.isFinite(native.minHyperbolicityAngle);
  const details = {
    ...native,
    meanHyperbolicityAngle: hasAngles ? native.meanHyperbolicityAngle : null,
    minHyperbolicityAngle: hasAngles ? native.minHyperbolicityAngle : null,
    angleAvailability: hasAngles
      ? 'finite expanding-contracting pairs'
      : 'no expanding-contracting pair at native finite-time zero tolerance; hyperbolicity angle is unavailable',
    jacobianTrust: jacobianTrustMetadata(flow.rhs, flow.rhs.jacobian),
    timeUnit: flow.timeUnit,
    initial: flow.initial,
    timeOrigin: 'relative to start of forward measurement window, after forwardTransient QR intervals'
  };
  return advancedResult(
    request,
    `CLV ${count}개 방향 · ${native.times.length}개 시점`,
    native.times.flatMap((t) => native.exponents.map((e, i) => [t, i, e])),
    details,
    [
      ...warnings,
      'CLV 부호는 임의입니다. 벡터를 비교할 때 sign-invariant 각도를 사용하세요. 기본 짧은 QR 구간은 계산 연결 확인용이며 asymptotic 수렴을 보장하지 않습니다.',
      ...(hasAngles
        ? []
        : [
            '유한 시간 지수에 expanding/contracting 쌍이 없어 hyperbolicity 각도는 null입니다. 0으로 대체하지 않습니다.'
          ])
    ]
  );
}
