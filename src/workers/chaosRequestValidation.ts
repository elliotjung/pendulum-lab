import type { SystemSpec } from '../physics/systemSpec';
import { NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

const MAX_STATE_DIMENSION = 128;
const MAX_STATE_MAGNITUDE = 1e9;
const MAX_PARAMETER_MAGNITUDE = 1e12;
const MIN_POSITIVE_PARAMETER = 1e-12;

type DataRecord = Record<string, unknown>;

function record(value: unknown, label: string): DataRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value as DataRecord;
}

function finite(value: unknown, label: string, minimum = -MAX_PARAMETER_MAGNITUDE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > MAX_PARAMETER_MAGNITUDE) {
    throw new RangeError(`${label} is outside the finite safety range`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  return finite(value, label, MIN_POSITIVE_PARAMETER);
}

function finiteArray(value: unknown, label: string, maximumLength: number): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumLength) {
    throw new RangeError(`${label} must contain 1..${maximumLength} values`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new RangeError(`${label}[${index}] is missing`);
    finite(value[index], `${label}[${index}]`);
  }
  return value as number[];
}

function finiteRange(value: unknown, label: string, minimum = -MAX_PARAMETER_MAGNITUDE): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !Object.hasOwn(value, 0) || !Object.hasOwn(value, 1)) {
    throw new RangeError(`${label} must contain exactly two values`);
  }
  const lo = finite(value[0], `${label}[0]`, minimum);
  const hi = finite(value[1], `${label}[1]`, minimum);
  if (lo >= hi) throw new RangeError(`${label} must be strictly increasing`);
  return [lo, hi];
}

function validateSystemSpec(value: unknown, label: string): { spec: SystemSpec; dimension: number } {
  const spec = record(value, label);
  if (typeof spec.kind !== 'string') throw new TypeError(`${label}.kind must be a string`);
  switch (spec.kind) {
    case 'double':
      positive(spec.m1, `${label}.m1`);
      positive(spec.m2, `${label}.m2`);
      positive(spec.l1, `${label}.l1`);
      positive(spec.l2, `${label}.l2`);
      finite(spec.g, `${label}.g`, 0);
      return { spec: spec as unknown as Extract<SystemSpec, { kind: 'double' }>, dimension: 4 };
    case 'triple':
      positive(spec.m1, `${label}.m1`);
      positive(spec.m2, `${label}.m2`);
      positive(spec.m3, `${label}.m3`);
      positive(spec.l1, `${label}.l1`);
      positive(spec.l2, `${label}.l2`);
      positive(spec.l3, `${label}.l3`);
      finite(spec.g, `${label}.g`, 0);
      return { spec: spec as unknown as Extract<SystemSpec, { kind: 'triple' }>, dimension: 6 };
    case 'chain':
    case 'spherical-chain': {
      const maxLinks = spec.kind === 'chain' ? MAX_STATE_DIMENSION / 2 : MAX_STATE_DIMENSION / 4;
      const masses = finiteArray(spec.masses, `${label}.masses`, maxLinks);
      const lengths = finiteArray(spec.lengths, `${label}.lengths`, maxLinks);
      if (masses.length !== lengths.length) throw new RangeError(`${label} masses and lengths must have equal length`);
      masses.forEach((entry, index) => positive(entry, `${label}.masses[${index}]`));
      lengths.forEach((entry, index) => positive(entry, `${label}.lengths[${index}]`));
      finite(spec.g, `${label}.g`, 0);
      if (spec.kind === 'spherical-chain') finite(spec.damping, `${label}.damping`, 0);
      const multiplier = spec.kind === 'chain' ? 2 : 4;
      return { spec: spec as unknown as SystemSpec, dimension: masses.length * multiplier };
    }
    case 'driven':
      finite(spec.g, `${label}.g`, 0);
      positive(spec.length, `${label}.length`);
      finite(spec.damping, `${label}.damping`, 0);
      finite(spec.driveAmplitude, `${label}.driveAmplitude`);
      finite(spec.driveFrequency, `${label}.driveFrequency`, 0);
      return { spec: spec as unknown as Extract<SystemSpec, { kind: 'driven' }>, dimension: 3 };
    case 'spring':
      positive(spec.mass, `${label}.mass`);
      finite(spec.stiffness, `${label}.stiffness`, 0);
      positive(spec.restLength, `${label}.restLength`);
      finite(spec.g, `${label}.g`, 0);
      return { spec: spec as unknown as Extract<SystemSpec, { kind: 'spring' }>, dimension: 4 };
    case 'double-string':
      positive(spec.m1, `${label}.m1`);
      positive(spec.m2, `${label}.m2`);
      positive(spec.l1, `${label}.l1`);
      positive(spec.l2, `${label}.l2`);
      finite(spec.g, `${label}.g`, 0);
      finite(spec.damping, `${label}.damping`, 0);
      return { spec: spec as unknown as Extract<SystemSpec, { kind: 'double-string' }>, dimension: 4 };
    default:
      throw new TypeError(`${label}.kind is unsupported`);
  }
}

function validateState(value: unknown, dimension: number, label: string): void {
  if (!Array.isArray(value) || value.length !== dimension) {
    throw new RangeError(`${label} must contain exactly ${dimension} values`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new RangeError(`${label}[${index}] is missing`);
    const entry = value[index];
    if (typeof entry !== 'number' || !Number.isFinite(entry) || Math.abs(entry) > MAX_STATE_MAGNITUDE) {
      throw new RangeError(`${label}[${index}] is outside the finite safety range`);
    }
  }
}

/** Validate data-only request shape before constructing RHS closures or large arrays. */
export function validateChaosRequestPayload(value: unknown): void {
  const request = record(value, 'chaos request');
  const kind = request.kind;
  if (typeof kind !== 'string') throw new TypeError('chaos request kind must be a string');
  if (
    ![
      'lyapunov',
      'bifurcation',
      'lyapunovSpectrum',
      'zeroOne',
      'clv',
      'basin',
      'rqa',
      'ftle',
      'studyPoint',
      'wadaConvergence',
      'codim2'
    ].includes(kind)
  ) {
    return;
  }
  if (kind === 'bifurcation' || kind === 'codim2') {
    const { dimension, spec } = validateSystemSpec(request.base, 'chaos request base');
    if (spec.kind !== 'driven') throw new TypeError(`${kind} requires a driven base specification`);
    validateState(request.state0, dimension, 'chaos request state0');
    if (kind === 'bifurcation') {
      const amplitudes = finiteArray(
        request.amplitudes,
        'chaos request amplitudes',
        NUMERICAL_WORK_BUDGETS.bifurcation.maxParameters
      );
      amplitudes.forEach((entry, index) => finite(entry, `chaos request amplitudes[${index}]`));
    } else {
      finiteRange(request.xRange, 'chaos request xRange');
      finiteRange(request.yRange, 'chaos request yRange', 0);
    }
    return;
  }

  const { dimension, spec } = validateSystemSpec(request.spec, 'chaos request spec');
  if (kind === 'basin' || kind === 'ftle' || kind === 'wadaConvergence') {
    if (spec.kind !== 'double') throw new TypeError(`${kind} requires a double-pendulum specification`);
    return;
  }
  if (
    kind === 'lyapunov' ||
    kind === 'lyapunovSpectrum' ||
    kind === 'zeroOne' ||
    kind === 'clv' ||
    kind === 'rqa' ||
    kind === 'studyPoint'
  ) {
    validateState(request.state0, dimension, 'chaos request state0');
  }
}
