/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { RuntimeSnapshot } from '../../types/domain';
import { createSubmissionManifest, downloadBytes, downloadJson } from '../../export/manifest';
import { integratorRegistry } from '../../physics/integrators';
import { csvCell, dataUrlByteEstimate, hashText } from '../../research/researchExportUtils';
import { buildZip, checksumEntriesSha256, dataUrlToBytes, textToBytes, type ZipEntryInput } from '../../research/zipBundle';
import { collectEnvironment, ProvenanceBuilder, type ProvenanceGraph } from '../../research/provenance';
import { buildNotebookV2 } from '../../research/notebookBuilder';
import {
  figureFingerprint,
  figureSourceCsv,
  renderStudyFigureSvg,
  scaleCanvasToPngDataUrl,
  studyFigureFromSavedStudy,
  type FigureTheme
} from '../../research/figurePipeline';
import { clear, currentSnapshot, downloadText, html, selectValue, setText, state, toast } from './shared';
import { RESEARCH_STORAGE_SCHEMA_VERSION, isPlainObject, renderResearchStoragePanel, researchDbInstance } from './storage-sync';
import { buildComparisonRows, designStudy, designStudyCsvText, logResearchRun, metricValue, parameterStudyResultsCsvText, renderResearchTable, renderResearchWorkbench, studyCompletionSummary, studyPlanHash, studyPointValue } from './research-workbench';
import { $ } from './shared';


export function buildMethodsText(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const limitations = createSubmissionManifest(snapshot).limitations.map((item) => `- ${item}`).join('\n');
  return [
    '# Pendulum Lab Methods',
    '',
    `System: ${snapshot.systemType} pendulum.`,
    `Integrator: ${method.name} (id ${method.id}, order ${method.order}, symplectic label: ${method.symplectic}).`,
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    `Damping gamma: ${snapshot.damping}; mode: ${snapshot.mode}; state hash: ${snapshot.hash}.`,
    `Parameters: ${JSON.stringify(snapshot.parameters)}.`,
    '',
    'Reproducibility:',
    `Seed: ${snapshot.seed ?? 'none'}.`,
    'All exported runs include the runtime snapshot, selected integrator metadata, browser-worker policy, and limitation notes.',
    '',
    'Limitations:',
    limitations
  ].join('\n');
}

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
    caption: string;
    width: number;
    height: number;
    dataHash: string;
    byteEstimate: number;
    sourceCanvas: string;
  }>;
}

/**
 * Captions for every analysis canvas the app can draw. Canvases render only
 * while their tab is (or was) active, so blank canvases are filtered out at
 * capture time rather than listed with empty images.
 */
export const FIGURE_CAPTIONS: Record<string, string> = {
  main: 'Pendulum trajectory with long-exposure trail (live simulation canvas).',
  energy: 'Total energy E(t); drift quantifies integrator fidelity.',
  lyap: 'Running maximal-Lyapunov estimate λ₁(t) from the live divergence proxy.',
  phase: 'Phase portrait (θ₁, ω₁).',
  poincare: 'Poincaré section at the θ₁ = 0 (θ̇₁ > 0) crossing.',
  fft: 'Frequency spectrum of θ₁ (FFT magnitude).',
  cmpCanvas: 'Integrator comparison: four methods overlaid on the same system.',
  cmpEnergy: 'Energy drift per integrator over the comparison run.',
  cmpDiverge: 'Pairwise trajectory divergence between integrators.',
  cmpBench: 'Throughput benchmark (steps/ms) across eight integrators.',
  lyapSpecCanvas: 'Full Lyapunov spectrum with per-exponent uncertainty.',
  sweepCanvas: 'Chaos map: maximal Lyapunov exponent over the (θ₁, θ₂) grid.',
  bifCanvas: 'Bifurcation diagram: Poincaré θ₂ values swept over gravity g.',
  p3dCanvas: '3D phase-space projection (θ₁, θ₂, ω₂), orthographic.',
  gpuCanvas: 'Phase-density accumulation over (θ₁, ω₁), additive blending.',
  zeroOneCanvas: '0–1 test translation path (p_c, q_c): bounded ⇒ regular, Brownian ⇒ chaotic.',
  clvCanvas: 'Covariant Lyapunov vector hyperbolicity angles along the trajectory.',
  basinCanvas: 'Flip-basin classification over initial conditions; fractal boundary.',
  rqaCanvas: 'Recurrence plot of the embedded cos θ₁ observable.',
  ftleCanvas: 'Finite-time Lyapunov exponent field; ridges are Lagrangian coherent structures.'
};

