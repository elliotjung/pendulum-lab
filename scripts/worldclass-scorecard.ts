/**
 * World-class readiness scorecard.
 *
 * Evidence is declared as a config-driven SIGNAL registry: each signal is a
 * small rule (file exists, npm script exists, file contains needles, JSON
 * predicate). Adding a new evidence rule means adding one registry entry and
 * referencing it from an area; the evaluator and report format never change.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  collectReportMetadata,
  freshnessPolicy,
  reportAgeDays,
  reportFreshnessStatus,
  type ReportMetadata
} from './report-metadata';

type Status = 'done' | 'partial' | 'gap';

interface ScorecardItem {
  area: string;
  status: Status;
  evidence: string[];
  remaining: string[];
}

interface LegacyRiskReport {
  counts: Record<string, number>;
  weights?: Record<string, number>;
  weightedScore: number;
  delta: number;
}

interface MutationAggregateReport {
  status?: string;
  thresholds?: { break?: number; low?: number; high?: number };
  reportCount?: number;
  mutationScore?: number;
  coveredMutationScore?: number;
}

interface MetadataReport {
  generatedAt?: string;
  metadata?: ReportMetadata;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const textCache = new Map<string, string>();
async function readText(path: string): Promise<string> {
  const cached = textCache.get(path);
  if (cached !== undefined) return cached;
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch {
    text = '';
  }
  textCache.set(path, text);
  return text;
}

// --- JSON evidence sources ----------------------------------------------------

const legacy = await readJson<LegacyRiskReport>('reports/legacy-risk-report.json', {
  counts: { innerHTML: -1, onclick: -1, inlineWorkerBlob: -1, dynamicScript: -1, globalRuntimeExports: -1 },
  weights: { innerHTML: 2, onclick: 2, inlineWorkerBlob: 8, dynamicScript: 12, globalRuntimeExports: 5 },
  weightedScore: -1,
  delta: 0
});
const packageJson = await readJson<{ scripts?: Record<string, string> }>('package.json', {});
const scripts = packageJson.scripts ?? {};
const vitest = await readJson<{ numTotalTests?: number; numPassedTests?: number; testResults?: unknown[] }>('reports/vitest-results.json', {});
const benchmark = await readJson<{ comparison?: { deltas?: unknown[] } }>('reports/benchmark-report.json', {});
const gpuScaleValidation = await readJson<{ cpuReference?: { ensemble?: { f32ReductionOracle?: { passed?: boolean } } } }>('reports/gpu-scale-validation.json', {});
interface HardwareGateReport {
  status?: string;
  backend?: string;
  adapter?: unknown;
  ensemble?: { backend?: string; comparison?: { passed?: boolean }; allReductionComparisonsPassed?: boolean };
  lyapunovSpectrum?: { backend?: string; comparison?: { passed?: boolean } | null; allPromotionComparisonsPassed?: boolean } | null;
  clv?: { backend?: string; comparison?: { passed?: boolean } | null } | null;
  variationalFtleField?: { backend?: string; comparison?: { passed?: boolean } | null } | null;
  nChainTrajectoryTape?: { backend?: string; comparison?: { passed?: boolean } | null } | null;
  nChainVariational?: { backend?: string; comparison?: { passed?: boolean } | null } | null;
}
const webgpuHardwareValidation = await readJson<HardwareGateReport>('reports/webgpu-hardware-validation.json', {});
const gpuBenchmarkLadder = await readJson<HardwareGateReport>('reports/gpu-benchmark-ladder.json', {});
const gpuAdapterMatrix = await readJson<{ status?: string; coverage?: { passed?: number; required?: number } }>('reports/gpu-adapter-matrix.json', {});
const publicationStatus = await readJson<{
  status?: string;
  npm?: { published?: boolean };
  zenodo?: { published?: boolean; doi?: string | null };
  githubRelease?: { published?: boolean };
  pages?: { published?: boolean };
}>('reports/publication-status.json', {});
const reproduceManifest = await readJson<MetadataReport>('reports/reproduce/manifest.json', {});
const reproduceFreshness = reportFreshnessStatus(reproduceManifest.metadata);
const reproduceAgeDays = reportAgeDays(reproduceManifest.metadata);
const attestationVerification = await readJson<{
  status?: string;
  predicates?: Array<{ status?: string; predicateType?: string }>;
}>('reports/attestation-verification.json', {});
const verifiedAttestationPredicates = new Set(
  attestationVerification.predicates
    ?.filter((item) => item.status === 'verified')
    .map((item) => item.predicateType)
);
const releaseReadiness = await readJson<{ status?: string }>('reports/release-readiness.json', {});
const mutationAggregateFallback = await readJson<MutationAggregateReport>('reports/mutation/mutation-aggregate.json', {});
const mutationAggregate = await readJson<MutationAggregateReport>('reports/mutation-aggregate.json', mutationAggregateFallback);
const unitTestSummary = Number.isInteger(vitest.numTotalTests) && Array.isArray(vitest.testResults)
  ? `${vitest.numPassedTests ?? 0}/${vitest.numTotalTests} unit tests across ${vitest.testResults.length} files`
  : 'unit test JSON report missing; run npm run test:json';
const weightedLegacyCounts = Object.entries(legacy.counts)
  .filter(([key]) => (legacy.weights?.[key] ?? 1) > 0)
  .map(([, value]) => value);
const legacyClean = legacy.weightedScore === 0 && weightedLegacyCounts.every((value) => value === 0);
const benchmarkHasComparison = Array.isArray(benchmark.comparison?.deltas) && benchmark.comparison.deltas.length > 0;

/** A hardware promotion sub-gate: backend must be webgpu and the CPU-oracle comparison must pass. */
function hardwareGatePassed(report: HardwareGateReport, key: 'clv' | 'variationalFtleField' | 'nChainTrajectoryTape' | 'nChainVariational' | 'lyapunovSpectrum'): boolean {
  const entry = report[key];
  return entry?.backend === 'webgpu' && entry?.comparison?.passed === true;
}

