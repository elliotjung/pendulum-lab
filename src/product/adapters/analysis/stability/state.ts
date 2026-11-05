import type { AnalysisState, ExperimentStateV1 } from '../../../contracts/experiment';
import type { CanonicalUnit } from '../../../contracts/quantities';
import { inspectSafeData } from '../../../persistence/safe-data';
import { STABILITY_KINDS, STABILITY_VERSION, type StabilityKind, type StabilitySettings } from './contracts';
import { validateStabilitySettings } from './settings';
export interface StabilitySelection {
  readonly kind: StabilityKind;
  readonly settings: StabilitySettings;
}
const ids: Readonly<Record<StabilityKind, AnalysisState['id']>> = {
  'fixed-point': 'analysis:fixed-point',
  'periodic-shooting': 'analysis:periodic-orbits',
  floquet: 'analysis:floquet',
  melnikov: 'analysis:melnikov',
  continuation: 'analysis:continuation',
  'pseudo-arclength': 'analysis:arclength',
  'branch-switch': 'analysis:branch-switch',
  'neimark-sacker': 'analysis:neimark-sacker',
  torus: 'analysis:torus',
  'arnold-tongue': 'analysis:arnold-tongue',
  'codim-two': 'analysis:codimension-two'
};
const parameterUnit = (parameter: unknown): CanonicalUnit =>
  parameter === 'forcingAmplitude'
    ? 'rad/s^2'
    : parameter === 'forcingFrequency'
      ? 'rad/s'
      : parameter === 'damping'
        ? 's^-1'
        : '1';
function unit(key: string, s: StabilitySettings): CanonicalUnit {
  if (key === 'dt' || (key === 'period' && s.source === 'linear-oscillator')) return 's';
  if (key === 'linearFrequency') return 'rad/s';
  if (key === 'linearDamping' || key === 'neutralBand') return 's^-1';
  if (s.source === 'current-driven') {
    if (key === 'guess0') return 'rad';
    if (key === 'guess1') return 'rad/s';
    if (key === 'start' || key === 'end') return parameterUnit(s.parameter);
    if (key === 'xLow' || key === 'xHigh') return parameterUnit(s.xParameter);
    if (key === 'yLow' || key === 'yHigh') return parameterUnit(s.yParameter);
  }
  return '1';
}
const analysisId = (kind: StabilityKind, s: StabilitySettings) =>
  kind === 'floquet' && s.source === 'linear-oscillator' ? 'analysis:floquet-linear' : ids[kind];
/** Versioned native settings only; independent benchmarks retain their explicit source. */
export function toStabilityAnalysis(selection: StabilitySelection): AnalysisState {
  validateStabilitySettings(selection.kind, selection.settings);
  const { kind, settings } = selection;
  return {
    id: analysisId(kind, settings),
    algorithmVersion: STABILITY_VERSION,
    settings: Object.fromEntries(
      Object.entries(settings)
        .filter((e): e is [string, number] => typeof e[1] === 'number')
        .map(([key, value]) => [key, { kind: 'scalar' as const, value, unit: unit(key, settings) }])
    ),
    options: { kind, ...Object.fromEntries(Object.entries(settings).filter(([, value]) => typeof value === 'string')) }
  };
}
export function fromStabilityAnalysis(input: AnalysisState): StabilitySelection {
  const safe = inspectSafeData(input);
  if (!safe.ok) throw new RangeError('저장된 안정성 설정은 안전한 일반 데이터여야 합니다.');
  const entry = safe.value as unknown as AnalysisState;
  const kind = entry.options?.kind;
  if (
    entry.algorithmVersion !== STABILITY_VERSION ||
    typeof kind !== 'string' ||
    !(STABILITY_KINDS as readonly string[]).includes(kind)
  )
    throw new RangeError('안정성 설정 버전·종류가 다릅니다.');
  const settings: StabilitySettings = {};
  for (const [key, value] of Object.entries(entry.options ?? {}))
    if (key !== 'kind') {
      if (typeof value !== 'string' || Object.hasOwn(entry.settings, key))
        throw new RangeError('안정성 option이 중복되거나 유효하지 않습니다.');
      settings[key] = value;
    }
  for (const [key, q] of Object.entries(entry.settings)) {
    if (q.kind !== 'scalar' || !Number.isFinite(q.value))
      throw new RangeError('안정성 설정은 유한한 scalar여야 합니다.');
    settings[key] = q.value;
  }
  validateStabilitySettings(kind as StabilityKind, settings);
  for (const [key, q] of Object.entries(entry.settings))
    if (q.unit !== unit(key, settings)) throw new RangeError(`${key}: 안정성 설정 단위가 다릅니다.`);
  if (entry.id !== analysisId(kind as StabilityKind, settings))
    throw new RangeError('안정성 분석 ID가 종류·대상과 다릅니다.');
  return { kind: kind as StabilityKind, settings };
}
export function restoredStability(experiment: ExperimentStateV1, kind?: StabilityKind): StabilitySelection | undefined {
  const entry = experiment.analyses.find(
    (a) => a.algorithmVersion === STABILITY_VERSION && (kind === undefined || a.options?.kind === kind)
  );
  return entry ? fromStabilityAnalysis(entry) : undefined;
}
