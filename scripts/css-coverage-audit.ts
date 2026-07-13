/**
 * Read-only CSS selector coverage audit using Chromium's precise CSS coverage.
 *
 * Direct run (no package script required):
 *   npx tsx scripts/css-coverage-audit.ts --url http://127.0.0.1:4173/app.html
 *
 * The report is intentionally an unused-*candidate* list. Dynamic selectors,
 * uncommon states, print rules, and browser-specific branches can be absent
 * from one traversal, so this tool never edits CSS and never fails on findings.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';

export interface CoverageRange {
  start: number;
  end: number;
}

export interface CssRuleRange {
  selector: string;
  start: number;
  end: number;
  line: number;
}

export interface CssUnusedCandidate {
  source: string;
  selector: string;
  line: number;
  bytes: number;
}

export interface CssCoverageEntry {
  url: string;
  text?: string;
  ranges: CoverageRange[];
}

export interface CssCoverageReport {
  schemaVersion: 'css-coverage/v1';
  generatedAt: string;
  url: string;
  traversal: string;
  totals: {
    stylesheets: number;
    cssBytes: number;
    usedBytes: number;
    usedPercent: number;
    unusedCandidateRules: number;
  };
  unusedCandidates: CssUnusedCandidate[];
  caveats: string[];
}

function matchingBrace(text: string, open: number, limit = text.length): number {
  let depth = 0;
  let quote = '';
  let comment = false;
  for (let i = open; i < limit; i += 1) {
    const char = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      comment = true;
      i += 1;
      continue;
    }
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return i;
  }
  return limit - 1;
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Lightweight range parser; nested conditional at-rules are traversed. */
export function extractStyleRuleRanges(css: string, from = 0, to = css.length): CssRuleRange[] {
  const rules: CssRuleRange[] = [];
  let cursor = from;
  while (cursor < to) {
    while (cursor < to && /\s/.test(css[cursor] ?? '')) cursor += 1;
    if (css.startsWith('/*', cursor)) {
      const close = css.indexOf('*/', cursor + 2);
      cursor = close < 0 ? to : close + 2;
      continue;
    }
    const open = css.indexOf('{', cursor);
    if (open < 0 || open >= to) break;
    const close = matchingBrace(css, open, to);
    const prelude = css.slice(cursor, open).trim();
    const preludeStart = cursor + Math.max(0, css.slice(cursor, open).indexOf(prelude));
    if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@layer') || prelude.startsWith('@container')) {
      rules.push(...extractStyleRuleRanges(css, open + 1, close));
    } else if (prelude && !prelude.startsWith('@')) {
      rules.push({ selector: prelude.replace(/\s+/g, ' '), start: preludeStart, end: close + 1, line: lineAt(css, preludeStart) });
    }
    cursor = close + 1;
  }
  return rules;
}

export function rangesOverlap(a: CoverageRange, b: CoverageRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function unusedCandidatesForEntry(entry: CssCoverageEntry): CssUnusedCandidate[] {
  const text = entry.text ?? '';
  const used = entry.ranges.map((range) => ({ start: range.start, end: range.end }));
  return extractStyleRuleRanges(text)
    .filter((rule) => !used.some((range) => rangesOverlap(rule, range)))
    .map((rule) => ({
      source: entry.url || 'inline-style',
      selector: rule.selector,
      line: rule.line,
      bytes: rule.end - rule.start
    }));
}

export function mergeRanges(ranges: readonly CoverageRange[]): CoverageRange[] {
  const sorted = [...ranges].filter((range) => range.end > range.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: CoverageRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

async function representativeTraversal(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const tabs = await page.locator('.tab[data-tab]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.tab ?? '').filter(Boolean)
  );
  for (const tab of tabs) {
    await page.evaluate((id) => {
      (document.querySelector(`.tab[data-tab="${CSS.escape(id)}"]`) as HTMLButtonElement | null)?.click();
    }, tab);
    await page.waitForTimeout(35);
  }
  await page.evaluate(() => {
    (document.querySelector('.tab[data-tab="lab"]') as HTMLButtonElement | null)?.click();
    document.querySelectorAll('details').forEach((details) => { details.open = true; });
  });
  await page.waitForTimeout(150);
}

function reportMarkdown(report: CssCoverageReport): string {
  const rows = report.unusedCandidates
    .map((candidate) => `| \`${candidate.selector.replace(/\|/g, '\\|')}\` | ${candidate.source} | ${candidate.line} | ${candidate.bytes} |`)
    .join('\n');
  return `# CSS coverage audit\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `Representative tab traversal used ${report.totals.usedPercent.toFixed(2)}% of ${report.totals.cssBytes} CSS bytes across ${report.totals.stylesheets} stylesheet entries. ` +
    `${report.totals.unusedCandidateRules} rules are review candidates only.\n\n` +
    `> ${report.caveats.join(' ')}\n\n` +
    `| Selector candidate | Source | Line | Rule bytes |\n|---|---|---:|---:|\n${rows || '| _None_ | | | |'}\n`;
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

export async function runCssCoverageAudit(url: string): Promise<CssCoverageReport> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await representativeTraversal(page);
    const entries = await page.coverage.stopCSSCoverage();
    const cssBytes = entries.reduce((sum, entry) => sum + (entry.text?.length ?? 0), 0);
    const usedBytes = entries.reduce((sum, entry) => sum + mergeRanges(entry.ranges).reduce((inner, range) => inner + range.end - range.start, 0), 0);
    const unusedCandidates = entries.flatMap((entry) => unusedCandidatesForEntry(entry)).sort((a, b) => b.bytes - a.bytes || a.source.localeCompare(b.source) || a.line - b.line);
    return {
      schemaVersion: 'css-coverage/v1',
      generatedAt: new Date().toISOString(),
      url,
      traversal: 'desktop Chromium: load, visit every workspace tab, reopen Lab, expand details',
      totals: {
        stylesheets: entries.length,
        cssBytes,
        usedBytes,
        usedPercent: cssBytes > 0 ? (usedBytes / cssBytes) * 100 : 0,
        unusedCandidateRules: unusedCandidates.length
      },
      unusedCandidates,
      caveats: [
        'Candidates are not deletion instructions.',
        'Hover/focus, print, reduced-motion, compact viewport, delayed jobs, and browser-specific selectors may be valid but uncovered.'
      ]
    };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const url = argument('--url', 'http://127.0.0.1:4173/app.html');
  const jsonPath = argument('--json', 'reports/css-coverage.json');
  const markdownPath = argument('--markdown', 'reports/css-coverage.md');
  const report = await runCssCoverageAudit(url);
  await mkdir('reports', { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, reportMarkdown(report), 'utf8');
  console.log(`CSS coverage: ${report.totals.usedPercent.toFixed(2)}% bytes used; ${report.totals.unusedCandidateRules} review candidates.`);
  console.log(`${jsonPath} and ${markdownPath} written (no CSS changed).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
