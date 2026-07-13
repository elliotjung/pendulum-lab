import { createReadStream } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface ZenodoDeposition {
  id?: number;
  record_id?: number;
  doi?: string;
  conceptdoi?: string;
  submitted?: boolean;
  links?: { bucket?: string; publish?: string; html?: string; record?: string };
  metadata?: { prereserve_doi?: { doi?: string; recid?: number }; doi?: string };
}

const publish = process.argv.includes('--publish');
const sandbox = process.argv.includes('--sandbox') || process.env.ZENODO_SANDBOX === '1';
const token = sandbox ? (process.env.ZENODO_SANDBOX_TOKEN ?? process.env.ZENODO_TOKEN) : process.env.ZENODO_TOKEN;
const base = sandbox ? 'https://sandbox.zenodo.org' : 'https://zenodo.org';
const packageInfo = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const metadata = JSON.parse(await readFile('.zenodo.json', 'utf8')) as Record<string, unknown>;
const reportPath = 'reports/zenodo-deposition.json';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof Uint8Array ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers
    }
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response;
}

if (!token) {
  const missing = {
    schemaVersion: 'pendulum-zenodo-deposition/v1',
    generatedAt: new Date().toISOString(),
    status: 'credential-missing',
    environment: sandbox ? 'sandbox' : 'production',
    version: packageInfo.version,
    doi: null,
    caveat: `${sandbox ? 'ZENODO_SANDBOX_TOKEN' : 'ZENODO_TOKEN'} is required to create and publish a deposition; no DOI was fabricated.`
  };
  await writeFile(reportPath, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
  console.error(missing.caveat);
  process.exitCode = 2;
} else {
  const draftResponse = await request('/api/deposit/depositions', { method: 'POST', body: '{}' });
  let deposition = await draftResponse.json() as ZenodoDeposition;
  if (!deposition.id || !deposition.links?.bucket) throw new Error('Zenodo did not return a deposition id and upload bucket');

  const packageCandidates = [
    `${packageInfo.name.replace(/^@/, '').replaceAll('/', '-')}-${packageInfo.version}.tgz`,
    'paper/paper.pdf',
    'reports/reviewer-kit-manifest.json',
    'reports/gpu-adapter-matrix.json',
    'reports/flagship-certification.json'
  ];
  const uploaded: string[] = [];
  for (const path of packageCandidates) {
    if (!(await exists(path))) continue;
    const upload = await fetch(`${deposition.links.bucket}/${encodeURIComponent(basename(path))}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: createReadStream(path) as unknown as BodyInit,
      duplex: 'half'
    } as RequestInit & { duplex: 'half' });
    if (!upload.ok) throw new Error(`Upload ${path}: HTTP ${upload.status} ${await upload.text()}`);
    uploaded.push(path);
  }

  const description = `${String(metadata.description ?? '')}\n\nVersion ${packageInfo.version}. Reviewer dashboard: https://elliotjung.github.io/pendulum-lab/reviewer.html`;
  const update = await request(`/api/deposit/depositions/${deposition.id}`, {
    method: 'PUT',
    body: JSON.stringify({ metadata: { ...metadata, description, version: packageInfo.version, publication_date: new Date().toISOString().slice(0, 10) } })
  });
  deposition = await update.json() as ZenodoDeposition;
  if (publish) {
    const published = await request(`/api/deposit/depositions/${deposition.id}/actions/publish`, { method: 'POST' });
    deposition = await published.json() as ZenodoDeposition;
  }
  const doi = deposition.doi ?? deposition.metadata?.doi ?? deposition.metadata?.prereserve_doi?.doi ?? null;
  const report = {
    schemaVersion: 'pendulum-zenodo-deposition/v1',
    generatedAt: new Date().toISOString(),
    status: publish ? 'published' : 'draft-created',
    environment: sandbox ? 'sandbox' : 'production',
    version: packageInfo.version,
    depositionId: deposition.id ?? null,
    recordId: deposition.record_id ?? null,
    doi,
    uploaded,
    links: deposition.links ?? {},
    caveat: publish ? 'The production DOI is authoritative only after the public record resolves.' : 'Draft only; run with --publish for an irreversible public release.'
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
