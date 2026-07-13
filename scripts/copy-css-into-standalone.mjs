import { readFile, writeFile, rm, readdir } from 'node:fs/promises';

// The standalone build inlines all JS into one HTML file, but the hand-written
// CSS is linked statically (not a Vite asset), so the single-file plugin leaves
// the <link> tags pointing at ./css/*.css. Inline those into <style> blocks so
// the result is truly one self-contained file that opens via file:// with no
// sibling assets.
//
// The standalone build's input is `app.html`, so it emits `standalone/app.html`.
// We inline the CSS and write the finished release artifact only under
// standalone/. The repository tracks a compact SHA-256 manifest rather than a
// fresh ~850 KB generated HTML blob on every release.
const builtPath = 'standalone/app.html';
let html = await readFile(builtPath, 'utf8');

const linkRe = /<link[^>]*rel="stylesheet"[^>]*href="\.\/(css\/[^"]+\.css)"[^>]*>/gi;
const matches = [...html.matchAll(linkRe)];
for (const m of matches) {
  const cssPath = m[1];
  let css = '';
  try {
    css = await readFile(cssPath, 'utf8');
  } catch {
    continue; // leave the link if the file is missing
  }
  html = html.replace(m[0], `<style data-inlined-from="${cssPath}">\n${css}\n</style>`);
}

await writeFile('standalone/index.html', html, 'utf8');
// Remove the intermediate so only the canonical index.html remains in standalone/.
await rm(builtPath, { force: true });

const standaloneFiles = await readdir('standalone');
const workerFiles = standaloneFiles.filter((f) => /\.worker.*\.js$/i.test(f));

console.log(
  `Wrote self-contained standalone/index.html` +
    (workerFiles.length ? ` (+${workerFiles.length} worker sibling${workerFiles.length > 1 ? 's' : ''})` : '')
);
