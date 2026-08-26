import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  deriveClaimDowngradeInputs,
  evaluateClaim,
  evaluateClaimRegistry,
  isQuantifiedPublicClaimValue,
  registrySupportArtifacts,
  unregisteredQuantifiedPublicClaimIds,
  validateClaimRegistry,
  type ClaimIncidentMetadata,
  type ClaimRegistry,
  type ClaimRegistryEntry,
  type ClaimRegistryValidationContext
} from '../src/research/claimRegistry';
import { SYSTEM_SPEC_KINDS } from '../src/physics/systemSpec';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function repositoryContract(): Promise<{
  registry: unknown;
  evidence: unknown;
  context: ClaimRegistryValidationContext;
}> {
  const [registry, packageValue] = await Promise.all([
    readJson('config/claim-registry.json'),
    readJson('package.json')
  ]);
  const typedRegistry = registry as ClaimRegistry;
  const generatedAt = '2026-08-20T00:00:00.000Z';
  const sourceCommit = 'a'.repeat(40);
  const sourceReports = Object.fromEntries(
    typedRegistry.claims.map((claim, index) => [`claim${index + 1}`, claim.sourceArtifact])
  );
  const status = new Map<string, string>([
    ['tests.unit', 'passed'],
    ['validation.scipy.regular', 'passed'],
    ['testing.mutation', 'low'],
    ['benchmark.energy.methods', 'measured'],
    ['gpu.vendor-matrix', 'partial'],
    ['publication.release', 'partial']
  ]);
  const displayValue = new Map<string, string>([
    ['tests.unit', '1600 / 1600 pass'],
    ['validation.scipy.regular', '~6e-14'],
    ['testing.mutation', '65.32%'],
    ['benchmark.energy.methods', '14 methods profiled'],
    ['gpu.vendor-matrix', '1 / 3 vendors'],
    ['publication.release', 'partial']
  ]);
  const evidence = {
    schemaVersion: 'pendulum-evidence-summary/v1',
    generatedAt,
    sourceReports,
    sourceReportSha256: Object.fromEntries(Object.values(sourceReports).map((path) => [path, 'b'.repeat(64)])),
    provenance: {
      sourceCommit,
      dirtyWorktree: false,
      expiresAt: '2026-09-03T00:00:00.000Z'
    },
    mutation: { status: 'low' },
    gpu: { status: 'partial' },
    publication: { status: 'partial' },
    claims: typedRegistry.claims.map((claim) => ({
      id: claim.id,
      displayValue: displayValue.get(claim.id) ?? 'available',
      status: status.get(claim.id) ?? 'unknown',
      sourceReport: claim.sourceArtifact,
      evidenceGeneratedAt: generatedAt,
      sourceCommit,
      caveat: claim.caveat,
      reproduce: claim.reproduce,
      publicUrl: null
    }))
  };
  const packageJson = packageValue as { scripts: Record<string, unknown> };
  const artifacts = registrySupportArtifacts(registry);
  const drillPath = registrySupportArtifacts(registry).find((artifact) => artifact.startsWith('tests/fixtures/'));
  if (!drillPath) throw new Error('claim incident drill fixture is not registered');
  return {
    registry,
    evidence,
    context: {
      packageScripts: packageJson.scripts,
      existingArtifacts: new Set(artifacts),
      artifactSha256: new Map(),
      incidentDrill: await readJson(drillPath),
      systemSpecKinds: SYSTEM_SPEC_KINDS
    }
  };
}

