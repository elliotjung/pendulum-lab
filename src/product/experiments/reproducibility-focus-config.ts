import { defaultPlanarConfig, toCanonicalPlanar, type PlanarConfig } from '../adapters/physics/planar';
import { nonlinearPresetConfig, toCanonicalNonlinear, type NonlinearConfig } from '../adapters/physics/nonlinear';
import { inspectSafeData } from '../persistence/safe-data';
import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ResearchFields } from './research-focus-contracts';
import { reproducibilityFocusDeclaration } from './reproducibility-focus-definitions';

export function reproducibilityFocusFields(id: string, input?: ResearchFields): ResearchFields {
  const d = reproducibilityFocusDeclaration(id),
    values = input ?? Object.fromEntries(d.fields.map((f) => [f.id, f.value]));
  const safe = inspectSafeData(values);
  if (
    !safe.ok ||
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.keys(values).sort().join(',') !==
      d.fields
        .map((f) => f.id)
        .sort()
        .join(',')
  )
    throw new Error('단원의 모든 유한한 설정을 입력하세요.');
  for (const f of d.fields) {
    const v = values[f.id];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < f.min ||
      v > f.max ||
      (f.integer && !Number.isSafeInteger(v))
    )
      throw new RangeError(`${f.label} 범위를 확인하세요.`);
    if (!d.exposed.includes(f.id) && v !== f.value) throw new Error('단원에서 고정한 설정을 유지하세요.');
  }
  if (Math.abs(values.duration! / values.step! - Math.round(values.duration! / values.step!)) > 1e-7)
    throw new RangeError('기간은 시간 간격의 정수 배여야 합니다.');
  if (id === '8.10' && values.krylov! > values.dimension!)
    throw new RangeError('Krylov 차원은 연산자 차원 이하여야 합니다.');
  return structuredClone(values);
}
export function reproducibilityPlanarConfig(id: string, input: ResearchFields): PlanarConfig {
  const f = reproducibilityFocusFields(id, input),
    base = defaultPlanarConfig();
  return {
    ...base,
    parameters: { ...base.parameters, g: f.g! },
    initialState: [f.theta1!, f.theta2!, 0, 0],
    duration: f.duration!,
    step: f.step!,
    sampleEvery: 1,
    analyses: []
  };
}
export function reproducibilityHarmonicConfig(input: ResearchFields): NonlinearConfig {
  const f = reproducibilityFocusFields('8.9', input),
    base = nonlinearPresetConfig('system:duffing', 'harmonic');
  return {
    ...base,
    initialState: [f.theta1!, 0, 0],
    step: f.step!,
    duration: f.duration!,
    sampleEvery: 1,
    analyses: []
  };
}
export function reproducibilityFocusCanonical(id: string, input: ResearchFields): ExperimentStateV1 {
  const result =
    id === '8.9'
      ? toCanonicalNonlinear(reproducibilityHarmonicConfig(input))
      : toCanonicalPlanar(reproducibilityPlanarConfig(id, input));
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join(' '));
  return {
    ...result.value,
    provenance: {
      createdByVersion: 'product-focus-v3',
      source: { kind: 'derived', id: `learn:course-8:${id}:v1` },
      parentExperimentIds: []
    }
  };
}
