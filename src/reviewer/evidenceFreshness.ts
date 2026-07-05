/**
 * DOM-free presenter logic for the reviewer dashboard: evidence freshness
 * against a TTL, provenance extraction (source run deep link, attested SHA),
 * and the missing-evidence filter predicate. Kept free of document/window so
 * the rules are unit-testable in node.
 */

type Json = Record<string, unknown>;

export interface EvidenceFreshness {
  generatedAt: string | null;
  ageDays: number | null;
  ttlDays: number;
  state: 'fresh' | 'stale' | 'unknown';
  /** Chip label, e.g. "fresh (2.1d)" or "stale (41.0d / TTL 30d)". */
  label: string;
}

export interface EvidenceProvenance {
  sourceSha: string | null;
  runId: string | null;
  runUrl: string | null;
  attested: boolean | null;
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Freshness of a generated report against a TTL, from its metadata/generatedAt. */
export function evidenceFreshness(report: unknown, ttlDays: number, now = Date.now()): EvidenceFreshness {
  const record = asRecord(report);
  const metadata = asRecord(record.metadata);
  const generatedAt = asString(metadata.generatedAt) ?? asString(record.generatedAt);
  const parsed = generatedAt === null ? Number.NaN : Date.parse(generatedAt);
  if (!Number.isFinite(parsed)) {
    return { generatedAt: null, ageDays: null, ttlDays, state: 'unknown', label: 'freshness unknown' };
  }
  const ageDays = (now - parsed) / (24 * 60 * 60 * 1000);
  const state = ageDays <= ttlDays ? 'fresh' : 'stale';
  const label = state === 'fresh'
    ? `fresh (${ageDays.toFixed(1)}d)`
    : `stale (${ageDays.toFixed(1)}d / TTL ${ttlDays}d)`;
  return { generatedAt, ageDays, ttlDays, state, label };
}

/** Source-run provenance recorded by scripts/report-metadata.ts, if present. */
export function evidenceProvenance(report: unknown): EvidenceProvenance {
  const metadata = asRecord(asRecord(report).metadata);
  return {
    sourceSha: asString(metadata.sourceSha) ?? asString(metadata.gitSha),
    runId: asString(metadata.sourceRunId),
    runUrl: asString(metadata.sourceRunUrl),
    attested: typeof metadata.attested === 'boolean' ? metadata.attested : null
  };
}

const PASSING_STATUSES = new Set(['pass', 'passed', 'done', 'ready-for-owner-publish', 'published', 'verified', 'ok']);

/**
 * The missing-evidence filter: an evidence card needs attention when its
 * status is not a passing one, or its backing report is stale/unknown.
 */
export function needsAttention(status: string, freshness: Pick<EvidenceFreshness, 'state'>): boolean {
  const normalized = status.trim().toLowerCase();
  if (!PASSING_STATUSES.has(normalized)) return true;
  return freshness.state !== 'fresh';
}
