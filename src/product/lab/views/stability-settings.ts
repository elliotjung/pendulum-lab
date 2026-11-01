import type { ExperimentStateV1 } from '../../contracts/experiment';
import type {
  StabilityArtifact,
  StabilityKind,
  StabilityRestart,
  StabilitySettings
} from '../../adapters/analysis/stability/contracts';
import { STABILITY_SETTING_RANGES, defaultStabilitySettings } from '../../adapters/analysis/stability/settings';

export const stabilitySourceNames: Record<string, string> = {
  'current-driven': '현재 구동 진자 · 구동 주기 반환 맵',
  'fold-normal-form': '독립 fold 정규형 · x²−λ=0',
  'pitchfork-normal-form': '독립 pitchfork 정규형 · 대칭 깨짐',
  'delayed-logistic': '독립 지연 logistic 평면 맵',
  'sine-circle': '독립 sine-circle 원형 맵',
  'linear-oscillator': '독립 선형 감쇠 발진기'
};
export const stabilityFieldLabels: Record<string, string> = {
  source: '분석 대상',
  guess0: '초기 추정 · 첫 좌표',
  guess1: '초기 추정 · 둘째 좌표',
  tolerance: '해 탐색 잔차 허용오차',
  maxIterations: '해 탐색 최대 반복 수',
  stepsPerPeriod: '구동 한 주기의 적분 분할 수',
  period: '탐색 주기 · 구동 주기 배수',
  parameter: '추적 매개변수',
  start: '매개변수 시작값',
  end: '매개변수 끝값',
  points: '매개변수 표본 수',
  phaseCount: '위상 표본 수',
  intervals: 'Melnikov 수치 적분 구간 수',
  ds: '호길이 간격',
  steps: '가지 추적 단계 수',
  direction: '초기 추적 방향 (−1 또는 1)',
  epsilon: '분기 가지 초기 섭동',
  initialAmplitude: '불변 원 초기 진폭',
  collocation: '불변 원 표현 점 수',
  coupling: '원형 맵 결합 강도',
  iterations: '회전수 측정 반복 수',
  transient: '제외할 과도 반복 수',
  lockingTolerance: '회전수 잠김 허용오차',
  xParameter: '가로축 매개변수',
  yParameter: '세로축 매개변수',
  xLow: '가로축 범위 하한',
  xHigh: '가로축 범위 상한',
  yLow: '세로축 범위 하한',
  yHigh: '세로축 범위 상한',
  resolution: '격자 해상도 · 한 변',
  lyapunovSteps: '격자 셀당 Lyapunov 적분 단계',
  dt: '격자 분석 적분 간격 (s)',
  neutralBand: '중립으로 표시할 지수 절댓값 (s⁻¹)',
  linearFrequency: '선형 기준 발진기 각주파수 (rad/s)',
  linearDamping: '선형 기준 발진기 감쇠율 (s⁻¹)',
  criticalTolerance: '주기배가 승수 근접 허용오차'
};
export const stabilityParameterNames: Record<string, string> = {
  forcingAmplitude: '구동 각가속도 진폭 (rad/s²)',
  forcingFrequency: '구동 각주파수 (rad/s)',
  damping: '감쇠율 (s⁻¹)'
};
export const stabilityAssumptions: Record<StabilityKind, string> = {
  'fixed-point':
    '현재 구동 진자의 구동 한 주기 반환 맵에서 고정점을 찾습니다. 초기 추정 θ(rad)·ω(rad/s)를 조절하세요. 연속 흐름의 정지점과 다르며 유한 잔차와 선형 승수만으로 비선형 안정성을 증명하지 않습니다. 비용은 탐색 반복×주기 적분 분할 수와 증가합니다.',
  'periodic-shooting':
    '현재 구동 진자의 반환 맵을 지정한 주기 배수만큼 적용해 원래 상태로 돌아오는 해를 찾습니다. 낮은 주기의 해로 수렴할 수 있으므로 최소 주기 진단을 확인하세요. 비용은 주기 배수×반복×적분 분할 수입니다.',
  floquet:
    '현재 구동 진자의 주기궤도를 먼저 보정하고 물리적 두 상태 방향의 Floquet 승수를 계산합니다. 잔차와 시간 간격 수렴을 확인하세요. 단위원 근처 판정은 유한 정밀도에 민감하며 비용은 주기궤도 탐색과 변분 적분의 합입니다.',
  melnikov:
    '현재 구동 진자의 약감쇠·약구동 가정 아래 해석식과 수치 적분을 비교합니다. 영점은 1차 약섭동 진단이며 강한 구동의 카오스를 인증하지 않습니다. 비용은 위상 표본×적분 구간 수입니다.',
  continuation:
    '현재 구동 진자의 한 매개변수를 바꾸며 앞서 구한 주기점을 다음 초기 추정으로 사용합니다. 접힘점에서는 자연 매개변수법이 실패할 수 있습니다. 비용은 가지 표본마다 shooting과 Floquet 계산이며 실패한 단계와 잔차를 확인하세요.',
  'pseudo-arclength':
    '독립 fold 정규형 x²−λ=0의 가지를 호길이 예측·수정으로 추적합니다. 현재 진자 물성이나 궤적의 분기가 아닙니다. 접힘 통과를 시험하는 기준 문제이며 간격·잔차 수렴을 확인하세요. 비용은 가지 단계×Newton 반복입니다.',
  'branch-switch':
    '독립 pitchfork 정규형에서 대칭 가지를 벗어나는 초기 섭동을 사용합니다. 현재 진자의 주기배가나 임의 분기점의 가지 전환으로 해석하지 마세요. 두 가지의 잔차·분리와 epsilon 민감도를 확인하며 비용은 매개변수 표본×해 탐색 반복입니다.',
  'neimark-sacker':
    '독립 지연 logistic 평면 맵의 고정점 가지에서 복소 승수의 단위원 교차 후보를 찾습니다. 현재 진자의 결과가 아닙니다. 유한 매개변수 표본과 공명 근접성에 민감하며 비용은 가지 표본×고정점 탐색입니다.',
  torus:
    '독립 지연 logistic 평면 맵의 불변 원 후보를 추적합니다. 연속 흐름 torus의 단면에 대응하는 기준 문제입니다. 현재 진자의 torus 인증이 아니며 잔차·점 수·진폭 민감도를 확인하세요. 비용은 가지 표본×불변 원 점 수×보정 반복입니다.',
  'arnold-tongue':
    '독립 sine-circle 맵에서 결합 강도를 고정하고 회전수의 주파수 잠김을 스캔합니다. 현재 진자의 2매개변수 tongue 지도가 아닙니다. 유리수 근접은 유한 반복 판정이며 비용은 매개변수 표본×측정 반복입니다.',
  'codim-two':
    '현재 구동 진자의 두 매개변수 격자에서 유한시간 최대 Lyapunov 지수를 분류합니다. 분기곡선의 교차나 여차원 2 특이점 인증이 아닙니다. 기간·시간 간격·중립 범위를 바꾸어 확인하세요. 비용은 해상도²×각 셀 적분 단계입니다.'
};

