import { doubleMassMatrix, omegaToMomentum } from '../../physics/canonical';
import { mathieuFloquet, mathieuStabilityDiagram } from '../../chaos/mathieuStability';
import { defaultDrivenConfig } from '../adapters/physics/driven';
import { kapitzaEffectivePotential } from '../../physics/kapitza';
import type { KapitzaParameters } from '../../physics/kapitza';
import type { NonlinearFocusConfig } from './nonlinear-focus-config';
import type { ResearchFields } from './research-focus-contracts';
import {
  runNative,
  metric,
  lineChart,
  thin,
  harmonicFit,
  trap,
  type FocusParts,
  type FocusSample
} from './nonlinear-focus-helpers';

export function firstNonlinearExperiment(
  id: string,
  v: ResearchFields,
  source: NonlinearFocusConfig,
  s: FocusSample[],
  progress?: (p: number) => void
): FocusParts {
  const metrics: FocusParts['metrics'][number][] = [],
    tables: FocusParts['tables'][number][] = [],
    charts: FocusParts['charts'][number][] = [],
    warnings: string[] = [];
  if (id === '4.1' && source.family === 'planar') {
    const p = source.config.parameters,
      gamma = source.config.gamma;
    const loss = (x: FocusSample) => gamma * (x.state[2]! ** 2 + x.state[3]! ** 2);
    const div = (x: FocusSample) => {
      const m = doubleMassMatrix(x.state[0]!, x.state[1]!, p);
      return (-gamma * (m.m11 + m.m22)) / m.det;
    };
    const dissipated = trap(s, loss),
      difference = s.at(-1)!.energy - s[0]!.energy;
    metrics.push(
      metric('energy-change', '역학에너지 변화', difference, 'J'),
      metric('dissipated', '감쇠로 소산된 에너지 (격자 적분)', dissipated, 'J'),
      metric('balance-residual', '에너지 수지 잔차', Math.abs(difference + dissipated), 'J'),
      metric('canonical-volume-ratio', '초기 미소 canonical 부피 대비 비율', Math.exp(trap(s, div)))
    );
    charts.push(
      lineChart('energy', '에너지와 힌지 감쇠의 수지', s, [{ label: '역학에너지', value: (x) => x.energy }], 'J'),
      lineChart('divergence', 'canonical 위상 부피의 순간 수축률', s, [{ label: 'div(q,p)', value: div }], 's^-1')
    );
    charts.push({
      id: 'canonical-phase',
      title: '첫 링크의 canonical 투영',
      xLabel: 'θ₁ (rad)',
      yLabel: 'p₁ (kg·m²/s)',
      series: [
        {
          label: '같은 실제 궤적',
          points: thin(s).map((x) => ({ x: x.state[0]!, y: omegaToMomentum(x.state, p)[2]! }))
        }
      ]
    });
    warnings.push(
      '표시 부피 비율은 실제 궤적에서 -γ tr(M⁻¹)의 격자 적분으로 얻은 선형화된 미소 부피입니다. 유한 초기조건 구름의 부피를 직접 측정한 값이나 엄밀 오차 상한이 아닙니다. (q,ω)의 Euclidean 부피와 (q,p)의 canonical 부피를 구분하세요.'
    );
  } else if (id === '4.2' && source.family === 'driven') {
    const frequencies = Array.from({ length: 7 }, (_, i) => Math.sqrt(v.g! / v.length!) * (0.65 + (i * 0.7) / 6));
    const rows = frequencies.map((frequency, i) => {
      const samples = runNative({
        family: 'driven',
        config: { ...source.config, forcing: { ...source.config.forcing!, frequency } }
      });
      const fit = harmonicFit(samples, frequency);
      progress?.((i + 1) / frequencies.length);
      return [frequency, fit.amplitude, fit.lag] as const;
    });
    tables.push({
      id: 'response',
      title: '같은 초기조건의 실제 주파수 sweep · 후반부 조화 fitting',
      columns: ['Ω (rad/s)', '기본주파수 진폭 (rad)', '지연 위상 (rad)'],
      rows
    });
    charts.push(
      {
        id: 'resonance',
        title: '유한 관찰 구간의 진폭 응답',
        xLabel: 'Ω (rad/s)',
        yLabel: '진폭 (rad)',
        series: [{ label: '같은 초기조건, 7회 실행', points: rows.map((r) => ({ x: r[0], y: r[1] })) }]
      },
      {
        id: 'phase-lag',
        title: '구동 cos(Ωt)에 대한 위상 지연',
        xLabel: 'Ω (rad/s)',
        yLabel: '지연 (rad)',
        series: [{ label: '후반부 최소제곱 fitting', points: rows.map((r) => ({ x: r[0], y: r[2] })) }]
      }
    );
    metrics.push(
      metric(
        'sampled-peak-frequency',
        '7개 주파수 중 최대 응답 위치',
        rows.reduce((a, b) => (a[1] > b[1] ? a : b))[0],
        'rad/s'
      ),
      metric('linear-natural-frequency', '작은 진폭 자연 각주파수 척도', Math.sqrt(v.g! / v.length!), 'rad/s')
    );
    warnings.push(
      '각 주파수는 같은 초기조건에서 다시 시작합니다. 후반부 cos·sin·상수 최소제곱 fit이며 정상상태 전달함수의 인증이 아닙니다. 구간이 짧거나 진폭이 크면 transient·비선형 고조파가 진폭과 지연을 바꿉니다. amplitude=0이면 위상은 물리적으로 정의되지 않아 표시 fit을 해석하지 마세요.'
    );
  } else if (id === '4.3' && source.family === 'nonlinear') {
    const grid = mathieuStabilityDiagram({
      deltaRange: [Math.max(0.02, v.delta! - 0.2), v.delta! + 0.2],
      epsilonRange: [Math.max(0, v.epsilon! - 0.2), v.epsilon! + 0.2],
      deltaSamples: 5,
      epsilonSamples: 5,
      options: { steps: 1000, stabilityTolerance: 0.005 }
    });
    const exact = mathieuFloquet(v.delta!, v.epsilon!, { steps: 2000 }),
      coarse = mathieuFloquet(v.delta!, v.epsilon!, { steps: 1000 });
    tables.push({
      id: 'tongue-grid',
      title: 'native Floquet의 δ–ε 국소 격자',
      columns: ['δ', 'ε', '승수 반경', '|det M−1|', '허용오차 기반 판정'],
      rows: grid.cells.map((c) => [
        c.delta,
        c.epsilon,
        c.spectralRadius,
        c.determinantDrift,
        c.stable ? '경계/안정 후보' : '불안정 후보'
      ])
    });
    charts.push(
      {
        id: 'tongues',
        title: '매개변수 가진 tongue의 국소 절편',
        xLabel: 'δ (정규화)',
        yLabel: '승수 반경',
        series: grid.epsilons.map((e) => ({
          label: `ε=${e.toFixed(3)}`,
          points: grid.cells.filter((c) => c.epsilon === e).map((c) => ({ x: c.delta, y: c.spectralRadius }))
        }))
      },
      lineChart('response', '선택한 δ,ε의 직접 응답', s, [{ label: 'x', value: (x) => x.state[0]! }], '정규화 변위')
    );
    metrics.push(
      metric('spectral-radius', '선택한 점의 native 승수 반경', exact.spectralRadius),
      metric(
        'floquet-refinement',
        '1000→2000 substep의 승수 반경 차이',
        Math.abs(exact.spectralRadius - coarse.spectralRadius)
      ),
      metric('determinant-drift', '선택한 점의 |det M−1|', Math.abs(exact.determinant - 1))
    );
    warnings.push(
      'Mathieu 모형은 x″+(δ+ε cos t)x=0, 가진 주기 2π인 정규화 시간입니다. 물리적인 길이·가속도로 오해하지 마세요. NIST의 y″+(a−2q cos2z)y=0과는 t=2z,a=4δ,q=−2ε로 연결됩니다. 승수 반경≈1은 Jordan 성장과 경계 오차를 배제하지 않아 유계성 증명이 아닙니다.'
    );
  } else if (id === '4.4' && source.family === 'nonlinear') {
    const off = runNative({
      family: 'nonlinear',
      config: { ...source.config, parameters: { ...source.config.parameters, driveAmplitude: 0 } }
    });
    const p = source.config.parameters as unknown as KapitzaParameters,
      curve = Array.from({ length: 129 }, (_, i) => {
        const x = (2 * Math.PI * i) / 128;
        return { x, y: kapitzaEffectivePotential(x, p) };
      });
    const deviation = (values: readonly FocusSample[]) =>
      Math.max(...values.map((x) => Math.abs(x.state[0]! - Math.PI)));
    metrics.push(
      metric(
        'averaged-curvature',
        '역평형의 평균화 퍼텐셜 곡률',
        (v.amplitude! ** 2 * v.frequency! ** 2) / (2 * v.length! ** 2) - v.g! / v.length!,
        's^-2'
      ),
      metric('driven-deviation', '빠른 가진에서 최대 |θ−π|', deviation(s), 'rad'),
      metric('unforced-deviation', '가진을 끈 최대 |θ−π|', deviation(off), 'rad')
    );
    charts.push(
      {
        id: 'effective-potential',
        title: 'native 평균화 가속도 퍼텐셜',
        xLabel: 'θ (rad)',
        yLabel: 'Φeff (s^-2)',
        series: [{ label: '고주파 근사', points: curve }]
      },
      lineChart(
        'kapitza-response',
        '직접 적분: 빠른 가진과 가진 없음',
        s,
        [{ label: '빠른 가진 θ−π', value: (x) => x.state[0]! - Math.PI }],
        'rad'
      ),
      lineChart(
        'kapitza-no-drive',
        '같은 초기조건에서 가진을 끈 응답',
        off,
        [{ label: '가진 없음 θ−π', value: (x) => x.state[0]! - Math.PI }],
        'rad'
      )
    );
    warnings.push(
      'a²Ω²>2gl은 고주파·작은 지지대 진폭에서 평균화된 역평형의 국소 곡률 조건입니다. 그림의 퍼텐셜은 직접 가진의 순간 에너지가 아니며 장시간 안정성을 보증하지 않습니다. dt를 줄여 빠른 주기를 분해하고, Ω를 늘릴 때에는 dt도 조절하여 평균화 근사의 수렴을 따로 비교하세요.'
    );
  } else if (id === '4.5' && source.family === 'driven') {
    const open = runNative({
      family: 'driven',
      config: { ...source.config, controller: { ...source.config.controller!, enabled: false } }
    });
    const i = defaultDrivenConfig('system:inverted'),
      controller = {
        ...i.controller!,
        enabled: true,
        kp: i.controller!.kp * v.gainScale!,
        kd: i.controller!.kd * v.gainScale!
      };
    const ic = { ...i, duration: v.duration!, step: v.step!, initialState: [v.theta!, 0], controller };
    const inverted = runNative({ family: 'driven', config: ic }),
      invertedOpen = runNative({ family: 'driven', config: { ...ic, controller: { ...controller, enabled: false } } });
    metrics.push(
      metric('cartpole-closed-angle', '카트폴 폐루프 최종 각도', s.at(-1)!.state[1]!, 'rad'),
      metric('cartpole-open-angle', '카트폴 개방루프 최종 각도', open.at(-1)!.state[1]!, 'rad'),
      metric('inverted-closed-angle', '역진자 폐루프 최종 각도', inverted.at(-1)!.state[0]!, 'rad'),
      metric(
        'cartpole-max-control',
        '카트폴 제어 힘의 최대 절댓값',
        Math.max(...s.map((x) => Math.abs(x.control))),
        'N'
      )
    );
    charts.push(
      lineChart('cartpole', '위쪽 θ=0 근처의 카트폴 폐루프', s, [{ label: 'θ', value: (x) => x.state[1]! }], 'rad'),
      lineChart('cartpole-open', '같은 카트폴 개방루프', open, [{ label: 'θ', value: (x) => x.state[1]! }], 'rad'),
      lineChart(
        'inverted-control',
        '단순 역진자 폐루프와 개방루프',
        inverted,
        [
          { label: '폐루프 θ', value: (x) => x.state[0]! },
          { label: '개방루프 θ', value: (x) => invertedOpen.find((p) => p.time === x.time)?.state[0] ?? 0 }
        ],
        'rad'
      ),
      lineChart('control-force', '카트폴의 실제 포화된 제어 힘', s, [{ label: 'u', value: (x) => x.control }], 'N')
    );
    warnings.push(
      '두 시스템의 θ=0은 위쪽입니다. 기본 gain 배율을 같은 배수로 바꾸는 비교이며 pole placement나 전역 안정성 증명이 아닙니다. 카트폴의 포화 한계는 N, 단순 역진자는 각가속도입니다. Lab에는 선택한 카트폴 기준 run을 전달하며 단순 역진자 동반 실행은 단원 결과에 남습니다.'
    );
  } else throw new Error('과정 4 전반부의 native 모형과 단원이 일치하지 않습니다.');
  return { metrics, tables, charts, warnings };
}
