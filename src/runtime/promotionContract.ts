/**
 * GPU promotion contract - the four explicit layers every accelerated
 * diagnostic must pass through (gpuLyapunov, gpuChaosPromotion,
 * gpuNChainVariational, gpuFields all follow this shape):
 *
 * 1. ORACLE    - CPU f64 reference computed unconditionally in the same run.
 * 2. CANDIDATE - WebGPU f32 result, or null when the adapter is unavailable
 *                or the request is outside the kernel's validated scope.
 * 3. PROMOTION - executable comparison of candidate vs oracle under the
 *                published tolerance table; failure falls back to the oracle.
 * 4. REPORT    - the returned object carries backend, both results, the
 *                comparison, and a caveat naming exactly what was promoted.
 *
 * The tier classifier below is the single source of truth for how a result's
 * trust level is presented (UI badges, ladder reports, reviewer dashboard):
 *
 * - `promoted`              backend=webgpu AND the oracle comparison passed.
 * - `accelerated-candidate` a GPU result exists but has NOT passed the oracle
 *                           gate (candidate-only surfaces, probe validations).
 * - `cpu-fallback`          the CPU f64 oracle result was returned.
 */

export type GpuResultTier = 'promoted' | 'accelerated-candidate' | 'cpu-fallback';

export interface GpuTierInput {
  /** Backend that produced the surfaced result. */
  backend: string;
  /**
   * Outcome of the CPU-oracle comparison for the surfaced result:
   * true = passed, false = failed, null/undefined = no oracle comparison ran
   * (probe-style validation only).
   */
  oracleComparisonPassed?: boolean | null;
}

export function gpuResultTier(input: GpuTierInput): GpuResultTier {
  if (input.backend !== 'webgpu') return 'cpu-fallback';
  return input.oracleComparisonPassed === true ? 'promoted' : 'accelerated-candidate';
}

export const GPU_TIER_LABELS: Record<GpuResultTier, string> = {
  promoted: 'GPU promoted',
  'accelerated-candidate': 'GPU candidate',
  'cpu-fallback': 'CPU fallback'
};

export const GPU_TIER_DETAILS: Record<GpuResultTier, string> = {
  promoted: 'WebGPU f32 result promoted after same-run CPU f64 oracle comparison.',
  'accelerated-candidate': 'WebGPU f32 result without a passed CPU f64 oracle gate; treat as accelerated preview, not a scientific claim.',
  'cpu-fallback': 'CPU f64 result (WebGPU unavailable, out of validated scope, or failed the oracle gate).'
};

/** One-line badge text: label plus the trust boundary it implies. */
export function gpuTierBadge(input: GpuTierInput): { tier: GpuResultTier; label: string; detail: string } {
  const tier = gpuResultTier(input);
  return { tier, label: GPU_TIER_LABELS[tier], detail: GPU_TIER_DETAILS[tier] };
}
