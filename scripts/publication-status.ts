import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import {
  attachPublicationSnapshotMetadata,
  evaluatePublicationStatus,
  type PublicationHttpProbe,
  type PublicationReportKind
} from './publication-status-core';

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const repository = 'elliotjung/pendulum-lab';
const pagesRootUrl = 'https://elliotjung.github.io/pendulum-lab/';
const pagesUrl = new URL('reviewer.html', pagesRootUrl).href;
const expectedTag = `v${packageJson.version}`;
const REQUEST_TIMEOUT_MS = 10_000;
const execFileAsync = promisify(execFile);

function reportKind(): PublicationReportKind {
  const value = process.env.PENDULUM_PUBLICATION_REPORT_KIND ?? 'source-snapshot';
  if (value !== 'source-snapshot' && value !== 'deployment-probe') {
    throw new Error('PENDULUM_PUBLICATION_REPORT_KIND must be source-snapshot or deployment-probe');
  }
  return value;
}

async function checkedSourceCommit(): Promise<string | null> {
  const explicit = process.env.PENDULUM_PUBLICATION_SOURCE_COMMIT?.trim().toLowerCase();
  if (explicit) {
    if (!/^[a-f0-9]{40}$/u.test(explicit)) throw new Error('PENDULUM_PUBLICATION_SOURCE_COMMIT is malformed');
    return explicit;
  }
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
    const value = result.stdout.trim().toLowerCase();
    return /^[a-f0-9]{40}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function jsonRequest(url: string): Promise<PublicationHttpProbe> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'pendulum-lab-publication-audit' },
      redirect: 'follow',
      signal: requestSignal()
    });
    if (!response.ok) return { ok: false, status: response.status, body: null };
    try {
      return { ok: true, status: response.status, body: await response.json() };
    } catch {
      return { ok: false, status: response.status, body: null };
    }
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

async function head(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: requestSignal() });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Every external service and deployed binding is independent and time-bounded.
const [npm, zenodo, release, releaseCommit, pages, pagesManifest, pagesEvidence] = await Promise.all([
  jsonRequest(
    `https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}/${encodeURIComponent(packageJson.version)}`
  ),
  jsonRequest(
    `https://zenodo.org/api/records?q=${encodeURIComponent(`metadata.title:\"Pendulum Lab\" AND metadata.version:\"${packageJson.version}\"`)}&size=25`
  ),
  jsonRequest(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(expectedTag)}`),
  jsonRequest(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(expectedTag)}`),
  head(pagesUrl),
  jsonRequest(new URL('deployment-manifest.json', pagesRootUrl).href),
  jsonRequest(new URL('reports/evidence-summary.json', pagesRootUrl).href)
]);

const evaluated = evaluatePublicationStatus({
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  repository,
  pagesUrl,
  npm,
  zenodo,
  release,
  releaseCommit,
  pages,
  pagesManifest,
  pagesEvidence
});
const kind = reportKind();
const sourceCommit = await checkedSourceCommit();
const snapshotGeneratedAt = new Date().toISOString();
const report = attachPublicationSnapshotMetadata(evaluated, {
  reportKind: kind,
  snapshotGeneratedAt,
  checkedSourceCommit: sourceCommit,
  environment: {
    execution: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    workflow: process.env.GITHUB_WORKFLOW?.trim() || null,
    runId: process.env.GITHUB_RUN_ID?.trim() || null
  },
  freshnessTtl: 'PT24H'
});
const output =
  process.env.PENDULUM_PUBLICATION_OUTPUT ??
  (kind === 'deployment-probe' ? 'reports/deployment-publication-status.json' : 'reports/publication-status.json');

if (
  process.env.PENDULUM_PUBLICATION_REQUIRE_DEPLOYMENT_BINDING === '1' &&
  (sourceCommit === null ||
    report.pages.sourceCommit !== sourceCommit ||
    report.pages.evidenceSourceCommit !== sourceCommit ||
    report.pages.manifestStatus < 200 ||
    report.pages.manifestStatus >= 300 ||
    report.pages.evidenceStatus < 200 ||
    report.pages.evidenceStatus >= 300)
) {
  throw new Error('deployed Pages manifest/evidence does not match the checked source commit');
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
