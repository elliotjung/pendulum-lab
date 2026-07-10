import { csvCell, hashText } from './researchExportUtils';

/**
 * Publication-grade figure pipeline: deterministic true-vector SVG charts for
 * study results (the headline λ(parameter) figure), 1×/2×/4× raster scaling of
 * captured canvases (OffscreenCanvas when supported), light/dark/print/
 * colourblind-safe themes, per-figure source CSV, and regeneration of figures
 * from a saved study without re-running any physics.
 */

export type FigureTheme = 'light' | 'dark' | 'print' | 'colorblind';

export interface FigureThemeSpec {
  background: string;
  foreground: string;
  grid: string;
  accent: string;
  error: string;
  zeroLine: string;
}

/** Colourblind palette uses Okabe–Ito hues. */
export const FIGURE_THEMES: Record<FigureTheme, FigureThemeSpec> = {
  light: { background: '#ffffff', foreground: '#1a1a2e', grid: '#d9dee8', accent: '#2563eb', error: '#94a3b8', zeroLine: '#9ca3af' },
  dark: { background: '#0b1020', foreground: '#e6ecf8', grid: '#26314d', accent: '#4cc9f0', error: '#5b6b8c', zeroLine: '#5b6b8c' },
  print: { background: '#ffffff', foreground: '#000000', grid: '#cccccc', accent: '#000000', error: '#666666', zeroLine: '#888888' },
  colorblind: { background: '#ffffff', foreground: '#000000', grid: '#dddddd', accent: '#0072B2', error: '#E69F00', zeroLine: '#999999' }
};

export interface StudyFigurePoint {
  x: number;
  y: number;
  /** One-sigma uncertainty (error bar half-height); 0 hides the bar. */
  err: number;
}

export interface StudyFigureSpec {
  title: string;
  xLabel: string;
  yLabel: string;
  caption: string;
  points: StudyFigurePoint[];
  theme: FigureTheme;
  width?: number;
  height?: number;
  /** Draw a dashed y = 0 reference line (the chaos boundary for λ plots). */
  zeroLine?: boolean;
}

