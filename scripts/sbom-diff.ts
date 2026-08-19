import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface CycloneDxComponent {
  type?: string;
  group?: string;
  name?: string;
  version?: string;
  purl?: string;
  'bom-ref'?: string;
}

interface CycloneDxBom {
  components?: CycloneDxComponent[];
}

interface AuditVia {
  source?: number | string;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
  range?: string;
}

interface AuditVulnerability {
  name?: string;
  severity?: string;
  via?: Array<string | AuditVia>;
  range?: string;
  nodes?: string[];
  fixAvailable?: unknown;
}

interface AuditReport {
  vulnerabilities?: Record<string, AuditVulnerability>;
}

type JsonRecord = Record<string, unknown>;

export interface SbomDiffPaths {
  baseSbom: string;
  headSbom: string;
  baseAudit: string;
  headAudit: string;
  output: string;
}

export interface SbomDiffInputProblem {
  label: string;
  path: string;
  reason: string;
}

interface ParsedSbomDiffArgs {
  help: boolean;
  paths: SbomDiffPaths;
  problems: SbomDiffInputProblem[];
}

interface SbomDiffInputs {
  baseSbom: CycloneDxBom;
  headSbom: CycloneDxBom;
  baseAudit: AuditReport;
  headAudit: AuditReport;
}

export class SbomDiffInputError extends Error {
  constructor(readonly problems: SbomDiffInputProblem[]) {
    super('SBOM diff snapshot inputs are missing or invalid.');
    this.name = 'SbomDiffInputError';
  }
}

const DEFAULT_PATHS: SbomDiffPaths = {
  baseSbom: 'reports/sbom-base.cdx.json',
  headSbom: 'reports/sbom-head.cdx.json',
  baseAudit: 'reports/audit-base.json',
  headAudit: 'reports/audit-head.json',
  output: 'reports/sbom-diff.md'
};

const PATH_OPTIONS: Readonly<Record<string, keyof SbomDiffPaths>> = {
  '--base-sbom': 'baseSbom',
  '--head-sbom': 'headSbom',
  '--base-audit': 'baseAudit',
  '--head-audit': 'headAudit',
  '--output': 'output'
};

export interface ComponentChange {
  component: string;
  before: string | null;
  after: string | null;
  kind: 'added' | 'removed' | 'changed';
}

export interface NewVulnerability {
  package: string;
  severity: 'high' | 'critical';
  advisory: string;
  range: string;
  nodes: string[];
  fixAvailable: unknown;
}

