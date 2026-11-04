import { chainMassMatrix } from '../../physics/nPendulum';
import { sphericalChainMassMatrix } from '../../physics/sphericalChain';
import { compoundDoubleMassMatrix } from '../../physics/compoundDouble';
import { doubleMassMatrix } from '../../physics/canonical';
import { energySpring } from '../../physics/spring';
import { createChainSimulation } from '../adapters/physics/chain';
import { compoundComparison } from './extended-compound';
import {
  createSpatialSimulation,
  spatialInitialAngles,
  withSpatialAngles,
  defaultSpatialConfig
} from '../adapters/physics/spatial';
import { planarWarnings } from '../adapters/physics/planar-schema';
import { chainWarnings } from '../adapters/physics/chain-schema';
import { constraintWarnings, type ConstraintEvent } from '../adapters/physics/constraint-schema';
import { spatialWarnings } from '../adapters/physics/spatial-schema';
import { buildBatch } from '../lab/experiments/builders';
import { executeBatchRun } from '../lab/experiments/execute';
import { aggregateBatch } from '../lab/experiments/aggregate';
import type { BatchSnapshot } from '../lab/experiments/contracts';
import { validateBatchSnapshot } from '../lab/experiments/validation';
import {
  extendedCanonical,
  extendedConfig,
  extendedSimulation,
  validateExtendedFields,
  type ExtendedFields,
  type ExtendedConfig
} from './extended-config';
import { numericalDiagnostics } from './extended-numerical';
import {
  extendedMetric as metric,
  type ExtendedMetric,
  type ExtendedTable,
  type ExtendedTrace,
  type ExtendedResult
} from './extended-results';

