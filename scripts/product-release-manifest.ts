import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertEvidenceSourceCommit } from './evidence-provenance';
import { validateReleaseMutation, type MutationAggregate } from './release-mutation-gate';

const FULL_SHA1 = /^[0-9a-f]{40}$/;
const FULL_SHA256 = /^[0-9a-f]{64}$/;
const GENERATED_RELEASE_PATHS = new Set([
  'reports/attestation-verification.json',
  'reports/bundle-budget.json',
  'reports/bundle-budget.md',
  'reports/release-evidence-manifest.json',
  'reports/release-readiness.json',
  'reports/release-readiness.md',
  'reports/worldclass-scorecard.json',
  'reports/worldclass-scorecard.md'
]);

export interface ProductReleaseConfig {
  schemaVersion: 'pendulum-product-release-config/v1';
  lab: {
    repository: string;
    publicUrl: string;
    evidencePath: string;
    validationScopePath: string;
    reviewerPath: string;
    manifestPath: string;
    serviceWorkerPath: string;
  };
  landing: {
    repository: string;
    publicUrl: string;
    entryPaths: string[];
    evidencePath: string;
    kernelManifestPath: string;
  };
  cta: { requiredTab: string; minimumPerEntry: number };
}

interface FetchArtifact {
  url: string;
  finalUrl: string;
  bytes: Uint8Array;
  sha256: string;
  contentType: string | null;
}

interface EvidenceSummary {
  schemaVersion?: string;
  provenance?: {
    sourceCommit?: string;
    packageVersion?: string;
    lockfileSha256?: string;
    dirtyWorktree?: boolean;
    expiresAt?: string;
  };
  tests?: { total?: number; passed?: number; failed?: number; success?: boolean };
}

interface DemoKernelManifest {
  schemaVersion?: string;
  kernel?: string;
  kernelVersion?: string;
  sourcePackageVersion?: string;
  sourceCommit?: string;
  sha256?: string;
}

interface AttestationReport {
  status?: string;
  artifact?: string;
  sha256?: string;
  packageVersion?: string;
  sourceRef?: string;
  sourceCommit?: string;
  predicates?: Array<{ status?: string; predicateType?: string; sourceRepositoryRef?: string }>;
}

interface BundleBudgetReport {
  status?: string;
  artifactSetSha256?: string;
}

interface ValidationScopeReport {
  schemaVersion?: string;
  status?: string;
  summary?: { independentPassed?: number; independentAvailable?: number };
  runtimes?: Array<{
    id?: string;
    availability?: string;
    status?: string;
    requiredForRelease?: boolean;
    evidencePath?: string | null;
  }>;
}

interface WasmSyncReport {
  schemaVersion?: string;
  status?: string;
  packageVersion?: string;
  sourceCommit?: string;
  artifact?: { path?: string; bytes?: number; sha256?: string };
  ci?: { trusted?: boolean; workflow?: string | null; runId?: string | null; sha?: string | null };
}

interface CliOptions {
  artifact: string;
  sourceRef: string;
  tag: string;
  output: string;
  attempts: number;
  retryDelayMs: number;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function json<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeUrl(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).href;
}

function decodeHtmlAttribute(value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x2F;', '/');
}

