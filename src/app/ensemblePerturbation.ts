import type { SystemType } from '../types/domain';

export const PERTURBATION_VARIABLES = ['th1', 'th2', 'th3', 'iw1', 'iw2', 'iw3'] as const;
export type PerturbationVariable = (typeof PERTURBATION_VARIABLES)[number];

export const PERTURBATION_PATTERNS = ['alternating', 'symmetric', 'random', 'normalized'] as const;
export type PerturbationPattern = (typeof PERTURBATION_PATTERNS)[number];

export interface EnsemblePerturbationSpec {
  variable: PerturbationVariable;
  pattern: PerturbationPattern;
  epsilon: number;
  seed: number;
}

export interface PerturbedStateSet {
  members: Float64Array[];
  /** Exact first-member displacement from the reference state. */
  firstDelta: Float64Array | null;
}

export function normalizePerturbationVariable(value: unknown): PerturbationVariable {
  return typeof value === 'string' && PERTURBATION_VARIABLES.includes(value as PerturbationVariable)
    ? (value as PerturbationVariable)
    : 'th1';
}

/** Normalize a coordinate against the state vector actually owned by the selected model. */
export function normalizePerturbationVariableForSystem(value: unknown, system: SystemType): PerturbationVariable {
  const normalized = normalizePerturbationVariable(value);
  return stateIndexForPerturbation(normalized, system) === null ? 'th1' : normalized;
}

export function normalizePerturbationPattern(value: unknown): PerturbationPattern {
  return typeof value === 'string' && PERTURBATION_PATTERNS.includes(value as PerturbationPattern)
    ? (value as PerturbationPattern)
    : 'alternating';
}

export function stateIndexForPerturbation(variable: PerturbationVariable, system: SystemType): number | null {
  const triple = system === 'triple';
  switch (variable) {
    case 'th1':
      return 0;
    case 'th2':
      return 1;
    case 'th3':
      return triple ? 2 : null;
    case 'iw1':
      return triple ? 3 : 2;
    case 'iw2':
      return triple ? 4 : 3;
    case 'iw3':
      return triple ? 5 : null;
  }
}

function randomUnit(seed: number): () => number {
  let state = (seed >>> 0) ^ 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function copyInitial(initial: ArrayLike<number>, dimension: number): Float64Array {
  const state = new Float64Array(dimension);
  for (let index = 0; index < dimension; index += 1) state[index] = initial[index] ?? 0;
  return state;
}

function symmetricScale(index: number): number {
  return (Math.floor(index / 2) + 1) * (index % 2 === 0 ? 1 : -1);
}

function normalizedDirection(dimension: number, rng: () => number, anchor: number): Float64Array {
  // This is deliberately a canonical-coordinate Euclidean direction. It mixes
  // angle (rad) and angular-velocity (rad/s) coordinates and therefore is not
  // a nondimensionalized or unit-invariant physical metric; the Lab surfaces
  // that caveat anywhere this selectable pattern is described.
  const direction = new Float64Array(dimension);
  let norm2 = 0;
  for (let index = 0; index < dimension; index += 1) {
    const value = 2 * rng() - 1;
    direction[index] = value;
    norm2 += value * value;
  }
  if (!(norm2 > Number.EPSILON)) {
    direction.fill(0);
    direction[anchor] = 1;
    return direction;
  }
  const inverse = 1 / Math.sqrt(norm2);
  for (let index = 0; index < dimension; index += 1) direction[index] = direction[index]! * inverse;
  // The selected variable anchors the orientation so the readout has a stable
  // sign even though the normalized pattern perturbs the complete state.
  if (direction[anchor]! < 0)
    for (let index = 0; index < dimension; index += 1) direction[index] = direction[index]! * -1;
  return direction;
}

/** Build deterministic nearby states from an explicit, exportable rule. */
export function buildPerturbedStates(
  initial: ArrayLike<number>,
  dimension: number,
  requested: number,
  cap: number,
  system: SystemType,
  spec: EnsemblePerturbationSpec
): PerturbedStateSet {
  const count = Math.max(0, Math.min(Math.max(0, Math.round(cap)), Math.round(requested)));
  const epsilon = Number.isFinite(spec.epsilon) && spec.epsilon > 0 ? spec.epsilon : 1e-4;
  const variableIndex = stateIndexForPerturbation(spec.variable, system);
  if (variableIndex === null)
    throw new RangeError(`Perturbation variable ${spec.variable} is unavailable for ${system}.`);
  const rng = randomUnit(spec.seed);
  const members: Float64Array[] = [];

  for (let memberIndex = 0; memberIndex < count; memberIndex += 1) {
    const state = copyInitial(initial, dimension);
    if (spec.pattern === 'normalized') {
      const direction = normalizedDirection(dimension, rng, variableIndex);
      for (let index = 0; index < dimension; index += 1) state[index] = state[index]! + epsilon * direction[index]!;
    } else {
      const scale =
        spec.pattern === 'alternating'
          ? (memberIndex + 1) * (memberIndex % 2 === 0 ? 1 : -1)
          : spec.pattern === 'symmetric'
            ? symmetricScale(memberIndex)
            : 2 * rng() - 1;
      state[variableIndex] = state[variableIndex]! + epsilon * scale;
    }
    members.push(state);
  }

  const first = members[0];
  const firstDelta = first ? new Float64Array(dimension) : null;
  if (first && firstDelta) {
    for (let index = 0; index < dimension; index += 1) firstDelta[index] = first[index]! - (initial[index] ?? 0);
  }
  return { members, firstDelta };
}

export function perturbationVariableLabel(variable: PerturbationVariable): string {
  return ({ th1: 'θ₁', th2: 'θ₂', th3: 'θ₃', iw1: 'ω₁', iw2: 'ω₂', iw3: 'ω₃' } as const)[variable];
}
