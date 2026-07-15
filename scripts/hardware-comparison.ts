/**
 * Theory vs measured hardware: fit the platform's double-pendulum model to a
 * video-tracked dataset and report how well (and how identifiably) the physics
 * explains the measurement.
 *
 * This is the platform's *parameter extraction* lane (the TCAD habit: fit a
 * physical model's coefficients to measured device data with the model's own
 * solver in the loop):
 *
 *   tracked CSV (pixels) → angle extraction (scale-free) →
 *   Levenberg–Marquardt over {l1, l2, g} with masses/damping held at their
 *   independently measured values → residual + uncertainty report.
 *
 * Key physics point: pixel→meter calibration is NOT needed. Angles are ratios
 * of pixel differences, and the fitted lengths/g come from the *dynamics*
 * (timing of the oscillation), not from image geometry.
 *
 * Inputs:  --csv  data CSV (default data/experimental/double-pendulum-tracker.csv)
 *          --meta sidecar JSON with pivot/yAxis/fixed values/estimate spec
 *                 (default: CSV path with .meta.json)
 * Outputs: reports/hardware-comparison.json + .md
 *
 * Run: npm run compare:hardware
 * Chapter: documents/hardware-validation.md
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseObservedDoublePendulumCsv } from '../src/research/experimentalDataImport';
import { fitDoublePendulum, type DoublePendulumParameterName } from '../src/research/parameterEstimation';
import type { PendulumParameters } from '../src/types/domain';

interface FixtureMeta {
  schemaVersion: string;
  provenance?: { kind?: string; realFootage?: boolean; note?: string; seed?: number; generator?: string };
  import: { pivot: { x: number; y: number }; yAxis: 'down' | 'up' };
  protocol?: string;
  truth?: Partial<Record<'m1' | 'm2' | 'l1' | 'l2' | 'g' | 'gamma', number>> & { initialState?: number[] };
  fit: {
    estimate: DoublePendulumParameterName[];
    initialGuess: number[];
    fixed: { m1: number; m2: number; gamma: number };
  };
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const csvPath = argValue('--csv') ?? 'data/experimental/double-pendulum-tracker.csv';
  const metaPath = argValue('--meta') ?? csvPath.replace(/\.csv$/i, '.meta.json');

  const [csvText, metaText] = await Promise.all([readFile(csvPath, 'utf8'), readFile(metaPath, 'utf8')]);
  const meta = JSON.parse(metaText) as FixtureMeta;

  const observation = parseObservedDoublePendulumCsv(csvText, {
    pivot: meta.import.pivot,
    yAxis: meta.import.yAxis
  });

  // Release-from-rest protocol: theta0 from the first sample, omega0 = 0.
  const theta10 = observation.angles[0]![0];
  const theta20 = observation.angles[0]![1];

  const base: PendulumParameters = {
    m1: meta.fit.fixed.m1,
    m2: meta.fit.fixed.m2,
    l1: meta.fit.initialGuess[meta.fit.estimate.indexOf('l1')] ?? 0.3,
    l2: meta.fit.initialGuess[meta.fit.estimate.indexOf('l2')] ?? 0.3,
    g: meta.fit.initialGuess[meta.fit.estimate.indexOf('g')] ?? 9.81
  };

  const started = Date.now();
  const fit = fitDoublePendulum(observation, {
    // Release-from-rest protocol: omega0 = 0 is a *protocol* fact, but theta0
    // comes from the same noisy tracker as every other sample — so the initial
    // angles are co-estimated (seeded from the first sample) instead of being
    // frozen at one noisy measurement, which would bias the physical
    // parameters systematically.
    initialState: [theta10, theta20, 0, 0],
    estimateInitialAngles: true,
    base,
    gamma: meta.fit.fixed.gamma,
    estimate: meta.fit.estimate,
    initialGuess: meta.fit.initialGuess,
    dt: 2e-3
  });
  const seconds = (Date.now() - started) / 1000;

  const rows = meta.fit.estimate.map((name, index) => {
    const estimated = fit.parameters[index]!;
    const sigma = fit.standardErrors[index] ?? NaN;
    const truth = meta.truth?.[name];
    return {
      parameter: name,
      estimated,
      standardError: sigma,
      nominal: truth ?? null,
      relativeErrorVsNominal: truth !== undefined && truth !== 0 ? (estimated - truth) / truth : null,
      withinTwoSigmaOfNominal:
        truth !== undefined && Number.isFinite(sigma) ? Math.abs(estimated - truth) <= 2 * sigma : null
    };
  });

  // Residual trace for the report figure: measured vs fitted theta1 (unwrapped).
  const residualSummary = {
    rmseRadians: fit.rmse,
    rmseDegrees: (fit.rmse * 180) / Math.PI,
    samples: observation.times.length,
    horizonSeconds: observation.times[observation.times.length - 1]
  };

  const report = {
    schemaVersion: 'hardware-comparison/v1',
    generatedAt: new Date().toISOString(),
    dataset: {
      csv: csvPath.replace(/\\/g, '/'),
      meta: metaPath.replace(/\\/g, '/'),
      provenance: meta.provenance ?? { kind: 'unspecified' },
      protocol: meta.protocol ?? 'unspecified'
    },
    method: {
      import:
        'pixel coordinates -> scale-free relative angles (atan2 of pixel differences; pivot + y-down handled by the importer)',
      forwardModel: 'rhsDouble integrated with fixed-step RK4 (dt = 2e-3); release-from-rest (omega0 = 0 by protocol)',
      optimizer:
        'Levenberg-Marquardt over ' +
        meta.fit.estimate.join(', ') +
        ' + co-estimated initial angles, with masses/damping fixed at independently measured values',
      uncertainty: 'linearized covariance s^2 (J^T J)^-1 at the optimum; 2-sigma comparison against nominal values'
    },
    fit: {
      converged: fit.converged,
      status: fit.status,
      iterations: fit.iterations,
      seconds,
      ...residualSummary
    },
    parameters: rows,
    correlation: fit.correlation,
    parametersFull: fit.parametersFull,
    initialAnglesEstimated: fit.initialAngles,
    initialAnglesFirstSample: [theta10, theta20],
    honesty:
      meta.provenance?.realFootage === false
        ? 'Dataset is a synthetic camera emulation (seeded, reproducible); the pipeline is real-data-ready — see documents/hardware-validation.md for the capture protocol.'
        : 'Dataset provenance as recorded in the sidecar metadata.'
  };

  await mkdir('reports', { recursive: true });
  await writeFile('reports/hardware-comparison.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Hardware Comparison: theory vs tracked measurement',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Dataset: \`${report.dataset.csv}\` (${residualSummary.samples} samples over ${residualSummary.horizonSeconds?.toFixed(2)} s)`,
    '',
    `Provenance: ${meta.provenance?.kind ?? 'unspecified'}${meta.provenance?.realFootage === false ? ' (synthetic camera emulation - not real footage yet)' : ''}`,
    '',
    `Fit: **${fit.status}** in ${fit.iterations} iterations (${seconds.toFixed(1)} s); angle RMSE ${(fit.rmse * 1000).toFixed(2)} mrad (${residualSummary.rmseDegrees.toFixed(3)} deg).`,
    '',
    '| parameter | estimated | 1-sigma | nominal | rel. error | within 2-sigma |',
    '|---|---:|---:|---:|---:|---|',
    ...rows.map(
      (row) =>
        `| ${row.parameter} | ${row.estimated.toFixed(5)} | ${Number.isFinite(row.standardError) ? row.standardError.toExponential(2) : 'n/a'} | ${row.nominal === null ? 'n/a' : row.nominal.toFixed(5)} | ${row.relativeErrorVsNominal === null ? 'n/a' : (100 * row.relativeErrorVsNominal).toFixed(3) + '%'} | ${row.withinTwoSigmaOfNominal === null ? 'n/a' : row.withinTwoSigmaOfNominal ? 'yes' : 'NO'} |`
    ),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm run fixture:hardware   # regenerate the seeded fixture (or drop in a real tracked CSV)',
    'npm run compare:hardware',
    '```',
    '',
    'Chapter: `documents/hardware-validation.md`.',
    ''
  ];
  await writeFile('reports/hardware-comparison.md', `${md.join('\n')}\n`, 'utf8');

  console.log(md.join('\n'));
  if (!fit.converged) {
    console.error('hardware-comparison: fit did not converge');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
