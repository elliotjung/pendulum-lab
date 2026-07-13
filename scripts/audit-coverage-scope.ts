import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface CoverageScopeBaseline {
  version: 1;
  knownUncovered: string[];
}

type CoverageSummary = Record<string, unknown>;

const SOURCE_ROOT = 'src';
const COVERAGE_SUMMARY_PATH = 'reports/coverage/coverage-summary.json';
const BASELINE_PATH = 'config/coverage-scope-baseline.json';
const EXCLUDED_SOURCE_PATTERNS = [/^src\/types\//, /^src\/demo\//];

function normalizePath(path: string): string {
  const cwd = process.cwd().replace(/\\/g, '/');
  let normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith(`${cwd}/`)) normalized = normalized.slice(cwd.length + 1);
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  return normalized;
}

async function walkSource(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSource(full)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(normalizePath(full));
    }
  }
  return files;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function isExcludedSource(path: string): boolean {
  return EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(path));
}

const [summary, baseline, sourceFiles] = await Promise.all([
  readJson<CoverageSummary>(COVERAGE_SUMMARY_PATH),
  readJson<CoverageScopeBaseline>(BASELINE_PATH),
  walkSource(SOURCE_ROOT)
]);

const covered = new Set(
  Object.keys(summary)
    .filter((key) => key !== 'total')
    .map(normalizePath)
);
const sources = sourceFiles.filter((file) => !isExcludedSource(file)).sort();
const missing = sources.filter((file) => !covered.has(file));
const known = new Set(baseline.knownUncovered);
const newMissing = missing.filter((file) => !known.has(file));
const obsoleteBaseline = baseline.knownUncovered.filter((file) => !missing.includes(file));

if (newMissing.length > 0 || obsoleteBaseline.length > 0) {
  if (newMissing.length > 0) {
    console.error('Coverage scope guard found source files absent from the v8 coverage map:');
    for (const file of newMissing) console.error(`  + ${file}`);
    console.error(
      'Add focused tests, or add the file to config/coverage-scope-baseline.json with a short follow-up task.'
    );
  }
  if (obsoleteBaseline.length > 0) {
    console.error('Coverage scope baseline contains entries that are now covered or deleted:');
    for (const file of obsoleteBaseline) console.error(`  - ${file}`);
    console.error('Remove obsolete entries from config/coverage-scope-baseline.json to keep the ratchet honest.');
  }
  process.exitCode = 1;
} else {
  console.log(
    `coverage scope passed: ${sources.length - missing.length}/${sources.length} source files present in coverage map (${missing.length} known baseline gaps).`
  );
}
