import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

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
  nChainTrajectoryTape?: {
    backend?: string;
    comparison?: { passed?: boolean } | null;
    dimension?: number;
  } | null;
  nChainVariational?: {
    backend?: string;
    comparison?: { passed?: boolean; ftleAbsDiff?: number; clv?: { metrics?: Record<string, number | boolean> } } | null;
    dimension?: number;
  } | null;
}

interface VendorRow {
  vendor: Vendor;
  status: 'pass' | 'fail' | 'missing';
  source: string | null;
  generatedAt: string | null;
  adapter: LadderEvidence['adapter'];
  nChainTrajectoryTapePassed: boolean;
  nChainTrajectoryTapeDimension: number | null;
  nChainPassed: boolean;
  nChainDimension: number | null;
  caveat: string;
  expectedRunnerLabels: string[];
  expectedArtifactName: string;
  nextAction: string;
}

const vendors: Vendor[] = ['intel', 'nvidia', 'amd'];
const inputRoot = process.env.GPU_MATRIX_INPUT_DIR ?? 'reports';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
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
  const text = [evidence.adapter?.vendor, evidence.adapter?.name, evidence.adapter?.architecture, evidence.adapter?.device, evidence.adapter?.description]
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
  const available = candidates.get(vendor)!
    .sort((a, b) => String(b.evidence.generatedAt ?? '').localeCompare(String(a.evidence.generatedAt ?? '')));
  const selected = available[0];
  if (!selected) {
    return {
      vendor,
      status: 'missing',
      source: null,
      generatedAt: null,
      adapter: null,
      nChainTrajectoryTapePassed: false,
      nChainTrajectoryTapeDimension: null,
      nChainPassed: false,
      nChainDimension: null,
      caveat: `No ${vendor} hardware ladder artifact was supplied. This row is not simulated or inferred.`,
      expectedRunnerLabels: ['self-hosted', 'webgpu', vendor],
      expectedArtifactName: `gpu-ladder-${vendor}`,
      nextAction: `Provision or enable a physical ${vendor} WebGPU runner labelled self-hosted, webgpu, ${vendor}; dispatch WebGPU Vendor Evidence with vendor=${vendor}; download artifact gpu-ladder-${vendor}; rerun npm run benchmark:gpu-matrix.`
    };
  }
  const nChainPassed = selected.evidence.nChainVariational?.backend === 'webgpu'
    && selected.evidence.nChainVariational?.comparison?.passed === true;
  const nChainTrajectoryTapePassed = selected.evidence.nChainTrajectoryTape?.backend === 'webgpu'
    && selected.evidence.nChainTrajectoryTape?.comparison?.passed === true;
  const passed = selected.evidence.status === 'pass' && nChainTrajectoryTapePassed && nChainPassed;
  return {
    vendor,
    status: passed ? 'pass' : 'fail',
    source: relative(process.cwd(), selected.path).replace(/\\/g, '/'),
    generatedAt: selected.evidence.generatedAt ?? null,
    adapter: selected.evidence.adapter ?? null,
    nChainTrajectoryTapePassed,
    nChainTrajectoryTapeDimension: selected.evidence.nChainTrajectoryTape?.dimension ?? null,
    nChainPassed,
    nChainDimension: selected.evidence.nChainVariational?.dimension ?? null,
    caveat: passed
      ? 'Real-adapter ladder passed reductions, 4D diagnostics, the N-chain trajectory/tape gate, and the N-chain STM/QR oracle gate.'
      : 'A hardware artifact exists, but one or more CPU-oracle promotion gates failed.',
    expectedRunnerLabels: ['self-hosted', 'webgpu', vendor],
    expectedArtifactName: `gpu-ladder-${vendor}`,
    nextAction: passed
      ? 'Keep this vendor runner on the scheduled WebGPU evidence cadence and refresh after driver/browser updates.'
      : `Inspect ${relative(process.cwd(), selected.path).replace(/\\/g, '/')} and rerun WebGPU Vendor Evidence for vendor=${vendor} after fixing the failed CPU-oracle gate.`
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
  missingVendors: rows.filter((row) => row.status === 'missing').map((row) => row.vendor),
  actionItems: rows.filter((row) => row.status !== 'pass').map((row) => row.nextAction),
  reproduce: 'npm run benchmark:gpu-matrix',
  collectionContract: {
    runnerLabels: vendors.map((vendor) => ['self-hosted', 'webgpu', vendor]),
    artifactName: 'gpu-ladder-<vendor>',
    rule: 'Only reports produced on a real adapter and passing same-run CPU f64 oracle gates count as vendor evidence.'
  },
  caveat: status === 'pass'
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
  '| Vendor | Evidence | Adapter | Architecture | N-chain tape | N-chain STM/QR | Source | Next action |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((row) => `| ${row.vendor} | ${row.status} | ${row.adapter?.name ?? row.adapter?.description ?? 'missing'} | ${row.adapter?.architecture ?? 'n/a'} | ${row.nChainTrajectoryTapePassed ? `pass (${row.nChainTrajectoryTapeDimension}D)` : 'missing/fail'} | ${row.nChainPassed ? `pass (${row.nChainDimension}D)` : 'missing/fail'} | ${row.source ? `\`${row.source}\`` : 'none'} | ${row.nextAction} |`),
  '',
  '## Contract',
  '',
  '- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.',
  '- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, N-chain trajectory/tape, and N-chain STM/QR comparisons against CPU f64.',
  '- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.',
  '- Missing rows list the exact self-hosted labels and artifact name required to close the evidence gap.',
  '',
  `Caveat: ${report.caveat}`
];

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-adapter-matrix.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-adapter-matrix.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));

if (status === 'fail' || (process.env.GPU_MATRIX_REQUIRE_COMPLETE === '1' && status !== 'pass')) process.exitCode = 1;
