import { describe, expect, it, vi } from 'vitest';
import {
  defaultPhaseRunner,
  isJobEventMessage,
  isJobInboundMessage,
  jobPhases,
  JobEngine,
  JOB_PROTOCOL_V2,
  validateJobInboundMessage,
  type JobEventMessage,
  type JobInboundMessage,
  type JobSubmitMessage
} from '../src/workers/jobProtocol';
import {
  defaultJobPoolSize,
  inProcessTransportFactory,
  JobCancelledError,
  JobClient,
  JobFailedError,
  JobTimeoutError,
  type JobTransportFactory
} from '../src/runtime/JobClient';
import type { ChaosRequest, StudyPointResponse } from '../src/workers/chaosProtocol';

const studyRequest = (id = 'req-1'): ChaosRequest => ({
  id,
  kind: 'studyPoint',
  spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  state0: [2.1, 1.4, 0, 0],
  settings: { lyapunov: { steps: 400 }, rqa: { samples: 80, transientSteps: 200 }, ftleHorizon: 1 }
});

/** Phase runner that records calls and can fail or stall on demand. */
function instrumentedRunner(options: { failPhases?: Set<string>; delayMs?: number } = {}) {
  const calls: string[] = [];
  const runner = (request: ChaosRequest, phase: string): Record<string, number> => {
    calls.push(`${request.id}:${phase}`);
    if (options.failPhases?.has(phase)) throw new Error(`phase ${phase} exploded`);
    if (options.delayMs) {
      const until = Date.now() + options.delayMs;
      while (Date.now() < until) {
        /* spin to simulate a sync kernel */
      }
    }
    if (phase === 'lyapunov') return { lambdaMax: 1.5, lambdaBlockStdError: 0.1 };
    if (phase === 'rqa') return { rqaDeterminism: 0.8, rqaDivergence: 0.05 };
    if (phase === 'ftle') return { ftle: 1.2, ftleHorizon: 1 };
    return {};
  };
  return { calls, runner };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const studyResponse = (id: string): StudyPointResponse => ({
  id,
  kind: 'studyPoint',
  ok: true,
  lambdaMax: 1.2,
  lambdaBlockStdError: 0.1,
  rqaDeterminism: 0.8,
  rqaDivergence: 0.05,
  ftle: 1.1,
  ftleHorizon: 1
});

interface ManualTransportSlot {
  emit(event: JobEventMessage): void;
  fail(error: Error): void;
  sent: JobInboundMessage[];
  terminateCalls: number;
}

function manualWorkerFactory(options: { throwOnSend?: boolean; throwOnTerminate?: boolean } = {}): {
  factory: JobTransportFactory;
  slots: ManualTransportSlot[];
} {
  const slots: ManualTransportSlot[] = [];
  const factory: JobTransportFactory = (onEvent, onFatal) => {
    const slot: ManualTransportSlot = {
      emit: onEvent,
      fail: onFatal,
      sent: [],
      terminateCalls: 0
    };
    slots.push(slot);
    return {
      usesWorker: true,
      send: (message) => {
        slot.sent.push(message);
        if (options.throwOnSend) throw new Error('postMessage exploded');
      },
      terminate: () => {
        slot.terminateCalls += 1;
        if (options.throwOnTerminate) throw new Error('terminate exploded');
      }
    };
  };
  return { factory, slots };
}

describe('jobPhases', () => {
  it('splits studyPoint into three phases and everything else into one', () => {
    expect(jobPhases(studyRequest())).toEqual(['lyapunov', 'rqa', 'ftle']);
    expect(
      jobPhases({
        id: 'x',
        kind: 'lyapunov',
        spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
        state0: [1, 1, 0, 0]
      })
    ).toEqual(['compute']);
  });
});

describe('defaultJobPoolSize', () => {
  it('scales research workers from hardware concurrency with a conservative cap', () => {
    expect(defaultJobPoolSize(1)).toBe(1);
    expect(defaultJobPoolSize(2)).toBe(1);
    expect(defaultJobPoolSize(6)).toBe(3);
    expect(defaultJobPoolSize(16)).toBe(4);
  });
});

describe('job protocol runtime validation', () => {
  it('rejects malformed pool bounds instead of allowing NaN, fractions, or unbounded queues', () => {
    const factory = inProcessTransportFactory(instrumentedRunner().runner);
    for (const poolSize of [Number.NaN, Number.POSITIVE_INFINITY, 0, 1.5, 9]) {
      expect(() => new JobClient(factory, { poolSize })).toThrow(RangeError);
    }
    for (const maxQueued of [Number.NaN, Number.POSITIVE_INFINITY, 0, 2.5, 10_001]) {
      expect(() => new JobClient(factory, { maxQueued })).toThrow(RangeError);
    }
  });

  it('validates the entire submit envelope and request-specific finite work settings', () => {
    const valid: JobSubmitMessage = {
      protocol: JOB_PROTOCOL_V2,
      type: 'submit',
      jobId: 'validated',
      priority: 0,
      request: studyRequest('validated'),
      timeoutMs: 50,
      checkpointEvery: 1
    };
    expect(validateJobInboundMessage(valid)).toBe(valid);
    expect(isJobInboundMessage({ ...valid, priority: Number.NaN })).toBe(false);
    expect(isJobInboundMessage({ ...valid, timeoutMs: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isJobInboundMessage({ ...valid, checkpointEvery: 0.5 })).toBe(false);
    expect(
      isJobInboundMessage({
        ...valid,
        checkpoint: { completedPhases: ['lyapunov'], partial: { lambdaMax: 1 } }
      })
    ).toBe(false);
    expect(
      isJobInboundMessage({
        ...valid,
        request: {
          ...studyRequest('bad-work'),
          settings: { lyapunov: { steps: Number.POSITIVE_INFINITY } }
        }
      })
    ).toBe(false);
  });

  it('requires finite, typed outbound events before the client can consume them', () => {
    expect(
      isJobEventMessage({
        protocol: JOB_PROTOCOL_V2,
        type: 'progress',
        jobId: 'job',
        phase: 'compute',
        completedPhases: 0,
        totalPhases: 1,
        elapsedMs: Number.NaN
      })
    ).toBe(false);
    expect(isJobEventMessage({ protocol: JOB_PROTOCOL_V2, type: 'result', jobId: 'job', response: null })).toBe(false);
  });
});

describe('JobEngine protocol semantics', () => {
  function collectEngine(runner = instrumentedRunner().runner) {
    const events: JobEventMessage[] = [];
    const engine = new JobEngine((event) => events.push(event), runner);
    return { engine, events };
  }

  const submitMessage = (jobId: string, extras: Partial<JobSubmitMessage> = {}): JobSubmitMessage => ({
    protocol: JOB_PROTOCOL_V2,
    type: 'submit',
    jobId,
    priority: 0,
    request: studyRequest(jobId),
    ...extras
  });

  it('completes a study job with progress, checkpoints, and a composed result', async () => {
    const { engine, events } = collectEngine();
    engine.handle(submitMessage('job-a'));
    for (let i = 0; i < 20 && !events.some((event) => event.type === 'result'); i += 1) await flush();

    const types = events.map((event) => event.type);
    expect(types[0]).toBe('accepted');
    expect(types.filter((type) => type === 'progress')).toHaveLength(3);
    expect(types.filter((type) => type === 'checkpoint')).toHaveLength(3);
    const result = events.find((event) => event.type === 'result');
    expect(result && result.type === 'result' && (result.response as StudyPointResponse).lambdaMax).toBe(1.5);
    expect(result && result.type === 'result' && (result.response as StudyPointResponse).rqaDeterminism).toBe(0.8);
  });

  it('cancel-before-start removes a queued job without running it', async () => {
    const { calls, runner } = instrumentedRunner();
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('job-first'));
    engine.handle(submitMessage('job-second'));
    engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'cancel', jobId: 'job-second' });
    for (let i = 0; i < 20 && !events.some((event) => event.type === 'result' && event.jobId === 'job-first'); i += 1)
      await flush();

    const cancelled = events.find((event) => event.type === 'cancelled' && event.jobId === 'job-second');
    expect(cancelled && cancelled.type === 'cancelled' && cancelled.atPhase).toBe('queued');
    expect(calls.some((call) => call.startsWith('job-second:'))).toBe(false);
    expect(events.some((event) => event.type === 'result' && event.jobId === 'job-second')).toBe(false);
  });

  it('cancel-during-run stops at the next phase boundary with a checkpoint', async () => {
    const { calls, runner } = instrumentedRunner();
    const events: JobEventMessage[] = [];
    const engine = new JobEngine((event) => {
      events.push(event);
      // Cancel as soon as the first phase reports progress.
      if (event.type === 'checkpoint' && event.checkpoint.completedPhases.length === 1) {
        engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'cancel', jobId: event.jobId });
      }
    }, runner);
    engine.handle(submitMessage('job-c'));
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'cancelled'); i += 1) await flush();

    const cancelled = events.find((event) => event.type === 'cancelled');
    expect(cancelled).toBeTruthy();
    expect(cancelled && cancelled.type === 'cancelled' && cancelled.checkpoint.completedPhases).toEqual(['lyapunov']);
    expect(cancelled && cancelled.type === 'cancelled' && cancelled.checkpoint.partial.lambdaMax).toBe(1.5);
    // rqa/ftle phases never ran.
    expect(calls).toEqual(['job-c:lyapunov']);
  });

  it('enforces the deadline at phase boundaries', async () => {
    const { runner } = instrumentedRunner({ delayMs: 30 });
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('job-t', { timeoutMs: 10 }));
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'timed-out'); i += 1) await flush();

    const timedOut = events.find((event) => event.type === 'timed-out');
    expect(timedOut).toBeTruthy();
    expect(timedOut && timedOut.type === 'timed-out' && timedOut.checkpoint.completedPhases.length).toBeLessThan(3);
    expect(events.some((event) => event.type === 'result')).toBe(false);
  });

  it('emits a failed envelope with phase and checkpoint when a phase throws', async () => {
    const { runner } = instrumentedRunner({ failPhases: new Set(['rqa']) });
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('job-f'));
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'failed'); i += 1) await flush();

    const failed = events.find((event) => event.type === 'failed');
    expect(failed && failed.type === 'failed' && failed.error).toContain('rqa exploded');
    expect(failed && failed.type === 'failed' && failed.phase).toBe('rqa');
    expect(failed && failed.type === 'failed' && failed.checkpoint.completedPhases).toEqual(['lyapunov']);
  });

  it('resumes from a checkpoint without re-running completed phases', async () => {
    const { calls, runner } = instrumentedRunner();
    const { engine, events } = collectEngine(runner);
    engine.handle(
      submitMessage('job-r', {
        checkpoint: { completedPhases: ['lyapunov'], partial: { lambdaMax: 9.9, lambdaBlockStdError: 0.5 } }
      })
    );
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'result'); i += 1) await flush();

    expect(calls).toEqual(['job-r:rqa', 'job-r:ftle']);
    const result = events.find((event) => event.type === 'result');
    // Resumed partials are preserved in the composed response.
    expect(result && result.type === 'result' && (result.response as StudyPointResponse).lambdaMax).toBe(9.9);
  });

  it('pause holds the job at a phase boundary and resume completes it', async () => {
    const { runner } = instrumentedRunner();
    const events: JobEventMessage[] = [];
    const engine = new JobEngine((event) => {
      events.push(event);
      if (event.type === 'checkpoint' && event.checkpoint.completedPhases.length === 1) {
        engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'pause', jobId: event.jobId });
      }
    }, runner);
    engine.handle(submitMessage('job-p'));
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'paused'); i += 1) await flush();
    expect(events.some((event) => event.type === 'paused')).toBe(true);
    expect(events.some((event) => event.type === 'result')).toBe(false);

    engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'resume', jobId: 'job-p' });
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'result'); i += 1) await flush();
    expect(events.some((event) => event.type === 'resumed')).toBe(true);
    expect(events.some((event) => event.type === 'result')).toBe(true);
  });

  it('keeps deadline enforcement active while a job is paused', async () => {
    const { engine, events } = collectEngine();
    engine.handle(submitMessage('job-paused-timeout', { timeoutMs: 10 }));
    engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'pause', jobId: 'job-paused-timeout' });
    for (let i = 0; i < 50 && !events.some((event) => event.type === 'timed-out'); i += 1) await flush();

    expect(events.some((event) => event.type === 'paused')).toBe(true);
    expect(events.some((event) => event.type === 'timed-out')).toBe(true);
    expect(events.some((event) => event.type === 'result')).toBe(false);
  });

  it('does not overwrite an active duplicate id and releases the id after a terminal event', async () => {
    const { calls, runner } = instrumentedRunner();
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('job-duplicate'));
    engine.handle({
      ...submitMessage('job-duplicate'),
      request: studyRequest('replacement-request')
    });
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'result'); i += 1) await flush();

    expect(calls.some((call) => call.startsWith('replacement-request:'))).toBe(false);
    expect(events.some((event) => event.type === 'status' && event.jobId === 'job-duplicate')).toBe(true);

    engine.handle(submitMessage('job-duplicate'));
    for (let i = 0; i < 30 && events.filter((event) => event.type === 'result').length < 2; i += 1) await flush();
    expect(events.filter((event) => event.type === 'accepted' && event.jobId === 'job-duplicate')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'result' && event.jobId === 'job-duplicate')).toHaveLength(2);
  });

  it('turns malformed phase output into a terminal failure and drains the next job', async () => {
    let first = true;
    const runner = (_request: ChaosRequest, phase: string): Record<string, number> => {
      if (first && phase === 'lyapunov') {
        first = false;
        return { lambdaMax: Number.NaN, lambdaBlockStdError: 0.1 };
      }
      if (phase === 'lyapunov') return { lambdaMax: 1, lambdaBlockStdError: 0.1 };
      if (phase === 'rqa') return { rqaDeterminism: 0.8, rqaDivergence: 0.05 };
      return { ftle: 1, ftleHorizon: 1 };
    };
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('bad-partial'));
    engine.handle(submitMessage('after-bad-partial'));
    for (let i = 0; i < 50 && !events.some((event) => event.type === 'result'); i += 1) await flush();

    expect(events.some((event) => event.type === 'failed' && event.jobId === 'bad-partial')).toBe(true);
    expect(events.some((event) => event.type === 'result' && event.jobId === 'after-bad-partial')).toBe(true);
  });

  it('runs higher-priority queued jobs first', async () => {
    const { calls, runner } = instrumentedRunner();
    const { engine, events } = collectEngine(runner);
    engine.handle(submitMessage('job-low'));
    engine.handle(submitMessage('job-mid', { priority: 5 }));
    engine.handle(submitMessage('job-high', { priority: 10 }));
    for (let i = 0; i < 60 && events.filter((event) => event.type === 'result').length < 3; i += 1) await flush();

    // The engine yields before picking the first job, so all three were queued
    // by then and run strictly by priority.
    const order = calls.filter((call) => call.endsWith(':lyapunov')).map((call) => call.split(':')[0]);
    expect(order).toEqual(['job-high', 'job-mid', 'job-low']);
  });

  it('answers status queries for known and unknown jobs', () => {
    const { engine, events } = collectEngine();
    engine.handle({ protocol: JOB_PROTOCOL_V2, type: 'status', jobId: 'nope' });
    const status = events.find((event) => event.type === 'status');
    expect(status && status.type === 'status' && status.status).toBe('failed');
  });
});

