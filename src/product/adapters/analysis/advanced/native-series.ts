import { recurrenceQuantification, recurrenceMatrix, rqaBlockUncertainty } from '../../../../chaos/rqa';
import { recurrenceNetworkMetrics } from '../../../../chaos/recurrenceNetwork';
import { delayEmbed, correlationDimension } from '../../../../chaos/correlationDimension';
import { generalizedDimensions, singularitySpectrum } from '../../../../chaos/multifractal';
import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';
import { numeric } from './settings';
import { advancedSignal } from './validation';
import { advancedResult } from './result';

export function runAdvancedSeries(request: AdvancedDiagnosticRequest): AdvancedDiagnosticResult {
  const { settings: s, kind } = request,
    signal = advancedSignal(request),
    values = signal.values;
  const dimension = numeric(s, 'dimension'),
    delay = numeric(s, 'delay');
  const warnings = [
    ...request.series.warnings,
    `관측 좌표 ${s.coordinate}; 과도 구간 ${s.transient} ${request.series.axisUnit}; stride ${s.stride}; 이후 첫 최대 ${s.maxSamples}표본 중 ${values.length}개를 사용합니다. 자동 보간·좌표 정규화하지 않습니다.`,
    '유한 표본과 embedding·threshold·스케일 선택에 따른 추정입니다. 지표 하나는 카오스나 인력권 차원을 인증하지 않습니다.'
  ];
  const source = {
    coordinate: s.coordinate,
    label: request.series.labels[Number(s.coordinate)],
    unit: request.series.units[Number(s.coordinate)],
    selectedTimes: signal.times,
    dimension,
    delay,
    samples: values.length
  };
  if (kind === 'rqa' || kind === 'recurrence-network') {
    const options = {
      dimension,
      delay,
      targetRecurrenceRate: numeric(s, 'targetRecurrenceRate'),
      theiler: numeric(s, 'theiler')
    };
    if (kind === 'rqa') {
      const opts = { ...options, lMin: numeric(s, 'lMin'), vMin: numeric(s, 'vMin') },
        native = recurrenceQuantification(values, opts);
      const uncertainty = rqaBlockUncertainty(values, opts, numeric(s, 'blocks'));
      const plot = recurrenceMatrix(values, opts);
      return advancedResult(
        request,
        `RQA DET=${native.determinism.toPrecision(4)} · ε=${native.epsilon.toPrecision(4)}`,
        [
          [
            native.recurrenceRate,
            native.determinism,
            native.laminarity,
            native.longestDiagonal,
            native.divergence,
            native.meanDiagonal,
            native.entropy,
            native.trappingTime,
            native.epsilon,
            native.embeddedLength
          ]
        ],
        { source, native, uncertainty, matrix: plot.matrix, size: plot.size },
        [
          ...warnings,
          'block 표준오차는 연속 block 간 변동이며 독립 표본의 신뢰구간이나 전체 측정 불확실성이 아닙니다. native RQA의 Theiler 창은 대각선 통계에 적용됩니다.'
        ]
      );
    }
    const matrix = recurrenceMatrix(values, options);
    for (let i = 0; i < matrix.size; i++)
      for (let j = Math.max(0, i - options.theiler); j <= Math.min(matrix.size - 1, i + options.theiler); j++)
        matrix.matrix[i * matrix.size + j] = 0;
    const native = recurrenceNetworkMetrics(matrix.matrix, matrix.size);
    return advancedResult(
      request,
      `재귀 네트워크 ${native.nodes}개 점 · 밀도 ${native.density.toPrecision(4)}`,
      [
        [
          native.nodes,
          native.edges,
          native.density,
          native.meanDegree,
          native.maxDegree,
          native.degreeStd,
          native.clusteringCoefficient,
          native.transitivity,
          native.averagePathLength,
          native.largestComponent
        ]
      ],
      { source, native, epsilon: matrix.epsilon, matrix: matrix.matrix, size: matrix.size, theiler: options.theiler },
      [
        ...warnings,
        native.caveat,
        '자기 재귀 및 |i−j|≤Theiler 연결을 제외합니다. 평균 경로 길이는 최대 연결 성분 안에서 계산하며 고립점에서는 0입니다.'
      ]
    );
  }
  const points = delayEmbed(values, dimension, delay);
  if (kind === 'correlation-dimension') {
    const native = correlationDimension(points, {
      radiusCount: numeric(s, 'radiusCount'),
      fitLowFraction: numeric(s, 'fitLowFraction'),
      fitHighFraction: numeric(s, 'fitHighFraction'),
      theilerWindow: numeric(s, 'theiler')
    });
    if (!Number.isFinite(native.dimension))
      throw new RangeError('상관 차원 적합 구간이 퇴화했습니다. 표본·스케일 범위를 바꾸세요.');
    return advancedResult(
      request,
      `상관 차원 D₂=${native.dimension.toPrecision(4)} · R²=${native.rSquared.toPrecision(4)}`,
      native.radii.map((r, i) => [r, native.correlationSums[i]!]),
      { source, native },
      [
        ...warnings,
        'R²는 스케일 회귀의 적합도이며 통계적 신뢰도 또는 차원 포화 인증이 아닙니다. native 구현은 지정한 상관합 band의 점이 3개 미만이면 반경 격자 중간 1/3을 사용합니다.'
      ]
    );
  }
  const extent = Math.max(...values) - Math.min(...values),
    count = numeric(s, 'scaleCount');
  const coarse = extent / numeric(s, 'coarseDivisor'),
    fine = extent / numeric(s, 'fineDivisor');
  const boxSizes = Array.from({ length: count }, (_, i) =>
    Math.exp(Math.log(coarse) + ((Math.log(fine) - Math.log(coarse)) * i) / (count - 1))
  );
  const qs = Array.from(
    { length: numeric(s, 'qCount') },
    (_, i) => numeric(s, 'qMin') + ((numeric(s, 'qMax') - numeric(s, 'qMin')) * i) / (numeric(s, 'qCount') - 1)
  );
  const native = generalizedDimensions(points, { qs, boxSizes }),
    spectrum = singularitySpectrum(native);
  return advancedResult(
    request,
    '유한 점유 확률의 Rényi 차원·Legendre 스펙트럼',
    native.q.map((q, i) => [q, native.Dq[i]!, native.tau[i]!, spectrum.alpha[i]!, spectrum.f[i]!, native.rSquared[i]!]),
    { source, native, spectrum, boxSizes },
    [
      ...warnings,
      '빈 상자는 제외합니다. 음의 q는 희소한 점유 확률과 유한 표본 편향에 특히 민감합니다. f(α)는 유한 q 격자에서 차분한 Legendre 추정입니다.'
    ]
  );
}
