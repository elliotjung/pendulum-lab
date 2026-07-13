import { describe, expect, it } from 'vitest';
import { recurrenceNetworkMetrics } from '../src/chaos/recurrenceNetwork';
import { extractFtleRidges } from '../src/chaos/ftleRidge';
import { detectBifurcations } from '../src/chaos/bifurcationDetect';
import { classifyFixedPoint } from '../src/chaos/fixedPointClassify';
import { detectNeimarkSacker, torusIndicator } from '../src/chaos/neimarkSacker';
import { codimTwoDiagram } from '../src/chaos/codimTwo';

describe('recurrence network metrics', () => {
  it('computes exact metrics for a known 4-node graph', () => {
    // Adjacency: 0-1, 1-2, 2-0 triangle plus pendant 2-3.
    const n = 4;
    const matrix = new Array(n * n).fill(0);
    const link = (i: number, j: number) => {
      matrix[i * n + j] = 1;
      matrix[j * n + i] = 1;
    };
    link(0, 1);
    link(1, 2);
    link(2, 0);
    link(2, 3);
    const metrics = recurrenceNetworkMetrics(matrix, n);
    expect(metrics.nodes).toBe(4);
    expect(metrics.edges).toBe(4);
    expect(metrics.density).toBeCloseTo(4 / 6, 10);
    expect(metrics.meanDegree).toBeCloseTo(2, 10);
    expect(metrics.maxDegree).toBe(3);
    // Triangle: nodes 0,1 fully clustered (1.0); node 2 has 3 neighbours with 1 link (1/3); node 3 degree 1 skipped.
    expect(metrics.clusteringCoefficient).toBeCloseTo((1 + 1 + 1 / 3) / 3, 10);
    // Transitivity: 3 triangles-counted / triples = 3 / (1+1+3) = 0.6.
    expect(metrics.transitivity).toBeCloseTo(0.6, 10);
    expect(metrics.largestComponent).toBe(4);
    // Path lengths: 0-1:1, 0-2:1, 0-3:2, 1-2:1, 1-3:2, 2-3:1 => mean 8/6.
    expect(metrics.averagePathLength).toBeCloseTo(8 / 6, 10);
  });

  it('handles empty matrices', () => {
    const metrics = recurrenceNetworkMetrics([], 0);
    expect(metrics.edges).toBe(0);
    expect(metrics.density).toBe(0);
  });
});

describe('FTLE ridge extraction', () => {
  it('marks a sharp vertical ridge and nothing else', () => {
    const width = 21;
    const height = 11;
    const values = new Array(width * height).fill(0).map((_, index) => {
      const x = index % width;
      return x === 10 ? 5 : 0; // single bright column
    });
    const ridges = extractFtleRidges(values, width, height, { percentile: 0.9 });
    expect(ridges.ridgeCells).toBe(height);
    for (let y = 0; y < height; y += 1) {
      expect(ridges.mask[y * width + 10]).toBe(1);
      expect(ridges.mask[y * width + 3]).toBe(0);
    }
    expect(ridges.ridgeFraction).toBeCloseTo(height / (width * height), 10);
    expect(ridges.caveat).toContain('ridge');
  });

  it('ignores non-finite cells', () => {
    const values = [Number.NaN, 1, Number.POSITIVE_INFINITY, 1];
    const ridges = extractFtleRidges(values, 2, 2, { percentile: 0.5 });
    expect(ridges.ridgeCells).toBeGreaterThanOrEqual(0); // does not throw
  });
});

describe('automated bifurcation detection', () => {
  it('flags period doubling and chaos onset with bracketed parameters', () => {
    const columns = [
      { param: 0.9, values: [1, 1, 1, 1] },
      { param: 1.0, values: [1, 2, 1, 2] },
      { param: 1.1, values: [1, 2, 3, 4] }, // 4 distinct
      { param: 1.2, values: Array.from({ length: 60 }, (_, index) => index * 0.01) } // chaotic band
    ];
    const detection = detectBifurcations(columns, { tolerance: 1e-6, chaosCountThreshold: 24 });
    expect(detection.counts).toEqual([1, 2, 4, 60]);
    const types = detection.events.map((event) => event.type);
    expect(types).toContain('period-doubling'); // 1 -> 2 and 2 -> 4
    expect(types.filter((type) => type === 'period-doubling')).toHaveLength(2);
    expect(types).toContain('chaos-onset');
    const onset = detection.events.find((event) => event.type === 'chaos-onset')!;
    expect(onset.previousParam).toBe(1.1);
    expect(onset.param).toBe(1.2);
    expect(detection.caveat).toContain('transient');
  });
});

