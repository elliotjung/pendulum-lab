import type { AdvancedDiagnosticKind } from '../../adapters/analysis/advanced/contracts';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { AdvancedDiagnosticSettings } from '../../adapters/analysis/advanced/contracts';
import { ADVANCED_SETTING_RANGES, defaultAdvancedSettings } from '../../adapters/analysis/advanced/settings';

export const advancedFieldLabels: Record<string, string> = {
  coordinate: '관측 좌표 번호 (0부터)',
  transient: '제외할 과도 구간',
  stride: '기록 표본 선택 간격',
  maxSamples: '최대 사용 표본 수',
  dimension: '지연 임베딩 차원',
  delay: '임베딩 지연 (선택 표본)',
  targetRecurrenceRate: '목표 재귀율',
  theiler: 'Theiler 제외 창 (선택 표본)',
  lMin: '최소 대각선 길이',
  vMin: '최소 수직선 길이',
  blocks: '블록 불확실성 분할 수',
  radiusCount: '상관합 반경 수',
  fitLowFraction: '적합 구간 하한 비율',
  fitHighFraction: '적합 구간 상한 비율',
  qMin: 'q 범위 하한',
  qMax: 'q 범위 상한',
  qCount: 'q 표본 수',
  scaleCount: '상자 척도 수',
  coarseDivisor: '가장 거친 상자 분할 수',
  fineDivisor: '가장 미세한 상자 분할 수',
  source: '독립 1차원 benchmark 맵',
  mapParameter: '맵 매개변수',
  boxes: '기본 구간 상자 수',
  samplesPerBox: '상자당 맵 표본 수',
  iterations: '스펙트럼 최대 반복 수',
  tolerance: '스펙트럼 반복 허용오차',
  dt: '분석 적분 간격',
  count: '접선 방향 수 (0 = 전체)',
  renormEvery: 'QR 재규격화 간격 (step)',
  forwardTransient: '순방향 수렴 QR 구간 수',
  window: 'CLV 관측 QR 구간 수',
  backwardTransient: '역방향 수렴 QR 구간 수',
  seed: '접선 재현 seed',
  duration: '유한 관찰 기간',
  resolution: '기본 격자 해상도 (한 변)',
  rangeLow: '각도 범위 하한 (rad)',
  rangeHigh: '각도 범위 상한 (rad)',
  percentile: '능선 임계 백분위',
  margin: '능선 이웃 대비 FTLE 차이',
  boxSide: '엔트로피 상자 한 변 (셀)',
  radius: 'Wada 이웃 반경 (셀)',
  threshold: 'Wada 후보 판정 비율',
  convergenceTolerance: '해상도 간 후보 비율 허용차'
};

