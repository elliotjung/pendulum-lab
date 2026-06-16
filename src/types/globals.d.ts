import type { EnergyBreakdown, IntegratorId, PendulumParameters, RunMode, SystemType } from './domain';

export {};

declare global {
  interface Window {
    /**
     * @deprecated Compatibility accessor for older scripts/tests. Prefer
     * `window.PendulumLab` for public scripting or `PendulumLabDebug.runtime`
     * for internal diagnostics.
     */
    App?: PendulumLegacyApp;
    /** @deprecated Compatibility accessor; prefer the public `PendulumLab.physics` surface. */
    Physics?: PendulumLegacyPhysics;
    /** @deprecated Read-only accessor backed by `PendulumLabLegacyRuntime`. */
    Validation?: PendulumLegacyValidation;
    /** @deprecated Read-only accessor backed by `PendulumLabLegacyRuntime`. */
    WorkerMgr?: PendulumLegacyWorkerManager;
    /** Deprecated compatibility namespace retained for old archived scripts. */
    PendulumLabLegacyRuntime?: {
      readonly App?: PendulumLegacyApp;
      readonly Physics?: PendulumLegacyPhysics;
      readonly NaNGuard?: unknown;
      readonly CanvasMgr?: unknown;
      readonly UI?: Record<string, HTMLElement>;
    };
    /**
     * @deprecated Alias for `PendulumLabDebug.runtime`; resolve services from
     * the debug namespace instead.
     */
    PendulumRuntime?: PendulumRuntimeSurface;
    /** Public, stable scripting API (version, commands, events, state, physics, research). */
    PendulumLab?: Readonly<Record<string, unknown>>;
    /** Internal/unstable debug surface (DI runtime, modern lab handle, audit tooling). */
    PendulumLabDebug?: Readonly<Record<string, unknown>>;
    /** @deprecated Alias for `PendulumLab`. */
    PendulumLabIndex?: unknown;
    toast?: (message: string, timeoutMs?: number) => void;
    hashState?: (state: Float64Array | number[]) => string;
  }

  var App: PendulumLegacyApp | undefined;
  var Physics: PendulumLegacyPhysics | undefined;
  var Validation: PendulumLegacyValidation | undefined;
  var WorkerMgr: PendulumLegacyWorkerManager | undefined;
}

/** Structural shape of the frozen `window.PendulumRuntime` surface. */
export interface PendulumRuntimeSurface {
  readonly version: string;
  resolve(token: string): unknown;
  tryResolve(token: string): unknown;
  has(token: string): boolean;
  describe(): { version: string; services: string[]; legacyAdopted: boolean };
}

export interface PendulumLegacyApp {
  P: PendulumParameters;
  gamma: number;
  sysType: SystemType;
  method: IntegratorId;
  runMode?: RunMode;
  DT: number;
  tol: number;
  SPF: number;
  speedMult?: number;
  state: Float64Array;
  prevState?: Float64Array;
  stateLen: number;
  paused: boolean;
  simTime: number;
  seed?: number;
  fps?: number;
  physMs?: number;
  renderMs?: number;
  workerReady?: boolean;
  workerLatency?: number;
  activeTab?: string;
  _stateHash?: string;
  [key: string]: unknown;
}

export interface PendulumLegacyPhysics {
  rhs2(state: Float64Array | number[], parameters: PendulumParameters, gamma: number, out: Float64Array): Float64Array;
  rhs3(state: Float64Array | number[], parameters: Required<PendulumParameters>, gamma: number, out: Float64Array): Float64Array;
  energy2(state: Float64Array | number[], parameters: PendulumParameters): EnergyBreakdown;
  energy3(state: Float64Array | number[], parameters: Required<PendulumParameters>): EnergyBreakdown;
  step(method: IntegratorId, state: Float64Array, dt: number, rhs: (s: Float64Array, out: Float64Array) => void, n: number, out: Float64Array, options?: { tolerance?: number }): unknown;
  rk4step(state: Float64Array, dt: number, rhs: (s: Float64Array, out: Float64Array) => void, n: number, out: Float64Array): Float64Array;
}

export interface PendulumLegacyValidation {
  runAll(): unknown;
}

export interface PendulumLegacyWorkerManager {
  post(message: unknown, transfer?: Transferable[]): void;
  on(type: string, handler: (message: unknown) => void): void;
  cancel?(taskId: number): void;
  isPending?(): boolean;
}