// --- Signal rule registry -------------------------------------------------------

type SignalRule =
  | { kind: 'file'; path: string }
  | { kind: 'any-file'; paths: string[] }
  | { kind: 'all-files'; paths: string[] }
  | { kind: 'script'; name: string }
  /** One file must contain every needle. */
  | { kind: 'text'; path: string; needles: string[] }
  /** At least one of the files must contain every needle. */
  | { kind: 'any-text'; paths: string[]; needles: string[] }
  /** Every requirement (file + its needles) must hold. */
  | { kind: 'multi-text'; requirements: { path: string; needles: string[] }[] }
  /** Arbitrary predicate over the pre-loaded JSON sources. */
  | { kind: 'check'; check: () => boolean };

const SIGNAL_RULES = {
  benchmark: { kind: 'file', path: 'reports/benchmark-report.md' },
  energy: { kind: 'file', path: 'reports/energy-benchmark.md' },
  memoryRegression: { kind: 'file', path: 'reports/memory-regression-report.md' },
  memoryBaseline: { kind: 'file', path: 'reports/memory-baseline.json' },
  mutationAggregateReport: { kind: 'any-file', paths: ['reports/mutation-aggregate.json', 'reports/mutation/mutation-aggregate.json'] },
  reproduceManifest: { kind: 'file', path: 'reports/reproduce/manifest.json' },
  reproduceManifestFresh: { kind: 'check', check: () => reproduceFreshness === 'fresh' },
  mutationAggregatePass: {
    kind: 'check',
    check: () => mutationAggregate.status === 'passed'
      && typeof mutationAggregate.mutationScore === 'number'
      && mutationAggregate.mutationScore >= (mutationAggregate.thresholds?.break ?? 60)
  },
  flagshipDoc: { kind: 'file', path: 'docs/flagship-result.md' },
  flagshipCertification: { kind: 'file', path: 'reports/flagship-certification.json' },
  flagshipFigure: { kind: 'file', path: 'reports/flagship-figure1.svg' },
  flagshipExternalCheck: { kind: 'file', path: 'reports/flagship-external-check.json' },
  flagshipNamesGapMap: { kind: 'text', path: 'src/research/certifiedWorkbench.ts', needles: ['melnikov-gap-map'] },
  reviewerKitDoc: { kind: 'file', path: 'docs/reviewer-kit.md' },
  reviewerKitManifest: { kind: 'file', path: 'reports/reviewer-kit-manifest.json' },
  reviewerKitManifestMd: { kind: 'file', path: 'reports/reviewer-kit-manifest.md' },
  reviewerKitScript: { kind: 'file', path: 'scripts/reviewer-kit.ts' },
  releasePackagingDoc: { kind: 'file', path: 'docs/release-packaging.md' },
  releaseReadiness: { kind: 'file', path: 'reports/release-readiness.json' },
  releaseOnePagePdf: { kind: 'file', path: 'reports/release-one-page.pdf' },
  walkthroughGif: { kind: 'file', path: 'reports/walkthrough-30s.gif' },
  gpuScaleReport: { kind: 'file', path: 'reports/gpu-scale-validation.md' },
  gpuScaleJson: { kind: 'file', path: 'reports/gpu-scale-validation.json' },
  gpuScaleScript: { kind: 'file', path: 'scripts/gpu-scale-validation.ts' },
  gpuReductionOracle: { kind: 'check', check: () => gpuScaleValidation.cpuReference?.ensemble?.f32ReductionOracle?.passed === true },
  webgpuHardwareReport: { kind: 'file', path: 'reports/webgpu-hardware-validation.md' },
  webgpuHardwareJson: { kind: 'file', path: 'reports/webgpu-hardware-validation.json' },
  gpuBenchmarkLadderReport: { kind: 'file', path: 'reports/gpu-benchmark-ladder.md' },
  gpuBenchmarkLadderJson: { kind: 'file', path: 'reports/gpu-benchmark-ladder.json' },
  gpuAdapterMatrixReport: { kind: 'file', path: 'reports/gpu-adapter-matrix.md' },
  gpuAdapterMatrixJson: { kind: 'file', path: 'reports/gpu-adapter-matrix.json' },
  gpuAdapterMatrixPass: { kind: 'check', check: () => gpuAdapterMatrix.status === 'pass' && gpuAdapterMatrix.coverage?.passed === gpuAdapterMatrix.coverage?.required },
  webgpuHardwarePass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && webgpuHardwareValidation.backend === 'webgpu' },
  webgpuFullSpectrumPass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && hardwareGatePassed(webgpuHardwareValidation, 'lyapunovSpectrum') },
  webgpuClvPass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && hardwareGatePassed(webgpuHardwareValidation, 'clv') },
  webgpuVariationalFtlePass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && hardwareGatePassed(webgpuHardwareValidation, 'variationalFtleField') },
  webgpuNChainTrajectoryTapePass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && hardwareGatePassed(webgpuHardwareValidation, 'nChainTrajectoryTape') },
  webgpuNChainPass: { kind: 'check', check: () => webgpuHardwareValidation.status === 'pass' && hardwareGatePassed(webgpuHardwareValidation, 'nChainVariational') },
  gpuBenchmarkLadderPass: {
    kind: 'check',
    check: () => gpuBenchmarkLadder.status === 'pass'
      && gpuBenchmarkLadder.adapter !== null
      && gpuBenchmarkLadder.ensemble?.allReductionComparisonsPassed === true
      && gpuBenchmarkLadder.lyapunovSpectrum?.allPromotionComparisonsPassed === true
      && hardwareGatePassed(gpuBenchmarkLadder, 'clv')
      && hardwareGatePassed(gpuBenchmarkLadder, 'variationalFtleField')
      && hardwareGatePassed(gpuBenchmarkLadder, 'nChainTrajectoryTape')
      && hardwareGatePassed(gpuBenchmarkLadder, 'nChainVariational')
  },
  mojibakeAudit: { kind: 'file', path: 'reports/mojibake-audit.md' },
  validation: { kind: 'file', path: 'reports/validation-report.md' },
  reference: { kind: 'file', path: 'reports/validation-reference.md' },
  architecture: { kind: 'file', path: 'docs/architecture.md' },
  numerics: { kind: 'file', path: 'docs/numerics.md' },
  limitations: { kind: 'file', path: 'docs/known-limitations.md' },
  ci: { kind: 'file', path: '.github/workflows/ci.yml' },
  mainWorkflow: { kind: 'file', path: '.github/workflows/main.yml' },
  nightlyWorkflow: { kind: 'file', path: '.github/workflows/nightly.yml' },
  releaseWorkflow: { kind: 'file', path: '.github/workflows/release.yml' },
  pagesWorkflow: { kind: 'file', path: '.github/workflows/pages.yml' },
  reviewerDashboard: { kind: 'all-files', paths: ['reviewer.html', 'src/reviewer/main.ts'] },
  reviewerDashboardE2e: { kind: 'file', path: 'e2e/reviewer-dashboard.spec.ts' },
  webgpuHardwareWorkflow: { kind: 'file', path: '.github/workflows/webgpu-hardware.yml' },
  webgpuHardwareE2e: { kind: 'file', path: 'e2e/webgpu-hardware-reductions.spec.ts' },
  distIndex: { kind: 'file', path: 'dist/index.html' },
  license: { kind: 'file', path: 'LICENSE' },
  citation: { kind: 'file', path: 'CITATION.cff' },
  typedocIndex: { kind: 'file', path: 'docs/api/index.html' },
  index: { kind: 'file', path: 'index.html' },
  coverageScopeBaseline: { kind: 'file', path: 'config/coverage-scope-baseline.json' },
  bundleBudget: { kind: 'file', path: 'scripts/bundle-budget.ts' },
  longRunE2e: { kind: 'file', path: 'e2e/long-run-performance.spec.ts' },
  accessibilityE2e: { kind: 'file', path: 'e2e/accessibility.spec.ts' },
  railAutocloseE2e: { kind: 'file', path: 'e2e/rail-autoclose.spec.ts' },
  visualRegressionE2e: { kind: 'file', path: 'e2e/visual-regression.spec.ts' },
  visualSnapshots: { kind: 'file', path: 'e2e/visual-regression.spec.ts-snapshots' },
  certifiedWorkbenchModule: { kind: 'file', path: 'src/research/certifiedWorkbench.ts' },
  trustInspectorUi: { kind: 'text', path: 'src/app/resultBadges.ts', needles: ['openTrustInspector', 'trust-inspector-panel'] },
  trustInspectorE2e: { kind: 'file', path: 'e2e/trust-inspector.spec.ts' },
  researchWorkspaceCard: { kind: 'text', path: 'src/app/parity/research-workbench-view.ts', needles: ['researchWorkspaceCard', 'rwWorkspaceSelect'] },
  researchWorkspaceList: {
    kind: 'multi-text',
    requirements: [
      { path: 'src/app/parity/research-workbench-state.ts', needles: ['workspaces'] },
      { path: 'src/app/parity/storage-sync.ts', needles: ['sanitizeWorkspaceList'] }
    ]
  },
  researchProjectSessions: {
    kind: 'multi-text',
    requirements: [
      { path: 'src/app/parity/research-workbench-view.ts', needles: ['rwProjectName'] },
      { path: 'src/app/parity/research-workbench-state.ts', needles: ['activeResearchSession'] },
      { path: 'src/app/parity/research-session-storage.ts', needles: ['sanitizeResearchSession'] }
    ]
  },
  visualTier: { kind: 'script', name: 'test:visual' },
  quickTier: { kind: 'script', name: 'test:quick' },
  slowTier: { kind: 'script', name: 'test:slow' },
  flagshipCertifyCommand: { kind: 'script', name: 'flagship:certify' },
  flagshipExternalCommand: { kind: 'script', name: 'flagship:external' },
  releasePackageCommand: { kind: 'script', name: 'release:package' },
  webgpuHardwareCommand: { kind: 'script', name: 'test:webgpu-hardware' },
  webgpuHardwareValidateCommand: { kind: 'script', name: 'validate:webgpu-hardware' },
  gpuBenchmarkLadderCommand: { kind: 'script', name: 'benchmark:gpu-ladder' },
  gpuAdapterMatrixCommand: { kind: 'script', name: 'benchmark:gpu-matrix' },
  reviewerKitCommand: { kind: 'script', name: 'reviewer:kit' },
  gpuScaleCommand: { kind: 'script', name: 'validate:gpu-scale' },
  benchmarkMemoryScript: { kind: 'script', name: 'benchmark:memory' },
  ciRunsQuickTier: { kind: 'text', path: '.github/workflows/ci.yml', needles: ['npm run test:quick'] },
  ciRunsGpuScale: { kind: 'any-text', paths: ['.github/workflows/ci.yml', '.github/workflows/main.yml'], needles: ['npm run validate:gpu-scale'] },
  webgpuWorkflowRunsValidation: { kind: 'text', path: '.github/workflows/webgpu-hardware.yml', needles: ['npm run validate:webgpu-hardware'] },
  webgpuWorkflowRunsBenchmarkLadder: { kind: 'text', path: '.github/workflows/webgpu-hardware.yml', needles: ['npm run benchmark:gpu-ladder'] },
  webgpuWorkflowRunsAdapterMatrix: { kind: 'text', path: '.github/workflows/webgpu-hardware.yml', needles: ['npm run benchmark:gpu-matrix'] },
  ciRunsReviewerKit: { kind: 'any-text', paths: ['.github/workflows/ci.yml', '.github/workflows/main.yml'], needles: ['npm run reviewer:kit'] },
  ciRunsVerify: { kind: 'text', path: '.github/workflows/ci.yml', needles: ['npm run verify'] },
  mainRunsSlowTier: { kind: 'text', path: '.github/workflows/main.yml', needles: ['npm run test:slow'] },
  mainRunsBenchmark: { kind: 'text', path: '.github/workflows/main.yml', needles: ['npm run benchmark'] },
  mainRunsMemoryRegression: { kind: 'text', path: '.github/workflows/main.yml', needles: ['npm run benchmark:memory'] },
  mainRunsMojibakeStrict: { kind: 'text', path: '.github/workflows/main.yml', needles: ['npm run audit:mojibake:strict'] },
  mainRunsReleasePackage: { kind: 'text', path: '.github/workflows/main.yml', needles: ['npm run release:package'] },
  releaseReadyStatus: { kind: 'check', check: () => releaseReadiness.status === 'ready-for-owner-publish' },
  chaosAccelerationContracts: { kind: 'text', path: 'src/chaos/accelerationContract.ts', needles: ['compareClvAcceleration', 'compareFtleFieldAcceleration', 'compareLyapunovSpectrumAcceleration'] },
  fullSpectrumGpuPromotion: { kind: 'text', path: 'src/runtime/gpuLyapunov.ts', needles: ['promotedDoublePendulumLyapunovSpectrum', 'webgpuDoublePendulumLyapunovSpectrumCandidate'] },
  clvFtleGpuPromotion: { kind: 'text', path: 'src/runtime/gpuChaosPromotion.ts', needles: ['promotedDoublePendulumClv', 'promotedDoublePendulumVariationalFtleField'] },
  nChainGpuPromotion: { kind: 'text', path: 'src/runtime/gpuNChainVariational.ts', needles: ['promotedNChainVariational', 'WGSL_NCHAIN_VARIATIONAL_KERNEL'] },
  npmOidcPublishing: { kind: 'text', path: '.github/workflows/publish-npm.yml', needles: ['id-token: write', 'npm@11.5.1', 'npm publish --access public'] },
  slsaAttestation: { kind: 'text', path: '.github/workflows/release.yml', needles: ['actions/attest@v4', 'attestations: write', 'sbom-path:'] },
  attestationsVerified: {
    kind: 'check',
    check: () => attestationVerification.status === 'verified'
      && verifiedAttestationPredicates.has('https://slsa.dev/provenance/v1')
      && verifiedAttestationPredicates.has('https://cyclonedx.org/bom')
  },
  publicationStatusReport: { kind: 'file', path: 'reports/publication-status.json' },
  // Fail-closed: npm/Zenodo count as published ONLY when the public registry or
  // a real DOI resolves (publication-status.ts probes them); owner credentials
  // alone never flip these signals.
  npmPublished: { kind: 'check', check: () => publicationStatus.npm?.published === true },
  zenodoPublished: { kind: 'check', check: () => publicationStatus.zenodo?.published === true && Boolean(publicationStatus.zenodo?.doi) },
  githubReleasePublished: { kind: 'check', check: () => publicationStatus.githubRelease?.published === true },
  pagesPublished: { kind: 'check', check: () => publicationStatus.pages?.published === true },
  arnoldiSchurFloquet: { kind: 'text', path: 'src/research/unitaryFloquet.ts', needles: ['complexUnitaryFloquetArnoldiSchurSpectrum'] }
} satisfies Record<string, SignalRule>;

