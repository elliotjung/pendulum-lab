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
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

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
  schemaVersion: 'css-coverage/v2';
  generatedAt: string;
  url: string;
  traversal: string;
  provenance: {
    engine: 'chromium';
    independentPasses: number;
    scenariosPerPass: number;
    passes: Array<{ id: string; scenarios: CssCoverageScenario[] }>;
  };
  totals: {
    stylesheets: number;
    cssBytes: number;
    usedBytes: number;
    usedPercent: number;
    unusedCandidateRules: number;
  };
  unusedCandidates: CssUnusedCandidate[];
  deletionPolicy: {
    eligibleCandidateRules: number;
    requirement: string;
    visualGate: string;
  };
  caveats: string[];
}

export interface CssCoverageScenario {
  id: string;
  locale: 'en' | 'ko';
  audienceMode: 'beginner' | 'student' | 'research';
  theme: 'light' | 'dark';
  viewport: { width: number; height: number };
  media: 'screen' | 'print';
  reducedMotion: 'reduce' | 'no-preference';
  forcedColors: 'active' | 'none';
  exercisedStates: string[];
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
    if (
      prelude.startsWith('@media') ||
      prelude.startsWith('@supports') ||
      prelude.startsWith('@layer') ||
      prelude.startsWith('@container')
    ) {
      rules.push(...extractStyleRuleRanges(css, open + 1, close));
    } else if (prelude && !prelude.startsWith('@')) {
      rules.push({
        selector: prelude.replace(/\s+/g, ' '),
        start: preludeStart,
        end: close + 1,
        line: lineAt(css, preludeStart)
      });
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
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
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
  const tabs = await page
    .locator('.tab[data-tab]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.tab ?? '').filter(Boolean));
  for (const tab of tabs) {
    await page.evaluate((id) => {
      (document.querySelector(`.tab[data-tab="${CSS.escape(id)}"]`) as HTMLButtonElement | null)?.click();
    }, tab);
    await page.waitForTimeout(35);
  }
  await page.evaluate(() => {
    (document.querySelector('.tab[data-tab="lab"]') as HTMLButtonElement | null)?.click();
    document.querySelectorAll('details').forEach((details) => {
      details.open = true;
    });
  });
  await page.waitForTimeout(150);
}

const COVERAGE_SCENARIOS: readonly CssCoverageScenario[] = [
  {
    id: 'research-en-dark-desktop',
    locale: 'en',
    audienceMode: 'research',
    theme: 'dark',
    viewport: { width: 1440, height: 1000 },
    media: 'screen',
    reducedMotion: 'no-preference',
    forcedColors: 'none',
    exercisedStates: ['all-tabs', 'details-open', 'hover', 'focus', 'delayed-mount']
  },
  {
    id: 'student-ko-light-mobile',
    locale: 'ko',
    audienceMode: 'student',
    theme: 'light',
    viewport: { width: 390, height: 844 },
    media: 'screen',
    reducedMotion: 'no-preference',
    forcedColors: 'none',
    exercisedStates: ['all-visible-tabs', 'details-open', 'compact-viewport']
  },
  {
    id: 'beginner-en-dark-reduced-mobile',
    locale: 'en',
    audienceMode: 'beginner',
    theme: 'dark',
    viewport: { width: 320, height: 640 },
    media: 'screen',
    reducedMotion: 'reduce',
    forcedColors: 'none',
    exercisedStates: ['beginner-surface', 'compact-viewport', 'reduced-motion']
  },
  {
    id: 'research-ko-light-forced-colors',
    locale: 'ko',
    audienceMode: 'research',
    theme: 'light',
    viewport: { width: 1280, height: 900 },
    media: 'screen',
    reducedMotion: 'no-preference',
    forcedColors: 'active',
    exercisedStates: ['all-tabs', 'forced-colors', 'pwa-update', 'error-overlay']
  },
  {
    id: 'research-en-dark-print',
    locale: 'en',
    audienceMode: 'research',
    theme: 'dark',
    viewport: { width: 1280, height: 900 },
    media: 'print',
    reducedMotion: 'reduce',
    forcedColors: 'none',
    exercisedStates: ['all-tabs', 'print', 'reduced-motion']
  }
];

function scenarioContext(scenario: CssCoverageScenario): BrowserContextOptions {
  return {
    viewport: scenario.viewport,
    colorScheme: scenario.theme,
    reducedMotion: scenario.reducedMotion,
    forcedColors: scenario.forcedColors,
    // A coverage traversal must measure one source snapshot. An older local
    // service worker can otherwise activate mid-pass and replace the document,
    // destroying the CDP execution context while tabs are being exercised.
    serviceWorkers: 'block'
  };
}

async function exerciseScenario(page: Page, url: string, scenario: CssCoverageScenario): Promise<CssCoverageEntry[]> {
  await page.addInitScript(({ audienceMode, theme, locale }) => {
    localStorage.setItem('pendulum-lab/ui/audience-mode', audienceMode);
    localStorage.setItem('pendulum-lab/ui/color-theme', theme);
    localStorage.setItem('pendulum-lab/ui/nav-locale', locale);
  }, scenario);
  await page.emulateMedia({
    media: scenario.media,
    colorScheme: scenario.theme,
    reducedMotion: scenario.reducedMotion,
    forcedColors: scenario.forcedColors
  });
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });
  const target = new URL(url);
  target.searchParams.set('lang', scenario.locale);
  await page.goto(target.href, { waitUntil: 'domcontentloaded' });
  await representativeTraversal(page);
  const focusable = page.locator('button:not([disabled]), input:not([disabled]), select:not([disabled])').first();
  if (await focusable.isVisible().catch(() => false)) {
    await focusable.focus();
    await focusable.hover().catch(() => undefined);
  }
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.pwa-update-banner')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.rgv7-fault')?.classList.add('show');
    document.querySelector<HTMLElement>('#nanOverlay')?.removeAttribute('hidden');
  });
  await page.waitForTimeout(250);
  return (await page.coverage.stopCSSCoverage()).map((entry) => ({
    url: entry.url,
    ...(entry.text === undefined ? {} : { text: entry.text }),
    ranges: entry.ranges
  }));
}

