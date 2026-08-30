import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

export interface AttributedSize {
  raw: number;
  gzip: number;
  brotli: number;
}

export interface AttributedPart extends AttributedSize {
  id: string;
  role: string;
  shareOfStandaloneRaw: number | null;
}

export interface StandaloneByteAttribution {
  schemaVersion: 'pendulum-standalone-byte-attribution/v1';
  artifact: {
    path: string;
    sha256: string;
    size: AttributedSize;
  };
  exactHtmlAttribution: {
    method: string;
    coverage: number;
    attributedRawBytes: number;
    parts: AttributedPart[];
  };
  companionFiles: {
    method: string;
    total: AttributedSize;
    parts: AttributedPart[];
  };
  modularBuildProxy: {
    method: string;
    caveat: string;
    total: AttributedSize;
    roles: AttributedPart[];
  };
}

function sizes(bytes: Buffer): AttributedSize {
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes).length,
    brotli: brotliCompressSync(bytes).length
  };
}

function emptySizes(): AttributedSize {
  return { raw: 0, gzip: 0, brotli: 0 };
}

function add(target: AttributedSize, value: AttributedSize): void {
  target.raw += value.raw;
  target.gzip += value.gzip;
  target.brotli += value.brotli;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function part(id: string, role: string, bytes: Buffer, standaloneRaw: number | null): AttributedPart {
  return {
    id,
    role,
    ...sizes(bytes),
    shareOfStandaloneRaw: standaloneRaw && standaloneRaw > 0 ? bytes.length / standaloneRaw : null
  };
}

/**
 * Partition the exact HTML bytes. Compression is measured independently per
 * partition, so raw bytes are additive while compressed bytes are attribution
 * estimates (the whole-file compressor can share a dictionary across parts).
 */
export function attributeHtml(htmlBytes: Buffer): AttributedPart[] {
  const html = htmlBytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(htmlBytes)) {
    throw new Error('standalone/index.html must be canonical UTF-8 before byte attribution');
  }

  const buckets = new Map<string, { role: string; chunks: Buffer[] }>();
  const append = (id: string, role: string, text: string): void => {
    const entry = buckets.get(id) ?? { role, chunks: [] };
    entry.chunks.push(Buffer.from(text, 'utf8'));
    buckets.set(id, entry);
  };
  const element = /<(script|style)\b([^>]*)>[\s\S]*?<\/\1\s*>/giu;
  let cursor = 0;
  let index = 0;
  for (const match of html.matchAll(element)) {
    const start = match.index ?? 0;
    if (start > cursor) append('html-shell', 'HTML markup and static copy', html.slice(cursor, start));
    const tag = (match[1] ?? '').toLowerCase();
    const attributes = match[2] ?? '';
    const id =
      tag === 'style'
        ? 'inline-css'
        : /\btype\s*=\s*["']application\/(?:ld\+)?json["']/iu.test(attributes)
          ? 'inline-json'
          : 'inline-javascript';
    const role =
      id === 'inline-css'
        ? 'inlined application styles'
        : id === 'inline-json'
          ? 'inlined structured data'
          : 'inlined application JavaScript';
    append(id, role, match[0]);
    cursor = start + match[0].length;
    index += 1;
  }
  if (cursor < html.length) append('html-shell', 'HTML markup and static copy', html.slice(cursor));
  if (index === 0) throw new Error('standalone HTML contains no inline script or style payloads');

  const order = ['html-shell', 'inline-javascript', 'inline-css', 'inline-json'];
  return [...buckets.entries()]
    .map(([id, entry]) => part(id, entry.role, Buffer.concat(entry.chunks), htmlBytes.length))
    .sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id) || left.id.localeCompare(right.id));
}

async function filesRecursively(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await walk(root);
  return output.sort((left, right) => left.localeCompare(right));
}

function companionRole(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.endsWith('.worker.js')) return 'worker JavaScript required by the standalone runtime';
  if (name === 'sw.js' || name.endsWith('.webmanifest') || name === 'offline.html') return 'offline/PWA support';
  if (name.endsWith('.png') || name.endsWith('.svg') || name.endsWith('.ico')) return 'icon or image asset';
  return 'standalone support file';
}

function modularRole(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.endsWith('.css')) return 'application styles';
  if (name.startsWith('app-')) return 'initial workbench shell';
  if (name.includes('research-ui') || name.includes('researchmatrix')) return 'research workbench';
  if (name.includes('chaos')) return 'chaos diagnostics and worker';
  if (name.includes('physics')) return 'physics kernels';
  if (name.includes('validation')) return 'validation surface';
  if (name.includes('theory')) return 'theory surface';
  if (name.includes('basin') || name.includes('bifurcation') || name.includes('expansion')) {
    return 'specialized analysis panels';
  }
  if (name.includes('worker')) return 'worker runtime';
  return 'other lazy/runtime chunks';
}

async function attributedFiles(
  paths: readonly string[],
  root: string,
  roleFor: (path: string) => string,
  standaloneRaw: number | null
): Promise<AttributedPart[]> {
  const output: AttributedPart[] = [];
  for (const path of paths) {
    const details = await stat(path);
    if (!details.isFile() || details.size === 0) continue;
    output.push(
      part(relative(root, path).replaceAll('\\', '/'), roleFor(path), Buffer.from(await readFile(path)), standaloneRaw)
    );
  }
  return output;
}

