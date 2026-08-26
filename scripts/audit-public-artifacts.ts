import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const INVENTORY_SCHEMA = 'pendulum-public-report-inventory/v1';
const DEFAULT_INVENTORY = 'config/public-report-inventory.json';
const MAX_TEXT_ARTIFACT_BYTES = 16 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.html',
  '.json',
  '.log',
  '.md',
  '.svg',
  '.tsv',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
]);

interface PublicReportInventory {
  schemaVersion: typeof INVENTORY_SCHEMA;
  reports: string[];
}

interface FindingRule {
  id: string;
  expression: RegExp;
  safeValue?: (match: RegExpExecArray) => boolean;
}

export interface PublicArtifactFinding {
  file: string;
  rule: string;
  line: number;
  column: number;
}

export interface PublicArtifactAudit {
  filesChecked: number;
  binaryFilesSkipped: number;
  findings: PublicArtifactFinding[];
}

const FINDING_RULES: readonly FindingRule[] = [
  { id: 'windows-absolute-path', expression: /\b[A-Za-z]:(?:\\\\|\\|\/)[^\r\n"'<>]*/g },
  // The boundary prevents JSON-escaped repository-relative paths such as
  // `src\\app\\main.ts` from being mistaken for a UNC path at an inner slash.
  { id: 'unc-absolute-path', expression: /(?<![A-Za-z0-9._-])\\\\[^\\\s"'<>]+(?:\\+[^\\\s"'<>]+)+/g },
  { id: 'file-uri', expression: /file:\/\/\/[^\s"'<>]+/gi },
  {
    id: 'posix-home-path',
    expression: /(?<![A-Za-z0-9.])\/(?:home|Users)\/[A-Za-z0-9._-]+\/[^\s"'<>]*/g
  },
  {
    id: 'posix-workspace-path',
    expression: /(?<![A-Za-z0-9.])\/(?:github\/workspace|workspace|private\/var\/folders|tmp)\/[^\s"'<>]*/g
  },
  {
    id: 'private-key-material',
    expression: /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/g
  },
  {
    id: 'provider-token',
    expression:
      /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g
  },
  { id: 'authorization-bearer', expression: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  {
    id: 'credential-assignment',
    expression:
      /(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi,
    safeValue: (match) =>
      /^(?:\[?redacted\]?|example|not[-_ ]set|unavailable|placeholder)$/i.test(match[1]?.trim() ?? '')
  }
];

function lineAndColumn(value: string, index: number): { line: number; column: number } {
  const prefix = value.slice(0, index);
  const lines = prefix.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

/** Scan text without ever returning the matched secret or private path. */
export function scanPublicArtifactText(value: string, file = '<memory>'): PublicArtifactFinding[] {
  const findings: PublicArtifactFinding[] = [];
  for (const rule of FINDING_RULES) {
    rule.expression.lastIndex = 0;
    for (let match = rule.expression.exec(value); match; match = rule.expression.exec(value)) {
      if (rule.safeValue?.(match)) continue;
      const location = lineAndColumn(value, match.index);
      findings.push({ file, rule: rule.id, ...location });
      if (match[0].length === 0) rule.expression.lastIndex += 1;
    }
  }
  return findings;
}

function validReportName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

async function readInventory(path: string): Promise<PublicReportInventory> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<PublicReportInventory>;
  if (
    parsed.schemaVersion !== INVENTORY_SCHEMA ||
    !Array.isArray(parsed.reports) ||
    parsed.reports.some((report) => !validReportName(report)) ||
    new Set(parsed.reports).size !== parsed.reports.length
  ) {
    throw new Error(`${path} is not a valid ${INVENTORY_SCHEMA} inventory`);
  }
  return parsed as PublicReportInventory;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function sourceInventoryFiles(repositoryRoot: string, inventoryPath: string): Promise<string[]> {
  const inventory = await readInventory(inventoryPath);
  const candidates = [
    ...inventory.reports.map((report) => join(repositoryRoot, 'reports', report)),
    join(repositoryRoot, 'config', 'claim-registry.json')
  ];
  const existing: string[] = [];
  for (const path of candidates) {
    try {
      if ((await stat(path)).isFile()) existing.push(path);
    } catch {
      // Public reports are optional until their generating command has run.
    }
  }
  return existing;
}

export async function auditPublicArtifacts(
  options: {
    repositoryRoot?: string;
    publicRoot?: string;
    inventoryPath?: string;
  } = {}
): Promise<PublicArtifactAudit> {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const publicRoot = options.publicRoot ? resolve(options.publicRoot) : null;
  const inventoryPath = resolve(options.inventoryPath ?? join(repositoryRoot, DEFAULT_INVENTORY));
  const files = publicRoot ? await walkFiles(publicRoot) : await sourceInventoryFiles(repositoryRoot, inventoryPath);
  const findings: PublicArtifactFinding[] = [];
  let filesChecked = 0;
  let binaryFilesSkipped = 0;

  for (const path of files) {
    const file = relative(publicRoot ?? repositoryRoot, path).replaceAll('\\', '/');
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
      binaryFilesSkipped += 1;
      continue;
    }
    const metadata = await stat(path);
    if (metadata.size > MAX_TEXT_ARTIFACT_BYTES) {
      findings.push({ file, rule: 'text-artifact-too-large-to-scan', line: 1, column: 1 });
      continue;
    }
    const bytes = await readFile(path);
    let value: string;
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      findings.push({ file, rule: 'invalid-utf8-text-artifact', line: 1, column: 1 });
      continue;
    }
    filesChecked += 1;
    findings.push(...scanPublicArtifactText(value, file));
  }

  return { filesChecked, binaryFilesSkipped, findings };
}

function cliPublicRoot(args: readonly string[]): string | undefined {
  let root: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument.startsWith('--root=')) root = argument.slice('--root='.length);
    else if (argument === '--root') root = args[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (root !== undefined && !root.trim()) throw new Error('--root requires a directory');
  return root;
}

async function main(): Promise<void> {
  const publicRoot = cliPublicRoot(process.argv.slice(2));
  const result = await auditPublicArtifacts(publicRoot === undefined ? {} : { publicRoot });
  if (result.findings.length > 0) {
    console.error('Public artifact privacy audit failed:');
    for (const finding of result.findings) {
      console.error(`- ${finding.file}:${finding.line}:${finding.column} [${finding.rule}]`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Public artifact privacy audit passed: ${result.filesChecked} text artifact(s), ${result.binaryFilesSkipped} binary artifact(s) skipped.`
  );
}

const invokedPath = process.argv[1];
if (invokedPath && pathToFileURL(resolve(invokedPath)).href === import.meta.url) await main();
