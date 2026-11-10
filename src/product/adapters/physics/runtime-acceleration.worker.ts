import { handleRuntimeAcceleration } from './runtime-acceleration-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let started = false;
scope.onmessage = async (event: MessageEvent<unknown>) => {
  if (started) return;
  started = true;
  scope.postMessage(await handleRuntimeAcceleration(event.data));
};
