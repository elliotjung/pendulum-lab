import { runStability } from '../adapters/analysis/stability/execute';
import { defaultStabilitySettings } from '../adapters/analysis/stability/settings';
import { drivenMap, StabilityWork } from '../adapters/analysis/stability/source';
import { eigenvalues2x2, monodromyMatrix } from '../../chaos/floquet';
import { realEigenvector2x2 } from '../../chaos/branchSwitching';
import { rhsDriven } from '../../physics/driven';
import { rk4Step } from '../../physics/integrators';
import { stabilityFocusCanonical } from './stability-focus-config';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
type Point = { x: number; y: number };
/** Sample stable/unstable stroboscopic manifolds with native RK4, including the inverse-time map. */
export function stabilityManifoldEvidence(
  f: ResearchFields
): Pick<ResearchFocusResult, 'metrics' | 'tables' | 'charts' | 'warnings'> {
  const linearStiffness = f.g! / f.length! + f.frequency! ** 2,
    linearCosine = (-f.amplitude! * linearStiffness) / (linearStiffness ** 2 + (f.damping! * f.frequency!) ** 2),
    linearSine = (-f.damping! * f.frequency! * linearCosine) / linearStiffness,
    experiment = stabilityFocusCanonical('6.4', f),
    settings = {
      ...defaultStabilitySettings('fixed-point', experiment),
      guess0: Math.PI + linearCosine,
      guess1: linearSine * f.frequency!,
      stepsPerPeriod: 256,
      maxIterations: 20
    },
    shot = runStability({ id: 'learn_manifold_saddle', kind: 'fixed-point', experiment, settings }),
    saddle = shot.branch[0];
  const warnings = [
    ...shot.warnings,
    '표시된 다양체는 유한한 작은 선분 seed와 유한 반환 횟수의 근사입니다. 역시간 적분은 안정 다양체를 계산하기 위한 수치 도구이며 실제 감쇠 진자의 시간역전 실험이 아닙니다.'
  ];
  if (!saddle?.converged)
    return {
      metrics: [{ id: 'manifold-saddle-converged', label: '주기 saddle 수렴 (1=예)', value: 0, unit: '1' }],
      tables: [],
      charts: [],
      warnings: [...warnings, '주기 saddle Newton이 수렴하지 않아 다양체 교차를 판정하지 않았습니다.']
    };
  const p = {
      g: f.g!,
      length: f.length!,
      damping: f.damping!,
      driveAmplitude: f.amplitude!,
      driveFrequency: f.frequency!
    },
    work = new StabilityWork(),
    forward = drivenMap(p, 0, 256, work),
    matrix = monodromyMatrix(
      [...saddle.state, 0],
      (state, out) => rhsDriven(state, p, out),
      (2 * Math.PI) / p.driveFrequency,
      { dt: (2 * Math.PI) / p.driveFrequency / 256 }
    ),
    eigen = eigenvalues2x2(matrix),
    stable = eigen.find((x) => Math.abs(x.im) < 1e-7 && x.modulus < 1 - 1e-3),
    unstable = eigen.find((x) => Math.abs(x.im) < 1e-7 && x.modulus > 1 + 1e-3);
  if (!stable || !unstable)
    return {
      metrics: [{ id: 'manifold-hyperbolic', label: '실수 쌍곡 saddle 확인 (1=예)', value: 0, unit: '1' }],
      tables: [],
      charts: [],
      warnings: [...warnings, '실수 수축·팽창 승수쌍이 확인되지 않아 다양체를 생성하지 않았습니다.']
    };
  const sv = realEigenvector2x2(matrix, stable.re),
    uv = realEigenvector2x2(matrix, unstable.re),
    dt = (2 * Math.PI) / p.driveFrequency / 256;
  const inverse = (x: readonly number[]) => {
    const s = Float64Array.from([x[0]!, x[1]!, 0]),
      next = new Float64Array(3);
    for (let i = 0; i < 256; i++) {
      rk4Step(s, -dt, (state, out) => rhsDriven(state, p, out), next);
      s.set(next);
    }
    return [s[0]!, s[1]!] as [number, number];
  };
  const unwrapped: number[][] = [],
    curves: { label: string; points: Point[] }[] = [],
    wrap = (theta: number) => Math.atan2(Math.sin(theta), Math.cos(theta));
  let truncated = 0;
  for (const [name, v, backward] of [
    ['unstable', uv, false],
    ['stable', sv, true]
  ] as const) {
    for (const sign of [-1, 1]) {
      const seeds = Array.from(
        { length: 12 },
        (_, i) =>
          [saddle.state[0]! + sign * (i + 1) * 1e-7 * v[0], saddle.state[1]! + sign * (i + 1) * 1e-7 * v[1]] as [
            number,
            number
          ]
      );
      for (let turn = 0; turn <= f.manifoldTurns!; turn++) {
        const displayed: Point[] = [];
        for (let j = 0; j < seeds.length; j++) {
          const current = seeds[j]!;
          if (!current.every(Number.isFinite) || Math.abs(current[0]) > 100 || Math.abs(current[1]) > 30) {
            truncated++;
            continue;
          }
          unwrapped.push([backward ? 0 : 1, sign, turn, j, current[0], current[1]]);
          displayed.push({ x: wrap(current[0]), y: current[1] });
          if (turn < f.manifoldTurns!) {
            if (backward) seeds[j] = inverse(current);
            else {
              const out = [0, 0];
              forward(current, out);
              seeds[j] = [out[0]!, out[1]!];
            }
          }
        }
        if (turn > 0 && displayed.length > 1) curves.push({ label: `${name} ${sign} turn${turn}`, points: displayed });
      }
    }
  }
  const candidates: Point[] = [];
  const u = curves.filter((c) => c.label.startsWith('unstable')),
    s = curves.filter((c) => c.label.startsWith('stable'));
  for (const a of u)
    for (const b of s)
      for (let i = 1; i < a.points.length; i++)
        for (let j = 1; j < b.points.length; j++) {
          const p0 = a.points[i - 1]!,
            p1 = a.points[i]!,
            q0 = b.points[j - 1]!,
            q1 = b.points[j]!,
            ax = p1.x - p0.x,
            ay = p1.y - p0.y,
            bx = q1.x - q0.x,
            by = q1.y - q0.y,
            det = ax * by - ay * bx;
          if (Math.abs(ax) > Math.PI || Math.abs(bx) > Math.PI || Math.abs(det) < 1e-10) continue;
          const cx = q0.x - p0.x,
            cy = q0.y - p0.y,
            t = (cx * by - cy * bx) / det,
            v = (cx * ay - cy * ax) / det;
          if (t > 0 && t < 1 && v > 0 && v < 1) {
            const point = { x: p0.x + t * ax, y: p0.y + t * ay };
            if (Math.abs(point.x) < 2.8 && !candidates.some((c) => Math.hypot(c.x - point.x, c.y - point.y) < 0.01))
              candidates.push(point);
          }
        }
  const selected = (prefix: string) => curves.filter((c) => c.label.startsWith(prefix)).flatMap((c) => c.points);
  return {
    metrics: [
      { id: 'manifold-saddle-converged', label: '주기 saddle 수렴 (1=예)', value: 1, unit: '1' },
      { id: 'manifold-sampled-crossings', label: '표본 선분의 횡단 교차 후보', value: candidates.length, unit: '1' },
      { id: 'manifold-truncated', label: '안전 범위 밖 추적 표본', value: truncated, unit: '1' }
    ],
    tables: [
      {
        id: 'manifold-saddle',
        title: '실제 공용 shooting saddle와 선형 승수',
        columns: ['theta (rad)', 'omega (rad/s)', '잔차 (혼합 norm)', 'stable mu', 'unstable mu'],
        rows: [[...saddle.state, saddle.residual, stable.re, unstable.re]]
      },
      {
        id: 'manifold-samples',
        title: '실제 다양체 표본 (각도 wrapping 전)',
        columns: ['방향 (0=stable,1=unstable)', '가지 부호', '반환 횟수', 'seed 번호', 'theta (rad)', 'omega (rad/s)'],
        rows: unwrapped.slice(0, 1200)
      }
    ],
    charts: [
      {
        id: 'stable-unstable-manifolds',
        title: '실제 주기 saddle의 안정·불안정 다양체 표본',
        mode: 'scatter',
        xLabel: '주값 theta (rad)',
        yLabel: 'omega (rad/s)',
        series: [
          { label: 'unstable forward', points: selected('unstable') },
          { label: 'stable inverse-time', points: selected('stable') },
          { label: '표본 선분 교차 후보', points: candidates.slice(0, 2500) }
        ]
      }
    ],
    warnings: [
      ...warnings,
      '선분 교차는 유한 seed 간격의 후보이며 곡률/seed/반환수/시간 간격 수렴이 필요합니다. 후보0은 교차 부재의 증명이 아닙니다. 주값 각도 seam을 가로지르는 선분과 saddle 근처 교차는 제외했습니다.'
    ]
  };
}