export function extractLabCtas(html: string, entryUrl: string, labPublicUrl: string, requiredTab: string): string[] {
  const expected = new URL(labPublicUrl);
  const urls = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/giu)]
    .map((match) => decodeHtmlAttribute(match[2] ?? ''))
    .map((href) => {
      try {
        return new URL(href, entryUrl);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => url !== null)
    .filter(
      (url) =>
        url.protocol === 'https:' &&
        url.origin === expected.origin &&
        url.pathname === expected.pathname &&
        url.searchParams.get('tab') === requiredTab
    )
    .map((url) => url.href);
  return [...new Set(urls)].sort();
}

export function validateEvidence(
  evidence: EvidenceSummary,
  expected: { packageVersion: string; lockfileSha256: string }
): asserts evidence is Required<Pick<EvidenceSummary, 'provenance' | 'tests'>> & EvidenceSummary {
  const provenance = evidence.provenance;
  const tests = evidence.tests;
  if (!provenance || !FULL_SHA1.test(provenance.sourceCommit ?? '')) {
    throw new Error('evidence provenance.sourceCommit must be a full lowercase Git SHA');
  }
  if (provenance.packageVersion !== expected.packageVersion) {
    throw new Error(
      `evidence package ${provenance.packageVersion ?? 'missing'} does not match ${expected.packageVersion}`
    );
  }
  if (provenance.lockfileSha256 !== expected.lockfileSha256) {
    throw new Error('evidence lockfile SHA-256 does not match the release lockfile');
  }
  if (provenance.dirtyWorktree !== false) throw new Error('evidence was generated from a dirty worktree');
  if (!Number.isFinite(Date.parse(provenance.expiresAt ?? '')) || Date.parse(provenance.expiresAt!) <= Date.now()) {
    throw new Error('evidence is expired');
  }
  if (
    !tests ||
    !Number.isInteger(tests.total) ||
    tests.total! <= 0 ||
    tests.passed !== tests.total ||
    tests.failed !== 0 ||
    tests.success !== true
  ) {
    throw new Error('evidence test result is not a successful complete run');
  }
}

export function validateKernelManifest(
  manifest: DemoKernelManifest,
  expected: { sourceCommit: string; packageVersion: string; deployedKernelSha256: string }
): void {
  if (manifest.schemaVersion !== 'pendulum-demo-kernel-manifest/v1') {
    throw new Error(`unsupported demo-kernel manifest schema: ${manifest.schemaVersion ?? 'missing'}`);
  }
  if (manifest.sourceCommit !== expected.sourceCommit) {
    throw new Error('landing kernel manifest is not bound to the release evidence source commit');
  }
  if (manifest.sourcePackageVersion !== expected.packageVersion) {
    throw new Error('landing kernel manifest package version does not match the release');
  }
  if (!FULL_SHA256.test(manifest.sha256 ?? '') || manifest.sha256 !== expected.deployedKernelSha256) {
    throw new Error('deployed landing demo kernel does not match its SHA-256 manifest');
  }
}

function option(args: string[], name: string, fallback = ''): string {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? '') : fallback;
}

function options(args: string[]): CliOptions {
  const artifact = option(args, '--artifact');
  const sourceRef = option(args, '--source-ref', process.env.GITHUB_REF ?? '');
  const tag = option(args, '--tag', sourceRef.replace(/^refs\/tags\//, ''));
  const attempts = Number(option(args, '--attempts', '24'));
  const retryDelayMs = Number(option(args, '--retry-delay-ms', '10000'));
  if (!artifact) throw new Error('--artifact is required');
  if (!/^refs\/tags\/v\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(sourceRef)) {
    throw new Error('--source-ref must be an immutable refs/tags/v* coordinate');
  }
  if (tag !== sourceRef.replace(/^refs\/tags\//, '')) throw new Error('--tag and --source-ref disagree');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) throw new Error('--attempts must be 1..60');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60_000) {
    throw new Error('--retry-delay-ms must be 0..60000');
  }
  return {
    artifact,
    sourceRef,
    tag,
    output: option(args, '--output', 'reports/release-evidence-manifest.json'),
    attempts,
    retryDelayMs
  };
}

async function fetchArtifact(url: string, accept = '*/*'): Promise<FetchArtifact> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'pendulum-lab-release-verifier'
  };
  if (process.env.GH_TOKEN && url.startsWith('https://api.github.com/')) {
    headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }
  const response = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`${url} returned an empty response`);
  return {
    url,
    finalUrl: response.url,
    bytes,
    sha256: sha256(bytes),
    contentType: response.headers.get('content-type')
  };
}

async function resolveTagCommit(repository: string, tag: string): Promise<string> {
  const api = `https://api.github.com/repos/${repository}`;
  const reference = json<{ object?: { sha?: string; type?: string; url?: string } }>(
    (await fetchArtifact(`${api}/git/ref/tags/${encodeURIComponent(tag)}`, 'application/vnd.github+json')).bytes,
    `${repository} tag reference`
  );
  let object = reference.object;
  for (let depth = 0; object?.type === 'tag' && depth < 3; depth += 1) {
    if (!object.url) throw new Error(`${repository} annotated tag has no object URL`);
    object = json<{ object?: { sha?: string; type?: string; url?: string } }>(
      (await fetchArtifact(object.url, 'application/vnd.github+json')).bytes,
      `${repository} annotated tag`
    ).object;
  }
  if (object?.type !== 'commit' || !FULL_SHA1.test(object.sha ?? '')) {
    throw new Error(`${repository} ${tag} does not resolve to a full commit SHA`);
  }
  return object.sha!;
}

