import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
export interface ResearchRequest {
  readonly id: string;
  readonly unitId: string;
  readonly fields: ResearchFields;
}
export type ResearchEvent =
  | { readonly type: 'progress'; readonly id: string; readonly fraction: number }
  | { readonly type: 'result'; readonly id: string; readonly result: ResearchFocusResult }
  | { readonly type: 'error'; readonly id: string; readonly message: string };
export interface ResearchWorker {
  onmessage: ((event: MessageEvent<ResearchEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ResearchRequest): void;
  terminate(): void;
}
export type ResearchExecutor = (
  request: ResearchRequest,
  onEvent: (event: ResearchEvent) => void
) => { dispose(): void };
