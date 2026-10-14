import { createSpatialWorkerSession, type SpatialWorkerRequest } from './spatial-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createSpatialWorkerSession();
scope.onmessage = (event: MessageEvent<SpatialWorkerRequest>) => {
  scope.postMessage(session.handle(event.data));
};
