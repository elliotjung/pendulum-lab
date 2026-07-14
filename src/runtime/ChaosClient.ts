import {
  runChaosJob,
  type BifurcationJobSettings,
  type ChaosRequest,
  type ChaosResponse,
  type LyapunovResponse,
  type LyapunovSpectrumResponse,
  type BifurcationResponse,
  type ZeroOneJobSettings,
  type ZeroOneResponse,
  type ClvResponse,
  type BasinResponse,
  type RqaJobSettings,
  type RqaResponse,
  type FtleResponse,
  type StudyPointJobSettings,
  type StudyPointResponse,
  type WadaConvergenceResponse,
  type CodimTwoResponse
} from '../workers/chaosProtocol';
import type {
  ClvSettings,
  CodimTwoOptions,
  FlipBasinOptions,
  FtleFieldOptions,
  LyapunovSettings,
  WadaConvergenceOptions
} from '../chaos';
import type { SystemSpec } from '../physics/systemSpec';
import { notifyWorkerFallback } from './workerFallbackNotice';

/**
 * Main-thread client for the chaos worker. It returns Promises and transparently
 * falls back to a synchronous (off the render path via a deferred task)
 * computation when Web Workers are unavailable or fail to start, so callers get
 * the same API in every environment.
 */

export type WorkerFactory = () => Worker | null;

/** Default deadline for a single legacy chaos-worker request (10 minutes). */
export const DEFAULT_CHAOS_REQUEST_TIMEOUT_MS = 10 * 60 * 1_000;

export interface ChaosClientOptions {
  /** Default deadline for each request. Must be a finite, positive number. */
  requestTimeoutMs?: number;
}

export interface ChaosRequestOptions {
  /** Override the client's default deadline for this request. */
  timeoutMs?: number;
}

export class ChaosRequestTimeoutError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly requestKind: ChaosRequest['kind'],
    public readonly timeoutMs: number
  ) {
    super(`chaos request ${requestKind} (${requestId}) timed out after ${Math.round(timeoutMs)}ms`);
    this.name = 'ChaosRequestTimeoutError';
  }
}

export class ChaosRequestIdCollisionError extends Error {
  constructor(public readonly requestId: string) {
    super(`chaos request id collision: ${requestId}`);
    this.name = 'ChaosRequestIdCollisionError';
  }
}

export class ChaosClientDisposedError extends Error {
  constructor() {
    super('chaos client was terminated before the request completed');
    this.name = 'ChaosClientDisposedError';
  }
}

export class ChaosWorkerResetError extends Error {
  constructor(public readonly timedOutRequestId: string) {
    super(`chaos worker was reset after request ${timedOutRequestId} timed out`);
    this.name = 'ChaosWorkerResetError';
  }
}

interface PendingRequest {
  resolve: (response: ChaosResponse) => void;
  reject: (error: Error) => void;
  timeoutTimer: ReturnType<typeof setTimeout>;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

function validateTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('chaos request timeout must be a finite, positive number');
  }
  return timeoutMs;
}

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) return value;
  try {
    return new Error(String(value));
  } catch {
    return new Error(fallbackMessage);
  }
}

function defaultWorkerFactory(): Worker | null {
  if (typeof Worker === 'undefined') {
    notifyWorkerFallback('chaos-worker', 'worker unavailable');
    return null;
  }
  try {
    return new Worker(new URL('../workers/chaos.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pendulum-chaos-worker'
    });
  } catch (error) {
    notifyWorkerFallback('chaos-worker', error);
    return null;
  }
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `chaos-${idCounter}-${Date.now().toString(36)}`;
}

export class ChaosClient {
  private worker: Worker | null = null;
  private started = false;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly defaultTimeoutMs: number;

  private readonly onWorkerMessage = (event: MessageEvent<ChaosResponse>): void => {
    const response = event.data;
    if (typeof response !== 'object' || response === null || typeof response.id !== 'string') return;
    const pending = this.takePending(response.id);
    if (!pending) return;
    if (response.ok) pending.resolve(response);
    else pending.reject(new Error(response.error));
  };

