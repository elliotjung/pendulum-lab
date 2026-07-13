import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface BenchmarkAggregate {
  median: number;
}

interface BenchmarkReport {
  generatedAt: string;
  environment?: { commitSha?: string; browser?: string; os?: string; cpu?: string; gpu?: string; nodeVersion?: string };
  aggregates?: Record<string, Record<string, BenchmarkAggregate>>;
}

interface HistoryPoint {
  commit: string;
  generatedAt: string;
  fps: number;
  physicsMsPerStep: number;
  renderMs: number;
  memoryMiB: number;
  longTaskMs: number;
  environment: BenchmarkReport['environment'];
}

const outArg = process.argv.indexOf('--out-dir');
const outDir = outArg >= 0 ? (process.argv[outArg + 1] ?? 'reports/benchmarks') : 'reports/benchmarks';
const report = JSON.parse(await readFile('reports/benchmark-report.json', 'utf8')) as BenchmarkReport;
const aggregate = report.aggregates?.candidate ?? Object.values(report.aggregates ?? {})[0];
if (!aggregate) throw new Error('benchmark report has no aggregate');
const metric = (name: string): number => Number(aggregate[name]?.median ?? Number.NaN);
const point: HistoryPoint = {
  commit: report.environment?.commitSha ?? process.env.GITHUB_SHA ?? 'unknown',
  generatedAt: report.generatedAt,
  fps: metric('fps'),
  physicsMsPerStep: metric('physicsMsPerStep'),
  renderMs: metric('renderMsPerFrame'),
  memoryMiB: metric('memoryBytes') / (1024 * 1024),
  longTaskMs: metric('longTaskMs'),
  environment: report.environment
};
for (const [key, value] of Object.entries(point).filter(([key]) => !['commit', 'generatedAt', 'environment'].includes(key))) {
  if (!Number.isFinite(Number(value))) throw new Error(`benchmark aggregate ${key} is missing`);
}

await mkdir(outDir, { recursive: true });
let history: HistoryPoint[] = [];
try {
  history = JSON.parse(await readFile(join(outDir, 'history.json'), 'utf8')) as HistoryPoint[];
} catch {
  history = [];
}
history = history.filter((item) => item.commit !== point.commit);
history.push(point);
history = history.sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)).slice(-200);
await writeFile(join(outDir, 'history.json'), `${JSON.stringify(history, null, 2)}\n`, 'utf8');
await writeFile(join(outDir, 'index.html'), dashboard(history), 'utf8');
console.log(`benchmark history updated (${history.length} commits, latest ${point.commit.slice(0, 12)})`);

function dashboard(points: readonly HistoryPoint[]): string {
  const metricRows = [
    ['FPS (higher is better)', 'fps', '#38e88c'],
    ['Physics ms/step', 'physicsMsPerStep', '#18d4f8'],
    ['Render ms/frame', 'renderMs', '#9d78ff'],
    ['Memory MiB', 'memoryMiB', '#e7c887'],
    ['Long-task ms', 'longTaskMs', '#f56464']
  ] as const;
  const charts = metricRows.map(([label, key, color]) => chart(points, label, key, color)).join('\n');
  const latest = points.at(-1);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pendulum Lab benchmark history</title><style>body{margin:0;background:#05060f;color:#d4e0f5;font:14px system-ui,sans-serif}.wrap{max-width:1100px;margin:auto;padding:32px}h1{font-size:28px}.meta{color:#94a4c2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:18px;margin-top:24px}.card{background:#0b0f1e;border:1px solid #29324a;border-radius:14px;padding:18px}svg{width:100%;height:auto}.axis{stroke:#34405b;stroke-width:1}.line{fill:none;stroke-width:2.4}.value{font:11px ui-monospace,monospace;fill:#aebfda}</style></head><body><main class="wrap"><h1>Longitudinal performance</h1><p class="meta">${points.length} mainline commit${points.length === 1 ? '' : 's'}; latest ${escapeHtml(latest?.commit.slice(0, 12) ?? 'none')}. Environment metadata remains in <a href="history.json">history.json</a>.</p><section class="grid">${charts}</section></main></body></html>\n`;
}

function chart(points: readonly HistoryPoint[], label: string, key: keyof HistoryPoint, color: string): string {
  const values = points.map((point) => Number(point[key])).filter(Number.isFinite);
  if (values.length === 0) return `<article class="card"><h2>${escapeHtml(label)}</h2><p>No samples yet.</p></article>`;
  const width = 480;
  const height = 180;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(Number.EPSILON, max - min);
  const path = values.map((value, index) => {
    const x = 18 + (index / Math.max(1, values.length - 1)) * (width - 36);
    const y = height - 24 - ((value - min) / span) * (height - 48);
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<article class="card"><h2>${escapeHtml(label)}</h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} from ${min.toFixed(2)} to ${max.toFixed(2)}"><path class="axis" d="M18 12V156H462"/><path class="line" stroke="${color}" d="${path}"/><text class="value" x="24" y="28">max ${max.toFixed(2)}</text><text class="value" x="24" y="150">min ${min.toFixed(2)}</text></svg></article>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