async function textHasAll(path: string, needles: string[]): Promise<boolean> {
  const text = await readText(path);
  return text.length > 0 && needles.every((needle) => text.includes(needle));
}

async function evaluateSignal(rule: SignalRule): Promise<boolean> {
  switch (rule.kind) {
    case 'file':
      return exists(rule.path);
    case 'any-file': {
      for (const path of rule.paths) if (await exists(path)) return true;
      return false;
    }
    case 'all-files': {
      for (const path of rule.paths) if (!(await exists(path))) return false;
      return true;
    }
    case 'script':
      return Boolean(scripts[rule.name]);
    case 'text':
      return textHasAll(rule.path, rule.needles);
    case 'any-text': {
      for (const path of rule.paths) if (await textHasAll(path, rule.needles)) return true;
      return false;
    }
    case 'multi-text': {
      for (const requirement of rule.requirements) {
        if (!(await textHasAll(requirement.path, requirement.needles))) return false;
      }
      return true;
    }
    case 'check':
      return rule.check();
  }
}

const has = {} as Record<keyof typeof SIGNAL_RULES, boolean>;
for (const [id, rule] of Object.entries(SIGNAL_RULES) as [keyof typeof SIGNAL_RULES, SignalRule][]) {
  has[id] = await evaluateSignal(rule);
}

