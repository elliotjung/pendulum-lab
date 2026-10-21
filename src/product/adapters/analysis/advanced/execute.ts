import type {
  AdvancedDiagnosticEvent,
  AdvancedDiagnosticProgress,
  AdvancedDiagnosticRequest,
  AdvancedDiagnosticResult
} from './contracts';
import { validateAdvancedDiagnosticRequest, SERIES_DIAGNOSTICS, GRID_DIAGNOSTICS } from './validation';
import { runAdvancedSeries } from './native-series';
import { runAdvancedFlow } from './native-flow';
import { runAdvancedGrid } from './native-grid';
import { runAdvancedMap } from './native-map';

/** Dedicated worker execution; native synchronous kernels are cancelled by terminating the worker. */
export function runAdvancedDiagnostic(
  request: AdvancedDiagnosticRequest,
  progress: (value: AdvancedDiagnosticProgress) => void = () => {}
): AdvancedDiagnosticResult {
  validateAdvancedDiagnosticRequest(request);
  progress({ fraction: null, work: 0, phase: 'calculating' });
  const result = SERIES_DIAGNOSTICS.includes(request.kind)
    ? runAdvancedSeries(request)
    : GRID_DIAGNOSTICS.includes(request.kind)
      ? runAdvancedGrid(request)
      : ['topological-entropy', 'transfer-operator'].includes(request.kind)
        ? runAdvancedMap(request)
        : runAdvancedFlow(request);
  progress({ fraction: 1, work: result.rows.length, phase: 'complete' });
  return result;
}
export function executeAdvancedDiagnosticJob(
  request: AdvancedDiagnosticRequest,
  emit: (event: AdvancedDiagnosticEvent) => void
): void {
  const id = typeof request?.id === 'string' ? request.id.slice(0, 128) : 'invalid';
  try {
    const result = runAdvancedDiagnostic(request, (event) => emit({ type: 'progress', id, ...event }));
    emit({ type: 'result', id, result });
  } catch (cause) {
    emit({
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message.slice(0, 2000) : '고급 분석을 완료하지 못했습니다.'
    });
  }
}
