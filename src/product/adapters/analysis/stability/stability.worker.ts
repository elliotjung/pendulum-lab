import { executeStabilityJob } from './execute';
import type { StabilityRequest } from './contracts';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<StabilityRequest>) =>
  executeStabilityJob(event.data, (value) => scope.postMessage(value));
