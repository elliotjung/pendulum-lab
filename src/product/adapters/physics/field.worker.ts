import { createFieldWorkerSession, type FieldWorkerRequest } from './field-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createFieldWorkerSession();
scope.onmessage = (event: MessageEvent<FieldWorkerRequest>) => scope.postMessage(session.handle(event.data));
