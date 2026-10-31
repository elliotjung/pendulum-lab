import { closedRecord, validateArtifactData } from '../core/artifact-validation';
import { diagnosticJson } from '../core/result';
import {
  STABILITY_LIMITS,
  STABILITY_VERSION,
  type StabilityArtifact,
  type StabilityRequest,
  type StabilityResult
} from './contracts';
import {
  validateStabilityArtifact,
  validateStabilityRequestData,
  validateStabilityResult
} from './artifact-validation';
export { validateStabilityArtifact } from './artifact-validation';

export function createStabilityArtifact(
  request: StabilityRequest,
  result: StabilityResult,
  metadata: { artifactId: string; inputRunId: string; createdAt: string }
): StabilityArtifact {
  validateArtifactData(metadata);
  closedRecord(metadata, ['artifactId', 'inputRunId', 'createdAt'], [], '안정성 계보');
  validateStabilityRequestData(request);
  validateStabilityResult(result, request);
  const artifact = diagnosticJson({
    schema: 'pendulum-stability-workflow/v1',
    algorithmVersion: STABILITY_VERSION,
    ...metadata,
    request,
    result
  });
  validateStabilityArtifact(artifact);
  return artifact;
}
export function exportStabilityArtifact(artifact: StabilityArtifact): string {
  validateStabilityArtifact(artifact);
  const text = JSON.stringify(artifact, null, 2);
  if (new TextEncoder().encode(text).length > STABILITY_LIMITS.artifactBytes)
    throw new RangeError('안정성 artifact는 8 MiB 이하여야 합니다.');
  return text;
}
export function importStabilityArtifact(text: string): StabilityArtifact {
  if (
    typeof text !== 'string' ||
    text.length > STABILITY_LIMITS.artifactBytes ||
    new TextEncoder().encode(text).length > STABILITY_LIMITS.artifactBytes
  )
    throw new RangeError('안정성 artifact는 8 MiB 이하여야 합니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RangeError('안정성 artifact JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  validateStabilityArtifact(parsed);
  return parsed;
}
