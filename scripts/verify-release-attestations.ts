import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface VerificationResult {
  verificationResult?: {
    signature?: {
      certificate?: Record<string, unknown>;
    };
    verifiedTimestamps?: Array<Record<string, unknown>>;
    statement?: {
      subject?: Array<{ name?: string; digest?: Record<string, string> }>;
      predicateType?: string;
    };
  };
}

const repository = 'Elliot-Jung-17/pendulum-lab';
const signerWorkflow = 'Elliot-Jung-17/pendulum-lab/.github/workflows/release.yml';
const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const artifact = option('--artifact') ?? `tmp/release/${packageJson.name}-${packageJson.version}.tgz`;
const sourceRef = option('--source-ref');
const bytes = await readFile(artifact);
const localDigest = createHash('sha256').update(bytes).digest('hex');
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';

async function verify(predicateType: string): Promise<VerificationResult['verificationResult']> {
  const commandArgs = [
    'attestation', 'verify', artifact,
    '--repo', repository,
    '--signer-workflow', signerWorkflow,
    '--predicate-type', predicateType,
    '--format', 'json'
  ];
  if (sourceRef) commandArgs.push('--source-ref', sourceRef);
  let output = '';
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      output = execFileSync(gh, commandArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  if (!output) throw lastError instanceof Error ? lastError : new Error(`Unable to fetch ${predicateType} attestation.`);
  const entries = JSON.parse(output) as VerificationResult[];
  const result = entries[0]?.verificationResult;
  if (!result) throw new Error(`No verified ${predicateType} attestation was returned.`);
  const attestedDigest = result.statement?.subject?.[0]?.digest?.sha256;
  if (attestedDigest !== localDigest) {
    throw new Error(`Attested digest ${attestedDigest ?? 'missing'} does not match local SHA-256 ${localDigest}.`);
  }
  return result;
}

const predicates = [];
for (const predicateType of [
  'https://slsa.dev/provenance/v1',
  'https://cyclonedx.org/bom'
] as const) {
  const result = await verify(predicateType);
  const certificate = result?.signature?.certificate ?? {};
  const timestamp = result?.verifiedTimestamps?.[0] ?? {};
  predicates.push({
    predicateType: result?.statement?.predicateType ?? predicateType,
    status: 'verified',
    subject: result?.statement?.subject?.[0]?.name ?? null,
    sha256: result?.statement?.subject?.[0]?.digest?.sha256 ?? null,
    signerWorkflow: certificate.githubWorkflowName ?? null,
    sourceRepositoryDigest: certificate.sourceRepositoryDigest ?? null,
    sourceRepositoryRef: certificate.sourceRepositoryRef ?? null,
    runnerEnvironment: certificate.runnerEnvironment ?? null,
    invocation: certificate.runInvocationURI ?? null,
    certificateIdentity: certificate.subjectAlternativeName ?? null,
    transparencyLog: timestamp
  });
}

const report = {
  schemaVersion: 'pendulum-attestation-verification/v1',
  generatedAt: new Date().toISOString(),
  status: 'verified',
  repository,
  artifact: basename(artifact),
  sha256: localDigest,
  signerWorkflow,
  predicates
};

await writeFile('reports/attestation-verification.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
