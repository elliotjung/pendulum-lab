import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { switchPeriodDoubling, drivenPeriodicOrbitN } from '../../chaos/branchSwitching';
import { runStability } from '../adapters/analysis/stability/execute';
import { stabilityFocusCanonical, stabilityFocusSettings } from './stability-focus-config';
import { bifurcationDiagram } from '../../chaos/poincare';
import { detectBifurcations } from '../../chaos/bifurcationDetect';
import { rhsDriven } from '../../physics/driven';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
/** All shooting, transient integration, cycle classification and multipliers use preserved native kernels. */
export function stabilityCascadeEvidence(
  f: ResearchFields
): Pick<ResearchFocusResult, 'metrics' | 'tables' | 'charts' | 'warnings'> {
  const p = {
      g: f.g!,
      length: f.length!,
      damping: f.damping!,
      driveAmplitude: f.amplitude!,
      driveFrequency: f.frequency!
    },
    dt = (2 * Math.PI) / p.driveFrequency / 256,
    settings = stabilityFocusSettings('6.8', 'continuation', f),
    branch = runStability({
      id: 'learn_cascade_primary',
      kind: 'continuation',
      experiment: stabilityFocusCanonical('6.8', f),
      settings
    });
  const anchor = drivenPeriodicOrbit(p, [f.theta!, f.omega!], {
      dt,
      tolerance: 1e-8,
      maxIterations: 16
    }),
    switched = switchPeriodDoubling(p, anchor.orbit, {
      dt,
      tolerance: 1e-8,
      maxIterations: 16,
      seedSteps: [0.02, 0.05, 0.1]
    });
  const observedStates: [number, number][][] = [];
  const parameters = Array.from(
      { length: f.scanPoints! },
      (_, i) => 1.06 + ((f.endAmplitude! - 1.06) * i) / (f.scanPoints! - 1)
    ),
    columns = bifurcationDiagram({
      parameters,
      makeRhs: (amplitude) => (state, out) => rhsDriven(state, { ...p, driveAmplitude: amplitude }, out),
      makeState0: () => {
        observedStates.push([]);
        return [switched.doubled.orbit[0] + 0.001, switched.doubled.orbit[1], 0];
      },
      section: (state) => Math.sin(state[2]!),
      direction: 'rising',
      observable: (state) => {
        observedStates.at(-1)!.push([state[0]!, state[1]!]);
        return state[0]!;
      },
      dt,
      maxTime: (160 * 2 * Math.PI) / p.driveFrequency,
      transientCrossings: 128,
      maxPointsPerParam: 16
    }),
    scan = detectBifurcations(columns, { tolerance: 0.003 });
  const rows: number[][] = [];
  for (const [columnIndex, column] of columns.entries()) {
    const seed = observedStates[columnIndex]?.[0] ?? switched.doubled.orbit;
    for (const period of [1, 2, 4]) {
      const result = drivenPeriodicOrbitN({ ...p, driveAmplitude: column.param }, seed, period, {
          dt,
          tolerance: 1e-7,
          maxIterations: 8
        }),
        separation =
          period === 1
            ? 0
            : Math.min(
                ...result.cycle.slice(1).map((x) => Math.hypot(x[0] - result.cycle[0]![0], x[1] - result.cycle[0]![1]))
              );
      rows.push([column.param, period, result.converged ? 1 : 0, result.residual, result.maxModulus, separation]);
    }
  }
  return {
    metrics: [
      { id: 'first-switch', label: '실제 주기1→2 가지 분리 성공 (1=예)', value: switched.switched ? 1 : 0, unit: '1' },
      {
        id: 'cascade-candidates',
        label: '유한 strobe 배가 후보 수',
        value: scan.events.filter((e) => e.type === 'period-doubling').length,
        unit: '1'
      }
    ],
    tables: [
      {
        id: 'period-one-branch',
        title: '실제 주기1 branch의 승수와 안정성',
        columns: ['A (rad/s^2)', 'theta (rad)', 'omega (rad/s)', 'max|mu|', '수렴 (1=예)'],
        rows: branch.rows.map((row) => [row[0]!, row[1]!, row[2]!, row[4]!, row[5]!])
      },
      {
        id: 'primary-continuation-settings',
        title: '실험실로 전달되는 실제 continuation 설정',
        columns: ['설정', '값'],
        rows: Object.entries(settings)
      },
      {
        id: 'periodic-multipliers',
        title: 'native P^1/P^2/P^4 shooting: 잔차·승수·중복 검사',
        columns: ['A (rad/s^2)', '요청 주기', '수렴', '잔차 (혼합 norm)', 'max|mu|', '최소 cycle 분리 (혼합 norm)'],
        rows
      },
      {
        id: 'strobe-counts',
        title: '동일 과도구간 뒤 실제 strobe distinct count',
        columns: ['A (rad/s^2)', '서로 다른 표본 수'],
        rows: parameters.map((a, i) => [a, scan.counts[i]!])
      },
      {
        id: 'doubling-brackets',
        title: '표본 사이 분기 후보 구간',
        columns: ['이전 A', '현재 A', '이전 count', '현재 count', '종류'],
        rows: scan.events.map((e) => [e.previousParam, e.param, e.fromCount, e.toCount, e.type])
      }
    ],
    charts: [
      {
        id: 'cascade-strobes',
        title: '공용 엔진 구동 진자의 유한 stroboscopic cascade',
        mode: 'scatter',
        xLabel: 'A (rad/s^2)',
        yLabel: 'theta (rad)',
        series: [{ label: '실제 반환 표본', points: columns.flatMap((c) => c.values.map((y) => ({ x: c.param, y }))) }]
      }
    ],
    warnings: [
      scan.caveat,
      'P^4의 해는 P^1/P^2를 포함합니다. 수렴만으로 원시 주기4를 주장하지 않고 cycle 분리와 실제 strobe 수를 함께 확인하세요. 유한 격자의 배가 후보는 위치를 괄호로만 한정하며 Feigenbaum 극한 비율이나 무한 cascade를 인증하지 않습니다.',
      '각 구동 진폭은 같은128주기 과도구간과16표본 조건입니다. 느린 수렴·미수렴·위상 이탈은 가짜 distinct count를 만들 수 있으므로 관찰 길이와 tolerance를 바꾸어 확인하세요.'
    ]
  };
}
