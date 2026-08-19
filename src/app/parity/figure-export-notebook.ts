/** Focused publication-export responsibility extracted from figure-export.ts. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { createSubmissionManifest, downloadJson } from '../../export/manifest';

import { csvCell } from '../../research/researchExportUtils';

import { buildNotebookV2 } from '../../research/notebookBuilder';

import { currentSnapshot, downloadText, state } from './shared';

import { buildComparisonRows, logResearchRun, parameterStudyResultsCsvText } from './research-workbench';

import { collectPaperFigures } from './paper-figure-capture';
import { buildPaperExportPack, buildPaperMethodsMarkdown, buildPaperMethodsLatex } from './figure-export';
import { buildPaperFigureManifest } from './figure-export';

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
  downloadText(
    'pendulum_research_notebook.ipynb',
    JSON.stringify(buildResearchNotebook(), null, 2),
    'application/x-ipynb+json;charset=utf-8'
  );
  logResearchRun(
    'export',
    'Research notebook export',
    'Jupyter notebook with methods, paper pack, and study CSV loader.',
    'pendulum_research_notebook.ipynb'
  );
}

export function buildResearchBundle(): unknown {
  const snapshot = currentSnapshot();
  const figures = collectPaperFigures();
  const figureManifest = buildPaperFigureManifest(figures, snapshot);
  const paperPack = buildPaperExportPack();
  const files = [
    {
      path: 'manifest/submission.json',
      mediaType: 'application/json',
      content: JSON.stringify(createSubmissionManifest(snapshot), null, 2)
    },
    { path: 'paper/paper-pack.json', mediaType: 'application/json', content: JSON.stringify(paperPack, null, 2) },
    { path: 'paper/methods.md', mediaType: 'text/markdown', content: buildPaperMethodsMarkdown(snapshot) },
    { path: 'paper/methods.tex', mediaType: 'application/x-tex', content: buildPaperMethodsLatex(snapshot) },
    {
      path: 'paper/notebook.ipynb',
      mediaType: 'application/x-ipynb+json',
      content: JSON.stringify(buildResearchNotebook(), null, 2)
    },
    {
      path: 'figures/figure-manifest.json',
      mediaType: 'application/json',
      content: JSON.stringify(figureManifest, null, 2)
    }
  ];
  if (state.research.parameterStudy) {
    files.push({
      path: 'data/parameter-study-results.csv',
      mediaType: 'text/csv',
      content: parameterStudyResultsCsvText(state.research.parameterStudy)
    });
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
  logResearchRun(
    'export',
    'Research bundle export',
    'Portable bundle with paper pack, methods, LaTeX, notebook, data, and figure payloads.',
    'pendulum_research_bundle.json'
  );
}

export const RESEARCH_APP_VERSION = '@elliotjung/pendulum-lab@10.36.0';

export function comparisonMatrixCsvText(
  rows = state.research.comparisonRows.length ? state.research.comparisonRows : buildComparisonRows()
): string {
  const header = [
    'id',
    'label',
    'source',
    'timestamp',
    'method',
    'system',
    'dt',
    'damping',
    'drift',
    'lambda_max',
    'fps',
    'score',
    'hash'
  ];
  const lines = rows.map((rowItem) => [
    rowItem.id,
    rowItem.label,
    rowItem.source,
    rowItem.timestamp,
    rowItem.method,
    rowItem.system,
    String(rowItem.dt),
    String(rowItem.damping),
    rowItem.drift === null ? '' : String(rowItem.drift),
    rowItem.lambdaMax === null ? '' : String(rowItem.lambdaMax),
    rowItem.fps === null ? '' : String(rowItem.fps),
    String(rowItem.score),
    rowItem.hash
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
