import type { StateVector } from './types';

export type ComponentTolerance = number | ArrayLike<number>;
export type StepControllerKind = 'basic' | 'pi';

export interface StepControllerCoefficients {
  kI: number;
  kP: number;
  kD?: number;
}

export interface AdaptiveControllerOptions {
  absTol?: ComponentTolerance;
  relTol?: ComponentTolerance;
  minDt?: number;
  maxDt?: number;
  safety?: number;
  /** Embedded method order used for the error exponent (default 5). */
  order?: number;
  /** Memoryless basic controller or Gustafsson-style PI controller. */
  controller?: StepControllerKind;
  controllerCoefficients?: StepControllerCoefficients;
  minFactor?: number;
  maxFactor?: number;
  maxIterations?: number;
}

export interface StepController {
  factor(errorNorm: number, accepted: boolean): number;
  reset(): void;
}

export interface ResolvedAdaptiveOptions {
  absTol: ComponentTolerance;
  relTol: ComponentTolerance;
  minDt: number;
  maxDt: number;
  safety: number;
  order: number;
  minFactor: number;
  maxFactor: number;
  maxIterations: number;
}

const PI42: StepControllerCoefficients = { kI: 0.7, kP: 0.4 };

export function createStepController(
  options: {
    kind?: StepControllerKind;
    order?: number;
    safety?: number;
    minFactor?: number;
    maxFactor?: number;
    coefficients?: StepControllerCoefficients;
  } = {}
): StepController {
  const order = options.order ?? 5;
  const safety = options.safety ?? 0.9;
  const minFactor = options.minFactor ?? 0.2;
  const maxFactor = options.maxFactor ?? 5;
  const kind = options.kind ?? 'basic';
  const co = options.coefficients ?? (kind === 'pi' ? PI42 : { kI: 1, kP: 0 });
  if (!Number.isFinite(order) || !(order > 0))
    throw new RangeError('createStepController: order must be positive and finite.');
  if (!Number.isFinite(safety) || !(safety > 0 && safety <= 1)) {
    throw new RangeError('createStepController: safety must be finite and in (0, 1].');
  }
  if (!Number.isFinite(minFactor) || !(minFactor > 0 && minFactor <= 1)) {
    throw new RangeError('createStepController: minFactor must be finite and in (0, 1].');
  }
  if (!Number.isFinite(maxFactor) || !(maxFactor >= 1) || maxFactor < minFactor) {
    throw new RangeError('createStepController: maxFactor must be finite, >= 1, and >= minFactor.');
  }
  if (![co.kI, co.kP, co.kD ?? 0].every((value) => Number.isFinite(value) && value >= 0) || !(co.kI > 0)) {
    throw new RangeError('createStepController: controller coefficients must be finite/non-negative with kI > 0.');
  }
  const errorFloor = 1e-12;
  let previous = 1;
  let previous2 = 1;
  return {
    factor(errorNorm: number, accepted: boolean): number {
      if (!Number.isFinite(errorNorm) || errorNorm < 0) return minFactor;
      const error = Math.max(errorNorm, errorFloor);
      let raw =
        errorNorm === 0
          ? maxFactor
          : safety * error ** (-co.kI / order) * previous ** (co.kP / order) * previous2 ** (-(co.kD ?? 0) / order);
      if (!accepted) raw = Math.min(raw, 1);
      if (accepted) {
        previous2 = previous;
        previous = error;
      }
      return Math.min(maxFactor, Math.max(minFactor, raw));
    },
    reset(): void {
      previous = 1;
      previous2 = 1;
    }
  };
}

export function validateEmbeddedStepInput(state: StateVector, dt: number, caller: string): void {
  if (!Number.isSafeInteger(state.length) || state.length < 1) {
    throw new RangeError(`${caller}: state must contain at least one component.`);
  }
  for (let i = 0; i < state.length; i += 1) {
    if (!Number.isFinite(state[i])) throw new RangeError(`${caller}: state components must be finite.`);
  }
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError(`${caller}: dt must be positive and finite.`);
}