function stylesheetKey(entry: CssCoverageEntry): string {
  return createHash('sha256')
    .update(entry.text ?? '')
    .digest('hex');
}

function mergeCoverageEntries(entries: readonly CssCoverageEntry[]): CssCoverageEntry[] {
  const merged = new Map<string, CssCoverageEntry>();
  for (const entry of entries) {
    const key = stylesheetKey(entry);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        url: entry.url,
        ...(entry.text === undefined ? {} : { text: entry.text }),
        ranges: [...entry.ranges]
      });
    } else {
      current.ranges.push(...entry.ranges);
    }
  }
  return [...merged.values()].map((entry) => ({ ...entry, ranges: mergeRanges(entry.ranges) }));
}

async function collectPass(browser: Browser, url: string): Promise<CssCoverageEntry[]> {
  const entries: CssCoverageEntry[] = [];
  for (const scenario of COVERAGE_SCENARIOS) {
    const context = await browser.newContext(scenarioContext(scenario));
    try {
      entries.push(...(await exerciseScenario(await context.newPage(), url, scenario)));
    } finally {
      await context.close();
    }
  }
  return mergeCoverageEntries(entries);
}

function reportMarkdown(report: CssCoverageReport): string {
  const rows = report.unusedCandidates
    .map(
      (candidate) =>
        `| \`${candidate.selector.replace(/\|/g, '\\|')}\` | ${candidate.source} | ${candidate.line} | ${candidate.bytes} |`
    )
    .join('\n');
  return (
    `# CSS coverage audit\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `${report.provenance.independentPasses} independent state-matrix passes used ${report.totals.usedPercent.toFixed(2)}% of ${report.totals.cssBytes} CSS bytes across ${report.totals.stylesheets} stylesheet entries. ` +
    `${report.totals.unusedCandidateRules} rules remained unused in the union and are review candidates only.\n\n` +
    `> ${report.caveats.join(' ')}\n\n` +
    `| Selector candidate | Source | Line | Rule bytes |\n|---|---|---:|---:|\n${rows || '| _None_ | | | |'}\n`
  );
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the CSS coverage preview at ${url}. Run npm run build first.`);
}

