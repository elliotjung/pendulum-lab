import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

/**
 * Bundle budget gate. Run after `npm run build` and `build:standalone`.
 *
 * Budgets are split by delivery role:
 * - initial: assets referenced directly by dist/index.html;
 * - chunk: lazy/additional built assets;
 * - standalone: the self-contained single-file page.
 */

interface Budget {
  label: string;
  bytes: number;
  budget: number;
}

const KiB = 1024;
const BUDGETS = {
  initialJsRaw: 760 * KiB,
  initialJsGzip: 184 * KiB,
  initialJsBrotli: 155 * KiB,
  chunkJsRaw: 520 * KiB,
  chunkJsGzip: 135 * KiB,
  chunkJsBrotli: 115 * KiB,
  initialCssRaw: 140 * KiB,
  initialCssGzip: 32 * KiB,
  initialCssBrotli: 26 * KiB,
  standaloneRaw: 1300 * KiB,
  standaloneGzip: 430 * KiB,
  standaloneBrotli: 360 * KiB
};

interface SizeSet {
  raw: number;
  gzip: number;
  brotli: number;
}

async function fileBytes(path: string): Promise<Buffer> {
  return Buffer.from(await readFile(path));
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function compressedSizes(bytes: Buffer): SizeSet {
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes).length,
    brotli: brotliCompressSync(bytes).length
  };
}

function addSize(total: SizeSet, next: SizeSet): void {
  total.raw += next.raw;
  total.gzip += next.gzip;
  total.brotli += next.brotli;
}

function assetRefsFromIndex(indexHtml: string): Set<string> {
  const refs = new Set<string>();
  const attr = /(?:src|href)="\.?\/?assets\/([^"]+)"/g;
  for (const match of indexHtml.matchAll(attr)) refs.add(match[1]!);
  return refs;
}

async function main(): Promise<void> {
  const rows: Budget[] = [];
  const assetsDir = 'dist/assets';
  const initialRefs = assetRefsFromIndex(await readFile('dist/index.html', 'utf8'));
  const initialJs: SizeSet = { raw: 0, gzip: 0, brotli: 0 };
  const chunkJs: SizeSet = { raw: 0, gzip: 0, brotli: 0 };
  const initialCss: SizeSet = { raw: 0, gzip: 0, brotli: 0 };

  for (const name of await readdir(assetsDir)) {
    const full = join(assetsDir, name);
    const size = await fileSize(full);
    if (size === 0) continue;
    const sizes = compressedSizes(await fileBytes(full));
    const isInitial = initialRefs.has(name);
    if (name.endsWith('.js')) {
      addSize(isInitial ? initialJs : chunkJs, sizes);
    } else if (name.endsWith('.css') && isInitial) {
      addSize(initialCss, sizes);
    }
  }

  rows.push({ label: 'initial JS raw', bytes: initialJs.raw, budget: BUDGETS.initialJsRaw });
  rows.push({ label: 'initial JS gzip', bytes: initialJs.gzip, budget: BUDGETS.initialJsGzip });
  rows.push({ label: 'initial JS brotli', bytes: initialJs.brotli, budget: BUDGETS.initialJsBrotli });
  rows.push({ label: 'non-initial JS raw', bytes: chunkJs.raw, budget: BUDGETS.chunkJsRaw });
  rows.push({ label: 'non-initial JS gzip', bytes: chunkJs.gzip, budget: BUDGETS.chunkJsGzip });
  rows.push({ label: 'non-initial JS brotli', bytes: chunkJs.brotli, budget: BUDGETS.chunkJsBrotli });
  rows.push({ label: 'initial CSS raw', bytes: initialCss.raw, budget: BUDGETS.initialCssRaw });
  rows.push({ label: 'initial CSS gzip', bytes: initialCss.gzip, budget: BUDGETS.initialCssGzip });
  rows.push({ label: 'initial CSS brotli', bytes: initialCss.brotli, budget: BUDGETS.initialCssBrotli });

  const standaloneBytes = await fileBytes('standalone/index.html').catch(() => null);
  if (standaloneBytes) {
    const standalone = compressedSizes(standaloneBytes);
    rows.push({ label: 'standalone HTML raw', bytes: standalone.raw, budget: BUDGETS.standaloneRaw });
    rows.push({ label: 'standalone HTML gzip', bytes: standalone.gzip, budget: BUDGETS.standaloneGzip });
    rows.push({ label: 'standalone HTML brotli', bytes: standalone.brotli, budget: BUDGETS.standaloneBrotli });
  }

  let failed = 0;
  for (const row of rows) {
    const ok = row.bytes <= row.budget;
    if (!ok) failed += 1;
    const kb = (n: number): string => `${(n / KiB).toFixed(1)} KiB`;
    console.log(`${ok ? 'OK  ' : 'OVER'}  ${row.label}: ${kb(row.bytes)} / budget ${kb(row.budget)}`);
  }
  if (failed > 0) {
    console.error(`bundle budget exceeded in ${failed} row(s); raise the budget intentionally or shrink the bundle`);
    process.exitCode = 1;
    return;
  }
  console.log('bundle budget passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