describe('JobClient pool (in-process fallback)', () => {
  it('completes real studyPoint physics end to end', async () => {
    const client = new JobClient(inProcessTransportFactory(), { poolSize: 1 });
    const phases: string[] = [];
    const handle = client.submit(studyRequest('real-1'), {
      onProgress: (phase) => phases.push(phase)
    });
    const response = (await handle.result) as StudyPointResponse;
    expect(response.ok).toBe(true);
    expect(Number.isFinite(response.lambdaMax)).toBe(true);
    expect(Number.isFinite(response.rqaDeterminism)).toBe(true);
    expect(Number.isFinite(response.ftle)).toBe(true);
    expect(phases).toEqual(['lyapunov', 'rqa', 'ftle']);
    expect(defaultPhaseRunner(studyRequest('direct'), 'lyapunov').lambdaMax).toBeDefined();
    client.terminate();
  }, 30_000);

  it('rejects with JobCancelledError when cancelled mid-run and exposes the checkpoint', async () => {
    const { runner } = instrumentedRunner();
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1 });
    const handleRef: { current: { cancel(): void } | null } = { current: null };
    const handle = client.submit(studyRequest('cancel-mid'), {
      onCheckpoint: () => handleRef.current?.cancel()
    });
    handleRef.current = handle;
    await expect(handle.result).rejects.toBeInstanceOf(JobCancelledError);
    client.terminate();
  });

  it('cancels queued jobs before they start', async () => {
    const { calls, runner } = instrumentedRunner();
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1 });
    const first = client.submit(studyRequest('q-first'));
    const second = client.submit(studyRequest('q-second'));
    second.cancel();
    await expect(second.result).rejects.toBeInstanceOf(JobCancelledError);
    await first.result;
    expect(calls.some((call) => call.startsWith('q-second'))).toBe(false);
    client.terminate();
  });

  it('rejects with JobTimeoutError and surfaces partial checkpoints', async () => {
    const { runner } = instrumentedRunner({ delayMs: 40 });
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1 });
    const handle = client.submit(studyRequest('slow'), { timeoutMs: 20 });
    await expect(handle.result).rejects.toBeInstanceOf(JobTimeoutError);
    client.terminate();
  });

  it('submitWithRetry retries failed jobs and resumes from the last checkpoint', async () => {
    let failOnce = true;
    const calls: string[] = [];
    const runner = (request: ChaosRequest, phase: string): Record<string, number> => {
      calls.push(phase);
      if (phase === 'rqa' && failOnce) {
        failOnce = false;
        throw new Error('transient failure');
      }
      if (phase === 'lyapunov') return { lambdaMax: 2, lambdaBlockStdError: 0.1 };
      if (phase === 'rqa') return { rqaDeterminism: 0.7, rqaDivergence: 0.1 };
      return { ftle: 0.9, ftleHorizon: 1 };
    };
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1 });
    const response = (await client.submitWithRetry(studyRequest('retry-1'), { attempts: 2 })) as StudyPointResponse;
    expect(response.ok).toBe(true);
    // First attempt: lyapunov + rqa(fail). Second attempt resumes: rqa + ftle (no second lyapunov).
    expect(calls).toEqual(['lyapunov', 'rqa', 'rqa', 'ftle']);
    expect(response.lambdaMax).toBe(2);
    client.terminate();
  });

  it('submitWithRetry surfaces a JobFailedError after exhausting attempts', async () => {
    const { runner } = instrumentedRunner({ failPhases: new Set(['lyapunov']) });
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1 });
    await expect(client.submitWithRetry(studyRequest('always-fails'), { attempts: 2 })).rejects.toBeInstanceOf(
      JobFailedError
    );
    client.terminate();
  });

  it('distributes queued jobs across a pool of transports', async () => {
    const { runner } = instrumentedRunner();
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 2 });
    const handles = ['a', 'b', 'c', 'd'].map((suffix) => client.submit(studyRequest(`pool-${suffix}`)));
    const responses = await Promise.all(handles.map((handle) => handle.result));
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(client.inFlight()).toBe(0);
    client.terminate();
  });

  it('settles and respawns a slot when postMessage throws', async () => {
    const { factory, slots } = manualWorkerFactory({ throwOnSend: true });
    const client = new JobClient(factory, { poolSize: 1 });
    const handle = client.submit(studyRequest('post-message-throw'));

    await expect(handle.result).rejects.toMatchObject({ name: 'JobFailedError', phase: 'transport' });
    expect(client.inFlight()).toBe(0);
    expect(slots).toHaveLength(2);
    expect(slots[0]?.terminateCalls).toBe(1);
    client.terminate();
  });

  it('settles a pending job on a worker fatal signal and uses the respawned slot', async () => {
    const { factory, slots } = manualWorkerFactory();
    const client = new JobClient(factory, { poolSize: 1 });
    const first = client.submit(studyRequest('worker-fatal'));
    slots[0]!.fail(new Error('worker error event'));

    await expect(first.result).rejects.toMatchObject({ name: 'JobFailedError', phase: 'transport' });
    expect(slots).toHaveLength(2);

    const second = client.submit(studyRequest('after-worker-fatal'));
    slots[1]!.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId: second.jobId,
      response: studyResponse('after-worker-fatal'),
      elapsedMs: 1
    });
    await expect(second.result).resolves.toMatchObject({ id: 'after-worker-fatal', ok: true });
    client.terminate();
  });

  it('isolates progress and checkpoint callback exceptions from job settlement', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new JobClient(inProcessTransportFactory(instrumentedRunner().runner), { poolSize: 1 });
    const handle = client.submit(studyRequest('throwing-callbacks'), {
      onProgress: () => {
        throw new Error('progress callback exploded');
      },
      onCheckpoint: () => {
        throw new Error('checkpoint callback exploded');
      }
    });

    await expect(handle.result).resolves.toMatchObject({ id: 'throwing-callbacks', ok: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    client.terminate();
  });

  it('ignores a valid event from the wrong worker and accepts only the owning slot', async () => {
    const { factory, slots } = manualWorkerFactory();
    const client = new JobClient(factory, { poolSize: 2 });
    const first = client.submit(studyRequest('owner-a'));
    const second = client.submit(studyRequest('owner-b'));

    slots[0]!.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId: second.jobId,
      response: studyResponse('owner-b'),
      elapsedMs: 1
    });
    expect(client.inFlight()).toBe(2);

    slots[0]!.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId: first.jobId,
      response: studyResponse('owner-a'),
      elapsedMs: 1
    });
    slots[1]!.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId: second.jobId,
      response: studyResponse('owner-b'),
      elapsedMs: 1
    });
    await expect(first.result).resolves.toMatchObject({ id: 'owner-a' });
    await expect(second.result).resolves.toMatchObject({ id: 'owner-b' });
    client.terminate();
  });

  it('fails and replaces a worker that emits a contextually mismatched result', async () => {
    const { factory, slots } = manualWorkerFactory();
    const client = new JobClient(factory, { poolSize: 1 });
    const handle = client.submit(studyRequest('expected-response'));
    slots[0]!.emit({
      protocol: JOB_PROTOCOL_V2,
      type: 'result',
      jobId: handle.jobId,
      response: studyResponse('different-response'),
      elapsedMs: 1
    });

    await expect(handle.result).rejects.toMatchObject({ name: 'JobFailedError', phase: 'transport' });
    expect(slots).toHaveLength(2);
    client.terminate();
  });

  it('contains transport factory and terminate exceptions while cleaning every promise', async () => {
    const throwingFactory: JobTransportFactory = () => {
      throw new Error('factory exploded');
    };
    const factoryClient = new JobClient(throwingFactory, { poolSize: 1 });
    const factoryHandle = factoryClient.submit(studyRequest('factory-throw'));
    await expect(factoryHandle.result).rejects.toMatchObject({ name: 'JobFailedError', phase: 'transport' });
    expect(() => factoryClient.terminate()).not.toThrow();

    const { factory } = manualWorkerFactory({ throwOnTerminate: true });
    const terminateClient = new JobClient(factory, { poolSize: 1 });
    const terminateHandle = terminateClient.submit(studyRequest('terminate-throw'));
    const rejected = expect(terminateHandle.result).rejects.toBeInstanceOf(JobCancelledError);
    expect(() => terminateClient.terminate()).not.toThrow();
    await rejected;
    expect(terminateClient.inFlight()).toBe(0);
  });

  it('rejects unsafe request budgets before creating a transport', async () => {
    let factoryCalls = 0;
    const factory: JobTransportFactory = () => {
      factoryCalls += 1;
      throw new Error('must not be reached');
    };
    const client = new JobClient(factory, { poolSize: 1 });
    const invalid = {
      ...studyRequest('invalid-work'),
      settings: { lyapunov: { steps: Number.NaN } }
    } as unknown as ChaosRequest;
    const handle = client.submit(invalid);

    await expect(handle.result).rejects.toBeInstanceOf(RangeError);
    expect(factoryCalls).toBe(0);
    expect(client.inFlight()).toBe(0);
  });

  it('rejects large single-phase work when no Worker can keep it off the UI thread', async () => {
    const client = new JobClient(inProcessTransportFactory(), { poolSize: 1 });
    const handle = client.submit({
      id: 'large-main-thread-grid',
      kind: 'basin',
      spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
      settings: { n: 20, dt: 0.001, maxTime: 1 }
    });

    await expect(handle.result).rejects.toThrow(/without Worker support/);
    expect(client.inFlight()).toBe(0);
    client.terminate();
  });

  it('applies backpressure beyond maxQueued', async () => {
    const { runner } = instrumentedRunner();
    const client = new JobClient(inProcessTransportFactory(runner), { poolSize: 1, maxQueued: 2 });
    const first = client.submit(studyRequest('bp-1'));
    const second = client.submit(studyRequest('bp-2'));
    const third = client.submit(studyRequest('bp-3'));
    await expect(third.result).rejects.toThrow(/queue full/);
    await Promise.all([first.result, second.result]);
    client.terminate();
  });
});
