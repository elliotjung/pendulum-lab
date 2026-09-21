import { createConstraintWorkerSession, type ConstraintWorkerRequest } from './constraint-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createConstraintWorkerSession();
scope.onmessage = (event: MessageEvent<ConstraintWorkerRequest>) => {
  scope.postMessage(session.handle(event.data));
};
