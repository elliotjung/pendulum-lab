import type { ChaosRequest, ChaosResponse } from '../workers/chaosProtocol';
import { notifyWorkerFallback } from './workerFallbackNotice';
import {
  JobEngine,
  JOB_PROTOCOL_V2,
  isJobInboundMessage,
  type JobCheckpointState,
  type JobEventMessage,
  type JobInboundMessage,
  type JobStatus,
  type PhaseRunner
} from '../workers/jobProtocol';

/**
 * Main-thread client for worker job protocol V2: a worker pool with priority
 * queueing, per-job cancel/pause/resume/status, progress and checkpoint
 * callbacks, deadline enforcement, retry, and resume-from-checkpoint. Without
 * Worker support it runs the identical JobEngine in-process, so every protocol
 * path is testable in Node.
 */

export class JobCancelledError extends Error {
  constructor(public readonly checkpoint: JobCheckpointState) {
    super('job cancelled');
    this.name = 'JobCancelledError';
  }
}

export class JobTimeoutError extends Error {
  constructor(
    public readonly checkpoint: JobCheckpointState,
    elapsedMs: number
  ) {
    super(`job timed out after ${Math.round(elapsedMs)}ms`);
    this.name = 'JobTimeoutError';
  }
}

export class JobFailedError extends Error {
  constructor(
    message: string,
    public readonly phase: string,
    public readonly checkpoint: JobCheckpointState
  ) {
    super(message);
    this.name = 'JobFailedError';
  }
}

/** Transport abstraction: a real Worker or an in-process engine. */
export interface JobTransport {
  send(message: JobInboundMessage): void;
  /** Hard stop (used when a sync phase wedges past its deadline). */
  terminate(): void;
  readonly usesWorker: boolean;
}

export type JobTransportFactory = (onEvent: (event: JobEventMessage) => void) => JobTransport;

export function inProcessTransportFactory(phaseRunner?: PhaseRunner): JobTransportFactory {
  return (onEvent) => {
    const engine = phaseRunner ? new JobEngine(onEvent, phaseRunner) : new JobEngine(onEvent);
    return {
      send: (message) => engine.handle(message),
      terminate: () => undefined,
      usesWorker: false
    };
  };
}

export function chaosWorkerTransportFactory(): JobTransportFactory {
  return (onEvent) => {
    if (typeof Worker === 'undefined') {
      notifyWorkerFallback('chaos-job-worker', 'worker unavailable');
      return inProcessTransportFactory()(onEvent);
    }
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/chaos.worker.ts', import.meta.url), {
        type: 'module',
        name: 'pendulum-chaos-job-worker'
      });
    } catch (error) {
      notifyWorkerFallback('chaos-job-worker', error);
      return inProcessTransportFactory()(onEvent);
    }
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data as JobEventMessage;
      if (typeof data === 'object' && data !== null && (data as { protocol?: unknown }).protocol === JOB_PROTOCOL_V2)
        onEvent(data);
    });
    return {
      send: (message) => worker.postMessage(message),
      terminate: () => worker.terminate(),
      usesWorker: true
    };
  };
}

export interface JobSubmitOptions {
  priority?: number;
  timeoutMs?: number;
  checkpointEvery?: number;
  checkpoint?: JobCheckpointState;
  onProgress?: (phase: string, completedPhases: number, totalPhases: number) => void;
  onCheckpoint?: (checkpoint: JobCheckpointState) => void;
}

export interface JobHandle {
  jobId: string;
  result: Promise<ChaosResponse>;
  cancel(): void;
  pause(): void;
  resume(): void;
  status(): JobStatus;
  /** Last checkpoint observed (for resume after cancel/timeout). */
  lastCheckpoint(): JobCheckpointState | null;
}

