import { createDrivenWorkerSession, type DrivenWorkerRequest } from './driven-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createDrivenWorkerSession();
scope.onmessage = (event: MessageEvent<DrivenWorkerRequest>) => {
  scope.postMessage(session.handle(event.data));
};
