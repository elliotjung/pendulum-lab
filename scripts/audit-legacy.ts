import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

type Counts = {
  innerHTML: number;
  onclick: number;
  inlineWorkerBlob: number;
  evalLike: number;
  dynamicScript: number;
  globalRuntimeExports: number;
  servedHtmlUnsafeInlineScript: number;
  servedHtmlUnsafeInlineStyle: number;
  standalonePortableInlineScript: number;
  standalonePortableBlobWorker: number;
};

const rootDirs = ['js', 'src', 'css'];
const rootFiles = ['app.html'];
const standaloneFiles = ['index.html'];
const weights: Counts = {
  innerHTML: 2,
  onclick: 2,
  inlineWorkerBlob: 8,
  evalLike: 20,
  dynamicScript: 12,
  globalRuntimeExports: 5,
  servedHtmlUnsafeInlineScript: 20,
  servedHtmlUnsafeInlineStyle: 4,
  // The project-root index.html is the generated offline artifact. It must
  // inline JS and allow blob workers to support file:// double-click usage, so
  // it is reported but not scored against the hosted-app policy.
  standalonePortableInlineScript: 0,
  standalonePortableBlobWorker: 0
};

async function collectFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Directory absent (e.g. the legacy `js/` was archived) — nothing to scan.
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (/\.(js|ts|html|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function cspContent(text: string): string {
  return /http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]*)"/i.exec(text)?.[1]
    ?? /http-equiv=["']Content-Security-Policy["'][^>]*content='([^']*)'/i.exec(text)?.[1]
    ?? '';
}

function hasInlineScriptTag(text: string): boolean {
  return /<script\b(?![^>]*\bsrc=)[^>]*>/i.test(text);
}

function score(counts: Counts): number {
  return Object.entries(counts).reduce((sum, [key, value]) => sum + value * weights[key as keyof Counts], 0);
}

const counts: Counts = {
  innerHTML: 0,
  onclick: 0,
  inlineWorkerBlob: 0,
  evalLike: 0,
  dynamicScript: 0,
  globalRuntimeExports: 0,
  servedHtmlUnsafeInlineScript: 0,
  servedHtmlUnsafeInlineStyle: 0,
  standalonePortableInlineScript: 0,
  standalonePortableBlobWorker: 0
};
const files: Record<string, Counts> = {};

function emptyCounts(): Counts {
  return {
    innerHTML: 0,
    onclick: 0,
    inlineWorkerBlob: 0,
    evalLike: 0,
    dynamicScript: 0,
    globalRuntimeExports: 0,
    servedHtmlUnsafeInlineScript: 0,
    servedHtmlUnsafeInlineStyle: 0,
    standalonePortableInlineScript: 0,
    standalonePortableBlobWorker: 0
  };
}

function addCounts(target: Counts, next: Counts): void {
  for (const key of Object.keys(target) as Array<keyof Counts>) target[key] += next[key];
}

function sourceCounts(text: string): Counts {
  return {
    ...emptyCounts(),
    innerHTML: countMatches(text, /\binnerHTML\b/g),
    onclick: countMatches(text, /\.onclick\b/g),
    inlineWorkerBlob: countMatches(text, /new\s+Blob\s*\(\s*\[\s*workerSrc/g),
    evalLike: countMatches(text, /\beval\s*\(|new\s+Function\b/g),
    dynamicScript: countMatches(text, /createElement\s*\(\s*['"]script['"]\s*\)/g),
    globalRuntimeExports: countMatches(text, /(?:globalThis|window)\.(App|Physics|Validation|WorkerMgr)\s*=/g)
  };
}

for (const dir of rootDirs) {
  for (const file of await collectFiles(dir)) {
    const text = await readFile(file, 'utf8');
    const fileCounts = sourceCounts(text);
    files[relative('.', file)] = fileCounts;
    addCounts(counts, fileCounts);
  }
}

for (const file of rootFiles) {
  const text = await readFile(file, 'utf8');
  const fileCounts = sourceCounts(text);
  const csp = cspContent(text);
  fileCounts.servedHtmlUnsafeInlineScript = /script-src[^;]*'unsafe-inline'/.test(csp) || hasInlineScriptTag(text) ? 1 : 0;
  fileCounts.servedHtmlUnsafeInlineStyle = /style-src[^;]*'unsafe-inline'/.test(csp) ? 1 : 0;
  files[file] = fileCounts;
  addCounts(counts, fileCounts);
}

for (const file of standaloneFiles) {
  const text = await readFile(file, 'utf8');
  const fileCounts = emptyCounts();
  const csp = cspContent(text);
  fileCounts.standalonePortableInlineScript = /script-src[^;]*'unsafe-inline'/.test(csp) || hasInlineScriptTag(text) ? 1 : 0;
  fileCounts.standalonePortableBlobWorker = /worker-src[^;]*\bblob:/.test(csp) ? 1 : 0;
  files[file] = fileCounts;
  addCounts(counts, fileCounts);
}

if (counts.servedHtmlUnsafeInlineScript > 0) {
  console.error('Served app shell allows inline scripts; keep app.html/Vite CSP strict and reserve inline script for standalone index.html only.');
}
if (counts.servedHtmlUnsafeInlineStyle > 0) {
  console.error('Served app shell allows inline styles; keep app.html/Vite CSP strict and move styles to CSS files.');
}

let baseline: { counts: Counts; weightedScore: number } | null = null;
try {
  baseline = JSON.parse(await readFile('reports/legacy-risk-baseline.json', 'utf8')) as { counts: Counts; weightedScore: number };
} catch {
  baseline = null;
}

const weightedScore = score(counts);
const baselineScore = baseline?.weightedScore ?? weightedScore;
const delta = weightedScore - baselineScore;
const servedCspPass = counts.servedHtmlUnsafeInlineScript === 0 && counts.servedHtmlUnsafeInlineStyle === 0;
const pass = (baseline ? weightedScore < baselineScore : true) && servedCspPass;
const report = {
  generatedAt: new Date().toISOString(),
  pass,
  counts,
  weights,
  weightedScore,
  baselineScore,
  delta,
  files
};

const markdown = [
  '# Legacy Risk Audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Status: ${pass ? 'PASS' : 'FAIL'}`,
  `Weighted score: ${weightedScore} (${delta <= 0 ? '' : '+'}${delta} vs baseline)`,
  '',
  '| Metric | Count | Weight | Weighted | Baseline |',
  '|---|---:|---:|---:|---:|',
  ...Object.keys(counts).map((key) => {
    const metric = key as keyof Counts;
    return `| ${metric} | ${counts[metric]} | ${weights[metric]} | ${counts[metric] * weights[metric]} | ${baseline?.counts?.[metric] ?? 'n/a'} |`;
  })
].join('\n');

await mkdir('reports', { recursive: true });
await writeFile('reports/legacy-risk-report.json', JSON.stringify(report, null, 2));
await writeFile('reports/legacy-risk-report.md', `${markdown}\n`);

console.log(markdown);
if (!pass) process.exitCode = 1;
