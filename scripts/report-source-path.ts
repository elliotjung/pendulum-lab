import { isAbsolute, relative, resolve, sep } from 'node:path';

function containedPath(root: string, candidate: string): string | null {
  const result = relative(resolve(root), resolve(candidate));
  if (!result || result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) return null;
  return result
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Produce a report-safe provenance path without leaking an external runner's
 * absolute workspace or allowing Markdown table delimiters into the report.
 */
export function reportSafeSourcePath(candidate: string, inputRoot: string, repositoryRoot = process.cwd()): string {
  const repositoryPath = containedPath(repositoryRoot, candidate);
  if (repositoryPath) return repositoryPath;
  const artifactPath = containedPath(inputRoot, candidate);
  if (artifactPath) return `artifact:${artifactPath}`;
  const name = resolve(candidate).split(sep).at(-1) ?? 'gpu-benchmark-ladder.json';
  return `artifact:${encodeURIComponent(name)}`;
}
