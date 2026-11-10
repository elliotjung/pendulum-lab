/** Local execution provenance, not a signature, scientific authentication, or human approval. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRunnerReport } from './parity-runner-report';

export interface EvidenceDigest {
  readonly path: string;
  readonly sha256: string;
}
export interface ParityExecutionCapture {
  readonly schema: 'pendulum-parity-execution/v1';
  readonly kind: 'build' | 'vitest' | 'playwright';
  readonly command: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly exitCode: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly sourcePolicy: 'bounded-roots-pre-post/v1';
  readonly sourceRoots: readonly string[];
  readonly sources: readonly EvidenceDigest[];
  readonly sourceFingerprint: string;
  readonly report: EvidenceDigest | null;
  readonly build: {
    readonly root: string;
    readonly files: readonly EvidenceDigest[];
    readonly fingerprint: string;
  } | null;
  readonly buildCapture: EvidenceDigest | null;
}
export const evidenceHash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export function evidencePath(root: string, relative: string): string {
  if (
    typeof relative !== 'string' ||
    !relative.length ||
    relative.includes('\\') ||
    path.isAbsolute(relative) ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe evidence path: ${relative}`);
  const absolute = path.resolve(root, relative),
    within = path.relative(path.resolve(root), absolute);
  if (within.startsWith('..') || path.isAbsolute(within))
    throw new Error(`Evidence path escapes repository: ${relative}`);
  // Lexical containment is insufficient when a stored report points through a
  // junction/symlink. Inspect the nearest existing ancestor before any I/O.
  let ancestor = absolute;
  while (!existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
  const actualRoot = realpathSync(path.resolve(root)),
    actualAncestor = realpathSync(ancestor);
  const actualWithin = path.relative(actualRoot, actualAncestor);
  if (actualWithin.startsWith('..') || path.isAbsolute(actualWithin))
    throw new Error(`Evidence path resolves outside repository: ${relative}`);
  return absolute;
}
/** Source text uses LF normalization; binary and generated/report bytes use exact-byte SHA-256. */
export function sourceHash(root: string, relative: string): string {
  const bytes = readFileSync(evidencePath(root, relative));
  return evidenceHash(
    /\.(?:[cm]?[jt]sx?|css|html|json|md|txt|svg|ya?ml)$/i.test(relative) ||
      /(?:^|\/)\.(?:gitattributes|gitignore)$/.test(relative)
      ? bytes.toString('utf8').replaceAll('\r\n', '\n')
      : bytes
  );
}
export function digestFingerprint(digests: readonly EvidenceDigest[]): string {
  return evidenceHash(JSON.stringify(digests));
}
export function captureSourceTree(root: string, roots: readonly string[]): EvidenceDigest[] {
  const paths = new Set<string>();
  function visit(relative: string) {
    const absolute = evidencePath(root, relative),
      stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Source capture refuses symbolic links: ${relative}`);
    if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) visit(`${relative}/${name}`);
    else if (stat.isFile()) paths.add(relative);
  }
  for (const relative of roots) if (existsSync(evidencePath(root, relative))) visit(relative);
  return [...paths].sort().map((relative) => ({ path: relative, sha256: sourceHash(root, relative) }));
}
export function captureBuildTree(root: string, relative: string): EvidenceDigest[] {
  const files: EvidenceDigest[] = [];
  function visit(directory: string, prefix: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en')
    )) {
      const local = prefix ? `${prefix}/${entry.name}` : entry.name,
        absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Build capture refuses symbolic links: ${local}`);
      if (entry.isDirectory()) visit(absolute, local);
      else if (entry.isFile()) files.push({ path: local, sha256: evidenceHash(readFileSync(absolute)) });
    }
  }
  visit(evidencePath(root, relative), '');
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}
const SOURCE_ROOTS = [
  '.gitattributes',
  'src',
  'css',
  'public',
  'config',
  'data',
  'content',
  'documents/redesign/baseline',
  'app.html',
  'next.html',
  'reviewer.html',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  'scripts'
];
const TEST_ROOTS = ['tests', 'e2e', 'vitest.config.ts', 'playwright.config.ts'];
export interface CaptureOptions {
  readonly kind: ParityExecutionCapture['kind'];
  readonly capturePath: string;
  readonly args: readonly string[];
  readonly reportPath?: string;
  readonly buildRoot?: string;
  readonly buildCapturePath?: string;
  readonly extraSources?: readonly string[];
  readonly packageLegacy?: boolean;
}
/** Captures a real execution; no API exists for converting an unbound old report into a fresh passing capture. */
export function runParityCapture(root: string, options: CaptureOptions): ParityExecutionCapture {
  const errors: string[] = [];
  if (options.packageLegacy && options.kind !== 'build')
    throw new Error('Legacy packaging is only valid for a build capture.');
  if (options.kind === 'build' && options.args.some((argument) => /^--outDir(?:=|$)|^--root(?:=|$)/i.test(argument)))
    throw new Error('Build output/root cannot override the captured --out-dir.');
  const configSources = options.args.flatMap((argument, index) =>
    argument.startsWith('--config=')
      ? [argument.slice('--config='.length)]
      : argument === '--config' && options.args[index + 1]
        ? [options.args[index + 1]!]
        : []
  );
  const packageSources: string[] = [];
  if (options.packageLegacy) {
    const inventory = JSON.parse(readFileSync(evidencePath(root, 'config/public-report-inventory.json'), 'utf8')) as {
      schemaVersion?: unknown;
      reports?: unknown;
    };
    if (
      inventory.schemaVersion !== 'pendulum-public-report-inventory/v1' ||
      !Array.isArray(inventory.reports) ||
      inventory.reports.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
    )
      throw new Error('Invalid public report inventory for packaged source capture.');
    packageSources.push(
      ...(inventory.reports as string[]).map((name) => `reports/${name}`),
      'paper/index.html',
      'paper/paper.pdf'
    );
  }
  const sourceRoots = [
    ...new Set([
      ...SOURCE_ROOTS,
      ...(options.kind === 'build' ? [] : TEST_ROOTS),
      ...(options.extraSources ?? []),
      ...configSources,
      ...packageSources
    ])
  ].sort();
  const before = captureSourceTree(root, sourceRoots);
  let buildCapture: EvidenceDigest | null = null,
    build: ParityExecutionCapture['build'] = null;
  if (options.kind === 'playwright') {
    if (!options.buildCapturePath || !options.buildRoot)
      throw new Error('Playwright evidence requires --build-capture and --out-dir of the frozen production build.');
    const capturedBytes = readFileSync(evidencePath(root, options.buildCapturePath));
    const previous = JSON.parse(capturedBytes.toString('utf8')) as ParityExecutionCapture;
    if (
      previous.schema !== 'pendulum-parity-execution/v1' ||
      previous.kind !== 'build' ||
      !previous.valid ||
      previous.exitCode !== 0 ||
      !previous.build ||
      previous.build.root !== options.buildRoot
    )
      throw new Error('A valid matching build capture is required.');
    const files = captureBuildTree(root, options.buildRoot);
    if (JSON.stringify(files) !== JSON.stringify(previous.build.files))
      throw new Error('Production build bytes changed since the captured build.');
    build = previous.build;
    buildCapture = { path: options.buildCapturePath, sha256: evidenceHash(capturedBytes) };
  }
  if (
    options.kind === 'build' &&
    (!options.buildRoot || !/^(?:tmp\/[^/].*|dist(?:-[^/]+)?(?:\/.*)?)$/.test(options.buildRoot))
  )
    throw new Error('Build output must be an explicit tmp/... or dist directory.');
  if (options.kind !== 'build' && !options.reportPath)
    throw new Error('Test capture requires an explicit --report path.');
  for (const value of [options.capturePath, options.reportPath, options.buildRoot])
    if (value) evidencePath(root, value);
  const binary =
    options.kind === 'build'
      ? options.packageLegacy
        ? 'node_modules/tsx/dist/cli.mjs'
        : 'node_modules/vite/bin/vite.js'
      : options.kind === 'vitest'
        ? 'node_modules/vitest/vitest.mjs'
        : 'node_modules/@playwright/test/cli.js';
  const args =
    options.kind === 'build'
      ? options.packageLegacy
        ? [
            path.resolve(root, 'scripts/redesign/parity-build.ts'),
            '--out-dir',
            options.buildRoot!,
            '--',
            ...options.args
          ]
        : ['build', '--outDir', options.buildRoot!, ...options.args]
      : options.kind === 'vitest'
        ? ['run', ...options.args, '--reporter=json', `--outputFile=${options.reportPath!}`]
        : ['test', ...options.args, '--reporter=line,json'];
  const command = [process.execPath, path.resolve(root, binary), ...args];
  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...(options.kind === 'playwright' ? { PLAYWRIGHT_JSON_OUTPUT_NAME: evidencePath(root, options.reportPath!) } : {})
    }
  });
  const finishedAt = new Date().toISOString(),
    exitCode = result.status ?? 1;
  if (result.error) errors.push(result.error.message);
  if (exitCode !== 0) errors.push(`Actual child runner exited ${exitCode}.`);
  const after = captureSourceTree(root, sourceRoots);
  if (JSON.stringify(before) !== JSON.stringify(after))
    errors.push('Captured source paths or bytes changed during execution; rerun with these roots frozen.');
  let report: EvidenceDigest | null = null;
  if (options.reportPath) {
    if (!existsSync(evidencePath(root, options.reportPath))) errors.push('Runner did not produce its report.');
    else {
      const bytes = readFileSync(evidencePath(root, options.reportPath));
      report = { path: options.reportPath, sha256: evidenceHash(bytes) };
      if (options.kind !== 'build') {
        try {
          const parsed = parseRunnerReport(root, options.kind, JSON.parse(bytes.toString('utf8')) as unknown);
          errors.push(...parsed.errors.map((message) => `Runner report: ${message}`));
          if (parsed.startedAtMs < Date.parse(startedAt) - 1000 || parsed.finishedAtMs > Date.parse(finishedAt) + 1000)
            errors.push('Runner report is not from this actual execution interval.');
        } catch (cause) {
          errors.push(`Runner report: ${cause instanceof Error ? cause.message : 'Cannot parse report.'}`);
        }
      }
    }
  }
  if (options.kind === 'build' && exitCode === 0) {
    const files = captureBuildTree(root, options.buildRoot!);
    if (!files.length) errors.push('Production build produced no files.');
    build = { root: options.buildRoot!, files, fingerprint: digestFingerprint(files) };
  } else if (build && JSON.stringify(captureBuildTree(root, build.root)) !== JSON.stringify(build.files))
    errors.push('Frozen production build bytes changed during browser execution.');
  const capture: ParityExecutionCapture = {
    schema: 'pendulum-parity-execution/v1',
    kind: options.kind,
    command,
    startedAt,
    finishedAt,
    exitCode,
    valid: errors.length === 0,
    errors,
    sourcePolicy: 'bounded-roots-pre-post/v1',
    sourceRoots,
    sources: before,
    sourceFingerprint: digestFingerprint(before),
    report,
    build,
    buildCapture
  };
  const target = evidencePath(root, options.capturePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  return capture;
}
function main() {
  const argv = process.argv.slice(2),
    kind = argv.shift();
  if (!['build', 'vitest', 'playwright'].includes(kind ?? ''))
    throw new Error(
      'Usage: parity-capture.ts build|vitest|playwright --capture PATH [--report PATH] [--out-dir PATH] [--build-capture PATH] [--source PATH] -- runner arguments'
    );
  const separator = argv.indexOf('--'),
    flags = separator < 0 ? argv : argv.slice(0, separator),
    args = separator < 0 ? [] : argv.slice(separator + 1);
  const extraSources: string[] = [];
  let capturePath = '',
    reportPath: string | undefined,
    buildRoot: string | undefined,
    buildCapturePath: string | undefined;
  let packageLegacy = false;
  for (let index = 0; index < flags.length; index += 2) {
    const value = flags[index + 1];
    if (!value) throw new Error('Each capture flag requires a value.');
    if (flags[index] === '--capture') capturePath = value;
    else if (flags[index] === '--report') reportPath = value;
    else if (flags[index] === '--out-dir') buildRoot = value;
    else if (flags[index] === '--build-capture') buildCapturePath = value;
    else if (flags[index] === '--source') extraSources.push(value);
    else if (flags[index] === '--package-legacy') {
      if (value !== 'yes') throw new Error('--package-legacy requires yes.');
      packageLegacy = true;
    } else throw new Error(`Unknown capture option: ${flags[index]}`);
  }
  if (!capturePath) throw new Error('--capture is required.');
  const capture = runParityCapture(process.cwd(), {
    kind: kind as CaptureOptions['kind'],
    capturePath,
    args,
    extraSources,
    packageLegacy,
    ...(reportPath ? { reportPath } : {}),
    ...(buildRoot ? { buildRoot } : {}),
    ...(buildCapturePath ? { buildCapturePath } : {})
  });
  if (!capture.valid) {
    process.stderr.write(`${capture.errors.join('\n')}\n`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
