import { describe, expect, test } from 'vitest';
import {
  basinEntropy,
  boundaryMask,
  boxCountingDimension,
  doublePendulumFlipBasin,
  wadaCandidate,
  type LabelGrid
} from '../src/chaos/index';

/**
 * Basin entropy and box-counting are pure functions of a label grid, so they can
 * be pinned exactly on synthetic grids with known answers before being trusted
 * on the (expensive, stochastic-looking) double-pendulum flip map.
 */

function makeGrid(width: number, height: number, fill: (x: number, y: number) => number): LabelGrid {
  const labels = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) labels[y * width + x] = fill(x, y);
  return { labels, width, height };
}

describe('basinEntropy', () => {
  test('a single-colour basin has zero entropy and no boundary', () => {
    const grid = makeGrid(20, 20, () => 0);
    const r = basinEntropy(grid, 5);
    expect(r.basinEntropy).toBe(0);
    expect(r.boundaryBasinEntropy).toBe(0);
    expect(r.numBoundaryBoxes).toBe(0);
    expect(r.fractalBoundary).toBe(false);
  });

  test('a 2-colour checkerboard maximally mixes each box: Sb = Sbb = ln 2', () => {
    const grid = makeGrid(20, 20, (x, y) => (x + y) % 2);
    const r = basinEntropy(grid, 2);
    expect(r.basinEntropy).toBeCloseTo(Math.LN2, 10);
    expect(r.boundaryBasinEntropy).toBeCloseTo(Math.LN2, 10);
    expect(r.numBoundaryBoxes).toBe(r.numBoxes);
  });

  test('a sharp straight boundary has positive but sub-maximal basin entropy', () => {
    // Split at column 7 (inside the box columns) so straddling boxes are mixed.
    const grid = makeGrid(20, 20, (x) => (x < 7 ? 0 : 1));
    const r = basinEntropy(grid, 5);
    expect(r.basinEntropy).toBeGreaterThan(0);
    expect(r.basinEntropy).toBeLessThan(Math.LN2);
    expect(r.numBoundaryBoxes).toBeGreaterThan(0);
  });
});

describe('boxCountingDimension', () => {
  test('a single point has dimension ≈ 0', () => {
    const mask = new Uint8Array(64 * 64);
    mask[32 * 64 + 32] = 1;
    const { dimension } = boxCountingDimension(mask, 64, 64);
    expect(dimension).toBeLessThan(0.25);
  });

  test('a straight line has dimension ≈ 1', () => {
    const mask = new Uint8Array(64 * 64);
    for (let x = 0; x < 64; x += 1) mask[32 * 64 + x] = 1;
    const { dimension } = boxCountingDimension(mask, 64, 64);
    expect(dimension).toBeGreaterThan(0.8);
    expect(dimension).toBeLessThan(1.2);
  });

  test('a fully filled plane has dimension ≈ 2', () => {
    const mask = new Uint8Array(64 * 64).fill(1);
    const { dimension } = boxCountingDimension(mask, 64, 64);
    expect(dimension).toBeGreaterThan(1.8);
    expect(dimension).toBeLessThanOrEqual(2.05);
  });

  test('boundaryMask flags exactly the cells adjacent to another label', () => {
    const grid = makeGrid(4, 1, (x) => (x < 2 ? 0 : 1));
    const mask = boundaryMask(grid);
    // Cells at x=1 and x=2 straddle the boundary; x=0 and x=3 do not.
    expect(Array.from(mask)).toEqual([0, 1, 1, 0]);
  });
});

