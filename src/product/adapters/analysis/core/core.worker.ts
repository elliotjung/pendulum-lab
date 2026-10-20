import { executeCoreDiagnosticJob } from './execute';
import type { CoreDiagnosticRequest } from './contracts';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<CoreDiagnosticRequest>) =>
  executeCoreDiagnosticJob(event.data, (value) => scope.postMessage(value));
