import type {
  ClaimDowngradeInputId,
  ClaimDowngradeInputs,
  ClaimEvaluationOptions,
  ClaimRegistry,
  ClaimRegistryEntry,
  EffectiveClaim
} from './claimRegistryContracts';
import {
  VISIBILITY_RANK,
  addDays,
  earliestIso,
  isoInstant,
  normalizedClaimStatus,
  normalizedStatus,
  object,
  sha256,
  type JsonObject
} from './claimRegistryUtilities';

export function deriveClaimDowngradeInputs(
  evidenceValue: unknown,
  options: ClaimEvaluationOptions = {}
): ClaimDowngradeInputs {
  const evidence = object(evidenceValue);
  const provenance = evidence ? object(evidence.provenance) : null;
  const mutation = evidence ? object(evidence.mutation) : null;
  const gpu = evidence ? object(evidence.gpu) : null;
  const publication = evidence ? object(evidence.publication) : null;
  const mutationRaw = mutation?.status;
  const mutationStatus =
    mutationRaw === 'high' || mutationRaw === 'passed'
      ? 'high'
      : mutationRaw === 'low'
        ? 'low'
        : mutationRaw === 'failed' || mutationRaw === 'below-floor'
          ? 'failed'
          : 'unknown';

  return {
    now: isoInstant(options.now) ? options.now : new Date().toISOString(),
    evidenceGeneratedAt: evidence && isoInstant(evidence.generatedAt) ? evidence.generatedAt : null,
    evidenceExpiresAt: provenance && isoInstant(provenance.expiresAt) ? provenance.expiresAt : null,
    claimStatus: 'unknown',
    gpuStatus: normalizedStatus(
      gpu?.status,
      new Set(['complete', 'passed']),
      new Set(['partial']),
      new Set(['failed'])
    ),
    mutationStatus,
    publicationStatus: normalizedStatus(
      publication?.status,
      new Set(['complete', 'published', 'passed']),
      new Set(['partial']),
      new Set(['failed'])
    ),
    sourceArtifactSha256: null,
    revokedArtifactSha256: [...(options.revokedArtifactSha256 ?? [])]
  };
}

export function evaluateClaim(entry: ClaimRegistryEntry, inputs: ClaimDowngradeInputs): EffectiveClaim {
  const claimExpiry = inputs.evidenceGeneratedAt
    ? addDays(inputs.evidenceGeneratedAt, entry.validity.validForDays)
    : null;
  const validUntil = earliestIso(claimExpiry, inputs.evidenceExpiresAt);
  const validity =
    !inputs.evidenceGeneratedAt || !validUntil
      ? 'unknown'
      : Date.parse(inputs.now) < Date.parse(validUntil)
        ? 'current'
        : 'expired';
  const revoked =
    (inputs.sourceArtifactSha256 !== null && inputs.revokedArtifactSha256.includes(inputs.sourceArtifactSha256)) ||
    (inputs.sourceArtifactSha256 !== null && entry.incident.revokedArtifactSha256 === inputs.sourceArtifactSha256);
  const values: Record<ClaimDowngradeInputId, string> = {
    'artifact-status': revoked ? 'revoked' : 'current',
    'claim-status': inputs.claimStatus,
    'evidence-freshness': validity,
    'gpu-status': inputs.gpuStatus,
    'incident-status': entry.incident.status,
    'mutation-status': inputs.mutationStatus,
    'publication-status': inputs.publicationStatus
  };
  let effectiveVisibleLevel = entry.visibility.defaultLevel;
  const downgradeReasons: EffectiveClaim['downgradeReasons'] = [];
  for (const rule of entry.visibility.downgradeRules) {
    const value = values[rule.input];
    if (!rule.when.includes(value)) continue;
    if (VISIBILITY_RANK[rule.to] < VISIBILITY_RANK[effectiveVisibleLevel]) effectiveVisibleLevel = rule.to;
    downgradeReasons.push({ input: rule.input, value, to: rule.to, reason: rule.reason });
  }
  return {
    id: entry.id,
    maturity: entry.maturity,
    defaultVisibleLevel: entry.visibility.defaultLevel,
    effectiveVisibleLevel,
    validity,
    validFrom: inputs.evidenceGeneratedAt,
    validUntil,
    limitationIds: [...entry.limitationIds],
    sourceArtifact: entry.sourceArtifact,
    sourceArtifactSha256: inputs.sourceArtifactSha256,
    incidentStatus: entry.incident.status,
    downgradeReasons
  };
}

export function evaluateClaimRegistry(
  registry: ClaimRegistry,
  evidenceValue: unknown,
  options: ClaimEvaluationOptions = {}
): EffectiveClaim[] {
  const inputs = deriveClaimDowngradeInputs(evidenceValue, options);
  const evidence = object(evidenceValue);
  const sourceReportSha256 = evidence ? object(evidence.sourceReportSha256) : null;
  const claimEvidence = new Map<string, JsonObject>();
  if (evidence && Array.isArray(evidence.claims)) {
    for (const value of evidence.claims) {
      const claim = object(value);
      if (claim && typeof claim.id === 'string') claimEvidence.set(claim.id, claim);
    }
  }
  return registry.claims.map((entry) => {
    const publicClaim = claimEvidence.get(entry.id);
    const generatedAt = publicClaim?.evidenceGeneratedAt;
    return evaluateClaim(entry, {
      ...inputs,
      // A newly assembled summary must not renew an old GPU/mutation/source
      // report. Every claim carries the timestamp of the exact report it uses.
      evidenceGeneratedAt: isoInstant(generatedAt) ? generatedAt : null,
      claimStatus: normalizedClaimStatus(publicClaim?.status),
      sourceArtifactSha256: sha256(sourceReportSha256?.[entry.sourceArtifact])
        ? (sourceReportSha256?.[entry.sourceArtifact] as string)
        : null
    });
  });
}
