import claimRegistryJson from '../../config/claim-registry.json';
import {
  evaluateClaimRegistry,
  type ClaimEvaluationOptions,
  type ClaimRegistry,
  type ClaimVisibleLevel,
  type EffectiveClaim
} from './claimRegistry';

export const CLAIM_EVIDENCE_SURFACE_SCHEMA = 'pendulum-claim-evidence-surface/v1' as const;

export type ClaimEvidenceLoadState = 'loaded' | 'unavailable';

export interface ClaimEvidenceSurfaceClaim {
  id: string;
  statement: string;
  maturity: string;
  defaultVisibleLevel: ClaimVisibleLevel;
  effectiveVisibleLevel: ClaimVisibleLevel;
  validity: EffectiveClaim['validity'];
  validFrom: string | null;
  validUntil: string | null;
  displayValue: string | null;
  evidenceStatus: string | null;
  sourceArtifact: string;
  sourceArtifactSha256: string | null;
  reproduce: string;
  limitationIds: string[];
  caveats: string[];
  downgradeReasons: EffectiveClaim['downgradeReasons'];
}

export interface ClaimEvidenceSurface {
  schemaVersion: typeof CLAIM_EVIDENCE_SURFACE_SCHEMA;
  evaluatedAt: string;
  loadState: ClaimEvidenceLoadState;
  evidenceGeneratedAt: string | null;
  evidenceSourceCommit: string | null;
  evidenceExpiresAt: string | null;
  counts: Record<ClaimVisibleLevel, number>;
  claims: ClaimEvidenceSurfaceClaim[];
}

type JsonObject = Record<string, unknown>;

const canonicalRegistry = claimRegistryJson as unknown as ClaimRegistry;

let runtimeEvidence: unknown = null;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function isoInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function usableEvidence(value: unknown, registry: ClaimRegistry): value is JsonObject {
  const evidence = object(value);
  const provenance = evidence ? object(evidence.provenance) : null;
  const sourceHashes = evidence ? object(evidence.sourceReportSha256) : null;
  if (
    evidence?.schemaVersion !== 'pendulum-evidence-summary/v1' ||
    !isoInstant(evidence.generatedAt) ||
    !provenance ||
    !sourceHashes ||
    !isoInstant(provenance.expiresAt) ||
    typeof provenance.sourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceCommit) ||
    provenance.dirtyWorktree !== false ||
    !Array.isArray(evidence.claims)
  ) {
    return false;
  }
  const definitions = new Map(registry.claims.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  for (const candidate of evidence.claims) {
    const claim = object(candidate);
    const definition = claim && typeof claim.id === 'string' ? definitions.get(claim.id) : undefined;
    if (
      !claim ||
      !definition ||
      seen.has(definition.id) ||
      typeof claim.displayValue !== 'string' ||
      typeof claim.status !== 'string' ||
      !isoInstant(claim.evidenceGeneratedAt) ||
      claim.sourceCommit !== provenance.sourceCommit ||
      claim.sourceReport !== definition.sourceArtifact ||
      claim.reproduce !== definition.reproduce ||
      typeof sourceHashes[definition.sourceArtifact] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sourceHashes[definition.sourceArtifact] as string)
    ) {
      return false;
    }
    seen.add(definition.id);
  }
  return seen.size === definitions.size;
}

function evidenceClaims(value: unknown, registry: ClaimRegistry): Map<string, JsonObject> {
  if (!usableEvidence(value, registry)) return new Map();
  const claims = new Map<string, JsonObject>();
  for (const candidate of value.claims as unknown[]) {
    const entry = object(candidate);
    if (entry && typeof entry.id === 'string' && !claims.has(entry.id)) claims.set(entry.id, entry);
  }
  return claims;
}