/** Data URL of an untouched canvas of the same size — used to skip blank canvases. */
export const blankCanvasCache = new Map<string, string>();

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

export const FIGURE_CAPTION_OVERRIDE_KEY = 'pendulum-lab/figure-captions/v1';

export function loadFigureCaptionOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage?.getItem(FIGURE_CAPTION_OVERRIDE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (isPlainObject(parsed)) {
      const overrides: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && key in FIGURE_CAPTIONS) overrides[key] = value.slice(0, 400);
      }
      return overrides;
    }
  } catch {
    /* corrupted overrides are ignored; defaults apply */
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
    /* quota exhausted: caption stays default */
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
    const caption = overrides[id] ?? defaultCaption;
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) continue;
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      continue;
    }
    if (dataUrl === blankDataUrl(canvas.width, canvas.height)) continue;
    figures.push({
      id,
      caption,
      width: canvas.width,
      height: canvas.height,
      dataHash: hashText(dataUrl),
      byteEstimate: dataUrlByteEstimate(dataUrl),
      dataUrl
    });
  }
  return figures;
}

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
  setText('rwFigureSummary', `SVG exported (theme ${spec.theme}, ${spec.points.length} points). Visual fingerprint ${figureFingerprint(svg)}.`);
  logResearchRun('export', 'Study figure SVG', `theme ${spec.theme}, ${spec.points.length} points, fingerprint ${figureFingerprint(svg)}`, `pendulum_study_figure_${spec.theme}.svg`);
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
    downloadBytes(`pendulum_study_figure_${spec.theme}_${scale}x.png`, dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
    setText('rwFigureSummary', `PNG exported at ${scale}x (${canvas.width}×${canvas.height}, theme ${spec.theme}).`);
    logResearchRun('export', 'Study figure PNG', `${scale}x, theme ${spec.theme}`, `pendulum_study_figure_${spec.theme}_${scale}x.png`);
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
  const csv = figureSourceCsv(spec, { planHash: studyPlanHash(plan), variable: plan.variable, strategy: plan.strategy });
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
  setText('rwFigureSummary', exported > 0 ? `${exported} canvas figure(s) exported at ${scale}x.` : 'No drawn canvases found — visit the analysis tabs first.');
  if (exported > 0) logResearchRun('export', 'Scaled canvas figures', `${exported} canvases at ${scale}x`);
}

