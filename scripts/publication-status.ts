import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectReportMetadata, freshnessPolicy } from './report-metadata';

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name: string; version: string };
const repository = 'Elliot-Jung-17/pendulum-lab';
const pagesUrl = 'https://elliot-jung-17.github.io/pendulum-lab/reviewer.html';
const execFileAsync = promisify(execFile);

interface CommandProbe {
  available: boolean;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function commandProbe(command: string, args: readonly string[], timeout = 15_000): Promise<CommandProbe> {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  try {
    const result = await execFileAsync(executable, [...args], { timeout, encoding: 'utf8' });
    return { available: true, ok: true, exitCode: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { code?: string | number; stdout?: string; stderr?: string };
    const missing = failure.code === 'ENOENT';
    return {
      available: !missing,
      ok: false,
      exitCode: typeof failure.code === 'number' ? failure.code : null,
      stdout: String(failure.stdout ?? '').trim(),
      stderr: String(failure.stderr ?? failure.message ?? '').trim()
    };
  }
}

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

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

const npm = await jsonRequest(`https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}/${encodeURIComponent(packageJson.version)}`);
const zenodo = await jsonRequest(`https://zenodo.org/api/records?q=${encodeURIComponent('"Pendulum Lab" AND "nonlinear pendulum dynamics"')}&size=25`);
const release = await jsonRequest(`https://api.github.com/repos/${repository}/releases/latest`);
const pages = await head(pagesUrl);
const npmWhoami = await commandProbe('npm', ['whoami']);
const githubHooks = await commandProbe('gh', ['api', `repos/${repository}/hooks`]);
const publishWorkflow = await readOptional('.github/workflows/publish-npm.yml');
const npmTokenPresent = Boolean(process.env.NPM_TOKEN);
const zenodoTokenPresent = Boolean(process.env.ZENODO_TOKEN);
const zenodoSandboxTokenPresent = Boolean(process.env.ZENODO_SANDBOX_TOKEN);
const trustedPublisherWorkflowReady = /id-token:\s*write/.test(publishWorkflow)
  && /environment:\s*npm/.test(publishWorkflow)
  && /npm publish --access public/.test(publishWorkflow);
let hookPayload: Array<{ name?: string; config?: { url?: string } }> = [];
try {
  hookPayload = githubHooks.ok ? JSON.parse(githubHooks.stdout) as Array<{ name?: string; config?: { url?: string } }> : [];
} catch {
  hookPayload = [];
}
const zenodoHooks = hookPayload.filter((hook) => /zenodo/i.test(`${hook.name ?? ''} ${hook.config?.url ?? ''}`));
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
const metadata = await collectReportMetadata('npm run release:status', freshnessPolicy(7, 'warn'));

const report = {
  schemaVersion: 'pendulum-publication-status/v1',
  generatedAt: metadata.generatedAt,
  metadata,
  status: npmPublished && zenodoPublished && pages.ok && release.ok ? 'published' : 'partial',
  npm: {
    package: packageJson.name,
    version: packageJson.version,
    published: npmPublished,
    registryStatus: npm.status,
    url: `https://www.npmjs.com/package/${packageJson.name}/v/${packageJson.version}`,
    auth: {
      whoamiOk: npmWhoami.ok,
      user: npmWhoami.ok ? npmWhoami.stdout : null,
      npmTokenPresent,
      credentialBoundary: npmWhoami.ok || npmTokenPresent
        ? 'npm credentials are present locally; publication still requires the real publish path and exact public-version verification.'
        : 'npm whoami returned ENEEDAUTH and NPM_TOKEN is not set; real npm publication was not attempted.'
    },
    trustedPublisher: {
      workflowReady: trustedPublisherWorkflowReady,
      repository,
      workflow: 'publish-npm.yml',
      environment: 'npm',
      verified: false,
      status: trustedPublisherWorkflowReady
        ? 'Workflow has OIDC/id-token publishing contract, but npm package settings are not publicly verifiable from this unauthenticated local CLI.'
        : 'Trusted-publisher workflow contract is not complete in this checkout.'
    }
  },
  zenodo: {
    published: zenodoPublished,
    apiStatus: zenodo.status,
    doi: zenodoPublished ? doi : null,
    recordId: matchingZenodo?.id ?? null,
    auth: {
      zenodoTokenPresent,
      zenodoSandboxTokenPresent,
      credentialBoundary: zenodoTokenPresent
        ? 'ZENODO_TOKEN is present; production DOI minting requires npm run zenodo:publish followed by npm run doi:sync.'
        : 'ZENODO_TOKEN is not set; production DOI minting was not attempted and no DOI was fabricated.'
    },
    githubIntegration: {
      checked: githubHooks.available,
      checkStatus: githubHooks.ok ? 'ok' : (githubHooks.available ? 'unavailable-or-forbidden' : 'gh-cli-missing'),
      detected: zenodoHooks.length > 0,
      matchingHooks: zenodoHooks.length,
      credentialBoundary: zenodoHooks.length > 0
        ? 'At least one GitHub repository hook appears to target Zenodo.'
        : 'No Zenodo GitHub repository hook was visible to gh api repos/Elliot-Jung-17/pendulum-lab/hooks.'
    }
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
    ...(npmWhoami.ok || npmTokenPresent ? [] : ['npm publish is blocked locally: npm whoami is unauthenticated and NPM_TOKEN is missing.']),
    ...(zenodoPublished ? [] : ['No matching public Zenodo DOI record resolves for Pendulum Lab.']),
    ...(zenodoTokenPresent ? [] : ['Zenodo production publish is blocked locally: ZENODO_TOKEN is missing.']),
    ...(zenodoHooks.length ? [] : ['GitHub-Zenodo integration is not visible in repository hooks.']),
    ...(release.ok ? [] : ['GitHub latest release is not publicly resolvable.']),
    ...(pages.ok ? [] : ['Reviewer dashboard is not publicly reachable.'])
  ]
};

await writeFile('reports/publication-status.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
