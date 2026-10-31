import type { StabilityEvent, StabilityProgress, StabilityRequest, StabilityResult } from './contracts';
import { validateStabilityRequest } from './validation';
import { runCurrentStability } from './native-current';
import { runBenchmarkStability } from './native-benchmarks';
import { StabilityWork } from './source';
import { validateArtifactData } from '../core/artifact-validation';
export { stabilityResultSignature } from './result';

/** The dedicated worker owns synchronous kernels; cancellation terminates that worker. */
export function runStability(
  request: StabilityRequest,
  progress: (value: StabilityProgress) => void = () => {}
): StabilityResult {
  validateStabilityRequest(request);
  progress({ fraction: null, work: 0, phase: 'calculating' });
  const work = new StabilityWork(progress);
  const result =
    request.settings.source === 'current-driven' || request.settings.source === 'linear-oscillator'
      ? runCurrentStability(request, work)
      : runBenchmarkStability(request, work);
  progress({ fraction: 1, work: work.value, phase: 'complete' });
  return result;
}
export function executeStabilityJob(request: StabilityRequest, emit: (event: StabilityEvent) => void): void {
  // Request is validated before property reads; unsafe getter inputs never execute.
  let id = 'invalid';
  try {
    validateArtifactData(request);
    if (typeof request?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.id)) id = request.id;
    validateStabilityRequest(request);
    const result = runStability(request, (event) => emit({ type: 'progress', id, ...event }));
    emit({ type: 'result', id, result });
  } catch (cause) {
    emit({
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message.slice(0, 2000) : '안정성 계산을 완료하지 못했습니다.'
    });
  }
}
