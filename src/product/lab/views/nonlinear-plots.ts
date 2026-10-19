import { nonlinearStateFields, type NonlinearConfig, type NonlinearSample } from '../../adapters/physics/nonlinear';
import { nonlinearTimeLabel } from './nonlinear-storage';
import { createPlot } from './core-plots';

export type NonlinearPlotKind = 'state' | 'phase' | 'energy' | 'potential' | 'history' | 'friction' | 'stability';
export function nonlinearPlotKinds(config: NonlinearConfig): readonly (readonly [NonlinearPlotKind, string])[] {
  return [
    ['state', '상태 / 시간'],
    ['phase', config.systemId === 'system:van-der-pol' ? '한계 주기 · 위상공간' : '위상공간'],
    ['energy', '진단량 / 시간'],
    ...(['system:duffing', 'system:kapitza', 'system:friction'].includes(config.systemId)
      ? [
          [
            'potential',
            config.systemId === 'system:kapitza'
              ? '효과 퍼텐셜'
              : config.systemId === 'system:friction'
                ? '마찰력 비교 곡선'
                : '비선형 퍼텐셜'
          ] as const
        ]
      : []),
    ...(config.systemId === 'system:pyragas' ? [['history', '지연 이력'] as const] : []),
    ...(config.systemId === 'system:friction' ? [['friction', 'stick-slip 전이'] as const] : []),
    ...(config.systemId === 'system:mathieu' ? [['stability', 'Floquet 안정성'] as const] : [])
  ];
}

export function nonlinearPlotDescription(config: NonlinearConfig, kind: NonlinearPlotKind): string {
  if (kind === 'potential' && config.systemId === 'system:friction')
    return '속도에 대한 정칙화 Stribeck 마찰력 비교 곡선입니다. 실제 운동은 Coulomb 정지 마찰 complementarity 단계를 사용하며 이 곡선으로 적분하지 않습니다.';
  if (kind === 'potential')
    return config.systemId === 'system:kapitza'
      ? '고주파 평균화한 효과 퍼텐셜입니다. 실제 궤적은 빠른 지지점 가진을 직접 적분하며 평균화 근사의 유효성은 가진 진폭·주파수와 시간 간격에 달려 있습니다.'
      : '정규화된 보존 부분 V(x)=αx²/2+βx⁴/4입니다. 감쇠와 외력은 이 퍼텐셜에 포함되지 않습니다.';
  if (kind === 'phase')
    return config.systemId === 'system:van-der-pol'
      ? '기록한 정규화 변위와 속도의 위상공간입니다. 충분히 긴 관찰 시간과 과도응답 제거 후 한계 주기를 판단하세요. 짧은 궤적만으로 주기를 확정할 수 없습니다.'
      : '첫 좌표와 그 속도의 위상공간입니다. 축 단위는 모델의 좌표 정의를 따릅니다.';
  if (kind === 'history')
    return '현재 물리 시간에 대한 상대 지연 이력입니다. 음수는 과거, 0은 현재입니다. 실행에 쓰는 승인 이력은 그림 축약과 독립적으로 보존합니다.';
  if (kind === 'friction')
    return '모드 0=stick(정지), 1=slip(미끄럼), 2=smooth(정칙화)입니다. 전이 시간은 고정 격자의 관측값이며 정확한 연속시간 사건이 아닙니다. 잔차는 작업 공간 수치에서 확인하세요.';
  if (kind === 'stability')
    return '한 주기 monodromy의 최대 Floquet 승수 절댓값입니다. 1에 대한 분류에는 수치 허용오차가 적용됩니다. 작은 궤적이나 유한 시간 성장률을 안정성 증명으로 해석하지 마세요.';
  if (kind === 'energy')
    return '모델 고유 진단량입니다. 정규화된 모델은 단위 1이며, 물리 모델도 질량당 진단량일 수 있습니다. 외력·감쇠·지연 피드백이 있으면 보존량이 아닙니다.';
  return '기록한 동일 표본의 상태 시간 기록입니다. 정규화 시간은 실제 초와 같다고 가정할 수 없습니다.';
}

