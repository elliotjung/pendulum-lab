/**
 * FTLE ridge extraction. Ridges of the forward FTLE field approximate repelling
 * Lagrangian coherent structures (Shadden, Lekien & Marsden, Physica D 2005).
 * The extractor marks cells that (a) exceed a percentile threshold and (b) are
 * local maxima transverse to the local gradient direction — a light-weight
 * discrete version of the second-derivative ridge condition.
 */

export interface FtleRidgeOptions {
  /** Percentile (0-1) of the field a cell must exceed. Default 0.8. */
  percentile?: number;
  /** Require the cell to top its across-gradient neighbours by this margin (absolute). Default 0. */
  margin?: number;
}

export interface FtleRidgeResult {
  /** Row-major 0/1 ridge mask, length width*height. */
  mask: Uint8Array;
  width: number;
  height: number;
  ridgeCells: number;
  ridgeFraction: number;
  threshold: number;
  percentile: number;
  caveat: string;
}

export function extractFtleRidges(
  values: ArrayLike<number>,
  width: number,
  height: number,
  options: FtleRidgeOptions = {}
): FtleRidgeResult {
  const percentile = Math.min(0.999, Math.max(0, options.percentile ?? 0.8));
  const margin = options.margin ?? 0;
  const finite: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? Number.NaN;
    if (Number.isFinite(value)) finite.push(value);
  }
  finite.sort((a, b) => a - b);
  const threshold =
    finite.length > 0
      ? finite[Math.min(finite.length - 1, Math.floor(percentile * finite.length))]!
      : Number.POSITIVE_INFINITY;
  // A flat background can sit exactly at the percentile (e.g. mostly-zero
  // fields); the global minimum can never be a ridge.
  const minFinite = finite.length > 0 ? finite[0]! : Number.POSITIVE_INFINITY;

  const mask = new Uint8Array(width * height);
  let ridgeCells = 0;
  const at = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const value = values[cy * width + cx] ?? Number.NaN;
    return Number.isFinite(value) ? value : -Infinity;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = at(x, y);
      if (!Number.isFinite(center) || center < threshold || center <= minFinite) continue;
      // Local gradient by central differences.
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
      const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      // Transverse direction (perpendicular to the gradient); for a near-zero
      // gradient (already at a max) test both axes.
      let isRidge: boolean;
      if (Math.abs(gx) + Math.abs(gy) < 1e-12) {
        isRidge =
          center >= at(x + 1, y) + margin &&
          center >= at(x - 1, y) + margin &&
          center >= at(x, y + 1) + margin &&
          center >= at(x, y - 1) + margin;
      } else {
        // Dominant transverse axis: compare against neighbours across the ridge.
        const tx = Math.abs(gy) >= Math.abs(gx) ? 1 : 0;
        const ty = tx === 1 ? 0 : 1;
        isRidge = center >= at(x + tx, y + ty) + margin && center >= at(x - tx, y - ty) + margin;
      }
      if (isRidge) {
        mask[y * width + x] = 1;
        ridgeCells += 1;
      }
    }
  }
  return {
    mask,
    width,
    height,
    ridgeCells,
    ridgeFraction: width * height > 0 ? ridgeCells / (width * height) : 0,
    threshold,
    percentile,
    caveat:
      'Discrete percentile+local-maximum ridge proxy; for publication-grade LCS use the Hessian eigenvalue condition on a refined grid.'
  };
}
