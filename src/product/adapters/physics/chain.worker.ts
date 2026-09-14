import { createChainWorkerSession, type ChainWorkerRequest } from './chain-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createChainWorkerSession();
scope.onmessage = (event: MessageEvent<ChainWorkerRequest>) => {
  scope.postMessage(session.handle(event.data));
};
