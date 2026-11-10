/** Validates source-bound local execution evidence. It does not infer scientific claims from catalog entries. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  evidenceHash,
  evidencePath,
  sourceHash,
  digestFingerprint,
  captureBuildTree,
  type EvidenceDigest,
  type ParityExecutionCapture
} from './parity-capture';
import { parseRunnerReport, runnerCaseKey, type RunnerCase, type RunnerReport } from './parity-runner-report';

export type ParityFacet = 'ui' | 'comparison' | 'roundtrip' | 'export';
export interface ParityCaseEvidence {
  readonly facet: ParityFacet;
  readonly captureId: string;
  readonly file: string;
  readonly title: string;
  readonly project: string | null;
  readonly sourcePaths: readonly string[];
  /** The concrete assertion a reviewer must find in this exact test, not a generic pass label. */
  readonly assertion: string;
  readonly route?: string;
  readonly comparison?: {
    readonly reference: 'preserved-native' | 'preserved-contract';
    readonly quantity: string;
    readonly absoluteTolerance: number | null;
    readonly relativeTolerance: number | null;
  };
  readonly roundtripSchema?: string;
  /** A passed export/read assertion differs from retaining portable output bytes. */
  readonly exported?: {
    readonly schemaOrMime: string;
    readonly assertionOnly: boolean;
    readonly retained?: EvidenceDigest;
    /** Explicit bridge to exact executed bytes embedded by Playwright's reporter. */
    readonly embeddedAttachmentName?: string;
  };
  /** Only a reviewed capability-specific policy can allow a control with no original export. */
  readonly exportNotApplicable?: { readonly reason: string };
}
export interface ParityCertificateBundle {
  readonly schema: 'pendulum-parity-certificates/v1';
  readonly inventorySha256: string;
  readonly captures: readonly ({ readonly id: string } & EvidenceDigest)[];
  readonly rows: readonly { readonly id: string; readonly evidence: readonly ParityCaseEvidence[] }[];
}
export interface ParityCertificatePolicy {
  readonly inventorySha256: string;
  readonly rowIds: readonly string[];
  /** Reviewed runtime/dependency paths required for a row. Filenames alone never produce a pass. */
  readonly requiredSources: Readonly<Record<string, readonly string[]>>;
  /** Reviewed closures are stored once; every selected case still checks all resolved source hashes. */
  readonly sharedSources?: readonly string[];
  readonly sourceGroups?: Readonly<Record<string, readonly string[]>>;
  readonly rowSourceGroups?: Readonly<Record<string, readonly string[]>>;
  readonly exportNotApplicable?: Readonly<Record<string, string>>;
}
export interface ParityCertificateResult {
  readonly valid: boolean;
  readonly verifiedIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly errors: readonly string[];
}
const SHA = /^[a-f0-9]{64}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function checkDigests(input: readonly EvidenceDigest[], label: string, errors: string[]) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.some((digest) => !digest || typeof digest.path !== 'string' || !SHA.test(digest.sha256))
  ) {
    errors.push(`${label}: empty or malformed digest list.`);
    return;
  }
  if (new Set(input.map((digest) => digest.path)).size !== input.length)
    errors.push(`${label}: duplicate source/artifact paths.`);
  if (
    !same(
      input.map((digest) => digest.path),
      input.map((digest) => digest.path).sort()
    )
  )
    errors.push(`${label}: digest paths must be sorted.`);
}
interface LoadedCapture {
  capture: ParityExecutionCapture;
  report: RunnerReport;
  build: ParityExecutionCapture | null;
}

