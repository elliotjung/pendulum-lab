/**
 * Canvas figure capture and portable figure metadata.
 *
 * Keeping this logic outside the workbench exporter makes the artifact model
 * independently testable. Live analysis plots are canvas-based, so their SVG
 * representation deliberately records a raster-embedded rendering rather than
 * pretending the captured pixels are vector primitives. Data-backed study
 * figures continue to use the true-vector renderer in figurePipeline.ts.
 */
import type { RuntimeSnapshot } from '../../types/domain';
import { dataUrlByteEstimate, hashText } from '../../research/researchExportUtils';

export interface PaperFigure {
  id: string;
  caption: string;
  width: number;
  height: number;
  dataHash: string;
  byteEstimate: number;
  /** PNG data URL captured from the live canvas. */
  dataUrl: string;
}

export interface PaperFigureManifest {
  schemaVersion: 'pendulum-paper-figures/v2';
  generatedAt: string;
  runtime: RuntimeSnapshot;
  figureCount: number;
  totalBytes: number;
  figures: Array<{
    id: string;
    file: string;
    svgFile: string;
    caption: string;
    width: number;
    height: number;
    dataHash: string;
    byteEstimate: number;
    sourceCanvas: string;
    svgRendering: 'raster-embedded';
  }>;
}

/** Captions for every analysis canvas that can be captured by the workbench. */
export const FIGURE_CAPTIONS: Record<string, string> = {
  main: 'Pendulum trajectory with long-exposure trail (live simulation canvas).',
  energy: 'Total energy E(t); drift quantifies integrator fidelity.',
  lyap: 'Running maximal-Lyapunov estimate lambda(t) from the live divergence proxy.',
  phase: 'Phase portrait (theta versus angular velocity).',
  poincare: 'Poincare section at the theta = 0 positive-velocity crossing.',
  fft: 'Frequency spectrum of theta (FFT magnitude).',
  cmpCanvas: 'Integrator comparison: four methods overlaid on the same system.',
  cmpEnergy: 'Energy drift per integrator over the comparison run.',
  cmpDiverge: 'Pairwise trajectory divergence between integrators.',
  cmpBench: 'Throughput benchmark (steps/ms) across eight integrators.',
  lyapSpecCanvas: 'Full Lyapunov spectrum with per-exponent uncertainty.',
  sweepCanvas: 'Chaos map: maximal Lyapunov exponent over the parameter grid.',
  bifCanvas: 'Bifurcation diagram: Poincare values swept over gravity g.',
  p3dCanvas: 'Three-dimensional phase-space projection (orthographic).',
  gpuCanvas: 'Phase-density accumulation with additive blending.',
  zeroOneCanvas: 'Zero-one test translation path: bounded for regular and Brownian for chaotic motion.',
  clvCanvas: 'Covariant Lyapunov vector hyperbolicity angles along the trajectory.',
  basinCanvas: 'Flip-basin classification over initial conditions; fractal boundary.',
  rqaCanvas: 'Recurrence plot of the embedded cosine observable.',
  ftleCanvas: 'Finite-time Lyapunov exponent field; ridges are Lagrangian coherent structures.'
};

export const FIGURE_CAPTION_OVERRIDE_KEY = 'pendulum-lab/figure-captions/v1';
export const blankCanvasCache = new Map<string, string>();

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function blankDataUrl(width: number, height: number): string {
  const key = `${width}x${height}`;
  const cached = blankCanvasCache.get(key);
  if (cached) return cached;
  const probe = document.createElement('canvas');
  probe.width = width;
  probe.height = height;
  const url = probe.toDataURL('image/png');
  blankCanvasCache.set(key, url);
  return url;
}

export function loadFigureCaptionOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage?.getItem(FIGURE_CAPTION_OVERRIDE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (plainRecord(parsed)) {
      const overrides: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && key in FIGURE_CAPTIONS) overrides[key] = value.slice(0, 400);
      }
      return overrides;
    }
  } catch {
    /* Corrupt overrides are ignored; defaults apply. */
  }
  return {};
}

