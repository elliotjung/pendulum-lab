import { kuramotoLocalOrderParameters, nonlocalRingAdjacency } from '../physics/kuramoto';

export type ChimeraClassification = 'coherent' | 'incoherent' | 'chimera-candidate' | 'mixed';

export interface ChimeraDiagnosticsOptions {
  /** Neighbours on each side in the non-local ring. */
  radius: number;
  coherentThreshold?: number;
  incoherentThreshold?: number;
}

export interface ChimeraDiagnostics {
  localOrder: number[];
  coherentFraction: number;
  incoherentFraction: number;
  meanLocalOrder: number;
  spatialVariance: number;
  classification: ChimeraClassification;
  radius: number;
  coherentThreshold: number;
  incoherentThreshold: number;
  caveat: string;
}

/**
 * Local-order profile and a conservative finite-size chimera candidate test.
 * A candidate must contain both strongly coherent and strongly incoherent
 * neighbourhoods; this is a diagnostic, not an infinite-system proof.
 */
export function chimeraDiagnostics(phases: ArrayLike<number>, options: ChimeraDiagnosticsOptions): ChimeraDiagnostics {
  const coherentThreshold = options.coherentThreshold ?? 0.9;
  const incoherentThreshold = options.incoherentThreshold ?? 0.45;
  if (!(coherentThreshold > incoherentThreshold) || coherentThreshold > 1 || incoherentThreshold < 0) {
    throw new Error('chimeraDiagnostics requires 0 <= incoherentThreshold < coherentThreshold <= 1.');
  }
  const adjacency = nonlocalRingAdjacency(phases.length, options.radius);
  const localOrder = kuramotoLocalOrderParameters(phases, adjacency).map((entry) => entry.magnitude);
  const coherent = localOrder.filter((value) => value >= coherentThreshold).length;
  const incoherent = localOrder.filter((value) => value <= incoherentThreshold).length;
  const coherentFraction = coherent / localOrder.length;
  const incoherentFraction = incoherent / localOrder.length;
  const meanLocalOrder = localOrder.reduce((sum, value) => sum + value, 0) / localOrder.length;
  const spatialVariance = localOrder.reduce((sum, value) => sum + (value - meanLocalOrder) ** 2, 0) / localOrder.length;
  let classification: ChimeraClassification;
  if (coherent === localOrder.length) classification = 'coherent';
  else if (incoherent === localOrder.length) classification = 'incoherent';
  else if (coherent > 0 && incoherent > 0) classification = 'chimera-candidate';
  else classification = 'mixed';
  return {
    localOrder,
    coherentFraction,
    incoherentFraction,
    meanLocalOrder,
    spatialVariance,
    classification,
    radius: options.radius,
    coherentThreshold,
    incoherentThreshold,
    caveat:
      'Finite-size local-order coexistence is a chimera candidate; confirm persistence under longer horizons, size/radius refinement, and perturbed initial conditions.'
  };
}

/** Sample a phase trajectory into a space-time local-order profile. */
export function chimeraSpaceTimeProfile(
  phaseFrames: readonly ArrayLike<number>[],
  options: ChimeraDiagnosticsOptions
): { width: number; height: number; values: Float64Array } {
  if (phaseFrames.length === 0) throw new Error('chimeraSpaceTimeProfile requires at least one frame.');
  const width = phaseFrames[0]!.length;
  if (phaseFrames.some((frame) => frame.length !== width))
    throw new Error('chimeraSpaceTimeProfile frames must have equal length.');
  const values = new Float64Array(width * phaseFrames.length);
  phaseFrames.forEach((frame, row) => values.set(chimeraDiagnostics(frame, options).localOrder, row * width));
  return { width, height: phaseFrames.length, values };
}
