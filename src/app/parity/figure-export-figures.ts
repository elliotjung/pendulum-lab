/** Focused publication-export responsibility extracted from figure-export.ts. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import { downloadBytes } from '../../export/manifest';

import { buildZip, dataUrlToBytes, textToBytes, type ZipEntryInput } from '../../research/zipBundle';

import {
  figureFingerprint,
  figureSourceCsv,
  renderStudyFigureSvg,
  scaleCanvasToPngDataUrl,
  studyFigureFromSavedStudy,
  type FigureTheme
} from '../../research/figurePipeline';
import { currentSnapshot, downloadText, selectValue, setText, state, toast } from './shared';

import { logResearchRun, studyPlanHash, studyPointValue } from './research-workbench';

import {
  FIGURE_CAPTIONS,
  blankDataUrl,
  buildPaperFigureManifest as createPaperFigureManifest,
  collectPaperFigures,
  effectiveFigureCaption,
  renderCapturedFigureSvg,
  saveFigureCaptionOverride,
  type PaperFigureManifest
} from './paper-figure-capture';

// --- Figure Studio -----------------------------------------------------------

export function selectedFigureTheme(): FigureTheme {
  const raw = selectValue('rwFigTheme', 'light');
  return raw === 'dark' || raw === 'print' || raw === 'colorblind' ? raw : 'light';
}

export function selectedFigureScale(): 1 | 2 | 4 {
  const raw = selectValue('rwFigScale', '1');
  return raw === '2' ? 2 : raw === '4' ? 4 : 1;
}

export function renderFigureStudio(): void {
  const select = $('rwFigSelect');
  const captionField = $('rwFigCaption');
  if (select instanceof HTMLSelectElement && captionField instanceof HTMLTextAreaElement) {
    captionField.value = effectiveFigureCaption(select.value);
  }
}

export function saveSelectedFigureCaption(): void {
  const select = $('rwFigSelect');
  const captionField = $('rwFigCaption');
  if (!(select instanceof HTMLSelectElement) || !(captionField instanceof HTMLTextAreaElement)) return;
  saveFigureCaptionOverride(select.value, captionField.value);
  setText('rwFigureSummary', `Caption saved for ${select.value}. Exports and bundles now use it.`);
  toast('Caption saved');
}

export function studyFigureSpecFromCurrentStudy(): ReturnType<typeof studyFigureFromSavedStudy> | null {
  const plan = state.research.parameterStudy;
  if (!plan) return null;
  const rows = plan.experiments
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.results)
    .map(({ point, index }) => ({
      value: Number(studyPointValue(plan, point, index)),
      lambdaMax: point.results!.lambdaMax,
      lambdaErr: point.results!.lambdaBlockStdError
    }))
    .filter((row) => Number.isFinite(row.value));
  if (rows.length === 0) return null;
  return studyFigureFromSavedStudy(
    { variable: plan.variable, strategy: plan.strategy, planHash: studyPlanHash(plan), rows },
    selectedFigureTheme()
  );
}

/** Vector SVG of λ(parameter) regenerated from the saved study (true vector, themed). */
export function exportStudyFigureSvg(): void {
  const spec = studyFigureSpecFromCurrentStudy();
  if (!spec) {
    toast('Run a study batch first — the figure regenerates from saved results');
    return;
  }
  const svg = renderStudyFigureSvg(spec);
  downloadText(`pendulum_study_figure_${spec.theme}.svg`, svg, 'image/svg+xml;charset=utf-8');
  setText(
    'rwFigureSummary',
    `SVG exported (theme ${spec.theme}, ${spec.points.length} points). Visual fingerprint ${figureFingerprint(svg)}.`
  );
  logResearchRun(
    'export',
    'Study figure SVG',
    `theme ${spec.theme}, ${spec.points.length} points, fingerprint ${figureFingerprint(svg)}`,
    `pendulum_study_figure_${spec.theme}.svg`
  );
}

