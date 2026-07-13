export interface EvidenceSummary {
  schemaVersion: 'pendulum-evidence-summary/v1';
  generatedAt: string;
  sourceReports: Record<string, string>;
  provenance: {
    sourceCommit: string;
    packageVersion: string;
    lockfileSha256: string;
    dirtyWorktree: boolean;
    expiresAfterDays: number;
    expiresAt: string;
  };
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
  mutation: {
    status: string;
    score: number;
    coveredScore: number;
    reportCount: number;
    survived: number;
    noCoverage: number;
  };
  energy: {
    profiledMethods: number;
    stepsPerMethod: number;
    bestMethod: string | null;
    bestMaxRelativeDrift: number | null;
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
  claims: Array<{
    id: string;
    displayValue: string;
    status: string;
    uncertainty: string | null;
    sourceReport: string;
    sourceCommit: string;
    caveat: string | null;
    reproduce: string;
    publicUrl: string | null;
  }>;
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
  mutationAggregate?: unknown;
  energyBenchmark?: unknown;
  provenance?: {
    sourceCommit: string;
    packageVersion: string;
    lockfileSha256: string;
    dirtyWorktree: boolean;
    expiresAfterDays: number;
    expiresAt: string;
  };
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
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
  const anchor = array(literatureAnchors.anchors)
    .map(object)
    .find((item) => item.id === id);
  if (!anchor) return null;
  const computed = numberValue(anchor.computed, NaN);
  const published = numberValue(anchor.published, NaN);
  if (!Number.isFinite(computed) || !Number.isFinite(published)) return null;
  const toleranceValue =
    typeof anchor.tolerance === 'number' && Number.isFinite(anchor.tolerance) ? anchor.tolerance : null;
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
  return artifacts.map(object).filter((artifact) => artifact.priority === priority && artifact.available === true)
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
  const mutation = object(input.mutationAggregate);
  const mutationCounts = object(mutation.statusCounts);
  const energy = object(input.energyBenchmark);
  const energyRows = array(energy.rows).map(object);
  const bestEnergyRow = energyRows
    .filter((row) => Number.isFinite(numberValue(row.maxRelDrift, NaN)))
    .sort((a, b) => numberValue(a.maxRelDrift, Infinity) - numberValue(b.maxRelDrift, Infinity))[0];
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
  const sourceCommit = input.provenance?.sourceCommit ?? 'unknown';
  const mutationScore = numberValue(mutation.mutationScore);
  const mutationStatus = stringValue(mutation.status, 'unknown');
  const profiledMethods = energyRows.length;

  return {
    schemaVersion: 'pendulum-evidence-summary/v1',
    generatedAt: input.generatedAt,
    sourceReports: input.sourceReports,
    provenance: input.provenance ?? {
      sourceCommit: 'unknown',
      packageVersion: 'unknown',
      lockfileSha256: 'unknown',
      dirtyWorktree: false,
      expiresAfterDays: 14,
      expiresAt: new Date(Date.parse(input.generatedAt) + 14 * 86_400_000).toISOString()
    },
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
    mutation: {
      status: mutationStatus,
      score: mutationScore,
      coveredScore: numberValue(mutation.coveredMutationScore),
      reportCount: numberValue(mutation.reportCount),
      survived: numberValue(mutationCounts.Survived),
      noCoverage: numberValue(mutationCounts.NoCoverage)
    },
    energy: {
      profiledMethods,
      stepsPerMethod: numberValue(energy.steps),
      bestMethod: bestEnergyRow && typeof bestEnergyRow.name === 'string' ? bestEnergyRow.name : null,
      bestMaxRelativeDrift:
        bestEnergyRow && typeof bestEnergyRow.maxRelDrift === 'number' && Number.isFinite(bestEnergyRow.maxRelDrift)
          ? bestEnergyRow.maxRelDrift
          : null
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
    claims: [
      {
        id: 'tests.unit',
        displayValue: `${passed} / ${total} pass`,
        status: failed === 0 ? 'passed' : 'failed',
        uncertainty: null,
        sourceReport: input.sourceReports.vitestResults ?? 'reports/vitest-results.json',
        sourceCommit,
        caveat: null,
        reproduce: 'npm run verify',
        publicUrl: null
      },
      {
        id: 'validation.scipy.regular',
        displayValue: approxScientific(regularAgreement),
        status: regularAgreement === null ? 'unknown' : 'passed',
        uncertainty: 'Maximum observed divergence for regular reference cases',
        sourceReport: input.sourceReports.crossValidation ?? 'reports/cross-validation.json',
        sourceCommit,
        caveat: 'Chaotic trajectories use time-amplified tolerances and are not claimed bitwise-identical.',
        reproduce: 'npm run validate:cross',
        publicUrl: null
      },
      {
        id: 'testing.mutation',
        displayValue: `${mutationScore.toFixed(2)}%`,
        status: mutationStatus,
        uncertainty: null,
        sourceReport: input.sourceReports.mutationAggregate ?? 'reports/mutation-aggregate.json',
        sourceCommit,
        caveat: mutationStatus === 'low' ? 'Below the 70% quality target; the 65% regression floor is enforced.' : null,
        reproduce:
          'npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 65 --low 70 --high 85',
        publicUrl: null
      },
      {
        id: 'benchmark.energy.methods',
        displayValue: `${profiledMethods} methods profiled`,
        status: profiledMethods > 0 ? 'measured' : 'missing',
        uncertainty: 'Method-specific drift; no universal pass envelope',
        sourceReport: input.sourceReports.energyBenchmark ?? 'reports/energy-benchmark.json',
        sourceCommit,
        caveat: 'Compare each method against its documented order and structure-preservation behavior.',
        reproduce: 'npm run benchmark:energy',
        publicUrl: null
      },
      {
        id: 'gpu.vendor-matrix',
        displayValue: `${numberValue(gpuCoverage.passed)} / ${numberValue(gpuCoverage.required)} vendors`,
        status: stringValue(gpuAdapterMatrix.status, 'unknown'),
        uncertainty: null,
        sourceReport: input.sourceReports.gpuAdapterMatrix ?? 'reports/gpu-adapter-matrix.json',
        sourceCommit,
        caveat: typeof gpuAdapterMatrix.caveat === 'string' ? gpuAdapterMatrix.caveat : null,
        reproduce:
          typeof gpuAdapterMatrix.reproduce === 'string' ? gpuAdapterMatrix.reproduce : 'npm run benchmark:gpu-matrix',
        publicUrl: null
      },
      {
        id: 'publication.release',
        displayValue: stringValue(publication.status, 'unknown'),
        status: stringValue(publication.status, 'unknown'),
        uncertainty: null,
        sourceReport: input.sourceReports.publicationStatus ?? 'reports/publication-status.json',
        sourceCommit,
        caveat: stringArray(publication.caveats).join(' ') || null,
        reproduce: 'npm run release:status',
        publicUrl: typeof pages.url === 'string' ? pages.url : null
      }
    ],
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
        note:
          gpuMissing.length === 0
            ? 'All required physical vendor rows are present.'
            : `Missing physical runner evidence for ${gpuMissing.join(', ')}.`
      },
      {
        id: 'release-attestation',
        label: 'release attestation verification',
        status: typeof githubRelease.url === 'string' ? 'complete' : 'blocked-external',
        command: 'npm run release:verify-attestations',
        note:
          typeof githubRelease.url === 'string'
            ? 'GitHub release exists; attestation verification remains the release gate.'
            : 'Requires a published GitHub release.'
      }
    ]
  };
}