const matrixTable = (id: string, title: string, values: ArrayLike<number>, n: number): ExtendedTable => ({
  id,
  title,
  columns: ['행', ...Array.from({ length: n }, (_, i) => `열 ${i + 1} (kg*m^2)`)],
  rows: Array.from({ length: n }, (_, i) => [i + 1, ...Array.from({ length: n }, (_, j) => Number(values[i * n + j]))])
});
export function extendedBatchPlan(unitId: string, fields: ExtendedFields) {
  const source = extendedCanonical({ id: unitId, courseId: `course-${unitId[0]}`, contentVersion: 1 }, fields);
  return buildBatch(source, {
    kind: 'integrators',
    axes: [],
    count: 3,
    seed: 'learn-course-2-2.9',
    concurrency: 2,
    integratorIds: ['integrator:rk4', 'integrator:rk2', 'integrator:euler']
  });
}
export function extendedBatchSnapshot(unitId: string, fields: ExtendedFields): BatchSnapshot {
  const plan = extendedBatchPlan(unitId, fields),
    runs = plan.runs.map((run) => ({
      id: run.id,
      index: run.index,
      status: 'completed' as const,
      attempts: 1,
      progress: 1,
      result: executeBatchRun({ batchId: plan.id, run })
    }));
  return {
    schema: 'pendulum-batch/v1',
    algorithmVersion: 'batch-experiments-v1',
    plan,
    status: 'completed',
    progress: 1,
    runs,
    aggregate: aggregateBatch(plan, runs)
  };
}
function nativeWarnings(source: ExtendedConfig): readonly string[] {
  switch (source.family) {
    case 'planar':
      return planarWarnings(source.config);
    case 'chain':
      return chainWarnings(source.config);
    case 'constraint':
      return constraintWarnings(source.config);
    case 'spatial':
      return spatialWarnings(source.config);
  }
}
function asTrace(
  raw: ReturnType<ReturnType<typeof extendedSimulation>['snapshot']>,
  source: ExtendedConfig
): ExtendedTrace {
  const p = raw.positions;
  const positions = Array.isArray(p) ? p : 'first' in p ? [p.first, p.second] : [];
  let constraint = 'constraintErrors' in raw ? Math.max(0, ...raw.constraintErrors) : 0;
  if (source.family === 'planar' && positions.length === 2) {
    const a = positions[0]!,
      b = positions[1]!;
    constraint = Math.max(
      Math.abs(Math.hypot(a.x, a.y) - source.config.parameters.l1),
      Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - source.config.parameters.l2)
    );
  }
  return {
    time: raw.time,
    state: [...raw.state],
    energy: raw.energy.total,
    positions: positions.map((p) => ({ ...p })),
    constraint,
    ...('tensions' in raw ? { tensions: [...raw.tensions], phase: raw.phase } : {}),
    ...('verticalMomentum' in raw
      ? {
          verticalMomentum: raw.verticalMomentum,
          unitConstraint: Math.max(0, ...raw.unitConstraintErrors),
          tangentConstraint: Math.max(0, ...raw.tangentConstraintErrors),
          poleProximity: Math.min(...raw.poleProximity)
        }
      : {})
  };
}
function systemDiagnostics(
  id: string,
  source: ExtendedConfig,
  trace: readonly ExtendedTrace[],
  events: readonly ConstraintEvent[],
  metrics: ExtendedMetric[],
  tables: ExtendedTable[],
  warnings: string[]
): void {
  if (source.family === 'chain') {
    const c = source.config,
      n = c.parameters.masses.length,
      m = chainMassMatrix(c.initialState, c.parameters);
    tables.push(matrixTable('mass-matrix', `현재 ${n}링크 공용 질량행렬`, m, n));
    metrics.push(
      metric('degrees-of-freedom', '자유도', n, '1'),
      metric('state-dimension', '상태 차원', 2 * n, '1'),
      metric('matrix-entries', '밀집 행렬 원소 수', m.length, '1')
    );
    if (id === '3.1') {
      const two = {
        masses: c.parameters.masses.slice(0, 2),
        lengths: c.parameters.lengths.slice(0, 2),
        g: c.parameters.g
      };
      tables.push(
        matrixTable(
          'two-link-mass-matrix',
          '같은 앞 두 링크만 있는 2링크 모형',
          chainMassMatrix(c.initialState.slice(0, 2), two),
          2
        )
      );
      const companion = createChainSimulation({ ...c, systemId: 'system:chain' }),
        triple = createChainSimulation(c);
      const a = companion.step(),
        b = triple.step();
      metrics.push(
        metric(
          'triple-chain-step-distance',
          '삼중 전용/일반 사슬의 한 단계 차이',
          Math.hypot(...a.state.map((v, i) => v - b.state[i]!)),
          '1'
        )
      );
      warnings.push(
        '2링크와 3링크의 행렬은 아래쪽 질량 누적이 달라집니다. 3링크 행렬의 왼쪽 위 블록을 자르는 것만으로 2링크 모형을 얻지 못합니다.'
      );
    }
  }
  if (id === '3.3' && source.family === 'planar') {
    const c = source.config,
      rod = compoundDoubleMassMatrix(c.initialState, c.parameters),
      point = doubleMassMatrix(c.initialState[0], c.initialState[1], c.parameters);
    tables.push(
      matrixTable('compound-matrix', '공용 균일 막대 관성행렬', [rod.m11, rod.m12, rod.m12, rod.m22], 2),
      matrixTable('point-matrix', '같은 끝점 질량 모형 관성행렬', [point.m11, point.m12, point.m12, point.m22], 2)
    );
    const comparison = compoundComparison(c, trace);
    metrics.push(...comparison.metrics);
    tables.push(...comparison.tables);
    warnings.push(...comparison.warnings);
    warnings.push(
      '이 adapter는 균일 막대만 지원합니다. 질량과 길이 변화는 임의의 질량중심 이동과 같지 않습니다. 막대/질점 모형의 총질량이 같아도 관성과 중력 퍼텐셜이 함께 달라집니다.'
    );
  }
  if (id === '3.4' && source.family === 'constraint') {
    const p = {
      mass: source.config.parameters.mass!,
      stiffness: source.config.parameters.stiffness!,
      restLength: source.config.parameters.restLength!,
      g: source.config.parameters.g!
    };
    const rows = trace
      .filter((_, i) => i % Math.max(1, Math.ceil(trace.length / 100)) === 0)
      .map((s) => {
        const [r, t, rd, w] = s.state;
        const radial = energySpring([r!, t!, rd!, 0], p).KE,
          tangent = energySpring([r!, t!, 0, w!], p).KE,
          elastic = energySpring([r!, t!, 0, 0], { ...p, g: 0 }).PE;
        return [s.time, r!, t!, radial, tangent, elastic, s.energy];
      });
    tables.push({
      id: 'radial-angular-exchange',
      title: '길이·각도와 공용 에너지 평가의 성분',
      columns: ['시간 (s)', 'r (m)', 'theta (rad)', '방사 KE (J)', '각운동 KE (J)', '탄성 PE (J)', '총 E (J)'],
      rows
    });
    warnings.push(
      '중력 퍼텐셜과 탄성 퍼텐셜의 기준을 구분하세요. 각 모드 에너지가 따로 보존되는 것이 아니라 전체 공용 에너지를 확인합니다.'
    );
  }
  if (source.family === 'constraint' && source.config.systemId !== 'system:spring') {
    tables.push({
      id: 'constraint-events',
      title: '원 엔진의 이완·재포획 사건 순서',
      columns: ['순서', '시간 (s)', '유형', '링크', '발생 경계', '기록 포획 손실 (J)', '잔차', '단위'],
      rows: events.map((e) => [e.sequence, e.time, e.type, e.link, e.source, e.energyLoss, e.residual, e.residualUnit])
    });
    tables.push({
      id: 'tension-timeline',
      title: '장력·구속 상태 시간표 (최대 100행)',
      columns: ['시간 (s)', '상태', '장력1 (N)', '장력2 (N)', '구속 잔차 (m)'],
      rows: trace
        .filter((_, i) => i % Math.max(1, Math.ceil(trace.length / 100)) === 0)
        .map((s) => [s.time, s.phase ?? '', s.tensions?.[0] ?? 0, s.tensions?.[1] ?? '해당 없음', s.constraint ?? 0])
    });
    metrics.push(
      metric('event-count', '기록한 사건 수', events.length, '1'),
      metric(
        'integration-event-count',
        '적분 중 검출 사건 수',
        events.filter((e) => e.source === 'integration').length,
        '1'
      ),
      metric(
        'capture-loss-sum',
        '기록 포획 손실 합',
        events.reduce((a, e) => a + e.energyLoss, 0),
        'J'
      )
    );
    warnings.push(
      'source=initial-condition인 t=0 이완은 초기 장력 유효성 판정이며 시간 적분의 0 교차 검출이 아닙니다. 사건 시각은 기존 hybrid 엔진의 추정값입니다.'
    );
  }
  if (source.family === 'spatial') {
    const n = source.config.parameters.masses.length;
    metrics.push(metric('spatial-links', '공간 링크 수', source.config.parameters.masses.length, '1'));
    metrics.push(
      metric('degrees-of-freedom', '물리적 자유도', 2 * n, '1'),
      metric('state-dimension', '저장 상태 차원', source.config.initialState.length, '1'),
      metric('inertia-order', '최소좌표 관성행렬 차수', 2 * n, '1')
    );
    if (id === '3.8') {
      const m = sphericalChainMassMatrix(spatialInitialAngles(source.config), source.config.parameters);
      tables.push(matrixTable('spatial-mass-matrix', '공용 구면 사슬 관성행렬', m, 2 * n));
      metrics.push(metric('matrix-entries', '최소좌표 관성행렬 원소 수', m.length, '1'));
    }
    tables.push({
      id: 'spatial-precession',
      title: '공간 궤적·수직 각운동량·구속',
      columns: [
        '시간 (s)',
        '첫 x (m)',
        '첫 y (m)',
        '첫 z (m)',
        'Ly (kg*m^2/s)',
        '길이 잔차 (m)',
        '단위 방향 잔차 (1)',
        '접선 잔차 (1/s)'
      ],
      rows: trace
        .filter((_, i) => i % Math.max(1, Math.ceil(trace.length / 100)) === 0)
        .map((s) => [
          s.time,
          s.positions[0]!.x,
          s.positions[0]!.y,
          s.positions[0]!.z ?? 0,
          s.verticalMomentum ?? 0,
          s.constraint ?? 0,
          s.unitConstraint ?? 0,
          s.tangentConstraint ?? 0
        ])
    });
    if (id === '3.9') {
      const c = source.config,
        angles = spatialInitialAngles(c),
        polar = withSpatialAngles(
          { ...defaultSpatialConfig('system:spherical'), parameters: c.parameters, step: c.step, duration: c.duration },
          angles
        ),
        rows: (number | string)[][] = [];
      let count = 0;
      try {
        const sim = createSpatialSimulation(polar),
          base = createSpatialSimulation(c),
          a0 = sim.snapshot().positions[0]!,
          b0 = base.snapshot().positions[0]!;
        const initialDistance = Math.hypot(a0.x - b0.x, a0.y - b0.y, a0.z - b0.z);
        metrics.push(metric('initial-cartesian-distance', '최소/매입 초기 Cartesian 위치 차이', initialDistance, 'm'));
        rows.push([
          0,
          initialDistance,
          sim.snapshot().poleProximity[0]!,
          Math.max(...base.snapshot().constraintErrors)
        ]);
        while (!sim.done) {
          const p = sim.step(),
            b = base.step();
          if (count++ % Math.max(1, Math.ceil(c.duration / c.step / 100)) === 0 || sim.done) {
            const a = p.positions[0]!,
              z = b.positions[0]!;
            rows.push([
              p.time,
              Math.hypot(a.x - z.x, a.y - z.y, a.z - z.z),
              p.poleProximity[0]!,
              Math.max(...b.constraintErrors)
            ]);
          }
        }
        warnings.push(
          '극좌표 비교가 종료되었습니다. 극점 근처 방위각은 유일하지 않으므로 Cartesian 궤적 거리로 비교합니다.'
        );
      } catch (error) {
        warnings.push(
          `극좌표 비교 중지: ${error instanceof Error ? error.message.slice(0, 200) : '좌표 실패'}. 매입 좌표의 유효한 baseline 결과는 보존했습니다.`
        );
      }
      tables.push({
        id: 'embedded-polar',
        title: '같은 물리 초기조건의 최소/매입 좌표 비교',
        columns: ['시간 (s)', 'Cartesian 궤적 거리 (m)', '최소좌표 |sin(theta)|', '매입 구속 잔차 (m)'],
        rows
      });
      metrics.push(metric('polar-companion-samples', '극좌표 비교 단계 수', count, '1'));
    }
  }
}

