import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

type Vendor = 'intel' | 'nvidia' | 'amd';
type MatrixStatus = 'pass' | 'partial' | 'fail';

interface LadderEvidence {
  schemaVersion?: string;
  generatedAt?: string;
  status?: 'pass' | 'fail';
  channel?: string;
  adapter?: {
    name?: string;
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
    features?: string[];
    limits?: Record<string, number>;
  } | null;
  provenance?: {
    kernelSetHash?: string;
    adapterFeatureFingerprint?: string | null;
    toleranceTableHash?: string;
  };
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
  /** Evidence age against the vendor-artifact TTL. */
  ageDays: number | null;
  freshness: 'fresh' | 'stale' | 'missing';
  adapter: LadderEvidence['adapter'];
  /**
   * Driver/browser drift signal: fingerprint of adapter identity + capability
   * surface + browser channel, compared against the previous artifact for the
   * same vendor. `driftSincePrevious` is null when only one artifact exists.
   */
  environmentFingerprint: string | null;
  previousEnvironmentFingerprint: string | null;
  driftSincePrevious: boolean | null;
  browserChannel: string | null;
  kernelSetHash: string | null;
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
const ttlDays = Number.isFinite(Number(process.env.GPU_MATRIX_TTL_DAYS)) && Number(process.env.GPU_MATRIX_TTL_DAYS) > 0
  ? Number(process.env.GPU_MATRIX_TTL_DAYS)
  : 90;

function evidenceAgeDays(evidence: LadderEvidence): number | null {
  const generated = Date.parse(String(evidence.generatedAt ?? ''));
  return Number.isFinite(generated) ? (Date.now() - generated) / (24 * 60 * 60 * 1000) : null;
}

/** Stable digest of everything that identifies the execution environment. */
function environmentFingerprint(evidence: LadderEvidence): string {
  const adapter = evidence.adapter ?? {};
  const payload = JSON.stringify({
    name: adapter.name ?? null,
    vendor: adapter.vendor ?? null,
    architecture: adapter.architecture ?? null,
    device: adapter.device ?? null,
    description: adapter.description ?? null,
    features: [...(adapter.features ?? [])].sort(),
    limits: Object.entries(adapter.limits ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    channel: evidence.channel ?? null
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
      ageDays: null,
      freshness: 'missing',
      adapter: null,
      environmentFingerprint: null,
      previousEnvironmentFingerprint: null,
      driftSincePrevious: null,
      browserChannel: null,
      kernelSetHash: null,
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
  const previous = available[1];
  const nChainPassed = selected.evidence.nChainVariational?.backend === 'webgpu'
    && selected.evidence.nChainVariational?.comparison?.passed === true;
  const nChainTrajectoryTapePassed = selected.evidence.nChainTrajectoryTape?.backend === 'webgpu'
    && selected.evidence.nChainTrajectoryTape?.comparison?.passed === true;
  const passed = selected.evidence.status === 'pass' && nChainTrajectoryTapePassed && nChainPassed;
  const ageDays = evidenceAgeDays(selected.evidence);
  const freshness: VendorRow['freshness'] = ageDays !== null && ageDays <= ttlDays ? 'fresh' : 'stale';
  const fingerprint = environmentFingerprint(selected.evidence);
  const previousFingerprint = previous ? environmentFingerprint(previous.evidence) : null;
  return {
    vendor,
    status: passed ? 'pass' : 'fail',
    source: relative(process.cwd(), selected.path).replace(/\\/g, '/'),
    generatedAt: selected.evidence.generatedAt ?? null,
    ageDays: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    freshness,
    adapter: selected.evidence.adapter ?? null,
    environmentFingerprint: fingerprint,
    previousEnvironmentFingerprint: previousFingerprint,
    driftSincePrevious: previousFingerprint === null ? null : previousFingerprint !== fingerprint,
    browserChannel: selected.evidence.channel ?? null,
    kernelSetHash: selected.evidence.provenance?.kernelSetHash ?? null,
    nChainTrajectoryTapePassed,
    nChainTrajectoryTapeDimension: selected.evidence.nChainTrajectoryTape?.dimension ?? null,
    nChainPassed,
    nChainDimension: selected.evidence.nChainVariational?.dimension ?? null,
    caveat: passed
      ? freshness === 'fresh'
        ? 'Real-adapter ladder passed reductions, 4D diagnostics, the N-chain trajectory/tape gate, and the N-chain STM/QR oracle gate.'
        : `Real-adapter ladder passed all gates, but the artifact is older than the ${ttlDays}-day TTL; driver/browser drift since capture is unverified.`
      : 'A hardware artifact exists, but one or more CPU-oracle promotion gates failed.',
    expectedRunnerLabels: ['self-hosted', 'webgpu', vendor],
    expectedArtifactName: `gpu-ladder-${vendor}`,
    nextAction: passed
      ? freshness === 'fresh'
        ? 'Keep this vendor runner on the scheduled WebGPU evidence cadence and refresh after driver/browser updates.'
        : `Re-dispatch WebGPU Vendor Evidence for vendor=${vendor}: the artifact exceeded the ${ttlDays}-day TTL.`
      : `Inspect ${relative(process.cwd(), selected.path).replace(/\\/g, '/')} and rerun WebGPU Vendor Evidence for vendor=${vendor} after fixing the failed CPU-oracle gate.`
  };
});

const passed = rows.filter((row) => row.status === 'pass').length;
const failed = rows.filter((row) => row.status === 'fail').length;
const status: MatrixStatus = failed > 0 ? 'fail' : passed === vendors.length ? 'pass' : 'partial';
const staleVendors = rows.filter((row) => row.freshness === 'stale').map((row) => row.vendor);
const driftedVendors = rows.filter((row) => row.driftSincePrevious === true).map((row) => row.vendor);
const report = {
  schemaVersion: 'pendulum-gpu-adapter-matrix/v1',
  generatedAt: new Date().toISOString(),
  status,
  requiredVendors: vendors,
  coverage: { passed, required: vendors.length, missing: vendors.length - passed - failed, failed },
  ttlDays,
  staleVendors,
  driftedVendors,
  rows,
  missingVendors: rows.filter((row) => row.status === 'missing').map((row) => row.vendor),
  actionItems: rows.filter((row) => row.status !== 'pass' || row.freshness === 'stale').map((row) => row.nextAction),
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
  `Status: **${status}** (${passed}/${vendors.length} required vendor classes passing; TTL ${ttlDays} days)`,
  '',
  '| Vendor | Evidence | Freshness (age) | Env drift | Adapter | Architecture | N-chain tape | N-chain STM/QR | Source | Next action |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((row) => `| ${row.vendor} | ${row.status} | ${row.freshness}${row.ageDays === null ? '' : ` (${row.ageDays}d)`} | ${row.driftSincePrevious === null ? 'n/a' : row.driftSincePrevious ? 'CHANGED' : 'stable'} | ${row.adapter?.name ?? row.adapter?.description ?? 'missing'} | ${row.adapter?.architecture ?? 'n/a'} | ${row.nChainTrajectoryTapePassed ? `pass (${row.nChainTrajectoryTapeDimension}D)` : 'missing/fail'} | ${row.nChainPassed ? `pass (${row.nChainDimension}D)` : 'missing/fail'} | ${row.source ? `\`${row.source}\`` : 'none'} | ${row.nextAction} |`),
  '',
  '## Contract',
  '',
  '- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.',
  '- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, N-chain trajectory/tape, and N-chain STM/QR comparisons against CPU f64.',
  '- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.',
  '- Missing rows list the exact self-hosted labels and artifact name required to close the evidence gap.',
  `- Vendor artifacts expire after ${ttlDays} days (override with GPU_MATRIX_TTL_DAYS); stale rows keep their verdict but demand refresh. Set GPU_MATRIX_ENFORCE_TTL=1 to fail on stale evidence.`,
  '- The environment fingerprint (adapter identity + features/limits + browser channel) flags driver/browser drift between successive artifacts of the same vendor.',
  '',
  `Caveat: ${report.caveat}`
];

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-adapter-matrix.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-adapter-matrix.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));

if (status === 'fail'
  || (process.env.GPU_MATRIX_REQUIRE_COMPLETE === '1' && status !== 'pass')
  || (process.env.GPU_MATRIX_ENFORCE_TTL === '1' && staleVendors.length > 0)) process.exitCode = 1;
