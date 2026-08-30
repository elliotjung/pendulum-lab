import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

interface EnsembleMember {
  id?: string;
  role?: string;
  initialState?: number[];
  color?: string;
  legend?: string;
}

export interface EnsembleInterpretation {
  schemaVersion?: string;
  stages?: string[];
  referenceInitialState?: number[];
  perturbation?: {
    component?: string;
    componentIndex?: number;
    delta?: number;
    unit?: string;
    model?: string;
    seed?: number | null;
  };
  members?: EnsembleMember[];
  horizon?: { duration?: number; unit?: string; finiteTime?: boolean };
  numerics?: { integrator?: string; stepPolicy?: string };
  summary?: {
    observable?: string;
    quantiles?: { p05?: number; p50?: number; p95?: number };
    uncertaintyMethod?: string;
  };
  interpretation?: { question?: string; nonClaim?: string };
}

function populated(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((component) => Number.isFinite(component));
}

export function validateEnsembleInterpretation(report: EnsembleInterpretation): string[] {
  const problems: string[] = [];
  if (report.schemaVersion !== 'pendulum-ensemble-interpretation/v1') {
    problems.push('unsupported ensemble interpretation schema');
  }
  if (JSON.stringify(report.stages) !== JSON.stringify(['reference', 'single-perturbation', 'ensemble'])) {
    problems.push('interpretation must progress from reference to one perturbation to ensemble');
  }

  const reference = report.referenceInitialState;
  const perturbation = report.perturbation;
  const componentIndex = perturbation?.componentIndex;
  if (!finiteVector(reference)) problems.push('reference initial state must be a non-empty finite vector');
  if (
    !populated(perturbation?.component) ||
    !Number.isSafeInteger(componentIndex) ||
    !(Number(componentIndex) >= 0) ||
    !Number.isFinite(perturbation?.delta) ||
    perturbation?.delta === 0 ||
    !['rad', 'deg', 'rad/s', 'deg/s'].includes(perturbation?.unit ?? '') ||
    !populated(perturbation?.model) ||
    !(perturbation?.seed === null || Number.isSafeInteger(perturbation?.seed))
  ) {
    problems.push('perturbation requires one component/index, a non-zero delta, units, model, and integer/null seed');
  }
  if (finiteVector(reference) && Number(componentIndex) >= reference.length) {
    problems.push('perturbation component index is outside the reference state');
  }

  const members = report.members ?? [];
  if (members.length < 2) problems.push('ensemble must retain at least a reference and one perturbation');
  const references = members.filter((member) => member.role === 'reference');
  if (references.length !== 1) problems.push('ensemble must contain exactly one reference member');
  const ids = new Set<string>();
  const colors = new Set<string>();
  let explicitDeltaFound = false;
  for (const member of members) {
    if (!populated(member.id) || ids.has(member.id)) problems.push('every member requires a unique id');
    else ids.add(member.id);
    if (!['reference', 'perturbation'].includes(member.role ?? '') || !finiteVector(member.initialState)) {
      problems.push('every member requires a role and finite initial state');
      continue;
    }
    if (!populated(member.color) || !populated(member.legend) || colors.has(member.color ?? '')) {
      problems.push('every member requires a distinct color token and an explicit legend');
    } else {
      colors.add(member.color);
    }
    if (!finiteVector(reference) || member.initialState.length !== reference.length) {
      problems.push('member initial states must match the reference dimension');
      continue;
    }
    if (member.role === 'reference') {
      if (member.initialState.some((value, index) => value !== reference[index])) {
        problems.push('reference member must preserve the declared reference initial state');
      }
      continue;
    }
    for (let index = 0; index < reference.length; index += 1) {
      if (index !== componentIndex && member.initialState[index] !== reference[index]) {
        problems.push('perturbation members may change only the declared component');
      }
    }
    const observedDelta =
      Number(member.initialState[Number(componentIndex)]) - Number(reference[Number(componentIndex)]);
    if (Math.abs(Math.abs(observedDelta) - Math.abs(Number(perturbation?.delta))) <= 32 * Number.EPSILON) {
      explicitDeltaFound = true;
    }
  }
  if (!explicitDeltaFound) problems.push('at least one perturbation member must apply the declared delta exactly');

  if (!(report.horizon?.duration! > 0) || report.horizon?.unit !== 's' || report.horizon?.finiteTime !== true) {
    problems.push('horizon must be positive seconds and explicitly finite-time');
  }
  if (!populated(report.numerics?.integrator) || !populated(report.numerics?.stepPolicy)) {
    problems.push('numerical method and fixed/adaptive step policy are required');
  }
  const quantiles = report.summary?.quantiles;
  if (
    !populated(report.summary?.observable) ||
    !populated(report.summary?.uncertaintyMethod) ||
    !Number.isFinite(quantiles?.p05) ||
    !Number.isFinite(quantiles?.p50) ||
    !Number.isFinite(quantiles?.p95) ||
    Number(quantiles?.p05) > Number(quantiles?.p50) ||
    Number(quantiles?.p50) > Number(quantiles?.p95)
  ) {
    problems.push('summary requires an observable, ordered p05/p50/p95, and uncertainty method');
  }
  if (!populated(report.interpretation?.question) || !populated(report.interpretation?.nonClaim)) {
    problems.push('interpretation requires a question and an explicit finite-scope non-claim');
  }
  return [...new Set(problems)];
}

async function main(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) throw new Error('provide at least one ensemble interpretation JSON file');
  for (const path of paths) {
    const report = JSON.parse(await readFile(path, 'utf8')) as EnsembleInterpretation;
    const problems = validateEnsembleInterpretation(report);
    if (problems.length > 0) throw new Error(`${path}:\n- ${problems.join('\n- ')}`);
    console.log(`Validated ensemble interpretation contract: ${path}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
