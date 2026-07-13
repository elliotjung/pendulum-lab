import {
  runChaosJob,
  type ChaosRequest,
  type ChaosResponse,
  type StudyPointRequest,
  type StudyPointResponse
} from './chaosProtocol';
import { finiteTimeLyapunov, maximalLyapunov, recurrenceQuantification, sampleObservable } from '../chaos';
import { buildJacobian, buildRhs } from '../physics/systemSpec';

/**
 * Worker job protocol V2: real job-level control instead of terminate/recreate.
 *
 * Jobs are split into *phases*; between phases the engine yields to the event
 * loop, so cancel / pause / resume / status control messages take effect while
 * a job is "running" — no worker teardown required. Multi-phase jobs
 * (`studyPoint`: lyapunov → rqa → ftle) emit checkpoints whose partial results
 * can be fed back to `submit` to resume after an interruption without redoing
 * completed phases. Single-phase jobs remain atomic but still honour
 * cancel-before-start, queue priority, and deadline checks at phase boundaries.
 */

export const JOB_PROTOCOL_V2 = 'chaos-jobs/v2' as const;

export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'timed-out';

export interface JobCheckpointState {
  completedPhases: string[];
  partial: Record<string, number>;
}

export interface JobSubmitMessage {
  protocol: typeof JOB_PROTOCOL_V2;
  type: 'submit';
  jobId: string;
  /** Higher runs first among queued jobs. Default 0. */
  priority: number;
  request: ChaosRequest;
  /** Wall-clock deadline enforced at phase boundaries (and by the client). */
  timeoutMs?: number;
  /** Emit a checkpoint event every N completed phases. Default 1, 0 disables. */
  checkpointEvery?: number;
  /** Resume support: phases already completed by a previous run. */
  checkpoint?: JobCheckpointState;
}

export interface JobControlMessage {
  protocol: typeof JOB_PROTOCOL_V2;
  type: 'cancel' | 'pause' | 'resume' | 'status';
  jobId: string;
}

export type JobInboundMessage = JobSubmitMessage | JobControlMessage;

export type JobEventMessage =
  | { protocol: typeof JOB_PROTOCOL_V2; type: 'accepted'; jobId: string; queuePosition: number }
  | {
      protocol: typeof JOB_PROTOCOL_V2;
      type: 'progress';
      jobId: string;
      phase: string;
      completedPhases: number;
      totalPhases: number;
      elapsedMs: number;
    }
  | {
      protocol: typeof JOB_PROTOCOL_V2;
      type: 'checkpoint';
      jobId: string;
      checkpoint: JobCheckpointState;
      elapsedMs: number;
    }
  | { protocol: typeof JOB_PROTOCOL_V2; type: 'status'; jobId: string; status: JobStatus }
  | { protocol: typeof JOB_PROTOCOL_V2; type: 'result'; jobId: string; response: ChaosResponse; elapsedMs: number }
  | {
      protocol: typeof JOB_PROTOCOL_V2;
      type: 'failed';
      jobId: string;
      error: string;
      phase: string;
      elapsedMs: number;
      checkpoint: JobCheckpointState;
    }
  | {
      protocol: typeof JOB_PROTOCOL_V2;
      type: 'cancelled';
      jobId: string;
      atPhase: string;
      checkpoint: JobCheckpointState;
    }
  | {
      protocol: typeof JOB_PROTOCOL_V2;
      type: 'timed-out';
      jobId: string;
      elapsedMs: number;
      checkpoint: JobCheckpointState;
    }
  | { protocol: typeof JOB_PROTOCOL_V2; type: 'paused'; jobId: string; atPhase: string }
  | { protocol: typeof JOB_PROTOCOL_V2; type: 'resumed'; jobId: string };

export function isJobInboundMessage(value: unknown): value is JobInboundMessage {
  return typeof value === 'object' && value !== null && (value as { protocol?: unknown }).protocol === JOB_PROTOCOL_V2;
}

/** Names of the phases a request decomposes into. */
export function jobPhases(request: ChaosRequest): string[] {
  if (request.kind === 'studyPoint') return ['lyapunov', 'rqa', 'ftle'];
  return ['compute'];
}

/** Runs one named phase, returning partial scalar results to merge. */
export type PhaseRunner = (request: ChaosRequest, phase: string) => Record<string, number>;

