import { handleStructureDiagnostic } from './structure-diagnostics-worker-protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<unknown>) => scope.postMessage(handleStructureDiagnostic(event.data));
