import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { delimiter, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export interface KoreanPortfolioPdfOptions {
  sourcePath?: string;
  outputPath?: string;
  validationPath?: string;
  previewDirectory?: string;
}

interface ToolResult {
  stdout: string;
  stderr: string;
}

interface PreviewInfo {
  path: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function normalizeForPrint(value: string): string {
  return value.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-').replaceAll('\u00a0', ' ');
}

function koreanCharacterCount(value: string): number {
  return value.match(/[가-힣]/g)?.length ?? 0;
}

function inlineMarkdown(value: string): string {
  const code: string[] = [];
  const withPlaceholders = value.replace(/`([^`]+)`/g, (_match, body: string) => {
    const index = code.push(`<code>${escapeHtml(body)}</code>`) - 1;
    return `\u0000CODE${index}\u0000`;
  });
  return escapeHtml(withPlaceholders)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => code[Number(index)] ?? '');
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function markdownToHtml(markdown: string): string {
  const lines = normalizeForPrint(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCode) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 2;
      const headingText = heading[2] ?? '';
      const className = headingText.startsWith('왜 이 프로젝트인가') ? ' class="page-break"' : '';
      blocks.push(`<h${level}${className}>${inlineMarkdown(headingText)}</h${level}>`);
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(nextLine)) {
      flushParagraph();
      flushList();
      const header = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push(splitTableRow(lines[index] ?? ''));
        index += 1;
      }
      index -= 1;
      blocks.push(
        `<table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      );
      continue;
    }

    const listItem = /^-\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1] ?? '');
      continue;
    }
    if (/^\s{2,}\S/.test(line) && listItems.length > 0) {
      const last = listItems.length - 1;
      listItems[last] = `${listItems[last] ?? ''} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (codeLines.length > 0) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return blocks.join('\n');
}

function portfolioHtml(markdown: string): string {
  const body = markdownToHtml(markdown);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pendulum Lab 한국어 포트폴리오</title>
<style>
  @page { size: A4; margin: 15mm 14mm 17mm; }
  :root { --ink:#172033; --muted:#566176; --cyan:#087e8b; --navy:#123a5a; --line:#cfdae3; --paper:#fff; }
  * { box-sizing:border-box; }
  html { background:#e7edf2; }
  body { margin:0; color:var(--ink); background:var(--paper); font-family:"Pretendard","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif; font-size:9.35pt; line-height:1.55; word-break:keep-all; overflow-wrap:anywhere; }
  main { max-width:182mm; margin:0 auto; }
  h1 { margin:0 0 5mm; padding:5mm 6mm 5.5mm; color:#fff; background:linear-gradient(125deg,var(--navy),#075e6b); border-radius:3mm; font-size:21pt; line-height:1.25; letter-spacing:-.025em; }
  h1::after { content:"NUMERICAL PHYSICS · VALIDATION · REPRODUCIBILITY"; display:block; margin-top:2.5mm; color:#c9f2f2; font-size:7.5pt; font-weight:600; letter-spacing:.12em; }
  h2 { margin:5mm 0 2mm; padding-bottom:1.2mm; color:var(--navy); border-bottom:.45mm solid var(--cyan); font-size:13.5pt; line-height:1.3; break-after:avoid; }
  h3 { margin:3.5mm 0 1.5mm; color:var(--cyan); font-size:11pt; break-after:avoid; }
  .page-break { break-before:page; margin-top:0; }
  p { margin:0 0 2.4mm; text-align:justify; }
  ul { margin:0 0 2.8mm; padding-left:5mm; }
  li { margin:0 0 1.3mm; padding-left:.5mm; }
  li::marker { color:var(--cyan); }
  strong { color:#0d3f5b; }
  code { padding:.25mm .8mm; color:#073b4c; background:#edf6f7; border-radius:.8mm; font-family:"Cascadia Mono","D2Coding",monospace; font-size:8.2pt; }
  pre { margin:2.8mm 0; padding:3mm 3.5mm; color:#edf7fa; background:#12283a; border-left:1.2mm solid #18a5af; border-radius:1.8mm; font-size:8.2pt; line-height:1.45; white-space:pre-wrap; break-inside:avoid; }
  pre code { padding:0; color:inherit; background:transparent; }
  table { width:100%; margin:2.8mm 0; border-collapse:collapse; table-layout:fixed; font-size:8.05pt; break-inside:avoid; }
  th, td { padding:1.8mm 2mm; border:.25mm solid var(--line); vertical-align:top; text-align:left; }
  th { color:#fff; background:var(--navy); font-weight:700; }
  td:first-child { width:31%; color:#0a5060; font-weight:650; background:#f2f8f9; }
  a { color:inherit; text-decoration:none; }
  @media print {
    html, body { background:#fff; }
    main { max-width:none; }
    h2, h3 { break-after:avoid-page; }
    p, li { orphans:3; widows:3; }
    table, pre { break-inside:avoid-page; }
  }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

async function resolveTool(command: string): Promise<string> {
  if (process.platform !== 'win32') return command;
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const executable = resolve(directory, `${command}.exe`);
    try {
      await access(executable);
      return executable;
    } catch {
      // Keep searching. The Codex runtime exposes Poppler through a cmd shim.
    }
    const codexNative = resolve(directory, '..', '..', 'native', 'poppler', 'Library', 'bin', `${command}.exe`);
    try {
      await access(codexNative);
      return codexNative;
    } catch {
      // Keep searching other PATH entries.
    }
  }
  return command;
}

async function runTool(command: string, args: readonly string[]): Promise<ToolResult> {
  const executable = await resolveTool(command);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${executable} exited ${String(code)}: ${stderr || stdout}`));
    });
  });
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || bytes.length < 24) throw new Error('Invalid PNG preview');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function hashFile(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function reportPath(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

async function removeOldPreviews(directory: string): Promise<void> {
  try {
    const entries = await readdir(directory);
    await Promise.all(
      entries
        .filter((entry) => /^portfolio-korean-page-\d+\.png$/.test(entry))
        .map((entry) => unlink(resolve(directory, entry)))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function generateKoreanPortfolioPdf(options: KoreanPortfolioPdfOptions = {}): Promise<void> {
  const sourcePath = resolve(options.sourcePath ?? 'documents/portfolio-korean.md');
  const outputPath = resolve(options.outputPath ?? 'reports/portfolio-korean.pdf');
  const validationPath = resolve(options.validationPath ?? 'reports/portfolio-korean-pdf-validation.json');
  const previewDirectory = resolve(options.previewDirectory ?? 'tmp/pdfs');
  const htmlPath = resolve(previewDirectory, 'portfolio-korean.html');

  const markdown = await readFile(sourcePath, 'utf8');
  if (koreanCharacterCount(markdown) < 500) throw new Error(`${sourcePath} does not contain expected Korean text`);
  const html = portfolioHtml(markdown);
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(previewDirectory, { recursive: true });
  await removeOldPreviews(previewDirectory);
  await writeFile(htmlPath, html, 'utf8');

  const consoleErrors: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const domAudit = await page.evaluate(() => ({
      title: document.title,
      language: document.documentElement.lang,
      headings: document.querySelectorAll('h1, h2, h3').length,
      textCharacters: document.body.innerText.length,
      tables: document.querySelectorAll('table').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font:8px Arial,sans-serif;color:#657184;padding:0 14mm;display:flex;justify-content:space-between"><span>Pendulum Lab · 한국어 포트폴리오</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
    });

    await access(outputPath);
    const pdfBytes = await readFile(outputPath);
    const pdfInfo = await runTool('pdfinfo', [outputPath]);
    const pageMatch = /^Pages:\s+(\d+)$/m.exec(pdfInfo.stdout);
    const pageCount = Number(pageMatch?.[1] ?? 0);
    const previewPrefix = resolve(previewDirectory, 'portfolio-korean-page');
    await runTool('pdftoppm', ['-png', '-r', '120', outputPath, previewPrefix]);
    const previewNames = (await readdir(previewDirectory))
      .filter((entry) => /^portfolio-korean-page-\d+\.png$/.test(entry))
      .sort((a, b) => Number(a.match(/(\d+)\.png$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.png$/)?.[1] ?? 0));
    const previews: PreviewInfo[] = [];
    for (const name of previewNames) {
      const path = resolve(previewDirectory, name);
      const bytes = await readFile(path);
      const dimensions = pngDimensions(bytes);
      previews.push({
        path: reportPath(path),
        bytes: bytes.length,
        ...dimensions,
        sha256: createHash('sha256').update(bytes).digest('hex')
      });
    }

    const pdfStats = await stat(outputPath);
    const checks = {
      pdfHeader: pdfBytes.subarray(0, 5).toString('ascii') === '%PDF-',
      pdfSize: pdfStats.size > 30_000,
      pageCount: pageCount > 0 && pageCount <= 6,
      previewCount: previews.length === pageCount,
      previewDimensions: previews.every((preview) => preview.width >= 950 && preview.height >= 1300),
      previewPayload: previews.every((preview) => preview.bytes >= 20_000),
      koreanSource: koreanCharacterCount(markdown) >= 500,
      documentStructure:
        domAudit.language === 'ko' &&
        domAudit.headings >= 4 &&
        domAudit.textCharacters >= 1_500 &&
        domAudit.tables >= 1,
      noHorizontalOverflow: !domAudit.horizontalOverflow,
      noConsoleErrors: consoleErrors.length === 0
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    const validation = {
      schemaVersion: 'pendulum-portfolio-pdf-validation/v1',
      generatedAt: new Date().toISOString(),
      status: failedChecks.length === 0 ? 'passed' : 'failed',
      sourcePath: reportPath(sourcePath),
      outputPath: reportPath(outputPath),
      htmlPath: reportPath(htmlPath),
      renderer: { pdf: 'Playwright Chromium print', preview: 'Poppler pdftoppm 120dpi' },
      pdf: { bytes: pdfStats.size, sha256: await hashFile(outputPath), pages: pageCount },
      domAudit,
      previews,
      checks,
      failedChecks,
      consoleErrors
    };
    await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
    if (failedChecks.length > 0) throw new Error(`Korean portfolio PDF validation failed: ${failedChecks.join(', ')}`);
    console.log(`Korean portfolio PDF written: ${outputPath} (${pageCount} pages)`);
    console.log(`Rendered previews: ${previews.map((preview) => preview.path).join(', ')}`);
    console.log(`Validation report: ${validationPath}`);
  } finally {
    await browser.close();
  }
}

const directInvocation =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directInvocation) {
  generateKoreanPortfolioPdf().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