export function buildPaperFigureManifest(figures = collectPaperFigures(), snapshot = currentSnapshot()): PaperFigureManifest {
  return {
    schemaVersion: 'pendulum-paper-figures/v2',
    generatedAt: new Date().toISOString(),
    runtime: snapshot,
    figureCount: figures.length,
    totalBytes: figures.reduce((sum, figure) => sum + figure.byteEstimate, 0),
    figures: figures.map((figure, index) => ({
      id: figure.id,
      file: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png`,
      caption: figure.caption,
      width: figure.width,
      height: figure.height,
      dataHash: figure.dataHash,
      byteEstimate: figure.byteEstimate,
      sourceCanvas: `#${figure.id}`
    }))
  };
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Export the captured figures as a single self-contained HTML gallery: each
 * figure is numbered with its caption and the run's reproducibility context,
 * and the page is print-stylesheet-friendly (print to PDF for a paper appendix).
 */
export function exportPaperFiguresHtml(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet — visit the analysis tabs first');
    return;
  }
  const snapshot = currentSnapshot();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const items = figures.map((figure, index) => [
    '<figure>',
    `<img src="${figure.dataUrl}" alt="${escapeHtml(figure.caption)}" width="${figure.width}" height="${figure.height}">`,
    `<figcaption><strong>Figure ${index + 1}.</strong> ${escapeHtml(figure.caption)} <span class="meta">[canvas #${figure.id}, ${figure.width}×${figure.height}, hash ${escapeHtml(figure.dataHash)}]</span></figcaption>`,
    '</figure>'
  ].join('\n')).join('\n');
  const manifestJson = JSON.stringify(figureManifest, null, 2).replace(/</g, '\\u003c');
  const doc = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>Pendulum Lab — Figure Pack</title>',
    '<style>',
    'body{font:14px/1.6 Georgia,serif;max-width:880px;margin:32px auto;padding:0 16px;color:#111;background:#fff}',
    'figure{margin:0 0 36px;page-break-inside:avoid}',
    'img{max-width:100%;height:auto;border:1px solid #ccc;background:#0b1020}',
    'figcaption{margin-top:8px}.meta{color:#777;font-size:12px}',
    'header{border-bottom:2px solid #111;margin-bottom:28px;padding-bottom:12px}',
    'code{font:12px/1.4 monospace;background:#f4f4f4;padding:1px 4px}',
    '</style></head><body>',
    '<header><h1>Pendulum Lab — Figure Pack</h1>',
    `<p>Generated ${new Date().toISOString()} — system <code>${escapeHtml(snapshot.systemType)}</code>, integrator <code>${escapeHtml(snapshot.method)}</code>, dt <code>${snapshot.dt}</code>, state hash <code>${escapeHtml(snapshot.hash)}</code>.</p>`,
    `<p>Figures are PNG captures of the live analysis canvases (only canvases that have been drawn are included). Manifest: ${figures.length} figure(s), estimated ${(figureManifest.totalBytes / 1024).toFixed(1)} KiB. Print this page to PDF for a paper-ready appendix.</p></header>`,
    items,
    `<script type="application/json" id="pendulum-figure-manifest">${manifestJson}</script>`,
    '</body></html>'
  ].join('\n');
  downloadText('pendulum_paper_figures.html', doc, 'text/html;charset=utf-8');
  logResearchRun('export', 'Figure pack export', `${figures.length} captioned PNG figures`, 'pendulum_paper_figures.html');
  renderResearchWorkbench();
  toast(`Figure pack exported (${figures.length} figures)`);
}

export function exportPaperFigureManifestJson(): void {
  const figures = collectPaperFigures();
  if (figures.length === 0) {
    toast('No drawn figures yet — visit the analysis tabs first');
    return;
  }
  const manifest = buildPaperFigureManifest(figures);
  downloadJson('pendulum_figure_manifest.json', manifest);
  logResearchRun('export', 'Figure manifest export', `${manifest.figureCount} figures, ${(manifest.totalBytes / 1024).toFixed(1)} KiB`, 'pendulum_figure_manifest.json');
  renderResearchWorkbench();
}

export function buildPaperExportPack(): unknown {
  const snapshot = currentSnapshot();
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  return {
    schemaVersion: 'pendulum-paper-pack/v2',
    generatedAt: new Date().toISOString(),
    title: 'Pendulum Lab research export pack',
    methodsMarkdown: buildMethodsText(snapshot),
    figureCaptions: [
      `Main trajectory: ${snapshot.systemType} pendulum integrated with ${snapshot.method}, dt=${snapshot.dt}, gamma=${snapshot.damping}.`,
      `Comparison matrix: ${comparisonRows.length} experiment/run rows with drift, lambda proxy, FPS, and quality score.`,
      state.research.parameterStudy ? `Parameter study: ${state.research.parameterStudy.variable} ${state.research.parameterStudy.strategy} over ${state.research.parameterStudy.count} points.` : 'Parameter study: not generated.'
    ],
    /** Captioned PNG captures of every drawn analysis canvas at export time. */
    figures,
    figureManifest,
    currentSnapshot: snapshot,
    manifest: createSubmissionManifest(snapshot),
    experiments: state.research.experiments,
    runLog: state.research.runLog,
    parameterStudy: state.research.parameterStudy,
    parameterStudySummary: state.research.parameterStudy ? studyCompletionSummary(state.research.parameterStudy) : null,
    batchCheckpoint: state.research.batchCheckpoint,
    comparisonRows
  };
}

