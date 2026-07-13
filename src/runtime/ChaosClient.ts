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

  constructor(private readonly factory: WorkerFactory = defaultWorkerFactory) {}

  /** True if a worker was successfully created; false means the fallback path. */
  usesWorker(): boolean {
    this.ensureWorker();
    return this.worker !== null;
  }

  private ensureWorker(): void {
    if (this.started) return;
    this.started = true;
    this.worker = this.factory();
  }

  private run<R extends ChaosResponse>(request: ChaosRequest): Promise<R> {
    this.ensureWorker();
    const worker = this.worker;
    if (!worker) {
      notifyWorkerFallback('chaos-worker', 'worker unavailable');
      // Fallback: defer so the caller's "Computing…" UI can paint first.
      return new Promise<R>((resolve, reject) => {
        setTimeout(() => {
          const response = runChaosJob(request);
          finish(response, resolve, reject);
        }, 0);
      });
    }
    return new Promise<R>((resolve, reject) => {
      const onMessage = (event: MessageEvent<ChaosResponse>) => {
        if (event.data.id !== request.id) return;
        cleanup();
        finish(event.data, resolve, reject);
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error instanceof Error ? event.error : new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage as EventListener);
        worker.removeEventListener('error', onError as EventListener);
      };
      worker.addEventListener('message', onMessage as EventListener);
      worker.addEventListener('error', onError as EventListener);
      worker.postMessage(request);
    });

    function finish(response: ChaosResponse, resolve: (r: R) => void, reject: (e: Error) => void): void {
      if (response.ok) resolve(response as R);
      else reject(new Error(response.error));
    }
  }

  lyapunov(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: Partial<LyapunovSettings>
  ): Promise<LyapunovResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'lyapunov',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<LyapunovResponse>(request);
  }

  lyapunovSpectrum(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    count?: number,
    settings?: Partial<LyapunovSettings>
  ): Promise<LyapunovSpectrumResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'lyapunovSpectrum',
      spec,
      state0: Array.from(state0),
      ...(count === undefined ? {} : { count }),
      ...(settings ? { settings } : {})
    };
    return this.run<LyapunovSpectrumResponse>(request);
  }

  bifurcation(
    base: Extract<SystemSpec, { kind: 'driven' }>,
    amplitudes: number[],
    state0: ArrayLike<number>,
    settings: BifurcationJobSettings
  ): Promise<BifurcationResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'bifurcation',
      base,
      amplitudes,
      state0: Array.from(state0),
      settings
    };
    return this.run<BifurcationResponse>(request);
  }

  /** 0–1 test for chaos on a bounded observable of the system (independent of the Lyapunov machinery). */
  zeroOne(spec: SystemSpec, state0: ArrayLike<number>, settings?: ZeroOneJobSettings): Promise<ZeroOneResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'zeroOne',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<ZeroOneResponse>(request);
  }

  /** Covariant Lyapunov vectors (Ginelli) + hyperbolicity angle. */
  clv(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    count?: number,
    settings?: Partial<ClvSettings>
  ): Promise<ClvResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'clv',
      spec,
      state0: Array.from(state0),
      ...(count === undefined ? {} : { count }),
      ...(settings ? { settings } : {})
    };
    return this.run<ClvResponse>(request);
  }

  /** Double-pendulum flip basin + basin entropy + box-counting dimension. */
  basin(spec: Extract<SystemSpec, { kind: 'double' }>, settings?: FlipBasinOptions): Promise<BasinResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'basin',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<BasinResponse>(request);
  }

  /** Recurrence Quantification Analysis on a bounded observable of the system. */
  rqa(spec: SystemSpec, state0: ArrayLike<number>, settings?: RqaJobSettings): Promise<RqaResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'rqa',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<RqaResponse>(request);
  }

  /** Finite-time Lyapunov exponent field of the double pendulum over its (θ₁,θ₂) section. */
  ftle(spec: Extract<SystemSpec, { kind: 'double' }>, settings?: FtleFieldOptions): Promise<FtleResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'ftle',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<FtleResponse>(request);
  }

  /** One parameter-study point: maximal λ (+SE), RQA DET/DIV, and per-point FTLE in a single job. */
  studyPoint(
    spec: SystemSpec,
    state0: ArrayLike<number>,
    settings?: StudyPointJobSettings
  ): Promise<StudyPointResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'studyPoint',
      spec,
      state0: Array.from(state0),
      ...(settings ? { settings } : {})
    };
    return this.run<StudyPointResponse>(request);
  }

  /** Multi-resolution Wada convergence analysis on the flip basin. */
  wadaConvergence(
    spec: Extract<SystemSpec, { kind: 'double' }>,
    settings?: WadaConvergenceOptions
  ): Promise<WadaConvergenceResponse> {
    const request: ChaosRequest = {
      id: nextId(),
      kind: 'wadaConvergence',
      spec,
      ...(settings ? { settings } : {})
    };
    return this.run<WadaConvergenceResponse>(request);
  }

  /** Two-parameter (drive amplitude × damping) λ-sign regime diagram. */
  codimTwo(
    base: Extract<SystemSpec, { kind: 'driven' }>,
    state0: ArrayLike<number>,
    xRange: [number, number],
    yRange: [number, number],
    settings?: CodimTwoOptions
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
    return this.run<CodimTwoResponse>(request);
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.started = false;
  }
}
