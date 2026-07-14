import { describe, expect, it } from 'vitest';
import { wadaConvergenceFromGrids, wadaResolutionConvergence } from '../src/chaos/wadaConvergence';
import type { LabelGrid } from '../src/chaos/basin';

/** Grid whose every boundary cell touches 3 colours: vertical thirds with a 3-colour pinwheel seam. */
function threeColorWadaLikeGrid(n: number): LabelGrid {
  const labels = new Int32Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      // Interleave three colours in thin stripes: every neighbourhood of any
      // boundary cell sees all three colours (idealised Wada-like structure).
      labels[y * n + x] = (x + y) % 3;
    }
  }
  return { labels, width: n, height: n };
}

/** Two clean half-plane basins: boundary cells see exactly 2 colours (definitely not Wada). */
function twoColorGrid(n: number): LabelGrid {
  const labels = new Int32Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      labels[y * n + x] = x < n / 2 ? 0 : 1;
    }
  }
  return { labels, width: n, height: n };
}

describe('wadaConvergenceFromGrids', () => {
  it('reports stable Wada evidence when all resolutions agree above threshold', () => {
    const resolutions = [24, 36, 48];
    const result = wadaConvergenceFromGrids(resolutions.map(threeColorWadaLikeGrid), resolutions);
    expect(result.schemaVersion).toBe('pendulum-wada-convergence/v1');
    expect(result.wadaFractions).toHaveLength(3);
    for (const fraction of result.wadaFractions) expect(fraction).toBeGreaterThan(0.95);
    expect(result.adjacentDeltas).toHaveLength(2);
    expect(result.maxAdjacentDelta).toBeLessThanOrEqual(0.05);
    expect(result.verdict).toBe('stable-wada-evidence');
    expect(result.wadaCandidate).toBe(true);
  });

  it('reports stable-non-wada for a clean two-basin boundary', () => {
    const resolutions = [24, 36, 48];
    const result = wadaConvergenceFromGrids(resolutions.map(twoColorGrid), resolutions);
    for (const fraction of result.wadaFractions) expect(fraction).toBe(0);
    expect(result.verdict).toBe('stable-non-wada');
    expect(result.wadaCandidate).toBe(false);
  });

  it('reports unstable when the fraction swings across resolutions', () => {
    const grids = [threeColorWadaLikeGrid(24), twoColorGrid(36), threeColorWadaLikeGrid(48)];
    const result = wadaConvergenceFromGrids(grids, [24, 36, 48]);
    expect(result.verdict).toBe('unstable');
    expect(result.wadaCandidate).toBe(false);
    expect(result.maxAdjacentDelta).toBeGreaterThan(0.05);
  });

  it('declares insufficient data below three resolutions', () => {
    const result = wadaConvergenceFromGrids([threeColorWadaLikeGrid(24), threeColorWadaLikeGrid(36)], [24, 36]);
    expect(result.verdict).toBe('insufficient-data');
  });

  it('carries full scientific metadata: method, dt, threshold, transients, caveat, hashes', () => {
    const resolutions = [24, 36, 48];
    const result = wadaConvergenceFromGrids(
      resolutions.map(threeColorWadaLikeGrid),
      resolutions,
      {},
      { dt: 0.005, maxTime: 30, range: [-2, 2] }
    );
    expect(result.method).toContain('Daza');
    expect(result.dt).toBe(0.005);
    expect(result.maxTime).toBe(30);
    expect(result.threshold).toBe(0.95);
    expect(result.convergenceTolerance).toBe(0.05);
    expect(result.transientHandling).toContain('maxTime');
    expect(result.caveat).toContain('does not prove');
    expect(result.gridHashes).toHaveLength(3);
    expect(new Set(result.gridHashes).size).toBeGreaterThan(1); // different grids -> different hashes
    expect(result.reproducibilityHash).toMatch(/^[0-9a-f]+$/);
    // Reproducibility hash is deterministic for identical inputs.
    const again = wadaConvergenceFromGrids(
      resolutions.map(threeColorWadaLikeGrid),
      resolutions,
      {},
      { dt: 0.005, maxTime: 30, range: [-2, 2] }
    );
    expect(again.reproducibilityHash).toBe(result.reproducibilityHash);
  });

  it('distinguishes finite-grid evidence from proof in the caveat', () => {
    const resolutions = [24, 36, 48];
    const result = wadaConvergenceFromGrids(resolutions.map(threeColorWadaLikeGrid), resolutions);
    expect(result.caveat).toMatch(/evidence/i);
    expect(result.caveat).toMatch(/proof/i);
    expect(result.caveat).toMatch(/saddle-straddle/i);
  });
});

describe('wadaResolutionConvergence (end-to-end on real flip basins)', () => {
  it('runs the full pipeline on small grids and produces a coherent curve', () => {
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const result = wadaResolutionConvergence(params, { resolutions: [18, 24, 30], maxTime: 6, dt: 0.02 });
    expect(result.resolutions).toEqual([18, 24, 30]);
    expect(result.wadaFractions).toHaveLength(3);
    for (const fraction of result.wadaFractions) {
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
    expect(result.numColors.every((colors) => colors >= 1 && colors <= 3)).toBe(true);
    expect(['stable-wada-evidence', 'stable-non-wada', 'unstable', 'insufficient-data']).toContain(result.verdict);
  }, 30_000);

  it('rejects out-of-range, non-integer, duplicate, and empty resolution lists', () => {
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    expect(() => wadaResolutionConvergence(params, { resolutions: [30, 18, 18, 4], maxTime: 2, dt: 0.05 })).toThrow(
      /safe integer in \[16, 240\]/
    );
    expect(() => wadaResolutionConvergence(params, { resolutions: [24.5, 30], maxTime: 2, dt: 0.05 })).toThrow(
      /safe integer in \[16, 240\]/
    );
    expect(() => wadaResolutionConvergence(params, { resolutions: [18, 30, 18], maxTime: 2, dt: 0.05 })).toThrow(
      /must be unique/
    );
    expect(() => wadaResolutionConvergence(params, { resolutions: [], maxTime: 2, dt: 0.05 })).toThrow(
      /must contain 1\.\./
    );
  });

  it('accepts unsorted valid resolutions and reports them in ascending order', () => {
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const result = wadaResolutionConvergence(params, { resolutions: [30, 18], maxTime: 2, dt: 0.05 });
    expect(result.resolutions).toEqual([18, 30]);
  }, 30_000);
});
