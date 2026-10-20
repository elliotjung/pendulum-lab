import { createDiscreteWorkerSession, type DiscreteWorkerRequest } from './discrete-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = createDiscreteWorkerSession();
scope.onmessage = (event: MessageEvent<DiscreteWorkerRequest>) => scope.postMessage(session.handle(event.data));
