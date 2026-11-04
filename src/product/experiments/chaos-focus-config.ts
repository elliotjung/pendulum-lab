import { defaultPlanarConfig, toCanonicalPlanar, type PlanarConfig } from '../adapters/physics/planar';
import { defaultCoreSettings } from '../adapters/analysis/core/settings';
import { defaultAdvancedSettings } from '../adapters/analysis/advanced/settings';
import type { CoreDiagnosticKind } from '../adapters/analysis/core/contracts';
import type { AdvancedDiagnosticKind } from '../adapters/analysis/advanced/contracts';
import type { AnalysisState, ExperimentStateV1 } from '../contracts/experiment';
import type { CanonicalUnit } from '../contracts/quantities';
import { inspectSafeData } from '../persistence/safe-data';
import type { ResearchFields } from './research-focus-contracts';
import { chaosFocusDeclaration } from './chaos-focus-definitions';

export const CHAOS_FOCUS_KINDS: Readonly<Record<string, CoreDiagnosticKind | AdvancedDiagnosticKind>> = {
  '5.1': 'phase',
  '5.2': 'fft',
  '5.3': 'naff',
  '5.4': 'poincare',
  '5.5': 'lyapunov',
  '5.6': 'lyapunov',
  '5.7': 'sali',
  '5.8': 'zero-one',
  '5.9': 'shadowing',
  '5.10': 'rqa',
  '5.11': 'recurrence-network',
  '5.12': 'correlation-dimension',
  '5.13': 'multifractal'
};
export function chaosFocusFields(id: string, input?: ResearchFields): ResearchFields {
  const d = chaosFocusDeclaration(id);
  const values = input ?? Object.fromEntries(d.fields.map((f) => [f.id, f.value]));
  const safe = inspectSafeData(values);
  if (!safe.ok || !values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('유효한 전용 실험 설정이 필요합니다.');
  if (
    Object.keys(values).length !== d.fields.length ||
    Object.keys(values).some((k) => !d.fields.some((f) => f.id === k))
  )
    throw new Error('누락되었거나 알 수 없는 실험 설정입니다.');
  for (const f of d.fields) {
    const v = values[f.id];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < f.min ||
      v > f.max ||
      (f.integer && !Number.isSafeInteger(v))
    )
      throw new RangeError(`${f.label}: ${f.min}–${f.max} ${f.unit} 범위를 확인하세요.`);
  }
  const steps = values.duration! / values.step!;
  if (Math.abs(steps - Math.round(steps)) > 1e-7 || Math.round(steps) % values.sampleEvery! !== 0)
    throw new RangeError('균일 sampling을 위해 기간은 step × 기록 간격의 정수 배여야 합니다. 자동 보간하지 않습니다.');
  if (steps > 8000) throw new RangeError('전용 실험은 8000 step 이하여야 합니다.');
  return structuredClone(values);
}
export function chaosFocusConfig(id: string, input: ResearchFields): PlanarConfig {
  const f = chaosFocusFields(id, input);
  return {
    ...defaultPlanarConfig(),
    gamma: f.gamma!,
    initialState: [f.theta1!, f.theta2!, f.omega1!, f.omega2!],
    step: f.step!,
    duration: f.duration!,
    sampleEvery: f.sampleEvery!,
    analyses: []
  };
}
export function chaosFocusSettings(id: string, f: ResearchFields): Record<string, number | string> {
  const kind = CHAOS_FOCUS_KINDS[id];
  if (!kind) throw new RangeError('과정 5의 단원을 선택하세요.');
  const advanced = Number(id.slice(2)) >= 10;
  const s = advanced
    ? defaultAdvancedSettings(kind as AdvancedDiagnosticKind)
    : defaultCoreSettings(kind as CoreDiagnosticKind);
  if (advanced) {
    Object.assign(s, { dimension: f.dimension!, delay: f.delay!, maxSamples: f.maxSamples! });
    if (kind === 'rqa' || kind === 'recurrence-network') s.targetRecurrenceRate = f.targetRecurrenceRate!;
    if (kind === 'correlation-dimension')
      Object.assign(s, { fitLowFraction: f.fitLowFraction!, fitHighFraction: f.fitHighFraction! });
    if (kind === 'multifractal') Object.assign(s, { qMin: f.qMin!, qMax: f.qMax! });
  } else {
    if ('duration' in s) s.duration = f.duration!;
    if (kind === 'phase') s.phaseCoordinate = 2;
    if (kind === 'fft') s.window = f.window === 0 ? 'none' : 'hann';
    if (kind === 'poincare') Object.assign(s, { sectionValue: f.sectionValue!, direction: 'rising', maxPoints: 64 });
    if (kind === 'lyapunov') Object.assign(s, { renormEvery: f.renormEvery!, count: id === '5.5' ? 1 : 4 });
    if (kind === 'zero-one') Object.assign(s, { coordinate: f.coordinate!, stride: f.stride! });
    if (kind === 'shadowing') Object.assign(s, { threshold: f.threshold!, referenceRatio: 4, sampleEvery: 10 });
  }
  return s;
}
export function chaosFocusAnalysis(id: string, input: ResearchFields): AnalysisState[] {
  const f = chaosFocusFields(id, input);
  if (id === '5.1') return [];
  const kinds = id === '5.3' ? ['naff', 'fft'] : id === '5.7' ? ['sali'] : [CHAOS_FOCUS_KINDS[id]!];
  return kinds.map((kind) => {
    const s = kind === 'fft' && id === '5.3' ? defaultCoreSettings('fft') : chaosFocusSettings(id, f);
    const units = (key: string): CanonicalUnit =>
      ['duration', 'transient'].includes(key) ? 's' : key === 'sectionValue' ? 'rad' : '1';
    const numeric = Object.entries(s).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
    const strings = Object.entries(s).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return {
      id: `analysis:${kind === 'sali' ? 'sali-fli' : kind}`,
      algorithmVersion: Number(id.slice(2)) >= 10 ? 'advanced-diagnostics-v1' : 'core-diagnostics-v1',
      settings: Object.fromEntries(
        numeric.map(([key, value]) => [key, { kind: 'scalar' as const, value, unit: units(key) }])
      ),
      options: { kind, ...Object.fromEntries(strings) }
    };
  });
}
export function chaosFocusCanonical(id: string, input: ResearchFields): ExperimentStateV1 {
  const result = toCanonicalPlanar({ ...chaosFocusConfig(id, input), analyses: chaosFocusAnalysis(id, input) });
  if (!result.ok) throw new Error(result.issues.map((x) => x.message).join(' '));
  return result.value;
}