/** Rasterise the themed SVG study figure to PNG at the selected 1x/2x/4x scale. */
export async function exportStudyFigurePng(): Promise<void> {
  const spec = studyFigureSpecFromCurrentStudy();
  if (!spec) {
    toast('Run a study batch first — the figure regenerates from saved results');
    return;
  }
  const scale = selectedFigureScale();
  const svg = renderStudyFigureSvg(spec);
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVG rasterisation failed'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = (spec.width ?? 720) * scale;
    canvas.height = (spec.height ?? 440) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    downloadBytes(
      `pendulum_study_figure_${spec.theme}_${scale}x.png`,
      dataUrlToBytes(canvas.toDataURL('image/png')),
      'image/png'
    );
    setText('rwFigureSummary', `PNG exported at ${scale}x (${canvas.width}×${canvas.height}, theme ${spec.theme}).`);
    logResearchRun(
      'export',
      'Study figure PNG',
      `${scale}x, theme ${spec.theme}`,
      `pendulum_study_figure_${spec.theme}_${scale}x.png`
    );
  } catch (error) {
    toast(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function exportStudyFigureCsv(): void {
  const spec = studyFigureSpecFromCurrentStudy();
  const plan = state.research.parameterStudy;
  if (!spec || !plan) {
    toast('Run a study batch first');
    return;
  }
  const csv = figureSourceCsv(spec, {
    planHash: studyPlanHash(plan),
    variable: plan.variable,
    strategy: plan.strategy
  });
  downloadText('pendulum_study_figure_source.csv', csv, 'text/csv;charset=utf-8');
  logResearchRun('export', 'Figure source CSV', `${spec.points.length} rows`, 'pendulum_study_figure_source.csv');
}

/** Download every drawn analysis canvas as PNG at the selected scale. */
export function exportScaledCanvases(): void {
  const scale = selectedFigureScale();
  let exported = 0;
  for (const id of Object.keys(FIGURE_CAPTIONS)) {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    try {
      const dataUrl = scaleCanvasToPngDataUrl(canvas, scale);
      if (dataUrl === blankDataUrl(canvas.width * scale, canvas.height * scale)) continue;
      exported += 1;
      downloadBytes(`pendulum_figure_${id}_${scale}x.png`, dataUrlToBytes(dataUrl), 'image/png');
    } catch {
      /* tainted or unreadable canvas: skip */
    }
  }
  setText(
    'rwFigureSummary',
    exported > 0
      ? `${exported} canvas figure(s) exported at ${scale}x.`
      : 'No drawn canvases found — visit the analysis tabs first.'
  );
  if (exported > 0) logResearchRun('export', 'Scaled canvas figures', `${exported} canvases at ${scale}x`);
}

/**
 * Export every drawn analysis canvas as an SVG artifact in one ZIP download.
 * Live canvases do not retain drawing primitives, so these SVGs are explicitly
 * marked `raster-embedded`; saved parameter studies use the true-vector path.
 */
export function exportCapturedFiguresSvgZip(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet - visit the analysis tabs first');
    return;
  }
  const manifest = buildPaperFigureManifest(figures);
  const entries: ZipEntryInput[] = figures.map((figure, index) => ({
    path: `figure-${String(index + 1).padStart(2, '0')}-${figure.id}.svg`,
    data: textToBytes(renderCapturedFigureSvg(figure))
  }));
  entries.push({ path: 'figure-manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) });
  const zip = buildZip(entries);
  downloadBytes('pendulum_canvas_svg_pack.zip', zip, 'application/zip');
  logResearchRun(
    'export',
    'Canvas SVG pack',
    `${figures.length} raster-embedded SVG figures with dimensions, captions, and source hashes`,
    'pendulum_canvas_svg_pack.zip'
  );
  setText(
    'rwFigureSummary',
    `${figures.length} canvas SVG artifact(s) exported. Saved-data study SVG remains the true-vector path.`
  );
  toast(`Canvas SVG pack exported (${figures.length} figures)`);
}

export function buildPaperFigureManifest(
  figures = collectPaperFigures(),
  snapshot = currentSnapshot()
): PaperFigureManifest {
  return createPaperFigureManifest(figures, snapshot);
}
