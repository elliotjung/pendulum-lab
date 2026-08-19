import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, unknown>;

export interface ValidationRuntimeEvidence {
  id: 'internal-typescript' | 'scipy-python' | 'julia' | 'matlab';
  role: 'primary-implementation' | 'independent-oracle' | 'optional-independent-oracle';
  independentFromTypeScript: boolean;
  requiredForRelease: boolean;
  availability: 'available' | 'unavailable';
  status: 'pass' | 'fail' | 'not-run';
  evidencePath: string | null;
  evidenceSha256: string | null;
  command: string | null;
  implementation: string;
  validation: string;
  caveat: string;
}

export interface IndependentValidationScope {
  schemaVersion: 'pendulum-independent-validation-scope/v1';
  status: 'pass' | 'fail';
  policy: {
    minimumIndependentRuntimeCount: number;
    requiredRuntimeIds: string[];
    optionalRuntimeIds: string[];
    unavailableOptionalRuntimesDoNotFailRelease: true;
  };
  summary: {
    requiredPassed: number;
    requiredTotal: number;
    independentPassed: number;
    independentAvailable: number;
    optionalUnavailable: number;
  };
  runtimes: ValidationRuntimeEvidence[];
}

const outputPath = 'reports/independent-validation-scope.json';

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function loadEvidence(path: string): Promise<{ json: Json; digest: string }> {
  const bytes = await readFile(path);
  return { json: object(JSON.parse(bytes.toString('utf8'))), digest: sha256(bytes) };
}

export function buildIndependentValidationScope(input: {
  reference: Json;
  referenceSha256: string;
  scipy: Json;
  scipySha256: string;
  julia: Json;
  juliaSha256: string;
}): IndependentValidationScope {
  const referenceSummary = object(input.reference.summary);
  const referenceTotal = Number(referenceSummary.integrators);
  const referencePassed = Number(referenceSummary.passed);
  const internalPassed = Number.isInteger(referenceTotal) && referenceTotal > 0 && referencePassed === referenceTotal;

  const scipyCases = array(input.scipy.cases).map(object);
  const scipyPassed = scipyCases.length > 0 && scipyCases.every((item) => item.pass === true);
  const scipySolvers = [...new Set(scipyCases.map((item) => String(item.scipyMethod ?? '')).filter(Boolean))];

  const juliaRows = array(input.julia.rows);
  const juliaPassed = input.julia.status === 'pass' && juliaRows.length > 0;

  const runtimes: ValidationRuntimeEvidence[] = [
    {
      id: 'internal-typescript',
      role: 'primary-implementation',
      independentFromTypeScript: false,
      requiredForRelease: true,
      availability: 'available',
      status: internalPassed ? 'pass' : 'fail',
      evidencePath: 'reports/validation-reference.json',
      evidenceSha256: input.referenceSha256,
      command: 'npm run validate:reference',
      implementation: `TypeScript integrator registry (${String(input.reference.referenceMethod ?? 'reference method')})`,
      validation: `${referencePassed}/${referenceTotal} internal integrator checks passed`,
      caveat: 'This is the product implementation validating itself; it is not counted as an independent runtime.'
    },
    {
      id: 'scipy-python',
      role: 'independent-oracle',
      independentFromTypeScript: true,
      requiredForRelease: true,
      availability: 'available',
      status: scipyPassed ? 'pass' : 'fail',
      evidencePath: 'reports/cross-validation.json',
      evidenceSha256: input.scipySha256,
      command: 'npm run validate:cross',
      implementation: scipySolvers.join('; ') || 'SciPy solve_ivp',
      validation: `${scipyCases.filter((item) => item.pass === true).length}/${scipyCases.length} trajectory comparisons passed`,
      caveat: 'Independent runtime and solver implementation; agreement is tolerance-based rather than bitwise.'
    },
    {
      id: 'julia',
      role: 'independent-oracle',
      independentFromTypeScript: true,
      requiredForRelease: true,
      availability: 'available',
      status: juliaPassed ? 'pass' : 'fail',
      evidencePath: 'reports/julia-comparison.json',
      evidenceSha256: input.juliaSha256,
      command: 'npm run validate:julia',
      implementation: String(input.julia.solverReference ?? 'OrdinaryDiffEq.jl'),
      validation: `${juliaRows.length} early-time state comparisons plus long-horizon energy drift`,
      caveat: String(
        input.julia.caveat ?? 'Pointwise chaotic trajectories are compared only before the predictability horizon.'
      )
    },
    {
      id: 'matlab',
      role: 'optional-independent-oracle',
      independentFromTypeScript: true,
      requiredForRelease: false,
      availability: 'unavailable',
      status: 'not-run',
      evidencePath: null,
      evidenceSha256: null,
      command: null,
      implementation: 'MATLAB (licensed runtime not configured)',
      validation: 'No MATLAB artifact is present and no MATLAB result is claimed.',
      caveat:
        'Optional expansion only. CI has neither a configured MATLAB runner nor a project license; absence does not weaken the two available independent-runtime checks.'
    }
  ];

  const required = runtimes.filter((item) => item.requiredForRelease);
  const independent = runtimes.filter((item) => item.independentFromTypeScript && item.availability === 'available');
  const minimumIndependentRuntimeCount = 2;
  const requiredPassed = required.filter((item) => item.status === 'pass').length;
  const independentPassed = independent.filter((item) => item.status === 'pass').length;

  return {
    schemaVersion: 'pendulum-independent-validation-scope/v1',
    status: requiredPassed === required.length && independentPassed >= minimumIndependentRuntimeCount ? 'pass' : 'fail',
    policy: {
      minimumIndependentRuntimeCount,
      requiredRuntimeIds: required.map((item) => item.id),
      optionalRuntimeIds: runtimes.filter((item) => !item.requiredForRelease).map((item) => item.id),
      unavailableOptionalRuntimesDoNotFailRelease: true
    },
    summary: {
      requiredPassed,
      requiredTotal: required.length,
      independentPassed,
      independentAvailable: independent.length,
      optionalUnavailable: runtimes.filter((item) => !item.requiredForRelease && item.availability === 'unavailable')
        .length
    },
    runtimes
  };
}

async function main(): Promise<void> {
  const [reference, scipy, julia] = await Promise.all([
    loadEvidence('reports/validation-reference.json'),
    loadEvidence('reports/cross-validation.json'),
    loadEvidence('reports/julia-comparison.json')
  ]);
  const report = buildIndependentValidationScope({
    reference: reference.json,
    referenceSha256: reference.digest,
    scipy: scipy.json,
    scipySha256: scipy.digest,
    julia: julia.json,
    juliaSha256: julia.digest
  });
  if (report.status !== 'pass') {
    throw new Error('required TypeScript/SciPy/Julia validation evidence is missing or failed');
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    await writeFile(outputPath, serialized, 'utf8');
    console.log(`Wrote ${outputPath}`);
    return;
  }

  const committed = await readFile(outputPath, 'utf8').catch(() => '');
  if (committed !== serialized) {
    throw new Error(`${outputPath} is stale; run npm run validate:scope:refresh and commit the result`);
  }
  console.log(
    `Independent validation scope passed: ${report.summary.independentPassed} external runtimes; MATLAB explicitly unavailable/optional`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  await main();
}
