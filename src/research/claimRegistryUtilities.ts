import {
  CLAIM_INCIDENT_STATUSES,
  type ClaimDowngradeInputId,
  type ClaimDowngradeInputs,
  type ClaimVisibleLevel
} from './claimRegistryContracts';

export type JsonObject = Record<string, unknown>;

export const CLAIM_SCOPE_CATEGORIES = new Set([
  'hardware-validation',
  'numerical-benchmark',
  'publication-status',
  'scientific-validation',
  'software-verification'
]);

export const DOWNGRADE_INPUT_VALUES: Readonly<Record<ClaimDowngradeInputId, ReadonlySet<string>>> = {
  'artifact-status': new Set(['current', 'revoked']),
  'claim-status': new Set(['passed', 'failed', 'missing', 'unknown']),
  'evidence-freshness': new Set(['current', 'expired', 'unknown']),
  'gpu-status': new Set(['complete', 'partial', 'failed', 'unknown']),
  'incident-status': new Set(CLAIM_INCIDENT_STATUSES),
  'mutation-status': new Set(['high', 'low', 'failed', 'unknown']),
  'publication-status': new Set(['complete', 'partial', 'failed', 'unknown'])
};

export const VISIBILITY_RANK: Readonly<Record<ClaimVisibleLevel, number>> = {
  withheld: 0,
  informational: 1,
  measured: 2,
  validated: 3,
  'publication-ready': 4
};

export const REQUIRED_LIMITATION_IDS = Array.from(
  { length: 18 },
  (_, index) => `L${String(index + 1).padStart(2, '0')}`
);

export function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function nonEmptyText(value: unknown, minimumLength = 1): value is string {
  return typeof value === 'string' && value.trim() === value && value.length >= minimumLength && !/[\r\n]/.test(value);
}

export function stringArray(value: unknown, minimumLength = 1): value is string[] {
  return Array.isArray(value) && value.every((entry) => nonEmptyText(entry, minimumLength));
}

export function claimId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value);
}

export function kebabId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isoInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function repositoryJsonArtifact(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^reports\/[a-z0-9][a-z0-9./-]*\.json$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//')
  );
}

export function repositoryTypeScriptSource(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^src\/physics\/[A-Za-z0-9][A-Za-z0-9.-]*\.ts$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//')
  );
}

export function repositoryFixture(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^tests\/fixtures\/[a-z0-9][a-z0-9./-]*\.json$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//')
  );
}

export function npmScriptName(command: string): string | null {
  if (/[;&|`<>\r\n]/.test(command)) return null;
  const match = /^npm run ([a-z0-9:_-]+)(?: --(?: .+)?)?$/.exec(command);
  return match?.[1] ?? null;
}

export function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

export function sourceReportValues(evidence: JsonObject): Set<string> {
  const reports = object(evidence.sourceReports);
  if (!reports) return new Set();
  return new Set(Object.values(reports).filter((value): value is string => typeof value === 'string'));
}

export function enumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function earliestIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

export function addDays(instant: string, days: number): string {
  return new Date(Date.parse(instant) + days * 86_400_000).toISOString();
}

export function normalizedStatus(
  value: unknown,
  complete: ReadonlySet<string>,
  partial: ReadonlySet<string>,
  failed: ReadonlySet<string>
): 'complete' | 'partial' | 'failed' | 'unknown' {
  if (typeof value !== 'string') return 'unknown';
  if (complete.has(value)) return 'complete';
  if (partial.has(value)) return 'partial';
  if (failed.has(value)) return 'failed';
  return 'unknown';
}

export function normalizedClaimStatus(value: unknown): ClaimDowngradeInputs['claimStatus'] {
  if (typeof value !== 'string') return 'unknown';
  if (['passed', 'pass', 'success', 'complete', 'published', 'partial', 'measured', 'low', 'high'].includes(value)) {
    return 'passed';
  }
  if (['failed', 'fail', 'below-floor'].includes(value)) return 'failed';
  if (['missing', 'unavailable', 'skipped'].includes(value)) return 'missing';
  return 'unknown';
}

export function evidenceSourceArtifacts(value: unknown): string[] {
  const evidence = object(value);
  if (!evidence) return [];
  return [...sourceReportValues(evidence)].filter(repositoryJsonArtifact).sort();
}

export function registrySupportArtifacts(value: unknown): string[] {
  const registry = object(value);
  if (!registry) return [];
  const paths: string[] = [];
  const incidentPolicy = object(registry.incidentPolicy);
  if (incidentPolicy && repositoryFixture(incidentPolicy.drillFixture)) paths.push(incidentPolicy.drillFixture);
  return [...new Set(paths)].sort();
}

/**
 * A public feed is structured: only its `claims[*].displayValue` fields are
 * considered. This deliberately avoids treating versions, dates, citations,
 * and arbitrary prose numbers as scientific claims.
 */
export function isQuantifiedPublicClaimValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(text)) return false;
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) || /^https?:\/\//.test(text) || /^[a-f0-9]{7,64}$/i.test(text)) {
    return false;
  }
  return /(?:^|[^A-Za-z0-9])(?:[~<>]|<=|>=|±)?-?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?(?:\s*[%/]|\s+[A-Za-z]|\s*$)/i.test(
    text
  );
}

export function unregisteredQuantifiedPublicClaimIds(registryValue: unknown, publicFeedValue: unknown): string[] {
  const registry = object(registryValue);
  const feed = object(publicFeedValue);
  if (!registry || !feed || !Array.isArray(feed.claims)) return [];
  const registered = new Set<string>();
  if (Array.isArray(registry.claims)) {
    for (const value of registry.claims) {
      const entry = object(value);
      if (entry && claimId(entry.id)) registered.add(entry.id);
    }
  }
  const systemCount = object(registry.systemCountDefinition);
  if (systemCount && claimId(systemCount.claimId)) registered.add(systemCount.claimId);

  const missing = new Set<string>();
  for (const value of feed.claims) {
    const entry = object(value);
    if (!entry || !isQuantifiedPublicClaimValue(entry.displayValue)) continue;
    const id = typeof entry.id === 'string' ? entry.id : '<missing-id>';
    if (!registered.has(id)) missing.add(id);
  }
  return [...missing].sort();
}
