import { describe, expect, it } from 'vitest';
import {
  captureReferralAttribution,
  parseReferralAttribution,
  REFERRAL_SESSION_KEY
} from '../src/runtime/referralAttribution';

describe('privacy-friendly referral attribution', () => {
  it('accepts bounded UTM labels and rejects unsafe values', () => {
    expect(
      parseReferralAttribution(
        'https://example.test/?utm_source=pendulum-landing&utm_campaign=research-lab',
        '2026-07-13T00:00:00.000Z'
      )
    ).toEqual({
      source: 'pendulum-landing',
      medium: undefined,
      campaign: 'research-lab',
      content: undefined,
      capturedAt: '2026-07-13T00:00:00.000Z'
    });
    expect(parseReferralAttribution('https://example.test/?utm_source=%3Cscript%3E')).toBeNull();
  });

  it('keeps the first attribution only for the current browser session', () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => entries.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        entries.set(key, value);
      }
    };
    const first = captureReferralAttribution(
      'https://example.test/?utm_source=pendulum-landing',
      storage,
      '2026-07-13T00:00:00.000Z'
    );
    const second = captureReferralAttribution(
      'https://example.test/?utm_source=another-site',
      storage,
      '2026-07-13T00:01:00.000Z'
    );
    expect(second).toEqual(first);
    expect(JSON.parse(entries.get(REFERRAL_SESSION_KEY) ?? '{}').source).toBe('pendulum-landing');
  });
});
