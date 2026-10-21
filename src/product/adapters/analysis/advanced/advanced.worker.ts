import { executeAdvancedDiagnosticJob } from './execute';
import type { AdvancedDiagnosticRequest } from './contracts';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<AdvancedDiagnosticRequest>) =>
  executeAdvancedDiagnosticJob(event.data, (value) => scope.postMessage(value));
