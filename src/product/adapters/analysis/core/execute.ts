import type {
  CoreDiagnosticEvent,
  CoreDiagnosticProgress,
  CoreDiagnosticRequest,
  CoreDiagnosticResult
} from './contracts';
import { runFlowDiagnostic } from './flow';
import { runSignalDiagnostic } from './signal';
import { FLOW_DIAGNOSTICS, validateCoreDiagnosticRequest } from './validation';

/** Dedicated worker entry. Synchronous native estimators are interrupted by terminating their worker. */
export function runCoreDiagnostic(
  request: CoreDiagnosticRequest,
  progress: (value: CoreDiagnosticProgress) => void = () => {}
): CoreDiagnosticResult {
  validateCoreDiagnosticRequest(request);
  progress({ fraction: null, work: 0, phase: 'calculating' });
  if (FLOW_DIAGNOSTICS.includes(request.kind)) return runFlowDiagnostic(request, progress);
  const result = runSignalDiagnostic(request);
  progress({ fraction: 1, work: request.series.times.length, phase: 'complete' });
  return result;
}
export function executeCoreDiagnosticJob(
  request: CoreDiagnosticRequest,
  emit: (event: CoreDiagnosticEvent) => void
): void {
  const id = typeof request?.id === 'string' ? request.id.slice(0, 128) : 'invalid';
  try {
    const result = runCoreDiagnostic(request, (event) => emit({ type: 'progress', id, ...event }));
    emit({ type: 'result', id, result });
  } catch (cause) {
    emit({
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message.slice(0, 2000) : '핵심 진단을 완료하지 못했습니다.'
    });
  }
}