export function exportPaperPackJson(): void {
  downloadJson('pendulum_paper_export_pack.json', buildPaperExportPack());
  logResearchRun('export', 'Paper export pack', 'JSON pack with methods, captions, manifests, run log, and comparison matrix.', 'pendulum_paper_export_pack.json');
  renderResearchWorkbench();
}

export function exportPaperMethodsMarkdown(): void {
  const markdown = buildPaperMethodsMarkdown();
  downloadText('pendulum_methods_export.md', markdown, 'text/markdown;charset=utf-8');
  logResearchRun('export', 'Methods markdown export', 'Citation-ready methods text and comparison table.', 'pendulum_methods_export.md');
}

export function buildPaperMethodsMarkdown(snapshot = currentSnapshot()): string {
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const rows = comparisonRows.map((rowItem) => `| ${rowItem.source} | ${rowItem.label} | ${rowItem.method} | ${metricValue(rowItem.drift)} | ${metricValue(rowItem.lambdaMax)} | ${rowItem.score} |`).join('\n');
  return [
    buildMethodsText(snapshot),
    '',
    '## Comparison Matrix',
    '',
    '| Source | Label | Method | Drift | Lambda proxy | Score |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| current | no comparison rows yet | - | - | - | - |'
  ].join('\n');
}

export function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

export function buildPaperMethodsLatex(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const study = state.research.parameterStudy;
  const studySummary = study ? studyCompletionSummary(study) : null;
  const tableRows = comparisonRows.slice(0, 30).map((rowItem) => [
    escapeLatex(rowItem.source),
    escapeLatex(rowItem.label),
    escapeLatex(rowItem.method),
    escapeLatex(metricValue(rowItem.drift)),
    escapeLatex(metricValue(rowItem.lambdaMax)),
    String(rowItem.score)
  ].join(' & ') + ' \\\\').join('\n');
  return [
    '\\documentclass[11pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{booktabs}',
    '\\usepackage{longtable}',
    '\\usepackage{hyperref}',
    '\\title{Pendulum Lab Research Export}',
    `\\date{${escapeLatex(new Date().toISOString())}}`,
    '\\begin{document}',
    '\\maketitle',
    '\\section*{Runtime Methods}',
    `System: ${escapeLatex(snapshot.systemType)} pendulum. Integrator: ${escapeLatex(method.name)} (${escapeLatex(method.id)}), order ${escapeLatex(String(method.order))}.`,
    '',
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    '',
    `Damping gamma: ${snapshot.damping}; mode: ${escapeLatex(snapshot.mode)}; state hash: \\texttt{${escapeLatex(snapshot.hash)}}.`,
    '',
    `Parameters: \\texttt{${escapeLatex(JSON.stringify(snapshot.parameters))}}.`,
    '',
    '\\section*{Parameter Study}',
    study
      ? `Plan \\texttt{${escapeLatex(studySummary?.planHash ?? study.id)}} varies ${escapeLatex(study.variable)} with ${escapeLatex(study.strategy)} sampling over ${study.count} point(s): ${studySummary?.complete ?? 0} complete, ${studySummary?.failed ?? 0} failed, ${studySummary?.pending ?? study.count} pending.`
      : 'No parameter study was generated.',
    '',
    '\\section*{Comparison Matrix}',
    '\\begin{longtable}{llllrr}',
    '\\toprule',
    'Source & Label & Method & Drift & Lambda & Score \\\\',
    '\\midrule',
    tableRows || 'current & no comparison rows yet & -- & -- & -- & -- \\\\',
    '\\bottomrule',
    '\\end{longtable}',
    '\\section*{Limitations}',
    createSubmissionManifest(snapshot).limitations.map((item) => `\\noindent ${escapeLatex(item)}\\\\`).join('\n'),
    '\\end{document}'
  ].join('\n');
}

