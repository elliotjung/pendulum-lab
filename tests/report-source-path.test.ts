import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportSafeSourcePath } from '../scripts/report-source-path';

describe('GPU report source paths', () => {
  it('keeps repository artifacts relative and encodes Markdown delimiters', () => {
    const repository = resolve('virtual', 'repository');
    const candidate = join(repository, 'reports', 'NVIDIA | nightly', 'gpu-benchmark-ladder.json');
    expect(reportSafeSourcePath(candidate, join(repository, 'reports'), repository)).toBe(
      'reports/NVIDIA%20%7C%20nightly/gpu-benchmark-ladder.json'
    );
  });

  it('labels external artifacts without exposing an absolute runner path', () => {
    const repository = resolve('virtual', 'repository');
    const inputRoot = resolve('virtual', 'downloaded artifacts');
    const candidate = join(inputRoot, 'intel', 'gpu-benchmark-ladder.json');
    const source = reportSafeSourcePath(candidate, inputRoot, repository);

    expect(source).toBe('artifact:intel/gpu-benchmark-ladder.json');
    expect(source).not.toContain(inputRoot);
    expect(source).not.toMatch(/^[A-Za-z]:[\\/]/u);
  });
});
