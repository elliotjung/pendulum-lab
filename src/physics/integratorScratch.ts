const SCRATCH_POOLS = new Map<string, Float64Array[][]>();

/** Acquire re-entrant stage buffers; nested compositions receive distinct leases. */
export function acquireIntegratorScratch(dimension: number, count = 5): Float64Array[] {
  const key = `${dimension}:${count}`;
  const pool = SCRATCH_POOLS.get(key);
  return pool?.pop() ?? Array.from({ length: count }, () => new Float64Array(dimension));
}

export function releaseIntegratorScratch(scratch: Float64Array[]): void {
  const key = `${scratch[0]?.length ?? 0}:${scratch.length}`;
  const pool = SCRATCH_POOLS.get(key) ?? [];
  if (pool.length < 8) pool.push(scratch);
  SCRATCH_POOLS.set(key, pool);
}
