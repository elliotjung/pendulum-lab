import { rhsDriven, type DrivenParameters } from '../../../../physics/driven';
import { rk4Step } from '../../../../physics/integrators';
import type { Derivative } from '../../../../physics/types';
import type { MapFn } from '../../../../chaos/chaosControl';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { fromCanonicalDriven } from '../../physics/driven';
import { STABILITY_LIMITS, type StabilityProgress } from './contracts';

export function readStabilityDriven(experiment: ExperimentStateV1) {
  if (experiment.systemId !== 'system:driven')
    throw new RangeError('이 current-driven 도구는 단일 구동 진자의 검증된 반환 맵 전용입니다.');
  const parsed = fromCanonicalDriven({ ...experiment, analyses: [] });
  if (!parsed.ok) throw new RangeError(parsed.issues.map((issue) => issue.message).join(' '));
  const c = parsed.value;
  if (!c.forcing || c.forcing.waveform !== 'sine')
    throw new RangeError(
      '안정성 반환 맵은 매끈한 sine 구동 전용입니다. square/triangle 파형을 조용히 바꾸지 않습니다.'
    );
  const parameters: DrivenParameters = {
    g: c.parameters.g!,
    length: c.parameters.length!,
    damping: c.parameters.damping!,
    driveAmplitude: c.forcing.amplitude,
    driveFrequency: c.forcing.frequency
  };
  if (!(parameters.g > 0) || !(parameters.length > 0) || !(parameters.driveFrequency > 0))
    throw new RangeError('주기 반환 맵에는 양의 g, 길이, 구동 각주파수가 필요합니다.');
  return {
    parameters,
    // Product sin(psi+offset) = native cos(psi+offset−pi/2); persisted experiment stays unchanged.
    phase: c.initialState[2]! + c.forcing.phase - Math.PI / 2,
    initial: [c.initialState[0]!, c.initialState[1]!] as [number, number]
  };
}
export function parameterValue(p: DrivenParameters, key: string): number {
  return key === 'forcingAmplitude' ? p.driveAmplitude : key === 'forcingFrequency' ? p.driveFrequency : p.damping;
}
export function varyDriven(p: DrivenParameters, key: string, value: number): DrivenParameters {
  return {
    ...p,
    [key === 'forcingAmplitude' ? 'driveAmplitude' : key === 'forcingFrequency' ? 'driveFrequency' : 'damping']: value
  };
}
export const parameterUnit = (key: string): string =>
  key === 'forcingAmplitude' ? 'rad/s^2' : key === 'forcingFrequency' ? 'rad/s' : 's^-1';
export function assertStabilityStep(p: DrivenParameters, stepsPerPeriod: number): void {
  const dt = (2 * Math.PI) / p.driveFrequency / stepsPerPeriod;
  const scale = dt * Math.max(Math.sqrt(p.g / p.length), p.damping, p.driveFrequency, Math.sqrt(p.driveAmplitude));
  if (!Number.isFinite(scale) || scale > 0.15)
    throw new RangeError(
      '반환 맵의 무차원 step 안전 상한을 초과했습니다. stepsPerPeriod를 늘리거나 주파수·모델 척도를 조절하세요.'
    );
}
export class StabilityWork {
  value = 0;
  constructor(private readonly progress: (p: StabilityProgress) => void = () => {}) {}
  consume(amount = 1): void {
    this.value += amount;
    if (!Number.isSafeInteger(this.value) || this.value > STABILITY_LIMITS.work)
      throw new RangeError(`안정성 계산은 ${STABILITY_LIMITS.work} work 이하여야 합니다. 설정을 줄이세요.`);
  }
  report(completed: number, total: number): void {
    this.progress({
      fraction: total > 0 ? Math.min(0.99, completed / total) : null,
      work: this.value,
      phase: 'calculating'
    });
  }
}
export function drivenRhs(p: DrivenParameters, work?: StabilityWork): Derivative {
  return (s, out) => {
    work?.consume();
    if (Array.from(s).some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6))
      throw new RangeError(
        '반환 맵 상태가 유한 안전 범위를 벗어났습니다. 마지막 유효 해를 보존하고 guess를 조절하세요.'
      );
    rhsDriven(s, p, out);
    if (Array.from(out).some((x) => !Number.isFinite(x))) throw new RangeError('반환 맵 도함수가 유한하지 않습니다.');
  };
}
/** Exact-period RK4 map at the current experiment's actual forcing section. */
export function drivenMap(p: DrivenParameters, phase: number, steps: number, work: StabilityWork): MapFn {
  const rhs = drivenRhs(p, work),
    dt = (2 * Math.PI) / p.driveFrequency / steps;
  return (x, out) => {
    const s = Float64Array.of(x[0]!, x[1]!, phase),
      next = new Float64Array(3);
    for (let i = 0; i < steps; i++) {
      rk4Step(s, dt, rhs, next);
      s.set(next);
    }
    out[0] = s[0]!;
    out[1] = s[1]!;
  };
}
export function iterateMap(map: MapFn, x: readonly number[], period: number): number[] {
  let current = [...x];
  for (let i = 0; i < period; i++) {
    const next = new Array<number>(x.length).fill(0);
    map(current, next);
    current = next;
  }
  return current;
}
export function mapResidual(map: MapFn, x: readonly number[], period = 1): number {
  const next = iterateMap(map, x, period);
  const residual = Math.max(...next.map((v, i) => Math.abs(v - x[i]!)));
  if (!Number.isFinite(residual)) throw new RangeError('주기 잔차가 유한하지 않습니다.');
  return residual;
}
export function parameterGrid(start: number, end: number, points: number): number[] {
  return Array.from({ length: points }, (_, i) =>
    i === points - 1 ? end : start + ((end - start) * i) / (points - 1)
  );
}
export function transportPhase(
  p: DrivenParameters,
  state: readonly number[],
  phase: number,
  deltaPhase: number,
  steps: number,
  work: StabilityWork
): [number, number] {
  const duration = deltaPhase / p.driveFrequency;
  if (duration <= 1e-14) return [state[0]!, state[1]!];
  const n = Math.max(1, Math.ceil(duration / ((2 * Math.PI) / p.driveFrequency / steps)));
  const s = Float64Array.of(state[0]!, state[1]!, phase),
    next = new Float64Array(3),
    rhs = drivenRhs(p, work);
  for (let i = 0; i < n; i++) {
    rk4Step(s, duration / n, rhs, next);
    s.set(next);
  }
  return [s[0]!, s[1]!];
}
