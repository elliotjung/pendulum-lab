import { executeInverseJob } from './execute';
import type { InverseRequest, InverseEvent } from './contracts';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<InverseRequest>) => void) | null;
  postMessage(event: InverseEvent): void;
};
scope.onmessage = (event) => {
  void executeInverseJob(event.data, (value) => scope.postMessage(value));
};
