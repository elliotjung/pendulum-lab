export const WORKER_FALLBACK_EVENT = 'pendulum-lab:worker-fallback';

export interface WorkerFallbackNoticeDetail {
  scope: string;
  reason: string;
  protocol: string;
  mainThread: true;
  guidance: string;
  jobSizeWarning?: string;
  estimatedWorkUnits?: number;
  jobLabel?: string;
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
    ? 'Open through the dev server for heavy worker jobs; large main-thread jobs can freeze the UI.'
    : 'Reduce the job size if the UI becomes sluggish; large main-thread jobs should run through a Worker.';
}

export function workerFallbackMessage(detail: WorkerFallbackNoticeDetail): string {
  const location = detail.protocol === 'file:' ? ' over file://' : '';
  const size = detail.jobSizeWarning ? ` ${detail.jobSizeWarning}` : '';
  return `Web Worker unavailable${location}; using main thread. ${detail.guidance}${size}`;
}

function jobSizeWarning(estimatedWorkUnits?: number, jobLabel?: string): string | undefined {
  if (estimatedWorkUnits === undefined) return undefined;
  const label = jobLabel ? `${jobLabel} job` : 'job';
  if (estimatedWorkUnits >= 1_000_000) return `Large ${label} (${estimatedWorkUnits.toLocaleString()} work units) may block rendering; reduce resolution/horizon or use the dev server.`;
  if (estimatedWorkUnits >= 100_000) return `${label} is running on the main thread (${estimatedWorkUnits.toLocaleString()} work units); expect visible UI stalls on slower devices.`;
  return undefined;
}

export function notifyWorkerFallback(
  scope: string,
  reason: unknown = 'worker unavailable',
  options: { once?: boolean; estimatedWorkUnits?: number; jobLabel?: string } = {}
): WorkerFallbackNoticeDetail {
  const protocol = currentProtocol();
  const warning = jobSizeWarning(options.estimatedWorkUnits, options.jobLabel);
  const detail: WorkerFallbackNoticeDetail = {
    scope,
    reason: reasonText(reason),
    protocol,
    mainThread: true,
    guidance: workerFallbackGuidance(protocol),
    ...(warning ? { jobSizeWarning: warning } : {}),
    ...(options.estimatedWorkUnits === undefined ? {} : { estimatedWorkUnits: options.estimatedWorkUnits }),
    ...(options.jobLabel === undefined ? {} : { jobLabel: options.jobLabel })
  };
  const once = options.once ?? true;
  const key = `${scope}:${protocol}`;
  if (once && notified.has(key)) return detail;
  notified.add(key);

  if (typeof window !== 'undefined') {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent<WorkerFallbackNoticeDetail>(WORKER_FALLBACK_EVENT, { detail }));
    }
    const message = workerFallbackMessage(detail);
    if (typeof window.toast === 'function') window.toast(message, 4200);
    else {
      const box = document.getElementById('toast');
      if (box) {
        box.textContent = message;
        box.classList.add('show');
        window.setTimeout(() => box.classList.remove('show'), 4200);
      }
    }
  }
  return detail;
}

export function resetWorkerFallbackNoticesForTests(): void {
  notified.clear();
}
