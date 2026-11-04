import { createPlanarSimulation } from '../adapters/physics/planar';
import { createDrivenSimulation, drivenWarnings } from '../adapters/physics/driven';
import { createNonlinearSimulation, nonlinearWarnings } from '../adapters/physics/nonlinear';
import type { NonlinearFocusConfig } from './nonlinear-focus-config';
import type { ResearchFocusResult } from './research-focus-contracts';

export interface FocusSample {
  time: number;
  timeUnit: 's' | '1';
  state: readonly number[];
  energy: number;
  forcing: number;
  control: number;
  feedback: number;
  friction: number;
  mode: string;
}
export const metric = (id: string, label: string, value: number, unit = '1') => ({
  id,
  label,
  value: value === 0 ? 0 : value,
  unit
});
export type FocusParts = Pick<ResearchFocusResult, 'metrics' | 'tables' | 'charts' | 'warnings'>;
export const thin = <T>(values: readonly T[], maximum = 801): T[] =>
  values.length <= maximum
    ? [...values]
    : Array.from({ length: maximum }, (_, i) => values[Math.floor((i * (values.length - 1)) / (maximum - 1))]!);
export function runNative(source: NonlinearFocusConfig, onProgress?: (p: number) => void): FocusSample[] {
  if (source.config.duration / source.config.step > 20000) throw new Error('한 실행의 20,000단계 예산을 넘었습니다.');
  const simulation =
    source.family === 'planar'
      ? createPlanarSimulation(source.config)
      : source.family === 'driven'
        ? createDrivenSimulation(source.config)
        : createNonlinearSimulation(source.config);
  const samples: FocusSample[] = [];
  const timeUnit =
    source.family === 'nonlinear' &&
    ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(source.config.systemId)
      ? '1'
      : 's';
  function take() {
    const raw = simulation.snapshot();
    samples.push({
      time: raw.time,
      timeUnit,
      state: [...raw.state],
      energy: typeof raw.energy === 'number' ? raw.energy : raw.energy.total,
      forcing: 'forcing' in raw ? raw.forcing : 0,
      control: 'control' in raw ? raw.control : 0,
      feedback: 'feedback' in raw ? raw.feedback : 0,
      friction: 'frictionForce' in raw ? raw.frictionForce : 0,
      mode: 'mode' in raw ? raw.mode : 'smooth'
    });
  }
  take();
  while (!simulation.done) {
    simulation.step();
    take();
    if (samples.length % 128 === 0) onProgress?.(Math.min(1, samples.at(-1)!.time / source.config.duration));
  }
  onProgress?.(1);
  return samples;
}
export const nativeWarnings = (source: NonlinearFocusConfig): readonly string[] =>
  source.family === 'driven'
    ? drivenWarnings(source.config)
    : source.family === 'nonlinear'
      ? nonlinearWarnings(source.config)
      : ['힌지 감쇠 토크는 -γ ω입니다. γ는 각운동량/시간 계수이며 s⁻¹ 감쇠율과 다릅니다.'];
export function lineChart(
  id: string,
  title: string,
  samples: readonly FocusSample[],
  columns: readonly { label: string; value: (sample: FocusSample) => number }[],
  unit: string
): ResearchFocusResult['charts'][number] {
  const values = thin(samples);
  return {
    id,
    title,
    xLabel: samples[0]?.timeUnit === '1' ? '정규화 시간 τ (1)' : '시간 t (s)',
    yLabel: unit,
    series: columns.map((c) => ({ label: c.label, points: values.map((s) => ({ x: s.time, y: c.value(s) })) }))
  };
}
export function phaseChart(
  id: string,
  title: string,
  series: readonly { label: string; samples: readonly FocusSample[] }[]
): ResearchFocusResult['charts'][number] {
  return {
    id,
    title,
    xLabel: '정규화 변위 x (1)',
    yLabel: '정규화 속도 v (1)',
    series: series.map((s) => ({
      label: s.label,
      points: thin(s.samples).map((p) => ({ x: p.state[0]!, y: p.state[1]! }))
    }))
  };
}
export const tail = (s: readonly FocusSample[]) => s.slice(Math.floor(s.length / 2));
export const rms = (v: readonly number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / Math.max(1, v.length));
export const mean = (v: readonly number[]) => v.reduce((a, x) => a + x, 0) / Math.max(1, v.length);
export const halfRange = (s: readonly FocusSample[], index = 0) => {
  let lo = Infinity,
    hi = -Infinity;
  for (const p of tail(s)) {
    lo = Math.min(lo, p.state[index]!);
    hi = Math.max(hi, p.state[index]!);
  }
  return (hi - lo) / 2;
};
export function trap(samples: readonly FocusSample[], value: (s: FocusSample) => number): number {
  let x = 0;
  for (let i = 1; i < samples.length; i++)
    x += ((samples[i]!.time - samples[i - 1]!.time) * (value(samples[i]!) + value(samples[i - 1]!))) / 2;
  return x;
}
/** Small linear least-squares display fit, never an alternate physical equation. */
export function harmonicFit(samples: readonly FocusSample[], frequency: number) {
  const a = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const s of tail(samples)) {
    const b = [Math.cos(frequency * s.time), Math.sin(frequency * s.time), 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) a[i]![j]! += b[i]! * b[j]!;
      a[i]![3]! += b[i]! * s.state[0]!;
    }
  }
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++) if (Math.abs(a[j]![i]!) > Math.abs(a[pivot]![i]!)) pivot = j;
    [a[pivot], a[i]] = [a[i]!, a[pivot]!];
    if (Math.abs(a[i]![i]!) < 1e-12)
      throw new Error('위상 fitting에 충분한 구동 주기가 없습니다. 관찰 구간을 늘리세요.');
    const scale = a[i]![i]!;
    for (let j = i; j < 4; j++) a[i]![j]! /= scale;
    for (let k = 0; k < 3; k++)
      if (k !== i) {
        const q = a[k]![i]!;
        for (let j = i; j < 4; j++) a[k]![j]! -= q * a[i]![j]!;
      }
  }
  return { amplitude: Math.hypot(a[0]![3]!, a[1]![3]!), lag: Math.atan2(a[1]![3]!, a[0]![3]!) };
}
