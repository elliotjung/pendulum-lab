import { readFile, writeFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const repository = 'elliotjung/pendulum-lab';
const pagesUrl = 'https://elliotjung.github.io/pendulum-lab/reviewer.html';

async function jsonRequest(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'pendulum-lab-publication-audit' } });
    return { ok: response.ok, status: response.status, body: response.ok ? await response.json() : null };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

async function head(url: string): Promise<{ ok: boolean; status: number }> {
  try { const response = await fetch(url, { method: 'HEAD', redirect: 'follow' }); return { ok: response.ok, status: response.status }; }
  catch { return { ok: false, status: 0 }; }
}

const npm = await jsonRequest(`https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}/${encodeURIComponent(packageJson.version)}`);
const zenodo = await jsonRequest(`https://zenodo.org/api/records?q=${encodeURIComponent('"Pendulum Lab" AND "nonlinear pendulum dynamics"')}&size=25`);
const release = await jsonRequest(`https://api.github.com/repos/${repository}/releases/latest`);
const pages = await head(pagesUrl);
const zenodoHits = Array.isArray((zenodo.body as { hits?: { hits?: unknown[] } } | null)?.hits?.hits)
  ? ((zenodo.body as { hits: { hits: Array<Record<string, unknown>> } }).hits.hits)
  : [];
const matchingZenodo = zenodoHits.find((hit) => {
  const metadata = hit.metadata as Record<string, unknown> | undefined;
  return /pendulum lab/i.test(String(metadata?.title ?? ''));
});
const doi = matchingZenodo ? String(matchingZenodo.doi ?? (matchingZenodo.metadata as Record<string, unknown> | undefined)?.doi ?? '') : '';
const latestRelease = release.ok ? release.body as Record<string, unknown> : {};
const npmPublished = npm.ok;
const zenodoPublished = /^10\.\d{4,9}\/zenodo\.\d+$/i.test(doi);

const report = {
  schemaVersion: 'pendulum-publication-status/v1',
  generatedAt: new Date().toISOString(),
  status: npmPublished && zenodoPublished && pages.ok && release.ok ? 'published' : 'partial',
  npm: {
    package: packageJson.name,
    version: packageJson.version,
    published: npmPublished,
    registryStatus: npm.status,
    url: `https://www.npmjs.com/package/${packageJson.name}/v/${packageJson.version}`
  },
  zenodo: {
    published: zenodoPublished,
    apiStatus: zenodo.status,
    doi: zenodoPublished ? doi : null,
    recordId: matchingZenodo?.id ?? null
  },
  githubRelease: {
    published: release.ok,
    apiStatus: release.status,
    tag: latestRelease.tag_name ?? null,
    url: latestRelease.html_url ?? null
  },
  pages: { published: pages.ok, status: pages.status, url: pagesUrl },
  caveats: [
    ...(npmPublished ? [] : ['npm registry does not resolve this exact package version.']),
    ...(zenodoPublished ? [] : ['No matching public Zenodo DOI record resolves for Pendulum Lab.']),
    ...(release.ok ? [] : ['GitHub latest release is not publicly resolvable.']),
    ...(pages.ok ? [] : ['Reviewer dashboard is not publicly reachable.'])
  ]
};

await writeFile('reports/publication-status.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
