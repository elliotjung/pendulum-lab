import { execFileSync } from 'node:child_process';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;
const EVIDENCE_ONLY_COMMIT_PATHS = new Set(['reports/evidence-summary.json']);

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export function evidenceWorktreeIsDirty(cwd = process.cwd()): boolean {
  return git(['status', '--porcelain', '--untracked-files=normal'], cwd).trim().length > 0;
}

export function assertEvidenceSourceCommit(sourceCommit: string, cwd = process.cwd()): void {
  if (!FULL_GIT_SHA.test(sourceCommit)) {
    throw new Error('Committed evidence provenance.sourceCommit must be a full Git SHA.');
  }

  const headCommit = git(['rev-parse', 'HEAD'], cwd).trim();
  if (sourceCommit === headCommit) return;

  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, headCommit], { cwd, stdio: 'ignore' });
  } catch {
    throw new Error('Committed evidence provenance.sourceCommit must be HEAD or an available ancestor of HEAD.');
  }

  const changedPaths = git(['diff', '--name-only', '-z', `${sourceCommit}..${headCommit}`, '--'], cwd)
    .split('\0')
    .filter(Boolean);
  const unexpectedPaths = changedPaths.filter((path) => !EVIDENCE_ONLY_COMMIT_PATHS.has(path));
  if (unexpectedPaths.length > 0) {
    throw new Error(
      `Committed evidence provenance crosses non-evidence changes after sourceCommit: ${unexpectedPaths.join(', ')}.`
    );
  }
}
