import type { LearnUnit } from '../learn/schema';
import type { ExperimentStateV1 } from '../contracts/experiment';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarSimulation,
  type PlanarConfig
} from '../adapters/physics/planar';
import {
  defaultChainConfig,
  toCanonicalChain,
  createChainSimulation,
  type ChainConfig
} from '../adapters/physics/chain';
import {
  defaultConstraintConfig,
  toCanonicalConstraint,
  createConstraintSimulation,
  type ConstraintConfig
} from '../adapters/physics/constraint';
import {
  defaultSpatialConfig,
  toCanonicalSpatial,
  createSpatialSimulation,
  withSpatialAngles,
  type SpatialConfig
} from '../adapters/physics/spatial';
import { readDiagnosticConfiguration } from '../adapters/analysis/core/source-config';
import { serializeExperiment } from '../persistence/serialization';
import { extendedFocusDeclaration } from './extended-definitions';
import type { ContractResult } from '../contracts/validation';
import { inspectSafeData } from '../persistence/safe-data';

export type ExtendedFields = Readonly<Record<string, number>>;
export type ExtendedConfig =
  | { family: 'planar'; config: PlanarConfig }
  | { family: 'chain'; config: ChainConfig }
  | { family: 'constraint'; config: ConstraintConfig }
  | { family: 'spatial'; config: SpatialConfig };
export const unwrapExtended = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join(' '));
  return result.value;
};
export const extendedPresetFields = (unitId: string): ExtendedFields =>
  Object.fromEntries(extendedFocusDeclaration(unitId).fields.map((f) => [f.id, f.value]));
