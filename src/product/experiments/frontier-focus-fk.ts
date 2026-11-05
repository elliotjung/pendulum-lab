import { findPeriodicOrbit, mapJacobianFD, type MapFn } from '../../chaos/chaosControl';
import { buildCouplingMatrix, rhsPendulumNetwork } from '../../physics/pendulumNetwork';
import { createSineGordonField } from '../../physics/sineGordon';
import { jacobiEigenSymmetric } from '../../research/svd';
import {
  createFieldSimulation,
  defaultFieldConfig,
  type FieldConfig,
  type FieldSample
} from '../adapters/physics/field';
import type { ResearchFields } from './research-focus-contracts';
import { frontierLine as line, frontierMetric as metric, type FrontierParts } from './frontier-focus-science';

export const FK_TWIST_POINTS = 25;
export interface TwistedFkEquilibrium {
  readonly profile: readonly number[];
  readonly twist: number;
  readonly residual: number;
  readonly minCurvature: number;
  readonly converged: boolean;
}

/** A constant natural spacing telescopes out of interior FK spring forces at fixed endpoint twist. */
export function twistedFkEquilibrium(coupling: number, twist: number, maxIterations: number): TwistedFkEquilibrium {
  if (
    !Number.isFinite(coupling) ||
    coupling < 0.1 ||
    coupling > 4 ||
    !Number.isFinite(twist) ||
    twist < 0.1 ||
    twist > 1 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 80
  )
    throw new RangeError('유한 FK 결합·평균 twist·Newton 범위를 확인하세요.');
  const n = FK_TWIST_POINTS,
    dimension = n - 2,
    right = 2 * Math.PI * twist * (n - 1);
  const parameters = {
    masses: Array<number>(n).fill(1),
    lengths: Array<number>(n).fill(1),
    g: 1,
    coupling: buildCouplingMatrix(
      n,
      Array.from({ length: n - 1 }, (_, i) => ({ i, j: i + 1, kappa: coupling }))
    )
  };
  const map: MapFn = (x, out) => {
    if (x.length !== dimension || x.some((v) => !Number.isFinite(v) || Math.abs(v) > 500))
      throw new RangeError('FK Newton 상태 범위를 넘었습니다.');
    const state = [0, ...x, right, ...Array<number>(n).fill(0)],
      derivative = new Float64Array(2 * n);
    rhsPendulumNetwork(state, parameters, derivative);
    for (let i = 0; i < dimension; i++) out[i] = x[i]! + derivative[n + i + 1]!;
  };
  let best: TwistedFkEquilibrium | undefined;
  for (const offset of [0, 0.15]) {
    const seed = Array.from({ length: dimension }, (_, i) => 2 * Math.PI * Math.round(twist * (i + 1) + offset));
    try {
      const result = findPeriodicOrbit(map, seed, 1, { maxIterations, tolerance: 1e-9 }),
        value = Array<number>(dimension).fill(0);
      map(result.point, value);
      const residual = Math.max(...value.map((v, i) => Math.abs(v - result.point[i]!))),
        jac = mapJacobianFD(map, result.point),
        hessian = jac.flatMap((row, i) => row.map((_, j) => (i === j ? 1 : 0) - (jac[i]![j]! + jac[j]![i]!) / 2)),
        minCurvature = Math.min(...jacobiEigenSymmetric(hessian, dimension, 60, 1e-12).values),
        candidate = {
          profile: [0, ...result.point, right],
          twist,
          residual,
          minCurvature,
          converged: residual < 1e-7 && minCurvature > 1e-6
        };
      if (!best || candidate.residual < best.residual) best = candidate;
      if (candidate.converged) return candidate;
    } catch {
      /* A failed branch is retained as an explicit nonconvergence rather than a mobility result. */
    }
  }
  return (
    best ?? {
      profile: Array.from({ length: n }, (_, i) => (right * i) / (n - 1)),
      twist,
      residual: 1e6,
      minCurvature: 0,
      converged: false
    }
  );
}

export function twistedFkImpulseConfig(
  equilibrium: TwistedFkEquilibrium,
  coupling: number,
  kick: number,
  duration: number,
  step: number
): FieldConfig {
  if (!equilibrium.converged || !Number.isFinite(kick) || kick < 0 || kick > 3)
    throw new RangeError('수렴한 FK 국소 최소와0~3 impulse가 필요합니다.');
  const points = equilibrium.profile.length,
    length = (points - 1) / Math.sqrt(coupling),
    field = createSineGordonField({
      points,
      length,
      dt: step,
      boundary: 'fixed',
      initial: (x) => equilibrium.profile[Math.min(points - 1, Math.round(x * Math.sqrt(coupling)))]!,
      initialRate: (x) => (x > 1e-10 && x < length - 1e-10 ? kick : 0)
    });
  return {
    ...defaultFieldConfig('system:sine-gordon'),
    grid: { points, length, boundary: 'fixed' },
    initialState: [...field.u, ...Array.from(field.u, (u, i) => (u - field.uPrev[i]!) / step)],
    previousField: Array.from(field.uPrev),
    duration,
    step,
    sampleEvery: 4
  };
}

