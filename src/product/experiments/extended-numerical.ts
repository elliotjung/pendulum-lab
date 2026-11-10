import { integrateAdaptive, replayAcceptedSteps } from '../../physics/adaptive';
import {
  adaptiveReplaySpecifications,
  appendAdaptiveReplayRun,
  createAdaptiveReplayArchive,
  type AdaptiveReplayArchiveV1
} from './adaptive-replay-archive';
import {
  omegaToMomentum,
  implicitMidpointCanonical,
  canonicalRhs,
  canonicalHamiltonian
} from '../../physics/canonical';
import { rk4Step, rk2Step, eulerStep } from '../../physics/integrators';
import { trBdf2Step } from '../../physics/stiff';
import { rhsSpring } from '../../physics/spring';
import { poincareSection } from '../../chaos/poincare';
import type { Derivative, StepDiagnostics } from '../../physics/types';
import { createPlanarSimulation, type PlanarConfig } from '../adapters/physics/planar';
import type { ConstraintConfig } from '../adapters/physics/constraint';
import type { ExtendedConfig, ExtendedFields } from './extended-config';
import {
  extendedMetric as metric,
  type ExtendedMetric,
  type ExtendedTable,
  type ExtendedCompanion,
  type ExtendedTrace
} from './extended-results';

export interface NumericalDiagnostics {
  metrics: ExtendedMetric[];
  tables: ExtendedTable[];
  companions: ExtendedCompanion[];
  warnings: string[];
  adaptiveArchive?: AdaptiveReplayArchiveV1;
}
const distance = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Math.hypot(...Array.from({ length: a.length }, (_, i) => Number(a[i]) - Number(b[i])));
function endpoint(config: PlanarConfig): readonly number[] {
  const s = createPlanarSimulation(config);
  while (!s.done) s.step();
  return s.snapshot().state;
}
/** Count the RHS calls of the existing native fixed steppers, without estimating stages. */
function measuredEndpoint(config: PlanarConfig): { state: readonly number[]; calls: number; steps: number } {
  const native = createPlanarSimulation(config),
    state = Float64Array.from(config.initialState),
    out = new Float64Array(4);
  let calls = 0;
  const rhs: Derivative = (x, out) => {
    calls++;
    native.derivative(x, out);
  };
  const ratio = config.duration / config.step,
    steps = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  const stepper =
    config.integratorId === 'integrator:euler'
      ? eulerStep
      : config.integratorId === 'integrator:rk2'
        ? rk2Step
        : rk4Step;
  for (let i = 0; i < steps; i++) {
    const remaining = config.duration - i * config.step;
    const dt =
      Math.abs(remaining - config.step) <= 8 * Number.EPSILON * config.duration
        ? config.step
        : Math.min(config.step, remaining);
    stepper(state, dt, rhs, out);
    state.set(out);
  }
  return { state: Array.from(state), calls, steps };
}
function finiteMapResidual(map: (x: Float64Array) => Float64Array, initial: Float64Array): number {
  const n = 4,
    eps = 1e-5,
    jac = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let k = 0; k < n; k++) {
    const a = new Float64Array(initial),
      b = new Float64Array(initial);
    a[k] = a[k]! + eps;
    b[k] = b[k]! - eps;
    const fa = map(a),
      fb = map(b);
    for (let r = 0; r < n; r++) jac[r]![k] = (fa[r]! - fb[r]!) / (2 * eps);
  }
  const omega = (i: number, j: number) => (i < 2 && j === i + 2 ? 1 : i >= 2 && j === i - 2 ? -1 : 0);
  let error = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let v = 0;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) v += jac[a]![i]! * omega(a, b) * jac[b]![j]!;
      error = Math.max(error, Math.abs(v - omega(i, j)));
    }
  return error;
}
function canonicalDiagnostics(c: PlanarConfig): NumericalDiagnostics {
  const initial = omegaToMomentum(c.initialState, c.parameters),
    baseEnergy = canonicalHamiltonian(initial, c.parameters).total;
  let mid: Float64Array = new Float64Array(initial),
    rk: Float64Array = new Float64Array(initial),
    maxMid = 0,
    maxRk = 0,
    maxResidual = 0,
    iterations = 0;
  const rhs: Derivative = (x, out) => {
    out.set(canonicalRhs(x, c.parameters, 0));
  };
  const rows: (number | string)[][] = [[0, baseEnergy, baseEnergy, 0]],
    n = Math.ceil(c.duration / c.step),
    stride = Math.max(1, Math.ceil(n / 100));
  for (let i = 0; i < n; i++) {
    const dt = Math.min(c.step, c.duration - i * c.step),
      m = implicitMidpointCanonical(mid, dt, c.parameters, 0, 1e-11, 60);
    if (!m.stats.converged) throw new Error('정준 implicit midpoint가 수렴하지 않았습니다. 시간 간격을 줄이세요.');
    mid = m.state;
    const next = new Float64Array(4);
    rk4Step(rk, dt, rhs, next);
    rk = next;
    const em = canonicalHamiltonian(mid, c.parameters).total,
      er = canonicalHamiltonian(rk, c.parameters).total;
    maxMid = Math.max(maxMid, Math.abs(em - baseEnergy));
    maxRk = Math.max(maxRk, Math.abs(er - baseEnergy));
    maxResidual = Math.max(maxResidual, m.stats.residual);
    iterations += m.stats.iterations;
    if ((i + 1) % stride === 0 || i === n - 1)
      rows.push([Math.min((i + 1) * c.step, c.duration), em, er, m.stats.residual]);
  }
  const symplectic = finiteMapResidual((x) => {
    const r = implicitMidpointCanonical(x, c.step, c.parameters, 0, 1e-11, 60);
    if (!r.stats.converged) throw new Error('면적 검증의 implicit midpoint가 수렴하지 않았습니다.');
    return r.state;
  }, initial);
  const rkResidual = finiteMapResidual((x) => {
    const out = new Float64Array(4);
    rk4Step(x, c.step, rhs, out);
    return out;
  }, initial);
  return {
    metrics: [
      metric('midpoint-energy-max', '정준 midpoint 최대 에너지 편차', maxMid, 'J'),
      metric('rk4-canonical-energy-max', '정준 RK4 최대 에너지 편차', maxRk, 'J'),
      metric('symplectic-residual', 'midpoint 정준 2-form 잔차', symplectic, '1'),
      metric('rk4-symplectic-residual', 'RK4 정준 2-form 잔차', rkResidual, '1'),
      metric('midpoint-solver-residual', 'midpoint 최대 반복 잔차', maxResidual, 'mixed SI'),
      metric('midpoint-iterations', 'midpoint 총 반복 수', iterations, '1')
    ],
    tables: [
      {
        id: 'canonical-energy',
        title: '정준 좌표에서 장시간 에너지 비교',
        columns: ['시간 (s)', 'midpoint H (J)', 'RK4 H (J)', '반복 잔차 (mixed SI)'],
        rows
      }
    ],
    companions: [
      {
        id: 'canonical-midpoint',
        settings: {
          step: c.step,
          duration: c.duration,
          tolerance: 1e-11,
          maxIterations: 60,
          coordinates: 'theta,p',
          gamma: 0
        },
        description:
          '기존 canonical.ts의 정확한 Hamiltonian과 implicitMidpointCanonical. 반복 수렴이 확인된 결과만 수락합니다.'
      },
      {
        id: 'canonical-rk4',
        settings: { step: c.step, duration: c.duration, coordinates: 'theta,p' },
        description: '같은 canonicalRhs에 기존 RK4를 적용합니다. baseline Lab은 theta,omega/RK4 설정으로 전달됩니다.'
      }
    ],
    warnings: [
      '정준 2-form 잔차는 SI 기준 척도의 유한차분 1단계 검증이며 장시간 보존의 증명이 아닙니다. theta,omega 평면 면적은 정준 면적이 아닙니다. 에너지 편차는 동일 유한 기간의 관찰값입니다.'
    ]
  };
}
function stiffDiagnostics(c: ConstraintConfig): NumericalDiagnostics {
  const p = {
    mass: c.parameters.mass!,
    stiffness: c.parameters.stiffness!,
    restLength: c.parameters.restLength!,
    g: c.parameters.g!
  };
  let nfev = 0;
  const rhs: Derivative = (x, out) => {
    nfev++;
    rhsSpring(x, p, out);
  };
  let implicit = Float64Array.from(c.initialState),
    explicit = Float64Array.from(c.initialState),
    maxResidual = 0,
    iterations = 0;
  const rows: (number | string)[][] = [],
    n = Math.ceil(c.duration / c.step),
    frequency = Math.sqrt(p.stiffness / p.mass);
  for (let i = 0; i < n; i++) {
    const dt = Math.min(c.step, c.duration - i * c.step),
      out = new Float64Array(4),
      report: Partial<StepDiagnostics> = {};
    trBdf2Step(implicit, dt, rhs, out, { tolerance: 1e-10, diagnostics: report });
    if (!report.converged) throw new Error('TR-BDF2 단계가 수렴하지 않았습니다. 시간 간격을 줄이세요.');
    implicit = out;
    maxResidual = Math.max(maxResidual, report.residualNorm ?? 0);
    iterations += report.iterations ?? 0;
    const next = new Float64Array(4);
    eulerStep(explicit, dt, rhs, next);
    explicit = next;
    if (![...explicit].every(Number.isFinite)) throw new Error('비교 Euler 결과가 발산했습니다. 간격을 줄이세요.');
    if (i % Math.max(1, Math.ceil(n / 100)) === 0 || i === n - 1)
      rows.push([
        Math.min((i + 1) * c.step, c.duration),
        implicit[0]!,
        explicit[0]!,
        p.restLength +
          (c.initialState[0]! - p.restLength) * Math.cos(frequency * Math.min((i + 1) * c.step, c.duration))
      ]);
  }
  const exact = p.restLength + (c.initialState[0]! - p.restLength) * Math.cos(frequency * c.duration);
  return {
    metrics: [
      metric('radial-frequency', '방사 고유각주파수', frequency, 'rad/s'),
      metric('stiffness-step', 'h sqrt(k/m)', frequency * c.step, '1'),
      metric('implicit-r-error', 'TR-BDF2 끝점 반지름 오차', Math.abs(implicit[0]! - exact), 'm'),
      metric('euler-r-error', 'Euler 끝점 반지름 오차', Math.abs(explicit[0]! - exact), 'm'),
      metric('implicit-residual', 'TR-BDF2 최대 Newton 잔차', maxResidual, 'mixed SI'),
      metric('implicit-iterations', 'TR-BDF2 총 반복 수', iterations, '1'),
      metric('stiff-rhs-evaluations', '두 비교법의 RHS 평가 합', nfev, '1')
    ],
    tables: [
      {
        id: 'stiff-radius',
        title: '같은 방사 용수철의 explicit/implicit 비교',
        columns: ['시간 (s)', 'TR-BDF2 r (m)', 'Euler r (m)', 'g=0 방사 정확해 r (m)'],
        rows
      }
    ],
    companions: [
      {
        id: 'tr-bdf2',
        settings: { step: c.step, duration: c.duration, tolerance: 1e-10, stiffness: p.stiffness },
        description: '기존 rhsSpring과 trBdf2Step; 모델을 다시 구현하지 않습니다.'
      }
    ],
    warnings: [
      'g=0, theta=omega=rDot(0)=0의 순수 방사 초기조건에서만 표시한 cosine 정확해를 사용합니다. 강성계의 빠른 진동 안정성과 정확도는 별개입니다. TR-BDF2의 수치 감쇠는 물리 감쇠가 아니며 baseline Lab은 RK4입니다.'
    ]
  };
}
export function numericalDiagnostics(
  id: string,
  source: ExtendedConfig,
  fields: ExtendedFields,
  trace: readonly ExtendedTrace[]
): NumericalDiagnostics {
  const output: NumericalDiagnostics = { metrics: [], tables: [], companions: [], warnings: [] };
  if (id === '2.5' && source.family === 'constraint') return stiffDiagnostics(source.config);
  if (source.family !== 'planar') return output;
  const c = source.config,
    native = createPlanarSimulation(c),
    rhs = native.derivative;
  if (id === '2.1') {
    const out = new Float64Array(4);
    rhs(Float64Array.from(c.initialState), out);
    output.tables.push({
      id: 'state-derivative',
      title: '상태와 공용 엔진의 시간 도함수',
      columns: ['성분', '상태', '상태 단위', '도함수', '도함수 단위'],
      rows: c.initialState.map((v, i) => [
        ['theta1', 'theta2', 'omega1', 'omega2'][i]!,
        v,
        i < 2 ? 'rad' : 'rad/s',
        out[i]!,
        i < 2 ? 'rad/s' : 'rad/s^2'
      ])
    });
    output.metrics.push(
      metric(
        'kinematic-identity',
        'qDot와 omega의 차이',
        Math.hypot(out[0]! - c.initialState[2], out[1]! - c.initialState[3]),
        'rad/s'
      )
    );
  }
  if (id === '2.2' || id === '2.7') {
    const referenceStep = Math.max(c.duration / 20000, Math.min(c.step / 8, 0.0005));
    const reference = endpoint({ ...c, integratorId: 'integrator:rk4', step: referenceStep });
    const methods =
      id === '2.2'
        ? (['integrator:euler'] as const)
        : (['integrator:euler', 'integrator:rk2', 'integrator:rk4'] as const);
    const rows: (number | string)[][] = [];
    for (const method of methods)
      for (const factor of [1, 0.5]) {
        const step = c.step * factor,
          measured = measuredEndpoint({ ...c, integratorId: method, step });
        const error = distance(measured.state, reference);
        rows.push([method, step, measured.steps, error, measured.calls]);
        if (method === 'integrator:euler')
          output.metrics.push(
            metric(
              factor === 1 ? 'euler-error' : 'euler-half-error',
              factor === 1 ? 'Euler 끝점 정규화 상태 오차' : 'Euler h/2 끝점 정규화 상태 오차',
              error,
              '1'
            )
          );
      }
    output.tables.push({
      id: 'error-cost',
      title: '간격·비용·정규화 끝점 오차',
      columns: ['방법', '간격 (s)', '단계 수', '끝점 오차 (1)', '실측 RHS 평가 수'],
      rows
    });
    const coarse = new Float64Array(4),
      fine = new Float64Array(4);
    eulerStep(Float64Array.from(c.initialState), c.step, rhs, coarse);
    rk4Step(Float64Array.from(c.initialState), c.step, rhs, fine);
    output.metrics.push(metric('local-euler-defect', 'Euler 한 단계의 RK4 대비 결함', distance(coarse, fine), '1'));
    output.companions.push({
      id: 'fixed-reference',
      settings: { integrator: 'rk4', step: referenceStep, duration: c.duration },
      description: '기존 RK4를 더 작은 간격으로 실행한 수치 기준이며 참해로 인증하지 않습니다.'
    });
    output.warnings.push(
      '정규화 상태 거리는 각도/1 rad, 각속도/(1 rad/s)의 유클리드 거리입니다. 오차에는 기준 RK4의 유한 오차도 포함됩니다.'
    );
  }
  if (id === '2.3' || id === '2.7') {
    let evaluations = 0;
    const counted: Derivative = (x, out) => {
      evaluations++;
      rhs(x, out);
    };
    const tolerance = fields.tolerance!,
      specifications = adaptiveReplaySpecifications(id, c.step, tolerance),
      main = specifications[0]!,
      archive = createAdaptiveReplayArchive(),
      r = integrateAdaptive(Float64Array.from(c.initialState), c.duration, counted, main.options);
    if (!r.reachedTarget) throw new Error(`적응형 계산이 끝나지 않았습니다: ${r.terminationReason}`);
    appendAdaptiveReplayRun(archive, main.id, c.initialState, main.options, r);
    const replay = replayAcceptedSteps(Float64Array.from(c.initialState), rhs, r.acceptedSteps),
      fixed = measuredEndpoint(c);
    output.metrics.push(
      metric('adaptive-accepted', 'DP5(4) 수락 단계', r.accepted, '1'),
      metric('adaptive-rejected', 'DP5(4) 거부 단계', r.rejected, '1'),
      metric('adaptive-rhs-evaluations', 'DP5(4) RHS 평가', evaluations, '1'),
      metric('adaptive-replay-error', '수락 단계 재생 차이', distance(replay.y, r.y), '1'),
      metric('adaptive-fixed-distance', 'DP5(4)와 baseline RK4 끝점 거리', distance(fixed.state, r.y), '1'),
      metric('fixed-rhs-evaluations', 'baseline RK4 실측 RHS 평가', fixed.calls, '1')
    );
    output.tables.push({
      id: 'adaptive-steps',
      title: '실제 수락된 adaptive 단계 (최대 400개 표시)',
      columns: ['번호', '시작 (s)', '끝 (s)', '수락 h (s)', '정규화 국소 오차'],
      rows: r.acceptedSteps.slice(0, 400).map((s) => [s.index, s.startTime, s.endTime, s.dt, s.errorNorm])
    });
    if (id === '2.7') {
      const rows: (number | string)[][] = [];
      const reference = specifications[1]!,
        ref = integrateAdaptive(Float64Array.from(c.initialState), c.duration, rhs, reference.options);
      if (!ref.reachedTarget) throw new Error('정밀 adaptive 기준이 끝나지 않았습니다.');
      appendAdaptiveReplayRun(archive, reference.id, c.initialState, reference.options, ref);
      for (const specification of specifications.slice(2)) {
        const tol = specification.options.absTol;
        let calls = 0;
        const measured: Derivative = (x, out) => {
          calls++;
          rhs(x, out);
        };
        const a = integrateAdaptive(Float64Array.from(c.initialState), c.duration, measured, specification.options);
        if (!a.reachedTarget) throw new Error('오차-비용 비교가 종료되지 않았습니다.');
        appendAdaptiveReplayRun(archive, specification.id, c.initialState, specification.options, a);
        rows.push([tol, a.accepted, a.rejected, calls, distance(a.y, ref.y)]);
      }
      output.tables.push({
        id: 'tolerance-cost',
        title: '허용오차와 실제 계산 비용',
        columns: ['absTol=relTol', '수락', '거부', 'RHS 평가', '정밀 DP 기준 끝점 거리'],
        rows
      });
    }
    output.adaptiveArchive = archive;
    output.companions.push({
      id: 'adaptive-dopri5',
      settings: {
        absTol: tolerance,
        relTol: tolerance,
        initialDt: c.step,
        minDt: 1e-8,
        maxDt: 0.1,
        maxIterations: 20000,
        coordinateScaling: 'rad and rad/s as SI numerical components'
      },
      description:
        '기존 adaptive.ts의 Dormand–Prince5(4) reject/retry. 표는 처음 400단계, JSON의 adaptiveArchive는 모든 적응형 계산의 전체 수락 단계·최종 상태를 보존합니다.'
    });
    output.warnings.push(
      '허용치는 SI 수치 성분별 absTol+relTol*max(|y|)로 정규화합니다. 국소 오차 수락이 전역 오차 보증은 아닙니다. 실험실 전달은 baseline의 고정 간격 RK4이며 adaptive 설정은 이 단원과 JSON 보고서에 남습니다.'
    );
  }
  if (id === '2.4') return canonicalDiagnostics(c);
  if (id === '2.6') {
    const root = poincareSection(c.initialState, rhs, {
      section: (s) => s[0]!,
      direction: 'rising',
      dt: c.step,
      maxTime: c.duration,
      rootTol: 1e-10,
      maxPoints: 64
    });
    const sampled: { sampled: number; linear: number }[] = [];
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1]!,
        b = trace[i]!;
      if (a.state[0]! < 0 && b.state[0]! >= 0)
        sampled.push({
          sampled: b.time,
          linear: a.time + ((b.time - a.time) * Math.abs(a.state[0]!)) / (Math.abs(a.state[0]!) + Math.abs(b.state[0]!))
        });
    }
    const rows = root.times.map(
      (t, i) =>
        [
          i + 1,
          t,
          sampled[i]?.sampled ?? '표본 교차 없음',
          sampled[i]?.linear ?? '표본 교차 없음',
          root.rootResiduals[i]!,
          root.rootBracketWidths[i]!
        ] as (number | string)[]
    );
    output.tables.push({
      id: 'poincare-crossings',
      title: '표본·선형 보간·공용 root 검출의 교차 시각',
      columns: ['번호', 'root (s)', '첫 뒤 표본 (s)', '선형 보간 (s)', 'root 잔차 (rad)', 'bracket 폭 (s)'],
      rows
    });
    output.metrics.push(
      metric('crossing-count', '공용 검출의 교차 수', root.times.length, '1'),
      metric('root-residual-max', '최대 단면 잔차', Math.max(0, ...root.rootResiduals), 'rad'),
      metric('root-bracket-max', '최대 root bracket', Math.max(0, ...root.rootBracketWidths), 's')
    );
    output.companions.push({
      id: 'poincare-root',
      settings: { step: c.step, duration: c.duration, rootTolerance: 1e-10, section: 'theta1=0', direction: 'rising' },
      description: '기존 poincareSection/detectEvents를 호출한 음→양 방향 root 보간입니다.'
    });
    output.warnings.push(
      '표본 교차의 원래 macro-step 간격은 baseline의 step입니다. 표의 bracket 폭은 root finder가 좁힌 최종 구간입니다. 한 macro-step 안의 여러 교차와 접선 접촉은 놓칠 수 있습니다. root 잔차는 시간 적분의 전역 정확도를 보증하지 않습니다. 교차가 없으면 빈 결과를 표시합니다.'
    );
  }
  if (id === '2.8') {
    const final = endpoint(c),
      reverse = endpoint({ ...c, initialState: [final[0]!, final[1]!, -final[2]!, -final[3]!] });
    output.metrics.push(
      metric(
        'time-reversal-error',
        '속도 반전 후 귀환 상태 오차',
        distance(reverse, [c.initialState[0], c.initialState[1], -c.initialState[2], -c.initialState[3]]),
        '1'
      )
    );
    output.warnings.push(
      '에너지·막대 잔차·시간역전 오차는 서로 다른 검사입니다. 각좌표 모형의 막대 길이 보존은 기하적으로 구성되며 작은 잔차만으로 궤적 정확도를 입증하지 않습니다. RK4는 정확한 시간가역 적분기가 아닙니다.'
    );
  }
  return output;
}
