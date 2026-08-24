import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { evidenceSourceArtifacts, validateClaimRegistry } from '../src/research/claimRegistry';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function repositoryContract(): Promise<{
  registry: unknown;
  evidence: unknown;
  packageScripts: Record<string, unknown>;
  existingArtifacts: Set<string>;
}> {
  const [registry, evidence, packageValue] = await Promise.all([
    readJson('config/claim-registry.json'),
    readJson('reports/evidence-summary.json'),
    readJson('package.json')
  ]);
  const packageJson = packageValue as { scripts: Record<string, unknown> };
  const artifacts = evidenceSourceArtifacts(evidence);
  await Promise.all(artifacts.map((artifact) => access(artifact)));
  return { registry, evidence, packageScripts: packageJson.scripts, existingArtifacts: new Set(artifacts) };
}

describe('scientific claim registry', () => {
  it('covers every committed public evidence claim with reproducible, existing sources', async () => {
    const { registry, evidence, packageScripts, existingArtifacts } = await repositoryContract();
    expect(validateClaimRegistry(registry, evidence, { packageScripts, existingArtifacts })).toEqual({
      ok: true,
      problems: []
    });
    expect(packageScripts['claims:check']).toBe('tsx scripts/validate-claim-registry.ts');
    expect(packageScripts.verify).toContain('npm run claims:check');
  });

  it('rejects duplicate evidence ids and registry coverage gaps', async () => {
    const { registry, evidence, packageScripts, existingArtifacts } = await repositoryContract();
    const brokenRegistry = structuredClone(registry) as { claims: Array<Record<string, unknown>> };
    const brokenEvidence = structuredClone(evidence) as { claims: Array<Record<string, unknown>> };
    brokenRegistry.claims = brokenRegistry.claims.filter((claim) => claim.id !== 'validation.scipy.regular');
    const duplicate = brokenEvidence.claims.find((claim) => claim.id === 'tests.unit');
    if (!duplicate) throw new Error('tests.unit fixture is missing');
    brokenEvidence.claims.push(structuredClone(duplicate));

    const result = validateClaimRegistry(brokenRegistry, brokenEvidence, { packageScripts, existingArtifacts });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        'duplicate evidence-summary claim id: tests.unit',
        'evidence-summary claim is missing from registry: validation.scipy.regular'
      ])
    );
  });

  it('rejects ambiguous ownership, scope, source, reproduction, and invalidation metadata', async () => {
    const { registry, evidence, packageScripts, existingArtifacts } = await repositoryContract();
    const broken = structuredClone(registry) as { claims: Array<Record<string, unknown>> };
    const claim = broken.claims.find((entry) => entry.id === 'tests.unit');
    if (!claim) throw new Error('tests.unit fixture is missing');
    claim.owner = 'Quality Team';
    claim.scope = { category: 'marketing', statement: 'too short' };
    claim.sourceArtifact = 'reports/missing.json';
    claim.reproduce = 'npm run missing-script';
    claim.caveat = null;
    claim.invalidatedBy = [];

    const result = validateClaimRegistry(broken, evidence, { packageScripts, existingArtifacts });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        'registry claim tests.unit owner must be a lowercase kebab-case responsibility',
        'registry claim tests.unit scope.category is invalid',
        'registry claim tests.unit scope.statement must be a single-line statement of at least 20 characters',
        'registry claim tests.unit sourceArtifact is not declared by evidence-summary.sourceReports',
        'registry claim tests.unit sourceArtifact does not exist: reports/missing.json',
        'registry claim tests.unit sourceArtifact does not match evidence-summary sourceReport',
        'registry claim tests.unit reproduce must invoke a defined npm script without shell chaining',
        'registry claim tests.unit reproduce does not match evidence-summary reproduce',
        'registry claim tests.unit must define a caveat or at least one invalidating condition'
      ])
    );
  });
});
