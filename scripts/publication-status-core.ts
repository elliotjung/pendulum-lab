export interface PublicationHttpProbe {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface PublicationHeadProbe {
  ok: boolean;
  status: number;
}

export interface PublicationStatusInput {
  packageName: string;
  packageVersion: string;
  repository: string;
  pagesUrl: string;
  npm: PublicationHttpProbe;
  zenodo: PublicationHttpProbe;
  release: PublicationHttpProbe;
  releaseCommit: PublicationHttpProbe;
  pages: PublicationHeadProbe;
  pagesManifest: PublicationHttpProbe;
  pagesEvidence: PublicationHttpProbe;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function gitSha(value: unknown): string | null {
  const candidate = text(value);
  return candidate && /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function normalizedVersion(value: unknown): string | null {
  const candidate = text(value);
  return candidate ? candidate.replace(/^v(?=\d)/i, '') : null;
}

function npmIntegrity(value: unknown): string | null {
  const candidate = text(value);
  const match = candidate?.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const expectedBytes = { sha256: 32, sha384: 48, sha512: 64 }[match[1] as 'sha256' | 'sha384' | 'sha512'];
  const digest = Buffer.from(match[2]!, 'base64');
  const canonical = digest.toString('base64');
  return digest.byteLength === expectedBytes && canonical === match[2] ? candidate! : null;
}

function npmShasum(value: unknown): string | null {
  const candidate = text(value);
  return candidate && /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function zenodoHits(body: unknown): JsonObject[] {
  const root = object(body);
  const hits = object(root?.hits)?.hits;
  return Array.isArray(hits) ? hits.map(object).filter((entry): entry is JsonObject => entry !== null) : [];
}

function exactZenodoRecord(body: unknown, packageVersion: string): JsonObject | null {
  return (
    zenodoHits(body).find((hit) => {
      const metadata = object(hit.metadata);
      return (
        /^pendulum lab\b/i.test(text(metadata?.title) ?? '') && normalizedVersion(metadata?.version) === packageVersion
      );
    }) ?? null
  );
}

function zenodoDoi(record: JsonObject | null): string | null {
  const metadata = object(record?.metadata);
  const candidate = text(record?.doi) ?? text(metadata?.doi);
  return candidate && /^10\.\d{4,9}\/zenodo\.\d+$/i.test(candidate) ? candidate : null;
}

export function evaluatePublicationStatus(input: PublicationStatusInput) {
  const expectedTag = `v${input.packageVersion}`;

  const npmBody = object(input.npm.body);
  const npmDist = object(npmBody?.dist);
  const integrity = npmIntegrity(npmDist?.integrity);
  const shasum = npmShasum(npmDist?.shasum);
  const npmIdentityMatches =
    input.npm.ok && npmBody?.name === input.packageName && npmBody?.version === input.packageVersion;
  const npmPublished = npmIdentityMatches && Boolean(integrity || shasum);

  const releaseBody = object(input.release.body);
  const releaseTag = text(releaseBody?.tag_name);
  const releaseCommitSha = gitSha(object(input.releaseCommit.body)?.sha);
  const releaseIdentityMatches =
    input.release.ok && releaseTag === expectedTag && releaseBody?.draft !== true && releaseBody?.prerelease !== true;
  const githubPublished = releaseIdentityMatches && releaseCommitSha !== null;

  const zenodoRecord = input.zenodo.ok ? exactZenodoRecord(input.zenodo.body, input.packageVersion) : null;
  const zenodoMetadata = object(zenodoRecord?.metadata);
  const doi = zenodoDoi(zenodoRecord);
  const zenodoPublished = zenodoRecord !== null && doi !== null;

  const manifest = input.pagesManifest.ok ? object(input.pagesManifest.body) : null;
  const evidence = input.pagesEvidence.ok ? object(input.pagesEvidence.body) : null;
  const evidenceProvenance = object(evidence?.provenance);
  const manifestSourceCommit = gitSha(manifest?.sourceCommit);
  const manifestEvidenceCommit = gitSha(manifest?.evidenceSourceCommit);
  const evidenceSourceCommit = gitSha(evidenceProvenance?.sourceCommit);
  const evidencePackageVersion = text(evidenceProvenance?.packageVersion);
  const responseExposed = (probe: PublicationHttpProbe): boolean =>
    probe.ok || (probe.status >= 200 && probe.status < 300);
  const pagesBindingExposed = responseExposed(input.pagesManifest) || responseExposed(input.pagesEvidence);
  const pagesBindingVerified =
    input.pages.ok &&
    input.pagesManifest.ok &&
    input.pagesEvidence.ok &&
    releaseCommitSha !== null &&
    manifestSourceCommit === releaseCommitSha &&
    evidenceSourceCommit === releaseCommitSha &&
    (manifestEvidenceCommit === null || manifestEvidenceCommit === evidenceSourceCommit) &&
    evidencePackageVersion === input.packageVersion;
  const pagesBinding = pagesBindingVerified ? 'verified' : pagesBindingExposed ? 'failed' : 'unavailable';

  const contradictions = [
    responseExposed(input.npm) && !npmPublished,
    responseExposed(input.zenodo) && !zenodoPublished,
    responseExposed(input.release) && !githubPublished,
    pagesBindingExposed && !pagesBindingVerified
  ];
  const published = npmPublished && zenodoPublished && githubPublished && pagesBindingVerified;
  const status = published ? 'published' : contradictions.some(Boolean) ? 'failed' : 'partial';

  return {
    schemaVersion: 'pendulum-publication-status/v1',
    status,
    npm: {
      package: input.packageName,
      version: input.packageVersion,
      published: npmPublished,
      identityMatches: npmIdentityMatches,
      registryStatus: input.npm.status,
      integrity,
      shasum,
      url: `https://www.npmjs.com/package/${input.packageName}/v/${input.packageVersion}`
    },
    zenodo: {
      published: zenodoPublished,
      apiStatus: input.zenodo.status,
      version: text(zenodoMetadata?.version),
      versionMatches: zenodoRecord !== null,
      doi: zenodoPublished ? doi : null,
      recordId: zenodoRecord?.id ?? null
    },
    githubRelease: {
      published: githubPublished,
      apiStatus: input.release.status,
      expectedTag,
      tag: releaseTag,
      tagMatches: releaseTag === expectedTag,
      sourceCommit: releaseCommitSha,
      url: text(releaseBody?.html_url)
    },
    pages: {
      published: pagesBindingVerified,
      status: input.pages.status,
      url: input.pagesUrl,
      manifestStatus: input.pagesManifest.status,
      evidenceStatus: input.pagesEvidence.status,
      binding: pagesBinding,
      sourceCommit: manifestSourceCommit,
      evidenceSourceCommit,
      packageVersion: evidencePackageVersion
    },
    caveats: [
      ...(npmPublished
        ? []
        : [
            npmIdentityMatches
              ? 'npm exact-version metadata has no valid dist.integrity or dist.shasum.'
              : 'npm registry does not resolve metadata for this exact package name and version.'
          ]),
      ...(zenodoPublished
        ? []
        : ['No public Pendulum Lab Zenodo DOI record has metadata.version matching this exact package version.']),
      ...(githubPublished
        ? []
        : [`GitHub release ${expectedTag} and its resolved source commit are not both publicly verifiable.`]),
      ...(input.pages.ok ? [] : ['Reviewer dashboard is not publicly reachable.']),
      ...(pagesBindingVerified
        ? []
        : [
            pagesBindingExposed
              ? 'Published Pages manifest/evidence does not bind to the exact release source commit and package version.'
              : 'Published Pages manifest/evidence binding is unavailable.'
          ])
    ]
  } as const;
}
