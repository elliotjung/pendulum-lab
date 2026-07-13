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
  const existing = storage.getItem(REFERRAL_SESSION_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as ReferralAttribution;
    } catch {
      // Replace malformed same-origin session state with a validated record.
    }
  }
  const attribution = parseReferralAttribution(url, capturedAt);
  if (attribution) storage.setItem(REFERRAL_SESSION_KEY, JSON.stringify(attribution));
  return attribution;
}