function rawUrl(repository: string, tag: string, path: string): string {
  const encodedPath = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(tag)}/${encodedPath}`;
}

function unexpectedTrackedChanges(): string[] {
  const output = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .filter((path) => !path.startsWith('reports/') && !GENERATED_RELEASE_PATHS.has(path));
}

async function verifyLiveProduct(
  config: ProductReleaseConfig,
  tag: string,
  localEvidence: FetchArtifact,
  localValidationScope: FetchArtifact,
  localLandingKernel: FetchArtifact,
  localLandingKernelManifest: FetchArtifact,
  packageVersion: string,
  lockfileSha256: string
): Promise<Record<string, unknown>> {
  const landingCommit = await resolveTagCommit(config.landing.repository, tag);
  const labCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!FULL_SHA1.test(labCommit)) throw new Error('local release checkout does not resolve to a full commit SHA');

  const landingArtifacts: Record<string, { liveUrl: string; sha256: string; bytes: number }> = {};
  const entryCtas: Array<{ entry: string; urls: string[] }> = [];
  for (const path of [...config.landing.entryPaths, config.landing.evidencePath, config.landing.kernelManifestPath]) {
    const liveUrl = normalizeUrl(config.landing.publicUrl, path);
    const [live, tagged] = await Promise.all([
      fetchArtifact(liveUrl),
      fetchArtifact(rawUrl(config.landing.repository, tag, path))
    ]);
    if (live.sha256 !== tagged.sha256) throw new Error(`landing deployment ${path} does not match ${tag}`);
    landingArtifacts[path] = { liveUrl, sha256: live.sha256, bytes: live.bytes.length };
    if (config.landing.entryPaths.includes(path)) {
      const urls = extractLabCtas(
        Buffer.from(live.bytes).toString('utf8'),
        live.finalUrl,
        config.lab.publicUrl,
        config.cta.requiredTab
      );
      if (urls.length < config.cta.minimumPerEntry) {
        throw new Error(
          `${path} has ${urls.length} canonical Lab CTA(s), expected at least ${config.cta.minimumPerEntry}`
        );
      }
      entryCtas.push({ entry: path, urls });
    }
  }

  const landingEvidenceArtifact = await fetchArtifact(
    normalizeUrl(config.landing.publicUrl, config.landing.evidencePath)
  );
  const landingEvidence = json<EvidenceSummary>(landingEvidenceArtifact.bytes, 'landing evidence summary');
  validateEvidence(landingEvidence, { packageVersion, lockfileSha256 });
  if (landingEvidenceArtifact.sha256 !== localEvidence.sha256) {
    throw new Error('landing deployment does not serve the exact Lab evidence-summary bytes');
  }

  const kernelManifestArtifact = await fetchArtifact(
    normalizeUrl(config.landing.publicUrl, config.landing.kernelManifestPath)
  );
  const kernelManifest = json<DemoKernelManifest>(kernelManifestArtifact.bytes, 'landing kernel manifest');
  if (kernelManifestArtifact.sha256 !== localLandingKernelManifest.sha256) {
    throw new Error('landing does not serve the exact Lab-generated kernel manifest');
  }
  const kernelPath = kernelManifest.kernel ?? '';
  if (!/^assets\/[a-zA-Z0-9._/-]+$/.test(kernelPath) || kernelPath.includes('..')) {
    throw new Error('landing kernel manifest contains an unsafe or missing kernel path');
  }
  const [liveKernel, taggedKernel] = await Promise.all([
    fetchArtifact(normalizeUrl(config.landing.publicUrl, kernelPath)),
    fetchArtifact(rawUrl(config.landing.repository, tag, kernelPath))
  ]);
  if (liveKernel.sha256 !== taggedKernel.sha256) throw new Error('deployed landing kernel does not match the tag');
  if (liveKernel.sha256 !== localLandingKernel.sha256) {
    throw new Error('deployed landing kernel does not match the Lab-generated release artifact');
  }
  validateKernelManifest(kernelManifest, {
    sourceCommit: labCommit,
    packageVersion,
    deployedKernelSha256: liveKernel.sha256
  });

  const labEvidence = await fetchArtifact(normalizeUrl(config.lab.publicUrl, config.lab.evidencePath));
  if (labEvidence.sha256 !== localEvidence.sha256) {
    throw new Error('public Lab does not serve the release evidence-summary bytes');
  }
  const [validationScope, reviewer, webManifest, serviceWorker] = await Promise.all([
    fetchArtifact(normalizeUrl(config.lab.publicUrl, config.lab.validationScopePath)),
    fetchArtifact(normalizeUrl(config.lab.publicUrl, config.lab.reviewerPath)),
    fetchArtifact(normalizeUrl(config.lab.publicUrl, config.lab.manifestPath)),
    fetchArtifact(normalizeUrl(config.lab.publicUrl, config.lab.serviceWorkerPath))
  ]);
  if (validationScope.sha256 !== localValidationScope.sha256) {
    throw new Error('public Lab does not serve the release independent-validation-scope bytes');
  }
  const representativeCta = entryCtas.flatMap((entry) => entry.urls)[0];
  if (!representativeCta) throw new Error('no canonical CTA was available for a live navigation check');
  const ctaResponse = await fetchArtifact(representativeCta, 'text/html');
  const finalCta = new URL(ctaResponse.finalUrl);
  const expectedLab = new URL(config.lab.publicUrl);
  if (
    finalCta.origin !== expectedLab.origin ||
    finalCta.pathname !== expectedLab.pathname ||
    finalCta.searchParams.get('tab') !== config.cta.requiredTab
  ) {
    throw new Error(`landing CTA resolved to an unexpected route: ${finalCta.href}`);
  }

  return {
    lab: {
      repository: config.lab.repository,
      commit: labCommit,
      publicUrl: config.lab.publicUrl,
      evidence: { url: labEvidence.url, sha256: labEvidence.sha256 },
      validationScope: { url: validationScope.url, sha256: validationScope.sha256 },
      reviewer: { url: reviewer.url, sha256: reviewer.sha256 },
      pwa: {
        manifest: { url: webManifest.url, sha256: webManifest.sha256 },
        serviceWorker: { url: serviceWorker.url, sha256: serviceWorker.sha256 }
      }
    },
    landing: {
      repository: config.landing.repository,
      commit: landingCommit,
      publicUrl: config.landing.publicUrl,
      artifacts: landingArtifacts,
      evidenceSourceCommit: landingEvidence.provenance!.sourceCommit,
      kernel: {
        path: kernelPath,
        version: kernelManifest.kernelVersion,
        sha256: liveKernel.sha256,
        sourceCommit: kernelManifest.sourceCommit,
        sourcePackageVersion: kernelManifest.sourcePackageVersion,
        deployedBytesMatchTag: true
      }
    },
    cta: {
      requiredTab: config.cta.requiredTab,
      entries: entryCtas,
      checkedUrl: representativeCta,
      finalUrl: ctaResponse.finalUrl,
      reachable: true
    }
  };
}

async function main(): Promise<void> {
  const cli = options(process.argv.slice(2));
  const config = JSON.parse(await readFile('config/product-release.json', 'utf8')) as ProductReleaseConfig;
  if (config.schemaVersion !== 'pendulum-product-release-config/v1') throw new Error('invalid product release config');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { name?: string; version?: string };
  if (!packageJson.name || !packageJson.version) throw new Error('package.json release coordinate is missing');
  if (cli.tag !== `v${packageJson.version}`)
    throw new Error(`tag ${cli.tag} does not match package v${packageJson.version}`);

  const lockfileBytes = new Uint8Array(await readFile('package-lock.json'));
  const lockfileSha256 = sha256(lockfileBytes);
  const evidenceBytes = new Uint8Array(await readFile('reports/evidence-summary.json'));
  const evidenceArtifact: FetchArtifact = {
    url: 'reports/evidence-summary.json',
    finalUrl: 'reports/evidence-summary.json',
    bytes: evidenceBytes,
    sha256: sha256(evidenceBytes),
    contentType: 'application/json'
  };
  const evidence = json<EvidenceSummary>(evidenceBytes, 'local evidence summary');
  validateEvidence(evidence, { packageVersion: packageJson.version, lockfileSha256 });
  assertEvidenceSourceCommit(evidence.provenance!.sourceCommit!);

  const unexpected = unexpectedTrackedChanges();
  if (unexpected.length > 0) {
    throw new Error(`release checkout has non-generated tracked changes: ${unexpected.join(', ')}`);
  }
  const releaseSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!FULL_SHA1.test(releaseSourceCommit)) throw new Error('release checkout is not a full Git commit');

  const artifactBytes = new Uint8Array(await readFile(cli.artifact));
  const artifactSha256 = sha256(artifactBytes);
  const attestationBytes = new Uint8Array(await readFile('reports/attestation-verification.json'));
  const attestation = json<AttestationReport>(attestationBytes, 'attestation report');
  const predicates = new Set(
    (attestation.predicates ?? [])
      .filter((predicate) => predicate.status === 'verified')
      .map((predicate) => predicate.predicateType)
  );
  if (
    attestation.status !== 'verified' ||
    attestation.artifact !== basename(cli.artifact) ||
    attestation.sha256 !== artifactSha256 ||
    attestation.packageVersion !== packageJson.version ||
    attestation.sourceRef !== cli.sourceRef ||
    !predicates.has('https://slsa.dev/provenance/v1') ||
    !predicates.has('https://cyclonedx.org/bom')
  ) {
    throw new Error('attestation report is not bound to this exact version, tag, and tarball');
  }

  const bundleBytes = new Uint8Array(await readFile('reports/bundle-budget.json'));
  const bundle = json<BundleBudgetReport>(bundleBytes, 'bundle budget report');
  if (bundle.status !== 'pass') throw new Error('bundle budget is not passing for the release artifact');
  const validationScopeBytes = new Uint8Array(await readFile('reports/independent-validation-scope.json'));
  const validationScope = json<ValidationScopeReport>(validationScopeBytes, 'independent validation scope');
  const matlab = validationScope.runtimes?.find((runtime) => runtime.id === 'matlab');
  if (
    validationScope.schemaVersion !== 'pendulum-independent-validation-scope/v1' ||
    validationScope.status !== 'pass' ||
    validationScope.summary?.independentPassed !== 2 ||
    validationScope.summary.independentAvailable !== 2 ||
    matlab?.availability !== 'unavailable' ||
    matlab.status !== 'not-run' ||
    matlab.requiredForRelease !== false ||
    matlab.evidencePath !== null
  ) {
    throw new Error(
      'independent validation scope must prove SciPy+Julia and explicitly leave MATLAB unavailable/optional'
    );
  }
  const validationScopeArtifact: FetchArtifact = {
    url: 'reports/independent-validation-scope.json',
    finalUrl: 'reports/independent-validation-scope.json',
    bytes: validationScopeBytes,
    sha256: sha256(validationScopeBytes),
    contentType: 'application/json'
  };
  const mutationBytes = new Uint8Array(await readFile('reports/mutation-aggregate.json'));
  const mutation = json<MutationAggregate>(mutationBytes, 'mutation aggregate');
  validateReleaseMutation(mutation);
  const authoritativeKernelBytes = new Uint8Array(await readFile('src/physics/double.ts'));
  const wasmKernelBytes = new Uint8Array(await readFile('src/runtime/wasm/pendulum-kernel.wasm'));
  const wasmSyncBytes = new Uint8Array(await readFile('reports/wasm-sync.json'));
  const wasmSync = json<WasmSyncReport>(wasmSyncBytes, 'WASM sync report');
  if (
    wasmSync.schemaVersion !== 'pendulum-wasm-sync/v1' ||
    wasmSync.status !== 'pass' ||
    wasmSync.packageVersion !== packageJson.version ||
    wasmSync.sourceCommit !== releaseSourceCommit ||
    wasmSync.artifact?.path !== 'src/runtime/wasm/pendulum-kernel.wasm' ||
    wasmSync.artifact.sha256 !== sha256(wasmKernelBytes) ||
    wasmSync.artifact.bytes !== wasmKernelBytes.length ||
    wasmSync.ci?.trusted !== true ||
    wasmSync.ci.sha !== releaseSourceCommit
  ) {
    throw new Error('WASM sync evidence is not a trusted-CI proof for this exact release kernel and commit');
  }
  const landingKernelBytes = new Uint8Array(await readFile('reports/landing-kernel/pendulum-demo-kernel.js'));
  const landingKernelManifestBytes = new Uint8Array(await readFile('reports/landing-kernel/demo-kernel-manifest.json'));
  const landingKernelArtifact: FetchArtifact = {
    url: 'reports/landing-kernel/pendulum-demo-kernel.js',
    finalUrl: 'reports/landing-kernel/pendulum-demo-kernel.js',
    bytes: landingKernelBytes,
    sha256: sha256(landingKernelBytes),
    contentType: 'text/javascript'
  };
  const landingKernelManifestArtifact: FetchArtifact = {
    url: 'reports/landing-kernel/demo-kernel-manifest.json',
    finalUrl: 'reports/landing-kernel/demo-kernel-manifest.json',
    bytes: landingKernelManifestBytes,
    sha256: sha256(landingKernelManifestBytes),
    contentType: 'application/json'
  };

  let product: Record<string, unknown> | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= cli.attempts; attempt += 1) {
    try {
      product = await verifyLiveProduct(
        config,
        cli.tag,
        evidenceArtifact,
        validationScopeArtifact,
        landingKernelArtifact,
        landingKernelManifestArtifact,
        packageJson.version,
        lockfileSha256
      );
      break;
    } catch (error) {
      lastError = error;
      if (attempt < cli.attempts) {
        console.warn(`product deployment verification ${attempt}/${cli.attempts} pending: ${String(error)}`);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, cli.retryDelayMs));
      }
    }
  }
  if (!product) throw lastError instanceof Error ? lastError : new Error('live product verification failed');

  const report = {
    schemaVersion: 'pendulum-product-release-manifest/v1',
    generatedAt: new Date().toISOString(),
    status: 'verified',
    release: {
      package: packageJson.name,
      version: packageJson.version,
      tag: cli.tag,
      sourceRef: cli.sourceRef,
      sourceCommit: releaseSourceCommit,
      evidenceSourceCommit: evidence.provenance!.sourceCommit,
      lockfileSha256,
      trackedSourceClean: true
    },
    artifacts: {
      packageTarball: { path: basename(cli.artifact), bytes: artifactBytes.length, sha256: artifactSha256 },
      evidence: {
        path: 'reports/evidence-summary.json',
        sha256: evidenceArtifact.sha256,
        tests: evidence.tests
      },
      independentValidationScope: {
        path: 'reports/independent-validation-scope.json',
        sha256: validationScopeArtifact.sha256,
        status: validationScope.status,
        independentPassed: validationScope.summary.independentPassed,
        matlab: {
          availability: matlab.availability,
          status: matlab.status,
          requiredForRelease: matlab.requiredForRelease
        }
      },
      mutationAggregate: {
        path: 'reports/mutation-aggregate.json',
        sha256: sha256(mutationBytes),
        generatedAt: mutation.generatedAt,
        mutationScore: mutation.mutationScore,
        coveredMutationScore: mutation.coveredMutationScore,
        routingLifecycleCovered: true
      },
      bundleBudget: {
        path: 'reports/bundle-budget.json',
        sha256: sha256(bundleBytes),
        status: bundle.status,
        artifactSetSha256: bundle.artifactSetSha256 ?? null
      },
      attestation: {
        path: 'reports/attestation-verification.json',
        sha256: sha256(attestationBytes),
        status: attestation.status,
        predicates: [...predicates].sort()
      },
      authoritativePhysicsKernel: {
        path: 'src/physics/double.ts',
        sha256: sha256(authoritativeKernelBytes)
      },
      wasmKernel: {
        path: 'src/runtime/wasm/pendulum-kernel.wasm',
        sha256: sha256(wasmKernelBytes),
        syncReportPath: 'reports/wasm-sync.json',
        syncReportSha256: sha256(wasmSyncBytes),
        trustedCi: true,
        workflow: wasmSync.ci.workflow,
        runId: wasmSync.ci.runId
      },
      landingDemoKernel: {
        path: 'reports/landing-kernel/pendulum-demo-kernel.js',
        sha256: landingKernelArtifact.sha256,
        manifestPath: 'reports/landing-kernel/demo-kernel-manifest.json',
        manifestSha256: landingKernelManifestArtifact.sha256,
        generatedFrom: 'src/integrations/landingDemoKernel.ts -> src/physics/double.ts'
      }
    },
    product
  };
  await writeFile(cli.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`verified product release manifest written to ${cli.output}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  await main();
}