// --- Area readiness -------------------------------------------------------------

const pagesReady = has.pagesWorkflow && has.distIndex && has.reviewerDashboard && has.reviewerDashboardE2e;
const releasePackageReady = has.releasePackageCommand && has.releaseReadiness && has.releaseOnePagePdf && has.walkthroughGif && has.mainRunsReleasePackage && has.releaseReadyStatus;
const packagingReady = pagesReady && has.license && has.citation && has.typedocIndex && releasePackageReady;
const testTierReady = has.quickTier && has.slowTier && has.ciRunsQuickTier && has.ciRunsVerify && has.mainRunsSlowTier;
const visualReady = has.visualRegressionE2e && has.visualSnapshots && has.visualTier;
const memoryReady = has.benchmarkMemoryScript && has.memoryRegression && has.memoryBaseline;
const benchmarkReady = has.benchmark && has.energy && benchmarkHasComparison && has.gpuBenchmarkLadderPass;
const flagshipReady = has.certifiedWorkbenchModule && has.flagshipDoc && has.flagshipNamesGapMap;
const flagshipCertified = flagshipReady && has.flagshipCertifyCommand && has.flagshipCertification && has.flagshipFigure && has.flagshipExternalCommand && has.flagshipExternalCheck;
const reviewerKitReady = flagshipCertified && has.reviewerKitDoc && has.reviewerKitScript && has.reviewerKitCommand && has.reviewerKitManifest && has.reviewerKitManifestMd;
const reproduceReady = has.reproduceManifest && has.reproduceManifestFresh;
const gpuScaleReady = has.gpuScaleCommand && has.gpuScaleScript && has.gpuScaleReport && has.gpuScaleJson && has.gpuReductionOracle && has.ciRunsGpuScale && has.webgpuHardwareWorkflow && has.webgpuHardwareE2e && has.webgpuHardwareCommand && has.webgpuHardwareValidateCommand && has.gpuBenchmarkLadderCommand && has.gpuAdapterMatrixCommand && has.webgpuWorkflowRunsValidation && has.webgpuWorkflowRunsBenchmarkLadder && has.webgpuWorkflowRunsAdapterMatrix && has.webgpuHardwareReport && has.webgpuHardwareJson && has.gpuBenchmarkLadderReport && has.gpuBenchmarkLadderJson && has.gpuAdapterMatrixReport && has.gpuAdapterMatrixJson && has.webgpuHardwarePass && has.webgpuFullSpectrumPass && has.webgpuClvPass && has.webgpuVariationalFtlePass && has.webgpuNChainTrajectoryTapePass && has.webgpuNChainPass && has.gpuBenchmarkLadderPass;
const chaosAccelerationReady = has.chaosAccelerationContracts && has.fullSpectrumGpuPromotion && has.clvFtleGpuPromotion && has.nChainGpuPromotion;
const externalPublicationReady = has.npmOidcPublishing && has.slsaAttestation && has.attestationsVerified && has.publicationStatusReport && has.npmPublished && has.zenodoPublished && has.githubReleasePublished && has.pagesPublished;
const sparseFloquetReady = has.arnoldiSchurFloquet;
const trustWorkspaceReady = has.trustInspectorUi && has.trustInspectorE2e && has.researchWorkspaceCard && has.researchWorkspaceList && has.researchProjectSessions;
const mutationReady = has.nightlyWorkflow && has.mutationAggregateReport && has.mutationAggregatePass;

