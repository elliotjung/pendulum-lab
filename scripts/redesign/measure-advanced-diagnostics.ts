import { writeFileSync } from 'node:fs';
import { recurrenceQuantification, rqaBlockUncertainty, recurrenceMatrix } from '../../src/chaos/rqa';
import { recurrenceNetworkMetrics } from '../../src/chaos/recurrenceNetwork';
import { correlationDimension } from '../../src/chaos/correlationDimension';
import { binomialCascadeScales, renyiDimensions } from '../../src/chaos/multifractal';
import { topologicalEntropy1D } from '../../src/chaos/topologicalEntropy';
import { transferOperatorSpectrum, transferOperatorInvariantDensity } from '../../src/chaos/transferOperator';
import { finiteTimeLyapunovReport } from '../../src/chaos/ftle';
import { covariantLyapunovVectors } from '../../src/chaos/clv';
import { basinEntropy, boundaryMask, boxCountingDimension } from '../../src/chaos/basin';
import type { Derivative } from '../../src/physics/types';

// Closed-form fixtures supplement product/native parity. These are deliberately
// synthetic benchmarks, never observations attributed to a user's physical run.
const periodic = Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
const recurrence = recurrenceQuantification(periodic, { dimension: 2, delay: 8, targetRecurrenceRate: 0.1 });
const block = rqaBlockUncertainty(periodic, { dimension: 2, delay: 8 }, 4);
const matrix = recurrenceMatrix(periodic, { dimension: 2, delay: 8, targetRecurrenceRate: 0.1 });
const network = recurrenceNetworkMetrics(matrix.matrix, matrix.size);
const circle = [128, 256, 512].map((n) => {
  const points = Array.from({ length: n }, (_, i) => [
    Math.cos((i * 2 * Math.PI) / n),
    Math.sin((i * 2 * Math.PI) / n)
  ]);
  return { n, ...correlationDimension(points, { radiusCount: 48, fitLowFraction: 0.03, fitHighFraction: 0.2 }) };
});
const p = 0.3,
  qs = [-2, -1, 0, 1, 2, 3];
const cascade = renyiDimensions(binomialCascadeScales(p, [3, 4, 5, 6, 7, 8]), qs);
const cascadeExact = qs.map((q) =>
  q === 1
    ? -(p * Math.log(p) + (1 - p) * Math.log(1 - p)) / Math.log(2)
    : -Math.log(p ** q + (1 - p) ** q) / ((q - 1) * Math.log(2))
);
const tent = [8, 16, 32].map((boxes) => ({
  boxes,
  ...topologicalEntropy1D((x) => 1 - Math.abs(2 * x - 1), [0, 1], boxes, 32)
}));
const spectrum = transferOperatorSpectrum([0.8, 0.2, 0.3, 0.7], 2);
const density = [32, 64, 128].map((boxes) => {
  const native = transferOperatorInvariantDensity((x) => 4 * x * (1 - x), [0, 1], boxes, 256);
  let cumulative = 0,
    cdfError = 0;
  native.measure.forEach((mass, i) => {
    cumulative += mass;
    cdfError = Math.max(cdfError, Math.abs(cumulative - (2 / Math.PI) * Math.asin(Math.sqrt((i + 1) / boxes))));
  });
  return { boxes, mass: native.measure.reduce((a, b) => a + b, 0), cdfError };
});
const rhs: Derivative = (state, out) => {
  out[0] = 0.4 * state[0]!;
  out[1] = -0.3 * state[1]!;
};
const ftle = [0.02, 0.01, 0.005].map((dt) => finiteTimeLyapunovReport([1, 1], rhs, 2, { dt }));
const clv = covariantLyapunovVectors([1, 1], rhs, 2, {
  dt: 0.01,
  renormEvery: 10,
  forwardTransient: 200,
  window: 400,
  backwardTransient: 200,
  seed: 40503
});
const homogeneous = basinEntropy({ labels: new Int32Array(64 * 64), width: 64, height: 64 }, 4);
const mixedGrid = { labels: Int32Array.from({ length: 64 * 64 }, (_, i) => i % 2), width: 64, height: 64 };
const mixed = basinEntropy(mixedGrid, 4);
const lineGrid = {
  labels: Int32Array.from({ length: 64 * 64 }, (_, i) => (i % 64 < 32 ? 0 : 1)),
  width: 64,
  height: 64
};
const boundary = boxCountingDimension(boundaryMask(lineGrid), 64, 64, [1, 2, 4, 8, 16]);
const checks = {
  periodicDeterminism: recurrence.determinism > 0.95,
  recurrenceRate: Math.abs(recurrence.recurrenceRate - 0.1) < 0.025,
  blockUncertaintyFinite: block.blocks === 4 && Number.isFinite(block.determinism.stdError),
  networkFinite: Object.values(network).every((x) => typeof x !== 'number' || Number.isFinite(x)),
  circleDimension: circle.every((x) => Math.abs(x.dimension - 1) < 0.15 && x.rSquared > 0.97),
  cascadeExact: cascade.Dq.every((x, i) => Math.abs(x - cascadeExact[i]!) < 1e-10),
  tentEntropyResolution: tent.every((x) => Math.abs(x.entropy - Math.log(2)) < 1e-10),
  transferSpectrum: Math.abs(spectrum.moduli[0]! - 1) < 1e-10 && Math.abs(spectrum.subdominantModulus - 0.5) < 1e-10,
  logisticDensity:
    density.every((x) => Math.abs(x.mass - 1) < 1e-12) &&
    density.slice(1).every((x) => x.cdfError < 0.06) &&
    density[2]!.cdfError < density[1]!.cdfError &&
    density[1]!.cdfError < density[0]!.cdfError,
  ftleConvergence: ftle.every((x) => Math.abs(x.value - 0.4) < 1e-7),
  clvExponents: Math.abs(clv.exponents[0]! - 0.4) < 1e-6 && Math.abs(clv.exponents[1]! + 0.3) < 1e-6,
  basinHomogeneous: homogeneous.basinEntropy === 0,
  basinMixed: Math.abs(mixed.basinEntropy - Math.log(2)) < 1e-12,
  boundaryDimension: Math.abs(boundary.dimension - 1) < 0.15
};
const report = {
  schemaVersion: 'pendulum-S19-numerical-metrics/v1',
  recordedAt: new Date().toISOString(),
  checks,
  measurements: {
    recurrence,
    block,
    network,
    circle,
    cascade,
    cascadeExact,
    tent,
    spectrum,
    density,
    ftle,
    clv: { exponents: clv.exponents, samples: clv.times.length, minHyperbolicityAngle: clv.minHyperbolicityAngle },
    homogeneous,
    mixed,
    boundary
  },
  references: [
    'https://www.recurrence-plot.tk/marwan_PhysRep2007.pdf',
    'https://arxiv.org/abs/0706.0510',
    'https://arxiv.org/abs/1605.02342'
  ],
  limitations: [
    'Closed-form synthetic fixtures and selected resolution comparisons do not certify arbitrary physical settings.',
    'Finite-time basin labels, Wada candidates and FTLE ridge candidates do not prove attractors, Wada or material LCS.',
    'No human scientific review is implied.'
  ]
};
const output = process.argv[2] ?? 'tmp/S19-numerical-metrics.json';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    checks,
    passed: Object.values(checks).filter(Boolean).length,
    total: Object.keys(checks).length
  })
);
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
