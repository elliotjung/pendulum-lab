import { execFile } from 'node:child_process';
import { platform, release, type } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ReportFreshnessPolicy {
  maxAgeDays: number;
  staleAfter: string;
  action: 'warn' | 'fail';
}

export interface ReportMetadata {
  schemaVersion: 'pendulum-report-metadata/v1';
  generatedAt: string;
  /** Compatibility alias for {@link buildSha} (pre-dual-field consumers). */
  gitSha: string | null;
  /** HEAD of the checkout that ran the generator (what actually built the report). */
  buildSha: string | null;
  /**
   * Commit this report attests to: GITHUB_SHA in CI, or HEAD for a
   * source-clean local checkout. Null when source files are dirty and no CI
   * SHA exists, because a modified source tree cannot attest any commit.
   */
  sourceSha: string | null;
  /** True only when source files are clean and sourceSha === buildSha. */
  attested: boolean;
  dirty: boolean | null;
  dirtyFiles: string[];
  /**
   * Like dirty/dirtyFiles but ignoring generated artifacts (reports/, dist*,
   * docs/api, ...). Regenerating evidence must not un-attest the source.
   */
  sourceDirty: boolean | null;
  sourceDirtyFiles: string[];
  command: string;
  node: string;
  os: {
    type: string;
    platform: string;
    release: string;
  };
  sourceRunId: string | null;
  sourceRunAttempt: string | null;
  sourceRunUrl: string | null;
  freshnessPolicy: ReportFreshnessPolicy;
}

async function git(args: readonly string[], trim = true): Promise<string | null> {
  try {
    const result = await execFileAsync('git', [...args], { encoding: 'utf8', timeout: 10_000 });
    return trim ? result.stdout.trim() : result.stdout.trimEnd();
  } catch {
    return null;
  }
}

function splitGitLines(value: string | null): string[] {
  return value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function isLocalOnlyPath(path: string): boolean {
  return path === '.claude'
    || path.startsWith('.claude/')
    || path === '.gh-localappdata'
    || path.startsWith('.gh-localappdata/')
    || path === 'tmp'
    || path.startsWith('tmp/');
}

const GENERATED_ARTIFACT_PREFIXES = [
  'reports/',
  'dist/',
  'dist-lib/',
  'standalone/',
  'docs/api/',
  'coverage/',
  'test-results/'
];

/** Build outputs and evidence files: their churn never dirties the *source*. */
export function isGeneratedArtifactPath(path: string): boolean {
  return GENERATED_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix))
    || path === 'paper/paper.pdf'
    || path.endsWith('.tgz');
}

async function dirtyFiles(): Promise<string[] | null> {
  const [unstaged, staged, untracked] = await Promise.all([
    git(['diff', '--name-only']),
    git(['diff', '--cached', '--name-only']),
    git(['ls-files', '--others', '--exclude-standard'])
  ]);
  if (unstaged === null || staged === null || untracked === null) return null;
  return Array.from(new Set([
    ...splitGitLines(unstaged),
    ...splitGitLines(staged),
    ...splitGitLines(untracked)
  ].map((path) => path.replace(/\\/g, '/')).filter((path) => !isLocalOnlyPath(path)))).sort();
}

export function freshnessPolicy(maxAgeDays: number, action: ReportFreshnessPolicy['action'] = 'warn'): ReportFreshnessPolicy {
  return {
    maxAgeDays,
    staleAfter: new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000).toISOString(),
    action
  };
}

export async function collectReportMetadata(command: string, policy: ReportFreshnessPolicy): Promise<ReportMetadata> {
  const generatedAt = new Date().toISOString();
  const files = await dirtyFiles();
  const repository = process.env.GITHUB_REPOSITORY ?? null;
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const buildSha = await git(['rev-parse', 'HEAD']);
  const dirty = files === null ? null : files.length > 0;
  const sourceFiles = files === null ? null : files.filter((path) => !isGeneratedArtifactPath(path));
  const sourceDirty = sourceFiles === null ? null : sourceFiles.length > 0;
  const ciSha = process.env.GITHUB_SHA?.trim() || null;
  const sourceSha = ciSha ?? (sourceDirty === false ? buildSha : null);
  return {
    schemaVersion: 'pendulum-report-metadata/v1',
    generatedAt,
    gitSha: buildSha,
    buildSha,
    sourceSha,
    attested: sourceDirty === false && sourceSha !== null && buildSha !== null && sourceSha === buildSha,
    dirty,
    dirtyFiles: files ?? [],
    sourceDirty,
    sourceDirtyFiles: sourceFiles ?? [],
    command,
    node: process.version,
    os: {
      type: type(),
      platform: platform(),
      release: release()
    },
    sourceRunId: runId,
    sourceRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    sourceRunUrl: repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    freshnessPolicy: policy
  };
}

export function reportAgeDays(metadata: Pick<ReportMetadata, 'generatedAt'> | undefined, now = Date.now()): number | null {
  if (!metadata?.generatedAt) return null;
  const generated = Date.parse(metadata.generatedAt);
  return Number.isFinite(generated) ? (now - generated) / (24 * 60 * 60 * 1000) : null;
}

export function reportFreshnessStatus(metadata: ReportMetadata | undefined, now = Date.now()): 'fresh' | 'stale' | 'missing-metadata' {
  if (!metadata) return 'missing-metadata';
  const age = reportAgeDays(metadata, now);
  if (age === null) return 'missing-metadata';
  return age <= metadata.freshnessPolicy.maxAgeDays ? 'fresh' : 'stale';
}
