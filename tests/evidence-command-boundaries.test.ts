import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('evidence command boundaries', () => {
  it('keeps mutable local documentation sync separate from immutable release evidence', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string | undefined>;
    };
    expect(packageJson.scripts?.['docs:sync']).toBe('tsx scripts/sync-test-counts.ts');
    expect(packageJson.scripts?.['release:evidence:check']).toBe('npm run evidence:summary');
    expect(packageJson.scripts?.verify).toContain('npm run docs:sync');

    const releaseWorkflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(releaseWorkflow).toContain('npm run release:evidence:check');

    const evidenceScript = await readFile('scripts/evidence-summary.ts', 'utf8');
    expect(evidenceScript).toContain('Refusing to refresh public evidence from a dirty worktree');
  });
});
