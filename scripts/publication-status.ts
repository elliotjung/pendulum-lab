import { readFile, writeFile } from 'node:fs/promises';
import { evaluatePublicationStatus, type PublicationHttpProbe } from './publication-status-core';

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const repository = 'elliotjung/pendulum-lab';
const pagesRootUrl = 'https://elliotjung.github.io/pendulum-lab/';
const pagesUrl = new URL('reviewer.html', pagesRootUrl).href;
const expectedTag = `v${packageJson.version}`;
const REQUEST_TIMEOUT_MS = 10_000;

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
const report = { ...evaluated, generatedAt: new Date().toISOString() };

await writeFile('reports/publication-status.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
