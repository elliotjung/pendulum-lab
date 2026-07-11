/**
 * Drift guard for the committed self-contained bundle. The project root
 * `index.html` and its `*.worker.js` siblings are build:standalone outputs
 * that are tracked in git so the double-click file:// demo works from a bare
 * checkout. That makes "edit src/, forget to rebuild, ship a stale demo" a
 * silent failure mode.
 *
 * This check runs AFTER `npm run build:standalone` (which rewrites the root
 * artifacts in place) and fails if git now sees any of them as modified,
 * missing, or newly created — i.e. if the committed bundle no longer matches
 * what the current source builds. The standalone build is deterministic, so a
 * clean diff is exactly "bundle is in sync".
 *
 * Wired into CI (ci.yml / main.yml) right after the build:standalone step;
 * run locally with `npm run build:standalone && npm run check:standalone-sync`.
 */
import { execFileSync } from 'node:child_process';

const artifactPatterns = ['index.html', '*.worker.js'];

let porcelain = '';
try {
  porcelain = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...artifactPatterns],
    { encoding: 'utf8' }
  );
} catch (error) {
  console.error(`standalone-sync check FAILED: git status did not run: ${String(error)}`);
  process.exit(1);
}

const drifted = porcelain
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (drifted.length > 0) {
  console.error(
    'standalone-sync check FAILED: the committed standalone bundle does not match a fresh build of the current source.\n' +
      drifted.map((line) => `  ${line}`).join('\n') +
      '\nRun `npm run build:standalone` and commit the regenerated root index.html / *.worker.js together with your source change.'
  );
  process.exit(1);
}

console.log('standalone-sync check ok: committed root bundle matches the current source build');