function runStudyPointPhase(request: StudyPointRequest, phase: string): Record<string, number> {
  const rhs = buildRhs(request.spec);
  const settings = request.settings ?? {};
  if (phase === 'lyapunov') {
    const lyap = maximalLyapunov(new Float64Array(request.state0), rhs, { steps: 8000, ...(settings.lyapunov ?? {}) });
    return { lambdaMax: lyap.lambdaMax, lambdaBlockStdError: lyap.blockStdError };
  }
  if (phase === 'rqa') {
    const rq = settings.rqa ?? {};
    const series = sampleObservable(rhs, request.state0, {
      dt: rq.dt ?? 0.01,
      sampleEvery: rq.sampleEvery ?? 20,
      samples: rq.samples ?? 360,
      transientSteps: rq.transientSteps ?? 2000,
      observable: (state) => Math.cos(state[0] ?? 0)
    });
    const rqa = recurrenceQuantification(series, {
      dimension: rq.dimension ?? 2,
      delay: rq.delay ?? 5,
      targetRecurrenceRate: rq.targetRecurrenceRate ?? 0.1
    });
    return { rqaDeterminism: rqa.determinism, rqaDivergence: rqa.divergence };
  }
  if (phase === 'ftle') {
    const horizon = settings.ftleHorizon ?? 5;
    const ftle = finiteTimeLyapunov(
      request.state0,
      rhs,
      horizon,
      { dt: settings.ftleDt ?? 0.01 },
      buildJacobian(request.spec)
    );
    return { ftle, ftleHorizon: horizon };
  }
  throw new Error(`unknown studyPoint phase: ${phase}`);
}

export const defaultPhaseRunner: PhaseRunner = (request, phase) => {
  if (request.kind === 'studyPoint') return runStudyPointPhase(request, phase);
  if (phase !== 'compute') throw new Error(`unknown phase ${phase} for ${request.kind}`);
  // Single-phase jobs return no partials; the composer falls back to runChaosJob.
  return {};
};

/** Merge phase partials into the final typed response. */
function composeResponse(request: ChaosRequest, partial: Record<string, number>): ChaosResponse {
  if (request.kind === 'studyPoint') {
    const response: StudyPointResponse = {
      id: request.id,
      kind: 'studyPoint',
      ok: true,
      lambdaMax: partial.lambdaMax ?? Number.NaN,
      lambdaBlockStdError: partial.lambdaBlockStdError ?? Number.NaN,
      rqaDeterminism: partial.rqaDeterminism ?? Number.NaN,
      rqaDivergence: partial.rqaDivergence ?? Number.NaN,
      ftle: partial.ftle ?? Number.NaN,
      ftleHorizon: partial.ftleHorizon ?? 5
    };
    return response;
  }
  return runChaosJob(request);
}

interface EngineJob {
  message: JobSubmitMessage;
  status: JobStatus;
  cancelRequested: boolean;
  pauseRequested: boolean;
  submittedAt: number;
  completedPhases: string[];
  partial: Record<string, number>;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The V2 job engine. Pure of any Worker global: the same engine instance runs
 * inside the chaos worker (emit = postMessage) and as the in-process fallback
 * (emit = local dispatch), so the protocol semantics are identical and the
 * whole control surface is unit-testable without a real Worker.
 */
export class JobEngine {
  private queue: EngineJob[] = [];
  private jobs = new Map<string, EngineJob>();
  private draining = false;

  constructor(
    private readonly emit: (event: JobEventMessage) => void,
    private readonly phaseRunner: PhaseRunner = defaultPhaseRunner,
    private readonly now: () => number = () => Date.now()
  ) {}

