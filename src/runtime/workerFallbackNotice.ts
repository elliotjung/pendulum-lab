export const WORKER_FALLBACK_EVENT = 'pendulum-lab:worker-fallback';

export interface WorkerFallbackNoticeDetail {
  scope: string;
  reason: string;
  protocol: string;
  mainThread: true;
  guidance: string;
}

const notified = new Set<string>();

function currentProtocol(): string {
  if (typeof window === 'undefined' || typeof window.location?.protocol !== 'string') return 'unknown:';
  return window.location.protocol;
}

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  return 'worker unavailable';
}

export function workerFallbackGuidance(protocol = currentProtocol()): string {
  return protocol === 'file:'
    ? 'Open through the dev server for heavy worker jobs.'
    : 'Reduce the job size if the UI becomes sluggish.';
}

export function workerFallbackMessage(detail: WorkerFallbackNoticeDetail): string {
  const location = detail.protocol === 'file:' ? ' over file://' : '';
  return `Web Worker unavailable${location}; using main thread. ${detail.guidance}`;
}

export function notifyWorkerFallback(scope: string, reason: unknown = 'worker unavailable', options: { once?: boolean } = {}): WorkerFallbackNoticeDetail {
  const protocol = currentProtocol();
  const detail: WorkerFallbackNoticeDetail = {
    scope,
    reason: reasonText(reason),
    protocol,
    mainThread: true,
    guidance: workerFallbackGuidance(protocol)
  };
  const once = options.once ?? true;
  const key = `${scope}:${protocol}`;
  if (once && notified.has(key)) return detail;
  notified.add(key);

  if (typeof window !== 'undefined') {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent<WorkerFallbackNoticeDetail>(WORKER_FALLBACK_EVENT, { detail }));
    }
    if (typeof window.toast === 'function') window.toast(workerFallbackMessage(detail), 4200);
  }
  return detail;
}

export function resetWorkerFallbackNoticesForTests(): void {
  notified.clear();
}
