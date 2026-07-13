import { createQkrPlan, qkrStep, type QuantumKickedRotorParams } from '../physics/quantumKickedRotor';
import { qkrQuasiEnergySpectrum } from './qkrFloquet';
import {
  complexUnitaryFloquetArnoldiSchurSpectrum,
  type ComplexLinearOperator
} from './unitaryFloquet';

export interface QkrFloquetBandPoint {
  phase: number;
  quasiEnergy: number;
  unitCircleDrift: number;
  residualBound: number | null;
}

export interface QkrFloquetViewModel {
  backend: 'dense' | 'arnoldi-schur';
  parameters: QuantumKickedRotorParams;
  bands: QkrFloquetBandPoint[];
  unitarityDefect: number;
  maxUnitCircleDrift: number;
  basisSize: number;
  converged: boolean;
  phaseDomain: readonly [number, number];
  quasiEnergyDomain: readonly [number, number];
  caveat: string;
}

export interface QkrFloquetViewOptions {
  denseLimit?: number;
  krylovDim?: number;
  targetCount?: number;
  residualTolerance?: number;
  period?: number;
}

/** UI-ready quasi-energy band data without DOM/canvas dependencies. */
export function buildQkrFloquetViewModel(
  parameters: QuantumKickedRotorParams,
  options: QkrFloquetViewOptions = {}
): QkrFloquetViewModel {
  const period = options.period ?? 1;
  const denseLimit = options.denseLimit ?? 32;
  let bands: QkrFloquetBandPoint[];
  let backend: QkrFloquetViewModel['backend'];
  let unitarityDefect: number;
  let maxUnitCircleDrift: number;
  let basisSize: number;
  let converged: boolean;
  let caveat: string;
  if (parameters.gridSize <= denseLimit) {
    const spectrum = qkrQuasiEnergySpectrum(parameters, { period });
    bands = spectrum.eigenvalues.map((eigenvalue, index) => ({
      phase: spectrum.phases[index]!,
      quasiEnergy: spectrum.quasiEnergies[index]!,
      unitCircleDrift: Math.abs(Math.hypot(eigenvalue.re, eigenvalue.im) - 1),
      residualBound: null
    }));
    backend = 'dense';
    unitarityDefect = spectrum.unitarityDefect;
    maxUnitCircleDrift = spectrum.maxUnitCircleDrift;
    basisSize = parameters.gridSize;
    converged = true;
    caveat = 'Dense eigenspectrum of the exact split-step Floquet matrix; finite grid size sets the quasi-energy resolution.';
  } else {
    const plan = createQkrPlan(parameters);
    const apply: ComplexLinearOperator = (vector) => {
      const state = { re: Float64Array.from(vector.re), im: Float64Array.from(vector.im) };
      qkrStep(state, plan);
      return { re: Array.from(state.re), im: Array.from(state.im) };
    };
    const spectrum = complexUnitaryFloquetArnoldiSchurSpectrum(apply, {
      dimension: parameters.gridSize,
      krylovDim: options.krylovDim ?? Math.min(parameters.gridSize, 24),
      targetCount: options.targetCount ?? Math.min(parameters.gridSize, 16),
      residualTolerance: options.residualTolerance ?? 1e-8,
      hbar: parameters.hbar,
      period
    });
    bands = spectrum.selected.map((row) => ({
      phase: row.phase,
      quasiEnergy: row.quasiEnergy,
      unitCircleDrift: Math.abs(Math.hypot(row.eigenvalue.re, row.eigenvalue.im) - 1),
      residualBound: row.residualBound
    }));
    backend = 'arnoldi-schur';
    unitarityDefect = spectrum.spectrum.unitarityDefect;
    maxUnitCircleDrift = spectrum.spectrum.maxUnitCircleDrift;
    basisSize = spectrum.basisSize;
    converged = spectrum.converged;
    caveat = spectrum.caveat;
  }
  bands.sort((a, b) => a.phase - b.phase);
  const quasiEnergies = bands.map((band) => band.quasiEnergy);
  const min = quasiEnergies.length ? Math.min(...quasiEnergies) : -parameters.hbar * Math.PI / period;
  const max = quasiEnergies.length ? Math.max(...quasiEnergies) : parameters.hbar * Math.PI / period;
  return {
    backend,
    parameters: { ...parameters },
    bands,
    unitarityDefect,
    maxUnitCircleDrift,
    basisSize,
    converged,
    phaseDomain: [-Math.PI, Math.PI],
    quasiEnergyDomain: [min, max],
    caveat
  };
}
