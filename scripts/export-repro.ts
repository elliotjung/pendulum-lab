/**
 * Reproducibility-package export demo. Builds self-contained run manifests,
 * verifies each reproduces, and writes JSON + a Markdown methods/citation note
 * to reports/reproducibility/. Pure Node — run with `npm run export:repro`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildReproPackage, verifyReproPackage, reproMethodsText, type ReproRun } from '../src/research/reproPackage';

const pkgJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const libraryVersion = pkgJson.version;

const runs: ReproRun[] = [
  {
    spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    method: 'gbs',
    dt: 0.005,
    steps: 4000,
    state0: [2.0, 2.0, 0, 0],
    seed: 1
  },
  {
    spec: { kind: 'driven', g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 },
    method: 'dopri5',
    dt: 0.005,
    steps: 8000,
    state0: [0.2, 0, 0],
    seed: 7
  }
];

await mkdir('reports/reproducibility', { recursive: true });

let allOk = true;
for (const run of runs) {
  const pkg = buildReproPackage(run, { libraryVersion });
  const verification = verifyReproPackage(pkg);
  allOk &&= verification.ok;

  const base = `reports/reproducibility/${run.spec.kind}-${pkg.inputHash}`;
  await writeFile(`${base}.json`, JSON.stringify({ package: pkg, verification }, null, 2));
  await writeFile(`${base}.md`, reproMethodsText(pkg));

  console.log(
    `${run.spec.kind.padEnd(7)} ${run.method.padEnd(7)} hash ${pkg.inputHash} ` +
      `drift ${pkg.result.energyDrift.toExponential(2)} λ ${pkg.result.lambdaMax?.toFixed(4) ?? 'n/a'} ` +
      `→ verify ${verification.ok ? 'OK' : 'FAIL'} (Δstate ${verification.maxStateDiff.toExponential(2)})`
  );
}

if (!allOk) {
  console.error('WARNING: at least one reproducibility package failed verification.');
  process.exitCode = 1;
}