function toleranceAt(tolerance: ComponentTolerance, index: number, dimension: number, label: string): number {
  if (typeof tolerance === 'number') return tolerance;
  if (!Number.isSafeInteger(tolerance.length) || tolerance.length !== dimension) {
    throw new RangeError(`${label} must be a scalar or contain exactly ${dimension} components.`);
  }
  return Number(tolerance[index]);
}

export function resolveAdaptiveOptions(
  options: AdaptiveControllerOptions,
  dimension: number,
  caller: string
): ResolvedAdaptiveOptions {
  const resolved: ResolvedAdaptiveOptions = {
    absTol: options.absTol ?? 1e-8,
    relTol: options.relTol ?? 1e-6,
    minDt: options.minDt ?? 1e-9,
    maxDt: options.maxDt ?? 1,
    safety: options.safety ?? 0.9,
    order: options.order ?? 5,
    minFactor: options.minFactor ?? 0.2,
    maxFactor: options.maxFactor ?? 5,
    maxIterations: options.maxIterations ?? 10_000_000
  };
  if (!(resolved.minDt > 0) || !Number.isFinite(resolved.minDt)) {
    throw new RangeError(`${caller}: minDt must be positive and finite.`);
  }
  if (!(resolved.maxDt >= resolved.minDt) || !Number.isFinite(resolved.maxDt)) {
    throw new RangeError(`${caller}: maxDt must be finite and >= minDt.`);
  }
  if (!(resolved.safety > 0 && resolved.safety <= 1) || !Number.isFinite(resolved.safety)) {
    throw new RangeError(`${caller}: safety must be finite and in (0, 1].`);
  }
  if (!(resolved.order > 0) || !Number.isFinite(resolved.order)) {
    throw new RangeError(`${caller}: controller order must be positive and finite.`);
  }
  if (!(resolved.minFactor > 0 && resolved.minFactor <= 1) || !Number.isFinite(resolved.minFactor)) {
    throw new RangeError(`${caller}: minFactor must be finite and in (0, 1].`);
  }
  if (!(resolved.maxFactor >= 1) || !Number.isFinite(resolved.maxFactor) || resolved.maxFactor < resolved.minFactor) {
    throw new RangeError(`${caller}: maxFactor must be finite, >= 1, and >= minFactor.`);
  }
  if (!Number.isSafeInteger(resolved.maxIterations) || resolved.maxIterations < 1) {
    throw new RangeError(`${caller}: maxIterations must be a positive safe integer.`);
  }
  for (let i = 0; i < dimension; i += 1) {
    const absTol = toleranceAt(resolved.absTol, i, dimension, `${caller}: absTol`);
    const relTol = toleranceAt(resolved.relTol, i, dimension, `${caller}: relTol`);
    if (!Number.isFinite(absTol) || absTol < 0 || !Number.isFinite(relTol) || relTol < 0 || absTol + relTol <= 0) {
      throw new RangeError(`${caller}: component tolerances must be finite/non-negative and not both zero.`);
    }
  }
  if (options.controller !== undefined && options.controller !== 'basic' && options.controller !== 'pi') {
    throw new RangeError(`${caller}: controller must be "basic" or "pi".`);
  }
  if (options.controllerCoefficients) {
    const { kI, kP, kD = 0 } = options.controllerCoefficients;
    if (![kI, kP, kD].every((value) => Number.isFinite(value) && value >= 0) || !(kI > 0)) {
      throw new RangeError(`${caller}: controller coefficients must be finite/non-negative with kI > 0.`);
    }
  }
  return resolved;
}

/** Mixed component-wise abs/rel normalised error: target is <= 1. */
export function normalisedError(
  state: StateVector,
  y: StateVector,
  errors: StateVector,
  absTolerance: ComponentTolerance,
  relTolerance: ComponentTolerance
): number {
  let errorNorm = 0;
  for (let i = 0; i < state.length; i += 1) {
    const absTol = toleranceAt(absTolerance, i, state.length, 'absTol');
    const relTol = toleranceAt(relTolerance, i, state.length, 'relTol');
    const scale = absTol + relTol * Math.max(Math.abs(Number(state[i] ?? 0)), Math.abs(Number(y[i] ?? 0)));
    errorNorm = Math.max(errorNorm, Number(errors[i] ?? Infinity) / scale);
  }
  return errorNorm;
}
