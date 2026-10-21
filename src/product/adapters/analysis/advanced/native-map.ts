import { topologicalEntropy1D } from '../../../../chaos/topologicalEntropy';
import { ulamTransitionMatrix1D, transferOperatorSpectrum, invariantMeasure } from '../../../../chaos/transferOperator';
import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';
import { numeric } from './settings';
import { advancedResult } from './result';

/** Named scalar benchmarks are independent inputs, never a projection of the selected physical model. */
export function runAdvancedMap(request: AdvancedDiagnosticRequest): AdvancedDiagnosticResult {
  const s = request.settings,
    p = numeric(s, 'mapParameter'),
    map = s.source === 'tent' ? (x: number) => p * Math.min(x, 1 - x) : (x: number) => p * x * (1 - x);
  const source = {
    kind: 'independent-scalar-benchmark',
    name: String(s.source),
    parameter: p,
    domain: [0, 1],
    formula: s.source === 'tent' ? 'p*min(x,1-x)' : 'p*x*(1-x)',
    physicalExperimentUsed: false
  };
  const resolutions = [numeric(s, 'boxes'), numeric(s, 'boxes') * 2];
  const warnings = [
    '이 결과는 선택한 실험 시스템의 분석이 아닙니다. 명시적으로 선택한 독립 1D 기준 맵을 [0,1]에서 계산합니다.',
    '두 유한 해상도의 차이는 민감도 확인이며 해상도 수렴의 증명이나 통계적 신뢰구간이 아닙니다.'
  ];
  if (request.kind === 'topological-entropy') {
    const outputs = resolutions.map((boxes) => ({
      boxes,
      ...topologicalEntropy1D(map, [0, 1], boxes, numeric(s, 'samplesPerBox'), {
        iterations: numeric(s, 'iterations'),
        tolerance: numeric(s, 'tolerance')
      })
    }));
    if (outputs.some((o) => !Number.isFinite(o.entropy)))
      throw new RangeError(
        '선택한 partition에 허용 전이가 없어 엔트로피가 −∞입니다. 이 유한 partition은 유한 엔트로피 추정값을 제공하지 않습니다.'
      );
    return advancedResult(
      request,
      `독립 ${s.source} 맵 위상 엔트로피 · 두 partition`,
      outputs.map((o) => [o.boxes, o.entropy, o.spectralRadius, o.iterations, Number(o.converged)]),
      { source, outputs, entropyDelta: Math.abs(outputs[1]!.entropy - outputs[0]!.entropy) },
      [
        ...warnings,
        '표본 덮개 행렬은 일반 partition에서 엄밀한 위상 엔트로피 인증이 아닙니다. 반복의 converged는 Perron 반복 정지만 뜻합니다.'
      ]
    );
  }
  const outputs = resolutions.map((boxes) => {
    const matrix = ulamTransitionMatrix1D(map, [0, 1], boxes, numeric(s, 'samplesPerBox'));
    for (let i = 0; i < boxes; i++)
      if (Math.abs(matrix.transition.slice(i * boxes, (i + 1) * boxes).reduce((a, b) => a + b, 0) - 1) > 1e-10)
        throw new RangeError('Ulam 행렬의 질량 보존 조건이 맞지 않습니다.');
    const spectrum = transferOperatorSpectrum(matrix.transition, boxes);
    return {
      matrix,
      spectrum: {
        ...spectrum,
        mixingRate: Number.isFinite(spectrum.mixingRate) ? spectrum.mixingRate : null,
        mixingRateReason: Number.isFinite(spectrum.mixingRate)
          ? null
          : 'subdominant modulus is zero; native -log(0) is +Infinity, no finite per-step rate'
      },
      invariantMeasure: invariantMeasure(matrix.transition, boxes)
    };
  });
  const rows = outputs.flatMap((o) =>
    o.spectrum.eigenvalues.map((z, i) => [o.matrix.boxes, i, z.re, z.im, o.spectrum.moduli[i]!])
  );
  return advancedResult(
    request,
    `독립 ${s.source} 맵 Ulam 스펙트럼 · 두 partition`,
    rows,
    {
      source,
      outputs,
      subdominantDelta: Math.abs(outputs[1]!.spectrum.subdominantModulus - outputs[0]!.spectrum.subdominantModulus)
    },
    [
      ...warnings,
      '고유값은 기존 비대칭 eigensolver의 근사입니다. mixing rate는 이 유한 Markov 근사에만 해당하며 실제 시스템의 혼합률 인증은 아닙니다. reducibility·partition·표본 수와 고유값 분해 잔차에 민감합니다.'
    ]
  );
}
