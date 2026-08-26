import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { reportSafeSourcePath } from './report-source-path';

type Vendor = 'intel' | 'nvidia' | 'amd';
type MatrixStatus = 'pass' | 'partial' | 'fail';

interface LadderEvidence {
  schemaVersion?: string;
  generatedAt?: string;
  status?: 'pass' | 'fail';
  adapter?: {
    name?: string;
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  } | null;
  runContext?: {
    driverVersion?: string | null;
    thermalState?: string;
    estimatedCostUsd?: number | null;
    fallbackRate?: number;
  };
  nChainVariational?: {
    backend?: string;
    comparison?: {
      passed?: boolean;
      ftleAbsDiff?: number;
      clv?: { metrics?: Record<string, number | boolean> };
    } | null;
    dimension?: number;
  } | null;
}

interface VendorRow {
  vendor: Vendor;
  status: 'pass' | 'fail' | 'missing';
  source: string | null;
  generatedAt: string | null;
  adapter: LadderEvidence['adapter'];
  nChainPassed: boolean;
  nChainDimension: number | null;
  driverVersion: string | null;
  thermalState: string;
  estimatedCostUsd: number | null;
  fallbackRate: number | null;
  caveat: string;
}

const vendors: Vendor[] = ['intel', 'nvidia', 'amd'];
const inputRoot = process.env.GPU_MATRIX_INPUT_DIR ?? 'reports';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectJson(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const absolute = resolve(root);
  const entries = await readdir(absolute, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === 'gpu-benchmark-ladder.json')
    .map((entry) => join(entry.parentPath, entry.name));
}

function classify(evidence: LadderEvidence): Vendor | null {
  const text = [
    evidence.adapter?.vendor,
    evidence.adapter?.name,
    evidence.adapter?.architecture,
    evidence.adapter?.device,
    evidence.adapter?.description
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/intel|8086|\bxe[- _]?/.test(text)) return 'intel';
  if (/nvidia|10de|geforce|quadro|tesla/.test(text)) return 'nvidia';
  if (/amd|1002|radeon|advanced micro devices/.test(text)) return 'amd';
  return null;
}

const candidates = new Map<Vendor, Array<{ path: string; evidence: LadderEvidence }>>();
for (const vendor of vendors) candidates.set(vendor, []);
for (const path of await collectJson(inputRoot)) {
  try {
    const evidence = JSON.parse(await readFile(path, 'utf8')) as LadderEvidence;
    const vendor = classify(evidence);
    if (vendor) candidates.get(vendor)!.push({ path, evidence });
  } catch {
    // Invalid or unrelated JSON is ignored; the missing row remains explicit.
  }
}

const rows: VendorRow[] = vendors.map((vendor) => {
  const available = candidates
    .get(vendor)!
    .sort((a, b) => String(b.evidence.generatedAt ?? '').localeCompare(String(a.evidence.generatedAt ?? '')));
  const selected = available[0];
  if (!selected) {
    return {
      vendor,
      status: 'missing',
      source: null,
      generatedAt: null,
      adapter: null,
      nChainPassed: false,
      nChainDimension: null,
      driverVersion: null,
      thermalState: 'unknown',
      estimatedCostUsd: null,
      fallbackRate: null,
      caveat: `No ${vendor} hardware ladder artifact was supplied. This row is not simulated or inferred.`
    };
  }
  const nChainPassed =
    selected.evidence.nChainVariational?.backend === 'webgpu' &&
    selected.evidence.nChainVariational?.comparison?.passed === true;
  const passed = selected.evidence.status === 'pass' && nChainPassed;
  return {
    vendor,
    status: passed ? 'pass' : 'fail',
    source: reportSafeSourcePath(selected.path, inputRoot),
    generatedAt: selected.evidence.generatedAt ?? null,
    adapter: selected.evidence.adapter ?? null,
    nChainPassed,
    nChainDimension: selected.evidence.nChainVariational?.dimension ?? null,
    driverVersion: selected.evidence.runContext?.driverVersion ?? null,
    thermalState: selected.evidence.runContext?.thermalState ?? 'unknown',
    estimatedCostUsd: selected.evidence.runContext?.estimatedCostUsd ?? null,
    fallbackRate: selected.evidence.runContext?.fallbackRate ?? null,
    caveat: passed
      ? 'Real-adapter ladder passed reductions, 4D diagnostics, and the N-chain STM/QR oracle gate.'
      : 'A hardware artifact exists, but one or more CPU-oracle promotion gates failed.'
  };
});

const passed = rows.filter((row) => row.status === 'pass').length;
const failed = rows.filter((row) => row.status === 'fail').length;
const status: MatrixStatus = failed > 0 ? 'fail' : passed === vendors.length ? 'pass' : 'partial';
const report = {
  schemaVersion: 'pendulum-gpu-adapter-matrix/v1',
  generatedAt: new Date().toISOString(),
  status,
  requiredVendors: vendors,
  coverage: { passed, required: vendors.length, missing: vendors.length - passed - failed, failed },
  rows,
  reproduce: 'npm run benchmark:gpu-matrix',
  collectionContract: {
    runnerLabels: vendors.map((vendor) => ['self-hosted', 'webgpu', vendor]),
    artifactName: 'gpu-ladder-<vendor>',
    rule: 'Only reports produced on a real adapter and passing same-run CPU f64 oracle gates count as vendor evidence.'
  },
  caveat:
    status === 'pass'
      ? 'All three vendor classes have real-adapter evidence; driver and architecture diversity within each vendor remains visible in the adapter metadata.'
      : 'The matrix is intentionally incomplete until missing physical vendor runners upload evidence. Software adapters do not satisfy this contract.'
};

const lines = [
  '# WebGPU Multi-Adapter Evidence Matrix',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Status: **${status}** (${passed}/${vendors.length} required vendor classes passing)`,
  '',
  '| Vendor | Evidence | Adapter | Driver | Thermal | Fallback | Cost | N-chain | Source |',
  '|---|---|---|---|---|---:|---:|---|---|',
  ...rows.map(
    (row) =>
      `| ${row.vendor} | ${row.status} | ${row.adapter?.name ?? row.adapter?.description ?? 'missing'} (${row.adapter?.architecture ?? 'n/a'}) | ${row.driverVersion ?? 'n/a'} | ${row.thermalState} | ${row.fallbackRate === null ? 'n/a' : `${(row.fallbackRate * 100).toFixed(1)}%`} | ${row.estimatedCostUsd === null ? 'n/a' : `$${row.estimatedCostUsd.toFixed(4)}`} | ${row.nChainPassed ? `pass (${row.nChainDimension}D)` : 'missing/fail'} | ${row.source ? `\`${row.source}\`` : 'none'} |`
  ),
  '',
  '## Contract',
  '',
  '- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.',
  '- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, and N-chain STM/QR comparisons against CPU f64.',
  '- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.',
  '',
  `Caveat: ${report.caveat}`
];

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-adapter-matrix.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-adapter-matrix.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));

if (status === 'fail' || (process.env.GPU_MATRIX_REQUIRE_COMPLETE === '1' && status !== 'pass')) process.exitCode = 1;
