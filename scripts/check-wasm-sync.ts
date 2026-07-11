/**
 * Drift guard for the committed WASM kernel: `src/runtime/wasm/*.wasm` is the
 * `build:wasm` output of `wasm/assembly/*.ts` and is tracked in git so tests,
 * scripts and builds work from a bare checkout without the AssemblyScript
 * toolchain running. Run AFTER `npm run build:wasm` (which recompiles in
 * place); fails if git sees the binary as modified — i.e. if the committed
 * kernel no longer matches the current AssemblyScript source.
 */
import { execFileSync } from 'node:child_process';

let porcelain = '';
try {
  porcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src/runtime/wasm'], {
    encoding: 'utf8'
  });
} catch (error) {
  console.error(`wasm-sync check FAILED: git status did not run: ${String(error)}`);
  process.exit(1);
}

const drifted = porcelain
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (drifted.length > 0) {
  console.error(
    'wasm-sync check FAILED: the committed WASM kernel does not match a fresh build of wasm/assembly.\n' +
      drifted.map((line) => `  ${line}`).join('\n') +
      '\nRun `npm run build:wasm` and commit the regenerated kernel together with the AssemblyScript change.'
  );
  process.exit(1);
}

console.log('wasm-sync check ok: committed kernel matches the current AssemblyScript source');
