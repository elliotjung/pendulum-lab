import { runChaosJob, type ChaosRequest, type ChaosResponse } from '../workers/chaosProtocol';
import { hashText } from './researchExportUtils';

/**
 * JSON-spec batch format for the headless research CLI: a single file declares
 * a list of named chaos jobs (the same declarative requests the worker runs),
 * the CLI executes them sequentially, and the results carry per-job hashes and
 * timings so a whole study is reproducible from one committed spec file.
 */

export const CLI_BATCH_SCHEMA = 'pendulum-cli-batch/v1';

const KNOWN_KINDS = new Set([
  'lyapunov',
  'lyapunovSpectrum',
  'bifurcation',
  'zeroOne',
  'clv',
  'basin',
  'rqa',
  'ftle',
  'studyPoint',
  'wadaConvergence',
  'codim2'
]);

export interface CliBatchJobSpec {
  /** Unique job name; becomes the request id and the result key. */
  name: string;
  /** Declarative chaos request without the id (the name supplies it). */
  request: Omit<ChaosRequest, 'id'>;
}

export interface CliBatchSpec {
  schemaVersion: typeof CLI_BATCH_SCHEMA;
  description?: string;
  jobs: CliBatchJobSpec[];
}

export interface CliBatchJobResult {
  name: string;
  kind: string;
  ok: boolean;
  elapsedMs: number;
  /** Hash of the request (reproducibility) and of the response (integrity). */
  requestHash: string;
  responseHash: string;
  response: ChaosResponse;
}

export interface CliBatchResult {
  schemaVersion: 'pendulum-cli-batch-results/v1';
  generatedAt: string;
  specHash: string;
  jobs: CliBatchJobResult[];
  passed: number;
  failed: number;
}

export function validateCliBatchSpec(value: unknown): { ok: boolean; problems: string[]; spec: CliBatchSpec | null } {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return { ok: false, problems: ['spec is not an object'], spec: null };
  }
  const spec = value as Partial<CliBatchSpec>;
  if (spec.schemaVersion !== CLI_BATCH_SCHEMA) problems.push(`schemaVersion must be ${CLI_BATCH_SCHEMA}`);
  if (!Array.isArray(spec.jobs) || spec.jobs.length === 0) {
    problems.push('jobs must be a non-empty array');
    return { ok: false, problems, spec: null };
  }
  const names = new Set<string>();
  spec.jobs.forEach((jobSpec, index) => {
    const job = jobSpec as Partial<CliBatchJobSpec>;
    if (typeof job?.name !== 'string' || job.name.length === 0) problems.push(`job ${index} is missing a name`);
    else if (names.has(job.name)) problems.push(`duplicate job name ${job.name}`);
    else names.add(job.name);
    const kind = (job?.request as { kind?: unknown } | undefined)?.kind;
    if (typeof kind !== 'string' || !KNOWN_KINDS.has(kind))
      problems.push(`job ${String(job?.name ?? index)} has unknown kind ${String(kind)}`);
  });
  return { ok: problems.length === 0, problems, spec: problems.length === 0 ? (value as CliBatchSpec) : null };
}

export function runCliBatch(
  spec: CliBatchSpec,
  runner: (request: ChaosRequest) => ChaosResponse = runChaosJob,
  now: () => number = () => Date.now()
): CliBatchResult {
  const jobs: CliBatchJobResult[] = [];
  for (const jobSpec of spec.jobs) {
    const request = { ...jobSpec.request, id: jobSpec.name } as ChaosRequest;
    const started = now();
    const response = runner(request);
    jobs.push({
      name: jobSpec.name,
      kind: request.kind,
      ok: response.ok,
      elapsedMs: now() - started,
      requestHash: hashText(JSON.stringify(request)),
      responseHash: hashText(JSON.stringify(response)),
      response
    });
  }
  return {
    schemaVersion: 'pendulum-cli-batch-results/v1',
    generatedAt: new Date().toISOString(),
    specHash: hashText(JSON.stringify(spec)),
    jobs,
    passed: jobs.filter((job) => job.ok).length,
    failed: jobs.filter((job) => !job.ok).length
  };
}