export function exportPaperMethodsLatex(): void {
  downloadText('pendulum_methods_export.tex', buildPaperMethodsLatex(), 'application/x-tex;charset=utf-8');
  logResearchRun('export', 'Methods LaTeX export', 'LaTeX methods appendix with comparison matrix.', 'pendulum_methods_export.tex');
}

export function buildResearchNotebook(): unknown {
  const snapshot = currentSnapshot();
  const study = state.research.parameterStudy;
  return buildNotebookV2({
    stateHash: snapshot.hash,
    generatedAt: new Date().toISOString(),
    methodsMarkdown: buildPaperMethodsMarkdown(snapshot),
    paperPackJson: JSON.stringify(buildPaperExportPack()),
    figureManifestJson: JSON.stringify(buildPaperFigureManifest()),
    studyCsv: study ? parameterStudyResultsCsvText(study) : null,
    comparisonCsv: comparisonMatrixCsvText(),
    studyVariable: study?.variable ?? null
  });
}

export function exportResearchNotebook(): void {
  downloadText('pendulum_research_notebook.ipynb', JSON.stringify(buildResearchNotebook(), null, 2), 'application/x-ipynb+json;charset=utf-8');
  logResearchRun('export', 'Research notebook export', 'Jupyter notebook with methods, paper pack, and study CSV loader.', 'pendulum_research_notebook.ipynb');
}