export const advancedAssumptions: Record<AdvancedDiagnosticKind, string> = {
  rqa: '기록된 한 좌표를 지연 임베딩합니다. 임베딩 차원·지연·재귀율·Theiler 창·관찰 길이를 바꾸어 견고성을 확인하세요. 조밀 행렬 비용은 표본 수의 제곱이며, 블록 간 범위는 독립 표본의 통계적 신뢰구간이 아닙니다.',
  'recurrence-network':
    '지연 임베딩의 재귀 행렬에서 자기 연결과 Theiler 창을 제외한 네트워크입니다. 차수·군집도·전이성은 threshold와 표본 척도에 의존합니다. 조밀 행렬과 삼각형·최단경로 비용 때문에 표본 상한을 적용합니다.',
  'correlation-dimension':
    '거리 쌍의 상관합과 log–log 적합으로 얻은 유한 표본 D₂ 추정입니다. Theiler 창으로 시간 이웃을 제외합니다. 적합 구간·임베딩 차원·표본 수를 바꾸어 plateau를 확인해야 하며 자동 기울기는 차원 증명이 아닙니다. 비용과 거리 저장은 O(N²)입니다.',
  multifractal:
    '지연 임베딩 점군의 상자 점유 확률을 사용합니다. q 범위와 상자 척도를 바꿔 일반화 차원과 특이성 스펙트럼의 민감도를 확인하세요. 음의 q는 희소 상자에 민감하며 유한 표본의 빈 상자는 측도 정보가 아닙니다. 비용은 표본·차원·척도·q 수와 함께 증가합니다.',
  'topological-entropy':
    '선택한 독립 1차원 tent/logistic benchmark 맵의 [0,1] 구간을 분석합니다. 현재 진자나 2차원 standard map의 엔트로피가 아닙니다. 구간 덮개의 기본·두 배 해상도를 비교하며 표본 덮개는 엄밀한 위상 엔트로피 인증이 아닙니다. 비용은 상자·상자당 표본·반복 수와 증가합니다.',
  'transfer-operator':
    '선택한 독립 1차원 tent/logistic benchmark 맵의 Ulam 확률 전이를 분석합니다. 현재 진자 궤적의 전이 연산자가 아닙니다. 기본·두 배 해상도와 표본 수를 비교하세요. 조밀 비대칭 고유해석 비용이 증가하며 스펙트럼 간격·혼합률은 유한 근사 진단입니다.',
  clv: '현재 초기조건과 native 매끄러운 연속 RHS를 별도 적분합니다. 순방향 QR과 역방향 수렴 구간이 충분해야 합니다. 퇴화 지수·좌표 척도·유한차분 오차에 민감하며 짧은 결과는 점근적 공변성을 보장하지 않습니다. 비용은 step·접선 차원, 메모리는 저장 QR 기록과 함께 증가합니다.',
  ftle: '현재 초기조건의 native 연속 흐름 상태전이 행렬에서 한 점의 FTLE를 구합니다. 적분 간격·기간·좌표 척도에 대한 수렴을 확인하세요. 단일 유한시간 신장률은 카오스나 수송 장벽의 증명이 아닙니다. 변분계 비용은 상태 차원의 제곱과 증가합니다.',
  'lcs-ridge':
    '무감쇠 이중진자의 θ₁–θ₂ 격자를 각 셀 정지 초기속도에서 별도로 적분합니다. 현재의 초기각·초기속도 실행과 다른 스캔입니다. FTLE 고값의 기하학적 능선 후보이며 물질 수송 장벽 LCS 인증이 아닙니다. 비용은 해상도²×적분 step이며 임계 백분위와 격자 민감도를 확인하세요.',
  basin:
    '무감쇠 이중진자의 θ₁–θ₂ 격자를 정지 초기속도로 스캔한 유한시간 반전/탈출 분류입니다. 점근적 attractor basin이 아닙니다. 현재 물성은 보존하며 초기각·속도는 명시한 격자로 대체합니다. 해상도²×관찰 step 비용이며 기간·격자·상자 크기에 민감합니다.',
  uncertainty:
    '무감쇠 이중진자의 정지 초기속도 반전 격자 경계를 상자 계수합니다. α=2−D는 유한 해상도 경계 척도 proxy이며 직접 교란 확률의 점근적 불확실성 지수나 신뢰구간이 아닙니다. 기간·해상도·적합 척도를 바꿔 확인하세요. 격자 생성 비용은 해상도²×관찰 step입니다.',
  wada: '무감쇠 이중진자의 정지 초기속도 반전 격자를 기본·1.5배·두 배의 세 해상도로 비교합니다. Wada 이웃 후보 비율의 안정성은 엄밀한 Wada 성질 증명이 아닙니다. radius·threshold·허용차·기간에 민감하고 세 label과 경계가 없으면 판정할 수 없습니다. 비용은 세 격자의 전체 셀 적분 합입니다.'
};

