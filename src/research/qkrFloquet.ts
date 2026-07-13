import { createQkrPlan, qkrStep, type QuantumKickedRotorParams, type QkrPlan } from '../physics/quantumKickedRotor';
import {
  complexUnitaryFloquetSpectrum,
  type ComplexMatrix,
  type UnitaryFloquetOptions,
  type UnitaryFloquetSpectrum
} from './unitaryFloquet';

export interface QkrQuasiEnergySpectrum extends UnitaryFloquetSpectrum {
  gridSize: number;
  kickStrength: number;
  hbar: number;
}

export function qkrFloquetMatrix(paramsOrPlan: QuantumKickedRotorParams | QkrPlan): ComplexMatrix {
  const plan = 'kickStrength' in paramsOrPlan ? createQkrPlan(paramsOrPlan) : paramsOrPlan;
  const n = plan.gridSize;
  const re: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const im: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let col = 0; col < n; col += 1) {
    const state = { re: new Float64Array(n), im: new Float64Array(n) };
    state.re[col] = 1;
    qkrStep(state, plan);
    for (let row = 0; row < n; row += 1) {
      re[row]![col] = state.re[row] ?? 0;
      im[row]![col] = state.im[row] ?? 0;
    }
  }
  return { re, im };
}

export function qkrQuasiEnergySpectrum(
  params: QuantumKickedRotorParams,
  options: Omit<UnitaryFloquetOptions, 'hbar'> = {}
): QkrQuasiEnergySpectrum {
  const matrix = qkrFloquetMatrix(params);
  const spectrum = complexUnitaryFloquetSpectrum(matrix, {
    ...options,
    hbar: params.hbar,
    period: options.period ?? 1
  });
  return {
    ...spectrum,
    gridSize: params.gridSize,
    kickStrength: params.kickStrength,
    hbar: params.hbar
  };
}
