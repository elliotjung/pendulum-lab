import { nonlinearFocusCanonical, nonlinearFocusConfig } from './nonlinear-focus-config';
import { nonlinearFocusDeclaration } from './nonlinear-focus-definitions';
import { runNative, nativeWarnings } from './nonlinear-focus-helpers';
import { firstNonlinearExperiment } from './nonlinear-focus-first';
import { secondNonlinearExperiment } from './nonlinear-focus-second';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';

/** Actual S07/S13/S14 adapters supply all trajectories and native Floquet computations. */
export function executeNonlinearFocus(
  id: string,
  fields: ResearchFields,
  progress?: (fraction: number) => void
): ResearchFocusResult {
  const declaration = nonlinearFocusDeclaration(id);
  if (Object.keys(fields).length !== declaration.fields.length) throw new Error('단원의 전체 설정을 입력하세요.');
  for (const f of declaration.fields) {
    const value = fields[f.id];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Object.is(value, -0) ||
      value < f.min ||
      value > f.max ||
      (!declaration.exposed.includes(f.id) && value !== f.value)
    )
      throw new Error(`${f.label}의 단위·범위·고정 조건을 확인하세요.`);
  }
  const source = nonlinearFocusConfig(id, fields),
    canonical = nonlinearFocusCanonical(id, fields);
  const samples = runNative(source, (p) => progress?.(0.2 * p));
  const parts =
    Number(id.slice(2)) <= 5
      ? firstNonlinearExperiment(id, fields, source, samples, (p) => progress?.(0.2 + 0.75 * p))
      : secondNonlinearExperiment(id, fields, source, samples, (p) => progress?.(0.2 + 0.75 * p));
  progress?.(1);
  return {
    schema: 'pendulum-research-focus/v1',
    unitId: id,
    fields: { ...fields },
    canonical,
    ...parts,
    warnings: [
      ...nativeWarnings(source),
      ...parts.warnings,
      'Lab에는 선택한 기준 run의 초기 설정·단위·stepper를 전달합니다. sweep·동반 실행·해석용 fitting 설정은 단원의 전체 fields와 결과 JSON에 보존되며 기준 run의 분석 작업으로 추가하지 않습니다.'
    ]
  };
}
