import type { ChaosRequest, ChaosResponse } from '../workers/chaosProtocol';
import {
  JOB_PROTOCOL_V2,
  isJobEventMessage,
  isJobInboundMessage,
  type JobCheckpointState,
  type JobEventMessage,
  type JobInboundMessage,
  type JobStatus,
  validateChaosJobRequest,
  validateJobCheckpoint,
  validateJobInboundMessage
} from '../workers/jobProtocol';
import {
  chaosWorkerTransportFactory,
  JobCancelledError,
  JobFailedError,
  JobTimeoutError,
  type JobTransport,
  type JobTransportFactory
} from './JobClientTransport';
import { notifyWorkerFallback } from './workerFallbackNotice';

export {
  chaosWorkerTransportFactory,
  inProcessTransportFactory,
  JobCancelledError,
  JobFailedError,
  JobTimeoutError,
  type JobTransport,
  type JobTransportFactory
} from './JobClientTransport';

/**
 * Main-thread client for worker job protocol V2: a worker pool with priority
 * queueing, per-job cancel/pause/resume/status, progress and checkpoint
 * callbacks, deadline enforcement, retry, and resume-from-checkpoint. Without
 * Worker support it runs the identical JobEngine in-process, so every protocol
 * path is testable in Node.
 */

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
  workUnits: number;
  options: JobSubmitOptions;
  status: JobStatus;
  checkpoint: JobCheckpointState | null;
  resolve: (response: ChaosResponse) => void;
  reject: (error: Error) => void;
  workerIndex: number | null;
  workerGeneration: number | null;
  clientTimer: ReturnType<typeof setTimeout> | null;
}

