import type { AnalysisState, ExperimentStateV1 } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';
import {
  CORE_DIAGNOSTIC_KINDS,
  CORE_DIAGNOSTIC_VERSION,
  type CoreDiagnosticKind
} from '../../adapters/analysis/core/contracts';
import {
  ADVANCED_DIAGNOSTIC_KINDS,
  ADVANCED_DIAGNOSTIC_VERSION,
  type AdvancedDiagnosticKind
} from '../../adapters/analysis/advanced/contracts';
import { validateCoreSettings } from '../../adapters/analysis/core/settings';
import { validateAdvancedSettings } from '../../adapters/analysis/advanced/settings';
import { inspectSafeData } from '../../persistence/safe-data';

export type DiagnosticFamily = 'core' | 'advanced';
export interface DiagnosticSelection {
  readonly kind: CoreDiagnosticKind | AdvancedDiagnosticKind;
  readonly settings: Record<string, number | string>;
}

/** Settings stay in their native analysis contract, separate from physical integration. */
const settingUnit = (key: string, coordinate = 0): CanonicalUnit =>
  ['duration', 'transient', 'dt'].includes(key)
    ? 's'
    : key === 'sectionValue'
      ? coordinate >= 2
        ? 'rad/s'
        : 'rad'
      : ['rangeLow', 'rangeHigh'].includes(key)
        ? 'rad'
        : key === 'margin'
          ? 's^-1'
          : '1';
const version = (family: DiagnosticFamily) =>
  family === 'core' ? CORE_DIAGNOSTIC_VERSION : ADVANCED_DIAGNOSTIC_VERSION;
const analysisId = (kind: string) =>
  `analysis:${kind === 'sali' || kind === 'fli' ? 'sali-fli' : kind === 'uncertainty' ? 'basin' : kind}` as const;

function validate(family: DiagnosticFamily, selection: DiagnosticSelection) {
  if (selection.kind === 'state-time' || selection.kind === 'phase')
    throw new RangeError('상태/시간·위상 투영은 기록의 표시이며 canonical 분석 카탈로그 항목이 아닙니다.');
  const kinds: readonly string[] = family === 'core' ? CORE_DIAGNOSTIC_KINDS : ADVANCED_DIAGNOSTIC_KINDS;
  if (!kinds.includes(selection.kind)) throw new RangeError('분석 종류와 알고리즘 버전이 일치하지 않습니다.');
  if (family === 'core') validateCoreSettings(selection.kind as CoreDiagnosticKind, selection.settings);
  else validateAdvancedSettings(selection.kind as AdvancedDiagnosticKind, selection.settings);
}

export function toDiagnosticAnalysis(family: DiagnosticFamily, selection: DiagnosticSelection): AnalysisState {
  validate(family, selection);
  return {
    id: analysisId(selection.kind),
    algorithmVersion: version(family),
    settings: Object.fromEntries(
      Object.entries(selection.settings)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([key, value]) => [
          key,
          { kind: 'scalar' as const, value, unit: settingUnit(key, Number(selection.settings.coordinate ?? 0)) }
        ])
    ),
    options: {
      kind: selection.kind,
      ...Object.fromEntries(Object.entries(selection.settings).filter(([, value]) => typeof value === 'string'))
    }
  };
}

/** Reject changed units/unknown settings rather than silently reverting to defaults. */
export function fromDiagnosticAnalysis(entry: AnalysisState, family: DiagnosticFamily): DiagnosticSelection {
  const safe = inspectSafeData(entry);
  if (!safe.ok) throw new RangeError('저장된 분석은 안전한 일반 데이터여야 합니다.');
  entry = safe.value as unknown as AnalysisState;
  if (entry.algorithmVersion !== version(family) || typeof entry.options?.kind !== 'string')
    throw new RangeError('저장된 분석 버전과 종류를 확인하세요. 원본은 보존했습니다.');
  const kind = entry.options.kind as DiagnosticSelection['kind'];
  if (entry.id !== analysisId(kind)) throw new RangeError('분석 ID와 종류가 일치하지 않습니다.');
  const settings: Record<string, number | string> = {};
  const coordinate = entry.settings.coordinate?.kind === 'scalar' ? entry.settings.coordinate.value : 0;
  for (const [key, quantity] of Object.entries(entry.settings)) {
    if (quantity.kind !== 'scalar' || quantity.unit !== settingUnit(key, coordinate))
      throw new RangeError(`${key}: 저장된 분석 단위가 일치하지 않습니다.`);
    settings[key] = quantity.value;
  }
  for (const [key, value] of Object.entries(entry.options)) {
    if (key === 'kind') continue;
    if (typeof value !== 'string' || key in settings)
      throw new RangeError('저장된 분석 option이 숫자 설정과 중복되거나 올바르지 않습니다.');
    settings[key] = value;
  }
  const selection = { kind, settings };
  validate(family, selection);
  return selection;
}

export function restoredDiagnostic(
  experiment: ExperimentStateV1,
  family: DiagnosticFamily,
  kind?: string
): DiagnosticSelection | undefined {
  const entry = experiment.analyses.find(
    (candidate) =>
      candidate.algorithmVersion === version(family) && (kind === undefined || candidate.options?.kind === kind)
  );
  return entry ? fromDiagnosticAnalysis(entry, family) : undefined;
}
