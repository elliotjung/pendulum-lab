import { doublePendulumFtleField } from '../../../../chaos/ftle';
import { extractFtleRidges } from '../../../../chaos/ftleRidge';
import { doublePendulumFlipBasin, basinEntropy, boundaryMask, boxCountingDimension } from '../../../../chaos/basin';
import type { LabelGrid } from '../../../../chaos/basin';
import { wadaConvergenceFromGrids, type WadaConvergenceOptions } from '../../../../chaos/wadaConvergence';
import { readDiagnosticConfiguration } from '../core/source-config';
import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';
import { numeric } from './settings';
import { advancedResult } from './result';

/** Legacy numColors is max(label)+1; actual distinct labels gate scientific interpretation. */
export function advancedWadaGridEvidence(
  grids: LabelGrid[],
  resolutions: number[],
  options: Pick<WadaConvergenceOptions, 'radius' | 'threshold' | 'convergenceTolerance'>,
  context: { dt: number; maxTime: number; range: [number, number] }
) {
  const native = wadaConvergenceFromGrids(grids, resolutions, options, context);
  const distinctColorCounts = grids.map((grid) => new Set(Array.from(grid.labels)).size);
  const informed = distinctColorCounts.every((count) => count >= 3) && native.boundaryCells.every((count) => count > 0);
  return {
    native,
    distinctColorCounts,
    productVerdict: informed ? native.verdict : 'insufficient-data',
    availabilityReason: informed ? null : 'fewer than three distinct labels or no boundary in at least one grid'
  };
}

