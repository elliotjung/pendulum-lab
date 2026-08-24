import { access, readFile } from 'node:fs/promises';
import { evidenceSourceArtifacts, validateClaimRegistry } from '../src/research/claimRegistry';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const registryPath = 'config/claim-registry.json';
const evidencePath = 'reports/evidence-summary.json';

const [registry, evidence, packageValue] = await Promise.all([
  readJson(registryPath),
  readJson(evidencePath),
  readJson('package.json')
]);

const packageJson =
  packageValue !== null && typeof packageValue === 'object' && !Array.isArray(packageValue)
    ? (packageValue as Record<string, unknown>)
    : {};
const packageScripts =
  packageJson.scripts !== null && typeof packageJson.scripts === 'object' && !Array.isArray(packageJson.scripts)
    ? (packageJson.scripts as Record<string, unknown>)
    : {};

const existingArtifacts = new Set<string>();
await Promise.all(
  evidenceSourceArtifacts(evidence).map(async (artifact) => {
    try {
      await access(artifact);
      existingArtifacts.add(artifact);
    } catch {
      // The validator reports the missing path with its owning claim id.
    }
  })
);

const validation = validateClaimRegistry(registry, evidence, { packageScripts, existingArtifacts });
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