function groupByRole(parts: readonly AttributedPart[]): AttributedPart[] {
  const groups = new Map<string, AttributedSize>();
  for (const item of parts) {
    const total = groups.get(item.role) ?? emptySizes();
    add(total, item);
    groups.set(item.role, total);
  }
  const rawTotal = [...groups.values()].reduce((sum, value) => sum + value.raw, 0);
  return [...groups.entries()]
    .map(([role, value]) => ({
      id: role
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, '-')
        .replaceAll(/^-|-$/gu, ''),
      role,
      ...value,
      shareOfStandaloneRaw: rawTotal > 0 ? value.raw / rawTotal : null
    }))
    .sort((left, right) => right.raw - left.raw || left.role.localeCompare(right.role));
}

function sum(parts: readonly AttributedPart[]): AttributedSize {
  const total = emptySizes();
  for (const item of parts) add(total, item);
  return total;
}

export async function buildStandaloneByteAttribution(
  options: {
    standalonePath?: string;
    standaloneRoot?: string;
    modularAssetsRoot?: string;
  } = {}
): Promise<StandaloneByteAttribution> {
  const standalonePath = options.standalonePath ?? 'standalone/index.html';
  const standaloneRoot = options.standaloneRoot ?? 'standalone';
  const modularAssetsRoot = options.modularAssetsRoot ?? 'dist/assets';
  const htmlBytes = Buffer.from(await readFile(standalonePath));
  const exactParts = attributeHtml(htmlBytes);
  const attributedRawBytes = exactParts.reduce((total, item) => total + item.raw, 0);
  if (attributedRawBytes !== htmlBytes.length) {
    throw new Error(`standalone attribution is incomplete: ${attributedRawBytes}/${htmlBytes.length} raw bytes`);
  }

  const companionPaths = (await filesRecursively(standaloneRoot)).filter(
    (path) => path.replaceAll('\\', '/').toLowerCase() !== standalonePath.replaceAll('\\', '/').toLowerCase()
  );
  const companions = await attributedFiles(companionPaths, standaloneRoot, companionRole, null);
  const modularPaths = (await filesRecursively(modularAssetsRoot)).filter((path) => /\.(?:css|js)$/iu.test(path));
  const modularParts = await attributedFiles(modularPaths, modularAssetsRoot, modularRole, null);
  const modularRoles = groupByRole(modularParts);

  return {
    schemaVersion: 'pendulum-standalone-byte-attribution/v1',
    artifact: {
      path: standalonePath.replaceAll('\\', '/'),
      sha256: sha256(htmlBytes),
      size: sizes(htmlBytes)
    },
    exactHtmlAttribution: {
      method: 'Exact UTF-8 partition of complete script/style elements and the remaining HTML shell.',
      coverage: 1,
      attributedRawBytes,
      parts: exactParts
    },
    companionFiles: {
      method: 'Exact bytes for every sibling file shipped beside standalone/index.html.',
      total: sum(companions),
      parts: companions
    },
    modularBuildProxy: {
      method: 'Role grouping of the same-source modular dist/assets JavaScript and CSS chunks.',
      caveat:
        'This proxy identifies functional contributors but is not additive to standalone HTML: single-file bundling changes chunk boundaries and compression dictionaries.',
      total: sum(modularParts),
      roles: modularRoles
    }
  };
}

function markdown(report: StandaloneByteAttribution): string {
  const kib = (bytes: number): string => (bytes / 1024).toFixed(1);
  const rows = report.exactHtmlAttribution.parts.map(
    (item) =>
      `| ${item.role} | ${kib(item.raw)} | ${kib(item.gzip)} | ${kib(item.brotli)} | ${((item.shareOfStandaloneRaw ?? 0) * 100).toFixed(1)}% |`
  );
  const proxy = report.modularBuildProxy.roles.map(
    (item) => `| ${item.role} | ${kib(item.raw)} | ${kib(item.gzip)} | ${kib(item.brotli)} |`
  );
  return [
    '# Standalone byte attribution',
    '',
    `Artifact: \`${report.artifact.path}\``,
    '',
    `SHA-256: \`${report.artifact.sha256}\``,
    '',
    '## Exact standalone HTML partition',
    '',
    '| Payload | Raw KiB | Isolated gzip KiB | Isolated Brotli KiB | Raw share |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Raw bytes add exactly to the artifact. Per-part compressed sizes are isolated estimates; the whole-file compressor shares a dictionary across parts.',
    '',
    '## Functional module proxy',
    '',
    '| Role in modular build | Raw KiB | Gzip KiB | Brotli KiB |',
    '| --- | ---: | ---: | ---: |',
    ...proxy,
    '',
    `> ${report.modularBuildProxy.caveat}`
  ].join('\n');
}

export async function writeStandaloneByteAttribution(
  options: Parameters<typeof buildStandaloneByteAttribution>[0] & {
    jsonPath?: string;
    markdownPath?: string;
  } = {}
): Promise<StandaloneByteAttribution> {
  const report = await buildStandaloneByteAttribution(options);
  const jsonPath = options.jsonPath ?? 'reports/standalone-byte-attribution.json';
  const markdownPath = options.markdownPath ?? 'reports/standalone-byte-attribution.md';
  await mkdir('reports', { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, `${markdown(report)}\n`, 'utf8');
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  writeStandaloneByteAttribution()
    .then((report) => {
      console.log(
        `Standalone byte attribution: ${report.exactHtmlAttribution.attributedRawBytes} exact HTML bytes, ${report.modularBuildProxy.roles.length} functional proxy roles.`
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
