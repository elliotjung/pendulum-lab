import { continueArclength } from '../../../../chaos/arclength';
import { mapJacobianFD, type MapFn } from '../../../../chaos/chaosControl';
import { eigenvalues2x2 } from '../../../../chaos/floquet';
import { classifyFixedPoint } from '../../../../chaos/fixedPointClassify';
import { continueNeimarkSackerTorus, detectNeimarkSacker, type PlanarMapSystem } from '../../../../chaos/neimarkSacker';
import { torusLyapunovSpectrum } from '../../../../chaos/torusAnalysis';
import { scanModeLocking, sineCircleMap } from '../../../../chaos/arnoldTongue';
import type { StabilityPoint, StabilityRequest, StabilityResult, StabilityLog } from './contracts';
import { numeric } from './settings';
import { stabilityResult } from './result';
import { parameterGrid, StabilityWork } from './source';
import { shootMap } from './native-common';

const BENCHMARK_WARNING =
  '이름이 명시된 독립 기준 모델입니다. 현재 실험의 물리 매개변수·run에 대한 계산으로 해석하지 마세요. 원 실험은 출처 문맥으로만 보존됩니다.';
export function runBenchmarkStability(request: StabilityRequest, work: StabilityWork): StabilityResult {
  const s = request.settings;
  if (request.kind === 'pseudo-arclength') {
    const start = request.restart?.parameter ?? numeric(s, 'start'),
      x0 = request.restart?.state[0] ?? numeric(s, 'guess0');
    const direction = request.restart?.direction ?? (numeric(s, 'direction') as 1 | -1);
    const native = continueArclength(
      {
        dimension: 1,
        residual: (x, lambda) => {
          work.consume();
          return [x[0]! ** 2 - lambda];
        }
      },
      {
        x0: [x0],
        lambda0: start,
        ds: numeric(s, 'ds'),
        steps: numeric(s, 'steps'),
        direction,
        newtonTol: numeric(s, 'tolerance'),
        maxNewton: numeric(s, 'maxIterations')
      }
    );
    const branch: StabilityPoint[] = [],
      log: StabilityLog[] = [],
      rows: number[][] = [];
    for (const [i, point] of native.branch.entries()) {
      if (![point.lambda, point.x[0], point.tangentLambda].every(Number.isFinite)) break;
      const residual = Math.abs(point.x[0]! ** 2 - point.lambda),
        converged = residual <= numeric(s, 'tolerance') * 10;
      branch.push({ parameter: point.lambda, state: point.x, residual, converged, stable: null });
      rows.push([point.lambda, point.x[0]!, residual, point.tangentLambda]);
      log.push({ step: i, residual, converged });
    }
    const completed = branch.length === numeric(s, 'steps') + 1 && branch.every((point) => point.converged);
    const tangent = rows.at(-1)?.[3];
    const restartDirection = tangent !== undefined && Math.abs(tangent) > 1e-8 ? (tangent > 0 ? 1 : -1) : null;
    return stabilityResult(
      request,
      `fold 통과 · ${native.folds.length}개 접힘 후보 · ${branch.length}개 점`,
      rows,
      {
        sourceDescription: 'Independent algebraic fold normal form G(x,lambda)=x²−lambda=0.',
        native,
        initialState: [x0],
        initialParameter: start,
        restart: request.restart ?? null,
        restartDirection,
        failure: completed
          ? null
          : 'native arclength terminated before requested steps or failed residual/finite checks',
        logMeaning: 'Verified branch-point residuals, not internal Newton-iteration residuals.',
        requestedSteps: s.steps
      },
      [
        BENCHMARK_WARNING,
        '기준 fold 잔차의 해 기하만 추적하며 물리계의 안정성을 주장하지 않습니다. 접힘 위치는 ds 해상도의 후보입니다.',
        '재시작은 마지막 접선의 매개변수 부호를 보존합니다. 정확한 fold의 특이 시작점은 거부합니다.'
      ],
      branch,
      log,
      completed ? 'converged' : branch.length > 1 ? 'partial' : 'nonconverged'
    );
  }
  if (request.kind === 'branch-switch') {
    const start = request.restart?.parameter ?? numeric(s, 'start');
    const values = parameterGrid(start, numeric(s, 'end'), numeric(s, 'points'));
    const signs = request.restart ? [Math.sign(request.restart.state[0]!)] : [1, -1];
    const branch: StabilityPoint[] = [],
      log: StabilityLog[] = [],
      rows: number[][] = [];
    const failures: { parameter: number; branch: number; reason: string }[] = [];
    const warm = new Map<number, number>(
      signs.map((sign) => [sign, request.restart?.state[0] ?? sign * numeric(s, 'epsilon')])
    );
    for (const [i, lambda] of values.entries()) {
      const map: MapFn = (x, out) => {
        work.consume();
        out[0] = x[0]! + x[0]! * (lambda - x[0]! ** 2);
        if (!Number.isFinite(out[0]) || Math.abs(out[0]) > 1e6)
          throw new RangeError('pitchfork Newton 상태가 유한 범위를 벗어났습니다.');
      };
      for (const sign of signs) {
        const shot = shootMap(map, [warm.get(sign)!], 1, numeric(s, 'tolerance'), numeric(s, 'maxIterations'));
        const separation = Math.abs(shot.point[0]!);
        const switched = shot.converged && separation > 1e-4 && Math.sign(shot.point[0]!) === sign;
        const multiplier = 1 + lambda - 3 * shot.point[0]! ** 2;
        const point: StabilityPoint = {
          parameter: lambda,
          state: [shot.point[0]!],
          residual: shot.residual,
          converged: switched,
          stable: switched ? Math.abs(multiplier) < 1 - 1e-3 : null
        };
        branch.push(point);
        rows.push([lambda, sign, point.state[0]!, 0, point.residual, point.stable ? 1 : 0]);
        log.push({ step: log.length, residual: point.residual, converged: switched });
        if (switched) warm.set(sign, point.state[0]!);
        else
          failures.push({
            parameter: lambda,
            branch: sign,
            reason: shot.failure ?? 'Newton did not leave the symmetric branch with a verified residual'
          });
      }
      work.report(i + 1, values.length);
      if (failures.length) break;
    }
    const completed = branch.length === values.length * signs.length && branch.every((point) => point.converged);
    return stabilityResult(
      request,
      `대칭 깨짐 기준 문제 · ${branch.filter((p) => p.converged).length}개 비영 해`,
      rows,
      {
        sourceDescription:
          'Independent pitchfork residual G=x*(lambda−x²), solved as fixed points of x→x+G. Symmetric reference branch x=0 is explicitly rejected.',
        initialParameter: start,
        seedEpsilon: s.epsilon,
        referenceBranch: 'x=0',
        failures,
        restart: request.restart ?? null,
        restartDirection: values.at(-1)! > values[0]! ? 1 : -1,
        logMeaning:
          'Verified off-branch residual per parameter/branch; stability refers only to the explicitly defined benchmark map.'
      },
      [
        BENCHMARK_WARNING,
        '±ε에서 native Newton을 시작해 서로 다른 ±√λ 가지와 잔차·대칭 가지 분리를 검증합니다. 모든 분기점에 적용되는 자동 분류기가 아닙니다.'
      ],
      branch,
      log,
      completed ? 'converged' : branch.some((point) => point.converged) ? 'partial' : 'nonconverged'
    );
  }
  const delayed: PlanarMapSystem = {
    map: (state, a, out) => {
      work.consume();
      out[0] = a * state[0]! * (1 - state[1]!);
      out[1] = state[0]!;
      if (![out[0], out[1]].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
        throw new RangeError('delayed-logistic 기준 맵 상태가 유한 범위를 벗어났습니다.');
    },
    center: (a) => [(a - 1) / a, (a - 1) / a]
  };
  if (request.kind === 'neimark-sacker') {
    const start = request.restart?.parameter ?? numeric(s, 'start');
    const values = parameterGrid(start, numeric(s, 'end'), numeric(s, 'points'));
    const branch: StabilityPoint[] = [],
      log: StabilityLog[] = [],
      rows: number[][] = [];
    const samples: { param: number; multipliers: ReturnType<typeof eigenvalues2x2> }[] = [];
    let warm = request.restart?.state ?? Array.from(delayed.center!(start));
    for (const [i, a] of values.entries()) {
      const map: MapFn = (x, out) => {
        const target = new Float64Array(2);
        delayed.map(Float64Array.from(x), a, target);
        out[0] = target[0]!;
        out[1] = target[1]!;
      };
      const shot = shootMap(map, warm, 1, numeric(s, 'tolerance'), numeric(s, 'maxIterations'));
      const multipliers = eigenvalues2x2(mapJacobianFD(map, shot.point).flat());
      const classification = classifyFixedPoint(multipliers);
      branch.push({
        parameter: a,
        state: shot.point,
        residual: shot.residual,
        converged: shot.converged,
        stable: shot.converged ? classification.stable : null
      });
      rows.push([a, shot.point[0]!, shot.point[1]!, classification.spectralRadius, shot.residual]);
      log.push({ step: i, residual: shot.residual, converged: shot.converged });
      if (shot.converged) {
        warm = [...shot.point];
        samples.push({ param: a, multipliers });
      }
      work.report(i + 1, values.length);
      if (!shot.converged) break;
    }
    const scan = detectNeimarkSacker(samples);
    return stabilityResult(
      request,
      `Neimark–Sacker · ${scan.points.length}개 단위원 교차 후보`,
      rows,
      {
        sourceDescription:
          'Independent delayed-logistic map (x,y)→(a*x*(1−y),x); nonzero fixed point ((a−1)/a,(a−1)/a), NS at a=2.',
        scan,
        branchMultipliers: samples,
        restart: request.restart ?? null,
        restartDirection: values.at(-1)! > values[0]! ? 1 : -1,
        logMeaning: 'Verified fixed-point residual at each parameter, not internal Newton-iteration logs.'
      },
      [BENCHMARK_WARNING, scan.caveat, '단위원 교차는 후보이며 비퇴화·공명·불변 원의 존재 검사는 별도로 필요합니다.'],
      branch,
      log,
      branch.length === values.length && branch.every((point) => point.converged)
        ? 'converged'
        : branch.some((point) => point.converged)
          ? 'partial'
          : 'nonconverged'
    );
  }
  if (request.kind === 'torus') {
    const points = numeric(s, 'points'),
      start = numeric(s, 'start'),
      end = numeric(s, 'end');
    const native = continueNeimarkSackerTorus(delayed, {
      start,
      end,
      step: Math.abs(end - start) / (points - 1),
      initialAmplitude: numeric(s, 'initialAmplitude'),
      collocation: numeric(s, 'collocation'),
      tolerance: numeric(s, 'tolerance'),
      maxIterations: numeric(s, 'maxIterations')
    });
    const branch: StabilityPoint[] = [],
      log: StabilityLog[] = [],
      rows: number[][] = [];
    const diagnostics: unknown[] = [];
    const savedPoints = native.points.filter((point) =>
      [
        point.parameter,
        point.rotationNumber,
        point.amplitude,
        point.invarianceResidual,
        ...point.curve,
        ...point.center
      ].every(Number.isFinite)
    );
    for (const [i, point] of savedPoints.entries()) {
      const usable =
        point.converged &&
        point.amplitude > 1e-5 &&
        point.invarianceResidual <= Math.max(1e-6, numeric(s, 'tolerance') * 10);
      const diagnostic = usable
        ? torusLyapunovSpectrum(delayed, point.parameter, [point.curve[0]!, point.curve[1]!], {
            iterations: 4000,
            transient: 1000
          })
        : null;
      diagnostics.push(diagnostic);
      branch.push({
        parameter: point.parameter,
        state: [point.curve[0]!, point.curve[1]!],
        residual: point.invarianceResidual,
        converged: usable,
        stable: diagnostic ? diagnostic.transverseExponent < 0 : null
      });
      rows.push([point.parameter, point.amplitude, point.rotationNumber, point.invarianceResidual, usable ? 1 : 0]);
      log.push({ step: i, residual: point.invarianceResidual, converged: usable });
      work.report(i + 1, points);
    }
    const completed = branch.length === points && branch.every((point) => point.converged);
    return stabilityResult(
      request,
      `불변 원 · ${branch.filter((point) => point.converged).length}/${points}개 검증`,
      rows,
      {
        sourceDescription: 'Independent delayed-logistic planar-map invariant circles, not a driven-pendulum torus.',
        native: { ...native, points: savedPoints },
        diagnostics,
        rejectedNonFinitePoints: native.points.length - savedPoints.length,
        fullCurvePreserved: true,
        restartAvailability:
          'Native collocation has no exact saved-curve warm-start API; full solutions reload unchanged but endpoint restart is disabled.',
        logMeaning:
          'Off-grid invariance residual per parameter; native convergence alone is insufficient if the curve collapsed to its center.'
      },
      [
        BENCHMARK_WARNING,
        native.caveat,
        '곡선의 off-grid 잔차와 비영 진폭을 함께 검사합니다. 짧은 Lyapunov 진단은 중립·횡방향 일관성 검사이며 torus의 엄밀한 증명이 아닙니다.',
        '모든 collocation 곡선과 ρ를 저장합니다. 현재 native API에 정확한 저장 곡선 warm-start가 없어 끝점 재시작은 제공하지 않습니다.'
      ],
      branch,
      log,
      completed ? 'converged' : branch.some((point) => point.converged) ? 'partial' : 'nonconverged'
    );
  }
  if (request.kind === 'arnold-tongue') {
    const native = scanModeLocking(
      (omega) => {
        const circle = sineCircleMap(omega, numeric(s, 'coupling'));
        return {
          lift: (theta) => {
            work.consume();
            return circle.lift(theta);
          }
        };
      },
      {
        start: numeric(s, 'start'),
        end: numeric(s, 'end'),
        steps: numeric(s, 'points') - 1,
        rationals: [
          [0, 1],
          [1, 4],
          [1, 3],
          [1, 2],
          [2, 3],
          [3, 4],
          [1, 1]
        ],
        tolerance: numeric(s, 'lockingTolerance'),
        rotationOptions: { iterations: numeric(s, 'iterations'), transient: numeric(s, 'transient'), theta0: 0.1 }
      }
    );
    return stabilityResult(
      request,
      `원형 맵 · ${native.tongues.length}개 잠김 구간 후보`,
      native.samples.map((point) => [point.parameter, point.rotationNumber]),
      {
        sourceDescription: 'Independent sine-circle lift theta→theta+Omega−K/(2pi)*sin(2pi*theta), K≤1.',
        native,
        scanDimension: 1,
        resolution: Math.abs(numeric(s, 'end') - numeric(s, 'start')) / (numeric(s, 'points') - 1),
        finiteSampleUncertainty:
          'Rotation estimate bias is O(1/iterations); isolated rational hits are not proof of a nonzero-width locking plateau.'
      },
      [
        BENCHMARK_WARNING,
        native.caveat,
        '이 도구는 고정 K에서 1차원 절단면을 계산합니다. 전체 2차원 Arnold tongue 지도나 codimension-2 인증을 주장하지 않습니다.'
      ],
      [],
      [],
      'diagnostic'
    );
  }
  throw new RangeError('지원하지 않는 독립 안정성 기준 모델입니다.');
}