export function nonlinearTrajectoryPlot(
  document: Document,
  config: NonlinearConfig,
  samples: readonly NonlinearSample[],
  kind: NonlinearPlotKind,
  selected = 0
): SVGSVGElement {
  const fields = nonlinearStateFields(config.systemId),
    sample = samples.at(-1),
    index = Math.max(0, Math.min(fields.length - 1, selected)),
    field = fields[index]!;
  const series = (label: string, value: (sample: NonlinearSample) => number, color = '#075985') => ({
    label,
    color,
    points: samples.map((entry) => [entry.time, value(entry)] as [number, number])
  });
  const unit = (value: string) => (value === '1' ? '정규화' : value);
  if (kind === 'phase')
    return createPlot(
      document,
      config.systemId === 'system:van-der-pol' ? '한계 주기 · 위상공간' : '위상공간',
      `${fields[0]!.label} (${unit(fields[0]!.unit)})`,
      `${fields[1]!.label} (${unit(fields[1]!.unit)})`,
      [{ label: '기록 궤적', color: '#075985', points: samples.map((entry) => [entry.phase.x, entry.phase.y]) }]
    );
  if (kind === 'energy')
    return createPlot(
      document,
      sample?.energyLabel ?? '모델 진단량',
      nonlinearTimeLabel(config.systemId),
      `진단량 (${unit(sample?.energyUnit ?? '1')})`,
      [series(sample?.energyLabel ?? '진단량', (entry) => entry.energy)]
    );
  if (kind === 'potential' && config.systemId === 'system:friction')
    return createPlot(document, '정칙화 Stribeck 마찰력 비교', 'v (m/s)', '마찰력 (N)', [
      { label: '비교 곡선', color: '#075985', points: (sample?.potential ?? []).map((point) => [point.x, point.y]) }
    ]);
  if (kind === 'potential')
    return createPlot(
      document,
      config.systemId === 'system:kapitza' ? '효과 퍼텐셜 · 고주파 평균화' : 'Duffing 퍼텐셜',
      `${fields[0]!.label} (${unit(fields[0]!.unit)})`,
      `퍼텐셜 (${config.systemId === 'system:kapitza' ? 's⁻²' : unit(sample?.energyUnit ?? '1')})`,
      [{ label: '퍼텐셜', color: '#075985', points: (sample?.potential ?? []).map((point) => [point.x, point.y]) }]
    );
  if (kind === 'history')
    return createPlot(document, 'Pyragas 지연 이력', '현재에 대한 상대 시간 (s)', 'θ (rad)', [
      {
        label: '승인 이력 θ',
        color: '#075985',
        points: (sample?.history ?? []).map((point) => [point.time, point.theta])
      }
    ]);
  if (kind === 'friction')
    return createPlot(
      document,
      'stick-slip 모드 시간선',
      nonlinearTimeLabel(config.systemId),
      '모드 (0:stick, 1:slip, 2:smooth)',
      [series('마찰 모드', (entry) => ({ stick: 0, slip: 1, smooth: 2 })[entry.mode])]
    );
  if (kind === 'stability')
    return createPlot(
      document,
      'Mathieu Floquet 승수 반경',
      'δ (정규화)',
      '|ρ|max',
      [
        {
          label: '현재 δ, ε',
          color: sample?.stability?.stable ? '#166534' : '#9a3412',
          points: sample?.stability ? [[config.parameters.delta!, sample.stability.spectralRadius]] : []
        }
      ],
      true
    );
  return createPlot(
    document,
    `${field.label} 시간 기록`,
    nonlinearTimeLabel(config.systemId),
    `${field.label} (${unit(field.unit)})`,
    [series(field.label, (entry) => entry.state[index]!)]
  );
}

export function exportNonlinearFigure(
  document: Document,
  config: NonlinearConfig,
  samples: readonly NonlinearSample[],
  kind: NonlinearPlotKind = 'state',
  selected = 0
): string {
  const svg = nonlinearTrajectoryPlot(document, config, samples, kind, selected);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-nonlinear-figure/v1',
    configuration: config,
    samples: samples.length,
    kind,
    selected,
    description: nonlinearPlotDescription(config, kind),
    rendering: 'At most about 600 points per series; numerical data are retained independently.'
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
