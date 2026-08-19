import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type DeploymentProfile = 'hardened' | 'isolated';

export interface HeaderCheck {
  header: string;
  expected: string;
  actual: string | null;
  ok: boolean;
}

function normalized(headers: Headers | Record<string, string | undefined>): Map<string, string> {
  const values = new Map<string, string>();
  if (headers instanceof Headers) {
    headers.forEach((value, key) => values.set(key.toLowerCase(), value.trim()));
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') values.set(key.toLowerCase(), value.trim());
    }
  }
  return values;
}

export function validateDeploymentHeaders(
  headers: Headers | Record<string, string | undefined>,
  profile: DeploymentProfile
): HeaderCheck[] {
  const values = normalized(headers);
  const exact = (header: string, expected: string): HeaderCheck => {
    const actual = values.get(header.toLowerCase()) ?? null;
    return { header, expected, actual, ok: actual?.toLowerCase() === expected.toLowerCase() };
  };
  const includes = (header: string, expected: string, required: readonly string[]): HeaderCheck => {
    const actual = values.get(header.toLowerCase()) ?? null;
    const lower = actual?.toLowerCase() ?? '';
    return { header, expected, actual, ok: required.every((fragment) => lower.includes(fragment.toLowerCase())) };
  };
  const hsts = (minimumSeconds: number): HeaderCheck => {
    const header = 'Strict-Transport-Security';
    const expected = `max-age>=${minimumSeconds}; includeSubDomains`;
    const actual = values.get(header.toLowerCase()) ?? null;
    const directives = (actual ?? '').split(';').map((directive) => directive.trim());
    const maxAgeDirective = directives.find((directive) => /^max-age\s*=/iu.test(directive));
    const maxAgeValue = maxAgeDirective?.replace(/^max-age\s*=\s*/iu, '') ?? '';
    const maxAge = /^\d+$/u.test(maxAgeValue) ? Number(maxAgeValue) : Number.NaN;
    const includesSubdomains = directives.some((directive) => directive.toLowerCase() === 'includesubdomains');
    return {
      header,
      expected,
      actual,
      ok: Number.isSafeInteger(maxAge) && maxAge >= minimumSeconds && includesSubdomains
    };
  };

  const checks = [
    includes('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; object-src 'none'", [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ]),
    exact('X-Content-Type-Options', 'nosniff'),
    exact('X-Frame-Options', 'DENY'),
    exact('Referrer-Policy', 'strict-origin-when-cross-origin'),
    includes(
      'Permissions-Policy',
      'camera=(self), accelerometer=(self), gyroscope=(self), microphone=(), geolocation=(), payment=(), usb=()',
      [
        'camera=(self)',
        'accelerometer=(self)',
        'gyroscope=(self)',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()'
      ]
    ),
    hsts(31_536_000),
    exact('Origin-Agent-Cluster', '?1')
  ];
  if (profile === 'isolated') {
    checks.push(
      exact('Cross-Origin-Opener-Policy', 'same-origin'),
      exact('Cross-Origin-Embedder-Policy', 'require-corp'),
      exact('Cross-Origin-Resource-Policy', 'same-origin')
    );
  }
  return checks;
}

function option(args: string[], name: string, fallback = ''): string {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? '') : fallback;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const url = option(args, '--url', process.env.DEPLOYMENT_URL ?? '');
  const profile = option(args, '--profile', 'isolated') as DeploymentProfile;
  const output = option(args, '--output', 'reports/deployment-security.json');
  const attempts = Number(option(args, '--attempts', '5'));
  if (!url) throw new Error('--url or DEPLOYMENT_URL is required');
  if (profile !== 'hardened' && profile !== 'isolated') throw new Error('--profile must be hardened or isolated');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error('--attempts must be 1..10');
  const requested = new URL(url);
  if (requested.protocol !== 'https:') throw new Error('deployment security evidence requires an HTTPS URL');

  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(requested, {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'text/html', 'User-Agent': 'pendulum-lab-deployment-security-probe' },
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 2_000));
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error('deployment request failed');
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== 'https:') throw new Error(`deployment redirected to insecure URL ${finalUrl.href}`);
  await response.body?.cancel();

  const checks = validateDeploymentHeaders(response.headers, profile);
  const failed = checks.filter((check) => !check.ok);
  const report = {
    schemaVersion: 'pendulum-deployment-security/v1',
    generatedAt: new Date().toISOString(),
    status: failed.length === 0 ? 'verified' : 'failed',
    profile,
    requestedUrl: requested.href,
    finalUrl: finalUrl.href,
    httpStatus: response.status,
    checks
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) {
    throw new Error(
      `deployment is missing ${failed.length} required security header(s): ${failed.map((row) => row.header).join(', ')}`
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
