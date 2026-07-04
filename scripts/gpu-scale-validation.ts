import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { compareClvAcceleration, compareFtleFieldAcceleration, compareLyapunovSpectrumAcceleration } from '../src/chaos/accelerationContract';
import { compareEnsembleStatistics, ensembleGrid, ensembleStatistics, runDoublePendulumEnsemble, webgpuEnsembleStatistics } from '../src/runtime/gpuEnsemble';
import { flipBasinField, sweepLambdaField } from '../src/runtime/gpuFields';
import { GPU_SCALE_VALIDATION_CONTRACTS } from '../src/research/certifiedWorkbench';
import { hashText } from '../src/research/researchExportUtils';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

const grid = ensembleGrid(6, [-1.2, 1.2]);
const ensemble = await runDoublePendulumEnsemble(params, grid, { steps: 80, dt: 0.01, forceCpu: true });
const stats = ensembleStatistics(ensemble.states);
const f32CandidateStats = ensembleStatistics(new Float64Array(new Float32Array(ensemble.states)));
const reductionOracle = compareEnsembleStatistics(f32CandidateStats, stats);
const hardwareReduction = await webgpuEnsembleStatistics(ensemble.states);
const hardwareReductionOracle = hardwareReduction ? compareEnsembleStatistics(hardwareReduction, stats, {
  mean: 2e-5,
  variance: 2e-4,
  covariance: 2e-4,
  rmsSpread: 2e-4,
  flipFraction: 0
}) : null;
const basin = await flipBasinField(params, { n: 12, maxTime: 4, forceCpu: true });
const sweep = await sweepLambdaField(params, { n: 4, range: [0.1, 0.4], steps: 600, forceCpu: true });
const lyapunovAccelerationProbe = compareLyapunovSpectrumAcceleration(
  { spectrum: [0.25, 0.01, -0.02, -0.24], sum: 0, kaplanYorkeDimension: 3.95 },
  { spectrum: [0.251, 0.009, -0.021, -0.239], sum: 0, kaplanYorkeDimension: 3.948 },
  { spectrum: 0.005, aggregate: 0.01 }
);
const clvAccelerationProbe = compareClvAcceleration(
  { exponents: [0.4, -0.3], meanHyperbolicityAngle: 0.78, minHyperbolicityAngle: 0.4 },
  { exponents: [0.401, -0.301], meanHyperbolicityAngle: 0.781, minHyperbolicityAngle: 0.399 },
  { exponents: 0.005, angle: 0.01 }
);
const ftleAccelerationProbe = compareFtleFieldAcceleration(
  { values: Float64Array.of(0.1, 0.2, 0.3, 0.4), width: 2, height: 2, min: 0.1, max: 0.4 },
  { values: Float64Array.of(0.101, 0.199, 0.298, 0.402), width: 2, height: 2, min: 0.101, max: 0.402 },
  { field: 0.01, aggregate: 0.01 }
);

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface WebGpuHardwareEvidence {
  status?: string;
  generatedAt?: string;
  ensemble?: { backend?: string; comparison?: { passed?: boolean; maxMeanAbsDiff?: number; maxCovarianceAbsDiff?: number } };
  lyapunovSpectrum?: {
    backend?: string;
    comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null;
  };
  clv?: {
    backend?: string;
    comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null;
  };
  variationalFtleField?: {
    backend?: string;
    comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null;
  };
  nChainTrajectoryTape?: {
    backend?: string;
    links?: number;
    dimension?: number;
    steps?: number;
    comparison?: {
      passed?: boolean;
      maxFinalStateAbsDiff?: number;
      maxTrajectoryAbsDiff?: number;
      maxJacobianAbsDiff?: number;
    } | null;
  };
  nChainVariational?: {
    backend?: string;
    links?: number;
    dimension?: number;
    comparison?: { passed?: boolean; ftleAbsDiff?: number; clv?: { passed?: boolean } } | null;
  };
}

interface GpuBenchmarkLadderEvidence {
  status?: string;
  generatedAt?: string;
  adapter?: { vendor?: string; architecture?: string; name?: string };
  ensemble?: {
    allReductionComparisonsPassed?: boolean;
    maxIntegrationMeanDrift?: number;
    maxIntegrationCovarianceDrift?: number;
  };
  lyapunovSpectrum?: {
    allPromotionComparisonsPassed?: boolean;
    maxAdjacentSpectrumShift?: number;
  };
  clv?: { backend?: string; comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null } | null;
  variationalFtleField?: { backend?: string; comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null } | null;
  nChainTrajectoryTape?: {
    backend?: string;
    links?: number;
    dimension?: number;
    steps?: number;
    comparison?: {
      passed?: boolean;
      maxFinalStateAbsDiff?: number;
      maxTrajectoryAbsDiff?: number;
      maxJacobianAbsDiff?: number;
    } | null;
  } | null;
  nChainVariational?: {
    backend?: string;
    links?: number;
    dimension?: number;
    comparison?: { passed?: boolean; ftleAbsDiff?: number; clv?: { passed?: boolean } } | null;
  } | null;
}

