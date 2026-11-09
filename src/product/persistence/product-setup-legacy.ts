import { failure, type ContractResult } from '../contracts/validation';
import { isRecord } from '../contracts/contract-checks';
import { confirmLegacyMigration, type LegacyMigrationPreview } from './legacy-migration';
import { parseContractJson } from './json';
import { validateProductSetup, PRODUCT_SETUP_SCHEMA, type ProductSetupV1 } from './product-setup';

/** Explicit adoption of a genuine session/run preview. Physical input comes
 * only from its issued confirmation; original mode/SPF come only from that
 * validated source. Other controls are the caller's separate current choices.
 * No raw legacy text/hash/storage key is copied into the public setup. */
export function productSetupFromLegacyPreview(
  preview: LegacyMigrationPreview,
  id: string,
  controls: unknown
): ContractResult<ProductSetupV1> {
  const confirmed = confirmLegacyMigration(preview, id);
  if (!confirmed.ok) return confirmed;
  if (preview.sourceKind !== 'session' && preview.sourceKind !== 'modern-run')
    return failure(
      'unsupported-setup-source',
      '$.sourceKind',
      'Session 또는 modern run의 확인된 재시작만 이 경로로 엽니다. 링크는 전체 호환 전달을 사용하세요.',
      'keep-original'
    );
  const chosen = validateProductSetup({ schema: PRODUCT_SETUP_SCHEMA, experiment: confirmed.value, controls });
  if (!chosen.ok) return chosen;
  const parsed = parseContractJson(preview.sourceText.trim());
  if (!parsed.ok) return parsed;
  const record = isRecord(parsed.value) ? parsed.value : undefined;
  const source = preview.sourceKind === 'modern-run' ? record?.runtimeSnapshot : record;
  if (!isRecord(source) || !Object.hasOwn(source, 'mode') || !Object.hasOwn(source, 'stepsPerFrame'))
    return failure(
      'incomplete-session-execution',
      '$',
      '원본 mode·stepsPerFrame이 없는 입력에 실행 설정을 추정하지 않았습니다.',
      'keep-original'
    );
  // No clamping: a historically accepted SPF above the current UI's60 limit
  // fails validation and keeps the original source/preview intact.
  return validateProductSetup({
    ...chosen.value,
    controls: {
      ...chosen.value.controls,
      playback: { ...chosen.value.controls.playback, mode: source.mode, stepsPerFrame: source.stepsPerFrame }
    }
  });
}
