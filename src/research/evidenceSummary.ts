export interface EvidenceSummary {
  schemaVersion: 'pendulum-evidence-summary/v1';
  generatedAt: string;
  sourceReports: Record<string, string>;
  tests: {
    total: number;
    passed: number;
    failed: number;
    suites: number;
    files: number;
    success: boolean;
    generatedAt: string | null;
    passLabel: string;
  };
  validation: {
    scipyAgreement: {
      regularMaxDivergence: number | null;
      display: string;
    };
    periodDoubling: LiteratureAnchorSummary | null;
    melnikovThreshold: LiteratureAnchorSummary | null;
    literatureAllPass: boolean;
  };
  reviewerKit: {
    status: string;
    artifactCount: number;
    requiredAvailable: number;
    recommendedAvailable: number;
    missingRequired: string[];
    missingRecommended: string[];
  };
  gpu: {
    status: string;
    passedVendors: number;
    requiredVendors: number;
    missingVendors: string[];
    reproduce: string | null;
    caveat: string | null;
  };
  publication: {
    status: string;
    npmPublished: boolean;
    zenodoPublished: boolean;
    zenodoDoi: string | null;
    githubReleaseUrl: string | null;
    pagesUrl: string | null;
    caveats: string[];
  };
  finalization: Array<{
    id: string;
    label: string;
    status: 'complete' | 'blocked-external';
    command: string;
    note: string;
  }>;
}

interface LiteratureAnchorSummary {
  computed: number;
  published: number;
  absError: number;
  tolerance: number | null;
  pass: boolean;
  display: string;
}

export interface EvidenceSummaryInput {
  generatedAt: string;
  sourceReports: Record<string, string>;
  vitestResults: unknown;
  reviewerKitManifest: unknown;
  publicationStatus: unknown;
  literatureAnchors: unknown;
  crossValidation: unknown;
  gpuAdapterMatrix: unknown;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return array(value).filter((item): item is string => typeof item === 'string');
}

export function approxScientific(value: number | null, significant = 1): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  const exponential = value.toExponential(Math.max(0, significant - 1)).replace('e', 'e');
  return `~${exponential}`;
}

function findAnchor(literatureAnchors: JsonObject, id: string): LiteratureAnchorSummary | null {
  const anchor = array(literatureAnchors.anchors).map(object).find((item) => item.id === id);
  if (!anchor) return null;
  const computed = numberValue(anchor.computed, NaN);
  const published = numberValue(anchor.published, NaN);
  if (!Number.isFinite(computed) || !Number.isFinite(published)) return null;
  const toleranceValue = typeof anchor.tolerance === 'number' && Number.isFinite(anchor.tolerance) ? anchor.tolerance : null;
  const absError = Math.abs(computed - published);
  return {
    computed,
    published,
    absError,
    tolerance: toleranceValue,
    pass: booleanValue(anchor.pass, false),
    display: `${computed.toPrecision(7)} vs ${published.toPrecision(7)}`
  };
}

function regularScipyAgreement(crossValidation: JsonObject): number | null {
  const regularCases = array(crossValidation.cases)
    .map(object)
    .filter((item) => stringValue(item.name).toLowerCase().includes('regular'));
  const divergences = regularCases
    .map((item) => numberValue(item.maxDivergence, NaN))
    .filter((value) => Number.isFinite(value));
  return divergences.length > 0 ? Math.max(...divergences) : null;
}

function availableArtifacts(artifacts: unknown[], priority: string): number {
  return artifacts
    .map(object)
    .filter((artifact) => artifact.priority === priority && artifact.available === true)
    .length;
}

function missingGpuVendors(gpuAdapterMatrix: JsonObject): string[] {
  return array(gpuAdapterMatrix.rows)
    .map(object)
    .filter((row) => row.status === 'missing')
    .map((row) => stringValue(row.vendor))
    .filter((vendor) => vendor.length > 0);
}