interface GpuAdapterMatrixEvidence {
  status?: string;
  coverage?: { passed?: number; required?: number; missing?: number; failed?: number };
  rows?: Array<{ vendor?: string; status?: string; nChainPassed?: boolean; nChainDimension?: number | null }>;
  caveat?: string;
}

const hardwareEvidence = await readJson<WebGpuHardwareEvidence>('reports/webgpu-hardware-validation.json');
const gpuBenchmarkLadder = await readJson<GpuBenchmarkLadderEvidence>('reports/gpu-benchmark-ladder.json');
const gpuAdapterMatrix = await readJson<GpuAdapterMatrixEvidence>('reports/gpu-adapter-matrix.json');
const hasNavigatorGpu = typeof navigator !== 'undefined' && Boolean((navigator as unknown as { gpu?: unknown }).gpu);
const summary = {
  schemaVersion: 'pendulum-gpu-scale-validation/v3',
  generatedAt: new Date().toISOString(),
  hardwareWebGpuAvailable: hasNavigatorGpu,
  verdict: hardwareEvidence?.status === 'pass'
    ? 'hardware-webgpu-oracle-gates-passed'
    : hasNavigatorGpu ? 'hardware-webgpu-path-available' : 'cpu-reference-mock-and-contract-gates-ready',
  hardwareEvidence,
  gpuBenchmarkLadder,
  gpuAdapterMatrix,
  contracts: GPU_SCALE_VALIDATION_CONTRACTS,
  cpuReference: {
    ensemble: {
      backend: ensemble.backend,
      n: ensemble.n,
      steps: ensemble.steps,
      dt: ensemble.dt,
      rmsSpread: stats.rmsSpread,
      flipFraction: stats.flipFraction,
      f32ReductionOracle: reductionOracle,
      gpuSideReductionOracle: hardwareReductionOracle,
      gpuSideReductionAvailable: hardwareReduction !== null
    },
    basin: {
      backend: basin.backend,
      width: basin.width,
      height: basin.height,
      validation: basin.validation,
      labelHash: hashText(Array.from(basin.labels).join(',')).slice(0, 16)
    },
    sweep: {
      backend: sweep.backend,
      width: sweep.width,
      height: sweep.height,
      validation: sweep.validation,
      lambdaHash: hashText(Array.from(sweep.values).map((v) => v.toPrecision(8)).join(',')).slice(0, 16)
    }
  },
  promotionGates: {
    lyapunovSpectrum: lyapunovAccelerationProbe,
    clv: clvAccelerationProbe,
    ftleField: ftleAccelerationProbe
  }
};