interface PendingJob {
  jobId: string;
  message: JobInboundMessage & { type: 'submit' };
  options: JobSubmitOptions;
  status: JobStatus;
  checkpoint: JobCheckpointState | null;
  resolve: (response: ChaosResponse) => void;
  reject: (error: Error) => void;
  workerIndex: number | null;
  clientTimer: ReturnType<typeof setTimeout> | null;
}

let jobCounter = 0;
function nextJobId(): string {
  jobCounter += 1;
  return `job-${jobCounter}-${Date.now().toString(36)}`;
}

export interface JobPoolOptions {
  poolSize?: number;
  /** Backpressure: submissions beyond this many in-flight jobs are rejected. Default 256. */
  maxQueued?: number;
}

export function defaultJobPoolSize(
  concurrency = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency
): number {
  if (!Number.isFinite(concurrency) || concurrency <= 2) return 1;
  return Math.min(4, Math.max(1, Math.floor(concurrency / 2)));
}

function estimateChaosWorkUnits(request: ChaosRequest): number | undefined {
  switch (request.kind) {
    case 'lyapunov':
      return request.settings?.steps ?? 20_000;
    case 'lyapunovSpectrum':
      return (request.settings?.steps ?? 20_000) * (request.count ?? request.state0.length);
    case 'bifurcation':
      return request.amplitudes.length * Math.max(1, Math.round(request.settings.maxTime / request.settings.dt));
    case 'zeroOne':
      return (
        (request.settings?.transientSteps ?? 2_000) +
        (request.settings?.samples ?? 3_000) * (request.settings?.sampleEvery ?? 30)
      );
    case 'clv':
      return (
        ((request.settings?.forwardTransient ?? 200) +
          (request.settings?.window ?? 400) +
          (request.settings?.backwardTransient ?? 200)) *
        (request.settings?.renormEvery ?? 10) *
        (request.count ?? request.state0.length)
      );
    case 'basin': {
      const n = request.settings?.n ?? 60;
      return n * n * Math.max(1, Math.round((request.settings?.maxTime ?? 20) / (request.settings?.dt ?? 0.01)));
    }
    case 'rqa': {
      const samples = request.settings?.samples ?? 360;
      return (
        (request.settings?.transientSteps ?? 2_000) +
        samples * (request.settings?.sampleEvery ?? 20) +
        samples * samples
      );
    }
    case 'ftle': {
      const n = request.settings?.n ?? 60;
      return n * n * Math.max(1, Math.round((request.settings?.totalTime ?? 3) / (request.settings?.dt ?? 0.01)));
    }
    case 'studyPoint':
      return (
        (request.settings?.lyapunov?.steps ?? 8_000) +
        (request.settings?.rqa?.samples ?? 360) ** 2 +
        Math.max(1, Math.round((request.settings?.ftleHorizon ?? 5) / (request.settings?.ftleDt ?? 0.01)))
      );
    case 'wadaConvergence':
      return (request.settings?.resolutions ?? [40, 60, 90]).reduce(
        (sum, n) =>
          sum + n * n * Math.max(1, Math.round((request.settings?.maxTime ?? 20) / (request.settings?.dt ?? 0.01))),
        0
      );
    case 'codim2': {
      const n = request.settings?.n ?? 12;
      return n * n * (request.settings?.steps ?? 4_000);
    }
    default:
      return undefined;
  }
}

export class JobClient {
  private workers: { transport: JobTransport; busyJobId: string | null }[] = [];
  private jobs = new Map<string, PendingJob>();
  private waiting: PendingJob[] = [];
  private readonly poolSize: number;
  private readonly maxQueued: number;

  constructor(
    private readonly factory: JobTransportFactory = chaosWorkerTransportFactory(),
    options: JobPoolOptions = {}
  ) {
    this.poolSize = Math.max(1, Math.min(8, options.poolSize ?? defaultJobPoolSize()));
    this.maxQueued = options.maxQueued ?? 256;
  }

  /** Number of jobs accepted but not yet settled. */
  inFlight(): number {
    return this.jobs.size;
  }