const fmt = (value: number): string => (Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0');

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Deterministic vector SVG chart (no timestamps, no randomness): identical
 * input produces byte-identical SVG, so visual-regression tests can hash it.
 */
export function renderStudyFigureSvg(spec: StudyFigureSpec): string {
  const width = spec.width ?? 720;
  const height = spec.height ?? 440;
  const theme = FIGURE_THEMES[spec.theme];
  const margin = { left: 64, right: 20, top: 42, bottom: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const points = spec.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const xs = points.map((point) => point.x);
  const ys = points.flatMap((point) => [point.y - point.err, point.y + point.err]);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMinRaw = ys.length ? Math.min(...ys, spec.zeroLine ? 0 : Infinity) : 0;
  const yMaxRaw = ys.length ? Math.max(...ys, spec.zeroLine ? 0 : -Infinity) : 1;
  const ySpan = yMaxRaw - yMinRaw || 1;
  const yMin = yMinRaw - 0.06 * ySpan;
  const yMax = yMaxRaw + 0.06 * ySpan;
  const sx = (x: number): number => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (y: number): number => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * plotH;

  const gridLines: string[] = [];
  const ticks = 5;
  for (let i = 0; i <= ticks; i += 1) {
    const gx = xMin + ((xMax - xMin) * i) / ticks;
    const gy = yMin + ((yMax - yMin) * i) / ticks;
    gridLines.push(`<line x1="${fmt(sx(gx))}" y1="${fmt(margin.top)}" x2="${fmt(sx(gx))}" y2="${fmt(margin.top + plotH)}" stroke="${theme.grid}" stroke-width="1"/>`);
    gridLines.push(`<line x1="${fmt(margin.left)}" y1="${fmt(sy(gy))}" x2="${fmt(margin.left + plotW)}" y2="${fmt(sy(gy))}" stroke="${theme.grid}" stroke-width="1"/>`);
    gridLines.push(`<text x="${fmt(sx(gx))}" y="${fmt(margin.top + plotH + 18)}" text-anchor="middle" font-size="11" fill="${theme.foreground}">${fmt(gx)}</text>`);
    gridLines.push(`<text x="${fmt(margin.left - 8)}" y="${fmt(sy(gy) + 4)}" text-anchor="end" font-size="11" fill="${theme.foreground}">${fmt(gy)}</text>`);
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const path = sorted.map((point, index) => `${index === 0 ? 'M' : 'L'}${fmt(sx(point.x))},${fmt(sy(point.y))}`).join(' ');
  const markers = sorted.map((point) => {
    const cx = fmt(sx(point.x));
    const items = [`<circle cx="${cx}" cy="${fmt(sy(point.y))}" r="3.2" fill="${theme.accent}"/>`];
    if (point.err > 0) {
      items.unshift(
        `<line x1="${cx}" y1="${fmt(sy(point.y - point.err))}" x2="${cx}" y2="${fmt(sy(point.y + point.err))}" stroke="${theme.error}" stroke-width="1.4"/>`,
        `<line x1="${fmt(sx(point.x) - 3.5)}" y1="${fmt(sy(point.y - point.err))}" x2="${fmt(sx(point.x) + 3.5)}" y2="${fmt(sy(point.y - point.err))}" stroke="${theme.error}" stroke-width="1.4"/>`,
        `<line x1="${fmt(sx(point.x) - 3.5)}" y1="${fmt(sy(point.y + point.err))}" x2="${fmt(sx(point.x) + 3.5)}" y2="${fmt(sy(point.y + point.err))}" stroke="${theme.error}" stroke-width="1.4"/>`
      );
    }
    return items.join('');
  }).join('');

  const zero = spec.zeroLine && yMin < 0 && yMax > 0
    ? `<line x1="${fmt(margin.left)}" y1="${fmt(sy(0))}" x2="${fmt(margin.left + plotW)}" y2="${fmt(sy(0))}" stroke="${theme.zeroLine}" stroke-width="1.2" stroke-dasharray="6 4"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}">`,
    `<rect width="${width}" height="${height}" fill="${theme.background}"/>`,
    `<text x="${fmt(width / 2)}" y="24" text-anchor="middle" font-size="15" font-weight="bold" fill="${theme.foreground}" font-family="Georgia, serif">${escapeXml(spec.title)}</text>`,
    ...gridLines,
    `<rect x="${fmt(margin.left)}" y="${fmt(margin.top)}" width="${fmt(plotW)}" height="${fmt(plotH)}" fill="none" stroke="${theme.foreground}" stroke-width="1"/>`,
    zero,
    points.length > 1 ? `<path d="${path}" fill="none" stroke="${theme.accent}" stroke-width="1.6"/>` : '',
    markers,
    `<text x="${fmt(margin.left + plotW / 2)}" y="${fmt(height - 26)}" text-anchor="middle" font-size="12" fill="${theme.foreground}">${escapeXml(spec.xLabel)}</text>`,
    `<text x="16" y="${fmt(margin.top + plotH / 2)}" text-anchor="middle" font-size="12" fill="${theme.foreground}" transform="rotate(-90 16 ${fmt(margin.top + plotH / 2)})">${escapeXml(spec.yLabel)}</text>`,
    `<text x="${fmt(margin.left)}" y="${fmt(height - 8)}" font-size="10" fill="${theme.foreground}" opacity="0.75">${escapeXml(spec.caption.slice(0, 160))}</text>`,
    '</svg>'
  ].filter(Boolean).join('\n');
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Stable hash of an SVG figure (the visual-regression fingerprint). */
export function figureFingerprint(svg: string): string {
  return hashText(svg);
}

/** Per-figure source-data CSV with provenance header lines. */
export function figureSourceCsv(spec: StudyFigureSpec, extraHeader: Record<string, string> = {}): string {
  const header = [
    `# figure=${spec.title}`,
    `# theme=${spec.theme}`,
    `# caption=${spec.caption.replace(/\n/g, ' ')}`,
    ...Object.entries(extraHeader).map(([key, value]) => `# ${key}=${value}`),
    'x,y,err'
  ];
  const rows = spec.points.map((point) => [point.x, point.y, point.err].map(csvCell).join(','));
  return [...header, ...rows].join('\n');
}

/**
 * Upscale a drawn canvas to an integer multiple (1×/2×/4×) for print DPI.
 * Uses OffscreenCanvas when the platform provides it; nearest-neighbour
 * sampling keeps plot lines crisp instead of smearing them.
 */
export { scaleCanvasToPngDataUrl } from '../browser/figureRaster';

export interface StudyFigureSource {
  variable: string;
  strategy: string;
  planHash: string;
  rows: { value: number; lambdaMax: number; lambdaErr: number }[];
}

/** Regenerate the headline λ(parameter) figure from saved study data (no physics re-run). */
export function studyFigureFromSavedStudy(source: StudyFigureSource, theme: FigureTheme, caption?: string): StudyFigureSpec {
  return {
    title: `Maximal Lyapunov exponent vs ${source.variable}`,
    xLabel: source.variable,
    yLabel: 'lambda_max (Benettin) ± block SE',
    caption: caption ?? `λ(${source.variable}) from saved study (${source.strategy}, ${source.rows.length} points, plan ${source.planHash}). Error bars: batched-means SE.`,
    points: source.rows.map((row) => ({ x: row.value, y: row.lambdaMax, err: row.lambdaErr })),
    theme,
    zeroLine: true
  };
}
