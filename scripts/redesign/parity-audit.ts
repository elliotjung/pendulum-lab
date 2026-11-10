/** S28 preservation ledger and source-bound unit/build/browser facet validation. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, allDefinitions } from '../../src/product/catalog';
import { buildInventory, type Inventory, type InventoryItem } from './inventory';
import { validateBaselineCoverage } from './catalog-coverage';
import {
  captureSourceTree,
  digestFingerprint,
  evidenceHash,
  evidencePath,
  type EvidenceDigest
} from './parity-capture';
import {
  validateParityCertificates,
  type ParityCertificateBundle,
  type ParityCertificatePolicy,
  type ParityCaseEvidence,
  type ParityCertificateResult
} from './parity-certificate';
import { readPreservationLedger, locationOnlyObservation, type PreservationLedgerResult } from './parity-preservation';

export const S01_INVENTORY_SHA256 = 'e98d3b4187e4aba8e8296df9a02f8ca84864d101e3a2b535136f5fb2acf45068';
export const PARITY_MATRIX_PATH = 'documents/redesign/parity/S28-matrix.json';
export const PARITY_CERTIFICATES_PATH = 'documents/redesign/parity/S28-certificates.json';
export const PARITY_POLICY_PATH = 'documents/redesign/parity/S28-certificate-policy.json';
const baselinePath = 'documents/redesign/baseline/inventory.json';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalized = (value: string) => value.replaceAll('\r\n', '\n');
const definitions = allDefinitions(catalog);
const computed = new WeakSet<object>();
function freezeData(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  Object.freeze(value);
  for (const child of Object.values(value)) freezeData(child, seen);
}

interface SourceReference {
  path: string;
  line: number;
}
interface FileRow {
  path: string;
  baselineSha256: string;
  currentProjectedSha256: string | null;
  /** Exact legacy projection identity, never an exception or semantic-equivalence claim. */
  preserved: boolean;
  futureStage: number | null;
  exceptionId: string | null;
  exceptionCovered: boolean;
}
interface TraceRow {
  id: string;
  category: string;
  legacy: SourceReference;
  preserved: boolean;
  semanticCapability: string | null;
  catalogId: string | null;
  executableRowId: string | null;
  futureStage: number | null;
  locationOnlyChange: boolean;
  exceptionId: string | null;
  exceptionCovered: boolean;
}
interface ExecutableRow {
  id: string;
  catalogId: string | null;
  candidateRoute: string | null;
  status: 'verified' | 'unverified';
  /** These are actual case bindings, not a catalog/test-filename checklist. */
  requiredEvidence: {
    newUiAction: readonly ParityCaseEvidence[];
    resultComparison: readonly ParityCaseEvidence[];
    migrationOrRoundTrip: readonly ParityCaseEvidence[];
    testResults: readonly ParityCaseEvidence[];
    exportArtifact: readonly ParityCaseEvidence[];
  };
}
export interface ParityAudit {
  schemaVersion: 'pendulum-parity-audit/v1';
  scope: string;
  baseline: { inventorySha256: string; sourceDigest: string; frozenSha256: string };
  sourceFingerprint: string;
  sources: readonly EvidenceDigest[];
  integrityErrors: string[];
  preservation: PreservationLedgerResult;
  addedObservations: readonly { item: InventoryItem; exceptionId: string | null; exceptionCovered: boolean }[];
  certification: {
    mode: 'live-source-build-report-validation';
    certificatePath: string;
    policyPath: string;
    /** Retained historical inputs remain distinct from current live replay validity. */
    historicalInputs: {
      certificate: EvidenceDigest | null;
      policy: EvidenceDigest | null;
      captures: readonly ({ readonly id: string } & EvidenceDigest)[];
    };
    result: ParityCertificateResult;
    replayNote: string;
  };
  summary: {
    baselineFiles: number;
    preservedFiles: number;
    exceptionCoveredFiles: number;
    preservationCoveredFiles: number;
    baselineCapabilities: number;
    preservedCapabilities: number;
    exceptionCoveredCapabilities: number;
    preservationCoveredCapabilities: number;
    baselineFacts: number;
    preservedFacts: number;
    exceptionCoveredFacts: number;
    preservationCoveredFacts: number;
    addedObservations: number;
    verifiedAddedObservations: number;
    executableRows: number;
    verifiedExecutableRows: number;
    knownGapRows: number;
    unverifiedRows: number;
    parityPercent: number;
    cutoverAllowed: boolean;
  };
  files: FileRow[];
  capabilities: TraceRow[];
  facts: TraceRow[];
  executable: ExecutableRow[];
  /** Source-level absence is not inferred from a renamed legacy UI function. */
  gaps: readonly never[];
}
function sourceFiles(root: string): readonly EvidenceDigest[] {
  return captureSourceTree(root, [
    'src',
    'css',
    'public',
    'config',
    'data',
    'content',
    'scripts',
    'tests',
    'e2e',
    'next.html',
    'app.html',
    'reviewer.html',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json'
  ]);
}
function readCertification(root: string, rowIds: readonly string[], inventorySha256: string) {
  const certificate = evidencePath(root, PARITY_CERTIFICATES_PATH),
    policyFile = evidencePath(root, PARITY_POLICY_PATH);
  let bundle: ParityCertificateBundle | null = null,
    policy: ParityCertificatePolicy | null = null;
  let certificateDigest: EvidenceDigest | null = null,
    policyDigest: EvidenceDigest | null = null;
  const errors: string[] = [];
  try {
    if (!existsSync(certificate) || !existsSync(policyFile))
      throw new Error('Final certificate bundle/policy is missing; no execution facets are certified.');
    const bytes = readFileSync(certificate),
      policyBytes = readFileSync(policyFile);
    certificateDigest = { path: PARITY_CERTIFICATES_PATH, sha256: evidenceHash(bytes) };
    policyDigest = { path: PARITY_POLICY_PATH, sha256: evidenceHash(policyBytes) };
    bundle = JSON.parse(bytes.toString('utf8')) as ParityCertificateBundle;
    policy = JSON.parse(policyBytes.toString('utf8')) as ParityCertificatePolicy;
    if (
      !policy ||
      policy.inventorySha256 !== inventorySha256 ||
      !Array.isArray(policy.rowIds) ||
      JSON.stringify([...policy.rowIds].sort()) !== JSON.stringify([...rowIds].sort())
    )
      throw new Error('Certificate policy must cover the exact frozen134 baseline row IDs and inventory SHA-256.');
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : 'Malformed certificate inputs.');
  }
  const result: ParityCertificateResult =
    !errors.length && bundle && policy
      ? validateParityCertificates(root, bundle, policy)
      : { valid: false, verifiedIds: [], missingIds: rowIds, errors };
  return { bundle, certificateDigest, policyDigest, result };
}
export function buildParityAudit(
  root: string,
  baseline: Inventory,
  current: Inventory,
  inventoryText: string
): ParityAudit {
  const sources = sourceFiles(root),
    inventorySha256 = hash(normalized(inventoryText));
  const preservation = readPreservationLedger(root, baseline);
  const integrityErrors = [
    ...current.errors,
    ...validateBaselineCoverage(catalog, baseline),
    ...preservation.errors,
    ...(inventorySha256 === S01_INVENTORY_SHA256 ? [] : ['Frozen S01 inventory SHA-256 mismatch']),
    ...(baseline.files.length === 883 && baseline.capabilities.length === 118 && baseline.facts.length === 6825
      ? []
      : ['Frozen S01 inventory counts changed'])
  ];
  const currentFiles = new Map(current.files.map((item) => [item.ownerFile, item]));
  const files = baseline.files.map((item): FileRow => {
    const exception = preservation.entries.find((entry) => entry.path === item.ownerFile);
    return {
      path: item.ownerFile,
      baselineSha256: item.sha256,
      currentProjectedSha256: currentFiles.get(item.ownerFile)?.sha256 ?? null,
      preserved: item.sha256 === currentFiles.get(item.ownerFile)?.sha256,
      futureStage: item.futureStage,
      exceptionId: exception?.id ?? null,
      exceptionCovered: exception?.status === 'verified'
    };
  });
  const extraFiles = current.files.filter(
    (item) => !baseline.files.some((original) => original.ownerFile === item.ownerFile)
  );
  if (extraFiles.length)
    integrityErrors.push('Unexpected legacy source files: ' + extraFiles.map((item) => item.ownerFile).join(', '));
  const executableIds = [
    ...new Set(
      [...baseline.capabilities, ...baseline.facts.filter((item) => item.category === 'integrator')].map(
        (item) => item.id
      )
    )
  ].sort();
  const catalogFor = (id: string) => definitions.find((definition) => definition.baselineIds.includes(id));
  const addedObservations: { item: InventoryItem; exceptionId: string | null; exceptionCovered: boolean }[] = [];
  function trace(items: InventoryItem[], actual: InventoryItem[]): TraceRow[] {
    const byId = new Map(actual.map((item) => [item.id, item])),
      baselineIds = new Set(items.map((item) => item.id));
    for (const item of actual.filter((item) => !baselineIds.has(item.id))) {
      const exception = preservation.entries.find(
        (entry) => entry.path === item.ownerFile && entry.addedFactIds.includes(item.id)
      );
      addedObservations.push({
        item,
        exceptionId: exception?.id ?? null,
        exceptionCovered: exception?.status === 'verified'
      });
      if (!exception) integrityErrors.push('Unexpected legacy observation: ' + item.id);
    }
    return items.map((item) => {
      const value = byId.get(item.id),
        preserved = JSON.stringify(item) === JSON.stringify(value);
      const locationOnlyChange = !preserved && locationOnlyObservation(item, value);
      const exception = preservation.entries.find(
        (entry) => entry.path === item.ownerFile && entry.locationOnlyFactIds.includes(item.id)
      );
      return {
        id: item.id,
        category: item.category,
        legacy: { path: item.ownerFile, line: item.line },
        preserved,
        locationOnlyChange,
        exceptionId: exception?.id ?? null,
        exceptionCovered: locationOnlyChange && exception?.status === 'verified',
        semanticCapability: item.semanticCapability ?? null,
        catalogId:
          catalogFor(item.id)?.id ??
          (item.semanticCapability ? (catalogFor(item.semanticCapability)?.id ?? null) : null),
        executableRowId: executableIds.includes(item.id) ? item.id : (item.semanticCapability ?? null),
        futureStage: item.futureStage
      };
    });
  }
  const capabilities = trace(baseline.capabilities, current.capabilities),
    facts = trace(baseline.facts, current.facts);
  const certification = readCertification(root, executableIds, inventorySha256),
    verified = new Set(certification.result.verifiedIds);
  const executable = executableIds.map((id): ExecutableRow => {
    const evidence = (Array.isArray(certification.bundle?.rows) ? certification.bundle.rows : []).find(
      (row) => row && row.id === id
    )?.evidence;
    const checked = verified.has(id) && Array.isArray(evidence) ? evidence : [];
    return {
      id,
      catalogId: catalogFor(id)?.id ?? null,
      candidateRoute: id.startsWith('system:') ? './next.html#/lab/' + id.slice(7) : null,
      status: verified.has(id) ? 'verified' : 'unverified',
      requiredEvidence: {
        newUiAction: checked.filter((item) => item.facet === 'ui'),
        resultComparison: checked.filter((item) => item.facet === 'comparison'),
        migrationOrRoundTrip: checked.filter((item) => item.facet === 'roundtrip'),
        testResults: checked,
        exportArtifact: checked.filter((item) => item.facet === 'export')
      }
    };
  });
  const summary = {
    baselineFiles: files.length,
    preservedFiles: files.filter((row) => row.preserved).length,
    exceptionCoveredFiles: files.filter((row) => !row.preserved && row.exceptionCovered).length,
    preservationCoveredFiles: files.filter((row) => row.preserved || row.exceptionCovered).length,
    baselineCapabilities: capabilities.length,
    preservedCapabilities: capabilities.filter((row) => row.preserved).length,
    exceptionCoveredCapabilities: capabilities.filter((row) => !row.preserved && row.exceptionCovered).length,
    preservationCoveredCapabilities: capabilities.filter((row) => row.preserved || row.exceptionCovered).length,
    baselineFacts: facts.length,
    preservedFacts: facts.filter((row) => row.preserved).length,
    exceptionCoveredFacts: facts.filter((row) => !row.preserved && row.exceptionCovered).length,
    preservationCoveredFacts: facts.filter((row) => row.preserved || row.exceptionCovered).length,
    addedObservations: addedObservations.length,
    verifiedAddedObservations: addedObservations.filter((row) => row.exceptionCovered).length,
    executableRows: executable.length,
    verifiedExecutableRows: executable.filter((row) => row.status === 'verified').length,
    knownGapRows: 0,
    unverifiedRows: executable.filter((row) => row.status === 'unverified').length,
    parityPercent: Number(((100 * verified.size) / Math.max(1, executable.length)).toFixed(6)),
    cutoverAllowed: false
  };
  const covered =
    summary.preservationCoveredFiles === summary.baselineFiles &&
    summary.preservationCoveredCapabilities === summary.baselineCapabilities &&
    summary.preservationCoveredFacts === summary.baselineFacts &&
    summary.verifiedAddedObservations === summary.addedObservations;
  summary.cutoverAllowed =
    !integrityErrors.length &&
    covered &&
    certification.result.valid &&
    summary.verifiedExecutableRows === summary.executableRows;
  const audit: ParityAudit = {
    schemaVersion: 'pendulum-parity-audit/v1',
    scope:
      'Frozen S01 identities, explicit tested S28 exceptions, and actual source-bound unit/build/browser facets are separate. Catalog registration and declarations never grant execution certification.',
    baseline: { inventorySha256, sourceDigest: baseline.sourceDigest, frozenSha256: S01_INVENTORY_SHA256 },
    sourceFingerprint: digestFingerprint(sources),
    sources,
    integrityErrors: [...new Set(integrityErrors)].sort(),
    preservation,
    addedObservations,
    certification: {
      mode: 'live-source-build-report-validation',
      certificatePath: PARITY_CERTIFICATES_PATH,
      policyPath: PARITY_POLICY_PATH,
      historicalInputs: {
        certificate: certification.certificateDigest,
        policy: certification.policyDigest,
        captures: Array.isArray(certification.bundle?.captures) ? certification.bundle.captures : []
      },
      result: certification.result,
      replayNote:
        'Pinned captured inputs are historical provenance. Live --certify also requires unchanged current sources and every retained tmp production-build byte. A fresh clone must rebuild/replay the recorded build or explicitly report live replay unavailable; archived hashes alone never certify the current checkout.'
    },
    summary,
    files,
    capabilities,
    facts,
    executable,
    gaps: []
  };
  freezeData(audit);
  computed.add(audit);
  return audit;
}
export function serializeParityAudit(audit: ParityAudit): string {
  return (
    '{\n' +
    Object.entries(audit)
      .map(
        ([key, value]) =>
          '  ' +
          JSON.stringify(key) +
          ': ' +
          (Array.isArray(value)
            ? '[\n' + value.map((row) => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]'
            : JSON.stringify(value))
      )
      .join(',\n') +
    '\n}\n'
  );
}
export function validateParityAudit(value: unknown, expected: ParityAudit): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Parity audit must be an object'];
  const actual = value as Record<string, unknown>,
    errors: string[] = [];
  for (const key of Object.keys(actual)) if (!Object.hasOwn(expected, key)) errors.push('Unknown audit field: ' + key);
  for (const [key, rows] of Object.entries(expected)) {
    if (Array.isArray(rows)) {
      const candidates = actual[key];
      if (!Array.isArray(candidates)) {
        errors.push('Missing audit rows: ' + key);
        continue;
      }
      const ids = candidates.map((row: unknown) =>
        row && typeof row === 'object'
          ? ((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).path ?? JSON.stringify(row))
          : null
      );
      if (new Set(ids).size !== ids.length) errors.push('Duplicate audit rows: ' + key);
      if (JSON.stringify(candidates) !== JSON.stringify(rows))
        errors.push('Stale, missing, invented or changed audit rows: ' + key);
    } else if (JSON.stringify(actual[key]) !== JSON.stringify(rows))
      errors.push('Stale or changed audit field: ' + key);
  }
  return errors;
}
/** Serialized status edits cannot confer trust; CLI certification always uses a freshly recomputed audit. */
export function certificationErrors(audit: ParityAudit): string[] {
  const errors = [...audit.integrityErrors, ...audit.preservation.errors, ...audit.certification.result.errors];
  if (
    audit.files.some((row) => !row.preserved && !row.exceptionCovered) ||
    audit.capabilities.some((row) => !row.preserved && !row.exceptionCovered) ||
    audit.facts.some((row) => !row.preserved && !row.exceptionCovered) ||
    audit.addedObservations.some((row) => !row.exceptionCovered)
  )
    errors.push(
      'Legacy source or observation preservation is incomplete; byte drift and unverified exceptions remain visible'
    );
  const unverified = audit.executable.filter((row) => row.status === 'unverified').length;
  if (unverified) errors.push('Executable parity has ' + unverified + ' rows without complete runtime evidence');
  if (
    !computed.has(audit) &&
    (audit.executable.some((row) => row.status !== 'unverified') ||
      audit.summary.verifiedExecutableRows ||
      audit.summary.parityPercent ||
      audit.summary.cutoverAllowed)
  )
    errors.push('Unsupported executable pass claim: certification requires a freshly validated source-bound audit');
  if (
    audit.executable.some((row) => !['verified', 'unverified'].includes(row.status)) ||
    audit.summary.verifiedExecutableRows !== audit.executable.filter((row) => row.status === 'verified').length ||
    audit.summary.parityPercent !==
      Number(((100 * audit.summary.verifiedExecutableRows) / Math.max(1, audit.executable.length)).toFixed(6)) ||
    (audit.summary.cutoverAllowed && (!audit.certification.result.valid || unverified))
  )
    errors.push('Unsupported cutover/parity claim');
  if (!audit.summary.cutoverAllowed)
    errors.push('S29 cutover is blocked; final live replay certification is incomplete');
  return [...new Set(errors)];
}
export function readParityAudit(root: string): ParityAudit {
  const inventoryText = readFileSync(path.join(root, baselinePath), 'utf8');
  return buildParityAudit(root, JSON.parse(inventoryText) as Inventory, buildInventory(root), inventoryText);
}
function main() {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => !['--write', '--check', '--certify'].includes(arg)) ||
    args.filter((arg) => arg === '--write').length > 1 ||
    (args.includes('--write') && (args.includes('--check') || args.includes('--certify')))
  )
    throw new Error('Use --write, --check, or --check --certify. Default is read-only.');
  const root = process.cwd(),
    audit = readParityAudit(root),
    target = path.join(root, PARITY_MATRIX_PATH),
    errors = [...audit.integrityErrors];
  if (args.includes('--write')) {
    if (errors.length) throw new Error(errors.join('\n'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, serializeParityAudit(audit));
  } else if (args.includes('--check') || args.includes('--certify')) {
    if (!existsSync(target)) errors.push('Parity matrix is missing; generate it with --write');
    else errors.push(...validateParityAudit(JSON.parse(readFileSync(target, 'utf8')), audit));
  }
  if (args.includes('--certify')) errors.push(...certificationErrors(audit));
  console.log(
    'S28 parity audit: ' +
      audit.summary.preservedFiles +
      '/' +
      audit.summary.baselineFiles +
      ' exact projected file identities; ' +
      audit.summary.exceptionCoveredFiles +
      ' separately tested changed files; ' +
      audit.summary.verifiedExecutableRows +
      '/' +
      audit.summary.executableRows +
      ' source-bound executable rows. Live cutover ' +
      (audit.summary.cutoverAllowed ? 'eligible (human review still separate).' : 'blocked.')
  );
  if (errors.length) {
    console.error([...new Set(errors)].join('\n'));
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