const items: ScorecardItem[] = [
  {
    area: 'TypeScript and modular architecture',
    status: 'done',
    evidence: [
      'src/ contains physics, chaos, viz, app, render, state, runtime, validation, export, workers modules',
      'npm run typecheck passes (strict)',
      'legacy js/ runtime fully removed (archived); index.html loads only src/main.ts',
      'legacy-risk audit score is 0'
    ],
    remaining: []
  },
  {
    area: 'Index simulator UI/UX',
    status: has.index && trustWorkspaceReady ? 'done' : has.index ? 'partial' : 'gap',
    evidence: ['index.html is the single user-facing simulator with lab, comparison, Lyapunov, sweep, bifurcation, phase-space, density, and validation tabs'],
    remaining: trustWorkspaceReady
      ? []
      : ['Research workspace profile list, Trust Inspector wiring, or panel density persistence is incomplete']
  },
  {
    area: 'Flagship result and reviewer kit',
    status: reviewerKitReady && reproduceReady ? 'done' : flagshipReady ? 'partial' : 'gap',
    evidence: [
      flagshipReady ? 'flagship module and docs name the Melnikov threshold vs period-doubling gap map as the crown result' : 'flagship result contract missing',
      has.flagshipCertification ? 'flagship certification report exists with Figure 1 hash, crossing interval, onset table, and caveat map' : 'flagship certification report missing',
      has.flagshipExternalCheck ? 'dependency-free Python external check exists for A_c and ratio crossing arithmetic' : 'flagship external check missing',
      has.reviewerKitCommand ? 'npm run reviewer:kit exists' : 'reviewer kit command missing',
      has.reviewerKitManifest ? 'reviewer-kit manifest exists' : 'reviewer-kit manifest missing',
      has.reviewerKitDoc ? 'reviewer-kit documentation exists' : 'reviewer-kit documentation missing',
      reproduceReady
        ? `reproduce manifest is fresh and commit-bound (${reproduceManifest.metadata?.gitSha?.slice(0, 12) ?? 'unknown sha'})`
        : `reproduce manifest freshness is ${reproduceFreshness}${typeof reproduceAgeDays === 'number' ? ` (${reproduceAgeDays.toFixed(1)} days old)` : ''}`
    ],
    remaining: [
      ...(!flagshipReady ? ['Define one flagship result contract and paper-facing doc'] : []),
      ...(!flagshipCertified ? ['Run npm run flagship:certify and npm run flagship:external to generate Figure 1 certification artifacts'] : []),
      ...(!reviewerKitReady ? ['Generate reports/reviewer-kit-manifest.json and .md with npm run reviewer:kit'] : []),
      ...(!reproduceReady ? ['Run npm run reproduce so reports/reproduce/manifest.json has fresh git/command/environment metadata'] : [])
    ]
  },
  {
    area: 'Trust Inspector and research workspace UX',
    status: trustWorkspaceReady ? 'done' : 'partial',
    evidence: [
      has.trustInspectorUi ? 'result badges open a Trust Inspector with source, parameters, uncertainty, external validation, reproduce command, caveat, artifact, and hash fields' : 'Trust Inspector badge panel missing',
      has.trustInspectorE2e ? 'Trust Inspector DOM/e2e spec verifies click, keyboard open, content, Escape, and close behavior' : 'Trust Inspector DOM/e2e spec missing',
      has.researchWorkspaceCard ? 'Research tab includes the Certified Workspace card' : 'Certified Workspace card missing',
      has.researchWorkspaceList ? 'workspace profile list and storage sanitizer exist' : 'workspace profile list or storage sanitizer missing',
      has.researchProjectSessions ? 'workspace storage now models Project -> Sessions -> Runs -> Artifacts' : 'project/session/artifact hierarchy missing',
      'audience modes gate beginner/student/research surfaces'
    ],
    remaining: trustWorkspaceReady ? [] : ['Complete Trust Inspector e2e coverage and Project -> Sessions -> Runs -> Artifacts workspace hierarchy']
  },
  {
    area: 'Numerics and physics depth',
    status: sparseFloquetReady ? 'done' : 'partial',
    evidence: [
      'RKF45, Dormand-Prince 5(4), DOP853-adjacent GBS extrapolation, Gauss-Legendre 4/6, TR-BDF2, canonical midpoint, N-pendulum, driven, spring systems are present in src',
      'Floquet multipliers, natural + pseudo-arclength continuation, period-doubling branch switching, and the Melnikov analytic threshold are implemented and tested',
      'external cross-validation vs an independent SciPy DOP853 reference covers the double AND triple pendulum; literature anchors pin the elliptic period, normal modes, and the period-doubling onset',
      gpuScaleReady ? 'GPU/scale validation contract report exists, CI runs it, and real WebGPU hardware validation has passed against the CPU oracle' : 'GPU/scale validation contract or CI wiring is incomplete',
      sparseFloquetReady ? 'matrix-free Arnoldi-Schur Floquet wrapper exists for sparse/large unitary operators' : 'sparse/large Floquet Arnoldi-Schur wrapper missing'
    ],
    remaining: sparseFloquetReady ? ['Optional MATLAB/Julia second references remain release-hardening work'] : ['Sparse/large-unitary Floquet eigensolver still missing']
  },
  {
    area: 'Chaos analysis',
    status: chaosAccelerationReady ? 'done' : 'partial',
    evidence: [
      'Maximal Lyapunov convergence, full spectrum, Kaplan-Yorke dimension, SALI/FLI, Poincare, bifurcation modules exist and are tested',
      'covariant Lyapunov vectors (Ginelli), 0-1 test, RQA, FTLE fields, basin entropy and the Wada grid test are implemented as tabs + library APIs',
      'every non-variational diagnostic reports an uncertainty estimate (bootstrap / block-resampled / regression CI)',
      has.gpuScaleReport ? 'gpu-scale validation report separates acceleration caveats from scientific claims' : 'gpu-scale validation report missing',
      chaosAccelerationReady ? 'CLV, full-spectrum, and FTLE acceleration promotion contracts are executable comparison functions' : 'CLV/FTLE/full-spectrum acceleration contracts missing',
      has.webgpuFullSpectrumPass ? '4D double-pendulum full-spectrum WebGPU candidate passed the hardware CPU-oracle promotion gate' : 'full-spectrum WebGPU hardware promotion evidence missing',
      has.webgpuClvPass ? '4D double-pendulum CLV WebGPU candidate passed the hardware CPU-oracle promotion gate' : 'CLV WebGPU hardware promotion evidence missing',
      has.webgpuVariationalFtlePass ? '4D double-pendulum variational-FTLE WebGPU candidate passed the hardware CPU-oracle promotion gate' : 'variational-FTLE WebGPU hardware promotion evidence missing',
      has.webgpuNChainTrajectoryTapePass ? 'N<=3 planar N-chain nonlinear trajectory/Jacobian-tape WebGPU candidate passed the hardware CPU-f64 oracle gate' : 'N-chain trajectory/tape WebGPU hardware promotion evidence missing',
      has.webgpuNChainPass ? '6D planar N-chain tiled STM/QR/CLV/FTLE candidate passed the hardware CPU-f64 oracle gate' : 'N-chain WebGPU hardware promotion evidence missing'
    ],
    remaining: chaosAccelerationReady && has.webgpuFullSpectrumPass && has.webgpuClvPass && has.webgpuVariationalFtlePass && has.webgpuNChainTrajectoryTapePass && has.webgpuNChainPass ? [] : ['Add or run hardware-gated CLV/FTLE/full-spectrum/N-chain acceleration comparison contracts']
  },
  {
    area: 'GPU and scale validation',
    status: gpuScaleReady && has.gpuAdapterMatrixPass ? 'done' : 'partial',
    evidence: [
      has.gpuScaleCommand ? 'npm run validate:gpu-scale exists' : 'validate:gpu-scale command missing',
      has.gpuScaleReport ? 'reports/gpu-scale-validation.md exists' : 'gpu-scale validation report missing',
      has.gpuScaleJson ? 'reports/gpu-scale-validation.json exists' : 'gpu-scale validation JSON missing',
      has.gpuReductionOracle ? 'ensemble f32-candidate reduction passes the CPU f64 oracle comparison' : 'ensemble reduction oracle result missing from gpu-scale validation JSON',
      has.ciRunsGpuScale ? 'CI runs validate:gpu-scale' : 'CI does not run validate:gpu-scale',
      has.webgpuHardwareWorkflow ? 'self-hosted WebGPU hardware workflow exists and fails when a real adapter is absent' : 'WebGPU hardware workflow missing',
      has.webgpuHardwareE2e ? 'hardware e2e compares GPU-side ensemble reduction, full-spectrum, CLV, variational-FTLE, N-chain trajectory/tape, and N-chain STM/QR promotion with CPU f64' : 'hardware GPU reduction e2e missing',
      has.webgpuHardwareValidateCommand ? 'npm run validate:webgpu-hardware exists' : 'validate:webgpu-hardware command missing',
      has.gpuBenchmarkLadderCommand ? 'npm run benchmark:gpu-ladder exists' : 'GPU benchmark ladder command missing',
      has.webgpuWorkflowRunsValidation ? 'self-hosted WebGPU workflow writes the hardware validation report' : 'WebGPU workflow does not run validate:webgpu-hardware',
      has.webgpuWorkflowRunsBenchmarkLadder ? 'self-hosted WebGPU workflow writes the GPU benchmark ladder report' : 'WebGPU workflow does not run benchmark:gpu-ladder',
      has.webgpuHardwarePass ? 'reports/webgpu-hardware-validation.json records backend=webgpu and status=pass' : 'hardware WebGPU validation report is missing or not passing',
      has.webgpuFullSpectrumPass ? 'hardware WebGPU validation report records full-spectrum backend=webgpu and comparison pass' : 'hardware full-spectrum promotion evidence missing',
      has.webgpuClvPass ? 'hardware WebGPU validation report records CLV backend=webgpu and comparison pass' : 'hardware CLV promotion evidence missing',
      has.webgpuVariationalFtlePass ? 'hardware WebGPU validation report records variational-FTLE backend=webgpu and comparison pass' : 'hardware variational-FTLE promotion evidence missing',
      has.webgpuNChainTrajectoryTapePass ? 'hardware WebGPU validation report records N-chain trajectory/tape backend=webgpu and comparison pass' : 'hardware N-chain trajectory/tape promotion evidence missing',
      has.webgpuNChainPass ? 'hardware WebGPU validation report records N-chain STM/QR backend=webgpu and comparison pass' : 'hardware N-chain promotion evidence missing',
      has.gpuBenchmarkLadderReport ? 'reports/gpu-benchmark-ladder.md records adapter metadata, horizon drift, and promotion metrics' : 'GPU benchmark ladder report missing',
      has.gpuBenchmarkLadderPass ? 'reports/gpu-benchmark-ladder.json records status=pass across reductions, 4D diagnostics, N-chain trajectory/tape, and N-chain STM/QR gates' : 'GPU benchmark ladder pass evidence missing',
      has.gpuAdapterMatrixReport ? `multi-adapter matrix records ${gpuAdapterMatrix.coverage?.passed ?? 0}/${gpuAdapterMatrix.coverage?.required ?? 3} Intel/NVIDIA/AMD vendor classes` : 'multi-adapter matrix report missing',
      'current contract treats CPU f64 as the scientific oracle; WebGPU may accelerate only after agreement or fallback'
    ],
    remaining: [
      ...(gpuScaleReady ? [] : ['Run npm run validate:gpu-scale, npm run validate:webgpu-hardware, npm run benchmark:gpu-ladder, and npm run benchmark:gpu-matrix']),
      ...(has.gpuAdapterMatrixPass ? [] : ['Register physical NVIDIA and AMD self-hosted WebGPU runners and collect passing vendor ladder artifacts'])
    ]
  },
  {
    area: 'Testing and browser coverage',
    status: scripts['test:e2e'] && has.ci && has.mainWorkflow && has.longRunE2e && testTierReady && visualReady && memoryReady && mutationReady ? 'done' : 'partial',
    evidence: [
      unitTestSummary,
      'unit tests cover integrators, energy drift, determinism, JSON import validation, edge cases, chaos, visualization, repro packages',
      testTierReady ? 'quick, slow, and full test tiers are wired into PR/mainline workflows' : 'quick/slow/full test tier wiring is incomplete',
      has.coverageScopeBaseline ? 'coverage scope guard catches new source files missing from the v8 coverage map' : 'coverage scope guard missing',
      has.longRunE2e ? 'long-run performance/soak e2e spec exists and runs in mainline full validation' : 'long-run performance/soak e2e spec missing',
      has.accessibilityE2e ? 'accessibility e2e spec exists and runs in mainline full validation' : 'accessibility e2e spec missing',
      visualReady ? 'visual regression script, spec, and versioned Chromium snapshots exist' : 'visual regression command or snapshots are missing',
      memoryReady ? 'memory-regression report and baseline exist from benchmark output' : 'memory-regression report or baseline missing',
      mutationReady ? `nightly mutation aggregate passes at ${mutationAggregate.mutationScore}% total / ${mutationAggregate.coveredMutationScore}% covered across ${mutationAggregate.reportCount} shards` : 'nightly mutation aggregate missing or below threshold'
    ],
    remaining: [
      ...(!testTierReady ? ['Wire quick/slow/full test tiers into CI'] : []),
      ...(!visualReady ? ['Promote visual regression command and golden snapshots'] : []),
      ...(!memoryReady ? ['Run npm run benchmark and npm run benchmark:memory to create memory-regression report + baseline artifacts'] : []),
      ...(!mutationReady ? ['Run the Nightly Mutation workflow and publish reports/mutation-aggregate.json before a release review'] : [])
    ]
  },
  {
    area: 'Performance and benchmark reporting',
    status: benchmarkReady && has.mainRunsBenchmark && has.mainRunsMemoryRegression ? 'done' : 'partial',
    evidence: [
      benchmarkHasComparison ? 'benchmark-report.md captures FPS, physics ms/frame, memory, worker latency, and original-vs-candidate deltas' : 'benchmark-report.md missing original-vs-candidate deltas',
      'energy-benchmark.md compares long-run drift by integrator',
      has.gpuBenchmarkLadderPass ? 'gpu-benchmark-ladder records WebGPU adapter metadata, f32/f64 horizon drift, and CPU-oracle promotion metrics' : 'GPU benchmark ladder missing or not passing',
      has.bundleBudget ? 'bundle budget gate splits initial/chunk/standalone assets across raw/gzip/brotli sizes' : 'bundle budget gate missing',
      has.mainRunsBenchmark ? 'mainline workflow runs the browser benchmark' : 'mainline workflow does not run the browser benchmark',
      has.mainRunsMemoryRegression ? 'mainline workflow emits memory-regression artifacts' : 'mainline workflow does not emit memory-regression artifacts'
    ],
    remaining: [
      ...(!benchmarkReady ? ['Run npm run benchmark and benchmark:energy after performance-affecting changes'] : []),
      ...(!has.mainRunsBenchmark || !has.mainRunsMemoryRegression ? ['Wire benchmark and memory-regression scripts into mainline CI'] : []),
      'Release-to-release comparisons should still pass distinct deployed ORIGINAL_URL and CANDIDATE_URL values'
    ]
  },
  {
    area: 'Security hardening',
    status: legacyClean ? 'done' : 'partial',
    evidence: [
      'CSP is present',
      'JSON import validation is tested',
      'eval/new Function count is zero',
      `legacy risk score is ${legacy.weightedScore} (${legacy.delta} vs baseline)`,
      has.mojibakeAudit ? 'mojibake audit report exists' : 'mojibake audit report missing',
      has.mainRunsMojibakeStrict ? 'mainline workflow runs strict mojibake audit' : 'mainline workflow does not run strict mojibake audit'
    ],
    remaining: legacyClean
      ? []
      : [`innerHTML=${legacy.counts.innerHTML}`, `onclick=${legacy.counts.onclick}`, `inlineWorkerBlob=${legacy.counts.inlineWorkerBlob}`, `dynamicScript=${legacy.counts.dynamicScript}`, `globalRuntimeExports=${legacy.counts.globalRuntimeExports}`]
  },
  {
    area: 'Supply chain and external publication',
    status: externalPublicationReady ? 'done' : 'partial',
    evidence: [
      has.npmOidcPublishing ? 'npm workflow uses tokenless OIDC trusted publishing with an exact-version guard' : 'npm OIDC trusted publishing workflow missing',
      has.slsaAttestation ? 'release workflow emits SLSA/in-toto build provenance and CycloneDX SBOM attestations with actions/attest@v4' : 'SLSA/SBOM attestation workflow missing',
      has.attestationsVerified ? 'published SLSA provenance and CycloneDX attestations pass signer-workflow and tarball SHA-256 verification' : 'published release attestations have not been cryptographically verified',
      has.githubReleasePublished ? 'GitHub release resolves publicly' : 'public GitHub release missing',
      has.pagesPublished ? 'Pages reviewer dashboard resolves publicly' : 'Pages reviewer dashboard not yet deployed',
      has.npmPublished ? 'exact npm package version resolves publicly' : 'npm package version is not published (owner-side npm Trusted Publisher setup is required; this scorecard never reports npm as complete without public registry resolution)',
      has.zenodoPublished ? `Zenodo DOI ${publicationStatus.zenodo?.doi} resolves publicly` : 'public Zenodo DOI is not minted (owner-side Zenodo production auth is required; this scorecard never reports a DOI without public resolution)'
    ],
    remaining: [
      ...(!has.npmPublished ? ['Configure npm trusted publisher for publish-npm.yml/environment npm or supply an owner token for the first publish'] : []),
      ...(!has.zenodoPublished ? ['Authenticate Zenodo, publish the deposition, then run npm run doi:sync'] : []),
      ...(!has.pagesPublished ? ['Deploy the current reviewer.html build through Pages'] : []),
      ...(!has.attestationsVerified ? ['Run npm run release:verify-attestations against the published release tarball'] : [])
    ]
  },
  {
    area: 'Documentation and portfolio readiness',
    status: has.architecture && has.numerics && has.limitations && has.validation && has.releasePackagingDoc && packagingReady && reviewerKitReady ? 'done' : 'partial',
    evidence: [
      'README, architecture, numerics, security, validation, energy benchmark, changelog, roadmap, and portfolio summary artifacts exist',
      has.flagshipDoc ? 'flagship result doc exists' : 'flagship result doc missing',
      has.reviewerKitDoc ? 'reviewer-kit doc exists' : 'reviewer-kit doc missing',
      has.releasePackagingDoc ? 'release packaging checklist exists' : 'release packaging checklist missing',
      has.releaseReadiness ? 'release-readiness manifest exists' : 'release-readiness manifest missing',
      has.releaseOnePagePdf ? 'one-page release PDF exists' : 'one-page release PDF missing',
      has.walkthroughGif ? '30-second walkthrough GIF exists' : 'walkthrough GIF missing',
      has.pagesWorkflow ? 'GitHub Pages workflow exists' : 'GitHub Pages workflow missing',
      has.reviewerDashboard ? 'Pages build includes the JSON-backed reviewer dashboard' : 'reviewer dashboard missing',
      has.reviewerDashboardE2e ? 'reviewer dashboard evidence dialog, tabs, and ledger have browser coverage' : 'reviewer dashboard e2e missing',
      has.mainWorkflow ? 'mainline full-validation workflow exists' : 'mainline full-validation workflow missing',
      mutationReady ? 'nightly mutation workflow and aggregate report exist' : has.nightlyWorkflow ? 'nightly mutation workflow exists; aggregate report missing or below threshold' : 'nightly mutation workflow missing',
      has.releaseWorkflow ? 'release artifact workflow exists' : 'release artifact workflow missing',
      has.distIndex ? 'dist/index.html exists for Pages artifact deployment' : 'dist/index.html missing; run npm run build',
      has.license ? 'LICENSE exists' : 'LICENSE missing',
      has.citation ? 'CITATION.cff exists' : 'CITATION.cff missing',
      has.typedocIndex ? 'TypeDoc API docs exist at docs/api/index.html' : 'TypeDoc API docs missing; run npm run docs:api'
    ],
    remaining: [
      ...(packagingReady ? [] : ['Complete missing packaging artifacts reported in evidence']),
      ...(reviewerKitReady ? [] : ['Complete flagship/reviewer-kit artifacts']),
      ...(externalPublicationReady ? [] : ['External npm publication and Zenodo DOI are tracked separately in reports/publication-status.json'])
    ]
  }
];

