import { mathieuCoefficient, mathieuFloquet } from '../../../chaos/mathieuStability';
import { duffingPotential, energyDuffing, rhsDuffing, type DuffingParameters } from '../../../physics/duffing';
import {
  staticFrictionComplementarityStep,
  stribeckFrictionForce,
  type StaticFrictionStepResult
} from '../../../physics/friction';
import { rk4Step } from '../../../physics/integrators';
import { energyKapitza, kapitzaEffectivePotential, rhsKapitza, type KapitzaParameters } from '../../../physics/kapitza';
import { pyragasFeedback, rhsPyragasPendulum, type PyragasPendulumParameters } from '../../../physics/pyragasDde';
import type { StateVector } from '../../../physics/types';
import { energyVanDerPol, rhsVanDerPol, type VanDerPolParameters } from '../../../physics/vanDerPol';
import type { ContractIssue } from '../../contracts/validation';
import { nonlinearStepCount, validateNonlinearConfig } from './nonlinear-contract';
import {
  nonlinearWarnings,
  type NonlinearConfig,
  type NonlinearDelayState,
  type NonlinearSample
} from './nonlinear-schema';
export * from './nonlinear-schema';
export * from './nonlinear-contract';

export class NonlinearConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'NonlinearConfigurationError';
  }
}
const canonicalNumber = (value: number) => (value === 0 ? 0 : value);
/** Bounded display data. The integrator tape is retained separately without this decimation. */
function displayEvery<T>(values: readonly T[], maximum = 65): T[] {
  if (values.length <= maximum) return [...values];
  return Array.from({ length: maximum }, (_, i) => values[Math.floor((i * (values.length - 1)) / (maximum - 1))]!);
}
/** Adds presentation and restart state while delegating every physical equation to the existing core. */
export function createNonlinearSimulation(input: NonlinearConfig, options: { stability?: boolean } = {}) {
  const checked = validateNonlinearConfig(input);
  if (!checked.ok) throw new NonlinearConfigurationError(checked.issues);
  const config = checked.value,
    p = config.parameters,
    id = config.systemId,
    total = nonlinearStepCount(config);
  let state: Float64Array = Float64Array.from(config.initialState);
  let index = 0,
    failure: Error | undefined;
  let contact: StaticFrictionStepResult = {
    mode: 'stick',
    frictionForce: 0,
    nextVelocity: state[1]!,
    momentumResidual: 0,
    coneResidual: 0
  };
  if (id === 'system:friction') {
    const external = p.driveAmplitude! * Math.cos(state[2]!) - p.stiffness! * state[0]! - p.viscous! * state[1]!;
    const trial = staticFrictionComplementarityStep(state[1]!, external, {
      mass: p.mass!,
      dt: config.step,
      staticLimit: p.staticFriction!,
      dynamicMagnitude: p.dynamicFriction!
    });
    contact =
      state[1] === 0
        ? trial
        : {
            mode: 'slip',
            frictionForce: -p.dynamicFriction! * Math.sign(state[1]!),
            nextVelocity: state[1]!,
            momentumResidual: 0,
            coneResidual: 0
          };
  }
  let times: number[] = [],
    states: number[][] = [],
    historyBoundary: number | undefined;
  const absoluteStart = config.startTime ?? 0;
  if (id === 'system:pyragas') {
    if (config.delayState) {
      times = [...config.delayState.times];
      states = config.delayState.states.map((s) => [...s]);
      historyBoundary = config.delayState.historyBoundary;
    } else {
      const h = config.history!,
        delay = p.delay!;
      times = [-delay, 0];
      states = [[h.state[0]! - (h.kind === 'linear' ? h.state[1]! * delay : 0), h.state[1]!], [...config.initialState]];
      historyBoundary = 0;
    }
  }
  const initialHistory = config.history;
  function delayedAt(query: number): readonly number[] {
    // Translating a restart origin can put an exact original t=0 query a few ulps
    // to either side of a discontinuity. Select the accepted boundary consistently.
    if (
      historyBoundary !== undefined &&
      Math.abs(query - historyBoundary) <= 32 * Number.EPSILON * Math.max(1, Math.abs(query), Math.abs(historyBoundary))
    )
      query = historyBoundary;
    if (historyBoundary !== undefined && query < historyBoundary && initialHistory)
      return [
        initialHistory.state[0]! +
          (initialHistory.kind === 'linear' ? initialHistory.state[1]! * (query - historyBoundary) : 0),
        initialHistory.state[1]!
      ];
    if (!times.length || query < times[0]! - 1e-12)
      throw new Error('필요한 지연 이력이 없습니다. 원본 이력과 시간 간격을 확인하세요.');
    if (query >= times.at(-1)! - 1e-14) return states.at(-1)!;
    let lo = 0,
      hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid]! <= query) lo = mid;
      else hi = mid;
    }
    const fraction = (query - times[lo]!) / (times[hi]! - times[lo]!);
    return states[lo]!.map((v, i) => v + fraction * (states[hi]![i]! - v));
  }
  const matrix = id === 'system:mathieu' ? mathieuCoefficient(p.delta!, p.epsilon!) : undefined;
  const floquet = id === 'system:mathieu' && options.stability ? mathieuFloquet(p.delta!, p.epsilon!) : undefined;
  const stability = floquet
    ? {
        stable: floquet.stable,
        spectralRadius: floquet.spectralRadius,
        determinantDrift: Math.abs(floquet.determinant - 1)
      }
    : undefined;
  const curve = Array.from({ length: 65 }, (_, i) => {
    const x = id === 'system:kapitza' ? -Math.PI + (2 * Math.PI * i) / 64 : -3 + (6 * i) / 64;
    const y =
      id === 'system:duffing'
        ? duffingPotential(x, p as unknown as DuffingParameters)
        : id === 'system:kapitza'
          ? kapitzaEffectivePotential(x, p as unknown as KapitzaParameters)
          : id === 'system:friction'
            ? stribeckFrictionForce(x, {
                staticFriction: p.staticFriction!,
                dynamicFriction: p.dynamicFriction!,
                stribeckVelocity: p.stribeckVelocity!,
                regularizationVelocity: p.regularizationVelocity!,
                viscous: p.viscous!
              })
            : 0;
    return { x: canonicalNumber(x), y: canonicalNumber(y) };
  });
  function assertFinite(s: ArrayLike<number>) {
    if (Array.from(s).some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6))
      throw new Error(
        '계산이 유한 안전 범위를 벗어나 마지막 유효 상태에서 중지했습니다. 시간 간격·초기조건·물성을 줄이세요.'
      );
  }
  function rhs(s: StateVector, out: StateVector) {
    assertFinite(s);
    if (id === 'system:duffing') rhsDuffing(s, p as unknown as DuffingParameters, out);
    else if (id === 'system:van-der-pol') rhsVanDerPol(s, p as unknown as VanDerPolParameters, out);
    else if (id === 'system:kapitza') rhsKapitza(s, p as unknown as KapitzaParameters, out);
    else if (id === 'system:mathieu') {
      out[0] = s[1]!;
      out[1] = matrix!(absoluteStart + s[2]!)[1]![0]! * s[0]!;
      out[2] = 1;
    } else if (id === 'system:pyragas') {
      rhsPyragasPendulum(
        s,
        delayedAt(s[2]! - p.delay!),
        absoluteStart + s[2]!,
        p as unknown as PyragasPendulumParameters,
        out
      );
      out[2] = 1;
    }
    assertFinite(out);
  }
  function relativeTape(localTime: number): NonlinearDelayState {
    const target = localTime - p.delay!,
      first = times.findIndex((t) => t >= target);
    const tailTimes = times.slice(Math.max(first, 0)),
      tailStates = states.slice(Math.max(first, 0));
    if (tailTimes[0] !== target) {
      tailTimes.unshift(target);
      tailStates.unshift([...delayedAt(target)]);
    }
    return {
      times: tailTimes.map((t) => canonicalNumber(t - localTime)),
      states: tailStates.map((s) => s.map(canonicalNumber)),
      ...(historyBoundary === undefined || historyBoundary < target
        ? {}
        : { historyBoundary: canonicalNumber(historyBoundary - localTime) })
    };
  }
  function sample(s: StateVector, step: number): NonlinearSample {
    assertFinite(s);
    const localTime = Math.min(step * config.step, config.duration),
      time = absoluteStart + localTime;
    const theta = s[0]!,
      velocity = s[1]!;
    const energy =
      id === 'system:duffing'
        ? energyDuffing(s, p as unknown as DuffingParameters).total
        : id === 'system:van-der-pol'
          ? energyVanDerPol(s, p as unknown as VanDerPolParameters).total
          : id === 'system:kapitza'
            ? energyKapitza(s, p as unknown as KapitzaParameters).total
            : id === 'system:friction'
              ? 0.5 * p.mass! * velocity * velocity + 0.5 * p.stiffness! * theta * theta
              : id === 'system:pyragas'
                ? 0.5 * p.length! ** 2 * velocity * velocity - p.g! * p.length! * Math.cos(theta)
                : 0.5 * (velocity * velocity + (p.delta! + p.epsilon! * Math.cos(time)) * theta * theta);
    const forcing =
      id === 'system:van-der-pol'
        ? p.mu! * (1 - theta * theta) * velocity
        : id === 'system:mathieu'
          ? p.epsilon! * Math.cos(time)
          : id === 'system:pyragas'
            ? p.driveAmplitude! * Math.cos(p.driveFrequency! * time)
            : p.driveAmplitude! * Math.cos(s[2]!);
    const feedback =
      id === 'system:pyragas' ? pyragasFeedback(theta, delayedAt(localTime - p.delay!)[0]!, p.feedbackGain!) : 0;
    const positions =
      id === 'system:kapitza'
        ? [{ x: p.length! * Math.sin(theta), y: p.driveAmplitude! * Math.cos(s[2]!) - p.length! * Math.cos(theta) }]
        : id === 'system:pyragas'
          ? [{ x: p.length! * Math.sin(theta), y: -p.length! * Math.cos(theta) }]
          : [{ x: theta, y: 0 }];
    const displayTape = id === 'system:pyragas' ? relativeTape(localTime) : undefined;
    const history = displayTape
      ? displayEvery(
          displayTape.times.map((t, i) => ({
            time: t,
            theta: displayTape.states[i]![0]!,
            omega: displayTape.states[i]![1]!
          }))
        )
      : [];
    const boundaryState = historyBoundary === undefined ? undefined : states[times.indexOf(historyBoundary)];
    const warnings =
      id === 'system:pyragas' && boundaryState && config.history!.state.some((v, i) => v !== boundaryState[i])
        ? [
            '과거 이력의 왼쪽 극한과 t=0 초기 상태가 다릅니다. 지연 후 불연속이 전달되므로 dt와 이력 해상도를 세분화하세요.'
          ]
        : [];
    const result: NonlinearSample = {
      step,
      time,
      state: Array.from(s).slice(0, config.initialState.length).map(canonicalNumber),
      positions,
      energy: canonicalNumber(energy),
      energyLabel:
        id === 'system:van-der-pol'
          ? '조화 핵 에너지 진단'
          : id === 'system:mathieu'
            ? '순간 이차형 진단'
            : '기계 에너지 진단',
      energyUnit: ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id)
        ? '정규화'
        : id === 'system:friction'
          ? 'J'
          : 'm²/s²',
      phase: { x: theta, y: velocity },
      forcing: canonicalNumber(forcing),
      feedback: canonicalNumber(feedback),
      frictionForce: id === 'system:friction' ? canonicalNumber(contact.frictionForce) : 0,
      mode: id === 'system:friction' ? contact.mode : 'smooth',
      momentumResidual: id === 'system:friction' ? canonicalNumber(contact.momentumResidual) : 0,
      coneResidual: id === 'system:friction' ? canonicalNumber(contact.coneResidual) : 0,
      potential: ['system:duffing', 'system:kapitza', 'system:friction'].includes(id) ? curve : [],
      history,
      ...(stability ? { stability } : {}),
      warnings
    };
    if (
      ![
        energy,
        forcing,
        feedback,
        ...positions.flatMap(Object.values),
        ...(stability ? [stability.spectralRadius, stability.determinantDrift] : [])
      ].every(Number.isFinite)
    )
      throw new Error('유한하지 않은 진단값으로 계산을 중지했습니다.');
    return result;
  }
  let accepted = sample(state, 0);
  function step() {
    if (failure) throw failure;
    if (index >= total) return structuredClone(accepted);
    try {
      const localTime = index * config.step,
        h = Math.min(config.step, config.duration - localTime),
        nextTime = Math.min((index + 1) * config.step, config.duration);
      let next: Float64Array;
      let nextContact = contact;
      if (id === 'system:friction') {
        const external = p.driveAmplitude! * Math.cos(state[2]!) - p.stiffness! * state[0]! - p.viscous! * state[1]!;
        nextContact = staticFrictionComplementarityStep(state[1]!, external, {
          mass: p.mass!,
          dt: h,
          staticLimit: p.staticFriction!,
          dynamicMagnitude: p.dynamicFriction!
        });
        next = Float64Array.of(
          state[0]! + h * nextContact.nextVelocity,
          nextContact.nextVelocity,
          state[2]! + h * p.driveFrequency!
        );
      } else {
        const timed = ['system:mathieu', 'system:pyragas'].includes(id),
          source = timed ? Float64Array.of(state[0]!, state[1]!, localTime) : state;
        const integrated = new Float64Array(source.length);
        rk4Step(source, h, rhs, integrated);
        next = timed ? integrated.slice(0, 2) : integrated;
      }
      assertFinite(next);
      const oldContact = contact;
      contact = nextContact;
      // Tape mutations are rolled back if a diagnostic rejects this candidate step.
      const oldTimes = times,
        oldStates = states,
        oldBoundary = historyBoundary;
      if (id === 'system:pyragas') {
        times = [...times, nextTime];
        states = [...states, Array.from(next)];
        let keep = 0;
        while (keep + 1 < times.length - 1 && times[keep + 1]! <= nextTime - p.delay!) keep++;
        times = times.slice(keep);
        states = states.slice(keep);
        if (historyBoundary !== undefined && times[0]! >= historyBoundary) historyBoundary = undefined;
      }
      let candidate;
      try {
        candidate = sample(next, index + 1);
      } catch (cause) {
        contact = oldContact;
        times = oldTimes;
        states = oldStates;
        historyBoundary = oldBoundary;
        throw cause;
      }
      state = next;
      accepted = candidate;
      index++;
      return structuredClone(accepted);
    } catch (cause) {
      failure = cause instanceof Error ? cause : new Error('비선형 시스템 계산 실패');
      throw failure;
    }
  }
  return {
    get config() {
      return structuredClone(config);
    },
    get done() {
      return index >= total;
    },
    snapshot: () => structuredClone(accepted),
    step,
    advance(count: number) {
      if (!Number.isInteger(count) || count < 1 || count > 64) throw new RangeError('1–64 단계를 요청하세요.');
      for (let i = 0; i < count && index < total; i++) step();
      return structuredClone(accepted);
    },
    /** Continuation starts now with the original observation horizon; it is not a remaining-run checkpoint. */
    serialize(): NonlinearConfig {
      const localTime = Math.min(index * config.step, config.duration);
      return {
        ...structuredClone(config),
        initialState: Array.from(state).map(canonicalNumber),
        startTime: canonicalNumber(absoluteStart + localTime),
        ...(id === 'system:pyragas' ? { delayState: relativeTape(localTime) } : {})
      };
    },
    warnings: () => nonlinearWarnings(config)
  };
}