export function runAdvancedGrid(request: AdvancedDiagnosticRequest): AdvancedDiagnosticResult {
  const source = readDiagnosticConfiguration(request.experiment);
  if (source.family !== 'planar' || source.config.systemId !== 'system:double')
    throw new RangeError('검증된 이중 진자 격자만 사용할 수 있습니다.');
  const params = source.config.parameters,
    s = request.settings,
    n = numeric(s, 'resolution');
  const range: [number, number] = [numeric(s, 'rangeLow'), numeric(s, 'rangeHigh')];
  const dt = numeric(s, 'dt'),
    duration = numeric(s, 'duration');
  const scan = {
    kind: 'independent-from-rest-grid',
    physicalParameters: params,
    gamma: 0,
    angleRange: range,
    initialVelocities: [0, 0],
    currentInitialConditionsUsed: false,
    dt,
    duration
  };
  const warnings = [
    '선택한 무감쇠 이중 진자의 질량·길이·g를 사용한 별도 초기각 격자입니다. 현재 초기각·속도·시작 시각을 사용하지 않고 두 속도를 0으로 고정합니다.',
    '격자·시간 간격·관찰 기간에 대한 해상도 수렴을 확인하세요. 유한 관찰의 반전 label은 인력권 또는 장기 attractor 인증이 아닙니다.'
  ];
  if (request.kind === 'wada') {
    const resolutions = [n, Math.ceil(1.5 * n), n * 2];
    const grids = resolutions.map((resolution) =>
      doublePendulumFlipBasin(params, { n: resolution, range, dt, maxTime: duration })
    );
    const evidence = advancedWadaGridEvidence(
      grids,
      resolutions,
      {
        radius: numeric(s, 'radius'),
        threshold: numeric(s, 'threshold'),
        convergenceTolerance: numeric(s, 'convergenceTolerance')
      },
      { dt, maxTime: duration, range }
    );
    const { native } = evidence;
    return advancedResult(
      request,
      `Wada 후보: ${evidence.productVerdict}`,
      native.resolutions.map((r, i) => [
        r,
        native.wadaFractions[i]!,
        native.boundaryCells[i]!,
        evidence.distinctColorCounts[i]!
      ]),
      {
        scan,
        ...evidence
      },
      [
        ...warnings,
        native.caveat,
        '고정된 cell 반경을 사용하므로 격자 세분화 시 물리적 이웃 반경도 변합니다. 세 해상도의 안정성은 Wada 성질의 증명이 아닙니다.'
      ]
    );
  }
  if (request.kind === 'lcs-ridge') {
    const field = doublePendulumFtleField(params, { n, range, dt, totalTime: duration });
    const ridges = extractFtleRidges(field.values, field.width, field.height, {
      percentile: numeric(s, 'percentile'),
      margin: numeric(s, 'margin')
    });
    const rows = Array.from(field.values, (value, i) => [
      range[0] + ((range[1] - range[0]) * (i % n)) / (n - 1),
      range[0] + ((range[1] - range[0]) * Math.floor(i / n)) / (n - 1),
      value,
      ridges.mask[i]!
    ]);
    return advancedResult(
      request,
      `FTLE ${n}×${n} · 능선 후보 ${ridges.ridgeCells}개`,
      rows,
      { scan, width: field.width, height: field.height, field, ridges },
      [
        ...warnings,
        ridges.caveat,
        '표시된 능선은 percentile·국소 최대 후보입니다. 물질 수송 장벽으로서의 LCS 인증이 아닙니다.'
      ]
    );
  }
  const grid = doublePendulumFlipBasin(params, { n, range, dt, maxTime: duration });
  if (request.kind === 'uncertainty') {
    const boundary = boundaryMask(grid),
      native = boxCountingDimension(boundary, n, n);
    const usable = native.points.length >= 3 && Number.isFinite(native.dimension),
      proxy = usable ? 2 - native.dimension : null;
    return advancedResult(
      request,
      proxy === null
        ? '경계 불확실성 척도: 유효한 스케일 부족'
        : `경계 불확실성 척도 2−D=${proxy.toPrecision(4)} (유한 격자 proxy)`,
      native.points.length ? native.points.map((p) => [p.epsilon, p.count]) : [[1, 0]],
      {
        scan,
        width: n,
        height: n,
        grid,
        boundary,
        native,
        uncertaintyExponentProxy: proxy,
        proxyCi95: usable ? [2 - native.ci95[1], 2 - native.ci95[0]] : null,
        availabilityReason: usable
          ? null
          : 'fewer than three nonempty boundary scales; dimension and uncertainty exponent are not identifiable',
        interpretation:
          '2-D from planar boundary box-counting under scaling assumptions; not directly measured uncertain-pair exponent'
      },
      [
        ...warnings,
        ...(usable
          ? []
          : [
              '경계가 없거나 비어 있지 않은 스케일이 3개 미만입니다. 추정값·CI는 null이며 native의 기본 dimension=0을 유효한 추정으로 해석하지 않습니다.'
            ]),
        '2−D는 평면 경계 box-counting 차원에서 얻은 조건부 proxy입니다. 초기조건 교란 쌍의 uncertainty exponent를 직접 측정한 값이 아닙니다. CI95는 유한 스케일 회귀의 slope 구간이며 표본·시간·격자 오차를 포함하지 않습니다.'
      ]
    );
  }
  const native = basinEntropy(grid, numeric(s, 'boxSide'));
  return advancedResult(
    request,
    `반전 영역 엔트로피 ${native.basinEntropy.toPrecision(4)} nat`,
    Array.from(grid.labels, (label, i) => [
      range[0] + ((range[1] - range[0]) * (i % n)) / (n - 1),
      range[0] + ((range[1] - range[0]) * Math.floor(i / n)) / (n - 1),
      label
    ]),
    {
      scan,
      width: n,
      height: n,
      grid,
      native,
      labelMeaning: ['first rod flips first', 'second rod flips first', 'neither flips within horizon']
    },
    [
      ...warnings,
      'labels: 0=첫째 봉 먼저 반전, 1=둘째 봉 먼저 반전, 2=관찰 기간 내 반전 없음. label 2를 별도 attractor로 해석하지 마세요. native ln2 boundary 진단은 이 유한 격자만으로 연속 경계의 fractality를 인증하지 않습니다.'
    ]
  );
}