export function stabilitySettingDescription(
  kind: StabilityKind,
  settings: StabilitySettings,
  key: string,
  experiment?: ExperimentStateV1
): string {
  const bounds = STABILITY_SETTING_RANGES[key];
  const linearPeriod = key === 'period' && settings.source === 'linear-oscillator';
  const range = bounds
    ? `범위 ${linearPeriod ? 0.001 : bounds[0]}–${linearPeriod ? 50 : bounds[1]}${bounds[2] && !linearPeriod ? ' 정수' : ''}. `
    : '';
  const hints: Record<string, string> = {
    source: '현재 실험과 독립 기준 문제를 구분합니다. 선택한 대상과 원 실험은 파일에 함께 보존합니다.',
    guess0:
      settings.source === 'current-driven'
        ? 'θ 초기 추정 (rad)입니다. 현재 초기각과 다른 탐색 시작점입니다.'
        : '선택한 정규형·맵의 무차원 첫 상태 추정입니다.',
    guess1:
      settings.source === 'current-driven'
        ? 'ω 초기 추정 (rad/s)입니다. 현재 초기속도와 다른 탐색 시작점입니다.'
        : '선택한 맵의 무차원 둘째 상태 초기 추정입니다.',
    tolerance: '해 방정식의 수치 잔차 허용오차이며 적분·모델 오차의 상계가 아닙니다.',
    maxIterations: '한 해 보정의 반복 상한입니다. 미수렴이면 초기 추정·매개변수 간격을 조절하세요.',
    stepsPerPeriod: '구동 주파수에서 계산한 한 주기를 이 정수만큼 분할합니다. 값을 늘려 수렴을 확인하세요.',
    period: linearPeriod
      ? '독립 선형 발진기의 관찰 주기 (s)입니다. 구동 주기 배수가 아닙니다.'
      : '구동 한 주기의 양의 정수 배수입니다. 주기를 크게 하면 계산량도 증가합니다.',
    parameter: '같은 이름의 현재 구동 진자 물리 매개변수만 변경합니다.',
    start: '선택한 대상의 매개변수 시작값입니다. 독립 기준 문제에서는 무차원입니다.',
    end: '선택한 대상의 매개변수 끝값입니다. 시작값과 함께 추적 방향을 정합니다.',
    points: '시작값과 끝값 사이의 매개변수 표본 수입니다.',
    phaseCount: '한 구동 위상 구간의 함수 표본 수입니다.',
    intervals: '수치 Melnikov 적분의 유한 구간 분할 수입니다. 해석식과의 차이를 비교하세요.',
    ds: '독립 fold 기준 문제의 상태·매개변수 공간에서 호길이 간격입니다.',
    steps: '예측·수정을 반복하는 가지 단계 수입니다.',
    direction: '−1 또는 1을 입력하세요. 시작 접선 방향을 정합니다.',
    epsilon: '대칭 가지에서 벗어나기 위한 무차원 섭동 크기입니다.',
    initialAmplitude: '독립 평면 맵의 무차원 초기 불변 원 반지름 추정입니다.',
    collocation: '불변 원을 표현하는 점 수입니다. 공간 해상도 수렴을 따로 확인하세요.',
    coupling: '독립 sine-circle 맵의 고정 무차원 결합 강도입니다.',
    iterations: '과도 구간 뒤 회전수 측정에 사용할 맵 반복 수입니다.',
    transient: '회전수 측정에서 제외할 초기 맵 반복 수입니다.',
    lockingTolerance: '추정 회전수와 검사 유리수 사이의 절댓값 허용차입니다.',
    xParameter: '가로축 물리 매개변수입니다. 세로축과 달라야 합니다.',
    yParameter: '세로축 물리 매개변수입니다. 가로축과 달라야 합니다.',
    xLow: `가로축 ${stabilityParameterNames[String(settings.xParameter)] ?? ''}의 하한입니다.`,
    xHigh: `가로축 ${stabilityParameterNames[String(settings.xParameter)] ?? ''}의 상한이며 하한보다 커야 합니다.`,
    yLow: `세로축 ${stabilityParameterNames[String(settings.yParameter)] ?? ''}의 하한입니다.`,
    yHigh: `세로축 ${stabilityParameterNames[String(settings.yParameter)] ?? ''}의 상한이며 하한보다 커야 합니다.`,
    resolution: '정사각 격자 한 변의 표본 수입니다. 전체 셀 수는 제곱으로 증가합니다.',
    lyapunovSteps: '각 격자 셀에서 사용하는 적분 단계 수입니다. 유한 관측 기간은 단계 수×dt입니다.',
    dt: '별도 안정성 지도 계산의 적분 간격 (s)입니다.',
    neutralBand: '유한시간 지수의 절댓값이 이 범위 이내이면 중립으로 표시합니다. 오차 보증은 아닙니다.',
    linearFrequency: '독립 선형 감쇠 발진기의 고유 각주파수 (rad/s)입니다.',
    linearDamping: '독립 선형 감쇠 발진기의 감쇠율 (s⁻¹)입니다.',
    criticalTolerance: '현재 구동 진자 주기 1 궤도의 승수가 −1에 가까운지 확인할 허용차입니다. 분기점 인증은 아닙니다.'
  };
  return `${range}${hints[key] ?? '유한한 설정값을 입력하세요.'} 기본값 ${String(defaultStabilitySettings(kind, experiment, String(settings.source))[key])}.`;
}

