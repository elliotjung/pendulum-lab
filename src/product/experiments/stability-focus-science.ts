import { runStability } from '../adapters/analysis/stability/execute';
import type { StabilityKind, StabilityResult } from '../adapters/analysis/stability/contracts';
import { runAdvancedDiagnostic } from '../adapters/analysis/advanced/execute';
import { defaultAdvancedSettings } from '../adapters/analysis/advanced/settings';
import type { AdvancedDiagnosticKind } from '../adapters/analysis/advanced/contracts';
import { createDrivenSimulation, createDrivenFlow } from '../adapters/physics/driven';
import { createDiagnosticSeries } from '../adapters/analysis/core/source';
import { numericalJacobian } from '../../physics/variational';
import { eigenvalues2x2 } from '../../chaos/floquet';
import {
  stabilityFocusFields,
  stabilityFocusCanonical,
  stabilityFocusSettings,
  stabilityDrivenConfig
} from './stability-focus-config';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
import { stabilityManifoldEvidence } from './stability-focus-manifolds';
import { stabilityCascadeEvidence } from './stability-focus-cascade';
type Metric = ResearchFocusResult['metrics'][number];
type Table = ResearchFocusResult['tables'][number];
type Chart = ResearchFocusResult['charts'][number];
const metric = (id: string, label: string, value: number, unit = '1'): Metric => ({ id, label, value, unit });
/** Bounded teaching orchestration only: all orbit, tangent, Newton and analysis kernels are shared. */
export function executeStabilityFocus(
  id: string,
  input: ResearchFields,
  progress: (fraction: number) => void = () => {}
): ResearchFocusResult {
  const f = stabilityFocusFields(id, input),
    canonical = stabilityFocusCanonical(id, f),
    metrics: Metric[] = [],
    tables: Table[] = [],
    charts: Chart[] = [],
    warnings: string[] = [];
  const record = (label: string, r: StabilityResult) => {
    const n = tables.length;
    tables.push({
      id: `native-${n}`,
      title: label,
      columns: r.columns.map((c, i) => `${c} (${r.units[i]})`),
      rows: r.rows
    });
    tables.push({
      id: `status-${n}`,
      title: `${label} · 상태와 방법`,
      columns: ['항목', '값'],
      rows: [
        ['source', r.source],
        ['status', r.status],
        ['method', r.method],
        ['summary', r.summary]
      ]
    });
    warnings.push(...r.warnings);
    metrics.push(metric(`converged-${n}`, `${label} · 수렴한 가지 점`, r.branch.filter((p) => p.converged).length));
    if (r.rows.length > 1)
      charts.push({
        id: `curve-${n}`,
        title: label,
        xLabel: `${r.columns[0]} (${r.units[0]})`,
        yLabel: `${r.columns[1]} (${r.units[1]})`,
        series: [{ label, points: r.rows.map((row) => ({ x: row[0]!, y: row[1]! })) }]
      });
    if (r.log.length)
      tables.push({
        id: `residual-${n}`,
        title: `${label} · 실제 반환 잔차 이력`,
        columns: ['보정/가지 단계', '잔차 (혼합 좌표 norm)', '수렴 (1=예)'],
        rows: r.log.map((l) => [l.step, l.residual, l.converged ? 1 : 0])
      });
    return r;
  };
  const run = (kind: StabilityKind, changes: Record<string, number | string> = {}, source?: string) => {
    const settings = { ...stabilityFocusSettings(id, kind, f, source), ...changes };
    tables.push({
      id: `settings-${tables.length}`,
      title: `${kind} · 실제 설정`,
      columns: ['설정', '값'],
      rows: Object.entries(settings)
    });
    return record(
      kind,
      runStability({ id: `learn_${id.replace('.', '_')}_${tables.length}`, kind, experiment: canonical, settings })
    );
  };
  progress(0.05);
  switch (id) {
    case '6.1': {
      const config = stabilityDrivenConfig(id, f),
        equilibrium = f.equilibrium! * Math.PI,
        flow = createDrivenFlow({ ...config, initialState: [equilibrium, 0, 0] }),
        jac = new Float64Array(9);
      numericalJacobian(
        flow.rhs,
        [equilibrium, 0, 0],
        3,
        jac,
        new Float64Array(3),
        new Float64Array(3),
        new Float64Array(3)
      );
      const eigen = eigenvalues2x2([jac[0]!, jac[1]!, jac[3]!, jac[4]!]);
      tables.push(
        {
          id: 'jacobian',
          title: '공용 numericalJacobian의 물리2×2 블록',
          columns: ['행', 'theta 방향', 'omega 방향'],
          rows: [
            [0, jac[0]!, jac[1]!],
            [1, jac[3]!, jac[4]!]
          ]
        },
        {
          id: 'eigenvalues',
          title: '연속시간 Jacobian 고유값',
          columns: ['실수부 (s^-1)', '허수부 (s^-1)'],
          rows: eigen.map((x) => [x.re, x.im])
        }
      );
      const simulation = createDrivenSimulation(config),
        points = [simulation.snapshot()];
      while (!simulation.done) points.push(simulation.step());
      charts.push({
        id: 'perturbation-response',
        title: '실제 비선형 공용 엔진의 평형 교란 응답',
        xLabel: '시간 (s)',
        yLabel: '평형으로부터 각도 차 (rad)',
        series: [{ label: '비선형 교란', points: points.map((p) => ({ x: p.time, y: p.state[0]! - equilibrium })) }]
      });
      metrics.push(
        metric('max-eigen-real', '최대 연속 고유값 실수부', Math.max(...eigen.map((x) => x.re)), 's^-1'),
        metric('final-perturbation', '최종 평형 각도 차', points.at(-1)!.state[0]! - equilibrium, 'rad')
      );
      warnings.push(
        '구동 진폭0인 자율 진자의 아래/위 평형입니다. 고유값은 연속시간 s^-1이며 반환 맵 승수와 다릅니다. 선형 예측은 작은 교란에서만 유효하며 위 평형에서 커진 교란의 장기 응답을 지수식으로 외삽하지 않습니다.'
      );
      break;
    }
    case '6.2':
      run('periodic-shooting', { period: f.period!, maxIterations: f.iterations! });
      break;
    case '6.3': {
      const r = run('floquet'),
        d = r.details as Record<string, unknown>,
        native = d.native as { determinant?: number } | undefined;
      if (native?.determinant !== undefined)
        metrics.push(
          metric('determinant', 'native 모노드로미 행렬식', native.determinant),
          metric('liouville-target', 'Liouville exp(-gamma*T)', Math.exp((-f.damping! * 2 * Math.PI) / f.frequency!))
        );
      charts.push({
        id: 'multipliers',
        title: '실제 Floquet 승수의 복소평면',
        mode: 'scatter',
        xLabel: 'Re(mu) (1)',
        yLabel: 'Im(mu) (1)',
        series: [
          { label: '승수', points: r.rows.map((row) => ({ x: row[1]!, y: row[2]! })) },
          {
            label: '단위원',
            points: Array.from({ length: 97 }, (_, i) => ({
              x: Math.cos((2 * Math.PI * i) / 96),
              y: Math.sin((2 * Math.PI * i) / 96)
            }))
          }
        ]
      });
      break;
    }
    case '6.4': {
      const r = run('melnikov', { phaseCount: 33, intervals: 2048 });
      metrics.push(
        metric('quadrature-error', '해석식과 분리선 수치 적분 최대 차', Math.max(...r.rows.map((row) => row[3]!)))
      );
      const manifold = stabilityManifoldEvidence(f);
      tables.push(...manifold.tables);
      charts.push(...manifold.charts);
      metrics.push(...manifold.metrics);
      warnings.push(...manifold.warnings);
      break;
    }
    case '6.5':
      run('continuation', { start: 0.2, end: f.endAmplitude!, points: f.points!, maxIterations: 10 });
      break;
    case '6.6':
      run('pseudo-arclength', { guess0: 1, start: 1, ds: f.ds!, steps: f.arcSteps!, maxIterations: 15 });
      break;
    case '6.7':
      run('branch-switch', { epsilon: f.epsilon!, start: 0.02, end: f.endLambda!, points: 7, maxIterations: 15 });
      break;
    case '6.8': {
      const evidence = stabilityCascadeEvidence(f);
      metrics.push(...evidence.metrics);
      tables.push(...evidence.tables);
      charts.push(...evidence.charts);
      warnings.push(...evidence.warnings);
      break;
    }
    case '6.9': {
      run('neimark-sacker', { start: 1.9, end: f.endParameter!, points: 9, maxIterations: 15 });
      const r = run('torus', {
        start: f.circleParameter!,
        end: f.circleParameter! - 0.005,
        points: 2,
        collocation: 21,
        maxIterations: 30
      });
      const detail = r.details as {
        native?: { points?: { curve: number[]; parameter: number; invarianceResidual: number }[] };
      };
      const curves = detail.native?.points ?? [];
      if (curves.length)
        charts.push({
          id: 'invariant-circles',
          title: '실제 native collocation 불변 원',
          xLabel: 'x (1)',
          yLabel: 'y (1)',
          series: curves.map((p) => ({
            label: `a=${p.parameter.toFixed(4)}, residual=${p.invarianceResidual.toExponential(2)}`,
            points: p.curve.flatMap((_, i) => (i % 2 ? [] : [{ x: p.curve[i]!, y: p.curve[i + 1]! }]))
          }))
        });
      metrics.push(
        metric('usable-circles', '잔차·비영 진폭을 통과한 불변 원', r.branch.filter((p) => p.converged).length)
      );
      break;
    }
    case '6.10': {
      for (const coupling of [0, f.coupling! / 2, f.coupling!])
        run('arnold-tongue', { start: 0.3, end: 0.7, points: 25, coupling, iterations: f.iterations!, transient: 500 });
      warnings.push(
        'K=0, K/2, K의 세1차원 절단면을 함께 비교합니다. 유한 표본의 유리수 근접은 열린 폭의 잠김구간 증명이 아니며 더 긴 반복·촘촘한 주파수 격자로 확인하세요.'
      );
      break;
    }
    case '6.11': {
      run('codim-two', {
        resolution: f.resolution!,
        xLow: 0.9,
        xHigh: 1.1,
        yLow: 0.4,
        yHigh: 0.6,
        lyapunovSteps: 500,
        dt: 0.02
      });
      const points = Array.from({ length: 41 }, (_, i) => (f.normalFormB! * i) / 40),
        folds = points.map((b) => ({ b, a: (2 * Math.pow(b, 1.5)) / (3 * Math.sqrt(3)) }));
      tables.push({
        id: 'cusp-normal-form',
        title: '독립 해석적 cusp 기준: a+b*x-x^3=0, 도함수=0',
        columns: ['b (1)', '아래 fold a (1)', '위 fold a (1)', '상태 x+ (1)', 'G 잔차 (1)', 'Gx 잔차 (1)'],
        rows: folds.map((p) => {
          const x = Math.sqrt(p.b / 3),
            a = -p.a;
          return [p.b, -p.a, p.a, x, a + p.b * x - x * x * x, p.b - 3 * x * x];
        })
      });
      charts.push({
        id: 'cusp-curves',
        title: '독립 cusp normal form의 두 fold 곡선과 만남',
        xLabel: 'a (1)',
        yLabel: 'b (1)',
        series: [
          { label: 'fold −', points: folds.map((p) => ({ x: -p.a, y: p.b })) },
          { label: 'fold +', points: folds.map((p) => ({ x: p.a, y: p.b })) }
        ]
      });
      metrics.push(metric('cusp-origin-residual', '독립 cusp 원점의 G=Gx=Gxx 잔차', 0));
      warnings.push(
        'cusp 곡선은 출처가 있는 독립 정규형의 해석적 대수 기하이며 구동 진자의 분기곡선이 아닙니다. 실제 물리 지도는 별도 공용 엔진 유한시간 부호 지도입니다. 두 곡선의 만남과 실제 물리계의 여차원2 인증을 구별하세요.'
      );
      break;
    }
    case '6.12': {
      const series = createDiagnosticSeries(canonical, []);
      for (const kind of ['basin', 'uncertainty', 'wada'] as AdvancedDiagnosticKind[]) {
        const settings = {
            ...defaultAdvancedSettings(kind, canonical),
            resolution: f.resolution!,
            duration: f.duration!,
            dt: f.step!
          },
          r = runAdvancedDiagnostic({ id: `learn_6_12_${kind}`, kind, experiment: canonical, series, settings });
        tables.push(
          { id: kind, title: r.summary, columns: r.columns.map((c, i) => `${c} (${r.units[i]})`), rows: r.rows },
          {
            id: `${kind}-settings`,
            title: `${kind} · 실제 격자 설정`,
            columns: ['설정', '값'],
            rows: Object.entries(settings)
          }
        );
        warnings.push(...r.warnings);
        if (kind === 'basin') {
          charts.push({
            id: 'flip-grid',
            title: '현재 관찰 기간의 실제 반전 label 격자',
            mode: 'scatter',
            xLabel: 'theta1 (rad)',
            yLabel: 'theta2 (rad)',
            series: [0, 1, 2].map((label) => ({
              label: `label ${label}`,
              points: r.rows.filter((row) => row[2] === label).map((row) => ({ x: row[0]!, y: row[1]! }))
            }))
          });
          metrics.push(metric('grid-cells', '기준 격자 셀 수', r.rows.length));
        }
        if (kind === 'wada') {
          const d = r.details as { productVerdict?: string; distinctColorCounts?: number[] };
          tables.push({
            id: 'wada-verdict',
            title: 'Wada 데이터 충분성과 판정',
            columns: ['항목', '값'],
            rows: [
              ['productVerdict', d.productVerdict ?? 'unavailable'],
              ['distinctLabels', JSON.stringify(d.distinctColorCounts ?? [])]
            ]
          });
        }
      }
      break;
    }
  }
  if (!metrics.length)
    metrics.push(
      metric(
        'native-result-rows',
        '공용 분석 결과 표 행 수',
        tables.reduce((n, t) => n + t.rows.length, 0)
      )
    );
  warnings.push(
    '실험실 전달은 표시한 기준 물리 run의 초기조건·SI 단위·적분 설정입니다. 독립 정규형·다양체·격자·계속추적의 별도 source와 설정은 결과 표/JSON에 명시합니다.'
  );
  progress(1);
  return {
    schema: 'pendulum-research-focus/v1',
    unitId: id,
    fields: f,
    canonical,
    metrics,
    tables,
    charts,
    warnings: [...new Set(warnings)]
  };
}