function uniqueText(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function emptyCounts(): Record<ClaimVisibleLevel, number> {
  return { withheld: 0, informational: 0, measured: 0, validated: 0, 'publication-ready': 0 };
}

/**
 * Build the single claim view consumed by browser trust surfaces and research
 * exports. Invalid or incomplete evidence is evaluated as unavailable, never
 * as a partially trusted object. Quantified values are omitted for claims the
 * registry withholds.
 */
export function buildClaimEvidenceSurface(
  registry: ClaimRegistry,
  evidenceValue: unknown,
  options: ClaimEvaluationOptions = {}
): ClaimEvidenceSurface {
  const evidenceObject = usableEvidence(evidenceValue, registry) ? evidenceValue : null;
  const loaded = evidenceObject !== null;
  const evidence = evidenceObject;
  const provenance = evidenceObject ? object(evidenceObject.provenance) : null;
  const publicClaims = evidenceClaims(evidence, registry);
  const definitions = new Map(registry.claims.map((entry) => [entry.id, entry]));
  const limitationStatements = new Map(registry.limitations.map((entry) => [entry.id, entry.statement]));
  const evaluated = evaluateClaimRegistry(registry, evidence, options);
  const counts = emptyCounts();

  const claims = evaluated.map((claim): ClaimEvidenceSurfaceClaim => {
    const definition = definitions.get(claim.id)!;
    const publicClaim = publicClaims.get(claim.id);
    counts[claim.effectiveVisibleLevel] += 1;
    return {
      id: claim.id,
      statement: definition.scope.statement,
      maturity: claim.maturity,
      defaultVisibleLevel: claim.defaultVisibleLevel,
      effectiveVisibleLevel: claim.effectiveVisibleLevel,
      validity: claim.validity,
      validFrom: claim.validFrom,
      validUntil: claim.validUntil,
      displayValue:
        claim.effectiveVisibleLevel !== 'withheld' && typeof publicClaim?.displayValue === 'string'
          ? publicClaim.displayValue
          : null,
      evidenceStatus: typeof publicClaim?.status === 'string' ? publicClaim.status : null,
      sourceArtifact: claim.sourceArtifact,
      sourceArtifactSha256: claim.sourceArtifactSha256,
      reproduce: definition.reproduce,
      limitationIds: [...claim.limitationIds],
      caveats: uniqueText([
        ...claim.downgradeReasons.map((reason) => reason.reason),
        definition.caveat,
        ...claim.limitationIds.map((id) => limitationStatements.get(id))
      ]),
      downgradeReasons: claim.downgradeReasons.map((reason) => ({ ...reason }))
    };
  });

  return {
    schemaVersion: CLAIM_EVIDENCE_SURFACE_SCHEMA,
    evaluatedAt: isoInstant(options.now) ? options.now : new Date().toISOString(),
    loadState: loaded ? 'loaded' : 'unavailable',
    evidenceGeneratedAt: loaded && isoInstant(evidenceObject.generatedAt) ? evidenceObject.generatedAt : null,
    evidenceSourceCommit: loaded && typeof provenance?.sourceCommit === 'string' ? provenance.sourceCommit : null,
    evidenceExpiresAt: loaded && isoInstant(provenance?.expiresAt) ? provenance.expiresAt : null,
    counts,
    claims
  };
}

/** Accept a freshly fetched evidence summary; invalid input clears prior trust. */
export function setRuntimeClaimEvidence(value: unknown): ClaimEvidenceSurface {
  runtimeEvidence = usableEvidence(value, canonicalRegistry) ? value : null;
  return currentClaimEvidenceSurface();
}

/** Explicitly clear cached evidence after an offline/fetch/parse failure. */
export function clearRuntimeClaimEvidence(): ClaimEvidenceSurface {
  runtimeEvidence = null;
  return currentClaimEvidenceSurface();
}

export function currentClaimEvidenceSurface(options: ClaimEvaluationOptions = {}): ClaimEvidenceSurface {
  return buildClaimEvidenceSurface(canonicalRegistry, runtimeEvidence, options);
}

export function canonicalClaimEvidenceSurface(
  evidenceValue: unknown,
  options: ClaimEvaluationOptions = {}
): ClaimEvidenceSurface {
  return buildClaimEvidenceSurface(canonicalRegistry, evidenceValue, options);
}

export function claimEvidenceById(surface: ClaimEvidenceSurface, id: string): ClaimEvidenceSurfaceClaim | null {
  return surface.claims.find((claim) => claim.id === id) ?? null;
}

export function claimEvidenceRuntimeRows(surface = currentClaimEvidenceSurface()): Array<[string, string]> {
  const rows: Array<[string, string]> = [['evidence load', surface.loadState]];
  for (const id of ['tests.unit', 'testing.mutation', 'gpu.vendor-matrix', 'publication.release']) {
    const claim = claimEvidenceById(surface, id);
    if (!claim) continue;
    const value = claim.displayValue ? ` · ${claim.displayValue}` : '';
    rows.push([id, `${claim.effectiveVisibleLevel} · ${claim.validity}${value}`]);
  }
  return rows;
}

export function claimEvidenceWarnings(surface = currentClaimEvidenceSurface()): string[] {
  const warnings: string[] = [];
  if (surface.loadState !== 'loaded') {
    warnings.push('Claim evidence unavailable: public evidence levels are fail-closed until a current summary loads.');
  }
  for (const claim of surface.claims) {
    if (claim.downgradeReasons.length === 0) continue;
    warnings.push(
      `${claim.id}: ${claim.defaultVisibleLevel} -> ${claim.effectiveVisibleLevel}; ${claim.downgradeReasons
        .map((reason) => reason.reason)
        .join(' ')}`
    );
  }
  return warnings;
}

export function claimEvidenceMarkdown(surface = currentClaimEvidenceSurface()): string {
  const rows = surface.claims.map((claim) => {
    const value = claim.displayValue ?? 'withheld';
    const caveat = claim.caveats.join(' ').replaceAll('|', '\\|') || '—';
    return `| ${claim.id} | ${claim.effectiveVisibleLevel} | ${claim.validity} | ${value} | ${caveat} |`;
  });
  return [
    '## Effective claim evidence',
    '',
    `Evidence load: ${surface.loadState}; evaluated: ${surface.evaluatedAt}; source commit: ${surface.evidenceSourceCommit ?? 'unavailable'}.`,
    '',
    '| Claim | Effective visibility | Freshness | Display value | Caveats |',
    '| --- | --- | --- | --- | --- |',
    ...rows
  ].join('\n');
}