const lines = [
  '# GPU / Scale Validation Contract',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Verdict: **${summary.verdict}**`,
  '',
  'This report deliberately separates scientific trust from acceleration. The CPU f64 path is the oracle; WebGPU may accelerate only when it either validates against CPU probes or falls back to CPU.',
  '',
  '## Contracts',
  '',
  '| ID | CPU Reference | Accelerated Path | Acceptance Rule | Caveat |',
  '|---|---|---|---|---|'
];
for (const contract of GPU_SCALE_VALIDATION_CONTRACTS) {
  lines.push(`| ${contract.id} | ${contract.cpuReference} | ${contract.acceleratedPath} | ${contract.acceptanceRule} | ${contract.caveat} |`);
}
lines.push(
  '',
  '## Current CPU Reference Sample',
  '',
  '| Probe | Backend | Size | Hash / Metric |',
  '|---|---|---:|---|',
  `| ensemble | ${ensemble.backend} | ${ensemble.n} | rmsSpread=${stats.rmsSpread.toPrecision(5)}, flipFraction=${stats.flipFraction.toPrecision(4)} |`,
  `| ensemble reduction oracle | f32 candidate vs CPU f64 | ${ensemble.n} | pass=${reductionOracle.passed}, maxMeanDiff=${reductionOracle.maxMeanAbsDiff.toExponential(3)}, maxCovDiff=${reductionOracle.maxCovarianceAbsDiff.toExponential(3)} |`,
  `| GPU-side reduction oracle | ${hardwareReduction ? 'webgpu' : 'unavailable in this runtime'} | ${ensemble.n} | ${hardwareReductionOracle ? `pass=${hardwareReductionOracle.passed}, maxMeanDiff=${hardwareReductionOracle.maxMeanAbsDiff.toExponential(3)}` : 'requires real WebGPU adapter'} |`,
  `| hardware report reduction oracle | ${hardwareEvidence?.ensemble?.backend ?? 'no report'} | 25 | pass=${String(hardwareEvidence?.ensemble?.comparison?.passed ?? false)}, maxMeanDiff=${typeof hardwareEvidence?.ensemble?.comparison?.maxMeanAbsDiff === 'number' ? hardwareEvidence.ensemble.comparison.maxMeanAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report full-spectrum oracle | ${hardwareEvidence?.lyapunovSpectrum?.backend ?? 'no report'} | 4 exponents | pass=${String(hardwareEvidence?.lyapunovSpectrum?.comparison?.passed ?? false)}, spectrumDiff=${typeof hardwareEvidence?.lyapunovSpectrum?.comparison?.metrics?.spectrumMaxAbsDiff === 'number' ? hardwareEvidence.lyapunovSpectrum.comparison.metrics.spectrumMaxAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report CLV oracle | ${hardwareEvidence?.clv?.backend ?? 'no report'} | 4 exponents | pass=${String(hardwareEvidence?.clv?.comparison?.passed ?? false)}, exponentDiff=${typeof hardwareEvidence?.clv?.comparison?.metrics?.exponentMaxAbsDiff === 'number' ? hardwareEvidence.clv.comparison.metrics.exponentMaxAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report variational-FTLE oracle | ${hardwareEvidence?.variationalFtleField?.backend ?? 'no report'} | 4x4 | pass=${String(hardwareEvidence?.variationalFtleField?.comparison?.passed ?? false)}, maxDiff=${typeof hardwareEvidence?.variationalFtleField?.comparison?.metrics?.fieldMaxAbsDiff === 'number' ? hardwareEvidence.variationalFtleField.comparison.metrics.fieldMaxAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report N-chain trajectory/tape oracle | ${hardwareEvidence?.nChainTrajectoryTape?.backend ?? 'no report'} | ${hardwareEvidence?.nChainTrajectoryTape?.dimension ?? 'n/a'}D | pass=${String(hardwareEvidence?.nChainTrajectoryTape?.comparison?.passed ?? false)}, trajectoryDiff=${typeof hardwareEvidence?.nChainTrajectoryTape?.comparison?.maxTrajectoryAbsDiff === 'number' ? hardwareEvidence.nChainTrajectoryTape.comparison.maxTrajectoryAbsDiff.toExponential(3) : 'n/a'}, jacobianDiff=${typeof hardwareEvidence?.nChainTrajectoryTape?.comparison?.maxJacobianAbsDiff === 'number' ? hardwareEvidence.nChainTrajectoryTape.comparison.maxJacobianAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report N-chain STM/QR oracle | ${hardwareEvidence?.nChainVariational?.backend ?? 'no report'} | ${hardwareEvidence?.nChainVariational?.dimension ?? 'n/a'}D | pass=${String(hardwareEvidence?.nChainVariational?.comparison?.passed ?? false)}, CLV=${String(hardwareEvidence?.nChainVariational?.comparison?.clv?.passed ?? false)}, FTLE diff=${typeof hardwareEvidence?.nChainVariational?.comparison?.ftleAbsDiff === 'number' ? hardwareEvidence.nChainVariational.comparison.ftleAbsDiff.toExponential(3) : 'n/a'} |`,
  `| GPU benchmark ladder | ${gpuBenchmarkLadder?.status ?? 'no report'} | adapter | vendor=${gpuBenchmarkLadder?.adapter?.vendor ?? 'n/a'}, arch=${gpuBenchmarkLadder?.adapter?.architecture ?? 'n/a'} |`,
  `| GPU ladder ensemble reductions | ${gpuBenchmarkLadder?.ensemble?.allReductionComparisonsPassed ? 'pass' : 'missing/fail'} | horizons | maxMeanDrift=${typeof gpuBenchmarkLadder?.ensemble?.maxIntegrationMeanDrift === 'number' ? gpuBenchmarkLadder.ensemble.maxIntegrationMeanDrift.toExponential(3) : 'n/a'}, maxCovDrift=${typeof gpuBenchmarkLadder?.ensemble?.maxIntegrationCovarianceDrift === 'number' ? gpuBenchmarkLadder.ensemble.maxIntegrationCovarianceDrift.toExponential(3) : 'n/a'} |`,
  `| GPU ladder full-spectrum sensitivity | ${gpuBenchmarkLadder?.lyapunovSpectrum?.allPromotionComparisonsPassed ? 'pass' : 'missing/fail'} | horizons | adjacentShift=${typeof gpuBenchmarkLadder?.lyapunovSpectrum?.maxAdjacentSpectrumShift === 'number' ? gpuBenchmarkLadder.lyapunovSpectrum.maxAdjacentSpectrumShift.toExponential(3) : 'n/a'} |`,
  `| GPU ladder N-chain trajectory/tape | ${gpuBenchmarkLadder?.nChainTrajectoryTape?.backend ?? 'no report'} | ${gpuBenchmarkLadder?.nChainTrajectoryTape?.dimension ?? 'n/a'}D | pass=${String(gpuBenchmarkLadder?.nChainTrajectoryTape?.comparison?.passed ?? false)}, jacobianDiff=${typeof gpuBenchmarkLadder?.nChainTrajectoryTape?.comparison?.maxJacobianAbsDiff === 'number' ? gpuBenchmarkLadder.nChainTrajectoryTape.comparison.maxJacobianAbsDiff.toExponential(3) : 'n/a'} |`,
  `| GPU ladder N-chain STM/QR | ${gpuBenchmarkLadder?.nChainVariational?.backend ?? 'no report'} | ${gpuBenchmarkLadder?.nChainVariational?.dimension ?? 'n/a'}D | pass=${String(gpuBenchmarkLadder?.nChainVariational?.comparison?.passed ?? false)}, FTLE diff=${typeof gpuBenchmarkLadder?.nChainVariational?.comparison?.ftleAbsDiff === 'number' ? gpuBenchmarkLadder.nChainVariational.comparison.ftleAbsDiff.toExponential(3) : 'n/a'} |`,
  `| physical adapter matrix | ${gpuAdapterMatrix?.status ?? 'no report'} | ${gpuAdapterMatrix?.coverage?.passed ?? 0}/${gpuAdapterMatrix?.coverage?.required ?? 3} vendors | missing=${gpuAdapterMatrix?.coverage?.missing ?? 3}, failed=${gpuAdapterMatrix?.coverage?.failed ?? 0} |`,
  `| flip basin | ${basin.backend} | ${basin.width}x${basin.height} | labelHash=${summary.cpuReference.basin.labelHash} |`,
  `| sweep lambda | ${sweep.backend} | ${sweep.width}x${sweep.height} | lambdaHash=${summary.cpuReference.sweep.lambdaHash} |`,
  `| CLV promotion gate | contract probe | 2 exponents | pass=${clvAccelerationProbe.passed}, exponentDiff=${Number(clvAccelerationProbe.metrics.exponentMaxAbsDiff).toExponential(3)} |`,
  `| full-spectrum promotion gate | contract probe | 4 exponents | pass=${lyapunovAccelerationProbe.passed}, spectrumDiff=${Number(lyapunovAccelerationProbe.metrics.spectrumMaxAbsDiff).toExponential(3)} |`,
  `| FTLE promotion gate | contract probe | 2x2 | pass=${ftleAccelerationProbe.passed}, maxDiff=${Number(ftleAccelerationProbe.metrics.fieldMaxAbsDiff).toExponential(3)} |`,
  '',
  '## CI Evidence',
  '',
  '- `tests/gpu-ensemble.test.ts` verifies CPU fallback and forceCpu A/B control.',
  '- `tests/gpu-fields-validation.test.ts` installs a mock WebGPU device and proves accept/fallback behavior.',
  '- `tests/ensemble-statistics.test.ts` pins the f64 reduction oracle and the f32-candidate comparison gate.',
  '- `e2e/webgpu-hardware-reductions.spec.ts` is the hardware-only gate: it fails unless a real adapter returns `backend=webgpu`, the GPU-side reduction matches the CPU oracle, and the WebGPU full-spectrum, CLV, variational-FTLE, N-chain trajectory/tape, and N-chain STM/QR candidates pass their CPU f64 promotion gates.',
  '- `npm run benchmark:gpu-ladder` records adapter metadata, f32/f64 horizon drift, full-spectrum horizon sensitivity, 4D CLV/FTLE metrics, the N<=3 N-chain trajectory/tape promotion result, and the 6D N-chain STM/QR promotion result.',
  '- `npm run benchmark:gpu-matrix` accepts only physical Intel, NVIDIA, and AMD ladder artifacts; absent vendors remain explicit `missing` rows.',
  '',
  '## CLV / FTLE Promotion Gate',
  '',
  'CLV, full-spectrum, and variational FTLE acceleration now has executable comparison contracts, 4D double-pendulum WebGPU candidates, an N<=3 N-chain nonlinear trajectory/Jacobian-tape candidate, and a tiled N-chain STM/QR path validated at 6D. The N-chain trajectory/tape path is promoted only when the same-run CPU f64 trajectory, final state, and Jacobian tape all match declared tolerances; otherwise the f64 tape is used. Downstream N-chain science still requires the final CLV/FTLE oracle gate, attaches Trust Inspector caveats, and fails closed when validation is unavailable.',
  ''
);

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-scale-validation.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-scale-validation.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
