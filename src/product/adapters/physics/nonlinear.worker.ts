import { createNonlinearWorkerSession, type NonlinearWorkerRequest } from './nonlinear-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createNonlinearWorkerSession();
scope.onmessage = (event: MessageEvent<NonlinearWorkerRequest>) => {
  scope.postMessage(session.handle(event.data));
};
