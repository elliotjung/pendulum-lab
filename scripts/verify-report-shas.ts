/**
 * Release gate: generated evidence must attest the exact commit being released.
 *
 * Reports created before a commit carry dirty=true and the parent SHA, which
 * silently breaks the "this evidence describes this tag" claim. This script
 * closes the loop for the "generate -> tag-bound package -> verify same SHA"
 * flow: run the generators in CI at the release ref, then require every
 * release-critical report to be attested (clean tree) with
 * sourceSha === buildSha === the released commit.
 *
 * Usage: tsx scripts/verify-report-shas.ts [--expect-sha <sha>]
 * The expected SHA defaults to GITHUB_SHA, then to git HEAD.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ReportMetadata } from './report-metadata';

const execFileAsync = promisify(execFile);

/** Reports the release lane regenerates at the release ref; each must attest it. */
const RELEASE_CRITICAL_REPORTS: { path: string; required: boolean }[] = [
  { path: 'reports/release-readiness.json', required: true },
  { path: 'reports/worldclass-scorecard.json', required: true },
  { path: 'reports/publication-status.json', required: true }
];

interface Verdict {
  path: string;
  status: 'attested' | 'missing' | 'no-metadata' | 'dirty' | 'sha-mismatch' | 'unattested';
  detail: string;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1]! : null;
}

async function headSha(): Promise<string | null> {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

const expected = argValue('--expect-sha') ?? process.env.GITHUB_SHA?.trim() ?? await headSha();
if (!expected) {
  console.error('verify-report-shas: no expected SHA (pass --expect-sha, set GITHUB_SHA, or run inside a git checkout).');
  process.exit(1);
}

const verdicts: Verdict[] = [];
for (const { path, required } of RELEASE_CRITICAL_REPORTS) {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    verdicts.push({ path, status: 'missing', detail: required ? 'required report is missing' : 'optional report not generated' });
    continue;
  }
  const parsed = JSON.parse(text) as { metadata?: ReportMetadata };
  const metadata = parsed.metadata;
  if (!metadata?.schemaVersion) {
    verdicts.push({ path, status: 'no-metadata', detail: 'report has no pendulum-report-metadata block' });
  } else if (metadata.sourceDirty !== false) {
    verdicts.push({ path, status: 'dirty', detail: `sourceDirty=${String(metadata.sourceDirty)} files=[${(metadata.sourceDirtyFiles ?? []).slice(0, 5).join(', ')}]` });
  } else if (metadata.sourceSha !== expected || (metadata.buildSha ?? metadata.gitSha) !== expected) {
    verdicts.push({ path, status: 'sha-mismatch', detail: `sourceSha=${metadata.sourceSha ?? 'null'} buildSha=${metadata.buildSha ?? metadata.gitSha ?? 'null'} expected=${expected}` });
  } else if (metadata.attested !== true) {
    verdicts.push({ path, status: 'unattested', detail: 'metadata.attested is not true' });
  } else {
    verdicts.push({ path, status: 'attested', detail: `sourceSha=buildSha=${expected.slice(0, 12)}` });
  }
}

const failures = verdicts.filter((verdict) => {
  const spec = RELEASE_CRITICAL_REPORTS.find((report) => report.path === verdict.path)!;
  if (verdict.status === 'attested') return false;
  if (verdict.status === 'missing') return spec.required;
  return true;
});

for (const verdict of verdicts) {
  const line = `${verdict.status === 'attested' ? 'ok  ' : 'FAIL'} ${verdict.path}: ${verdict.status} (${verdict.detail})`;
  if (failures.includes(verdict)) console.error(line);
  else console.log(line);
}

if (failures.length > 0) {
  console.error(`verify-report-shas: ${failures.length} report(s) do not attest ${expected.slice(0, 12)}; regenerate them at the release ref on a clean tree.`);
  process.exit(1);
}
console.log(`verify-report-shas: all release-critical reports attest ${expected.slice(0, 12)}.`);
