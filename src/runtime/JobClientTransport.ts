import {
  JobEngine,
  isJobEventMessage,
  type JobCheckpointState,
  type JobEventMessage,
  type JobInboundMessage,
  type PhaseRunner
} from '../workers/jobProtocol';
import { notifyWorkerFallback } from './workerFallbackNotice';

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

export type JobTransportFactory = (
  onEvent: (event: JobEventMessage) => void,
  onFatal: (error: Error) => void
) => JobTransport;

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
  return (onEvent, onFatal) => {
    if (typeof Worker === 'undefined') {
      notifyWorkerFallback('chaos-job-worker', 'worker unavailable');
      return inProcessTransportFactory()(onEvent, onFatal);
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/chaos.worker.ts', import.meta.url), {
        type: 'module',
        name: 'pendulum-chaos-job-worker'
      });
    } catch (error) {
      notifyWorkerFallback('chaos-job-worker', error);
      return inProcessTransportFactory()(onEvent, onFatal);
    }
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isJobEventMessage(event.data)) {
        onFatal(new Error('chaos worker emitted an invalid job event'));
        return;
      }
      onEvent(event.data);
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      onFatal(event.error instanceof Error ? event.error : new Error(event.message || 'chaos worker failed'));
    });
    worker.addEventListener('messageerror', () => {
      onFatal(new Error('chaos worker response could not be deserialized'));
    });
    return {
      send: (message) => worker.postMessage(message),
      terminate: () => worker.terminate(),
      usesWorker: true
    };
  };
}
