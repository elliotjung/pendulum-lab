import { createFieldResonanceWorkerSession, type FieldResonanceRequest } from './field-resonance-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createFieldResonanceWorkerSession();
scope.onmessage = (event: MessageEvent<FieldResonanceRequest>) => {
  scope.postMessage(session.handle(event.data));
};