export function saveFigureCaptionOverride(id: string, caption: string): void {
  const overrides = loadFigureCaptionOverrides();
  if (caption.trim() && caption.trim() !== FIGURE_CAPTIONS[id]) overrides[id] = caption.trim();
  else delete overrides[id];
  try {
    window.localStorage?.setItem(FIGURE_CAPTION_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    /* Quota exhaustion leaves the default caption available. */
  }
}

export function effectiveFigureCaption(id: string): string {
  return loadFigureCaptionOverrides()[id] ?? FIGURE_CAPTIONS[id] ?? id;
}

/** Capture every drawn analysis canvas as a captioned PNG figure. */
export function collectPaperFigures(): PaperFigure[] {
  const overrides = loadFigureCaptionOverrides();
  const figures: PaperFigure[] = [];
  for (const [id, defaultCaption] of Object.entries(FIGURE_CAPTIONS)) {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      continue;
    }
    if (dataUrl === blankDataUrl(canvas.width, canvas.height)) continue;
    figures.push({
      id,
      caption: overrides[id] ?? defaultCaption,
      width: canvas.width,
      height: canvas.height,
      dataHash: hashText(dataUrl),
      byteEstimate: dataUrlByteEstimate(dataUrl),
      dataUrl
    });
  }
  return figures;
}

export function buildPaperFigureManifest(
  figures: readonly PaperFigure[],
  snapshot: RuntimeSnapshot,
  generatedAt = new Date().toISOString()
): PaperFigureManifest {
  return {
    schemaVersion: 'pendulum-paper-figures/v2',
    generatedAt,
    runtime: snapshot,
    figureCount: figures.length,
    totalBytes: figures.reduce((sum, figure) => sum + figure.byteEstimate, 0),
    figures: figures.map((figure, index) => {
      const stem = `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}`;
      return {
        id: figure.id,
        file: `${stem}.png`,
        svgFile: `${stem}.svg`,
        caption: figure.caption,
        width: figure.width,
        height: figure.height,
        dataHash: figure.dataHash,
        byteEstimate: figure.byteEstimate,
        sourceCanvas: `#${figure.id}`,
        svgRendering: 'raster-embedded' as const
      };
    })
  };
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap a live canvas capture in a standards-compliant SVG artifact.
 *
 * This preserves exact canvas pixels, dimensions, caption, and provenance in
 * an editable container. It is explicitly marked raster-embedded; callers that
 * have source numerical data should prefer renderStudyFigureSvg for true vector
 * axes and marks.
 */
export function renderCapturedFigureSvg(figure: PaperFigure): string {
  const titleHeight = 52;
  const width = Math.max(1, Math.round(figure.width));
  const height = Math.max(1, Math.round(figure.height));
  const documentHeight = height + titleHeight;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${documentHeight}" viewBox="0 0 ${width} ${documentHeight}" role="img" aria-labelledby="title desc" data-rendering="raster-embedded">`,
    `<title id="title">${escapeXml(figure.caption)}</title>`,
    `<desc id="desc">Captured from canvas #${escapeXml(figure.id)}; source hash ${escapeXml(figure.dataHash)}. The plot payload is raster-embedded.</desc>`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<image x="0" y="0" width="${width}" height="${height}" href="${figure.dataUrl}" xlink:href="${figure.dataUrl}" preserveAspectRatio="none"/>`,
    `<rect x="0" y="${height}" width="${width}" height="${titleHeight}" fill="#ffffff"/>`,
    `<text x="12" y="${height + 21}" fill="#111111" font-family="system-ui,sans-serif" font-size="13">${escapeXml(figure.caption)}</text>`,
    `<text x="12" y="${height + 40}" fill="#666666" font-family="ui-monospace,monospace" font-size="10">canvas #${escapeXml(figure.id)} | ${width}x${height} | hash ${escapeXml(figure.dataHash)}</text>`,
    '</svg>'
  ].join('\n');
}