/** This synchronous entry is called only by the dedicated worker or deterministic science tests. */
export function executeExtendedExperiment(
  unitId: string,
  input: ExtendedFields,
  onProgress: (fraction: number) => void = () => undefined,
  providedBatch?: BatchSnapshot
): ExtendedResult {
  const fields = validateExtendedFields(unitId, input),
    source = extendedConfig(unitId, fields),
    native = extendedSimulation(source),
    start = performance.now();
  const initial = native.snapshot(),
    trace: ExtendedTrace[] = [asTrace(initial, source)],
    events: ConstraintEvent[] = [];
  const warnings = [...nativeWarnings(source)],
    metrics: ExtendedMetric[] = [],
    tables: ExtendedTable[] = [];
  const steps = Math.ceil(fields.duration! / fields.step!),
    stride = Math.max(1, Math.ceil(steps / 800));
  let count = 0,
    maxEnergy = 0,
    maxConstraint = 0,
    minEnergy = initial.energy.total,
    maxRawEnergy = initial.energy.total,
    maxUnit = 0,
    maxTangent = 0,
    minPole = 1,
    maxVerticalMomentumDeviation = 0;
  const collect = (raw: ReturnType<typeof native.snapshot>) => {
    const s = asTrace(raw, source);
    maxEnergy = Math.max(maxEnergy, Math.abs(s.energy - initial.energy.total));
    minEnergy = Math.min(minEnergy, s.energy);
    maxRawEnergy = Math.max(maxRawEnergy, s.energy);
    maxConstraint = Math.max(maxConstraint, s.constraint ?? 0);
    maxUnit = Math.max(maxUnit, s.unitConstraint ?? 0);
    maxTangent = Math.max(maxTangent, s.tangentConstraint ?? 0);
    minPole = Math.min(minPole, s.poleProximity ?? 1);
    maxVerticalMomentumDeviation = Math.max(
      maxVerticalMomentumDeviation,
      Math.abs((s.verticalMomentum ?? 0) - (trace[0]!.verticalMomentum ?? 0))
    );
    if ('events' in raw) events.push(...raw.events);
    if ('warnings' in raw) for (const w of raw.warnings) if (!warnings.includes(w)) warnings.push(w);
    return s;
  };
  collect(initial);
  onProgress(0);
  while (!native.done) {
    const sample = native.step();
    count++;
    if (count > 20000) throw new Error('전용 실험 단계 한도를 넘었습니다.');
    const s = collect(sample);
    if (count % stride === 0 || native.done) trace.push(s);
    if (count % 64 === 0) onProgress((0.6 * count) / steps);
  }
  metrics.push(
    metric('steps', 'baseline 적분 단계 수', count, '1'),
    metric('elapsed-ms', 'baseline 계산 시간 (환경 의존)', Math.max(0, performance.now() - start), 'ms'),
    metric('initial-energy', 'baseline 초기 에너지', initial.energy.total, 'J'),
    metric('energy-max-deviation', 'baseline 최대 에너지 변화', maxEnergy, 'J'),
    metric('energy-min', 'baseline 최소 에너지', minEnergy, 'J'),
    metric('energy-max', 'baseline 최대 에너지', maxRawEnergy, 'J'),
    metric('constraint-max', 'baseline 최대 구속 잔차', maxConstraint, 'm')
  );
  if (source.family === 'spatial')
    metrics.push(
      metric('unit-constraint-max', '전 단계 최대 단위 방향 잔차', maxUnit, '1'),
      metric('tangent-constraint-max', '전 단계 최대 접선 잔차', maxTangent, 's^-1'),
      metric('pole-proximity-min', '전 단계 최소 |sin(theta)|', minPole, '1'),
      metric('vertical-momentum-drift', '전 단계 수직 각운동량의 최대 편차', maxVerticalMomentumDeviation, 'kg*m^2/s')
    );
  onProgress(0.65);
  const numerical = numericalDiagnostics(unitId, source, fields, trace);
  metrics.push(...numerical.metrics);
  tables.push(...numerical.tables);
  warnings.push(...numerical.warnings);
  systemDiagnostics(unitId, source, trace, events, metrics, tables, warnings);
  let batch: BatchSnapshot | undefined;
  if (unitId === '2.9') {
    batch = providedBatch ? validateBatchSnapshot(providedBatch) : extendedBatchSnapshot(unitId, fields);
    if (batch.status !== 'completed' || batch.plan.id !== extendedBatchPlan(unitId, fields).id)
      throw new Error('S21 비교 결과가 단원의 입력과 다릅니다.');
    tables.push(batchTable(batch));
    metrics.push(metric('batch-runs', 'S21 완료 비교 run', batch.aggregate.completed, '1'));
    warnings.push(...batch.plan.warnings);
  }
  onProgress(1);
  const result: ExtendedResult = {
    schema: 'pendulum-learn-diagnostics/v1',
    algorithmVersion: 'learn-extended-v1',
    unitId,
    canonical: extendedCanonical({ id: unitId, courseId: `course-${unitId[0]}`, contentVersion: 1 }, fields),
    fields,
    metrics,
    tables,
    trace,
    warnings: [...new Set(warnings)],
    companions: numerical.companions,
    ...(batch ? { batch } : {})
  };
  // Native signed zeros are physically identical; the JSON artifact has one finite representation.
  return JSON.parse(
    JSON.stringify(result, (_key, value: unknown) => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('전용 실험 결과에 유한하지 않은 수가 있습니다.');
        return value === 0 ? 0 : value;
      }
      return value;
    })
  ) as ExtendedResult;
}
export function batchTable(batch: BatchSnapshot): ExtendedTable {
  return {
    id: 'batch-comparison',
    title: 'S21의 동일 초기조건·기간 적분기 비교',
    columns: ['run', '적분기', '상태', '실제 단계 수', '에너지 변화 (J)'],
    rows: batch.runs.map((r, i) => {
      const integrator = batch.plan.runs[i]!.experiment.integrator;
      return [
        r.id,
        integrator.kind === 'selectable' ? integrator.id : 'internal',
        r.status,
        r.result?.summary.steps ?? 0,
        r.result?.summary.energy?.change ?? 0
      ];
    })
  };
}