function componentKey(component: CycloneDxComponent): string {
  return (
    component.purl?.replace(/@[^@/?#]+(?=[?#]|$)/, '') ??
    [component.type ?? 'library', component.group ?? '', component.name ?? component['bom-ref'] ?? 'unknown'].join(':')
  );
}

function componentLabel(component: CycloneDxComponent): string {
  return (
    component.purl ?? ([component.group, component.name].filter(Boolean).join('/') || component['bom-ref'] || 'unknown')
  );
}

export function diffSboms(base: CycloneDxBom, head: CycloneDxBom): ComponentChange[] {
  const before = new Map((base.components ?? []).map((component) => [componentKey(component), component]));
  const after = new Map((head.components ?? []).map((component) => [componentKey(component), component]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: ComponentChange[] = [];
  for (const key of keys) {
    const oldComponent = before.get(key);
    const newComponent = after.get(key);
    const oldVersion = oldComponent?.version ?? null;
    const newVersion = newComponent?.version ?? null;
    if (!oldComponent && newComponent) {
      changes.push({ component: componentLabel(newComponent), before: null, after: newVersion, kind: 'added' });
    } else if (oldComponent && !newComponent) {
      changes.push({ component: componentLabel(oldComponent), before: oldVersion, after: null, kind: 'removed' });
    } else if (oldComponent && newComponent && oldVersion !== newVersion) {
      changes.push({ component: componentLabel(newComponent), before: oldVersion, after: newVersion, kind: 'changed' });
    }
  }
  return changes;
}

function advisoryFingerprint(packageName: string, vulnerability: AuditVulnerability, via: string | AuditVia): string {
  if (typeof via === 'string') return `${packageName}|${vulnerability.severity}|dependency:${via}`;
  return `${packageName}|${via.source ?? ''}|${via.url ?? ''}|${via.title ?? via.name ?? ''}|${via.severity ?? vulnerability.severity ?? ''}`;
}

function auditFingerprints(report: AuditReport): Set<string> {
  const fingerprints = new Set<string>();
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) fingerprints.add(advisoryFingerprint(packageName, vulnerability, via));
  }
  return fingerprints;
}

export function newHighCriticalVulnerabilities(base: AuditReport, head: AuditReport): NewVulnerability[] {
  const previous = auditFingerprints(base);
  const findings: NewVulnerability[] = [];
  for (const [packageName, vulnerability] of Object.entries(head.vulnerabilities ?? {})) {
    const severity = vulnerability.severity?.toLowerCase();
    if (severity !== 'high' && severity !== 'critical') continue;
    const newAdvisories = (vulnerability.via ?? []).filter(
      (via) => !previous.has(advisoryFingerprint(packageName, vulnerability, via))
    );
    if (newAdvisories.length === 0) continue;
    for (const via of newAdvisories) {
      findings.push({
        package: packageName,
        severity,
        advisory:
          typeof via === 'string'
            ? `dependency:${via}`
            : (via.url ?? via.title ?? via.name ?? `source:${String(via.source ?? 'unknown')}`),
        range: vulnerability.range ?? (typeof via === 'string' ? '' : (via.range ?? '')),
        nodes: [...(vulnerability.nodes ?? [])].sort(),
        fixAvailable: vulnerability.fixAvailable ?? null
      });
    }
  }
  return findings.sort(
    (a, b) =>
      a.package.localeCompare(b.package) || a.severity.localeCompare(b.severity) || a.advisory.localeCompare(b.advisory)
  );
}

function cell(value: unknown): string {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

export function parseSbomDiffArgs(args: readonly string[]): ParsedSbomDiffArgs {
  const paths = { ...DEFAULT_PATHS };
  const problems: SbomDiffInputProblem[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true, paths, problems: [] };

    const key = PATH_OPTIONS[argument ?? ''];
    if (!key) {
      problems.push({
        label: 'command line',
        path: argument ?? '',
        reason: `unknown option or positional argument ${JSON.stringify(argument ?? '')}`
      });
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      problems.push({
        label: 'command line',
        path: argument ?? '',
        reason: 'requires a file path value'
      });
      continue;
    }
    paths[key] = value;
    index += 1;
  }

  return { help: false, paths, problems };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fileErrorReason(error: unknown): string {
  if (error instanceof SyntaxError) return 'contains invalid JSON';
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return 'file does not exist';
  if (code === 'EACCES' || code === 'EPERM') return 'cannot be read because access is denied';
  return `cannot be read (${code ?? String(error)})`;
}

async function readJsonSnapshot(
  label: string,
  path: string
): Promise<{ value?: unknown; problem?: SbomDiffInputProblem }> {
  try {
    return { value: JSON.parse(await readFile(path, 'utf8')) as unknown };
  } catch (error) {
    return { problem: { label, path, reason: fileErrorReason(error) } };
  }
}

function validateSbomSnapshot(label: string, path: string, value: unknown): SbomDiffInputProblem | null {
  if (!isRecord(value) || !Array.isArray(value.components)) {
    return { label, path, reason: 'must be a CycloneDX JSON object with a components array' };
  }
  return null;
}

function auditErrorDetail(value: JsonRecord): string {
  const error = value.error;
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error.summary === 'string') return error.summary;
  return 'npm audit returned an error response';
}

function validateAuditSnapshot(label: string, path: string, value: unknown): SbomDiffInputProblem | null {
  if (!isRecord(value)) {
    return { label, path, reason: 'must be an npm audit JSON object' };
  }
  if ('error' in value) {
    return { label, path, reason: `npm audit did not complete successfully: ${auditErrorDetail(value)}` };
  }
  if (!isRecord(value.vulnerabilities)) {
    return { label, path, reason: 'must contain an npm audit vulnerabilities object' };
  }
  return null;
}

export async function loadSbomDiffInputs(paths: SbomDiffPaths): Promise<SbomDiffInputs> {
  const snapshots = await Promise.all([
    readJsonSnapshot('base SBOM', paths.baseSbom),
    readJsonSnapshot('head SBOM', paths.headSbom),
    readJsonSnapshot('base npm audit', paths.baseAudit),
    readJsonSnapshot('head npm audit', paths.headAudit)
  ]);
  const [baseSbom, headSbom, baseAudit, headAudit] = snapshots;
  const problems = snapshots.flatMap((snapshot) => (snapshot.problem ? [snapshot.problem] : []));

  if (baseSbom?.value !== undefined) {
    const problem = validateSbomSnapshot('base SBOM', paths.baseSbom, baseSbom.value);
    if (problem) problems.push(problem);
  }
  if (headSbom?.value !== undefined) {
    const problem = validateSbomSnapshot('head SBOM', paths.headSbom, headSbom.value);
    if (problem) problems.push(problem);
  }
  if (baseAudit?.value !== undefined) {
    const problem = validateAuditSnapshot('base npm audit', paths.baseAudit, baseAudit.value);
    if (problem) problems.push(problem);
  }
  if (headAudit?.value !== undefined) {
    const problem = validateAuditSnapshot('head npm audit', paths.headAudit, headAudit.value);
    if (problem) problems.push(problem);
  }

  if (problems.length > 0) throw new SbomDiffInputError(problems);
  return {
    baseSbom: baseSbom?.value as CycloneDxBom,
    headSbom: headSbom?.value as CycloneDxBom,
    baseAudit: baseAudit?.value as AuditReport,
    headAudit: headAudit?.value as AuditReport
  };
}

export function formatInputProblems(problems: readonly SbomDiffInputProblem[]): string {
  return problems.map((problem) => `- ${problem.label} (${problem.path}): ${problem.reason}`).join('\n');
}

export function renderInputFailureReport(paths: SbomDiffPaths, problems: readonly SbomDiffInputProblem[]): string {
  return [
    '<!-- pendulum-sbom-diff -->',
    '# Dependency / SBOM diff',
    '',
    'Status: **BLOCKED**',
    '',
    '## Snapshot input unavailable',
    '',
    'This is a fail-closed security gate. It compares the base and head dependency snapshots; it does not treat unavailable, malformed, or failed `npm audit` output as a clean result.',
    '',
    ...problems.map((problem) => `- **${cell(problem.label)}** \`${cell(problem.path)}\`: ${cell(problem.reason)}`),
    '',
    'The pull-request workflow creates these four files before it invokes this command. For a local comparison, supply complete snapshots explicitly:',
    '',
    '```sh',
    'npm run audit:sbom-diff -- --base-sbom <base-sbom.json> --head-sbom <head-sbom.json> --base-audit <base-audit.json> --head-audit <head-audit.json> --output <report.md>',
    '```',
    '',
    `Default paths: ${paths.baseSbom}, ${paths.headSbom}, ${paths.baseAudit}, ${paths.headAudit}.`,
    ''
  ].join('\n');
}

function renderDiffReport(changes: ComponentChange[], vulnerabilities: NewVulnerability[]): string {
  const lines = [
    '<!-- pendulum-sbom-diff -->',
    '# Dependency / SBOM diff',
    '',
    `Status: **${vulnerabilities.length === 0 ? 'PASS' : 'BLOCKED'}**`,
    '',
    `Components changed: ${changes.length}. New high/critical advisories: ${vulnerabilities.length}.`,
    '',
    '## Component changes',
    '',
    '| Component | Before | After | Kind |',
    '| --- | --- | --- | --- |',
    ...(changes.length > 0
      ? changes.map(
          (change) =>
            `| ${cell(change.component)} | ${cell(change.before ?? '—')} | ${cell(change.after ?? '—')} | ${change.kind} |`
        )
      : ['| — | — | — | none |']),
    '',
    '## New high / critical advisories',
    '',
    '| Package | Severity | Advisory | Affected range | Fix available |',
    '| --- | --- | --- | --- | --- |',
    ...(vulnerabilities.length > 0
      ? vulnerabilities.map(
          (finding) =>
            `| ${cell(finding.package)} | ${finding.severity} | ${cell(finding.advisory)} | ${cell(finding.range)} | ${cell(JSON.stringify(finding.fixAvailable))} |`
        )
      : ['| — | — | none introduced | — | — |']),
    ''
  ];
  return lines.join('\n');
}

async function writeReport(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

function printUsage(): void {
  console.log(
    `Usage: npm run audit:sbom-diff -- [options]\n\nOptions:\n  --base-sbom <path>   Base CycloneDX SBOM (default: ${DEFAULT_PATHS.baseSbom})\n  --head-sbom <path>   Head CycloneDX SBOM (default: ${DEFAULT_PATHS.headSbom})\n  --base-audit <path>  Base npm audit JSON (default: ${DEFAULT_PATHS.baseAudit})\n  --head-audit <path>  Head npm audit JSON (default: ${DEFAULT_PATHS.headAudit})\n  --output <path>      Markdown report path (default: ${DEFAULT_PATHS.output})\n  --help, -h           Show this help\n\nThe default paths are generated by the pull-request security workflow. Missing or invalid snapshots block the gate intentionally.`
  );
}

/** Returns a process exit code: 0 pass, 1 new high/critical advisory, 2 invalid gate input. */
export async function runSbomDiff(args: readonly string[]): Promise<number> {
  const parsed = parseSbomDiffArgs(args);
  if (parsed.help) {
    printUsage();
    return 0;
  }

  try {
    if (parsed.problems.length > 0) throw new SbomDiffInputError(parsed.problems);
    const inputs = await loadSbomDiffInputs(parsed.paths);
    const changes = diffSboms(inputs.baseSbom, inputs.headSbom);
    const vulnerabilities = newHighCriticalVulnerabilities(inputs.baseAudit, inputs.headAudit);
    await writeReport(parsed.paths.output, renderDiffReport(changes, vulnerabilities));
    console.log(
      `SBOM diff: ${changes.length} component change(s), ${vulnerabilities.length} new high/critical advisory finding(s).`
    );
    return vulnerabilities.length > 0 ? 1 : 0;
  } catch (error) {
    const problems =
      error instanceof SbomDiffInputError
        ? error.problems
        : [
            {
              label: 'SBOM diff execution',
              path: parsed.paths.output,
              reason: `could not write or process the report (${(error as NodeJS.ErrnoException).code ?? String(error)})`
            }
          ];

    try {
      await writeReport(parsed.paths.output, renderInputFailureReport(parsed.paths, problems));
    } catch (reportError) {
      console.error(
        `SBOM diff blocked: unable to write diagnostic report ${parsed.paths.output} (${(reportError as NodeJS.ErrnoException).code ?? String(reportError)}).`
      );
    }
    console.error(
      `SBOM diff blocked: required CI snapshot inputs are missing or invalid.\n${formatInputProblems(problems)}\nThis gate is fail-closed. The pull-request workflow creates the base/head SBOM and npm audit snapshots before invoking it; use --help for a local invocation.`
    );
    return 2;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runSbomDiff(process.argv.slice(2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
