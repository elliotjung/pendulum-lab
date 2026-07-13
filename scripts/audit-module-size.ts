import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE_ROOT = 'src';
const DEFAULT_MAX_LINES = 650;

// Ratchet values are exact line counts re-pinned after the 2026-07-13 one-time
// Prettier re-baseline (formatting-only line growth). Any further growth still
// fails the gate; the split priorities recorded per entry are unchanged.
const KNOWN_LARGE_MODULES: Record<string, { maxLines: number; owner: string }> = {
  'src/app/parity/research-workbench.ts': {
    maxLines: 1930,
    owner: 'split into experiment library, batch runner, design study, comparison matrix'
  },
  'src/app/parity/figure-export.ts': { maxLines: 941, owner: 'split exporters by artifact type' },
  'src/app/parity/governance-ui.ts': { maxLines: 979, owner: 'split command palette, manifest, mode controls' },
  'src/app/ExpansionLabTab.ts': { maxLines: 872, owner: 'split controller, rendering, persistence' },
  'src/workers/chaosProtocol.ts': { maxLines: 700, owner: 'split request schemas from job handlers' },
  'src/app/parity/runtime-diagnostics.ts': { maxLines: 925, owner: 'split probes, benchmarks, validation surface' },
  'src/app/parity/shared.ts': { maxLines: 651, owner: 'split shared DOM, formatting, and state helpers by concern' },
  'src/app/parity/storage-sync.ts': {
    maxLines: 766,
    owner: 'split schema migration, persistence, and cross-tab synchronization'
  },
  'src/app/audienceMode.ts': {
    maxLines: 763,
    owner: 'split mode chooser housing, navigation decoration, and adopted-sheet CSS by concern'
  },
  'src/app/ResearchMatrixTab.ts': { maxLines: 652, owner: 'split matrix state from golden-run rendering' },
  'src/physics/expandedModels-research.ts': { maxLines: 720, owner: 'split research runners from preset tables' },
  'src/physics/stochastic.ts': { maxLines: 671, owner: 'split SDE steppers from noise-process helpers' },
  'src/runtime/gpuChaosPromotion.ts': { maxLines: 698, owner: 'split promotion contracts by diagnostic' },
  'src/runtime/gpuFields.ts': { maxLines: 666, owner: 'split field kernels from dispatch plumbing' }
};

interface Finding {
  file: string;
  lines: number;
  limit: number;
  message: string;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(normalize(full));
    }
  }
  return out;
}

async function lineCount(path: string): Promise<number> {
  const text = await readFile(path, 'utf8');
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

const findings: Finding[] = [];
const files = await walk(SOURCE_ROOT);

for (const file of files) {
  const lines = await lineCount(file);
  const known = KNOWN_LARGE_MODULES[file];
  const limit = known?.maxLines ?? DEFAULT_MAX_LINES;
  if (lines > limit) {
    findings.push({
      file,
      lines,
      limit,
      message: known
        ? `known large module exceeded ratchet (${known.owner})`
        : 'new oversized module; split responsibilities before expanding it'
    });
  }
}

const obsoleteKnown = Object.keys(KNOWN_LARGE_MODULES).filter((file) => !files.includes(file));
for (const file of obsoleteKnown) {
  findings.push({
    file,
    lines: 0,
    limit: 0,
    message: 'known-large-module entry is obsolete; remove it from the audit config'
  });
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.lines}/${finding.limit} lines - ${finding.message}`);
  }
  process.exitCode = 1;
} else {
  const largeCount = Object.keys(KNOWN_LARGE_MODULES).length;
  console.log(`module-size audit passed (${files.length} source files, ${largeCount} known large-module ratchets).`);
}
