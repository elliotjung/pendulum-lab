/** Focused publication-export responsibility extracted from figure-export.ts. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { createSubmissionManifest, downloadJson } from '../../export/manifest';
import { integratorRegistry } from '../../physics/integrators';

import { currentSnapshot, downloadText, state, toast } from './shared';

import {
  buildComparisonRows,
  logResearchRun,
  metricValue,
  renderResearchWorkbench,
  studyCompletionSummary
} from './research-workbench';

import { collectPaperFigures } from './paper-figure-capture';
import { buildMethodsText } from './figure-export';
import { buildPaperFigureManifest } from './figure-export';
import {
  claimEvidenceMarkdown,
  currentClaimEvidenceSurface,
  type ClaimEvidenceSurface
} from '../../research/claimEvidenceSurfaces';

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
  const items = figures
    .map((figure, index) =>
      [
        '<figure>',
        `<img src="${figure.dataUrl}" alt="${escapeHtml(figure.caption)}" width="${figure.width}" height="${figure.height}">`,
        `<figcaption><strong>Figure ${index + 1}.</strong> ${escapeHtml(figure.caption)} <span class="meta">[canvas #${figure.id}, ${figure.width}×${figure.height}, hash ${escapeHtml(figure.dataHash)}]</span></figcaption>`,
        '</figure>'
      ].join('\n')
    )
    .join('\n');
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
  logResearchRun(
    'export',
    'Figure pack export',
    `${figures.length} captioned PNG figures`,
    'pendulum_paper_figures.html'
  );
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
  logResearchRun(
    'export',
    'Figure manifest export',
    `${manifest.figureCount} figures, ${(manifest.totalBytes / 1024).toFixed(1)} KiB`,
    'pendulum_figure_manifest.json'
  );
  renderResearchWorkbench();
}

export function buildPaperExportPack(): unknown {
  const snapshot = currentSnapshot();
  const claimEvidence = currentClaimEvidenceSurface();
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
      state.research.parameterStudy
        ? `Parameter study: ${state.research.parameterStudy.variable} ${state.research.parameterStudy.strategy} over ${state.research.parameterStudy.count} points.`
        : 'Parameter study: not generated.'
    ],
    /** Captioned PNG captures of every drawn analysis canvas at export time. */
    figures,
    figureManifest,
    currentSnapshot: snapshot,
    manifest: createSubmissionManifest(snapshot, claimEvidence),
    claimEvidence,
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
  logResearchRun(
    'export',
    'Paper export pack',
    'JSON pack with methods, captions, manifests, run log, and comparison matrix.',
    'pendulum_paper_export_pack.json'
  );
  renderResearchWorkbench();
}

export function exportPaperMethodsMarkdown(): void {
  const markdown = buildPaperMethodsMarkdown();
  downloadText('pendulum_methods_export.md', markdown, 'text/markdown;charset=utf-8');
  logResearchRun(
    'export',
    'Methods markdown export',
    'Citation-ready methods text and comparison table.',
    'pendulum_methods_export.md'
  );
}

export function buildPaperMethodsMarkdown(
  snapshot = currentSnapshot(),
  claimEvidence: ClaimEvidenceSurface = currentClaimEvidenceSurface()
): string {
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const rows = comparisonRows
    .map(
      (rowItem) =>
        `| ${rowItem.source} | ${rowItem.label} | ${rowItem.method} | ${metricValue(rowItem.drift)} | ${metricValue(rowItem.lambdaMax)} | ${rowItem.score} |`
    )
    .join('\n');
  return [
    buildMethodsText(snapshot),
    '',
    '## Comparison Matrix',
    '',
    '| Source | Label | Method | Drift | Lambda proxy | Score |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| current | no comparison rows yet | - | - | - | - |',
    '',
    claimEvidenceMarkdown(claimEvidence)
  ].join('\n');
}

export function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

export function buildPaperMethodsLatex(
  snapshot = currentSnapshot(),
  claimEvidence: ClaimEvidenceSurface = currentClaimEvidenceSurface()
): string {
  const method = integratorRegistry[snapshot.method];
  const comparisonRows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows();
  const study = state.research.parameterStudy;
  const studySummary = study ? studyCompletionSummary(study) : null;
  const tableRows = comparisonRows
    .slice(0, 30)
    .map(
      (rowItem) =>
        [
          escapeLatex(rowItem.source),
          escapeLatex(rowItem.label),
          escapeLatex(rowItem.method),
          escapeLatex(metricValue(rowItem.drift)),
          escapeLatex(metricValue(rowItem.lambdaMax)),
          String(rowItem.score)
        ].join(' & ') + ' \\\\'
    )
    .join('\n');
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
    '\\section*{Effective Claim Evidence}',
    ...claimEvidence.claims.map((claim) => {
      const value = claim.displayValue ?? 'withheld';
      const caveat = claim.caveats.join(' ') || 'No additional caveat.';
      return `\\noindent \\texttt{${escapeLatex(claim.id)}}: ${escapeLatex(claim.effectiveVisibleLevel)} (${escapeLatex(claim.validity)}), ${escapeLatex(value)}. ${escapeLatex(caveat)}\\\\`;
    }),
    '\\section*{Limitations}',
    createSubmissionManifest(snapshot, claimEvidence)
      .limitations.map((item) => `\\noindent ${escapeLatex(item)}\\\\`)
      .join('\n'),
    '\\end{document}'
  ].join('\n');
}

export function exportPaperMethodsLatex(): void {
  downloadText('pendulum_methods_export.tex', buildPaperMethodsLatex(), 'application/x-tex;charset=utf-8');
  logResearchRun(
    'export',
    'Methods LaTeX export',
    'LaTeX methods appendix with comparison matrix.',
    'pendulum_methods_export.tex'
  );
}