export function buildResearchBundle(): unknown {
  const snapshot = currentSnapshot();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const paperPack = buildPaperExportPack();
  const files = [
    { path: 'manifest/submission.json', mediaType: 'application/json', content: JSON.stringify(createSubmissionManifest(snapshot), null, 2) },
    { path: 'paper/paper-pack.json', mediaType: 'application/json', content: JSON.stringify(paperPack, null, 2) },
    { path: 'paper/methods.md', mediaType: 'text/markdown', content: buildPaperMethodsMarkdown(snapshot) },
    { path: 'paper/methods.tex', mediaType: 'application/x-tex', content: buildPaperMethodsLatex(snapshot) },
    { path: 'paper/notebook.ipynb', mediaType: 'application/x-ipynb+json', content: JSON.stringify(buildResearchNotebook(), null, 2) },
    { path: 'figures/figure-manifest.json', mediaType: 'application/json', content: JSON.stringify(figureManifest, null, 2) }
  ];
  if (state.research.parameterStudy) {
    files.push({ path: 'data/parameter-study-results.csv', mediaType: 'text/csv', content: parameterStudyResultsCsvText(state.research.parameterStudy) });
  }
  figures.forEach((figure, index) => {
    files.push({
      path: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png.data-url.txt`,
      mediaType: 'text/plain',
      content: figure.dataUrl
    });
  });
  return {
    schemaVersion: 'pendulum-research-bundle/v1',
    generatedAt: new Date().toISOString(),
    stateHash: snapshot.hash,
    note: 'Portable JSON bundle. Each entry in files can be written to disk using its path and content.',
    fileCount: files.length,
    files
  };
}

export function exportResearchBundleJson(): void {
  downloadJson('pendulum_research_bundle.json', buildResearchBundle());
  logResearchRun('export', 'Research bundle export', 'Portable bundle with paper pack, methods, LaTeX, notebook, data, and figure payloads.', 'pendulum_research_bundle.json');
}

export const RESEARCH_APP_VERSION = 'pendulum-lab-v10.29';

export function comparisonMatrixCsvText(rows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows()): string {
  const header = ['id', 'label', 'source', 'timestamp', 'method', 'system', 'dt', 'damping', 'drift', 'lambda_max', 'fps', 'score', 'hash'];
  const lines = rows.map((rowItem) => [
    rowItem.id, rowItem.label, rowItem.source, rowItem.timestamp, rowItem.method, rowItem.system,
    String(rowItem.dt), String(rowItem.damping),
    rowItem.drift === null ? '' : String(rowItem.drift),
    rowItem.lambdaMax === null ? '' : String(rowItem.lambdaMax),
    rowItem.fps === null ? '' : String(rowItem.fps),
    String(rowItem.score), rowItem.hash
  ]);
  return [
    `# schemaVersion=pendulum-comparison-matrix-csv/v1`,
    `# generatedAt=${new Date().toISOString()}`,
    header.join(','),
    ...lines.map((line) => line.map(csvCell).join(','))
  ].join('\n');
}

/**
 * Build the artifact provenance DAG for everything currently in the workbench:
 * snapshot -> experiment -> study -> worker job -> result -> figure -> paper pack -> bundle.
 */
export function buildResearchProvenance(figures = collectPaperFigures()): ProvenanceGraph {
  const snapshot = currentSnapshot();
  const builder = new ProvenanceBuilder(collectEnvironment(RESEARCH_APP_VERSION));
  const snapshotNodeId = `snapshot:${snapshot.hash}`;
  builder.addNode({
    id: snapshotNodeId,
    kind: 'snapshot',
    label: `Runtime snapshot (${snapshot.systemType}, ${snapshot.method}, dt=${snapshot.dt})`,
    content: snapshot,
    schemaVersion: 'pendulum-snapshot/v2',
    sourceCommand: 'workbench:currentSnapshot',
    metadata: { system: snapshot.systemType, method: snapshot.method, dt: snapshot.dt, damping: snapshot.damping }
  });
  for (const experiment of state.research.experiments) {
    const parentId = `snapshot:${experiment.snapshot.hash}`;
    if (!builder.has(parentId)) {
      builder.addNode({
        id: parentId,
        kind: 'snapshot',
        label: `Saved snapshot ${experiment.snapshot.hash}`,
        content: experiment.snapshot,
        schemaVersion: 'pendulum-snapshot/v2',
        sourceCommand: 'workbench:saveExperiment',
        generatedAt: experiment.createdAt
      });
    }
    builder.addNode({
      id: `experiment:${experiment.id}`,
      kind: 'experiment',
      label: experiment.name,
      content: experiment,
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      parentIds: [parentId],
      sourceCommand: 'workbench:saveExperiment',
      generatedAt: experiment.createdAt,
      metadata: { qualityScore: experiment.metrics.qualityScore, tags: experiment.tags.join('|') }
    });
  }
  const study = state.research.parameterStudy;
  if (study) {
    const studyNodeId = `study:${study.id}`;
    builder.addNode({
      id: studyNodeId,
      kind: 'study',
      label: `Parameter study ${study.variable} (${study.strategy}, ${study.count} points)`,
      content: { id: study.id, hash: studyPlanHash(study) },
      schemaVersion: 'pendulum-parameter-study/v1',
      parentIds: [snapshotNodeId],
      sourceCommand: 'workbench:generateParameterStudy',
      generatedAt: study.generatedAt,
      metadata: { variable: study.variable, strategy: study.strategy, points: study.count, planHash: studyPlanHash(study) }
    });
    const checkpoint = state.research.batchCheckpoint;
    if (checkpoint && checkpoint.planId === study.id) {
      builder.addNode({
        id: `worker-job:${checkpoint.id}`,
        kind: 'worker-job',
        label: `Study batch (${checkpoint.status}, ${checkpoint.completed}/${checkpoint.total})`,
        content: checkpoint,
        schemaVersion: 'pendulum-batch-checkpoint/v1',
        parentIds: [studyNodeId],
        sourceCommand: 'workbench:runStudyBatch',
        generatedAt: checkpoint.startedAt,
        metadata: { status: checkpoint.status, timeoutMs: checkpoint.timeoutMs, planHash: checkpoint.planHash }
      });
      const completed = study.experiments.filter((point) => point.results);
      if (completed.length > 0) {
        builder.addNode({
          id: `result:${study.id}`,
          kind: 'result',
          label: `Study results (${completed.length}/${study.experiments.length} points)`,
          content: completed.map((point) => [point.id, point.results]),
          schemaVersion: 'pendulum-parameter-study-results/v1',
          parentIds: [`worker-job:${checkpoint.id}`],
          sourceCommand: 'workbench:runStudyBatch',
          metadata: { completed: completed.length, failed: study.experiments.filter((point) => point.error).length }
        });
      }
    }
  }
  const figureParents = [snapshotNodeId, ...(study && builder.has(`result:${study.id}`) ? [`result:${study.id}`] : [])];
  for (const figure of figures) {
    builder.addNode({
      id: `figure:${figure.id}`,
      kind: 'figure',
      label: figure.caption,
      content: figure.dataHash,
      schemaVersion: 'pendulum-paper-figures/v2',
      parentIds: figureParents,
      sourceCommand: 'workbench:collectPaperFigures',
      metadata: { width: figure.width, height: figure.height, dataHash: figure.dataHash }
    });
  }
  const paperNodeId = 'paper-pack:current';
  builder.addNode({
    id: paperNodeId,
    kind: 'paper-pack',
    label: 'Paper export pack',
    content: { snapshot: snapshot.hash, figures: figures.map((figure) => figure.dataHash) },
    schemaVersion: 'pendulum-paper-pack/v2',
    parentIds: [snapshotNodeId, ...figures.map((figure) => `figure:${figure.id}`)],
    sourceCommand: 'workbench:buildPaperExportPack'
  });
  builder.addNode({
    id: 'bundle:current',
    kind: 'bundle',
    label: 'Research bundle (ZIP)',
    content: { snapshot: snapshot.hash, generatedAt: new Date().toISOString() },
    schemaVersion: RESEARCH_BUNDLE_ZIP_SCHEMA,
    parentIds: [paperNodeId],
    sourceCommand: 'workbench:exportResearchBundleZip'
  });
  return builder.build();
}

export function exportProvenanceJson(): void {
  downloadJson('pendulum_provenance.json', buildResearchProvenance());
  logResearchRun('export', 'Provenance graph export', 'Artifact DAG with hashes, schema versions, and environment metadata.', 'pendulum_provenance.json');
  renderResearchWorkbench();
}

/** Layered text viewer for the provenance DAG: nodes grouped by kind, parents inline. */
export function renderProvenanceViewer(): void {
  const target = $('rwProvenanceView');
  if (!target) return;
  if (target.childElementCount > 0) {
    clear(target);
    return;
  }
  const graph = buildResearchProvenance();
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label] as const));
  const rows = graph.nodes.map((node) => [
    node.kind,
    node.label.slice(0, 44),
    node.hash.slice(0, 10),
    node.parentIds.map((parentId) => (labelById.get(parentId) ?? parentId).slice(0, 32)).join('; ') || '(root)',
    node.sourceCommand.replace('workbench:', '')
  ]);
  renderResearchTable('rwProvenanceView', ['kind', 'artifact', 'hash', 'derived from', 'source'], rows, 'No provenance nodes yet.');
  const summary = html('div', {
    className: 'research-summary',
    text: `Provenance: ${graph.nodes.length} nodes, ${graph.edges.length} edges; graph hash ${graph.graphHash}; environment ${graph.environment.appVersion}.`
  });
  target.prepend(summary);
}