  handle(message: JobInboundMessage): void {
    if (message.type === 'submit') {
      this.submit(message);
      return;
    }
    const job = this.jobs.get(message.jobId);
    if (message.type === 'status') {
      this.emit({ protocol: JOB_PROTOCOL_V2, type: 'status', jobId: message.jobId, status: job?.status ?? 'failed' });
      return;
    }
    if (!job) return;
    if (message.type === 'cancel') {
      job.cancelRequested = true;
      job.pauseRequested = false;
      if (job.status === 'queued') {
        // Cancel-before-start: drop from the queue immediately, never run.
        this.queue = this.queue.filter((queued) => queued !== job);
        job.status = 'cancelled';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId: job.message.jobId,
          atPhase: 'queued',
          checkpoint: { completedPhases: [...job.completedPhases], partial: { ...job.partial } }
        });
      }
      return;
    }
    if (message.type === 'pause') {
      if (job.status === 'running' || job.status === 'queued') job.pauseRequested = true;
      return;
    }
    if (message.type === 'resume' && job.status === 'paused') {
      job.pauseRequested = false;
      this.emit({ protocol: JOB_PROTOCOL_V2, type: 'resumed', jobId: job.message.jobId });
    }
  }

  private submit(message: JobSubmitMessage): void {
    const job: EngineJob = {
      message,
      status: 'queued',
      cancelRequested: false,
      pauseRequested: false,
      submittedAt: this.now(),
      completedPhases: [...(message.checkpoint?.completedPhases ?? [])],
      partial: { ...(message.checkpoint?.partial ?? {}) }
    };
    this.jobs.set(message.jobId, job);
    this.queue.push(job);
    this.queue.sort((a, b) => b.message.priority - a.message.priority || a.submittedAt - b.submittedAt);
    this.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'accepted',
      jobId: message.jobId,
      queuePosition: this.queue.indexOf(job)
    });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        // Yield before each job: `accepted` returns to the caller first, and
        // control messages (cancel-before-start) can land even for the job at
        // the head of the queue.
        await yieldToEventLoop();
        const job = this.queue.shift();
        if (!job) break;
        await this.runJob(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private checkpointOf(job: EngineJob): JobCheckpointState {
    return { completedPhases: [...job.completedPhases], partial: { ...job.partial } };
  }

  private async runJob(job: EngineJob): Promise<void> {
    const { jobId, request, timeoutMs } = job.message;
    if (job.cancelRequested) {
      if (job.status !== 'cancelled') {
        job.status = 'cancelled';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId,
          atPhase: 'queued',
          checkpoint: this.checkpointOf(job)
        });
      }
      return;
    }
    job.status = 'running';
    const startedAt = this.now();
    const phases = jobPhases(request).filter((phase) => !job.completedPhases.includes(phase));
    const totalPhases = jobPhases(request).length;
    const checkpointEvery = job.message.checkpointEvery ?? 1;
    let sinceCheckpoint = 0;

    for (const phase of phases) {
      // Phase-boundary control point: cancellation, pause, deadline.
      if (job.cancelRequested) {
        job.status = 'cancelled';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId,
          atPhase: phase,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      while (job.pauseRequested && !job.cancelRequested) {
        if (job.status !== 'paused') {
          job.status = 'paused';
          this.emit({ protocol: JOB_PROTOCOL_V2, type: 'paused', jobId, atPhase: phase });
        }
        await yieldToEventLoop();
      }
      if (job.cancelRequested) {
        job.status = 'cancelled';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId,
          atPhase: phase,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      job.status = 'running';
      const elapsed = this.now() - startedAt;
      if (timeoutMs !== undefined && elapsed > timeoutMs) {
        job.status = 'timed-out';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'timed-out',
          jobId,
          elapsedMs: elapsed,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      this.emit({
        protocol: JOB_PROTOCOL_V2,
        type: 'progress',
        jobId,
        phase,
        completedPhases: job.completedPhases.length,
        totalPhases,
        elapsedMs: elapsed
      });
      try {
        const partial = this.phaseRunner(request, phase);
        Object.assign(job.partial, partial);
        job.completedPhases.push(phase);
      } catch (error) {
        job.status = 'failed';
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'failed',
          jobId,
          error: error instanceof Error ? error.message : String(error),
          phase,
          elapsedMs: this.now() - startedAt,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      sinceCheckpoint += 1;
      if (checkpointEvery > 0 && sinceCheckpoint >= checkpointEvery) {
        sinceCheckpoint = 0;
        this.emit({
          protocol: JOB_PROTOCOL_V2,
          type: 'checkpoint',
          jobId,
          checkpoint: this.checkpointOf(job),
          elapsedMs: this.now() - startedAt
        });
      }
      await yieldToEventLoop();
    }

    const response = composeResponse(request, job.partial);
    if (!response.ok) {
      job.status = 'failed';
      this.emit({
        protocol: JOB_PROTOCOL_V2,
        type: 'failed',
        jobId,
        error: response.error,
        phase: 'compute',
        elapsedMs: this.now() - startedAt,
        checkpoint: this.checkpointOf(job)
      });
      return;
    }
    job.status = 'completed';
    this.emit({ protocol: JOB_PROTOCOL_V2, type: 'result', jobId, response, elapsedMs: this.now() - startedAt });
  }
}
