import { executeOgyRequest } from './ogy';
import type { OgyRequest, OgyWorkerMessage } from './contracts';

self.onmessage = (event: MessageEvent<OgyRequest>) => {
  const request = event.data;
  const send = (message: OgyWorkerMessage) => self.postMessage(message);
  try {
    const artifact = executeOgyRequest(request, (value, message) =>
      send({ id: request.id, type: 'progress', value, message })
    );
    send({ id: request.id, type: 'result', artifact });
  } catch (cause) {
    send({
      id: request?.id,
      type: 'error',
      message: cause instanceof Error ? cause.message : 'OGY 계산에 실패했습니다.'
    });
  }
};
