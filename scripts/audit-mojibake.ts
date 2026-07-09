import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type Finding = {
  path: string;
  line: number;
  pattern: string;
  excerpt: string;
};

const ROOT = process.cwd();
const REPORT_JSON = join(ROOT, 'reports', 'mojibake-audit.json');
const REPORT_MD = join(ROOT, 'reports', 'mojibake-audit.md');

const IGNORED_DIRS = new Set([
  '.git',
  '.kilo',
  '.stryker-tmp',
  'coverage',
  'dist',
  'dist-lib',
  'docs/api',
  'node_modules',
  'reports/coverage',
  'reports/mutation',
  'reports/playwright',
  'standalone',
  'test-results'
]);

const IGNORED_FILES = new Set([
  'reports/mojibake-audit.json',
  'reports/mojibake-audit.md'
]);

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml'
]);

const DISPLAY_TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml'
]);

const KNOWN_MOJIBAKE_TOKENS = [
  '\uCA0C',
  '\uCC55',
  '\uD69E',
  '\uBBB6',
  '\uBD55',
  '\uBC1A',
  '\uBC23',
  '\uBC04',
  '\uBC2A',
  '\uBC33',
  '\uBC20',
  '\uBC06',
  '\uAC4E',
  '\uBB56',
  '\uBBCA',
  '\uBBCB',
  '\u7F50',
  '\u6B3E',
  '\u8CAB'
] as const;

const SUSPICIOUS_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'replacement-character', regex: /\uFFFD/g },
  { label: 'latin1-utf8-c1', regex: /\u00C3[\u0080-\u00BF]/g },
  { label: 'stray-cp1252-latin1', regex: /\u00C2[\u0080-\u00BF]?/g },
  { label: 'cp1252-punctuation', regex: /\u00E2[\u0080-\u2122]{1,2}/g },
  { label: 'emoji-mojibake', regex: /\u00F0\u0178[\u0080-\u00BF]?/g },
  { label: 'known-korean-mojibake-fragments', regex: /[\uCA0C\uCC55\uD69E\uBBB6\uBD55\uBC1A\uBC23\uBC04\uBC2A\uBC33\uBC20\uBC06\uAC4E\uBB56\uBBCA\uBBCB\u7F50\u6B3E\u8CAB]/g },
  { label: 'known-rendered-mojibake-token', regex: new RegExp(KNOWN_MOJIBAKE_TOKENS.map(escapeRegExp).join('|'), 'g') }
];

function isIgnored(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (IGNORED_FILES.has(normalized)) return true;
  return relativePath.split(/[\\/]/).some((part, index, parts) => {
    const prefix = parts.slice(0, index + 1).join('/');
    return IGNORED_DIRS.has(part) || IGNORED_DIRS.has(prefix);
  });
}

function hasTextExtension(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function hasDisplayTextExtension(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && DISPLAY_TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineLooksLikeCode(relativePath: string, lineText: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.endsWith('package-lock.json')) return true;
  const trimmed = lineText.trim();
  return (
    trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.includes('${')
    || trimmed.includes('=>')
    || /\b(?:const|let|var|return|if|for|while|switch|case|type|interface|export|import)\b/.test(trimmed)
    || ((trimmed.includes('??') || trimmed.includes('?.')) && /[`=;(){}[\]]/.test(trimmed))
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(ROOT, path);
    if (isIgnored(rel)) continue;
    const stats = statSync(path);
    if (stats.isDirectory()) out.push(...walk(path));
    else if (stats.isFile() && hasTextExtension(path)) out.push(path);
  }
  return out;
}

function findSuspiciousText(path: string): Finding[] {
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  const text = readFileSync(path, 'utf8');
  const findings: Finding[] = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    for (const { label, regex } of SUSPICIOUS_PATTERNS) {
      regex.lastIndex = 0;
      if (!regex.test(lineText)) continue;
      findings.push({
        path: rel,
        line: index + 1,
        pattern: label,
        excerpt: lineText.trim().slice(0, 180)
      });
    }
    if (hasDisplayTextExtension(path) && /\?{2,}/.test(lineText) && !lineLooksLikeCode(rel, lineText)) {
      findings.push({
        path: rel,
        line: index + 1,
        pattern: 'literal-question-run-in-display-text',
        excerpt: lineText.trim().slice(0, 180)
      });
    }
    if (hasDisplayTextExtension(path) && /\?{2,}<\/|<[^>]*>\?{2,}\/?[a-z]/i.test(lineText)) {
      findings.push({
        path: rel,
        line: index + 1,
        pattern: 'possibly-mangled-html-token',
        excerpt: lineText.trim().slice(0, 180)
      });
    }
  });
  return findings;
}

const findings = walk(ROOT).flatMap(findSuspiciousText);
const summary = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  findingCount: findings.length,
  findings
};

writeFileSync(REPORT_JSON, `${JSON.stringify(summary, null, 2)}\n`);

const md = [
  '# Mojibake Audit',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Findings: ${findings.length}`,
  '',
  '| File | Line | Pattern | Excerpt |',
  '| --- | ---: | --- | --- |',
  ...findings.map((finding) => `| \`${finding.path}\` | ${finding.line} | \`${finding.pattern.replace(/\|/g, '\\|')}\` | ${finding.excerpt.replace(/\|/g, '\\|')} |`)
].join('\n');

writeFileSync(REPORT_MD, `${md}\n`);

if (process.argv.includes('--fail-on-findings') && findings.length > 0) {
  console.error(`Mojibake audit found ${findings.length} suspicious lines.`);
  process.exit(1);
}

console.log(`Mojibake audit wrote ${findings.length} findings to reports/mojibake-audit.md`);
