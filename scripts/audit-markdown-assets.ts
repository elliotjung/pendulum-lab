import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

interface AssetReference {
  line: number;
  target: string;
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map((path) => path.replaceAll('\\', '/'));
const tracked = new Set(trackedFiles);
const markdownFiles = trackedFiles.filter((path) => path.toLowerCase().endsWith('.md'));
const failures: string[] = [];
let checkedReferences = 0;

for (const markdownPath of markdownFiles) {
  const source = await readFile(markdownPath, 'utf8');
  for (const reference of localReferences(source)) {
    const target = normalizeLocalTarget(markdownPath, reference.target);
    if (target === null) continue;
    checkedReferences += 1;
    if (!tracked.has(target)) {
      failures.push(`${markdownPath}:${reference.line} -> ${reference.target} (resolved: ${target})`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Tracked Markdown image audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(`Markdown local-link audit passed (${markdownFiles.length} files, ${checkedReferences} references).`);

function localReferences(source: string): AssetReference[] {
  const references: AssetReference[] = [];
  const patterns = [
    /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g,
    /<(?:img\b[^>]*\bsrc|a\b[^>]*\bhref)\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = match.slice(1).find((value): value is string => typeof value === 'string');
      if (!target) continue;
      const line = source.slice(0, match.index).split('\n').length;
      references.push({ line, target });
    }
  }
  return references;
}

function normalizeLocalTarget(markdownPath: string, rawTarget: string): string | null {
  const target = rawTarget.trim();
  if (target.length === 0 || target.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(target.split(/[?#]/, 1)[0] ?? '');
  } catch {
    decoded = target.split(/[?#]/, 1)[0] ?? '';
  }
  decoded = decoded.replaceAll('\\', '/');
  const resolved = decoded.startsWith('/')
    ? posix.normalize(decoded.slice(1))
    : posix.normalize(posix.join(posix.dirname(markdownPath), decoded));
  return resolved.startsWith('../') || resolved === '..' ? `OUTSIDE_REPOSITORY/${resolved}` : resolved;
}
