import {
  ADVANCED_DIAGNOSTIC_LIMITS,
  ADVANCED_DIAGNOSTIC_VERSION,
  type AdvancedDiagnosticArtifact,
  type AdvancedDiagnosticRequest,
  type AdvancedDiagnosticResult
} from './contracts';
import { diagnosticJson } from '../core/result';
import {
  validateAdvancedDiagnosticArtifact,
  validateAdvancedDiagnosticResult,
  validateAdvancedRequestData,
  validateAdvancedSourceMetadata
} from './artifact-validation';
import { closedRecord, validateArtifactData } from '../core/artifact-validation';
import { validateAdvancedDiagnosticRequest } from './validation';
export { validateAdvancedDiagnosticArtifact } from './artifact-validation';

/** Snapshot inputs, outputs and lineage; caller mutation cannot alter a completed artifact. */
export function createAdvancedDiagnosticArtifact(
  request: AdvancedDiagnosticRequest,
  result: AdvancedDiagnosticResult,
  metadata: { artifactId: string; inputRunId: string; createdAt: string }
): AdvancedDiagnosticArtifact {
  validateArtifactData(metadata);
  closedRecord(metadata, ['artifactId', 'inputRunId', 'createdAt'], [], '고급 분석 계보');
  validateAdvancedRequestData(request);
  validateAdvancedDiagnosticRequest(request);
  validateAdvancedSourceMetadata(request);
  validateAdvancedDiagnosticResult(result, request);
  const artifact = diagnosticJson({
    schema: 'pendulum-advanced-diagnostic/v1',
    algorithmVersion: ADVANCED_DIAGNOSTIC_VERSION,
    ...metadata,
    request,
    result
  });
  validateAdvancedDiagnosticArtifact(artifact);
  return artifact;
}
export function exportAdvancedDiagnosticArtifact(artifact: AdvancedDiagnosticArtifact): string {
  validateAdvancedDiagnosticArtifact(artifact);
  const text = JSON.stringify(artifact, null, 2);
  if (new TextEncoder().encode(text).length > ADVANCED_DIAGNOSTIC_LIMITS.artifactBytes)
    throw new RangeError('고급 분석 artifact 파일 크기가 허용 범위를 넘었습니다. 표본·해상도를 줄이세요.');
  return text;
}
export function importAdvancedDiagnosticArtifact(text: string): AdvancedDiagnosticArtifact {
  if (
    typeof text !== 'string' ||
    text.length > ADVANCED_DIAGNOSTIC_LIMITS.artifactBytes ||
    new TextEncoder().encode(text).length > ADVANCED_DIAGNOSTIC_LIMITS.artifactBytes
  )
    throw new RangeError('고급 분석 artifact 파일 크기가 허용 범위를 넘었습니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RangeError('고급 분석 artifact JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  validateAdvancedDiagnosticArtifact(parsed);
  return parsed;
}
