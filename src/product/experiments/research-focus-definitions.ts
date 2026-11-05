import { reproducibilityFocusDeclaration } from './reproducibility-focus-definitions';
import { frontierFocusDeclaration } from './frontier-focus-definitions';
import { stabilityFocusDeclaration } from './stability-focus-definitions';
import { nonlinearFocusDeclaration } from './nonlinear-focus-definitions';
import { chaosFocusDeclaration } from './chaos-focus-definitions';
import type { ResearchFields, ResearchFocusDeclaration } from './research-focus-contracts';
import { inspectSafeData } from '../persistence/safe-data';

/** Safe to import during content validation: declarations contain no engine code. */
export function researchFocusDeclaration(id: string): ResearchFocusDeclaration {
  if (/^4\.(?:[1-9]|10)$/.test(id)) return nonlinearFocusDeclaration(id);
  if (/^5\.(?:[1-9]|1[0-3])$/.test(id)) return chaosFocusDeclaration(id);
  if (/^6\.(?:[1-9]|1[0-2])$/.test(id)) return stabilityFocusDeclaration(id);
  if (/^7\.(?:[1-9]|1[0-3])$/.test(id)) return frontierFocusDeclaration(id);
  if (/^8\.(?:[1-9]|1[0-2])$/.test(id)) return reproducibilityFocusDeclaration(id);
  throw new Error('등록된 연구 전용 실험 단원이 필요합니다.');
}
export const researchPresetFields = (id: string): ResearchFields =>
  Object.fromEntries(researchFocusDeclaration(id).fields.map((f) => [f.id, f.value]));

export function validateResearchFields(id: string, input: unknown): ResearchFields {
  const safe = inspectSafeData(input);
  if (!safe.ok) throw new Error('안전한 숫자 설정을 입력하세요.');
  const value = safe.value;
  const d = researchFocusDeclaration(id);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      d.fields
        .map((f) => f.id)
        .sort()
        .join(',')
  )
    throw new Error('단원의 모든 설정을 한 번씩 입력하세요.');
  for (const f of d.fields) {
    const v = value[f.id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max || (f.integer && !Number.isInteger(v)))
      throw new Error(`${f.label}: ${f.min}–${f.max} ${f.unit}${f.integer ? ' 정수' : ''} 범위를 입력하세요.`);
    if (!d.exposed.includes(f.id) && v !== f.value) throw new Error(`단원에서 고정한 ${f.label} 값을 유지하세요.`);
  }
  return Object.fromEntries(d.fields.map((f) => [f.id, value[f.id] as number]));
}