export function advancedFieldHint(key: string, timeUnit: string, coordinateUnit: string): string {
  const hints: Record<string, string> = {
    coordinate: `실제 기록 차원 이내의 정수입니다. 선택 좌표 단위: ${coordinateUnit}.`,
    transient: `기록 앞부분에서 제외할 ${timeUnit}입니다. 남은 표본 수를 확인하세요.`,
    stride: '정수 표본 간격입니다. 2이면 남은 기록의 두 번째마다 선택하며 자동 보간하지 않습니다.',
    maxSamples:
      '과도 구간·stride 뒤 처음 최대 N개 표본을 사용합니다. 실제 선택한 시각과 표본 수는 artifact에 보존합니다.',
    dimension: '동일한 한 좌표의 지연 임베딩 차원입니다. 차원과 지연에 따라 사용 가능한 점 수가 줄어듭니다.',
    delay: 'stride로 선택한 표본 사이의 정수 지연입니다. 실제 지연은 원래 기록 간격×stride×delay입니다.',
    targetRecurrenceRate: '0과 1 사이의 목표 비율입니다. 유한 거리 분포·동률 때문에 실제 재귀율은 다를 수 있습니다.',
    theiler: '가까운 시간 이웃을 제외하는 정수 창입니다. stride 적용 후 표본 단위입니다.',
    lMin: 'RQA 결정성에 포함할 대각선의 최소 정수 길이입니다.',
    vMin: 'RQA laminarity에 포함할 수직선의 최소 정수 길이입니다.',
    blocks: '시계열 연속 블록의 분할 수입니다. 블록 간 변동은 독립 표본 신뢰구간이 아닙니다.',
    fitLowFraction: '적합에 포함할 상관합 C(r)의 하한 비율입니다. 상한보다 작아야 합니다.',
    fitHighFraction:
      '적합에 포함할 상관합 C(r)의 상한 비율입니다. 표본 포화·희소 구간을 피하고 plateau를 직접 확인하세요.',
    radiusCount: '상관합 곡선의 로그 반경 표본 수입니다. 유한 거리 쌍을 사용합니다.',
    qMin: '일반화 차원의 q 범위 하한입니다. 음의 q는 적게 점유된 상자에 민감합니다.',
    qMax: 'q 범위 상한이며 하한보다 커야 합니다. 큰 q는 밀집 상자에 민감합니다.',
    qCount: '하한부터 상한까지의 q 표본 수입니다.',
    scaleCount: '일반화 차원 적합에 사용할 상자 척도 수입니다.',
    coarseDivisor: '점군 전체 범위를 나누는 가장 거친 분할 수입니다.',
    fineDivisor: '가장 미세한 분할 수이며 거친 분할 수보다 커야 합니다.',
    source: '명시적으로 선택한 독립 benchmark source입니다. 원래 진자의 운동방정식으로 해석하지 마세요.',
    mapParameter: 'tent: 0–2, f(x)=a·min(x,1−x). logistic: 0–4, f(x)=r·x·(1−x). 두 맵의 구간은 [0,1]입니다.',
    boxes: '기본 구간 분할 수입니다. 같은 설정의 두 배 해상도 결과도 계산합니다.',
    samplesPerBox: '각 구간 안에서 맵을 평가하는 결정론적 표본 수입니다.',
    iterations: '스펙트럼 반지름 반복의 최대 횟수입니다. 미수렴은 정확값 인증이 아닙니다.',
    tolerance: '스펙트럼 반복 종료 허용오차입니다. 공간·표본 해상도 오차와 별개입니다.',
    dt: `별도 native 진단의 적분 간격 (${timeUnit})입니다. 원래 실험 실행의 step과 구분하세요.`,
    duration: `별도 진단의 유한 관찰 기간 (${timeUnit})입니다. step·차원·격자 수에 따른 전체 작업 예산을 적용합니다.`,
    count: '접선 방향 수입니다. 0은 전체 상태 차원이며 실제 상태 차원 이하여야 합니다.',
    renormEvery: 'QR 재규격화를 수행하는 내부 적분 step 간격입니다.',
    forwardTransient:
      '순방향 QR 수렴 구간의 정수 개수입니다. 한 구간은 renormEvery×dt입니다. 짧으면 초기 기저 영향이 남습니다.',
    window: 'CLV 관측 QR 구간의 정수 개수입니다. 한 구간은 renormEvery×dt입니다.',
    backwardTransient:
      '역방향 재귀 수렴 QR 구간의 정수 개수이며 window보다 작아야 합니다. 한 구간은 renormEvery×dt입니다.',
    seed: '접선 초기 기저의 결정론적 seed입니다. 원 시스템의 잡음 seed와 구분합니다.',
    resolution: '각도 격자 한 변의 셀 수입니다. 전체 셀은 제곱으로 늘며 일부 도구는 두 배 해상도도 계산합니다.',
    rangeLow: 'θ₁과 θ₂에 함께 쓰는 스캔 하한 (rad)입니다. 현재 초기각 대신 적용합니다.',
    rangeHigh: 'θ₁과 θ₂에 함께 쓰는 스캔 상한 (rad)이며 하한보다 커야 합니다.',
    percentile: 'FTLE 고값 임계 백분위입니다. 값이 높아지면 더 높은 FTLE 셀만 후보가 됩니다.',
    margin: '인접 셀보다 커야 하는 최소 FTLE 차이 (s⁻¹)입니다. 셀 수가 아닌 신장률 차이입니다.',
    boxSide: 'basin entropy를 집계할 공간 상자 한 변의 정수 셀 수입니다.',
    radius: 'Wada 후보의 이웃 검사 반경이며 정수 셀 단위입니다.',
    threshold: 'Wada 후보를 분류할 이웃 basin 혼합 비율 기준입니다.',
    convergenceTolerance:
      '기본·1.5배·두 배 해상도의 후보 비율 차이에 허용할 절대 차이입니다. 수학적 수렴 보장은 아닙니다.'
  };
  return hints[key] ?? '유한한 설정값을 입력하고 아래의 검증 범위 안내를 확인하세요.';
}

/** One description source keeps visible unit/range/default help aligned with numerical validation. */
export function advancedSettingDescription(
  kind: AdvancedDiagnosticKind,
  settings: AdvancedDiagnosticSettings,
  key: string,
  timeUnit: string,
  coordinateUnit: string,
  experiment?: ExperimentStateV1
): string {
  const bounds = ADVANCED_SETTING_RANGES[key];
  const maximum =
    key === 'maxSamples' && kind === 'recurrence-network'
      ? 256
      : key === 'mapParameter' && settings.source === 'tent'
        ? 2
        : bounds?.[1];
  const minimum = key === 'resolution' && kind === 'wada' ? 16 : bounds?.[0];
  const range = bounds ? `범위 ${minimum}–${maximum}${bounds[2] ? ' 정수' : ''}. ` : '';
  return `${range}${advancedFieldHint(key, timeUnit, coordinateUnit)} 기본값 ${String(defaultAdvancedSettings(kind, experiment)[key])}.`;
}
