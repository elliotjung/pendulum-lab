import { executeDataDrivenJob } from './execute';
import type { DataDrivenRequest } from './contracts';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DataDrivenRequest>) => void) | null;
  postMessage(value: unknown): void;
};
scope.onmessage = (event) => {
  void executeDataDrivenJob(event.data, (value) => scope.postMessage(value));
};
