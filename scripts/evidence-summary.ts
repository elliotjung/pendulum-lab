import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildEvidenceSummary } from '../src/research/evidenceSummary';

const sourceReports = {
  vitestResults: 'reports/vitest-results.json',
  reviewerKitManifest: 'reports/reviewer-kit-manifest.json',
  publicationStatus: 'reports/publication-status.json',
  literatureAnchors: 'reports/literature-anchors.json',
  crossValidation: 'reports/cross-validation.json',
  gpuAdapterMatrix: 'reports/gpu-adapter-matrix.json'
};

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const summary = buildEvidenceSummary({
  generatedAt: new Date().toISOString(),
  sourceReports,
  vitestResults: await readJson(sourceReports.vitestResults),
  reviewerKitManifest: await readJson(sourceReports.reviewerKitManifest),
  publicationStatus: await readJson(sourceReports.publicationStatus),
  literatureAnchors: await readJson(sourceReports.literatureAnchors),
  crossValidation: await readJson(sourceReports.crossValidation),
  gpuAdapterMatrix: await readJson(sourceReports.gpuAdapterMatrix)
});

await writeJson('reports/evidence-summary.json', summary);

const landingSummaryPath = resolve('..', 'landing page', 'pendulum-landing', 'assets', 'evidence-summary.json');
if (await exists(dirname(landingSummaryPath))) {
  await writeJson(landingSummaryPath, summary);
  console.log(`Wrote reports/evidence-summary.json and ${landingSummaryPath}`);
} else {
  console.log('Wrote reports/evidence-summary.json');
}
