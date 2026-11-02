import { validateObservationArtifact } from '../../../observations/index';
import {
  INVERSE_VERSION,
  type InverseRequest,
  type InverseProgress,
  type InverseEvent,
  type InverseResult
} from './contracts';
import { inverseData, inverseHash, freezeInverseData } from './data';
import { validateInverseRequest } from './validation';
import { runEstimate } from './estimate';
import { runUq } from './uq';

export function inverseInputId(request: InverseRequest): string {
  return `inverse-input-${inverseHash({ experiment: request.experiment, settings: request.settings })}`;
}
export function inverseResultId(result: Omit<InverseResult, 'id'>): string {
  return `inverse-result-${inverseHash(result)}`;
}
/** The dedicated worker owns synchronous native fitting/stepping. Cancellation terminates that worker. */
export async function runInverse(
  input: InverseRequest,
  progress: InverseProgress = () => undefined
): Promise<InverseResult> {
  validateInverseRequest(input);
  let request = structuredClone(input);
  if (request.settings.kind === 'estimate')
    request = {
      ...request,
      settings: { ...request.settings, observation: await validateObservationArtifact(request.settings.observation) }
    };
  progress({ fraction: null, work: 0 });
  const result =
    request.settings.kind === 'estimate'
      ? runEstimate(request, request.settings, progress)
      : await runUq(request, request.settings, progress);
  const output: Omit<InverseResult, 'id'> = {
    schema: 'pendulum-inverse-result/v1',
    algorithmVersion: INVERSE_VERSION,
    inputId: inverseInputId(request),
    kind: request.settings.kind,
    request,
    ...(request.settings.kind === 'estimate' ? { observationId: request.settings.observation.id } : {}),
    ...result
  };
  inverseData(output);
  progress({ fraction: 1, work: result.evaluations });
  return freezeInverseData({ ...output, id: inverseResultId(output) });
}
export async function executeInverseJob(request: InverseRequest, emit: (event: InverseEvent) => void): Promise<void> {
  let id = 'invalid';
  try {
    inverseData(request);
    if (typeof request?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.id)) id = request.id;
    const result = await runInverse(request, (progress) => emit({ type: 'progress', id, ...progress }));
    emit({ type: 'result', id, result });
  } catch (cause) {
    emit({
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message.slice(0, 2000) : '관측·역문제·UQ 계산에 실패했습니다.'
    });
  }
}