interface WorkerEntry {
  transport: JobTransport;
  busyJobId: string | null;
  generation: number;
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

const MAX_JOB_POOL_SIZE = 8;
const MAX_QUEUED_JOBS = 10_000;
const MAX_RETRY_ATTEMPTS = 10;
const MAX_IN_PROCESS_WORK_UNITS = 100_000;

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a safe integer in [${minimum}, ${maximum}]`);
  }
  return value;
}

function errorFrom(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(typeof value === 'string' && value.length > 0 ? value : fallback);
}

function copyCheckpoint(checkpoint: JobCheckpointState): JobCheckpointState {
  return { completedPhases: [...checkpoint.completedPhases], partial: { ...checkpoint.partial } };
}

function rejectedHandle(error: Error): JobHandle {
  const result = Promise.reject<ChaosResponse>(error);
  // Mark the internally-created rejection handled while preserving the same
  // rejected promise for callers that await it later.
  void result.catch(() => undefined);
  return {
    jobId: 'rejected',
    result,
    cancel: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    status: () => 'failed',
    lastCheckpoint: () => null
  };
}

export function defaultJobPoolSize(
  concurrency = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency
): number {
  if (!Number.isFinite(concurrency) || concurrency <= 2) return 1;
  return Math.min(4, Math.max(1, Math.floor(concurrency / 2)));
}

export class JobClient {
  private workers: WorkerEntry[] = [];
  private workerGenerations: number[] = [];
  private jobs = new Map<string, PendingJob>();
  private waiting: PendingJob[] = [];
  private readonly poolSize: number;
  private readonly maxQueued: number;
  private assigning = false;
  private terminating = false;

  constructor(
    private readonly factory: JobTransportFactory = chaosWorkerTransportFactory(),
    options: JobPoolOptions = {}
  ) {
    this.poolSize = boundedInteger(options.poolSize ?? defaultJobPoolSize(), 'poolSize', 1, MAX_JOB_POOL_SIZE);
    this.maxQueued = boundedInteger(options.maxQueued ?? 256, 'maxQueued', 1, MAX_QUEUED_JOBS);
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
      this.workers.push(this.createWorker(index));
    }
  }

  private createWorker(index: number): WorkerEntry {
    const generation = (this.workerGenerations[index] ?? 0) + 1;
    this.workerGenerations[index] = generation;
    try {
      const transport = this.factory(
        (event) => this.onEvent(index, generation, event),
        (error) => this.onTransportFatal(index, generation, error)
      );
      if (
        transport === null ||
        typeof transport !== 'object' ||
        typeof transport.send !== 'function' ||
        typeof transport.terminate !== 'function' ||
        typeof transport.usesWorker !== 'boolean'
      ) {
        throw new TypeError('job transport factory returned an invalid transport');
      }
      return { transport, busyJobId: null, generation };
    } catch (error) {
      const failure = errorFrom(error, 'job transport factory failed');
      return {
        generation,
        busyJobId: null,
        transport: {
          usesWorker: false,
          send: () => {
            throw failure;
          },
          terminate: () => undefined
        }
      };
    }
  }

  submit(request: ChaosRequest, options: JobSubmitOptions = {}): JobHandle {
    const jobId = nextJobId();
    let message: PendingJob['message'];
    let workUnits: number;
    try {
      const requestSnapshot = structuredClone(request);
      const checkpointSnapshot = options.checkpoint === undefined ? undefined : structuredClone(options.checkpoint);
      message = {
        protocol: JOB_PROTOCOL_V2,
        type: 'submit',
        jobId,
        priority: options.priority ?? 0,
        request: requestSnapshot,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.checkpointEvery === undefined ? {} : { checkpointEvery: options.checkpointEvery }),
        ...(checkpointSnapshot === undefined ? {} : { checkpoint: checkpointSnapshot })
      };
      workUnits = validateChaosJobRequest(requestSnapshot);
      validateJobInboundMessage(message);
    } catch (error) {
      return rejectedHandle(errorFrom(error, 'invalid chaos job request'));
    }
    this.ensurePool();
    if (!this.workers.some((entry) => entry.transport.usesWorker) && workUnits >= MAX_IN_PROCESS_WORK_UNITS) {
      notifyWorkerFallback('chaos-job-worker', 'large job rejected without a worker', {
        once: false,
        estimatedWorkUnits: workUnits,
        jobLabel: request.kind
      });
      return rejectedHandle(
        new RangeError(
          `job requires ${workUnits} work units; without Worker support the safe limit is ${MAX_IN_PROCESS_WORK_UNITS - 1}`
        )
      );
    }
    if (this.jobs.size >= this.maxQueued) return rejectedHandle(new Error(`job queue full (${this.maxQueued})`));
    let resolve!: (response: ChaosResponse) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<ChaosResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: PendingJob = {
      jobId,
      message,
      workUnits,
      options,
      status: 'queued',
      checkpoint: message.checkpoint ? copyCheckpoint(message.checkpoint) : null,
      resolve,
      reject,
      workerIndex: null,
      workerGeneration: null,
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
      lastCheckpoint: () => {
        const checkpoint = this.jobs.get(jobId)?.checkpoint ?? job.checkpoint;
        return checkpoint ? copyCheckpoint(checkpoint) : null;
      }
    };
  }

  /** Submit with automatic retries on failure/timeout, resuming from the last checkpoint. */
  async submitWithRetry(
    request: ChaosRequest,
    options: JobSubmitOptions & { attempts?: number } = {}
  ): Promise<ChaosResponse> {
    const attempts = boundedInteger(options.attempts ?? 2, 'attempts', 1, MAX_RETRY_ATTEMPTS);
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
    const worker = this.workers[job.workerIndex];
    if (!worker || worker.generation !== job.workerGeneration || worker.busyJobId !== jobId) {
      this.settle(
        job,
        'failed',
        new JobFailedError(
          'job transport ownership was lost',
          'transport',
          job.checkpoint ?? { completedPhases: [], partial: {} }
        )
      );
      this.assignWork();
      return;
    }
    try {
      worker.transport.send({ protocol: JOB_PROTOCOL_V2, type, jobId });
    } catch (error) {
      this.failWorker(job.workerIndex, worker.generation, errorFrom(error, 'job control message failed'));
    }
  }

  private assignWork(): void {
    if (this.assigning || this.terminating) return;
    this.assigning = true;
    try {
      for (;;) {
        let assigned = false;
        for (let workerIndex = 0; workerIndex < this.workers.length; workerIndex += 1) {
          const worker = this.workers[workerIndex];
          if (!worker || worker.busyJobId !== null) continue;
          const nextIndex = this.waiting.findIndex(
            (job) =>
              job.status !== 'paused' && (worker.transport.usesWorker || job.workUnits < MAX_IN_PROCESS_WORK_UNITS)
          );
          if (nextIndex < 0) continue;
          const job = this.waiting.splice(nextIndex, 1)[0]!;
          const generation = worker.generation;
          worker.busyJobId = job.jobId;
          job.workerIndex = workerIndex;
          job.workerGeneration = generation;
          job.status = 'running';
          if (job.message.timeoutMs !== undefined) {
            // Client-side deadline: a sync phase can wedge a worker past the
            // engine's phase-boundary checks; terminate-and-respawn only then.
            const grace = job.message.timeoutMs + 250;
            job.clientTimer = setTimeout(() => this.onClientTimeout(job, workerIndex, generation), grace);
          }
          try {
            worker.transport.send(job.message);
          } catch (error) {
            this.failWorker(workerIndex, generation, errorFrom(error, 'job submission failed'), false);
          }
          assigned = true;
        }
        if (!assigned) break;
      }
    } finally {
      this.assigning = false;
    }
  }

  private onClientTimeout(job: PendingJob, workerIndex: number, generation: number): void {
    if (!this.jobs.has(job.jobId)) return;
    const worker = this.workers[workerIndex];
    if (
      !worker ||
      worker.generation !== generation ||
      job.workerIndex !== workerIndex ||
      job.workerGeneration !== generation ||
      worker.busyJobId !== job.jobId
    ) {
      return;
    }
    this.safeTerminate(worker.transport);
    this.workers[workerIndex] = this.createWorker(workerIndex);
    this.settle(
      job,
      'timed-out',
      new JobTimeoutError(job.checkpoint ?? { completedPhases: [], partial: {} }, job.message.timeoutMs ?? 0)
    );
    this.rejectUnserviceableJobs();
    this.assignWork();
  }

  private onEvent(workerIndex: number, generation: number, event: JobEventMessage): void {
    const worker = this.workers[workerIndex];
    if (!worker || worker.generation !== generation || this.terminating) return;
    if (!isJobEventMessage(event)) {
      this.failWorker(workerIndex, generation, new Error('job transport emitted an invalid event'));
      return;
    }
    const job = this.jobs.get(event.jobId);
    if (
      !job ||
      job.workerIndex !== workerIndex ||
      job.workerGeneration !== generation ||
      worker.busyJobId !== event.jobId
    ) {
      // A valid event from the wrong slot/job is ignored. It cannot settle or
      // mutate another transport's pending promise.
      return;
    }
    const phases = job.message.request.kind === 'studyPoint' ? ['lyapunov', 'rqa', 'ftle'] : ['compute'];
    if (event.type === 'progress') {
      if (!phases.includes(event.phase) || event.totalPhases !== phases.length) {
        this.failWorker(workerIndex, generation, new Error('job progress event does not match its request'));
        return;
      }
      this.runCallback(() => job.options.onProgress?.(event.phase, event.completedPhases, event.totalPhases));
      return;
    }
    if (event.type === 'checkpoint') {
      let checkpoint: JobCheckpointState;
      try {
        checkpoint = validateJobCheckpoint(event.checkpoint, job.message.request);
      } catch (error) {
        this.failWorker(workerIndex, generation, errorFrom(error, 'invalid checkpoint event'));
        return;
      }
      if (!this.isCheckpointAdvance(job.checkpoint, checkpoint)) {
        this.failWorker(workerIndex, generation, new Error('job checkpoint regressed or changed completed results'));
        return;
      }
      job.checkpoint = copyCheckpoint(checkpoint);
      this.runCallback(() => job.options.onCheckpoint?.(copyCheckpoint(checkpoint)));
      return;
    }
    if (event.type === 'paused') {
      if (!phases.includes(event.atPhase)) {
        this.failWorker(workerIndex, generation, new Error('job pause event contains an invalid phase'));
        return;
      }
      job.status = 'paused';
      return;
    }
    if (event.type === 'resumed') {
      job.status = 'running';
      return;
    }
    if (event.type === 'accepted') return;
    if (event.type === 'status') {
      if (event.status !== 'queued' && event.status !== 'running' && event.status !== 'paused') {
        this.failWorker(workerIndex, generation, new Error('pending job received a terminal status without a result'));
        return;
      }
      job.status = event.status;
      return;
    }
    // Terminal events release the worker slot.
    if (event.type === 'result') {
      if (
        event.response.ok !== true ||
        event.response.id !== job.message.request.id ||
        event.response.kind !== job.message.request.kind
      ) {
        this.failWorker(workerIndex, generation, new Error('job result does not belong to its request'));
        return;
      }
      this.settle(job, 'completed', null, event.response);
    } else if (event.type === 'failed') {
      if (event.phase !== 'protocol' && !phases.includes(event.phase)) {
        this.failWorker(workerIndex, generation, new Error('job failure event contains an invalid phase'));
        return;
      }
      const checkpoint = this.checkedCheckpoint(event.checkpoint, job, workerIndex, generation);
      if (!checkpoint) return;
      job.checkpoint = checkpoint;
      this.settle(job, 'failed', new JobFailedError(event.error, event.phase, checkpoint));
    } else if (event.type === 'cancelled') {
      if (event.atPhase !== 'queued' && !phases.includes(event.atPhase)) {
        this.failWorker(workerIndex, generation, new Error('job cancellation event contains an invalid phase'));
        return;
      }
      const checkpoint = this.checkedCheckpoint(event.checkpoint, job, workerIndex, generation);
      if (!checkpoint) return;
      job.checkpoint = checkpoint;
      this.settle(job, 'cancelled', new JobCancelledError(checkpoint));
    } else if (event.type === 'timed-out') {
      const checkpoint = this.checkedCheckpoint(event.checkpoint, job, workerIndex, generation);
      if (!checkpoint) return;
      job.checkpoint = checkpoint;
      this.settle(job, 'timed-out', new JobTimeoutError(checkpoint, event.elapsedMs));
    }
    this.assignWork();
  }

  private checkedCheckpoint(
    value: JobCheckpointState,
    job: PendingJob,
    workerIndex: number,
    generation: number
  ): JobCheckpointState | null {
    try {
      const checkpoint = validateJobCheckpoint(value, job.message.request);
      if (!this.isCheckpointAdvance(job.checkpoint, checkpoint)) {
        throw new RangeError('job terminal checkpoint regressed or changed completed results');
      }
      return copyCheckpoint(checkpoint);
    } catch (error) {
      this.failWorker(workerIndex, generation, errorFrom(error, 'invalid terminal checkpoint'));
      return null;
    }
  }

  private isCheckpointAdvance(previous: JobCheckpointState | null, next: JobCheckpointState): boolean {
    if (!previous) return true;
    if (next.completedPhases.length < previous.completedPhases.length) return false;
    for (let index = 0; index < previous.completedPhases.length; index += 1) {
      if (next.completedPhases[index] !== previous.completedPhases[index]) return false;
    }
    for (const [key, value] of Object.entries(previous.partial)) {
      if (!Object.is(next.partial[key], value)) return false;
    }
    return true;
  }

  private runCallback(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      try {
        console.error('Pendulum job callback failed', error);
      } catch {
        // Diagnostics are best-effort; hostile console shims cannot affect the job.
      }
    }
  }

  private onTransportFatal(workerIndex: number, generation: number, error: Error): void {
    if (this.terminating) return;
    this.failWorker(workerIndex, generation, errorFrom(error, 'job transport failed'));
  }

  private failWorker(workerIndex: number, generation: number, error: Error, schedule = true): void {
    const worker = this.workers[workerIndex];
    if (!worker || worker.generation !== generation) return;
    const busyJobId = worker.busyJobId;
    this.safeTerminate(worker.transport);
    this.workers[workerIndex] = this.createWorker(workerIndex);
    if (busyJobId !== null) {
      const job = this.jobs.get(busyJobId);
      if (job && job.workerIndex === workerIndex && job.workerGeneration === generation) {
        const checkpoint = job.checkpoint ?? { completedPhases: [], partial: {} };
        this.settle(job, 'failed', new JobFailedError(error.message, 'transport', checkpoint));
      }
    }
    this.rejectUnserviceableJobs();
    if (schedule) this.assignWork();
  }

  private rejectUnserviceableJobs(): void {
    if (this.workers.some((entry) => entry.transport.usesWorker)) return;
    const unserviceable = this.waiting.filter((job) => job.workUnits >= MAX_IN_PROCESS_WORK_UNITS);
    for (const job of unserviceable) {
      this.settle(
        job,
        'failed',
        new JobFailedError(
          'large job cannot run safely because no worker transport is available',
          'transport',
          job.checkpoint ?? { completedPhases: [], partial: {} }
        )
      );
    }
  }

  private safeTerminate(transport: JobTransport): void {
    try {
      transport.terminate();
    } catch {
      // A broken transport must not prevent promise cleanup or pool recovery.
    }
  }

  private settle(job: PendingJob, status: JobStatus, error: Error | null, response?: ChaosResponse): void {
    if (!this.jobs.has(job.jobId)) return;
    job.status = status;
    if (job.clientTimer !== null) clearTimeout(job.clientTimer);
    job.clientTimer = null;
    this.jobs.delete(job.jobId);
    this.waiting = this.waiting.filter((waitingJob) => waitingJob !== job);
    if (job.workerIndex !== null && job.workerGeneration !== null) {
      const worker = this.workers[job.workerIndex];
      if (worker && worker.generation === job.workerGeneration && worker.busyJobId === job.jobId) {
        worker.busyJobId = null;
      }
    }
    if (error) job.reject(error);
    else if (response) job.resolve(response);
    else
      job.reject(
        new JobFailedError(
          'job settled without a response',
          'protocol',
          job.checkpoint ?? { completedPhases: [], partial: {} }
        )
      );
  }

  terminate(): void {
    if (this.terminating) return;
    this.terminating = true;
    try {
      const activeJobs = [...this.jobs.values()];
      const workers = [...this.workers];
      this.waiting = [];
      this.workers = [];
      for (const worker of workers) this.safeTerminate(worker.transport);
      for (const job of activeJobs) {
        this.settle(job, 'cancelled', new JobCancelledError(job.checkpoint ?? { completedPhases: [], partial: {} }));
      }
    } finally {
      this.terminating = false;
    }
  }
}

export { isJobInboundMessage };
