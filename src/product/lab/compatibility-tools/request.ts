import { inspectSafeData } from '../../persistence/safe-data';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { OGY_MAX_STEPS, type OgyRequest, type OgySettings } from './contracts';

export const OGY_SETTING_RANGES: Readonly<Record<keyof OgySettings, readonly [number, number]>> = {
  a: [0.1, 1.6],
  b: [0.1, 0.5],
  offsetX: [-0.05, 0.05],
  offsetY: [-0.05, 0.05],
  region: [0.005, 0.2],
  maxDelta: [0, 0.1],
  steps: [32, OGY_MAX_STEPS]
};

export function validateOgyRequest(input: unknown): OgyRequest {
  const safe = inspectSafeData(input);
  if (!safe.ok) throw new Error('안전하고 크기 제한 안의 실험·OGY 설정이 필요합니다.');
  const value = safe.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OGY 요청 객체가 필요합니다.');
  if (Object.keys(value).sort().join(',') !== 'id,settings,source') throw new Error('알 수 없는 OGY 요청 필드입니다.');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,96}$/.test(value.id))
    throw new Error('안전한 OGY 요청 ID가 필요합니다.');
  const source = validateExperimentState(value.source);
  if (!source.ok) throw new Error('원 실험을 canonical 설정으로 확인할 수 없습니다.');
  const settings = value.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('OGY 설정이 필요합니다.');
  if (Object.keys(settings).sort().join(',') !== Object.keys(OGY_SETTING_RANGES).sort().join(','))
    throw new Error('OGY 설정의 누락·추가 필드를 확인하세요.');
  for (const [key, bounds] of Object.entries(OGY_SETTING_RANGES)) {
    const number = settings[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < bounds[0] || number > bounds[1])
      throw new Error(`${key}: ${bounds[0]}–${bounds[1]} 범위의 유한한 수가 필요합니다.`);
  }
  if (!Number.isInteger(settings.steps)) throw new Error('반복 수는 정수여야 합니다.');
  return { id: value.id, source: source.value, settings: settings as unknown as OgySettings };
}
