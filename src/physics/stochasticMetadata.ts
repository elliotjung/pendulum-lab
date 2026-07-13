/**
 * Langevin scheme identifiers and their strong-order / caveat metadata.
 *
 * Extracted from `stochastic.ts` so the ensemble runner stays under the
 * module-size cap. This module is deliberately dependency-free — it does not
 * import from `stochastic.ts`, so there is no import cycle: whether full matrix
 * noise is in play is passed in as a boolean rather than the spec's
 * `matrixNoise` object.
 */

/** The Langevin integration schemes supported by `runLangevinEnsemble`. */
export type LangevinScheme = 'euler-maruyama' | 'milstein' | 'heun-stratonovich' | 'commutative-milstein';

/** Strong-order contract and exportable caveats for a selected scheme. */
export interface StochasticSchemeMetadata {
  /** Human-readable strong-order contract for the selected scheme. */
  strongOrder: string;
  /** Limitations that should travel with exported stochastic statistics. */
  caveats: string[];
}

/**
 * Map a scheme (and whether full matrix diffusion is in play) to its
 * strong-order contract and the caveats that must accompany exported
 * statistics.
 */
export function stochasticSchemeMetadata(scheme: LangevinScheme, hasMatrixNoise: boolean): StochasticSchemeMetadata {
  if (scheme === 'commutative-milstein') {
    return {
      strongOrder: 'strong order 1 only when the supplied matrix noise is Lie-commutative',
      caveats: [
        'Commutative Milstein omits Levy-area terms; non-commutative matrix noise is not strong order 1 and should be treated as a caveated estimate.',
        'Check commutativityDefect(...) for the supplied diffusion before using this result as a strong-order-1 claim.'
      ]
    };
  }
  if (scheme === 'milstein') {
    return {
      strongOrder: 'strong order 1 for diagonal multiplicative noise with the supplied diffusion derivative',
      caveats: [
        'Milstein strong-order claims require the diffusion derivative to match the integrated drift/diffusion model.'
      ]
    };
  }
  if (scheme === 'heun-stratonovich') {
    return {
      strongOrder: 'predictor-corrector Stratonovich scheme; not an Ito strong-order-1 Milstein replacement',
      caveats: ['Heun-Stratonovich is for Stratonovich matrix noise; do not quote it as an Ito strong-order-1 scheme.']
    };
  }
  return {
    strongOrder: hasMatrixNoise
      ? 'strong order 1/2 for matrix-noise Euler-Maruyama'
      : 'strong order 1/2 (weak order 1 for additive noise)',
    caveats: ['Euler-Maruyama is not strong order 1; refine dt and report seed, dt, horizon, and ensemble size.']
  };
}
