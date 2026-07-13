import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface Finding {
  file: string;
  message: string;
}

const SOURCE_ROOTS = ['src', 'scripts', 'tests', 'e2e'];
const ROOT_TEXT_FILES = ['app.html'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.html']);
const REQUIRED_ROOT_FILES = ['LICENSE', 'CITATION.cff'];
const AUDIT_TOOL_ALLOWLIST = /scripts[\\/](audit-legacy|worldclass-scorecard|lint-source)\.ts$/;

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string; allow?: RegExp }> = [
  {
    pattern: /\binnerHTML\b/g,
    message: 'Avoid innerHTML; use safe DOM builders or textContent.',
    allow: AUDIT_TOOL_ALLOWLIST
  },
  { pattern: /\bouterHTML\b/g, message: 'Avoid outerHTML; use safe DOM builders.', allow: AUDIT_TOOL_ALLOWLIST },
  { pattern: /\binsertAdjacentHTML\b/g, message: 'Avoid insertAdjacentHTML; build DOM nodes explicitly.', allow: AUDIT_TOOL_ALLOWLIST },
  { pattern: /\beval\s*\(/g, message: 'Avoid eval().', allow: AUDIT_TOOL_ALLOWLIST },
  { pattern: /\bnew\s+Function\b/g, message: 'Avoid new Function().', allow: AUDIT_TOOL_ALLOWLIST },
  { pattern: /\bdocument\.write\s*\(/g, message: 'Avoid document.write().', allow: AUDIT_TOOL_ALLOWLIST }
];

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

async function collectFiles(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'standalone' || entry.name === 'archive') continue;
      await collectFiles(full, out);
    } else if (TEXT_EXTENSIONS.has(extensionOf(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const findings: Finding[] = [];
  for (const file of REQUIRED_ROOT_FILES) {
    if (!(await exists(file))) findings.push({ file, message: 'Required citation/licensing file is missing.' });
  }

  const rootEntries = await readdir('.');
  const rootWorkers = rootEntries.filter((name) => /\.worker.*\.js$/i.test(name));
  if (rootWorkers.length > 0) findings.push({ file: '.', message: 'Generated worker bundles belong under standalone/, never the repository root.' });

  const files = [
    ...ROOT_TEXT_FILES.filter((file) => rootEntries.includes(file)),
    ...(await Promise.all(SOURCE_ROOTS.map((root) => collectFiles(root).catch(() => [])))).flat()
  ];
  for (const file of files) {
    const rel = relative('.', file);
    const text = await readFile(file, 'utf8');
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.allow?.test(rel)) continue;
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) findings.push({ file: rel, message: rule.message });
    }
  }

  if (findings.length) {
    for (const finding of findings) console.error(`${finding.file}: ${finding.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Source lint passed (${files.length} files scanned, ${rootWorkers.length} root worker bundle${rootWorkers.length === 1 ? '' : 's'}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
