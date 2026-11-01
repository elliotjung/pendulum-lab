import { mapJacobianFD } from '../../../../chaos/chaosControl';
import { classifyFixedPoint } from '../../../../chaos/fixedPointClassify';
import { eigenvalues2x2, floquetAnalysis } from '../../../../chaos/floquet';
import { floquetLinearSpectrum } from '../../../../chaos/floquetLinear';
import { buildPeriodicOrbitDatabase } from '../../../../chaos/periodicOrbitDatabase';
import { melnikovFunction, melnikovFunctionNumeric, melnikovVerdict } from '../../../../chaos/melnikov';
import { switchPeriodDoubling } from '../../../../chaos/branchSwitching';
import { detectBifurcations } from '../../../../chaos/bifurcationDetect';
import { detectNeimarkSacker } from '../../../../chaos/neimarkSacker';
import { codimTwoDiagram } from '../../../../chaos/codimTwo';
import type { StabilityLog, StabilityPoint, StabilityRequest, StabilityResult } from './contracts';
import { numeric } from './settings';
import { stabilityResult } from './result';
import { shootMap } from './native-common';
import {
  drivenMap,
  drivenRhs,
  iterateMap,
  mapResidual,
  parameterGrid,
  readStabilityDriven,
  StabilityWork,
  transportPhase,
  varyDriven
} from './source';