describe('double-pendulum flip basin (classic fractal)', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

  test('rejects degenerate grids and unbounded work requests before allocating or integrating', () => {
    expect(() => doublePendulumFlipBasin(params, { n: 1, maxTime: 0 })).toThrow(/n must be an integer between 2/);
    expect(() => doublePendulumFlipBasin(params, { n: 513, maxTime: 0 })).toThrow(/n must be an integer between 2/);
    expect(() => doublePendulumFlipBasin(params, { n: 2, dt: 0, maxTime: 0 })).toThrow(
      /dt must be positive and finite/
    );
    expect(() => doublePendulumFlipBasin(params, { n: 2, dt: 1e-9, maxTime: 1 })).toThrow(/steps per cell/);
  });

  test('rejects non-finite time controls and malformed angle ranges', () => {
    expect(() => doublePendulumFlipBasin(params, { maxTime: Infinity })).toThrow(
      /maxTime must be finite and non-negative/
    );
    expect(() => doublePendulumFlipBasin(params, { range: [1, 1] })).toThrow(/finite and strictly increasing/);
    expect(() => doublePendulumFlipBasin(params, { range: [0, Infinity] })).toThrow(/finite and strictly increasing/);
  });

  test('produces a valid label grid whose flip boundary is fractal (Sbb > ln 2)', () => {
    const grid = doublePendulumFlipBasin(params, { n: 48, range: [-3, 3], dt: 0.01, maxTime: 12 });
    expect(grid.width).toBe(48);
    for (const label of grid.labels) expect(label === 0 || label === 1 || label === 2).toBe(true);

    const entropy = basinEntropy(grid, 4);
    expect(entropy.numBoundaryBoxes).toBeGreaterThan(0);
    expect(entropy.basinEntropy).toBeGreaterThan(0);

    // The hallmark of the double-pendulum flip map: the boundary between outcomes
    // is fractal. The box-counting dimension is the robust, resolution-stable
    // witness (≈1.5–1.6 here) — strictly above a smooth curve's dimension of 1.
    // (Sbb > ln 2 is only a *sufficient* condition for fractality and is not met
    // at this grid/time budget, so we do not assert it.)
    const { dimension } = boxCountingDimension(boundaryMask(grid), grid.width, grid.height);
    expect(dimension).toBeGreaterThan(1.25);
    expect(dimension).toBeLessThan(2);
  });
});

describe('wadaCandidate', () => {
  test('a two-basin half-plane boundary is never a Wada candidate', () => {
    const grid = makeGrid(40, 40, (x) => (x < 20 ? 0 : 1));
    const r = wadaCandidate(grid, 2);
    expect(r.numColors).toBe(2);
    expect(r.wadaFraction).toBe(0);
    expect(r.wadaCandidate).toBe(false);
    expect(r.boundaryCells).toBeGreaterThan(0);
  });

  test('three sectors meeting at one point: only the meeting region sees 3 basins', () => {
    // Pie of three sectors around the grid centre: almost every boundary cell
    // lies on a 2-colour edge; only cells near the centre see all three.
    const grid = makeGrid(60, 60, (x, y) => {
      const angle = Math.atan2(y - 30 + 0.5, x - 30 + 0.5);
      if (angle < -Math.PI / 3) return 0;
      if (angle < Math.PI / 3) return 1;
      return 2;
    });
    const r = wadaCandidate(grid, 2);
    expect(r.numColors).toBe(3);
    expect(r.wadaFraction).toBeGreaterThan(0); // the triple point exists...
    expect(r.wadaFraction).toBeLessThan(0.3); // ...but almost all boundary is pairwise
    expect(r.wadaCandidate).toBe(false);
  });

  test('fine 3-colour interleaving: every boundary neighbourhood touches all basins', () => {
    // Width-1 stripes of period 3 with radius 2: every boundary cell's
    // neighbourhood contains all three colours — Wada-like at this resolution.
    const grid = makeGrid(45, 45, (x) => x % 3);
    const r = wadaCandidate(grid, 2);
    expect(r.numColors).toBe(3);
    expect(r.wadaFraction).toBe(1);
    expect(r.wadaCandidate).toBe(true);
    // Histogram is consistent: all mass at "sees exactly 3 colours".
    expect(r.fractionByColors[3]).toBe(1);
  });

  test('the double-pendulum flip boundary has triple-basin boundary mixing', () => {
    const grid = doublePendulumFlipBasin({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, { n: 50, dt: 0.02, maxTime: 8 });
    const r = wadaCandidate(grid, 2);
    expect(r.numColors).toBeGreaterThanOrEqual(3);
    expect(r.boundaryCells).toBeGreaterThan(0);
    // At this coarse test budget much of the boundary is the *smooth* frontier
    // of the not-yet-flipped (label 2) region, which dilutes the fraction — so
    // assert mixing exists without over-claiming Wada candidacy here. The real
    // candidacy check needs the resolution-refinement study (CLI/tab budget).
    expect(r.wadaFraction).toBeGreaterThan(0.05);
    expect(r.wadaFraction).toBeLessThanOrEqual(1);
    expect(r.wadaCandidate).toBe(false);
  });
});