export function buildEvidenceSummary(input: EvidenceSummaryInput): EvidenceSummary {
  const vitest = object(input.vitestResults);
  const reviewer = object(input.reviewerKitManifest);
  const publication = object(input.publicationStatus);
  const literature = object(input.literatureAnchors);
  const crossValidation = object(input.crossValidation);
  const gpuAdapterMatrix = object(input.gpuAdapterMatrix);
  const artifacts = array(reviewer.artifacts);
  const publicationNpm = object(publication.npm);
  const zenodo = object(publication.zenodo);
  const githubRelease = object(publication.githubRelease);
  const pages = object(publication.pages);
  const gpuCoverage = object(gpuAdapterMatrix.coverage);
  const total = numberValue(vitest.numTotalTests);
  const passed = numberValue(vitest.numPassedTests);
  const failed = numberValue(vitest.numFailedTests);
  const regularAgreement = regularScipyAgreement(crossValidation);
  const npmPublished = booleanValue(publicationNpm.published);
  const zenodoPublished = booleanValue(zenodo.published);
  const gpuMissing = missingGpuVendors(gpuAdapterMatrix);

  return {
    schemaVersion: 'pendulum-evidence-summary/v1',
    generatedAt: input.generatedAt,
    sourceReports: input.sourceReports,
    tests: {
      total,
      passed,
      failed,
      suites: numberValue(vitest.numTotalTestSuites),
      files: array(vitest.testResults).length,
      success: booleanValue(vitest.success),
      generatedAt: typeof vitest.startTime === 'number' ? new Date(vitest.startTime).toISOString() : null,
      passLabel: `${passed} / ${total} pass`
    },
    validation: {
      scipyAgreement: {
        regularMaxDivergence: regularAgreement,
        display: approxScientific(regularAgreement)
      },
      periodDoubling: findAnchor(literature, 'period-doubling-onset'),
      melnikovThreshold: findAnchor(literature, 'melnikov-threshold'),
      literatureAllPass: booleanValue(literature.allPass)
    },
    reviewerKit: {
      status: stringValue(reviewer.status, 'unknown'),
      artifactCount: artifacts.length,
      requiredAvailable: availableArtifacts(artifacts, 'required'),
      recommendedAvailable: availableArtifacts(artifacts, 'recommended'),
      missingRequired: stringArray(reviewer.missingRequired),
      missingRecommended: stringArray(reviewer.missingRecommended)
    },
    gpu: {
      status: stringValue(gpuAdapterMatrix.status, 'unknown'),
      passedVendors: numberValue(gpuCoverage.passed),
      requiredVendors: numberValue(gpuCoverage.required),
      missingVendors: gpuMissing,
      reproduce: typeof gpuAdapterMatrix.reproduce === 'string' ? gpuAdapterMatrix.reproduce : null,
      caveat: typeof gpuAdapterMatrix.caveat === 'string' ? gpuAdapterMatrix.caveat : null
    },
    publication: {
      status: stringValue(publication.status, 'unknown'),
      npmPublished,
      zenodoPublished,
      zenodoDoi: typeof zenodo.doi === 'string' ? zenodo.doi : null,
      githubReleaseUrl: typeof githubRelease.url === 'string' ? githubRelease.url : null,
      pagesUrl: typeof pages.url === 'string' ? pages.url : null,
      caveats: stringArray(publication.caveats)
    },
    finalization: [
      {
        id: 'npm-publish',
        label: 'npm package publication',
        status: npmPublished ? 'complete' : 'blocked-external',
        command: 'npm publish --access public',
        note: npmPublished ? 'Package version resolves on npm.' : 'Requires npm credentials and an intentional publish.'
      },
      {
        id: 'zenodo-doi',
        label: 'Zenodo DOI publication',
        status: zenodoPublished ? 'complete' : 'blocked-external',
        command: 'npm run zenodo:publish && npm run doi:sync',
        note: zenodoPublished ? 'DOI resolves publicly.' : 'Requires Zenodo credentials and a final public record.'
      },
      {
        id: 'gpu-vendor-matrix',
        label: 'NVIDIA/AMD self-hosted GPU evidence',
        status: gpuMissing.length === 0 ? 'complete' : 'blocked-external',
        command: 'npm run benchmark:gpu-matrix',
        note: gpuMissing.length === 0
          ? 'All required physical vendor rows are present.'
          : `Missing physical runner evidence for ${gpuMissing.join(', ')}.`
      },
      {
        id: 'release-attestation',
        label: 'release attestation verification',
        status: typeof githubRelease.url === 'string' ? 'complete' : 'blocked-external',
        command: 'npm run release:verify-attestations',
        note: typeof githubRelease.url === 'string'
          ? 'GitHub release exists; attestation verification remains the release gate.'
          : 'Requires a published GitHub release.'
      }
    ]
  };
}