describe('scientific claim registry', () => {
  it('centralizes system counting, model maturity, limitations, and current effective levels', async () => {
    const { registry, evidence, context } = await repositoryContract();
    expect(validateClaimRegistry(registry, evidence, context)).toEqual({ ok: true, problems: [] });

    const typed = registry as ClaimRegistry;
    expect(typed.systemCountDefinition).toMatchObject({
      claimId: 'product.physical-system-families',
      publicCount: 8,
      systemSpecKindCount: 8
    });
    expect(typed.systemCountDefinition.countedModelIds).toHaveLength(8);
    expect(typed.models).toHaveLength(9);
    expect(typed.models.find(({ id }) => id === 'compound-double-pendulum')?.maturity).toBe('experimental');
    expect(typed.models.find(({ id }) => id === 'triple-pendulum')?.maturity).toBe('experimental');
    expect(typed.limitations.map(({ id }) => id)).toEqual(
      Array.from({ length: 18 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`)
    );

    const effective = new Map(
      evaluateClaimRegistry(typed, evidence, { now: '2026-08-25T00:00:00.000Z' }).map((claim) => [claim.id, claim])
    );
    expect(effective.get('tests.unit')?.effectiveVisibleLevel).toBe('validated');
    expect(effective.get('testing.mutation')?.effectiveVisibleLevel).toBe('measured');
    expect(effective.get('gpu.vendor-matrix')?.effectiveVisibleLevel).toBe('measured');
    expect(effective.get('publication.release')?.effectiveVisibleLevel).toBe('informational');

    expect(context.packageScripts['claims:check']).toBe('tsx scripts/validate-claim-registry.ts');
    expect(context.packageScripts.verify).toContain('npm run claims:check');
  });

  it('automatically lowers stale evidence instead of leaving a validated claim green', async () => {
    const { registry, evidence } = await repositoryContract();
    const effective = evaluateClaimRegistry(registry as ClaimRegistry, evidence, {
      now: '2026-09-03T00:00:00.000Z'
    });
    expect(effective).toHaveLength(6);
    expect(effective.every((claim) => claim.validity === 'expired')).toBe(true);
    expect(effective.every((claim) => claim.effectiveVisibleLevel === 'informational')).toBe(true);
    expect(effective.every((claim) => claim.downgradeReasons.some(({ input }) => input === 'evidence-freshness'))).toBe(
      true
    );
  });

  it('withholds failed, missing, or indeterminate unit, SciPy, and energy evidence while current', async () => {
    const { registry, evidence } = await repositoryContract();
    for (const status of ['failed', 'missing', 'unknown']) {
      const broken = structuredClone(evidence) as { claims: Array<{ id: string; status: string }> };
      for (const claim of broken.claims) {
        if (
          claim.id === 'tests.unit' ||
          claim.id === 'validation.scipy.regular' ||
          claim.id === 'benchmark.energy.methods'
        ) {
          claim.status = status;
        }
      }
      const effective = new Map(
        evaluateClaimRegistry(registry as ClaimRegistry, broken, { now: '2026-08-25T00:00:00.000Z' }).map((claim) => [
          claim.id,
          claim
        ])
      );
      for (const id of ['tests.unit', 'validation.scipy.regular', 'benchmark.energy.methods']) {
        expect(effective.get(id)?.effectiveVisibleLevel, `${id}:${status}`).toBe('withheld');
        expect(effective.get(id)?.downgradeReasons).toEqual(
          expect.arrayContaining([expect.objectContaining({ input: 'claim-status', value: status, to: 'withheld' })])
        );
      }
    }
  });

  it('downgrades every open investigation and pending correction out of green claim levels', async () => {
    const { registry, evidence } = await repositoryContract();
    for (const status of ['investigating', 'correction-pending'] as const) {
      const active = structuredClone(registry) as ClaimRegistry;
      for (const claim of active.claims) {
        claim.incident = {
          status,
          incidentId: `INC-${status}-001`,
          severity: 'sev-2',
          detectedAt: '2026-08-24T00:00:00.000Z',
          embargoUntil: null,
          correctionArtifact: null,
          revokedArtifactSha256: null,
          userNotification: null
        };
      }
      const effective = evaluateClaimRegistry(active, evidence, { now: '2026-08-25T00:00:00.000Z' });
      expect(effective.every((claim) => claim.effectiveVisibleLevel === 'informational')).toBe(true);
      expect(
        effective.every((claim) =>
          claim.downgradeReasons.some(
            (reason) => reason.input === 'incident-status' && reason.value === status && reason.to === 'informational'
          )
        )
      ).toBe(true);
    }
  });

  it('rejects unregistered quantified feed claims while ignoring non-claim numbers and qualitative values', async () => {
    const { registry, evidence, context } = await repositoryContract();
    const brokenEvidence = structuredClone(evidence) as { claims: Array<Record<string, unknown>> };
    brokenEvidence.claims.push({ id: 'validation.synthetic-count', displayValue: '42 independently verified cases' });

    expect(unregisteredQuantifiedPublicClaimIds(registry, brokenEvidence)).toEqual(['validation.synthetic-count']);
    expect(validateClaimRegistry(registry, brokenEvidence, context).problems).toContain(
      'unregistered quantified public claim in evidence-summary: validation.synthetic-count'
    );
    expect(
      unregisteredQuantifiedPublicClaimIds(registry, {
        claims: [
          { id: 'release.version', displayValue: 'v10.36.0' },
          { id: 'release.date', displayValue: '2026-08-25' },
          { id: 'release.state', displayValue: 'partial' }
        ]
      })
    ).toEqual([]);
    expect(isQuantifiedPublicClaimValue('1 / 3 vendors')).toBe(true);
    expect(isQuantifiedPublicClaimValue('v10.36.0')).toBe(false);
  });

  it('rejects duplicate evidence ids and registry coverage gaps', async () => {
    const { registry, evidence, context } = await repositoryContract();
    const brokenRegistry = structuredClone(registry) as { claims: Array<Record<string, unknown>> };
    const brokenEvidence = structuredClone(evidence) as { claims: Array<Record<string, unknown>> };
    brokenRegistry.claims = brokenRegistry.claims.filter((claim) => claim.id !== 'validation.scipy.regular');
    const duplicate = brokenEvidence.claims.find((claim) => claim.id === 'tests.unit');
    if (!duplicate) throw new Error('tests.unit fixture is missing');
    brokenEvidence.claims.push(structuredClone(duplicate));

    expect(validateClaimRegistry(brokenRegistry, brokenEvidence, context).problems).toEqual(
      expect.arrayContaining([
        'duplicate evidence-summary claim id: tests.unit',
        'unregistered quantified public claim in evidence-summary: validation.scipy.regular'
      ])
    );
  });

  it('rejects ambiguous governance metadata and artifact hash drift', async () => {
    const { registry, evidence, context } = await repositoryContract();
    const broken = structuredClone(registry) as { claims: Array<Record<string, unknown>> };
    const brokenEvidence = structuredClone(evidence) as { sourceReportSha256: Record<string, unknown> };
    const claim = broken.claims.find((entry) => entry.id === 'tests.unit');
    if (!claim) throw new Error('tests.unit fixture is missing');
    claim.owner = 'Quality Team';
    claim.maturity = 'certified';
    claim.scope = { category: 'marketing', statement: 'too short' };
    delete brokenEvidence.sourceReportSha256['reports/vitest-public-results.json'];
    claim.reproduce = 'npm run missing-script';
    claim.caveat = null;
    claim.invalidatedBy = [];
    claim.limitationIds = ['L99'];
    claim.validity = { evidenceClasses: ['GPU Driver'], validForDays: 0 };

    expect(validateClaimRegistry(broken, brokenEvidence, context).problems).toEqual(
      expect.arrayContaining([
        'registry claim tests.unit owner must be a lowercase kebab-case responsibility',
        'registry claim tests.unit maturity is invalid',
        'registry claim tests.unit scope.category is invalid',
        'registry claim tests.unit sourceArtifact is missing a SHA-256 binding in evidence-summary',
        'registry claim tests.unit reproduce must invoke a defined npm script without shell chaining',
        'registry claim tests.unit must define a caveat or at least one invalidating condition',
        'registry claim tests.unit links unknown limitation L99',
        'registry claim tests.unit validity.evidenceClasses must contain kebab-case evidence classes',
        'registry claim tests.unit validity.validForDays must be a positive integer'
      ])
    );
  });

  it('rehearses a synthetic bad-artifact revocation through the effective claim level', async () => {
    const { registry, evidence, context } = await repositoryContract();
    const typed = structuredClone(registry) as ClaimRegistry;
    const drill = context.incidentDrill as {
      claimId: string;
      evaluatedAt: string;
      revokedArtifactSha256: string;
      incident: ClaimIncidentMetadata;
      expectedEffectiveVisibleLevel: string;
    };
    const claim = typed.claims.find((entry) => entry.id === drill.claimId);
    if (!claim) throw new Error('drill claim is missing');
    claim.incident = drill.incident;
    const inputs = deriveClaimDowngradeInputs(evidence, {
      now: drill.evaluatedAt,
      revokedArtifactSha256: [drill.revokedArtifactSha256]
    });
    inputs.sourceArtifactSha256 = drill.revokedArtifactSha256;
    const effective = evaluateClaim(claim as ClaimRegistryEntry, inputs);

    expect(effective.effectiveVisibleLevel).toBe(drill.expectedEffectiveVisibleLevel);
    expect(effective.incidentStatus).toBe('revoked');
    expect(effective.downgradeReasons.map(({ input }) => input)).toEqual(
      expect.arrayContaining(['artifact-status', 'incident-status'])
    );
  });
});
