import type { ExtendedFields } from './extended-config';
import type { ExtendedResult } from './extended-results';
import type { BatchSnapshot } from '../lab/experiments/contracts';
export interface ExtendedRequest {
  readonly id: string;
  readonly unitId: string;
  readonly fields: ExtendedFields;
  readonly batch?: BatchSnapshot;
}
export type ExtendedEvent =
  | { type: 'progress'; id: string; fraction: number }
  | { type: 'result'; id: string; result: ExtendedResult }
  | { type: 'error'; id: string; message: string };
export interface ExtendedWorker {
  onmessage: ((event: MessageEvent<ExtendedEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ExtendedRequest): void;
  terminate(): void;
}
export type ExtendedExecutor = (
  request: ExtendedRequest,
  onEvent: (event: ExtendedEvent) => void
) => { dispose(): void };