/** Exact reports and source hashes are checked afresh; unsupported/missing facets stay unverified. */
export function validateParityCertificates(
  root: string,
  input: unknown,
  policy: ParityCertificatePolicy
): ParityCertificateResult {
  const errors: string[] = [],
    verifiedIds: string[] = [];
  const expected = new Set(policy.rowIds);
  const currentHashes = new Map<string, string>();
  const currentHash = (source: string) => {
    if (!currentHashes.has(source)) currentHashes.set(source, sourceHash(root, source));
    return currentHashes.get(source)!;
  };
  const sourceMaps = new WeakMap<object, Map<string, string>>();
  const capturedHash = (capture: ParityExecutionCapture, source: string) => {
    if (!sourceMaps.has(capture))
      sourceMaps.set(capture, new Map(capture.sources.map((item) => [item.path, item.sha256])));
    return sourceMaps.get(capture)!.get(source);
  };
  if (
    !expected.size ||
    expected.size !== policy.rowIds.length ||
    policy.rowIds.some((id) => typeof id !== 'string' || !id.length)
  )
    throw new Error('Certificate policy needs unique nonempty baseline row IDs.');
  const sourceList = (value: unknown): value is readonly string[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((source) => typeof source === 'string' && source.length > 0) &&
    new Set(value).size === value.length;
  if (policy.sharedSources !== undefined && !sourceList(policy.sharedSources))
    errors.push('Malformed reviewed shared source closure.');
  if (
    policy.sourceGroups !== undefined &&
    (!record(policy.sourceGroups) || Object.values(policy.sourceGroups).some((sources) => !sourceList(sources)))
  )
    errors.push('Malformed reviewed source groups.');
  if (
    policy.rowSourceGroups !== undefined &&
    (!record(policy.rowSourceGroups) ||
      Object.entries(policy.rowSourceGroups).some(
        ([id, groups]) =>
          !expected.has(id) ||
          !sourceList(groups) ||
          groups.some((group) => !policy.sourceGroups || !Object.hasOwn(policy.sourceGroups, group))
      ))
  )
    errors.push('Unknown row or source group in reviewed closure policy.');
  if ((policy.sourceGroups === undefined) !== (policy.rowSourceGroups === undefined))
    errors.push('Source groups and row assignments must be reviewed together.');
  if (
    policy.sourceGroups &&
    policy.rowSourceGroups &&
    policy.rowIds.some((id) => !sourceList(policy.rowSourceGroups?.[id]))
  )
    errors.push('Every baseline row needs an explicit reviewed source-group assignment.');
  if (errors.length) return { valid: false, verifiedIds, missingIds: policy.rowIds, errors };
  if (
    !record(input) ||
    input.schema !== 'pendulum-parity-certificates/v1' ||
    !Array.isArray(input.captures) ||
    !Array.isArray(input.rows)
  )
    return {
      valid: false,
      verifiedIds,
      missingIds: policy.rowIds,
      errors: ['Unsupported or empty certificate bundle.']
    };
  const bundle = input as unknown as ParityCertificateBundle;
  if (
    bundle.rows.some((row) => !record(row) || typeof row.id !== 'string') ||
    bundle.captures.some(
      (reference) => !record(reference) || typeof reference.id !== 'string' || typeof reference.path !== 'string'
    )
  )
    return {
      valid: false,
      verifiedIds,
      missingIds: policy.rowIds,
      errors: ['Malformed certificate row or execution capture reference.']
    };
  if (bundle.inventorySha256 !== policy.inventorySha256 || !SHA.test(bundle.inventorySha256))
    errors.push('Frozen S01 inventory digest differs from certificate policy.');
  if (new Set(bundle.rows.map((row) => row.id)).size !== bundle.rows.length)
    errors.push('Duplicate certificate row IDs.');
  if (bundle.rows.some((row) => !expected.has(row.id))) errors.push('Certificate contains unknown row IDs.');
  if (new Set(bundle.captures.map((capture) => capture.id)).size !== bundle.captures.length)
    errors.push('Duplicate execution capture IDs.');
  const loaded = new Map<string, LoadedCapture>();
  for (const reference of bundle.captures) {
    const prefix = `Capture ${reference.id}`;
    try {
      const beforeErrors = errors.length;
      if (!reference.id || !SHA.test(reference.sha256)) throw new Error('Missing capture ID/hash.');
      const bytes = readFileSync(evidencePath(root, reference.path));
      if (evidenceHash(bytes) !== reference.sha256) throw new Error('Capture bytes do not match their pinned SHA-256.');
      const capture = JSON.parse(bytes.toString('utf8')) as ParityExecutionCapture;
      if (
        !capture ||
        capture.schema !== 'pendulum-parity-execution/v1' ||
        !['vitest', 'playwright'].includes(capture.kind) ||
        capture.valid !== true ||
        capture.exitCode !== 0 ||
        !Array.isArray(capture.errors) ||
        capture.errors.length ||
        capture.sourcePolicy !== 'bounded-roots-pre-post/v1' ||
        !Array.isArray(capture.sourceRoots) ||
        !capture.sourceRoots.length ||
        !Array.isArray(capture.command) ||
        capture.command.length < 3 ||
        capture.command.some((value) => typeof value !== 'string') ||
        !capture.report
      )
        throw new Error('Execution is not a successful source-stable test capture.');
      const runner =
        capture.kind === 'vitest' ? 'node_modules/vitest/vitest.mjs' : 'node_modules/@playwright/test/cli.js';
      if (
        capture.command[0] !== process.execPath ||
        capture.command[1] !== path.resolve(root, runner) ||
        capture.command[2] !== (capture.kind === 'vitest' ? 'run' : 'test')
      )
        throw new Error('Capture command is not the actual expected local test runner.');
      checkDigests(capture.sources, `${prefix} sources`, errors);
      if (capture.sourceFingerprint !== digestFingerprint(capture.sources))
        errors.push(`${prefix}: forged source fingerprint.`);
      const started = Date.parse(capture.startedAt),
        finished = Date.parse(capture.finishedAt);
      if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started)
        errors.push(`${prefix}: invalid execution times.`);
      if (!SHA.test(capture.report.sha256)) throw new Error('Missing runner report hash.');
      const reportBytes = readFileSync(evidencePath(root, capture.report.path));
      if (evidenceHash(reportBytes) !== capture.report.sha256) throw new Error('Runner report bytes changed.');
      const report = parseRunnerReport(
        root,
        capture.kind as 'vitest' | 'playwright',
        JSON.parse(reportBytes.toString('utf8')) as unknown
      );
      errors.push(...report.errors.map((message) => `${prefix}: ${message}`));
      if (report.startedAtMs < started - 1000 || report.finishedAtMs > finished + 1000)
        errors.push(`${prefix}: report lies outside the actual captured execution interval.`);
      let build: ParityExecutionCapture | null = null;
      if (capture.kind === 'playwright') {
        if (!capture.buildCapture || !capture.build)
          throw new Error('UI evidence has no frozen production build capture.');
        const buildBytes = readFileSync(evidencePath(root, capture.buildCapture.path));
        if (evidenceHash(buildBytes) !== capture.buildCapture.sha256) throw new Error('Build capture SHA-256 changed.');
        build = JSON.parse(buildBytes.toString('utf8')) as ParityExecutionCapture;
        const command = build.command;
        const knownBuildCommand =
          Array.isArray(command) &&
          command.every((arg) => typeof arg === 'string' && arg.length > 0) &&
          command[0] === process.execPath &&
          ((command[1] === path.resolve(root, 'node_modules/vite/bin/vite.js') &&
            command[2] === 'build' &&
            command[3] === '--outDir' &&
            command[4] === build.build?.root &&
            !command.slice(5).some((arg) => /^--outDir(?:=|$)|^--root(?:=|$)/i.test(arg))) ||
            (command[1] === path.resolve(root, 'node_modules/tsx/dist/cli.mjs') &&
              command[2] === path.resolve(root, 'scripts/redesign/parity-build.ts') &&
              command[3] === '--out-dir' &&
              command[4] === build.build?.root &&
              command[5] === '--' &&
              !command.slice(6).some((arg) => /^--outDir(?:=|$)|^--root(?:=|$)/i.test(arg))));
        if (
          build.schema !== 'pendulum-parity-execution/v1' ||
          build.kind !== 'build' ||
          !build.valid ||
          build.exitCode !== 0 ||
          !Array.isArray(build.errors) ||
          build.errors.length ||
          build.sourcePolicy !== 'bounded-roots-pre-post/v1' ||
          !Array.isArray(build.sourceRoots) ||
          !build.sourceRoots.length ||
          !knownBuildCommand ||
          !build.build ||
          !same(build.build, capture.build)
        )
          throw new Error('UI execution is not bound to the successful exact production build.');
        checkDigests(build.sources, `${prefix} build sources`, errors);
        checkDigests(build.build.files, `${prefix} build outputs`, errors);
        if (
          build.sourceFingerprint !== digestFingerprint(build.sources) ||
          build.build.fingerprint !== digestFingerprint(build.build.files)
        )
          errors.push(`${prefix}: forged build/source fingerprint.`);
        if (!same(captureBuildTree(root, build.build.root), build.build.files))
          errors.push(`${prefix}: retained production build bytes changed.`);
        const buildStarted = Date.parse(build.startedAt),
          buildFinished = Date.parse(build.finishedAt);
        if (
          !Number.isFinite(buildStarted) ||
          !Number.isFinite(buildFinished) ||
          buildFinished < buildStarted ||
          buildFinished > started + 1000
        )
          errors.push(`${prefix}: browser execution predates its production build or build times are invalid.`);
      }
      if (beforeErrors === errors.length) loaded.set(reference.id, { capture, report, build });
    } catch (cause) {
      errors.push(`${prefix}: ${cause instanceof Error ? cause.message : 'Malformed capture.'}`);
    }
  }
  const rowCounts = new Map<string, number>();
  for (const row of bundle.rows) rowCounts.set(row.id, (rowCounts.get(row.id) ?? 0) + 1);
  for (const id of policy.rowIds) {
    const row = bundle.rows.find((candidate) => candidate.id === id),
      initialErrors = errors.length;
    if (!row || rowCounts.get(id) !== 1) {
      errors.push(`Row ${id}: missing or duplicate executable certificate.`);
      continue;
    }
    if (!Array.isArray(row.evidence) || !row.evidence.length) {
      errors.push(`Row ${id}: empty execution evidence.`);
      continue;
    }
    const evidence = row.evidence as readonly ParityCaseEvidence[];
    for (const facet of ['ui', 'comparison', 'roundtrip', 'export'] as const)
      if (!evidence.some((item) => record(item) && item.facet === facet))
        errors.push(`Row ${id}: missing ${facet} evidence.`);
    const identities = new Set<string>();
    for (const item of evidence) {
      if (!record(item)) {
        errors.push(`Row ${id}: malformed case evidence.`);
        continue;
      }
      const label = `Row ${id}/${item.facet}`;
      try {
        if (
          !['ui', 'comparison', 'roundtrip', 'export'].includes(item.facet) ||
          typeof item.assertion !== 'string' ||
          item.assertion.trim().length < 20 ||
          !Array.isArray(item.sourcePaths) ||
          !item.sourcePaths.length ||
          new Set(item.sourcePaths).size !== item.sourcePaths.length
        )
          throw new Error('Missing concrete assertion or unique runtime source paths.');
        const execution = loaded.get(item.captureId);
        if (!execution) throw new Error('Missing or invalid successful source-bound capture.');
        const key = runnerCaseKey(item),
          identity = JSON.stringify([item.facet, item.captureId, key]);
        if (identities.has(identity)) throw new Error('Duplicate exact facet/case binding.');
        identities.add(identity);
        const matchingTests = execution.report.cases.filter((candidate) => runnerCaseKey(candidate) === key);
        const test = matchingTests[0];
        if (matchingTests.length !== 1 || !test || test.status !== 'passed')
          throw new Error('Exact test file/title/project is absent, ambiguous or not passed.');
        if (
          !item.sourcePaths.some(
            (source) => source.startsWith('src/product/') && !source.startsWith('src/product/catalog/')
          )
        )
          throw new Error('Catalog-only or filename-only source evidence cannot certify execution.');
        const required = policy.requiredSources[id];
        if (
          !Array.isArray(required) ||
          !required.length ||
          required.some((source) => !item.sourcePaths.includes(source))
        )
          throw new Error('Reviewed runtime/dependency source policy is missing or incomplete.');
        const grouped = (policy.rowSourceGroups?.[id] ?? []).flatMap((group) => policy.sourceGroups?.[group] ?? []);
        for (const source of new Set([test.file, ...item.sourcePaths, ...(policy.sharedSources ?? []), ...grouped])) {
          const digest = capturedHash(execution.capture, source);
          if (!digest || currentHash(source) !== digest)
            throw new Error(`Stale or uncaptured source/test bytes: ${source}`);
          if (execution.build && !source.startsWith('tests/') && !source.startsWith('e2e/')) {
            const built = capturedHash(execution.build, source);
            if (!built || built !== digest) throw new Error(`Test source and actual compiled source differ: ${source}`);
          }
        }
        if (
          item.facet === 'ui' &&
          (execution.capture.kind !== 'playwright' ||
            typeof item.route !== 'string' ||
            !/^(?:\.\/|\/)?next\.html#\/(?:lab|learn)(?:[/?].*)?$/.test(item.route))
        )
          throw new Error(
            'UI evidence must exercise a canonical new-product route in the captured production browser.'
          );
        if (item.facet === 'comparison') {
          const comparison = item.comparison;
          if (
            !comparison ||
            !['preserved-native', 'preserved-contract'].includes(comparison.reference) ||
            typeof comparison.quantity !== 'string' ||
            comparison.quantity.trim().length < 8 ||
            [comparison.absoluteTolerance, comparison.relativeTolerance].some(
              (value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
            )
          )
            throw new Error('Concrete native/contract comparison and explicit tolerance policy are required.');
        }
        if (item.facet === 'roundtrip' && (typeof item.roundtripSchema !== 'string' || item.roundtripSchema.length < 8))
          throw new Error('Explicit migrated/roundtrip schema is required.');
        if (item.facet === 'export') {
          const exported = item.exported;
          if (item.exportNotApplicable) {
            const reviewed = policy.exportNotApplicable?.[id];
            if (
              exported ||
              typeof reviewed !== 'string' ||
              reviewed.length < 30 ||
              item.exportNotApplicable.reason !== reviewed
            )
              throw new Error(
                'No-export claims require an exact capability-specific reviewed reason and cannot also claim an export.'
              );
            continue;
          }
          if (
            !exported ||
            typeof exported.schemaOrMime !== 'string' ||
            exported.schemaOrMime.length < 8 ||
            typeof exported.assertionOnly !== 'boolean'
          )
            throw new Error('Export must cite an actual read/assertion or retained portable artifact.');
          if (!exported.assertionOnly && !exported.retained)
            throw new Error('Claimed retained export artifact is absent.');
          if (exported.embeddedAttachmentName !== undefined && !exported.retained)
            throw new Error('An embedded attachment bridge requires retained exact bytes.');
          if (exported.retained) {
            const direct = test.attachments.some((attachment) => attachment.path === exported.retained!.path);
            const embedded =
              exported.embeddedAttachmentName === undefined
                ? []
                : test.attachments.filter((attachment) => attachment.name === exported.embeddedAttachmentName);
            if (
              !SHA.test(exported.retained.sha256) ||
              (exported.embeddedAttachmentName !== undefined &&
                (typeof exported.embeddedAttachmentName !== 'string' ||
                  !exported.embeddedAttachmentName.length ||
                  embedded.length !== 1 ||
                  embedded[0]?.embeddedSha256 !== exported.retained.sha256)) ||
              (!direct && embedded.length !== 1) ||
              evidenceHash(readFileSync(evidencePath(root, exported.retained.path))) !== exported.retained.sha256
            )
              throw new Error('Retained export was not attached by this exact test or its bytes changed.');
          }
        }
      } catch (cause) {
        errors.push(`${label}: ${cause instanceof Error ? cause.message : 'Malformed case binding.'}`);
      }
    }
    if (errors.length === initialErrors) verifiedIds.push(id);
  }
  if (bundle.inventorySha256 !== policy.inventorySha256) verifiedIds.length = 0;
  const missingIds = policy.rowIds.filter((id) => !verifiedIds.includes(id));
  return { valid: errors.length === 0 && !missingIds.length, verifiedIds, missingIds, errors };
}

export function readCertificateCaseList(root: string, capture: ParityExecutionCapture): readonly RunnerCase[] {
  if (!capture.report || capture.kind === 'build') throw new Error('A test execution report is required.');
  const bytes = readFileSync(evidencePath(root, capture.report.path));
  if (evidenceHash(bytes) !== capture.report.sha256) throw new Error('Report hash changed.');
  const report = parseRunnerReport(root, capture.kind, JSON.parse(bytes.toString('utf8')) as unknown);
  if (report.errors.length) throw new Error(report.errors.join('\n'));
  return report.cases;
}

export interface PreservationCaseBinding {
  readonly file: string;
  readonly title: string;
  readonly project: null;
  readonly sourcePaths: readonly string[];
  readonly assertion: string;
}
/** Narrow native/default-behavior characterization. It grants no UI or134-row capability certification. */
export function validatePreservationCases(
  root: string,
  reference: EvidenceDigest,
  bindings: readonly PreservationCaseBinding[],
  requiredSources: readonly string[]
): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];
  try {
    if (
      !reference ||
      !SHA.test(reference.sha256) ||
      !Array.isArray(bindings) ||
      !bindings.length ||
      !Array.isArray(requiredSources) ||
      !requiredSources.length
    )
      throw new Error('Missing exact preservation characterization bindings.');
    const bytes = readFileSync(evidencePath(root, reference.path));
    if (evidenceHash(bytes) !== reference.sha256) throw new Error('Preservation capture SHA-256 changed.');
    const capture = JSON.parse(bytes.toString('utf8')) as ParityExecutionCapture;
    if (
      capture.schema !== 'pendulum-parity-execution/v1' ||
      capture.kind !== 'vitest' ||
      capture.valid !== true ||
      capture.exitCode !== 0 ||
      !Array.isArray(capture.errors) ||
      capture.errors.length ||
      capture.sourcePolicy !== 'bounded-roots-pre-post/v1' ||
      !Array.isArray(capture.sourceRoots) ||
      !capture.sourceRoots.length ||
      !Array.isArray(capture.command) ||
      capture.command[0] !== process.execPath ||
      capture.command[1] !== path.resolve(root, 'node_modules/vitest/vitest.mjs') ||
      capture.command[2] !== 'run' ||
      !capture.report
    )
      throw new Error('Preservation evidence requires a real successful source-bound Vitest capture.');
    checkDigests(capture.sources, 'Preservation sources', errors);
    if (digestFingerprint(capture.sources) !== capture.sourceFingerprint)
      throw new Error('Preservation source fingerprint changed.');
    const reportBytes = readFileSync(evidencePath(root, capture.report.path));
    if (!SHA.test(capture.report.sha256) || evidenceHash(reportBytes) !== capture.report.sha256)
      throw new Error('Preservation runner report SHA-256 changed.');
    const report = parseRunnerReport(root, 'vitest', JSON.parse(reportBytes.toString('utf8')));
    errors.push(...report.errors);
    const started = Date.parse(capture.startedAt),
      finished = Date.parse(capture.finishedAt);
    if (
      !Number.isFinite(started) ||
      !Number.isFinite(finished) ||
      finished < started ||
      report.startedAtMs < started - 1000 ||
      report.finishedAtMs > finished + 1000
    )
      throw new Error('Preservation report lies outside its actual execution interval.');
    const identities = new Set<string>();
    for (const binding of bindings) {
      if (
        !binding ||
        binding.project !== null ||
        typeof binding.assertion !== 'string' ||
        binding.assertion.trim().length < 30 ||
        !Array.isArray(binding.sourcePaths) ||
        new Set(binding.sourcePaths).size !== binding.sourcePaths.length ||
        requiredSources.some((source) => !binding.sourcePaths.includes(source))
      )
        throw new Error('Missing concrete preservation assertion or reviewed source closure.');
      const key = runnerCaseKey(binding);
      if (identities.has(key)) throw new Error('Duplicate preservation case identity.');
      identities.add(key);
      const matches = report.cases.filter((test) => runnerCaseKey(test) === key);
      if (matches.length !== 1 || matches[0]!.status !== 'passed')
        throw new Error('Exact preservation test file/title is absent, ambiguous or not passed.');
      for (const source of new Set([binding.file, ...binding.sourcePaths])) {
        const digest = capture.sources.find((entry) => entry.path === source);
        if (!digest || sourceHash(root, source) !== digest.sha256)
          throw new Error(`Stale or uncaptured preservation source/test: ${source}`);
      }
    }
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : 'Malformed preservation evidence.');
  }
  return { valid: errors.length === 0, errors };
}
