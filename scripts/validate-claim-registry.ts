import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { registrySupportArtifacts, validateClaimRegistry } from '../src/research/claimRegistry';
import { SYSTEM_SPEC_KINDS } from '../src/physics/systemSpec';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const registryPath = process.env.PENDULUM_CLAIM_REGISTRY ?? 'config/claim-registry.json';
const strictEvidencePath = process.env.PENDULUM_CLAIM_EVIDENCE;

const [registry, packageValue] = await Promise.all([readJson(registryPath), readJson('package.json')]);
const evidence = strictEvidencePath ? await readJson(strictEvidencePath) : structuralEvidenceFor(registry);

const packageJson =
  packageValue !== null && typeof packageValue === 'object' && !Array.isArray(packageValue)
    ? (packageValue as Record<string, unknown>)
    : {};
const packageScripts =
  packageJson.scripts !== null && typeof packageJson.scripts === 'object' && !Array.isArray(packageJson.scripts)
    ? (packageJson.scripts as Record<string, unknown>)
    : {};

const existingArtifacts = new Set<string>();
const artifactSha256 = new Map<string, string>();
await Promise.all(
  [...new Set(registrySupportArtifacts(registry))].map(async (artifact) => {
    try {
      await access(artifact);
      existingArtifacts.add(artifact);
      artifactSha256.set(
        artifact,
        createHash('sha256')
          .update(await readFile(artifact))
          .digest('hex')
      );
    } catch {
      // The validator reports the missing path with its owning claim id.
    }
  })
);

const drillPath = registrySupportArtifacts(registry).find((artifact) => artifact.startsWith('tests/fixtures/'));
const incidentDrill = drillPath && existingArtifacts.has(drillPath) ? await readJson(drillPath) : null;
const validation = validateClaimRegistry(registry, evidence, {
  packageScripts,
  existingArtifacts,
  artifactSha256,
  incidentDrill,
  systemSpecKinds: SYSTEM_SPEC_KINDS,
  // `npm run verify` is a source-structure gate and runs before test:json.
  // Supplying an explicit evidence path switches this command into the strict
  // post-generation mode used by the Pages finalizer.
  requireEvidenceBindings: strictEvidencePath !== undefined
});
if (!validation.ok) {
  for (const problem of validation.problems) console.error(`claim registry: ${problem}`);
  process.exitCode = 1;
} else {
  const claimCount =
    registry !== null &&
    typeof registry === 'object' &&
    !Array.isArray(registry) &&
    Array.isArray((registry as Record<string, unknown>).claims)
      ? ((registry as Record<string, unknown>).claims as unknown[]).length
      : 0;
  console.log(`Claim registry gate passed (${claimCount} public evidence claims).`);
}

function structuralEvidenceFor(registryValue: unknown): unknown {
  if (registryValue === null || typeof registryValue !== 'object' || Array.isArray(registryValue)) return {};
  const registryObject = registryValue as Record<string, unknown>;
  const registryClaims = Array.isArray(registryObject.claims) ? registryObject.claims : [];
  const claims = registryClaims.flatMap((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
    const claim = value as Record<string, unknown>;
    if (typeof claim.id !== 'string' || typeof claim.sourceArtifact !== 'string') return [];
    return [
      {
        id: claim.id,
        sourceReport: claim.sourceArtifact,
        reproduce: claim.reproduce,
        caveat: claim.caveat,
        evidenceGeneratedAt: '1970-01-01T00:00:00.000Z'
      }
    ];
  });
  const reports = Object.fromEntries(claims.map((claim, index) => [`claim${index + 1}`, claim.sourceReport]));
  return {
    schemaVersion: 'pendulum-evidence-summary/v1',
    sourceReports: reports,
    sourceReportSha256: Object.fromEntries(Object.values(reports).map((path) => [path, '0'.repeat(64)])),
    claims
  };
}
