import { defaultDrivenConfig, toCanonicalDriven, type DrivenConfig } from '../adapters/physics/driven';
import { defaultPlanarConfig, toCanonicalPlanar } from '../adapters/physics/planar';
import { defaultStabilitySettings } from '../adapters/analysis/stability/settings';
import type { StabilityKind, StabilitySettings } from '../adapters/analysis/stability/contracts';
import type { AnalysisState, ExperimentStateV1 } from '../contracts/experiment';
import { toStabilityAnalysis } from '../adapters/analysis/stability/state';
import { defaultAdvancedSettings } from '../adapters/analysis/advanced/settings';
import type { ResearchFields } from './research-focus-contracts';
import { stabilityFocusDeclaration } from './stability-focus-definitions';
import { inspectSafeData } from '../persistence/safe-data';
export function stabilityFocusFields(id: string, input?: ResearchFields): ResearchFields {
  const d = stabilityFocusDeclaration(id),
    safe = inspectSafeData(input ?? Object.fromEntries(d.fields.map((f) => [f.id, f.value])));
  if (!safe.ok || !safe.value || typeof safe.value !== 'object' || Array.isArray(safe.value))
    throw new Error('안전한 숫자 설정이 필요합니다.');
  const v = safe.value;
  if (
    Object.keys(v).sort().join(',') !==
    d.fields
      .map((f) => f.id)
      .sort()
      .join(',')
  )
    throw new Error('누락되었거나 알 수 없는 설정입니다.');
  for (const f of d.fields) {
    const n = v[f.id];
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      n < f.min ||
      n > f.max ||
      (f.integer && !Number.isSafeInteger(n)) ||
      (!d.exposed.includes(f.id) && n !== f.value)
    )
      throw new RangeError(`${f.label}: 고정값과 허용 범위를 확인하세요.`);
  }
  return v as ResearchFields;
}
export function stabilityDrivenConfig(id: string, input: ResearchFields): DrivenConfig {
  const f = stabilityFocusFields(id, input);
  return {
    ...defaultDrivenConfig(),
    parameters: { g: f.g!, length: f.length!, damping: f.damping! },
    forcing: { waveform: 'sine', amplitude: f.amplitude!, frequency: f.frequency!, phase: Math.PI / 2 },
    initialState: [id === '6.1' ? f.equilibrium! * Math.PI + f.perturbation! : f.theta!, f.omega!, 0],
    step: f.step!,
    duration: f.duration!,
    sampleEvery: 1,
    analyses: []
  };
}
function stabilityBaseCanonical(id: string, input: ResearchFields): ExperimentStateV1 {
  const f = stabilityFocusFields(id, input),
    result =
      id === '6.12'
        ? toCanonicalPlanar({
            ...defaultPlanarConfig(),
            gamma: 0,
            duration: f.duration!,
            step: f.step!,
            sampleEvery: 1
          })
        : toCanonicalDriven(stabilityDrivenConfig(id, f));
  if (!result.ok) throw new Error(result.issues.map((x) => x.message).join(' '));
  return result.value;
}
export function stabilityFocusSettings(
  id: string,
  kind: StabilityKind,
  fields: ResearchFields,
  source?: string
): StabilitySettings {
  const experiment = stabilityBaseCanonical(id, fields),
    s = defaultStabilitySettings(kind, experiment, source);
  if ('stepsPerPeriod' in s) s.stepsPerPeriod = fields.stepsPerPeriod!;
  if ('maxIterations' in s) s.maxIterations = kind === 'periodic-shooting' ? (fields.iterations ?? 12) : 12;
  if (id === '6.2') Object.assign(s, { period: fields.period!, maxIterations: fields.iterations! });
  if (id === '6.4') Object.assign(s, { phaseCount: 33, intervals: 2048 });
  if (id === '6.5')
    Object.assign(s, { start: 0.2, end: fields.endAmplitude!, points: fields.points!, maxIterations: 10 });
  if (id === '6.6')
    Object.assign(s, { guess0: 1, start: 1, ds: fields.ds!, steps: fields.arcSteps!, maxIterations: 15 });
  if (id === '6.7')
    Object.assign(s, { epsilon: fields.epsilon!, start: 0.02, end: fields.endLambda!, points: 7, maxIterations: 15 });
  if (id === '6.8')
    Object.assign(s, { start: 1.04, end: fields.endAmplitude!, points: 9, maxIterations: 16, stepsPerPeriod: 256 });
  if (id === '6.9' && kind === 'neimark-sacker')
    Object.assign(s, { start: 1.9, end: fields.endParameter!, points: 9, maxIterations: 15 });
  if (id === '6.9' && kind === 'torus')
    Object.assign(s, {
      start: fields.circleParameter!,
      end: fields.circleParameter! - 0.005,
      points: 2,
      collocation: 21,
      maxIterations: 30
    });
  if (id === '6.10')
    Object.assign(s, {
      start: 0.3,
      end: 0.7,
      points: 25,
      coupling: fields.coupling!,
      iterations: fields.iterations!,
      transient: 500
    });
  if (id === '6.11')
    Object.assign(s, {
      resolution: fields.resolution!,
      xLow: 0.9,
      xHigh: 1.1,
      yLow: 0.4,
      yHigh: 0.6,
      lyapunovSteps: 500,
      dt: 0.02
    });
  return s;
}
export const STABILITY_FOCUS_KINDS: Readonly<Record<string, readonly StabilityKind[]>> = {
  '6.1': [],
  '6.2': ['periodic-shooting'],
  '6.3': ['floquet'],
  '6.4': ['melnikov'],
  '6.5': ['continuation'],
  '6.6': ['pseudo-arclength'],
  '6.7': ['branch-switch'],
  '6.8': ['continuation'],
  '6.9': ['neimark-sacker', 'torus'],
  '6.10': ['arnold-tongue'],
  '6.11': ['codim-two']
};
export function stabilityFocusAnalysis(id: string, input: ResearchFields): AnalysisState[] {
  const f = stabilityFocusFields(id, input);
  if (id === '6.12')
    return (['basin', 'wada'] as const).map((kind) => ({
      id: `analysis:${kind}`,
      algorithmVersion: 'advanced-diagnostics-v1',
      settings: Object.fromEntries(
        Object.entries({
          ...defaultAdvancedSettings(kind),
          resolution: f.resolution!,
          duration: f.duration!,
          dt: f.step!
        }).map(([key, value]) => [
          key,
          {
            kind: 'scalar' as const,
            value: value as number,
            unit: ['duration', 'dt'].includes(key)
              ? ('s' as const)
              : ['rangeLow', 'rangeHigh'].includes(key)
                ? ('rad' as const)
                : ('1' as const)
          }
        ])
      ),
      options: { kind }
    }));
  return (STABILITY_FOCUS_KINDS[id] ?? []).map((kind) =>
    toStabilityAnalysis({ kind, settings: stabilityFocusSettings(id, kind, f) })
  );
}
export function stabilityFocusCanonical(id: string, input: ResearchFields): ExperimentStateV1 {
  return { ...stabilityBaseCanonical(id, input), analyses: stabilityFocusAnalysis(id, input) };
}
