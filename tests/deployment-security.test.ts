import { describe, expect, it } from 'vitest';
import { validateDeploymentHeaders } from '../scripts/verify-deployment-security';

const hardened = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(self), accelerometer=(self), gyroscope=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'origin-agent-cluster': '?1'
};

describe('deployed security header policy', () => {
  it('requires the complete baseline policy rather than only COOP/COEP', () => {
    expect(validateDeploymentHeaders(hardened, 'hardened').every((check) => check.ok)).toBe(true);
    expect(
      validateDeploymentHeaders(
        { ...hardened, 'strict-transport-security': 'max-age=31556952; includeSubDomains; preload' },
        'hardened'
      ).find((row) => row.header === 'Strict-Transport-Security')
    ).toMatchObject({ ok: true });
    const missingFramePolicy = { ...hardened, 'x-frame-options': undefined };
    expect(
      validateDeploymentHeaders(missingFramePolicy, 'hardened').find((row) => row.header === 'X-Frame-Options')
    ).toMatchObject({ ok: false, actual: null });
  });

  it('parses HSTS max-age numerically and requires includeSubDomains', () => {
    const tooShort = validateDeploymentHeaders(
      { ...hardened, 'strict-transport-security': 'max-age=31535999; includeSubDomains' },
      'hardened'
    ).find((row) => row.header === 'Strict-Transport-Security');
    const missingSubdomains = validateDeploymentHeaders(
      { ...hardened, 'strict-transport-security': 'max-age=31556952' },
      'hardened'
    ).find((row) => row.header === 'Strict-Transport-Security');
    const malformedAge = validateDeploymentHeaders(
      { ...hardened, 'strict-transport-security': 'max-age=one-year; includeSubDomains' },
      'hardened'
    ).find((row) => row.header === 'Strict-Transport-Security');

    expect(tooShort).toMatchObject({ ok: false });
    expect(missingSubdomains).toMatchObject({ ok: false });
    expect(malformedAge).toMatchObject({ ok: false });
  });

  it('makes cross-origin isolation an additional fail-closed profile', () => {
    const isolated = {
      ...hardened,
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-resource-policy': 'same-origin'
    };
    expect(validateDeploymentHeaders(isolated, 'isolated').every((check) => check.ok)).toBe(true);
    expect(
      validateDeploymentHeaders(hardened, 'isolated')
        .filter((check) => !check.ok)
        .map((check) => check.header)
    ).toEqual(['Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy', 'Cross-Origin-Resource-Policy']);
  });
});