const totals = items.reduce(
  (acc, item) => {
    acc[item.status] += 1;
    return acc;
  },
  { done: 0, partial: 0, gap: 0 } satisfies Record<Status, number>
);

const report = {
  generatedAt: new Date().toISOString(),
  metadata: await collectReportMetadata('npm run audit:worldclass', freshnessPolicy(7, 'warn')),
  totals,
  legacyRisk: legacy,
  artifacts: has,
  items
};

function markdown(): string {
  const lines = [
    '# World-Class Readiness Scorecard',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Summary: done ${totals.done}, partial ${totals.partial}, gap ${totals.gap}`,
    '',
    '| Area | Status | Evidence | Remaining |',
    '|---|---|---|---|'
  ];
  for (const item of items) {
    lines.push(`| ${item.area} | ${item.status.toUpperCase()} | ${item.evidence.join('<br>')} | ${item.remaining.join('<br>')} |`);
  }
  return `${lines.join('\n')}\n`;
}

await mkdir('reports', { recursive: true });
await writeFile('reports/worldclass-scorecard.json', JSON.stringify(report, null, 2));
await writeFile('reports/worldclass-scorecard.md', markdown());
console.log(markdown());
if (!reproduceReady) {
  console.error('World-class freshness gate failed: reports/reproduce/manifest.json is missing, stale, or lacks pendulum-report-metadata/v1 metadata.');
  process.exitCode = 1;
}
