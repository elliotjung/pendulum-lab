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
  gitSha: string | null;
  dirty: boolean | null;
  dirtyFiles: string[];
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
  return {
    schemaVersion: 'pendulum-report-metadata/v1',
    generatedAt,
    gitSha: await git(['rev-parse', 'HEAD']),
    dirty: files === null ? null : files.length > 0,
    dirtyFiles: files ?? [],
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