/** Resume only a real converged endpoint; failed attempts never become restart seeds. */
export function stabilityRestartFromArtifact(artifact: StabilityArtifact): StabilityRestart | null {
  if (!['continuation', 'pseudo-arclength', 'branch-switch', 'neimark-sacker'].includes(artifact.result.kind))
    return null;
  if (artifact.result.kind === 'branch-switch' && artifact.result.source !== 'pitchfork-normal-form') return null;
  const point = [...artifact.result.branch].reverse().find((candidate) => candidate.converged);
  if (!point) return null;
  const details = artifact.result.details;
  const rawDirection =
    details && typeof details === 'object' && !Array.isArray(details) ? details.restartDirection : undefined;
  if (artifact.result.kind === 'pseudo-arclength' && rawDirection !== 1 && rawDirection !== -1) return null;
  return {
    artifactId: artifact.artifactId,
    inputRunId: artifact.inputRunId,
    source: artifact.result.source,
    state: [...point.state],
    parameter: point.parameter,
    direction: rawDirection === -1 ? -1 : 1
  };
}

/** Compatible period-one tools share the same physical section and unchanged model. */
export function stabilityHandoffFromArtifact(artifact: StabilityArtifact): StabilityRestart | null {
  if (
    artifact.result.source !== 'current-driven' ||
    artifact.result.status !== 'converged' ||
    !['fixed-point', 'periodic-shooting', 'floquet'].includes(artifact.result.kind) ||
    artifact.request.settings.period !== 1
  )
    return null;
  const point = [...artifact.result.branch].reverse().find((candidate) => candidate.converged);
  if (!point) return null;
  return {
    artifactId: artifact.artifactId,
    inputRunId: artifact.inputRunId,
    source: 'current-driven',
    state: [...point.state],
    parameter: point.parameter,
    direction: 1
  };
}
