import { describe, expect, it } from 'vitest';
import { mathieuFloquet, mathieuStabilityDiagram, mathieuTongueTips } from '../src/chaos/mathieuStability';

describe('Mathieu Floquet stability', () => {
  it('is Hamiltonian: det M = 1 across the parameter plane', () => {
    for (const delta of [0.1, 0.25, 0.6, 1.0]) {
      for (const epsilon of [0, 0.2, 0.5]) {
        const r = mathieuFloquet(delta, epsilon, { steps: 2000 });
        expect(Math.abs(r.determinant - 1)).toBeLessThan(1e-3);
      }
    }
  });

  it('the unforced equation is stable for δ > 0 and unstable for δ < 0', () => {
    expect(mathieuFloquet(1, 0).stable).toBe(true); // ẍ + x = 0, bounded oscillation
    expect(mathieuFloquet(0.6, 0).stable).toBe(true);
    expect(mathieuFloquet(-0.5, 0).stable).toBe(false); // ẍ − 0.5x = 0, exponential
  });

  it('is unstable inside the principal δ ≈ ¼ tongue, stable between tongues', () => {
    const inside = mathieuFloquet(0.25, 0.5);
    expect(inside.stable).toBe(false);
    expect(inside.spectralRadius).toBeGreaterThan(1.05);

    const between = mathieuFloquet(0.6, 0.1);
    expect(between.stable).toBe(true);
  });
});

describe('Mathieu stability diagram sweep', () => {
  it('produces a tongue map with both stable and unstable regions', () => {
    const diagram = mathieuStabilityDiagram({
      deltaRange: [-0.2, 1.4],
      epsilonRange: [0, 1],
      deltaSamples: 20,
      epsilonSamples: 12,
      options: { steps: 800 }
    });
    expect(diagram.cells.length).toBe(20 * 12);
    expect(diagram.stableMask.length).toBe(20 * 12);
    // A real diagram has both phases present.
    expect(diagram.unstableFraction).toBeGreaterThan(0.05);
    expect(diagram.unstableFraction).toBeLessThan(0.95);
    // Liouville holds in every cell.
    for (const cell of diagram.cells) expect(cell.determinantDrift).toBeLessThan(5e-3);
  });

  it('locates the principal tongue near δ = ¼ at moderate ε', () => {
    const diagram = mathieuStabilityDiagram({
      deltaRange: [0, 0.5],
      epsilonRange: [0.4, 0.6],
      deltaSamples: 21,
      epsilonSamples: 5,
      options: { steps: 1500 }
    });
    // Among the unstable cells, the δ closest to the tongue centre ≈ ¼ should be present.
    const unstableDeltas = diagram.cells.filter((c) => !c.stable).map((c) => c.delta);
    expect(unstableDeltas.length).toBeGreaterThan(0);
    const nearestToQuarter = unstableDeltas.reduce((a, b) => (Math.abs(b - 0.25) < Math.abs(a - 0.25) ? b : a));
    expect(Math.abs(nearestToQuarter - 0.25)).toBeLessThan(0.1);
  });

  it('reports the closed-form tongue tips δ = (n/2)²', () => {
    expect(mathieuTongueTips(3)).toEqual([0.25, 1, 2.25]);
  });
});
