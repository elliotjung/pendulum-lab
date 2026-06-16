/**
 * External cross-validation of the Neimark-Sacker rotation number: the
 * TypeScript engine's invariant-circle solver vs an *independent* SciPy/NumPy
 * reference (scripts/scipy_neimark_sacker.py — different language, the rotation
 * number obtained from numpy.linalg.eigvals at onset and from raw-map orbit
 * winding, neither using the engine's trigonometric collocation).
 *
 * For the delayed-logistic map the engine's `continueNeimarkSackerTorus` ρ and
 * its `planarMapRotationNumber` winding ρ are compared against SciPy's winding ρ
 * (must agree to ~1e-3 — same nonlinear quantity, two languages) and its linear
 * onset ρ = arg(λ)/2π (agrees to O(amplitude²), looser). All ρ → 1/6 at a = 2.
 *
 * Run: npm run validate:ns   (requires python + scipy on PATH)
 * Writes reports/ns-cross-validation.{json,md}.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { continueNeimarkSackerTorus, planarMapRotationNumber, type PlanarMapSystem } from '../src/chaos';

const delayedLogistic: PlanarMapSystem = {
  map: (s, a, out) => {
    out[0] = a * s[0]! * (1 - s[1]!);
    out[1] = s[0]!;
  },
  center: (a) => {
    const x = (a - 1) / a;
    return [x, x];
  }
};

interface ScipySample {
  a: number;
  rhoLinear: number | null;
  rhoWinding: number;
  modulus: number;
}

interface RowReport {
  a: number;
  scipyWinding: number;
  scipyLinear: number | null;
  engineCollocation: number;
  engineWinding: number;
  windingDiff: number;
  collocationVsLinearDiff: number;
  pass: boolean;
}

const fmt = (x: number): string => (Number.isFinite(x) ? x.toExponential(2) : String(x));

function buildRow(sample: ScipySample, collocationByA: Map<number, number>): RowReport {
  const { a } = sample;
  const center = (a - 1) / a;
  // Warm-started collocation ρ at this a (one continuation from a = 2.05 toward onset).
  const engineCollocation = collocationByA.get(Number(a.toFixed(3))) ?? NaN;
  const engineWinding = planarMapRotationNumber(delayedLogistic, a, [center, center], [center + 0.1, center], {
    iterations: 200000,
    transient: 20000
  });
  // Same nonlinear quantity (winding), two languages ⇒ tight bound.
  const windingDiff = Math.abs(engineWinding - sample.rhoWinding);
  // Collocation ρ vs the linear onset prediction ⇒ O(amplitude²) looser.
  const collocationVsLinearDiff = sample.rhoLinear !== null ? Math.abs(engineCollocation - sample.rhoLinear) : NaN;
  const pass = windingDiff < 3e-3 && Math.abs(engineCollocation - sample.rhoWinding) < 5e-3;
  return { a, scipyWinding: sample.rhoWinding, scipyLinear: sample.rhoLinear, engineCollocation, engineWinding, windingDiff, collocationVsLinearDiff, pass };
}

function markdown(rows: RowReport[]): string {
  const lines: string[] = [
    '# Neimark-Sacker rotation-number cross-validation',
    '',
    'Engine (`continueNeimarkSackerTorus`, `planarMapRotationNumber`) vs an independent',
    'SciPy/NumPy reference (`scripts/scipy_neimark_sacker.py`) on the delayed-logistic map.',
    'All rotation numbers → 1/6 ≈ 0.16667 at the NS onset a = 2.',
    '',
    '| a | SciPy winding ρ | engine winding ρ | engine collocation ρ | SciPy linear ρ | |Δwinding| | pass |',
    '|---|---|---|---|---|---|---|'
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.a.toFixed(3)} | ${r.scipyWinding.toFixed(6)} | ${r.engineWinding.toFixed(6)} | ${r.engineCollocation.toFixed(6)} | ${r.scipyLinear?.toFixed(6) ?? 'n/a'} | ${fmt(r.windingDiff)} | ${r.pass ? 'PASS' : 'FAIL'} |`
    );
  }
  lines.push(
    '',
    'The winding ρ is the same nonlinear quantity computed in two languages, so it must agree to ~1e-3;',
    'the collocation ρ is compared to SciPy\'s winding ρ on the same circle; SciPy\'s linear ρ = arg(λ)/2π',
    'is the onset prediction and differs by O(amplitude²) away from a = 2.',
    ''
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const probe = spawnSync('python', ['-c', 'import scipy, numpy'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    console.error('python + scipy/numpy not available — skipping NS cross-validation');
    process.exitCode = 2;
    return;
  }
  const run = spawnSync('python', ['scripts/scipy_neimark_sacker.py'], { encoding: 'utf8' });
  if (run.status !== 0) {
    console.error('scipy_neimark_sacker.py failed:\n', run.stderr);
    process.exitCode = 1;
    return;
  }
  const reference = JSON.parse(run.stdout) as { samples: ScipySample[] };
  // One warm-started continuation from a = 2.05 toward onset (the converged path);
  // cold single-point starts far from onset can land on a spurious curve.
  const continuation = continueNeimarkSackerTorus(delayedLogistic, {
    start: 2.05,
    end: 2.01,
    step: 0.01,
    initialAmplitude: 0.24,
    collocation: 31,
    tolerance: 1e-10,
    maxIterations: 60
  });
  const collocationByA = new Map<number, number>();
  for (const p of continuation.points) collocationByA.set(Number(p.parameter.toFixed(3)), p.rotationNumber);
  const rows = reference.samples.map((s) => buildRow(s, collocationByA));

  await mkdir('reports', { recursive: true });
  await writeFile('reports/ns-cross-validation.json', JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), 'utf8');
  await writeFile('reports/ns-cross-validation.md', markdown(rows), 'utf8');
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} a=${r.a.toFixed(3)}: engine winding ${r.engineWinding.toFixed(6)} vs scipy ${r.scipyWinding.toFixed(6)} (Δ ${fmt(r.windingDiff)}); collocation ${r.engineCollocation.toFixed(6)}`);
  }
  if (rows.some((r) => !r.pass)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
