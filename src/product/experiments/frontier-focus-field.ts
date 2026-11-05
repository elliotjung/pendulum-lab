import { peierlsNabarroBarrier, sineGordonBreather, sineGordonKink } from '../../physics/sineGordon';
import { createFieldSimulation, fieldWarnings, type FieldConfig, type FieldSample } from '../adapters/physics/field';
import type { ResearchFields } from './research-focus-contracts';
import { frontierLine as line, frontierMetric as metric, type FrontierParts } from './frontier-focus-science';
import { twistedFkEvidence } from './frontier-focus-fk';

/** Analytic Gaussian solution of the linearized Kramers equation, not a second trajectory solver. */
export function linearizedDensityMoments(t: number, damping: number, noise: number, theta0 = 0.1) {
  if (!(t >= 0 && damping >= 0 && damping <= 1 && noise >= 0) || ![t, damping, noise, theta0].every(Number.isFinite))
    throw new RangeError('작은 진폭 밀도 근사의 범위를 확인하세요.');
  const a = damping / 2,
    frequency = Math.sqrt(1 - a * a),
    b = 2 * frequency,
    decay = Math.exp(-damping * t);
  const mean = theta0 * Math.exp(-a * t) * (Math.cos(frequency * t) + (a * Math.sin(frequency * t)) / frequency);
  const constant = damping === 0 ? t : -Math.expm1(-damping * t) / damping;
  const oscillatory =
    damping === 0
      ? Math.sin(b * t) / b
      : (damping + decay * (-damping * Math.cos(b * t) + b * Math.sin(b * t))) / (damping * damping + b * b);
  const variance = Math.max(0, (noise * noise * (constant - oscillatory)) / (2 * frequency * frequency));
  return { mean, variance };
}
function run(config: FieldConfig, progress?: (fraction: number) => void): FieldSample[] {
  const simulation = createFieldSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) {
    const s = simulation.step();
    if (s.step % 4 === 0 || simulation.done) samples.push(s);
    if (s.step % 64 === 0) progress?.(s.time / config.duration);
  }
  return samples;
}
export function executeFrontierField(
  id: string,
  v: ResearchFields,
  c: FieldConfig,
  progress?: (fraction: number) => void
): FrontierParts {
  const trace = run(c, (p) => progress?.(0.45 * p)),
    first = trace[0]!,
    last = trace.at(-1)!;
  const metrics = [metric('energy-change', '종료 에너지와 초기 에너지의 차', last.energy - first.energy, '정규화')];
  const tables: FrontierParts['tables'][number][] = [];
  const charts: FrontierParts['charts'][number][] = [];
  const warnings = fieldWarnings(c);
  if (id === '7.6' || id === '7.7') {
    const values = last.memberStates.map((s) => s[0]!),
      variance = last.variance[0]!,
      mean = last.mean[0]!;
    metrics.push(
      metric('theta-mean', '종료 unwrapped 각도 평균', mean, '정규화 rad'),
      metric('theta-variance', '종료 각도 표본 분산', variance, '정규화 rad²')
    );
    charts.push(
      line('ensemble-moments', '실제 seed 앙상블 평균과 분산', '정규화 t', '정규화 진단', [
        { label: '평균 θ', points: trace.map((s) => ({ x: s.time, y: s.mean[0]! })) },
        { label: '표본 분산 θ', points: trace.map((s) => ({ x: s.time, y: s.variance[0]! })) }
      ])
    );
    if (id === '7.6') {
      const escaped = Array<number>(c.ensemble.members).fill(-1);
      for (const s of trace)
        s.memberStates.forEach((p, i) => {
          if (escaped[i] === -1 && Math.abs(p[0]!) >= Math.PI) escaped[i] = s.time;
        });
      metrics.push(
        metric(
          'observed-escape-fraction',
          '기록 표본에서 |θ|≥π를 본 경로 비율',
          escaped.filter((x) => x >= 0).length / escaped.length
        )
      );
      tables.push({
        id: 'member-lineage',
        title: '독립 stream과 관찰된 최초 장벽 도달 (표본 간격 한계)',
        columns: ['stable member', 'Gaussian seed', '종료 θ', '최초 기록 도달 t'],
        rows: last.memberStates.map((s, i) => [
          last.ensemble.memberIds[i]!,
          last.ensemble.seeds[i]!,
          s[0]!,
          escaped[i] === -1 ? '관찰 없음' : escaped[i]!
        ])
      });
    } else {
      const prediction = linearizedDensityMoments(c.duration, c.parameters.damping!, c.parameters.noise!),
        std = Math.sqrt(prediction.variance),
        half = Math.max(0.04, 4 * Math.max(std, Math.sqrt(variance))),
        low = prediction.mean - half,
        width = (2 * half) / 12;
      const counts = Array<number>(12).fill(0);
      let outside = 0;
      for (const x of values) {
        if (x < low || x > low + 2 * half) {
          outside++;
          continue;
        }
        const bin = Math.min(11, Math.floor((x - low) / width));
        counts[bin] = counts[bin]! + 1;
      }
      const gaussian =
        std > 0
          ? Array.from({ length: 121 }, (_, i) => {
              const x = low + (2 * half * i) / 120;
              return { x, y: Math.exp(-0.5 * ((x - prediction.mean) / std) ** 2) / (Math.sqrt(2 * Math.PI) * std) };
            })
          : [];
      charts.push(
        line(
          'density',
          '앙상블 histogram과 선형화 Fokker–Planck Gaussian',
          'unwrapped θ (정규화)',
          '확률밀도 (rad⁻¹)',
          [
            {
              label: '실제 histogram (12 bins)',
              points: counts.map((count, i) => ({ x: low + (i + 0.5) * width, y: count / (values.length * width) }))
            },
            { label: std > 0 ? '작은 진폭 Gaussian 예측' : '잡음 0: Dirac 분포, 유한 밀도 없음', points: gaussian }
          ]
        )
      );
      charts.push(
        line('density-evolution', '선형화 밀도 방정식의 분산 진화와 실제 앙상블', '정규화 t', 'Var θ (정규화 rad²)', [
          { label: '실제 비선형 표본 분산', points: trace.map((s) => ({ x: s.time, y: s.variance[0]! })) },
          {
            label: '선형화 Kramers 해',
            points: trace.map((s) => ({
              x: s.time,
              y: linearizedDensityMoments(s.time, c.parameters.damping!, c.parameters.noise!).variance
            }))
          }
        ])
      );
      metrics.push(
        metric('fp-variance', '선형화 밀도 해의 종료 분산', prediction.variance, '정규화 rad²'),
        metric('histogram-outside', '표시 histogram 범위 밖 경로 수', outside)
      );
      tables.push({
        id: 'density-moments',
        title: '표본 추정과 밀도 해를 구분',
        columns: ['추정 대상', '실제 비선형 앙상블', '선형화 밀도 해'],
        rows: [
          ['평균 θ', mean, prediction.mean],
          ['분산 θ', variance, prediction.variance],
          ['경로 수', c.ensemble.members, '연속 Gaussian 밀도']
        ]
      });
      warnings.push(
        '밀도 곡선은 sin θ≈θ인 선형화 Kramers/Fokker–Planck 방정식의 해석적 시간 의존 Gaussian입니다. 비선형 native Euler–Maruyama 앙상블과 비교하며, 큰 각도·희귀 탈출·θ wrapping·유한 표본에서는 일치하지 않습니다. 독립 PDE 격자 solver를 실행한 결과가 아닙니다.'
      );
    }
  } else if (id === '7.8') {
    const fractions = trace.map((s) => {
        const sum = s.modeEnergies.reduce((a, b) => a + b, 0);
        return { x: s.time, y: sum ? s.modeEnergies[0]! / sum : 0 };
      }),
      min = Math.min(...fractions.map((p) => p.y)),
      minIndex = fractions.findIndex((p) => p.y === min),
      rebound = Math.max(...fractions.slice(minIndex).map((p) => p.y));
    metrics.push(
      metric('minimum-mode-fraction', '첫 모드 에너지 최소 비율', min),
      metric('post-dip-rebound', '최소 뒤 관찰된 회귀 비율', rebound)
    );
    charts.push(
      line('mode-fraction', '초기 모드의 에너지 유출과 회귀 후보', '정규화 t', 'E₁ / Σ E_harmonic', [
        { label: '첫 모드', points: fractions }
      ])
    );
    tables.push({
      id: 'mode-energies',
      title: '조화 모드 에너지 (총 비선형 에너지와 구분)',
      columns: ['모드', '초기 에너지', '종료 에너지'],
      rows: last.modeEnergies.map((x, i) => [i + 1, first.modeEnergies[i]!, x])
    });
    warnings.push(
      '고정 경계 N=8, β=0.5인 안정화된 FPUT 사슬입니다. 짧은 구간에 회귀가 나타나지 않을 수 있습니다. 조화 모드 에너지 합은 α·β 비선형 퍼텐셜을 포함한 총 에너지와 다릅니다.'
    );
  } else if (id === '7.10') {
    metrics.push(metric('charge', '끝점 차로 얻은 위상전하', last.charge));
    charts.push(
      line('field-profiles', '실제 격자 장의 처음과 끝', '정규화 x', '장 u (rad)', [
        { label: '처음', points: first.profile.map((y, i) => ({ x: (i * c.grid.length) / (c.grid.points - 1), y })) },
        { label: '종료', points: last.profile.map((y, i) => ({ x: (i * c.grid.length) / (c.grid.points - 1), y })) }
      ])
    );
    if (v.scenario !== 2) {
      const t0 = v.scenario === 1 ? Math.PI / (2 * v.frequency!) : 0;
      const error = Math.max(
        ...last.profile.map((u, i) =>
          Math.abs(
            u -
              (v.scenario === 1
                ? sineGordonBreather((i * c.grid.length) / (c.grid.points - 1), c.duration + t0, {
                    omega: v.frequency!,
                    center: c.grid.length / 2
                  })
                : sineGordonKink((i * c.grid.length) / (c.grid.points - 1), c.duration, {
                    velocity: v.velocity!,
                    center: c.grid.length / 2
                  }))
          )
        )
      );
      metrics.push(metric('continuum-error', '동일 시각 연속체 정확해와 최대 장 차', error, 'rad'));
    }
    tables.push({
      id: 'charge-energy',
      title: '솔리톤/충돌의 전하와 에너지 기록',
      columns: ['정규화 t', 'Q', 'E (정규화)'],
      rows: trace.filter((_, i) => i % 10 === 0 || i === trace.length - 1).map((s) => [s.time, s.charge, s.energy])
    });
    warnings.push(
      'scenario2는 native kink+antikink 초기 장을 수치 적분합니다. 초기 두 솔리톤 중첩은 무한영역의 정확한 다중솔리톤 해와 같지 않으며 fixed 경계·공간격자·초기 분리 오차가 있습니다.'
    );
  } else {
    const pn = peierlsNabarroBarrier(v.coupling!, {
      sites: c.grid.points,
      maxIterations: v.maxIterations!,
      tolerance: 1e-9
    });
    metrics.push(
      metric('pn-barrier', '정적 site/bond 에너지 차 |ΔE|', pn.barrier, '정규화'),
      metric('stationary-residual', '기준 정적 kink의 실제 최종 잔차', last.gradNorm, '정규화')
    );
    tables.push({
      id: 'pn-energies',
      title: '같은 결합의 Peierls–Nabarro 정적 에너지',
      columns: ['해', '에너지'],
      rows: [
        ['site 중심', pn.siteEnergy],
        ['bond 중심', pn.bondEnergy],
        ['절댓값 차', pn.barrier]
      ]
    });
    const twisted = twistedFkEvidence(v);
    metrics.push(...twisted.metrics);
    tables.push(...twisted.tables);
    charts.push(...twisted.charts);
    warnings.push(...twisted.warnings);
  }
  return { metrics, tables, charts, warnings };
}
