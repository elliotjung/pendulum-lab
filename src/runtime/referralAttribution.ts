export interface ReferralAttribution {
  source: string;
  medium: string | undefined;
  campaign: string | undefined;
  content: string | undefined;
  capturedAt: string;
}

export interface SessionStoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const REFERRAL_SESSION_KEY = 'pendulum-lab/referral-attribution/v1';

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().slice(0, 80);
  return /^[a-z0-9._-]+$/i.test(normalized) ? normalized : undefined;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function normalizeStoredAttribution(value: unknown): ReferralAttribution | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.source !== 'string' || clean(row.source) !== row.source || !validTimestamp(row.capturedAt))
    return null;
  const optional = (key: 'medium' | 'campaign' | 'content'): string | undefined | null => {
    const candidate = row[key];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== 'string' || clean(candidate) !== candidate) return null;
    return candidate;
  };
  const medium = optional('medium');
  const campaign = optional('campaign');
  const content = optional('content');
  if (medium === null || campaign === null || content === null) return null;
  return { source: row.source, medium, campaign, content, capturedAt: row.capturedAt };
}

/** Parse bounded first-party UTM labels without sending a network event. */
export function parseReferralAttribution(
  url: string,
  capturedAt: string = new Date().toISOString()
): ReferralAttribution | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!validTimestamp(capturedAt)) throw new RangeError('capturedAt must be a valid, bounded timestamp');
  const source = clean(parsed.searchParams.get('utm_source'));
  if (!source) return null;
  return {
    source,
    medium: clean(parsed.searchParams.get('utm_medium')),
    campaign: clean(parsed.searchParams.get('utm_campaign')),
    content: clean(parsed.searchParams.get('utm_content')),
    capturedAt
  };
}

/** Keep the first referral only for this browser session; no cookie is set. */
export function captureReferralAttribution(
  url: string,
  storage: SessionStoreLike,
  capturedAt?: string
): ReferralAttribution | null {
  let existing: string | null = null;
  try {
    existing = storage.getItem(REFERRAL_SESSION_KEY);
  } catch {
    // Storage can be disabled by privacy policy; attribution must never block boot.
  }
  if (existing) {
    try {
      const validated = normalizeStoredAttribution(JSON.parse(existing) as unknown);
      if (validated) return validated;
    } catch {
      // Replace malformed same-origin session state with a validated record.
    }
  }
  const attribution = parseReferralAttribution(url, capturedAt);
  if (attribution) {
    try {
      storage.setItem(REFERRAL_SESSION_KEY, JSON.stringify(attribution));
    } catch {
      // Quota/security failures are non-fatal; return the in-memory result.
    }
  }
  return attribution;
}
