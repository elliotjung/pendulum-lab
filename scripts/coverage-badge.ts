import { mkdir, readFile, writeFile } from 'node:fs/promises';

interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface CoverageSummary {
  total: {
    lines: CoverageMetric;
    statements: CoverageMetric;
    functions: CoverageMetric;
    branches: CoverageMetric;
  };
}

const summary = JSON.parse(await readFile('reports/coverage/coverage-summary.json', 'utf8')) as CoverageSummary;
const percent = Number(summary.total.lines.pct.toFixed(1));
const color = percent >= 80 ? '#2ea043' : percent >= 60 ? '#d29922' : '#cf222e';
const label = 'coverage';
const message = `${percent.toFixed(1)}%`;
const leftWidth = 70;
const rightWidth = 62;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}: ${message}" width="${leftWidth + rightWidth}" height="20" viewBox="0 0 ${leftWidth + rightWidth} 20">
<title>${label}: ${message}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".08"/></linearGradient>
<clipPath id="r"><rect width="${leftWidth + rightWidth}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${leftWidth}" height="20" fill="#30363d"/><rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/><rect width="${leftWidth + rightWidth}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${leftWidth / 2}" y="14">${label}</text><text x="${leftWidth + rightWidth / 2}" y="14">${message}</text></g></svg>\n`;
const endpoint = {
  schemaVersion: 1,
  label,
  message,
  color,
  metrics: summary.total
};

await mkdir('reports', { recursive: true });
await writeFile('reports/coverage-badge.json', `${JSON.stringify(endpoint, null, 2)}\n`, 'utf8');
await writeFile('reports/coverage-badge.svg', svg, 'utf8');
console.log(`coverage badge written (${message} lines)`);