export function validateExtendedFields(unitId: string, input: ExtendedFields): ExtendedFields {
  input = unwrapExtended(inspectSafeData(input)) as ExtendedFields;
  const d = extendedFocusDeclaration(unitId);
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(',') !==
      d.fields
        .map((f) => f.id)
        .sort()
        .join(',')
  )
    throw new Error('단원의 모든 설정을 한 번씩 입력하세요.');
  for (const f of d.fields) {
    const v = input[f.id];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < f.min ||
      v > f.max ||
      (f.id === 'links' && !Number.isInteger(v))
    )
      throw new Error(`${f.label}: ${f.min}–${f.max} ${f.unit} 범위${f.id === 'links' ? '의 정수' : ''}를 입력하세요.`);
    if (!d.exposed.includes(f.id) && v !== f.value) throw new Error(`단원에서 고정한 ${f.id} 값을 유지하세요.`);
  }
  if (Math.ceil(input.duration! / input.step!) > 20000 || input.duration! < input.step!)
    throw new Error('전용 실험은 최대 20,000단계이며 시간 간격은 관찰 시간 이하여야 합니다.');
  return Object.fromEntries(d.fields.map((f) => [f.id, input[f.id]!]));
}
/** Every physical input is mapped to the same native adapter used in the full Lab. */
export function extendedConfig(unitId: string, input: ExtendedFields): ExtendedConfig {
  const v = validateExtendedFields(unitId, input),
    d = extendedFocusDeclaration(unitId);
  const common = {
    step: v.step!,
    duration: v.duration!,
    startTime: 0,
    sampleEvery: 1,
    analyses: [{ id: 'analysis:energy' as const, algorithmVersion: '1', settings: {} }]
  };
  if (d.systemId === 'system:double' || d.systemId === 'system:compound-double')
    return {
      family: 'planar',
      config: {
        ...defaultPlanarConfig(d.systemId),
        ...common,
        parameters: { m1: v.m1!, m2: v.m2!, l1: v.l1!, l2: v.l2!, g: v.g! },
        gamma: v.gamma!,
        initialState: [v.theta1!, v.theta2!, v.omega1!, v.omega2!],
        integratorId: d.integratorId as PlanarConfig['integratorId']
      }
    };
  if (d.systemId === 'system:triple' || d.systemId === 'system:chain') {
    const n = v.links!,
      c = defaultChainConfig(d.systemId, n);
    return {
      family: 'chain',
      config: {
        ...c,
        ...common,
        parameters: { masses: Array<number>(n).fill(v.mass!), lengths: Array<number>(n).fill(v.length!), g: v.g! },
        gamma: v.gamma!,
        initialState: [
          ...Array.from({ length: n }, (_, i) => (v.theta! * (n - i)) / n),
          v.omega!,
          ...Array<number>(n - 1).fill(0)
        ]
      }
    };
  }
  if (d.systemId === 'system:spring' || d.systemId === 'system:rope' || d.systemId === 'system:double-string') {
    const c = defaultConstraintConfig(d.systemId);
    return {
      family: 'constraint',
      config: {
        ...c,
        ...common,
        parameters:
          d.systemId === 'system:spring'
            ? { mass: v.mass!, stiffness: v.stiffness!, restLength: v.restLength!, g: v.g! }
            : d.systemId === 'system:rope'
              ? { mass: v.mass!, length: v.length!, g: v.g!, damping: v.damping! }
              : { m1: v.m1!, m2: v.m2!, l1: v.l1!, l2: v.l2!, g: v.g!, damping: v.damping! },
        initialState:
          d.systemId === 'system:spring'
            ? [v.r!, v.theta!, v.rDot!, v.omega!]
            : d.systemId === 'system:rope'
              ? [v.theta!, v.omega!]
              : [v.theta1!, v.theta2!, v.omega1!, v.omega2!]
      }
    };
  }
  if (
    d.systemId === 'system:spherical' ||
    d.systemId === 'system:spherical-chain' ||
    d.systemId === 'system:spherical-embedded'
  ) {
    const n = v.links!,
      c = defaultSpatialConfig(d.systemId, n);
    const angles = [
      ...Array.from({ length: n }, (_, i) => [
        i === 0 ? v.theta1! : 0.6 - (0.2 * i) / n,
        i === 0 ? v.phi1! : 0.35 * i
      ]).flat(),
      ...Array.from({ length: n }, (_, i) => [
        i === 0 ? v.thetaDot1! : 0,
        i === 0 ? v.phiDot1! : 1.2 - (0.2 * i) / n
      ]).flat()
    ];
    return {
      family: 'spatial',
      config: withSpatialAngles(
        {
          ...c,
          ...common,
          analyses: [],
          parameters: {
            masses: Array<number>(n).fill(v.mass!),
            lengths: Array<number>(n).fill(v.length!),
            g: v.g!,
            damping: v.damping!
          }
        },
        angles
      )
    };
  }
  throw new Error('지원하지 않는 S25 실험입니다.');
}
export function extendedNativeCanonical(source: ExtendedConfig): ExperimentStateV1 {
  switch (source.family) {
    case 'planar':
      return unwrapExtended(toCanonicalPlanar(source.config));
    case 'chain':
      return unwrapExtended(toCanonicalChain(source.config));
    case 'constraint':
      return unwrapExtended(toCanonicalConstraint(source.config));
    case 'spatial':
      return unwrapExtended(toCanonicalSpatial(source.config));
  }
}
export function extendedSimulation(source: ExtendedConfig) {
  switch (source.family) {
    case 'planar':
      return createPlanarSimulation(source.config);
    case 'chain':
      return createChainSimulation(source.config);
    case 'constraint':
      return createConstraintSimulation(source.config);
    case 'spatial':
      return createSpatialSimulation(source.config);
  }
}
export function extendedCanonical(
  unit: Pick<LearnUnit, 'id' | 'courseId' | 'contentVersion'>,
  fields: ExtendedFields
): ExperimentStateV1 {
  const value = extendedNativeCanonical(extendedConfig(unit.id, fields));
  return {
    ...value,
    provenance: {
      createdByVersion: 'product-focus-v2',
      source: { kind: 'derived', id: `learn:${unit.courseId}:${unit.id}:v${unit.contentVersion}` },
      parentExperimentIds: []
    }
  };
}
/** Restore only the declared bounded restart fields; native parsers reject unsupported versions/options. */
export function validateExtendedCanonical(
  unit: Pick<LearnUnit, 'id' | 'courseId' | 'contentVersion'>,
  fields: ExtendedFields,
  input: ExperimentStateV1
): void {
  readDiagnosticConfiguration(input);
  const a = unwrapExtended(serializeExperiment(extendedCanonical(unit, fields))),
    b = unwrapExtended(serializeExperiment(input));
  if (a !== b) throw new Error('저장된 실험의 출처·단위·시스템·고정 조건이 이 단원과 다릅니다.');
}
