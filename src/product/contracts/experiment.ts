import type { QuantityMap, SourceUnit } from './quantities';

/** Adapter-defined enum tokens and flags, not arbitrary text or executable expressions. */
export type OptionMap = Readonly<Record<string, string | boolean>>;

export const EXPERIMENT_SCHEMA = 'pendulum-experiment/v1' as const;

/** Configuration only: no engine objects, functions, execution buffers, or UI layout. */
export interface ExperimentStateV1 {
  readonly schema: typeof EXPERIMENT_SCHEMA;
  readonly systemId: `system:${string}`;
  readonly modelVersion: string;
  readonly parameters: QuantityMap;
  readonly initialConditions: QuantityMap;
  readonly modelOptions?: OptionMap;
  /** S15 network-model-v1 identity/order metadata; numerical properties stay in quantity vectors. */
  readonly topology?: NetworkTopologyV1;
  readonly integrator: IntegratorState;
  readonly runtime: RuntimeState;
  readonly analyses: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}

/** Undirected simple graph. Vector order follows nodes; ringOrder is independent of array storage order. */
export interface NetworkTopologyV1 {
  readonly schema: 'pendulum-network-topology/v1';
  readonly nodes: readonly string[];
  readonly edges: readonly { readonly id: string; readonly source: string; readonly target: string }[];
  readonly ringOrder?: readonly string[];
}

/** Internal stepping remains system-owned; maps and quantum kicks never impersonate ODE methods. */
export type IntegratorState =
  | {
      readonly kind: 'selectable';
      readonly id: `integrator:${string}`;
      readonly version: string;
      readonly settings: QuantityMap;
      readonly options?: OptionMap;
    }
  | {
      readonly kind: 'internal';
      readonly version: string;
      readonly settings: QuantityMap;
      readonly options?: OptionMap;
    };

export type RuntimeState =
  | {
      readonly domain: 'time';
      readonly start: { readonly value: number; readonly unit: 's' };
      readonly duration: { readonly value: number; readonly unit: 's' };
      readonly step: { readonly value: number; readonly unit: 's' };
      readonly sampleEvery: number;
    }
  | { readonly domain: 'iteration'; readonly start: number; readonly iterations: number; readonly sampleEvery: number }
  | { readonly domain: 'evaluation' };

/** Requested analysis configuration; available input data must still be checked by a future adapter. */
export interface AnalysisState {
  readonly id: `analysis:${string}`;
  readonly algorithmVersion: string;
  readonly settings: QuantityMap;
  readonly options?: OptionMap;
}

export interface SeedState {
  readonly value: string;
  readonly generator: string;
  readonly generatorVersion: string;
}

/** Opaque public identifiers only. Never put file paths, URLs, user names, or access tokens here. */
export interface ExperimentProvenance {
  readonly createdByVersion: string;
  readonly source: { readonly kind: 'manual' | 'preset' | 'import' | 'derived'; readonly id?: string };
  readonly parentExperimentIds: readonly string[];
  /** Original input units, keyed by parameters.<name> or initialConditions.<name>. Values stay SI. */
  readonly sourceUnits?: Readonly<Record<string, SourceUnit>>;
}

/** Independently persisted output lineage; stores references, never raw analysis data. */
export interface AnalysisArtifactProvenanceV1 {
  readonly schema: 'pendulum-analysis-provenance/v1';
  readonly artifactId: string;
  readonly inputRunId: string;
  readonly analysis: AnalysisState;
  readonly createdAt: string;
}