/** Finite-time impulse depinning protocol; no sustained external force or new time evolution. */
export function twistedFkEvidence(v: ResearchFields): FrontierParts {
  const metrics: FrontierParts['metrics'][number][] = [],
    tables: FrontierParts['tables'][number][] = [],
    charts: FrontierParts['charts'][number][] = [],
    warnings: string[] = [];
  const selected = twistedFkEquilibrium(v.coupling!, v.twist!, v.maxIterations!);
  metrics.push(
    metric('twist-equilibrium-residual', '선택한 twist의 실제 정지 힘 잔차', selected.residual, '정규화'),
    metric('twist-min-curvature', '선택한 twist의 최소 수치 Hessian 고유값', selected.minCurvature, '정규화')
  );
  charts.push(
    line('twist-profile', '선택한 평균 twist의 native stationary profile', '격자 site', 'unwrapped 위상 (rad)', [
      {
        label: selected.converged ? '수렴한 유한-chain 국소 최소' : '미수렴 후보',
        points: selected.profile.map((y, x) => ({ x, y }))
      }
    ])
  );
  const rows: (number | string)[][] = [],
    equilibriumRows: (number | string)[][] = [],
    series: FrontierParts['charts'][number]['series'][number][] = [],
    kicks = [...new Set([0, v.velocity! / 2, v.velocity!, 1.5, 2, 3])].sort((a, b) => a - b);
  for (const twist of [...new Set([1, v.twist!])]) {
    const equilibrium = twist === v.twist! ? selected : twistedFkEquilibrium(v.coupling!, twist, v.maxIterations!);
    equilibriumRows.push([
      twist,
      equilibrium.residual,
      equilibrium.minCurvature,
      equilibrium.converged ? '국소 최소 수렴' : '미수렴/최소 미확인'
    ]);
    if (!equilibrium.converged) {
      warnings.push(
        `평균 twist${twist.toPrecision(5)}에서 정지 힘 잔차·국소 최소 조건이 확인되지 않아 impulse depinning/mobility를 판정하지 않았습니다.`
      );
      continue;
    }
    for (const kick of kicks) {
      const config = twistedFkImpulseConfig(equilibrium, v.coupling!, kick, v.duration!, v.step!),
        simulation = createFieldSimulation(config),
        trace: FieldSample[] = [simulation.snapshot()];
      while (!simulation.done) {
        const sample = simulation.step();
        if (sample.step % 4 === 0 || simulation.done) trace.push(sample);
      }
      const displacement = (s: FieldSample) =>
          s.profile.slice(1, -1).reduce((sum, q, i) => sum + (q - equilibrium.profile[i + 1]!), 0) /
          (equilibrium.profile.length - 2),
        displacementTrace = trace.map((s) => ({ x: s.time, y: displacement(s) / (2 * Math.PI) })),
        final = displacementTrace.at(-1)!.y,
        max = Math.max(...displacementTrace.map((p) => p.y)),
        depin = max >= 1,
        last = trace.at(-1)!,
        first = trace[0]!;
      rows.push([
        twist,
        kick,
        final,
        final / config.duration,
        max,
        depin ? '역치 통과' : '관찰 범위 안 고정/진동',
        last.energy - first.energy
      ]);
      if (kick === 0 || kick === v.velocity!)
        series.push({ label: `ρ=${twist.toPrecision(4)}, impulse=${kick.toPrecision(3)}`, points: displacementTrace });
    }
  }
  tables.push(
    {
      id: 'twist-equilibria',
      title: '고정 경계의 정지 힘·국소 최소 확인',
      columns: ['평균 twist ρ', '힘 infinity 잔차', '최소 수치 Hessian 고유값', '상태'],
      rows: equilibriumRows
    },
    {
      id: 'impulse-depinning',
      title: '동일 K의 commensurate/선택 twist impulse scan',
      columns: [
        '평균 twist ρ',
        '초기 각속도 impulse',
        '종료 평균 이동 (기판 주기)',
        '평균 이동률 (주기/t)',
        '최대 양의 이동 (주기)',
        '유한 관찰 역치 (한 주기)',
        'native 격자 에너지 변화'
      ],
      rows
    }
  );
  if (series.length)
    charts.push(
      line('twist-mobility', '평균 twist와 impulse에 따른 실제 위상 수송', '정규화 t', '평균 위상 이동 /2π', series)
    );
  const selectedRows = rows.filter((r) => r[0] === v.twist!),
    crossed = selectedRows.filter((r) => r[5] === '역치 통과');
  if (crossed.length)
    metrics.push(
      metric(
        'finite-kick-threshold',
        '표본 impulse 중 한 주기 이동의 최소 통과값',
        Math.min(...crossed.map((r) => Number(r[1]))),
        '정규화'
      )
    );
  metrics.push(
    metric('twist-count', '수렴한 평균 twist 대조 수', equilibriumRows.filter((r) => r[3] === '국소 최소 수렴').length)
  );
  warnings.push(
    '평균 twistρ는 고정 끝점 차/(2π(N−1))입니다. 유한 chain에서 정수ρ=1과 선택ρ를 비교하며 무리수 극한의 Aubry 전이를 인증하지 않습니다. 일정한 자연 간격은 interior 힘에서 상쇄되고 고정 끝점 에너지의 상수항만 바꾸므로 동일 native force/stepper를 사용합니다.',
    'Depinning은 처음부터 정지 힘·양의 수치 Hessian을 통과한 상태에서 평균 내부 위상이 관찰 기간 중 한 기판 주기 이동했는지의 protocol입니다. 표본 impulse 역치는 전역/단조/영구 depinning threshold가 아니며 표시 이동률은 지속 외력 없는 유한 시간 impulse transport입니다. 정상 상태 force/velocity mobility와 구분합니다.'
  );
  return { metrics, tables, charts, warnings };
}
