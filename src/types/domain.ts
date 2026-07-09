export type SystemType = 'double' | 'triple' | 'chain' | 'spherical' | 'spherical-chain' | 'rope' | 'spring' | 'driven' | 'double-string';
export type RunMode = 'demo' | 'education' | 'research' | 'benchmark' | 'performance' | 'recovery';
export type IntegratorId =
  | 'euler'
  | 'rk2'
  | 'rk4'
  | 'verlet'
  | 'leapfrog'
  | 'symplectic'
  | 'yoshida4'
  | 'hmidpoint'
  | 'gauss2'
  | 'rkf45'
  | 'dopri5'
  | 'dop853'
  | 'gbs'
  | 'bdf2';

export interface PendulumParameters {
  m1: number;
  m2: number;
  m3?: number;
  l1: number;
  l2: number;
  l3?: number;
  g: number;
}

export interface EnergyBreakdown {
  total: number;
  KE: number;
  PE: number;
}

export interface RuntimeSnapshot {
  schemaVersion: string;
  systemType: SystemType;
  method: IntegratorId;
  mode: RunMode;
  dt: number;
  tolerance: number;
  stepsPerFrame: number;
  damping: number;
  parameters: PendulumParameters;
  state: number[];
  simTime: number;
  seed: number | null;
  hash: string;
}

export interface ImportValidationResult<T> {
  ok: boolean;
  value?: T;
  problems: string[];
}

export interface BenchmarkMetrics {
  label: string;
  url: string;
  fps: number | null;
  physicsMsPerFrame: number | null;
  memoryBytes: number | null;
  workerLatencyMs: number | null;
}