const CURRENT_WARNINGS = [
  '현재 실험의 g·길이·감쇠·구동 진폭/주파수와 실제 위상을 사용합니다. sine 위상은 native cos 좌표로만 변환하며 원 실험을 수정하지 않습니다.',
  '반환 맵은 선택한 적분기와 별도로 native RK4를 사용합니다. stepsPerPeriod를 늘려 수렴을 확인하세요. 유한차분·Newton 수렴은 비선형 전역 안정성의 증명이 아닙니다.',
  'θ와 ω 잔차는 rad와 rad/s 성분의 수치 infinity norm입니다. 단일 SI 물리량이 아니므로 변수 척도에도 민감합니다.',
  '감기지 않은 절대 각도의 반환 조건을 사용합니다. 회전수 k≠0인 상대 주기궤도는 이 shooting 계약에서 지원하지 않습니다.'
];
const physicalPoint = (
  parameter: number,
  shot: ReturnType<typeof shootMap>,
  stable: boolean | null
): StabilityPoint => ({
  parameter,
  state: shot.point,
  residual: shot.residual,
  converged: shot.converged,
  stable: shot.converged ? stable : null
});
export function runCurrentStability(request: StabilityRequest, work: StabilityWork): StabilityResult {
  const s = request.settings;
  if (request.kind === 'floquet' && s.source === 'linear-oscillator') {
    const w = numeric(s, 'linearFrequency'),
      damping = numeric(s, 'linearDamping'),
      period = numeric(s, 'period');
    let calls = 0;
    const native = floquetLinearSpectrum(
      () => {
        calls++;
        work.consume(4);
        return [
          [0, 1],
          [-w * w, -damping]
        ];
      },
      period,
      2,
      { steps: numeric(s, 'stepsPerPeriod'), convergenceCheck: true }
    );
    return stabilityResult(
      request,
      `선형 oscillator · 반경 ${native.spectralRadius.toPrecision(5)}`,
      native.multipliers.map((mu, i) => [
        i,
        mu.re,
        mu.im,
        Math.hypot(mu.re, mu.im),
        native.exponents[i]!.re,
        native.exponents[i]!.im
      ]),
      {
        native,
        coefficientCalls: calls,
        sourceDescription: 'Independent linear oscillator x″+damping*x′+frequency²*x=0; not the current physical run.',
        period,
        linearFrequency: w,
        linearDamping: damping,
        branchAvailability: 'No nonlinear orbit branch is claimed.'
      },
      [
        '독립 선형 oscillator 기준 문제입니다. 현재 실험의 Floquet 결과가 아닙니다.',
        '선형 전파자 안정성은 비선형 궤도의 존재를 보장하지 않습니다.'
      ],
      [],
      [],
      'diagnostic'
    );
  }
  const source = readStabilityDriven(request.experiment),
    p = source.parameters;
  const sourceDetails = {
    physicalParameters: p,
    nativeSectionPhase: source.phase,
    sourceDescription: 'Current driven-pendulum physical parameters and actual forcing section.',
    phaseTransform: 'native phi = persisted drivePhase + forcingPhase - pi/2',
    integrator: 'native RK4'
  };
  if (request.kind === 'melnikov') {
    const verdict = melnikovVerdict(p),
      omega = verdict.Omega;
    const rows = parameterGrid(0, (2 * Math.PI) / omega, numeric(s, 'phaseCount')).map((tau, i) => {
      const analytic = melnikovFunction(tau, p);
      const quadrature = melnikovFunctionNumeric(tau, p, { halfWidth: 30, intervals: numeric(s, 'intervals') });
      work.consume(numeric(s, 'intervals') + 1);
      work.report(i + 1, numeric(s, 'phaseCount'));
      return [tau, analytic, quadrature, Math.abs(analytic - quadrature)];
    });
    return stabilityResult(
      request,
      `Melnikov 임계 진폭 ${verdict.criticalAmplitude.toPrecision(5)}`,
      rows,
      {
        ...sourceDetails,
        integrator: 'analytic + Simpson quadrature',
        verdict: {
          ...verdict,
          amplitudeRatio: Number.isFinite(verdict.amplitudeRatio) ? verdict.amplitudeRatio : null
        },
        amplitudeRatioAvailability:
          verdict.criticalAmplitude === 0 ? 'undefined ratio: zero damping gives zero critical amplitude' : 'finite',
        quadrature: { halfWidth: 30, intervals: s.intervals },
        maxQuadratureError: Math.max(...rows.map((r) => r[3]!))
      },
      [
        ...CURRENT_WARNINGS,
        '약한 감쇠·구동에 대한 1차 분리선 근사입니다. homoclinic tangle 후보는 지속 혼돈 attractor의 인증이 아닙니다.'
      ],
      [],
      [],
      'diagnostic'
    );
  }
  if (request.kind === 'codim-two') {
    const native = codimTwoDiagram(
      (x, y) => ({ kind: 'driven', ...varyDriven(varyDriven(p, String(s.xParameter), x), String(s.yParameter), y) }),
      [source.initial[0], source.initial[1], source.phase],
      String(s.xParameter),
      [numeric(s, 'xLow'), numeric(s, 'xHigh')],
      String(s.yParameter),
      [numeric(s, 'yLow'), numeric(s, 'yHigh')],
      {
        n: numeric(s, 'resolution'),
        steps: numeric(s, 'lyapunovSteps'),
        dt: numeric(s, 'dt'),
        neutralBand: numeric(s, 'neutralBand')
      }
    );
    work.consume(numeric(s, 'resolution') ** 2 * (2000 + 2 * numeric(s, 'lyapunovSteps')) * 4);
    const failed = native.cells.filter((cell) => !Number.isFinite(cell.lambda));
    const valid = native.cells.filter((cell) => Number.isFinite(cell.lambda));
    return stabilityResult(
      request,
      `2매개변수 지도 · ${valid.length}/${native.cells.length} 유효 셀`,
      valid.map((cell) => [cell.x, cell.y, cell.lambda, cell.regime]),
      {
        ...sourceDetails,
        native: {
          ...native,
          cells: native.cells.map((c) => ({
            ...c,
            lambda: Number.isFinite(c.lambda) ? c.lambda : null,
            regime: Number.isFinite(c.lambda) ? c.regime : null
          }))
        },
        failedCells: failed.map((c) => ({
          x: c.x,
          y: c.y,
          reason: 'native model evaluation or finite-time Lyapunov calculation failed; not neutral'
        })),
        nativeHashScope:
          'Legacy hash covers grid names/ranges/state/options, not the entire physical model. Full experiment snapshot is retained in the enclosing artifact.',
        transientSteps: 2000,
        measuredSteps: s.lyapunovSteps,
        neutralMeaning:
          'finite-time exponent within neutralBand, including the drive-phase direction; not transverse Floquet stability'
      },
      [
        ...CURRENT_WARNINGS,
        '위상을 포함한 3차원 연속 flow의 유한시간 최대 Lyapunov 부호 지도입니다. 구동 위상의 중립 방향 때문에 안정 주기궤도도 λ≈0일 수 있습니다.',
        '분기곡선 교차나 codimension-2 특이점의 인증이 아닙니다. 2000-step 과도 구간과 짧은 측정 기간·seed·격자 수렴을 별도로 확인하세요.',
        ...(failed.length ? ['실패 셀은 neutral로 해석하지 않고 표에서 제외해 null·원인으로 보존했습니다.'] : [])
      ],
      [],
      [],
      failed.length ? 'partial' : 'diagnostic'
    );
  }
  const steps = numeric(s, 'stepsPerPeriod'),
    tolerance = numeric(s, 'tolerance'),
    maxIterations = numeric(s, 'maxIterations');
  const guess = request.restart?.state ?? [numeric(s, 'guess0'), numeric(s, 'guess1')];
  if (request.kind === 'continuation') {
    const values = parameterGrid(
      request.restart?.parameter ?? numeric(s, 'start'),
      numeric(s, 'end'),
      numeric(s, 'points')
    );
    const branch: StabilityPoint[] = [],
      log: StabilityLog[] = [],
      rows: number[][] = [];
    const samples: { param: number; multipliers: ReturnType<typeof eigenvalues2x2> }[] = [];
    const returnColumns: { param: number; values: number[] }[] = [];
    let warm = [...guess];
    let failure: string | null = null;
    for (const [index, value] of values.entries()) {
      const params = varyDriven(p, String(s.parameter), value),
        map = drivenMap(params, source.phase, steps, work);
      const shot = shootMap(map, warm, numeric(s, 'period'), tolerance, maxIterations);
      const jacobian = mapJacobianFD((x, out) => {
        const next = iterateMap(map, x, numeric(s, 'period'));
        out[0] = next[0]!;
        out[1] = next[1]!;
      }, shot.point);
      const multipliers = eigenvalues2x2(jacobian.flat()),
        classification = classifyFixedPoint(multipliers);
      branch.push(physicalPoint(value, shot, classification.stable));
      log.push({ step: index, residual: shot.residual, converged: shot.converged });
      if (shot.converged) {
        rows.push([
          value,
          shot.point[0]!,
          shot.point[1]!,
          shot.residual,
          classification.spectralRadius,
          classification.stable ? 1 : 0
        ]);
        samples.push({ param: value, multipliers });
        warm = [...shot.point];
        const returns: number[] = [];
        let cur = [...shot.point];
        for (let k = 0; k < numeric(s, 'period'); k++) {
          returns.push(cur[0]!);
          cur = iterateMap(map, cur, 1);
        }
        returnColumns.push({ param: value, values: returns });
      } else {
        failure = shot.failure ?? 'Newton iteration limit or singular shooting Jacobian';
      }
      work.report(index + 1, values.length);
      if (!shot.converged) break;
    }
    return stabilityResult(
      request,
      `continuation · ${branch.filter((b) => b.converged).length}/${values.length} 수렴`,
      rows,
      {
        ...sourceDetails,
        parameterName: s.parameter,
        requestedPoints: values.length,
        failure,
        restart: request.restart ?? null,
        restartDirection: values.at(-1)! > values[0]! ? 1 : -1,
        branchMultipliers: samples,
        neimarkSacker: detectNeimarkSacker(samples),
        returnCountCandidates: detectBifurcations(returnColumns),
        logMeaning: 'One verified returned-state residual per parameter, not an internal Newton-iteration log.'
      },
      [
        ...CURRENT_WARNINGS,
        '자연 매개변수 연속법은 fold에서 중단될 수 있습니다. 수렴 실패 끝점은 다음 시작 guess로 자동 사용하지 않습니다.',
        '반환값 개수에 따른 분기 후보는 휴리스틱입니다. 양의 상수 감쇠 구동진자의 복소 승수쌍은 det=exp(−damping*T)<1이므로 일반 NS 통과가 기대되지 않습니다.'
      ],
      branch,
      log,
      branch.every((b) => b.converged) && branch.length === values.length
        ? 'converged'
        : branch.some((b) => b.converged)
          ? 'partial'
          : 'nonconverged'
    );
  }
  const map = drivenMap(p, source.phase, steps, work);
  if (request.kind === 'branch-switch') {
    const shot = shootMap(map, guess, 1, tolerance, maxIterations);
    if (!shot.converged)
      return stabilityResult(
        request,
        '주기 1 해가 수렴하지 않아 가지 전환을 중단했습니다.',
        [],
        { ...sourceDetails, failure: shot.failure, shot },
        CURRENT_WARNINGS,
        [physicalPoint(p.driveAmplitude, shot, null)],
        shot.log,
        'nonconverged'
      );
    const phase = ((source.phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const nativeSeed = transportPhase(p, shot.point, phase, phase < 1e-12 ? 0 : 2 * Math.PI - phase, steps, work);
    const dt = (2 * Math.PI) / p.driveFrequency / steps;
    const nativeFloquet = floquetAnalysis([...nativeSeed, 0], drivenRhs(p, work), (2 * Math.PI) / p.driveFrequency, {
      dt
    });
    const critical = nativeFloquet.multipliers
      .filter((mu) => Math.abs(mu.im) < 1e-7)
      .sort((a, b) => Math.abs(a.re + 1) - Math.abs(b.re + 1))[0];
    if (!critical || Math.abs(critical.re + 1) > numeric(s, 'criticalTolerance'))
      return stabilityResult(
        request,
        '−1 승수 근처의 주기배가 후보가 없어 가지를 전환하지 않았습니다.',
        [],
        { ...sourceDetails, periodOne: shot, multipliers: nativeFloquet.multipliers, switched: false },
        [...CURRENT_WARNINGS, '주기배가 가지 전환은 −1 근처의 실수 승수가 있는 검증된 주기 1 해가 필요합니다.'],
        [physicalPoint(p.driveAmplitude, shot, classifyFixedPoint(nativeFloquet.multipliers).stable)],
        shot.log,
        'nonconverged'
      );
    // Native routine is opaque synchronous work; bound its full seed/iteration/variational workload before invocation.
    const native = switchPeriodDoubling(p, nativeSeed, {
      dt,
      tolerance,
      maxIterations,
      seedSteps: [numeric(s, 'epsilon'), -numeric(s, 'epsilon')]
    });
    work.consume((maxIterations * 48 + 128) * steps);
    const physicalCycle = native.doubled.cycle.map((point) => transportPhase(p, point, 0, phase, steps, work));
    const corrected = shootMap(map, physicalCycle[0]!, 2, tolerance, maxIterations);
    const candidate = corrected.point;
    physicalCycle[0] = [candidate[0]!, candidate[1]!];
    const nextCycle = iterateMap(map, candidate, 1);
    physicalCycle[1] = [nextCycle[0]!, nextCycle[1]!];
    const residual = corrected.residual;
    const primitiveSeparation = Math.hypot(...iterateMap(map, candidate, 1).map((v, i) => v - candidate[i]!));
    const accepted =
      native.switched &&
      native.doubled.converged &&
      corrected.converged &&
      residual <= tolerance &&
      primitiveSeparation > 1e-3;
    const branch = physicalCycle.map((point) => ({
      parameter: p.driveAmplitude,
      state: point,
      residual,
      converged: accepted,
      stable: accepted ? native.doubled.stable : null
    }));
    return stabilityResult(
      request,
      accepted ? '주기배가 · 실제 위상의 주기 2 가지를 찾았습니다.' : '주기 2 후보가 검증 기준을 통과하지 못했습니다.',
      accepted
        ? physicalCycle.map((point, i) => [
            p.driveAmplitude,
            i,
            point[0],
            point[1],
            residual,
            native.doubled.stable ? 1 : 0
          ])
        : [],
      {
        ...sourceDetails,
        native,
        corrected,
        physicalCycle,
        verifiedResidual: residual,
        primitiveSeparation,
        switched: accepted,
        phaseConjugacy:
          'Current section → phase-zero section → native period-doubling switch → current section; residual independently rechecked.'
      },
      [
        ...CURRENT_WARNINGS,
        'native −1 고유벡터 전환을 사용합니다. phase-zero section으로 이동한 뒤 실제 원 section으로 돌려 주기 2 잔차와 primitive separation을 재검사합니다.'
      ],
      branch,
      [...shot.log, { step: shot.log.length, residual, converged: accepted }],
      accepted ? 'converged' : 'nonconverged'
    );
  }
  const period = numeric(s, 'period'),
    shot = shootMap(map, guess, period, tolerance, maxIterations);
  const jacobian = mapJacobianFD((x, out) => {
    const next = iterateMap(map, x, period);
    out[0] = next[0]!;
    out[1] = next[1]!;
  }, shot.point);
  const multipliers = eigenvalues2x2(jacobian.flat()),
    classification = classifyFixedPoint(multipliers);
  const branch = [physicalPoint(p.driveAmplitude, shot, classification.stable)];
  const warnings = [
    ...CURRENT_WARNINGS,
    ...(!shot.converged
      ? ['수렴하지 않은 상태의 선형 진단은 궤도 안정성 결과로 인정하지 않습니다. guess·허용오차·반복 수를 조절하세요.']
      : [])
  ];
  if (request.kind === 'fixed-point')
    return stabilityResult(
      request,
      `${shot.converged ? '고정점 수렴' : '고정점 미수렴'} · 잔차 ${shot.residual.toExponential(3)}`,
      shot.converged
        ? [
            [
              shot.point[0]!,
              shot.point[1]!,
              shot.residual,
              multipliers[0]!.re,
              multipliers[0]!.im,
              multipliers[1]!.re,
              multipliers[1]!.im,
              classification.stable ? 1 : 0
            ]
          ]
        : [],
      { ...sourceDetails, shot, classification: shot.converged ? classification : null, multipliers, guess },
      warnings,
      branch,
      shot.log,
      shot.converged ? 'converged' : 'nonconverged'
    );
  if (request.kind === 'periodic-shooting') {
    const seeds = [shot.point, [shot.point[0]! + 0.02, shot.point[1]!], [shot.point[0]!, shot.point[1]! + 0.02]];
    const database = buildPeriodicOrbitDatabase(map, seeds, [period], { tolerance, maxIterations });
    const rows = database.records.flatMap((record) => {
      const stable = classifyFixedPoint(eigenvalues2x2(record.monodromy)).stable;
      const actualResidual = mapResidual(map, record.representative, record.period);
      return record.points.map((point, i) => [record.period, i, point[0]!, point[1]!, actualResidual, stable ? 1 : 0]);
    });
    return stabilityResult(
      request,
      `shooting · ${database.records.length}개 중복 제거 궤도`,
      rows,
      {
        ...sourceDetails,
        shot,
        database,
        seeds,
        requestedPeriod: period,
        subperiodMeaning:
          'Native database reduces subperiodic roots to their primitive period; requested period is not a promise of a primitive cycle.'
      },
      [...warnings, '유한 초기 추정 3개로 모든 주기궤도를 찾지는 못합니다.'],
      branch,
      shot.log,
      shot.converged && database.records.length ? 'converged' : 'nonconverged'
    );
  }
  if (request.kind === 'floquet') {
    if (!shot.converged)
      return stabilityResult(
        request,
        '미수렴 해의 Floquet 안정성을 계산하지 않았습니다.',
        [],
        { ...sourceDetails, shot },
        warnings,
        branch,
        shot.log,
        'nonconverged'
      );
    const duration = (period * 2 * Math.PI) / p.driveFrequency;
    const native = floquetAnalysis([...shot.point, source.phase], drivenRhs(p, work), duration, {
      dt: (2 * Math.PI) / p.driveFrequency / steps
    });
    return stabilityResult(
      request,
      `Floquet 반경 ${native.maxModulus.toPrecision(5)}`,
      native.multipliers.map((mu, i) => [
        i,
        mu.re,
        mu.im,
        mu.modulus,
        Math.log(mu.modulus) / duration,
        Math.atan2(mu.im, mu.re) / duration
      ]),
      {
        ...sourceDetails,
        shot,
        native,
        duration,
        determinantExpected: Math.exp(-p.damping * duration),
        closedBlock: '[theta,omega] at fixed drive phase'
      },
      warnings,
      branch,
      shot.log,
      'converged'
    );
  }
  throw new RangeError('지원하지 않는 current-driven 안정성 도구입니다.');
}
