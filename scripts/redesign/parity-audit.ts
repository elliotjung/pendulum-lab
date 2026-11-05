/** S28 evidence inventory. Static traceability and preserved source are not executable parity. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, allDefinitions } from '../../src/product/catalog';
import { PLANAR_INTEGRATOR_IDS } from '../../src/product/adapters/physics/planar-schema';
import { buildInventory, type Inventory, type InventoryItem } from './inventory';
import { validateBaselineCoverage } from './catalog-coverage';

export const S01_INVENTORY_SHA256 = 'e98d3b4187e4aba8e8296df9a02f8ca84864d101e3a2b535136f5fb2acf45068';
export const PARITY_MATRIX_PATH = 'documents/redesign/parity/S28-matrix.json';
const baselinePath = 'documents/redesign/baseline/inventory.json';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalized = (value: string) => value.replaceAll('\r\n', '\n');
const definitions = allDefinitions(catalog);

interface SourceDigest {
  path: string;
  sha256: string;
}
interface SourceReference {
  path: string;
  line: number;
}
interface Gap {
  id: string;
  reason: string;
  inspected: SourceReference[];
  absentRuntimeSymbol?: string;
}
interface FileRow {
  path: string;
  baselineSha256: string;
  currentProjectedSha256: string | null;
  preserved: boolean;
  futureStage: number | null;
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
}
interface ExecutableRow {
  id: string;
  catalogId: string | null;
  candidateRoute: string | null;
  status: 'gap' | 'unverified';
  gapIds: string[];
  requiredEvidence: {
    newUiAction: null;
    resultComparison: null;
    migrationOrRoundTrip: null;
    testResults: never[];
    exportArtifact: null;
  };
}
export interface ParityAudit {
  schemaVersion: 'pendulum-parity-audit/v1';
  scope: string;
  baseline: { inventorySha256: string; sourceDigest: string; frozenSha256: string };
  sourceFingerprint: string;
  sources: SourceDigest[];
  integrityErrors: string[];
  summary: {
    baselineFiles: number;
    preservedFiles: number;
    baselineCapabilities: number;
    preservedCapabilities: number;
    baselineFacts: number;
    preservedFacts: number;
    executableRows: number;
    verifiedExecutableRows: 0;
    knownGapRows: number;
    unverifiedRows: number;
    parityPercent: 0;
    cutoverAllowed: false;
  };
  files: FileRow[];
  capabilities: TraceRow[];
  facts: TraceRow[];
  executable: ExecutableRow[];
  gaps: Gap[];
}

function sourceFiles(root: string): SourceDigest[] {
  const output: SourceDigest[] = [];
  function visit(relative: string) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    const entries = readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else output.push({ path: file, sha256: hash(normalized(readFileSync(path.join(root, file), 'utf8'))) });
    }
  }
  visit('src/product');
  visit('css/product');
  for (const file of [
    'next.html',
    'scripts/redesign/parity-audit.ts',
    'scripts/redesign/inventory.ts',
    'scripts/redesign/inventory-map.ts',
    'scripts/redesign/catalog-coverage.ts',
    'tests/product/parity/audit.test.ts'
  ])
    if (existsSync(path.join(root, file)))
      output.push({ path: file, sha256: hash(normalized(readFileSync(path.join(root, file), 'utf8'))) });
  return output.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function reference(root: string, file: string, anchor: string): SourceReference {
  const source = normalized(readFileSync(path.join(root, file), 'utf8'));
  const offset = source.indexOf(anchor);
  if (offset < 0) throw new Error(`Parity audit inspection anchor disappeared: ${file}#${anchor}`);
  return { path: file, line: source.slice(0, offset).split('\n').length };
}

/** Explicitly inspected deficiencies. A missing symbol search is a gap clue, never a proof of parity. */
function inspectGaps(root: string, sources: SourceDigest[]): Gap[] {
  const runtime = sources
    .filter((source) => source.path.startsWith('src/product/') && !source.path.startsWith('src/product/catalog/'))
    .map((source) => normalized(readFileSync(path.join(root, source.path), 'utf8')))
    .join('\n');
  const gaps: Gap[] = [];
  function absent(id: string, symbol: string, reason: string, file: string, anchor: string) {
    if (!runtime.includes(symbol))
      gaps.push({ id, reason, inspected: [reference(root, file, anchor)], absentRuntimeSymbol: symbol });
  }
  absent(
    'analysis:stochastic-resonance',
    'stochasticResonanceCurve',
    'Catalog metadata retains the quartic-SDE resonance curve, but no new-product runtime calls it.',
    'src/product/catalog/analyses-physical.ts',
    "id: 'analysis:stochastic-resonance'"
  );
  absent(
    'control:audio',
    'AudioSonifier',
    'Motion/energy sonification is preserved in the legacy app but has no new-product runtime connection.',
    'src/product/lab/views/core-workspace.ts',
    'actions.append(start, pause, step, reset, cancel)'
  );
  absent(
    'control:forcing-and-feedback',
    'simulateOgyControl',
    'Pyragas is connected; the separately preserved OGY map-control workflow is not connected to the new UI.',
    'src/product/catalog/auxiliary.ts',
    "'forcing-and-feedback'"
  );
  absent(
    'control:search-and-commands',
    'installCommandPalettes',
    'System-library search exists; the legacy command palette has no new-product runtime connection.',
    'src/product/app/shell.ts',
    'navigation.append(learnLink, labLink)'
  );
  absent(
    'control:locale-and-theme',
    'installLocaleSelect',
    'The new shell exposes theme selection, while product views use Korean labels without an equivalent locale selector.',
    'src/product/app/shell.ts',
    "createThemeControl(document, 'product-theme')"
  );
  absent(
    'importer:imu',
    'ImuMotionCaptureController',
    'Sensor CSV import is available; live permission-aware IMU capture has no new-product runtime connection.',
    'src/product/lab/research/observation-settings.ts',
    "['sensor', '센서 CSV']"
  );
  absent(
    'importer:video',
    'VideoMarkerCaptureController',
    'Recorded-video import is available; the legacy live camera capture controller has no new-product runtime connection.',
    'src/product/observations/video.ts',
    'export async function previewRecordedVideo'
  );
  absent(
    'integrator:sde-multiplicative',
    'milsteinStep',
    'The new Langevin adapter only steps additive noise; multiplicative Milstein is catalog metadata without execution.',
    'src/product/adapters/physics/field.ts',
    'eulerMaruyamaStep('
  );
  absent(
    'integrator:sde-matrix',
    'commutativeMilsteinStep',
    'Matrix-noise Milstein/Stratonovich Heun have no new-product execution path.',
    'src/product/adapters/physics/field.ts',
    'eulerMaruyamaStep('
  );
  absent(
    'runtime:gpu',
    'runDoublePendulumEnsemble',
    'WebGPU ensemble acceleration/fallback is catalog metadata without a new-product runtime connection.',
    'src/product/lab/experiments/execute.ts',
    'export'
  );
  absent(
    'runtime:wasm',
    'runDoublePendulumEnsembleWasm',
    'Wasm ensemble acceleration/fallback is catalog metadata without a new-product runtime connection.',
    'src/product/lab/experiments/execute.ts',
    'export'
  );
  absent(
    'runtime:public-globals',
    'publishPublicApi',
    'The product bootstrap does not publish the preserved stable window.PendulumLab namespace or legacy aliases.',
    'src/product/app/application.ts',
    'export function mountApplication'
  );
  gaps.push(
    {
      id: 'control:precision',
      reason:
        'The new quantity parser only accepts SI decimal/scientific input; legacy pi expressions and display-angle units are not equivalent.',
      inspected: [reference(root, 'src/product/design-system/quantity.ts', 'export function parseQuantityInput')]
    },
    {
      id: 'control:run-and-history',
      reason:
        'New core controls run/pause/step/reset and set speed; legacy recording, rewind scrub and recorded playback are not connected.',
      inspected: [
        reference(root, 'src/product/lab/views/core-workspace.ts', 'actions.append(start, pause, step, reset, cancel)')
      ]
    }
  );
  const migration = 'src/product/persistence/legacy-migration.ts';
  const sessionMigration = 'src/product/persistence/legacy-migration-session.ts';
  gaps.push(
    {
      id: 'route:share',
      reason:
        'Legacy share v1-v4 is recognized and backed up, but explicitly returns recovery-required without a canonical experiment. The new canonical share codec does not establish legacy share parity.',
      inspected: [reference(root, migration, "'legacy-share-recovery-required'")]
    },
    {
      id: 'route:tabs',
      reason:
        'Legacy tab/query URLs are explicitly recovery-only. Opening the preserved legacy app is a valid recovery path, but does not preserve those routes in the new UI.',
      inspected: [reference(root, migration, "'legacy-link-recovery-required'")]
    },
    {
      id: 'route:deep-link',
      reason:
        'Legacy numeric-control/query links are explicitly recovery-only and do not apply their validated control values to the new Lab. Source preservation is not deep-link execution parity.',
      inspected: [reference(root, migration, "'legacy-link-recovery-required'")]
    },
    {
      id: 'importer:workspace',
      reason:
        'Legacy workspace payloads are backed up and sent to legacy recovery; the new UI does not execute the preserved atomic workspace import/apply/rollback workflow.',
      inspected: [reference(root, migration, "'legacy-format-recovery-required'")]
    },
    {
      id: 'storage-schema:workspace',
      reason:
        'Legacy research-workbench storage/workspace schemas are recovery-only rather than migrated into equivalent new projects, sessions, experiments and retained results.',
      inspected: [reference(root, migration, "'legacy-format-recovery-required'")]
    },
    {
      id: 'storage-schema:research-db',
      reason:
        'Legacy research database/archive payloads are recovery-only. The new project local ZIP storage has a separate schema and does not establish legacy IndexedDB project/run/artifact migration parity.',
      inspected: [
        reference(root, migration, "'legacy-format-recovery-required'"),
        reference(root, 'src/product/lab/projects/storage.ts', 'export const PROJECT_STORAGE_KEY')
      ]
    },
    {
      id: 'storage-schema:session',
      reason:
        'Versioned session restart migration preserves supported values, but accepts only Euler/RK2/RK4. Legacy sessions using the other registered methods require legacy recovery, so full session parity is incomplete.',
      inspected: [reference(root, sessionMigration, "'unsupported-legacy-integrator'")]
    },
    {
      id: 'importer:saved-run',
      reason:
        'Saved-session import is partially adapted as a bounded restart, restricted to Euler/RK2/RK4. Unsupported legacy integrator identities are correctly retained for recovery, but are not imported into an equivalent new run.',
      inspected: [reference(root, sessionMigration, "'unsupported-legacy-integrator'")]
    }
  );
  for (const method of definitions.filter((entry) => entry.category === 'integrator')) {
    if (!('legacyId' in method) || !method.legacyId || (PLANAR_INTEGRATOR_IDS as readonly string[]).includes(method.id))
      continue;
    gaps.push({
      id: method.baselineIds[0]!,
      reason: `${method.legacyId} is preserved and registered, but is not selectable in the free double/compound Lab. Focused numerical demos do not establish equivalent legacy run/restore semantics.`,
      inspected: [
        reference(root, 'src/product/adapters/physics/planar-schema.ts', 'export const PLANAR_INTEGRATOR_IDS')
      ]
    });
  }
  return gaps.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function buildParityAudit(
  root: string,
  baseline: Inventory,
  current: Inventory,
  inventoryText: string
): ParityAudit {
  const sources = sourceFiles(root);
  const inventorySha256 = hash(normalized(inventoryText));
  const integrityErrors = [
    ...current.errors,
    ...validateBaselineCoverage(catalog, baseline),
    ...(inventorySha256 === S01_INVENTORY_SHA256 ? [] : ['Frozen S01 inventory SHA-256 mismatch']),
    ...(baseline.files.length === 883 && baseline.capabilities.length === 118 && baseline.facts.length === 6825
      ? []
      : ['Frozen S01 inventory counts changed'])
  ];
  const currentFiles = new Map(current.files.map((item) => [item.ownerFile, item]));
  const files = baseline.files.map((item): FileRow => ({
    path: item.ownerFile,
    baselineSha256: item.sha256,
    currentProjectedSha256: currentFiles.get(item.ownerFile)?.sha256 ?? null,
    preserved: item.sha256 === currentFiles.get(item.ownerFile)?.sha256,
    futureStage: item.futureStage
  }));
  const extraFiles = current.files.filter((item) => !baseline.files.some((f) => f.ownerFile === item.ownerFile));
  if (extraFiles.length)
    integrityErrors.push(`Unexpected legacy source files: ${extraFiles.map((item) => item.ownerFile).join(', ')}`);
  const catalogFor = (id: string) => definitions.find((definition) => definition.baselineIds.includes(id));
  const executableIds = new Set(
    [...baseline.capabilities, ...baseline.facts.filter((item) => item.category === 'integrator')].map(
      (item) => item.id
    )
  );
  function trace(items: InventoryItem[], actual: InventoryItem[]): TraceRow[] {
    const byId = new Map(actual.map((item) => [item.id, item]));
    const baselineIds = new Set(items.map((item) => item.id));
    const extras = actual.filter((item) => !baselineIds.has(item.id));
    if (extras.length)
      integrityErrors.push(`Unexpected legacy observations: ${extras.map((item) => item.id).join(', ')}`);
    return items.map((item) => ({
      id: item.id,
      category: item.category,
      legacy: { path: item.ownerFile, line: item.line },
      preserved: JSON.stringify(item) === JSON.stringify(byId.get(item.id)),
      semanticCapability: item.semanticCapability ?? null,
      catalogId:
        catalogFor(item.id)?.id ?? (item.semanticCapability ? (catalogFor(item.semanticCapability)?.id ?? null) : null),
      executableRowId: executableIds.has(item.id) ? item.id : (item.semanticCapability ?? null),
      futureStage: item.futureStage
    }));
  }
  const capabilities = trace(baseline.capabilities, current.capabilities);
  const facts = trace(baseline.facts, current.facts);
  const gaps = inspectGaps(root, sources);
  const executable = [...baseline.capabilities, ...baseline.facts.filter((item) => item.category === 'integrator')]
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map((item): ExecutableRow => ({
      id: item.id,
      catalogId: catalogFor(item.id)?.id ?? null,
      candidateRoute: item.category === 'system' ? `./next.html#/lab/${item.id.slice(7)}` : null,
      status: gaps.some((gap) => gap.id === item.id) ? 'gap' : 'unverified',
      gapIds: gaps.filter((gap) => gap.id === item.id).map((gap) => gap.id),
      requiredEvidence: {
        newUiAction: null,
        resultComparison: null,
        migrationOrRoundTrip: null,
        testResults: [],
        exportArtifact: null
      }
    }));
  return {
    schemaVersion: 'pendulum-parity-audit/v1',
    scope:
      'S01 preservation and S28 executable-parity audit; catalog coverage and source preservation are not runtime certification. No passing execution evidence is asserted by this audit.',
    baseline: { inventorySha256, sourceDigest: baseline.sourceDigest, frozenSha256: S01_INVENTORY_SHA256 },
    sourceFingerprint: hash(sources.map((source) => `${source.path}\0${source.sha256}`).join('\n')),
    sources,
    integrityErrors: [...new Set(integrityErrors)].sort(),
    summary: {
      baselineFiles: files.length,
      preservedFiles: files.filter((item) => item.preserved).length,
      baselineCapabilities: capabilities.length,
      preservedCapabilities: capabilities.filter((item) => item.preserved).length,
      baselineFacts: facts.length,
      preservedFacts: facts.filter((item) => item.preserved).length,
      executableRows: executable.length,
      verifiedExecutableRows: 0,
      knownGapRows: executable.filter((item) => item.status === 'gap').length,
      unverifiedRows: executable.filter((item) => item.status === 'unverified').length,
      parityPercent: 0,
      cutoverAllowed: false
    },
    files,
    capabilities,
    facts,
    executable,
    gaps
  };
}

/** Record-per-line output keeps the exhaustive ledger reviewable without hiding individual inventory rows. */
export function serializeParityAudit(audit: ParityAudit): string {
  return `{\n${Object.entries(audit)
    .map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}: ${
          Array.isArray(value)
            ? `[\n${value.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]`
            : JSON.stringify(value)
        }`
    )
    .join(',\n')}\n}\n`;
}

/** Recompute expected from the frozen input and current sources before trusting a stored manifest. */
export function validateParityAudit(value: unknown, expected: ParityAudit): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Parity audit must be an object'];
  const actual = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(actual)) if (!Object.hasOwn(expected, key)) errors.push(`Unknown audit field: ${key}`);
  for (const [key, rows] of Object.entries(expected)) {
    if (Array.isArray(rows)) {
      const candidates = actual[key];
      if (!Array.isArray(candidates)) {
        errors.push(`Missing audit rows: ${key}`);
        continue;
      }
      const ids = candidates.map((row: unknown) =>
        row && typeof row === 'object'
          ? ((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).path)
          : null
      );
      if (new Set(ids).size !== ids.length) errors.push(`Duplicate audit rows: ${key}`);
      if (JSON.stringify(candidates) !== JSON.stringify(rows))
        errors.push(`Stale, missing, invented or changed audit rows: ${key}`);
    } else if (JSON.stringify(actual[key]) !== JSON.stringify(rows))
      errors.push(`Stale or changed audit field: ${key}`);
  }
  return errors;
}

/** This audit has no runtime attestation format: editing a status or adding a file path cannot grant a pass. */
export function certificationErrors(audit: ParityAudit): string[] {
  const errors = [...audit.integrityErrors];
  if (
    audit.files.some((row) => !row.preserved) ||
    audit.capabilities.some((row) => !row.preserved) ||
    audit.facts.some((row) => !row.preserved)
  )
    errors.push('Legacy source or observation preservation is incomplete');
  const gaps = audit.executable.filter((row) => row.status === 'gap').length;
  const unverified = audit.executable.filter((row) => row.status === 'unverified').length;
  if (gaps) errors.push(`Executable parity has ${gaps} known gap rows`);
  if (unverified) errors.push(`Executable parity has ${unverified} rows without complete runtime evidence`);
  if (audit.executable.some((row) => row.status !== 'gap' && row.status !== 'unverified'))
    errors.push(
      'Unsupported executable pass claim: this audit accepts no catalog-only or manually asserted runtime certification'
    );
  if (
    audit.summary.cutoverAllowed !== false ||
    audit.summary.parityPercent !== 0 ||
    audit.summary.verifiedExecutableRows !== 0
  )
    errors.push('Unsupported cutover/parity claim');
  return errors;
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
    throw new Error('Use --write, --check, or --check --certify. Default execution is read-only.');
  const root = process.cwd();
  const audit = readParityAudit(root);
  const target = path.join(root, PARITY_MATRIX_PATH);
  const errors = [...audit.integrityErrors];
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
    `S28 parity audit: ${audit.summary.preservedFiles}/${audit.summary.baselineFiles} projected files, ${audit.summary.preservedCapabilities}/${audit.summary.baselineCapabilities} capabilities, ${audit.summary.preservedFacts}/${audit.summary.baselineFacts} facts preserved; executable ${audit.summary.knownGapRows} gap/${audit.summary.unverifiedRows} unverified/0 certified. S29 blocked.`
  );
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