/** Start a local Vite preview only when the requested local origin is absent. */
async function ensureLocalPreview(url: string): Promise<ChildProcess | null> {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || (await reachable(parsed.origin))) return null;
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const viteCli = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', parsed.hostname, '--port', port, '--strictPort'],
    { stdio: 'ignore', shell: false, windowsHide: true }
  );
  try {
    await waitForServer(parsed.origin);
    return server;
  } catch (error) {
    server.kill();
    throw error;
  }
}

export async function runCssCoverageAudit(url: string): Promise<CssCoverageReport> {
  const independentPasses = 2;
  const passEntries: CssCoverageEntry[][] = [];
  for (let pass = 0; pass < independentPasses; pass += 1) {
    const browser = await chromium.launch({ headless: true });
    try {
      passEntries.push(await collectPass(browser, url));
    } finally {
      await browser.close();
    }
  }
  const entries = mergeCoverageEntries(passEntries.flat());
  const cssBytes = entries.reduce((sum, entry) => sum + (entry.text?.length ?? 0), 0);
  const usedBytes = entries.reduce(
    (sum, entry) => sum + mergeRanges(entry.ranges).reduce((inner, range) => inner + range.end - range.start, 0),
    0
  );
  const unusedCandidates = entries
    .flatMap((entry) => unusedCandidatesForEntry(entry))
    .sort((a, b) => b.bytes - a.bytes || a.source.localeCompare(b.source) || a.line - b.line);
  return {
    schemaVersion: 'css-coverage/v2',
    generatedAt: new Date().toISOString(),
    url,
    traversal: 'two independent Chromium launches; union of locale/mode/theme/viewport/media/state matrix',
    provenance: {
      engine: 'chromium',
      independentPasses,
      scenariosPerPass: COVERAGE_SCENARIOS.length,
      passes: Array.from({ length: independentPasses }, (_value, index) => ({
        id: `pass-${index + 1}`,
        scenarios: COVERAGE_SCENARIOS.map((scenario) => ({
          ...scenario,
          exercisedStates: [...scenario.exercisedStates]
        }))
      }))
    },
    totals: {
      stylesheets: entries.length,
      cssBytes,
      usedBytes,
      usedPercent: cssBytes > 0 ? (usedBytes / cssBytes) * 100 : 0,
      unusedCandidateRules: unusedCandidates.length
    },
    unusedCandidates,
    deletionPolicy: {
      eligibleCandidateRules: unusedCandidates.length,
      requirement:
        'A rule must remain unused across both independent full state-matrix passes; removal still requires a small reviewed change.',
      visualGate: 'Linux, Windows, and macOS hosted-runner visual baselines must pass after any deletion.'
    },
    caveats: [
      'Candidates are not deletion instructions.',
      'The matrix covers hover/focus, print, reduced-motion, forced-colors, compact viewports, delayed mounts, and representative overlays.',
      'Chromium coverage cannot establish Firefox/WebKit-only selector reachability; vendor-specific rules require source review.'
    ]
  };
}

async function main(): Promise<void> {
  const url = argument('--url', 'http://127.0.0.1:4173/app.html');
  const jsonPath = argument('--json', 'reports/css-coverage.json');
  const markdownPath = argument('--markdown', 'reports/css-coverage.md');
  const server = await ensureLocalPreview(url);
  try {
    const report = await runCssCoverageAudit(url);
    await mkdir('reports', { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, reportMarkdown(report), 'utf8');
    console.log(
      `CSS coverage: ${report.totals.usedPercent.toFixed(2)}% bytes used; ${report.totals.unusedCandidateRules} review candidates.`
    );
    console.log(`${jsonPath} and ${markdownPath} written (no CSS changed).`);
  } finally {
    server?.kill();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