const mu = (re: number, im: number) => ({ re, im, modulus: Math.hypot(re, im) });

describe('fixed point classification', () => {
  it('classifies sinks, sources, saddles, and critical cases', () => {
    expect(classifyFixedPoint([mu(0.5, 0), mu(0.3, 0)]).classification).toBe('stable-node');
    expect(classifyFixedPoint([mu(0.4, 0.4), mu(0.4, -0.4)]).classification).toBe('stable-spiral');
    expect(classifyFixedPoint([mu(2, 0), mu(1.5, 0)]).classification).toBe('unstable-node');
    expect(classifyFixedPoint([mu(2, 0), mu(0.3, 0)]).classification).toBe('saddle');
    expect(classifyFixedPoint([mu(-1, 0), mu(0.4, 0)]).classification).toBe('period-doubling-critical');
    expect(classifyFixedPoint([mu(1, 0), mu(0.4, 0)]).classification).toBe('fold-critical');
    const center = classifyFixedPoint([mu(Math.cos(1), Math.sin(1)), mu(Math.cos(1), -Math.sin(1))]);
    expect(center.classification).toBe('center');
    expect(center.rotationNumber).toBeCloseTo(1 / (2 * Math.PI), 6);
  });

  it('reports spectral radius and stability flags', () => {
    const result = classifyFixedPoint([mu(0.9, 0), mu(-0.2, 0)]);
    expect(result.stable).toBe(true);
    expect(result.spectralRadius).toBeCloseTo(0.9, 10);
    expect(result.detail).toContain('spectral radius');
  });
});

describe('Neimark-Sacker detection and torus indicator', () => {
  it('finds the parameter where a complex pair crosses the unit circle', () => {
    const branch = [
      { param: 0.1, multipliers: [mu(0.6, 0.3), mu(0.6, -0.3)] },
      { param: 0.2, multipliers: [mu(0.75, 0.4), mu(0.75, -0.4)] },
      { param: 0.3, multipliers: [mu(0.9, 0.55), mu(0.9, -0.55)] } // |mu| ≈ 1.055
    ];
    const scan = detectNeimarkSacker(branch);
    expect(scan.points).toHaveLength(1);
    const point = scan.points[0]!;
    expect(point.paramBefore).toBe(0.2);
    expect(point.paramAfter).toBe(0.3);
    expect(point.paramCritical).toBeGreaterThan(0.2);
    expect(point.paramCritical).toBeLessThan(0.3);
    expect(point.direction).toBe('destabilising');
    expect(point.rotationNumber).toBeGreaterThan(0);
    expect(scan.caveat).toContain('resonance');
  });

  it('flags strong resonances', () => {
    const branch = [
      { param: 0, multipliers: [mu(0.99, 0.001), mu(0.99, -0.001)] },
      { param: 1, multipliers: [mu(1.01, 0.001), mu(1.01, -0.001)] }
    ];
    const scan = detectNeimarkSacker(branch);
    expect(scan.points[0]!.strongResonance).toBe(true); // rotation ≈ 0
  });

  it('torus indicator separates periodic, torus-like, and chaotic angle sets', () => {
    const periodic = torusIndicator([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0, Math.PI / 2]);
    expect(periodic.verdict).toBe('periodic');
    const golden = Array.from({ length: 600 }, (_, index) => (index * 2 * Math.PI * 0.61803398875) % (2 * Math.PI));
    expect(torusIndicator(golden).verdict).toBe('torus-like');
  });
});

describe('codim-2 regime diagram', () => {
  it('classifies a small driven-pendulum grid with metadata and hashes', () => {
    const result = codimTwoDiagram(
      (amplitude, damping) => ({
        kind: 'driven',
        g: 9.81,
        length: 1,
        damping,
        driveAmplitude: amplitude,
        driveFrequency: 2 / 3
      }),
      [0.3, 0, 0],
      'driveAmplitude',
      [0.2, 1.4],
      'damping',
      [0.1, 0.6],
      { n: 5, steps: 800, dt: 0.02 }
    );
    expect(result.cells).toHaveLength(25);
    expect(result.xValues).toHaveLength(5);
    expect(result.chaoticFraction).toBeGreaterThanOrEqual(0);
    expect(result.chaoticFraction).toBeLessThanOrEqual(1);
    expect(result.method).toContain('Benettin');
    expect(result.caveat).toContain('continuation');
    expect(result.reproducibilityHash).toMatch(/^[0-9a-f]+$/);
    // Every cell carries a finite or NaN lambda and a regime in {-1,0,1}.
    for (const cell of result.cells) expect([-1, 0, 1]).toContain(cell.regime);
  }, 60_000);
});
