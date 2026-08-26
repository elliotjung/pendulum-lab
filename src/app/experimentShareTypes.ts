import type { IntegratorId } from '../types/domain';

type Parameters = { m1: number; m2: number; m3: number; l1: number; l2: number; l3: number; g: number };
type Initial = { theta: [number, number, number]; omega: [number, number, number] };
type SharedLabSystem = 'double' | 'compound-double' | 'triple';
export type SharedTimingMode = 'deterministic' | 'wall-clock';
export type SharedQualityMode = 'performance' | 'balanced' | 'cinematic';
export type SharedTrailMode = 'rainbow' | 'heat' | 'ice' | 'plasma' | 'white' | 'green';
export type SharedPhaseAxis = '1' | '2' | 'both';

/** Legacy URL payload. Decode remains supported and migrates it to V3. */
// prettier-ignore
export interface SharedExperimentV1 { v: 1; system: 'double' | 'triple'; method: IntegratorId; dt: number; damping: number; toleranceExponent: number; parameters: Parameters; initial: Initial; tab: string }
// Null execution values mean a migrated payload omitted the setting; restore leaves its control unchanged.
// prettier-ignore
export interface SharedExperimentV2 { v: 2; scope: { kind: 'setup-only'; includesResults: false; omittedUnsafeControls: ['audioOn', 'backgroundSim'] }; provenance: { packageName: string; packageVersion: string; physicsVersion: string; physicsSchema: 'pendulum-session/v10-ts'; sourceCommit: string | null; parameterHash: { algorithm: 'fnv1a32-canonical-json'; value: string } }; physics: { system: 'double' | 'triple'; method: IntegratorId; dt: number; damping: number; toleranceExponent: number; parameters: Parameters; initial: Initial }; execution: { seed: number | null; timingMode: SharedTimingMode | null; speed: number | null; stepsPerFrame: number | null; ensemble: { count: number; epsilonExponent: number } | null }; render: { trailMode: SharedTrailMode; trailLength: number; phaseAxis: SharedPhaseAxis; qualityMode: SharedQualityMode; glow: boolean; longExposure: boolean; interpolate: boolean; autoQuality: boolean } | null; tab: string }
// V3 is the first share schema that can identify the compound/uniform-rod model.
// prettier-ignore
export interface SharedExperimentV3 extends Omit<SharedExperimentV2, 'v' | 'provenance' | 'physics'> { v: 3; provenance: Omit<SharedExperimentV2['provenance'], 'physicsSchema'> & { physicsSchema: 'pendulum-session/v11-ts' }; physics: Omit<SharedExperimentV2['physics'], 'system'> & { system: SharedLabSystem } }
export type SharedExperimentPayload = SharedExperimentV1 | SharedExperimentV2 | SharedExperimentV3;
// prettier-ignore
export interface SharedExperimentDiagnostic { severity: 'info' | 'warning' | 'error'; code: string; message: string; fields?: string[] }
// prettier-ignore
export interface SharedExperimentDecodeResult { ok: boolean; payload: SharedExperimentV3 | null; diagnostics: SharedExperimentDiagnostic[] }
// prettier-ignore
export interface SharedExperimentRestoreResult { ok: boolean; appliedControlIds: string[]; changedControlIds: string[]; skippedControlIds: string[]; diagnostics: SharedExperimentDiagnostic[] }
// prettier-ignore
export interface SharedExperimentUrlDiagnostics { status: 'portable' | 'warning' | 'rejected'; length: number; warningLength: number; maximumLength: number; diagnostics: SharedExperimentDiagnostic[] }

// prettier-ignore
export const SHARED_EXPERIMENT_TABS = ['lab', 'compare', 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'expansion', 'matrix', 'validate', 'golden', 'zeroone', 'clv', 'basin', 'rqa', 'ftle', 'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs', 'theory'] as const;