export const RESEARCH_BUNDLE_ZIP_SCHEMA = 'pendulum-research-bundle-zip/v1';

/**
 * Assemble the on-disk layout of the real ZIP research bundle. Text artifacts
 * are UTF-8; figures are decoded from their canvas data URLs into genuine
 * binary PNG entries. The returned list drives both the ZIP writer and the
 * checksum manifest, so the two can never disagree.
 */
export async function buildResearchBundleZipEntries(): Promise<{ entries: ZipEntryInput[]; figureCount: number }> {
  const snapshot = currentSnapshot();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const provenance = buildResearchProvenance(figures);
  const entries: ZipEntryInput[] = [
    { path: 'manifest/submission.json', data: textToBytes(JSON.stringify(createSubmissionManifest(snapshot), null, 2)) },
    { path: 'manifest/provenance.json', data: textToBytes(JSON.stringify(provenance, null, 2)) },
    { path: 'paper/paper-pack.json', data: textToBytes(JSON.stringify(buildPaperExportPack(), null, 2)) },
    { path: 'paper/methods.md', data: textToBytes(buildPaperMethodsMarkdown(snapshot)) },
    { path: 'paper/methods.tex', data: textToBytes(buildPaperMethodsLatex(snapshot)) },
    { path: 'paper/notebook.ipynb', data: textToBytes(JSON.stringify(buildResearchNotebook(), null, 2)) },
    { path: 'data/comparison-matrix.csv', data: textToBytes(comparisonMatrixCsvText()) },
    { path: 'data/run-log.json', data: textToBytes(JSON.stringify({ schemaVersion: 'pendulum-run-log/v1', generatedAt: new Date().toISOString(), entries: state.research.runLog }, null, 2)) },
    { path: 'data/experiments.json', data: textToBytes(JSON.stringify({ schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), experiments: state.research.experiments }, null, 2)) },
    { path: 'figures/figure-manifest.json', data: textToBytes(JSON.stringify(figureManifest, null, 2)) }
  ];
  if (state.research.parameterStudy) {
    entries.push({ path: 'data/parameter-study-results.csv', data: textToBytes(parameterStudyResultsCsvText(state.research.parameterStudy)) });
  }
  if (designStudy) {
    entries.push({ path: 'data/design-study-results.csv', data: textToBytes(designStudyCsvText(designStudy)) });
  }
  figures.forEach((figure, index) => {
    entries.push({
      path: `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}.png`,
      data: dataUrlToBytes(figure.dataUrl)
    });
  });
  // checksums.json is appended last so it can cover every other member.
  entries.push({
    path: 'manifest/checksums.json',
    data: textToBytes(JSON.stringify({
      schemaVersion: 'pendulum-bundle-checksums/v2',
      generatedAt: new Date().toISOString(),
      algorithm: 'sha256 + crc32 + fnv1a64',
      verify: 'extract the archive, then check each file: `sha256sum <path>` must equal the sha256 field below',
      files: await checksumEntriesSha256(entries)
    }, null, 2))
  });
  return { entries, figureCount: figures.length };
}

