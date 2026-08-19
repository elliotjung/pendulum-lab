/** Focused publication-export responsibility extracted from figure-export.ts. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { createSubmissionManifest, downloadBytes } from '../../export/manifest';

import {
  buildZip,
  checksumEntriesSha256,
  dataUrlToBytes,
  textToBytes,
  type ZipEntryInput
} from '../../research/zipBundle';

import { currentSnapshot, state, toast } from './shared';
import { RESEARCH_STORAGE_SCHEMA_VERSION, renderResearchStoragePanel, researchDbInstance } from './storage-sync';
import {
  designStudy,
  designStudyCsvText,
  logResearchRun,
  parameterStudyResultsCsvText,
  renderResearchWorkbench
} from './research-workbench';

import { collectPaperFigures, renderCapturedFigureSvg } from './paper-figure-capture';
import {
  buildPaperExportPack,
  buildPaperMethodsMarkdown,
  buildPaperMethodsLatex,
  buildResearchNotebook,
  comparisonMatrixCsvText,
  buildResearchProvenance
} from './figure-export';
import { buildPaperFigureManifest } from './figure-export';

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
    {
      path: 'manifest/submission.json',
      data: textToBytes(JSON.stringify(createSubmissionManifest(snapshot), null, 2))
    },
    { path: 'manifest/provenance.json', data: textToBytes(JSON.stringify(provenance, null, 2)) },
    { path: 'paper/paper-pack.json', data: textToBytes(JSON.stringify(buildPaperExportPack(), null, 2)) },
    { path: 'paper/methods.md', data: textToBytes(buildPaperMethodsMarkdown(snapshot)) },
    { path: 'paper/methods.tex', data: textToBytes(buildPaperMethodsLatex(snapshot)) },
    { path: 'paper/notebook.ipynb', data: textToBytes(JSON.stringify(buildResearchNotebook(), null, 2)) },
    { path: 'data/comparison-matrix.csv', data: textToBytes(comparisonMatrixCsvText()) },
    {
      path: 'data/run-log.json',
      data: textToBytes(
        JSON.stringify(
          {
            schemaVersion: 'pendulum-run-log/v1',
            generatedAt: new Date().toISOString(),
            entries: state.research.runLog
          },
          null,
          2
        )
      )
    },
    {
      path: 'data/experiments.json',
      data: textToBytes(
        JSON.stringify(
          {
            schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
            generatedAt: new Date().toISOString(),
            experiments: state.research.experiments
          },
          null,
          2
        )
      )
    },
    { path: 'figures/figure-manifest.json', data: textToBytes(JSON.stringify(figureManifest, null, 2)) }
  ];
  if (state.research.parameterStudy) {
    entries.push({
      path: 'data/parameter-study-results.csv',
      data: textToBytes(parameterStudyResultsCsvText(state.research.parameterStudy))
    });
  }
  if (designStudy) {
    entries.push({ path: 'data/design-study-results.csv', data: textToBytes(designStudyCsvText(designStudy)) });
  }
  figures.forEach((figure, index) => {
    const stem = `figures/figure-${String(index + 1).padStart(2, '0')}-${figure.id}`;
    entries.push({
      path: `${stem}.png`,
      data: dataUrlToBytes(figure.dataUrl)
    });
    entries.push({ path: `${stem}.svg`, data: textToBytes(renderCapturedFigureSvg(figure)) });
  });
  // checksums.json is appended last so it can cover every other member.
  entries.push({
    path: 'manifest/checksums.json',
    data: textToBytes(
      JSON.stringify(
        {
          schemaVersion: 'pendulum-bundle-checksums/v2',
          generatedAt: new Date().toISOString(),
          algorithm: 'sha256 + crc32 + fnv1a64',
          verify: 'extract the archive, then check each file: `sha256sum <path>` must equal the sha256 field below',
          files: await checksumEntriesSha256(entries)
        },
        null,
        2
      )
    )
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
        await db.putMany(
          'figures',
          figures.map((figure) => ({ id: figure.id, payload: figure }))
        );
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
      logResearchRun(
        'export',
        'Research ZIP bundle export',
        `${entries.length} files (${figureCount} binary figures), ${(zip.length / 1024).toFixed(1)} KiB, SHA-256 per-file checksums.`,
        'pendulum_research_bundle.zip'
      );
      renderResearchWorkbench();
      toast(`ZIP bundle exported (${entries.length} files, SHA-256 manifest)`);
    } catch (error) {
      state.lastFault = `ZIP bundle export failed: ${error instanceof Error ? error.message : String(error)}`;
      toast('ZIP export failed — JSON bundle fallback still available');
    }
  })();
}
