import {
  runChaosJob,
  type ChaosRequest,
  type ChaosResponse,
  type StudyPointRequest,
  type StudyPointResponse
} from './chaosProtocol';
import { finiteTimeLyapunov, maximalLyapunov, recurrenceQuantification, sampleObservable } from '../chaos';
import { buildJacobian, buildRhs } from '../physics/systemSpec';
import {
  dataRecord,
  finiteNumber,
  nonEmptyString,
  STUDY_PHASE_FIELDS,
  validateJobInboundMessage
} from './jobProtocolValidation';
import {
  JOB_PROTOCOL_V2,
  jobPhases,
  type JobCheckpointState,
  type JobEventMessage,
  type JobInboundMessage,
  type JobStatus,
  type JobSubmitMessage
} from './jobProtocolTypes';

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

function validatePhasePartial(request: ChaosRequest, phase: string, value: unknown): Record<string, number> {
  const partial = dataRecord(value, `job phase ${phase} result`);
  const copy: Record<string, number> = {};
  for (const [key, entry] of Object.entries(partial)) {
    nonEmptyString(key, `job phase ${phase} result key`, 64);
    copy[key] = finiteNumber(entry, `job phase ${phase} result.${key}`, -Number.MAX_VALUE, Number.MAX_VALUE);
  }
  if (request.kind === 'studyPoint') {
    const required = STUDY_PHASE_FIELDS[phase];
    if (!required) throw new RangeError(`study-point phase ${phase} is unsupported`);
    for (const key of required) {
      if (!Object.hasOwn(copy, key)) throw new RangeError(`job phase ${phase} result is missing ${key}`);
    }
    for (const key of Object.keys(copy)) {
      if (!required.includes(key)) throw new RangeError(`job phase ${phase} returned unexpected field ${key}`);
    }
  } else if (Object.keys(copy).length > 0) {
    throw new RangeError('single-phase chaos jobs must not return checkpoint partials');
  }
  return copy;
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

type TerminalJobEvent = Extract<JobEventMessage, { type: 'result' | 'failed' | 'cancelled' | 'timed-out' }>;

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
    const validated = validateJobInboundMessage(message);
    if (validated.type === 'submit') {
      this.submit(validated);
      return;
    }
    const job = this.jobs.get(validated.jobId);
    if (validated.type === 'status') {
      this.emit({ protocol: JOB_PROTOCOL_V2, type: 'status', jobId: validated.jobId, status: job?.status ?? 'failed' });
      return;
    }
    if (!job) return;
    if (validated.type === 'cancel') {
      job.cancelRequested = true;
      job.pauseRequested = false;
      if (job.status === 'queued') {
        // Cancel-before-start: drop from the queue immediately, never run.
        this.queue = this.queue.filter((queued) => queued !== job);
        job.status = 'cancelled';
        this.finish(job, {
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId: job.message.jobId,
          atPhase: 'queued',
          checkpoint: { completedPhases: [...job.completedPhases], partial: { ...job.partial } }
        });
      }
      return;
    }
    if (validated.type === 'pause') {
      if (job.status === 'running' || job.status === 'queued') job.pauseRequested = true;
      return;
    }
    if (validated.type === 'resume' && job.status === 'paused') {
      job.pauseRequested = false;
      this.emit({ protocol: JOB_PROTOCOL_V2, type: 'resumed', jobId: job.message.jobId });
    }
  }

  private submit(message: JobSubmitMessage): void {
    const existing = this.jobs.get(message.jobId);
    if (existing) {
      this.emit({
        protocol: JOB_PROTOCOL_V2,
        type: 'status',
        jobId: message.jobId,
        status: existing.status
      });
      return;
    }
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
        try {
          await this.runJob(job);
        } catch (error) {
          if (!this.jobs.has(job.message.jobId)) continue;
          job.status = 'failed';
          this.finish(job, {
            protocol: JOB_PROTOCOL_V2,
            type: 'failed',
            jobId: job.message.jobId,
            error: error instanceof Error ? error.message : String(error),
            phase: 'protocol',
            elapsedMs: Math.max(0, this.now() - job.submittedAt),
            checkpoint: this.checkpointOf(job)
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private checkpointOf(job: EngineJob): JobCheckpointState {
    return { completedPhases: [...job.completedPhases], partial: { ...job.partial } };
  }

  private finish(job: EngineJob, event: TerminalJobEvent): void {
    this.jobs.delete(job.message.jobId);
    this.queue = this.queue.filter((queued) => queued !== job);
    this.emit(event);
  }

  private hasTimedOut(job: EngineJob, startedAt: number): number | null {
    const timeoutMs = job.message.timeoutMs;
    if (timeoutMs === undefined) return null;
    const elapsed = Math.max(0, this.now() - startedAt);
    return elapsed >= timeoutMs ? elapsed : null;
  }

  private finishTimedOut(job: EngineJob, elapsedMs: number): void {
    job.status = 'timed-out';
    this.finish(job, {
      protocol: JOB_PROTOCOL_V2,
      type: 'timed-out',
      jobId: job.message.jobId,
      elapsedMs,
      checkpoint: this.checkpointOf(job)
    });
  }

  private async runJob(job: EngineJob): Promise<void> {
    const { jobId, request } = job.message;
    if (job.cancelRequested) {
      if (job.status !== 'cancelled') {
        job.status = 'cancelled';
        this.finish(job, {
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
        this.finish(job, {
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId,
          atPhase: phase,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      while (job.pauseRequested && !job.cancelRequested) {
        const pausedElapsed = this.hasTimedOut(job, startedAt);
        if (pausedElapsed !== null) {
          this.finishTimedOut(job, pausedElapsed);
          return;
        }
        if (job.status !== 'paused') {
          job.status = 'paused';
          this.emit({ protocol: JOB_PROTOCOL_V2, type: 'paused', jobId, atPhase: phase });
        }
        await yieldToEventLoop();
      }
      if (job.cancelRequested) {
        job.status = 'cancelled';
        this.finish(job, {
          protocol: JOB_PROTOCOL_V2,
          type: 'cancelled',
          jobId,
          atPhase: phase,
          checkpoint: this.checkpointOf(job)
        });
        return;
      }
      job.status = 'running';
      const timedOutBeforePhase = this.hasTimedOut(job, startedAt);
      if (timedOutBeforePhase !== null) {
        this.finishTimedOut(job, timedOutBeforePhase);
        return;
      }
      const elapsed = Math.max(0, this.now() - startedAt);
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
        const partial = validatePhasePartial(request, phase, this.phaseRunner(request, phase));
        Object.assign(job.partial, partial);
        job.completedPhases.push(phase);
      } catch (error) {
        job.status = 'failed';
        this.finish(job, {
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
      const timedOutAfterPhase = this.hasTimedOut(job, startedAt);
      if (timedOutAfterPhase !== null) {
        this.finishTimedOut(job, timedOutAfterPhase);
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
      this.finish(job, {
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
    this.finish(job, {
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId,
      response,
      elapsedMs: Math.max(0, this.now() - startedAt)
    });
  }
}