  usesWorkers(): boolean {
    this.ensurePool();
    return this.workers.some((entry) => entry.transport.usesWorker);
  }

  private ensurePool(): void {
    while (this.workers.length < this.poolSize) {
      const index = this.workers.length;
      const transport = this.factory((event) => this.onEvent(index, event));
      this.workers.push({ transport, busyJobId: null });
    }
  }

  submit(request: ChaosRequest, options: JobSubmitOptions = {}): JobHandle {
    this.ensurePool();
    if (!this.workers.some((entry) => entry.transport.usesWorker)) {
      const estimatedWorkUnits = estimateChaosWorkUnits(request);
      if (estimatedWorkUnits !== undefined && estimatedWorkUnits >= 100_000) {
        notifyWorkerFallback('chaos-job-worker', 'large job running on main thread', {
          once: false,
          estimatedWorkUnits,
          jobLabel: request.kind
        });
      }
    }
    if (this.jobs.size >= this.maxQueued) {
      const error = new Error(`job queue full (${this.maxQueued})`);
      return {
        jobId: 'rejected',
        result: Promise.reject(error),
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        status: () => 'failed',
        lastCheckpoint: () => null
      };
    }
    const jobId = nextJobId();
    const message: PendingJob['message'] = {
      protocol: JOB_PROTOCOL_V2,
      type: 'submit',
      jobId,
      priority: options.priority ?? 0,
      request,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.checkpointEvery === undefined ? {} : { checkpointEvery: options.checkpointEvery }),
      ...(options.checkpoint === undefined ? {} : { checkpoint: options.checkpoint })
    };
    let resolve!: (response: ChaosResponse) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<ChaosResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: PendingJob = {
      jobId,
      message,
      options,
      status: 'queued',
      checkpoint: options.checkpoint ?? null,
      resolve,
      reject,
      workerIndex: null,
      clientTimer: null
    };
    this.jobs.set(jobId, job);
    this.waiting.push(job);
    this.waiting.sort((a, b) => b.message.priority - a.message.priority);
    this.assignWork();
    return {
      jobId,
      result,
      cancel: () => this.control(jobId, 'cancel'),
      pause: () => this.control(jobId, 'pause'),
      resume: () => this.control(jobId, 'resume'),
      status: () => this.jobs.get(jobId)?.status ?? job.status,
      lastCheckpoint: () => this.jobs.get(jobId)?.checkpoint ?? job.checkpoint
    };
  }

  /** Submit with automatic retries on failure/timeout, resuming from the last checkpoint. */
  async submitWithRetry(
    request: ChaosRequest,
    options: JobSubmitOptions & { attempts?: number } = {}
  ): Promise<ChaosResponse> {
    const attempts = Math.max(1, options.attempts ?? 2);
    let lastError: Error = new Error('no attempts made');
    let checkpoint: JobCheckpointState | undefined = options.checkpoint;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const handle = this.submit(request, { ...options, ...(checkpoint === undefined ? {} : { checkpoint }) });
      try {
        return await handle.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError instanceof JobCancelledError) throw lastError;
        const observed = handle.lastCheckpoint();
        if (observed && observed.completedPhases.length > 0) checkpoint = observed;
      }
    }
    throw lastError;
  }

  private control(jobId: string, type: 'cancel' | 'pause' | 'resume'): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.workerIndex === null) {
      if (type === 'cancel') {
        // Cancel-before-start handled client-side for queued jobs.
        this.waiting = this.waiting.filter((waitingJob) => waitingJob !== job);
        this.settle(job, 'cancelled', new JobCancelledError(job.checkpoint ?? { completedPhases: [], partial: {} }));
      } else if (type === 'pause') {
        job.status = 'paused';
      } else if (type === 'resume' && job.status === 'paused') {
        job.status = 'queued';
        this.assignWork();
      }
      return;
    }
    this.workers[job.workerIndex]?.transport.send({ protocol: JOB_PROTOCOL_V2, type, jobId });
  }

  private assignWork(): void {
    for (const worker of this.workers) {
      if (worker.busyJobId !== null) continue;
      const nextIndex = this.waiting.findIndex((job) => job.status !== 'paused');
      if (nextIndex < 0) break;
      const job = this.waiting.splice(nextIndex, 1)[0]!;
      const workerIndex = this.workers.indexOf(worker);
      worker.busyJobId = job.jobId;
      job.workerIndex = workerIndex;
      job.status = 'running';
      if (job.message.timeoutMs !== undefined) {
        // Client-side deadline: a sync phase can wedge a worker past the
        // engine's phase-boundary checks; terminate-and-respawn only then.
        const grace = job.message.timeoutMs + 250;
        job.clientTimer = setTimeout(() => this.onClientTimeout(job), grace);
      }
      worker.transport.send(job.message);
    }
  }

  private onClientTimeout(job: PendingJob): void {
    if (!this.jobs.has(job.jobId)) return;
    const index = job.workerIndex;
    if (index !== null) {
      const worker = this.workers[index];
      worker?.transport.terminate();
      if (worker) {
        // Respawn the slot so the pool keeps its size.
        this.workers[index] = { transport: this.factory((event) => this.onEvent(index, event)), busyJobId: null };
      }
    }
    this.settle(
      job,
      'timed-out',
      new JobTimeoutError(job.checkpoint ?? { completedPhases: [], partial: {} }, job.message.timeoutMs ?? 0)
    );
    this.assignWork();
  }

  private onEvent(workerIndex: number, event: JobEventMessage): void {
    const job = this.jobs.get(event.jobId);
    if (!job) return;
    if (event.type === 'progress') {
      job.options.onProgress?.(event.phase, event.completedPhases, event.totalPhases);
      return;
    }
    if (event.type === 'checkpoint') {
      job.checkpoint = event.checkpoint;
      job.options.onCheckpoint?.(event.checkpoint);
      return;
    }
    if (event.type === 'paused') {
      job.status = 'paused';
      return;
    }
    if (event.type === 'resumed') {
      job.status = 'running';
      return;
    }
    if (event.type === 'accepted' || event.type === 'status') return;
    // Terminal events release the worker slot.
    if (event.type === 'result') {
      this.settle(job, 'completed', null, event.response);
    } else if (event.type === 'failed') {
      job.checkpoint = event.checkpoint;
      this.settle(job, 'failed', new JobFailedError(event.error, event.phase, event.checkpoint));
    } else if (event.type === 'cancelled') {
      job.checkpoint = event.checkpoint;
      this.settle(job, 'cancelled', new JobCancelledError(event.checkpoint));
    } else if (event.type === 'timed-out') {
      job.checkpoint = event.checkpoint;
      this.settle(job, 'timed-out', new JobTimeoutError(event.checkpoint, event.elapsedMs));
    }
    const worker = this.workers[workerIndex];
    if (worker && worker.busyJobId === event.jobId) worker.busyJobId = null;
    this.assignWork();
  }

  private settle(job: PendingJob, status: JobStatus, error: Error | null, response?: ChaosResponse): void {
    if (!this.jobs.has(job.jobId)) return;
    job.status = status;
    if (job.clientTimer !== null) clearTimeout(job.clientTimer);
    this.jobs.delete(job.jobId);
    if (job.workerIndex !== null) {
      const worker = this.workers[job.workerIndex];
      if (worker && worker.busyJobId === job.jobId) worker.busyJobId = null;
    }
    if (error) job.reject(error);
    else if (response) job.resolve(response);
  }

  terminate(): void {
    for (const worker of this.workers) worker.transport.terminate();
    this.workers = [];
    for (const job of [...this.jobs.values()]) {
      this.settle(job, 'cancelled', new JobCancelledError(job.checkpoint ?? { completedPhases: [], partial: {} }));
    }
    this.waiting = [];
  }
}

export { isJobInboundMessage };