export const MAX_DB_BUNDLES = 3;
export const MAX_DB_BUNDLE_BYTES = 24 * 1024 * 1024;

/** Keep the last few exported ZIP bundles (and current figures) in IndexedDB for re-download. */
export function archiveBundleToDb(zip: Uint8Array, fileCount: number, figureCount: number): void {
  const db = researchDbInstance();
  if (!db.available() || zip.length > MAX_DB_BUNDLE_BYTES) return;
  void (async () => {
    try {
      const id = `bundle-${new Date().toISOString()}`;
      await db.put('bundles', id, { fileCount, figureCount, bytes: zip.length, zip });
      const all = await db.getAll('bundles');
      const excess = all.length - MAX_DB_BUNDLES;
      if (excess > 0) {
        const oldest = [...all].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, excess);
        for (const record of oldest) await db.delete('bundles', record.id);
      }
      const figures = collectPaperFigures();
      if (figures.length > 0) {
        await db.putMany('figures', figures.map((figure) => ({ id: figure.id, payload: figure })));
      }
      renderResearchStoragePanel();
    } catch (error) {
      state.auditLog.unshift(`bundle archive failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

/** Export the research bundle as a real .zip archive (binary PNGs, per-file hashes). */
export function exportResearchBundleZip(): void {
  void (async () => {
    try {
      const { entries, figureCount } = await buildResearchBundleZipEntries();
      const zip = buildZip(entries);
      downloadBytes('pendulum_research_bundle.zip', zip, 'application/zip');
      archiveBundleToDb(zip, entries.length, figureCount);
      logResearchRun('export', 'Research ZIP bundle export', `${entries.length} files (${figureCount} binary figures), ${(zip.length / 1024).toFixed(1)} KiB, SHA-256 per-file checksums.`, 'pendulum_research_bundle.zip');
      renderResearchWorkbench();
      toast(`ZIP bundle exported (${entries.length} files, SHA-256 manifest)`);
    } catch (error) {
      state.lastFault = `ZIP bundle export failed: ${error instanceof Error ? error.message : String(error)}`;
      toast('ZIP export failed — JSON bundle fallback still available');
    }
  })();
}