  private readonly onWorkerError = (event: ErrorEvent): void => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'chaos worker failed');
    this.failWorker(error);
  };

  constructor(
    private readonly factory: WorkerFactory = defaultWorkerFactory,
    options: ChaosClientOptions = {}
  ) {
    this.defaultTimeoutMs = validateTimeout(options.requestTimeoutMs ?? DEFAULT_CHAOS_REQUEST_TIMEOUT_MS);
  }

  /** True if a worker was successfully created; false means the fallback path. */
  usesWorker(): boolean {
    this.ensureWorker();
    return this.worker !== null;
  }

  private ensureWorker(): void {
    if (this.started) return;
    this.started = true;
    try {
      const worker = this.factory();
      if (!worker) return;
      this.worker = worker;
      worker.addEventListener('message', this.onWorkerMessage as EventListener);
      worker.addEventListener('error', this.onWorkerError as EventListener);
    } catch (error) {
      this.detachWorkerSafely();
      notifyWorkerFallback('chaos-worker', error);
    }
  }

  private run<R extends ChaosResponse>(request: ChaosRequest, options: ChaosRequestOptions = {}): Promise<R> {
    const requestId = request.id;
    const requestKind = request.kind;
    if (this.pending.has(requestId)) return Promise.reject(new ChaosRequestIdCollisionError(requestId));
    let timeoutMs: number;
    try {
      timeoutMs = validateTimeout(options.timeoutMs ?? this.defaultTimeoutMs);
    } catch (error) {
      return Promise.reject(toError(error, 'invalid chaos request timeout'));
    }
    this.ensureWorker();
    const worker = this.worker;
    const result = new Promise<R>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (response) => resolve(response as R),
        reject,
        timeoutTimer: setTimeout(() => {
          const expired = this.takePending(requestId);
          if (!expired) return;
          expired.reject(new ChaosRequestTimeoutError(requestId, requestKind, timeoutMs));
          if (this.worker) {
            this.detachWorkerSafely();
            this.rejectAllPending(new ChaosWorkerResetError(requestId));
          }
        }, timeoutMs),
        fallbackTimer: null
      };
      this.pending.set(requestId, pending);
    });

    if (!worker) {
      notifyWorkerFallback('chaos-worker', 'worker unavailable');
      // Defer so the caller's computing UI can paint before the synchronous fallback starts.
      const pending = this.pending.get(requestId);
      if (pending) {
        pending.fallbackTimer = setTimeout(() => {
          const active = this.pending.get(requestId);
          if (!active) return;
          active.fallbackTimer = null;
          try {
            const response = runChaosJob(request);
            const settled = this.takePending(requestId);
            if (!settled) return;
            if (response.ok) settled.resolve(response);
            else settled.reject(new Error(response.error));
          } catch (error) {
            this.takePending(requestId)?.reject(toError(error, 'chaos fallback failed'));
          }
        }, 0);
      }
      return result;
    }

    try {
      worker.postMessage(request);
    } catch (error) {
      this.failWorker(toError(error, 'failed to post chaos request'));
    }
    return result;
  }

  private takePending(id: string): PendingRequest | undefined {
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.pending.delete(id);
    clearTimeout(pending.timeoutTimer);
    if (pending.fallbackTimer !== null) clearTimeout(pending.fallbackTimer);
    pending.fallbackTimer = null;
    return pending;
  }

  private rejectAllPending(error: Error): void {
    for (const id of [...this.pending.keys()]) this.takePending(id)?.reject(error);
  }

  private detachWorkerSafely(): void {
    const worker = this.worker;
    this.worker = null;
    this.started = false;
    if (!worker) return;
    try {
      worker.removeEventListener('message', this.onWorkerMessage as EventListener);
    } catch {
      // Continue cleanup even if a non-standard Worker rejects listener removal.
    }
    try {
      worker.removeEventListener('error', this.onWorkerError as EventListener);
    } catch {
      // Continue cleanup even if a non-standard Worker rejects listener removal.
    }
    try {
      worker.terminate();
    } catch {
      // A broken Worker implementation must not prevent promise/timer cleanup.
    }
  }

  private failWorker(error: Error): void {
    this.detachWorkerSafely();
    this.rejectAllPending(error);
  }

  lyapunov(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: Partial<LyapunovSettings>,
    requestOptions?: ChaosRequestOptions
  ): Promise<LyapunovResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'lyapunov',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<LyapunovResponse>(request, requestOptions);
  }

  lyapunovSpectrum(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    count?: number,
    settings?: Partial<LyapunovSettings>,
    requestOptions?: ChaosRequestOptions
  ): Promise<LyapunovSpectrumResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'lyapunovSpectrum',
      spec,
      state0: Array.from(state0),
      ...(count === undefined ? {} : { count }),
      ...(settings ? { settings } : {})
    };
    return this.run<LyapunovSpectrumResponse>(request, requestOptions);
  }

  bifurcation(
    base: Extract<SystemSpec, { kind: 'driven' }>,
    amplitudes: number[],
    state0: ArrayLike<number>,
    settings: BifurcationJobSettings,
    requestOptions?: ChaosRequestOptions
  ): Promise<BifurcationResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'bifurcation',
      base,
      amplitudes,
      state0: Array.from(state0),
      settings
    };
    return this.run<BifurcationResponse>(request, requestOptions);
  }

  /** 0–1 test for chaos on a bounded observable of the system (independent of the Lyapunov machinery). */
  zeroOne(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: ZeroOneJobSettings,
    requestOptions?: ChaosRequestOptions
  ): Promise<ZeroOneResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'zeroOne',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<ZeroOneResponse>(request, requestOptions);
  }

  /** Covariant Lyapunov vectors (Ginelli) + hyperbolicity angle. */
  clv(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    count?: number,
    settings?: Partial<ClvSettings>,
    requestOptions?: ChaosRequestOptions
  ): Promise<ClvResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'clv',
      spec,
      state0: Array.from(state0),
      ...(count === undefined ? {} : { count }),
      ...(settings ? { settings } : {})
    };
    return this.run<ClvResponse>(request, requestOptions);
  }

  /** Double-pendulum flip basin + basin entropy + box-counting dimension. */
  basin(
    spec: Extract<SystemSpec, { kind: 'double' }>,
    settings?: FlipBasinOptions,
    requestOptions?: ChaosRequestOptions
  ): Promise<BasinResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'basin',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<BasinResponse>(request, requestOptions);
  }

  /** Recurrence Quantification Analysis on a bounded observable of the system. */
  rqa(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: RqaJobSettings,
    requestOptions?: ChaosRequestOptions
  ): Promise<RqaResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'rqa',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<RqaResponse>(request, requestOptions);
  }

  /** Finite-time Lyapunov exponent field of the double pendulum over its (θ₁,θ₂) section. */
  ftle(
    spec: Extract<SystemSpec, { kind: 'double' }>,
    settings?: FtleFieldOptions,
    requestOptions?: ChaosRequestOptions
  ): Promise<FtleResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'ftle',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<FtleResponse>(request, requestOptions);
  }

  /** One parameter-study point: maximal λ (+SE), RQA DET/DIV, and per-point FTLE in a single job. */
  studyPoint(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: StudyPointJobSettings,
    requestOptions?: ChaosRequestOptions
  ): Promise<StudyPointResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'studyPoint',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<StudyPointResponse>(request, requestOptions);
  }

  /** Multi-resolution Wada convergence analysis on the flip basin. */
  wadaConvergence(
    spec: Extract<SystemSpec, { kind: 'double' }>,
    settings?: WadaConvergenceOptions,
    requestOptions?: ChaosRequestOptions
  ): Promise<WadaConvergenceResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'wadaConvergence',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<WadaConvergenceResponse>(request, requestOptions);
  }

  /** Two-parameter (drive amplitude × damping) λ-sign regime diagram. */
  codimTwo(
    base: Extract<SystemSpec, { kind: 'driven' }>,
    state0: ArrayLike<number>,
    xRange: [number, number],
    yRange: [number, number],
    settings?: CodimTwoOptions,
    requestOptions?: ChaosRequestOptions
  ): Promise<CodimTwoResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'codim2',
      base,
      state0: Array.from(state0),
      xRange,
      yRange,
      ...(settings ? { settings } : {})
    };
    return this.run<CodimTwoResponse>(request, requestOptions);
  }

  terminate(): void {
    this.detachWorkerSafely();
    this.rejectAllPending(new ChaosClientDisposedError());
  }

  /** Release worker resources. A later request lazily creates a fresh worker. */
  dispose(): void {
    this.terminate();
  }
}
