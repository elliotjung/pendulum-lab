import {
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_VERSION,
  type CoreDiagnosticArtifact,
  type CoreDiagnosticRequest,
  type CoreDiagnosticResult
} from './contracts';
import { diagnosticJson } from './result';
import { validateCoreDiagnosticArtifact } from './artifact-validation';
export { validateCoreDiagnosticArtifact } from './artifact-validation';

export function createCoreDiagnosticArtifact(
  request: CoreDiagnosticRequest,
  result: CoreDiagnosticResult,
  metadata: { artifactId: string; inputRunId: string; createdAt: string }
): CoreDiagnosticArtifact {
  const artifact = diagnosticJson({
    schema: 'pendulum-core-diagnostic/v1',
    algorithmVersion: CORE_DIAGNOSTIC_VERSION,
    ...metadata,
    request,
    result
  });
  validateCoreDiagnosticArtifact(artifact);
  return artifact;
}
export function exportCoreDiagnosticArtifact(artifact: CoreDiagnosticArtifact): string {
  validateCoreDiagnosticArtifact(artifact);
  const text = JSON.stringify(artifact, null, 2);
  if (new TextEncoder().encode(text).length > CORE_DIAGNOSTIC_LIMITS.artifactBytes)
    throw new RangeError('내보낼 분석 artifact 파일 크기가 허용 범위를 넘었습니다. 관측 수를 줄이세요.');
  return text;
}
export function importCoreDiagnosticArtifact(text: string): CoreDiagnosticArtifact {
  if (
    typeof text !== 'string' ||
    text.length > CORE_DIAGNOSTIC_LIMITS.artifactBytes ||
    new TextEncoder().encode(text).length > CORE_DIAGNOSTIC_LIMITS.artifactBytes
  )
    throw new RangeError('분석 artifact 파일 크기가 허용 범위를 넘었습니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RangeError('분석 artifact JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  validateCoreDiagnosticArtifact(parsed);
  return parsed;
}
