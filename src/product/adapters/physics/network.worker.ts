import {
  createNetworkBasinWorkerSession,
  createNetworkWorkerSession,
  type NetworkBasinWorkerRequest,
  type NetworkWorkerRequest
} from './network-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const simulation = createNetworkWorkerSession(),
  basin = createNetworkBasinWorkerSession();
let basinMode: boolean | undefined;
scope.onmessage = (event: MessageEvent<NetworkWorkerRequest | NetworkBasinWorkerRequest>) => {
  if (basinMode === undefined) basinMode = event.data?.type === 'initialize-basin';
  scope.postMessage(
    basinMode
      ? basin.handle(event.data as NetworkBasinWorkerRequest)
      : simulation.handle(event.data as NetworkWorkerRequest)
  );
};
