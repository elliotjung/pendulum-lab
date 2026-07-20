import type { ChaosRequest, ChaosResponse } from './chaosProtocol';

/** Version marker shared by every inbound command and outbound event. */
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

/** Names of the phases a request decomposes into. */
export function jobPhases(request: ChaosRequest): string[] {
  if (request.kind === 'studyPoint') return ['lyapunov', 'rqa', 'ftle'];
  return ['compute'];
}
