import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Standalone build: inlines everything (JS + CSS) into a single self-contained
 * HTML file with classic (non-module-fetch) loading, so it can be opened by
 * double-clicking from the file system (`file://`) — no server required.
 *
 * Two adjustments are needed for `file://`:
 *  - the `<meta>` CSP `script-src 'self'` would block the inlined script, so it
 *    is relaxed to allow inline scripts/workers for this local artifact;
 *  - workers are emitted in a format that the single-file inliner can embed; if
 *    a browser still refuses to start them over `file://`, the chaos/worker code
 *    transparently falls back to the main thread.
 *
 * Output: `standalone/index.html`. Run with `npm run build:standalone`.
 */

export function relaxCspForFileProtocolHtml(html: string): string {
  return html.replace(
    /<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' data: blob:">`
  );
}

function relaxCspForFileProtocol(): Plugin {
  return {
    name: 'relax-csp-for-file-protocol',
    transformIndexHtml: relaxCspForFileProtocolHtml
  };
}

export default defineConfig({
  base: './',
  // Every application chunk is inlined by the plugin, so the Vite preload
  // loader would be dead code in the portable artifact.  Removing it keeps
  // the `file://` release semantically identical while avoiding a duplicate
  // runtime bootstrap.
  plugins: [relaxCspForFileProtocol(), viteSingleFile({ removeViteModuleLoader: true })],
  worker: {
    format: 'iife',
    // Deterministic, hash-free worker filenames. The standalone build emits the
    // chaos/expansion workers as siblings of index.html; with a content hash in
    // the name every rebuild produced a *new* tracked file (and orphaned the
    // old one in git), churning history and risking an index.html that points at
    // an untracked worker. Stable names keep the tracked filename constant.
    rollupOptions: {
      output: {
        entryFileNames: '[name].js'
      }
    }
  },
  build: {
    outDir: 'standalone',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: 'app.html',
      output: {
        minify: {
          compress: { target: 'es2022', maxIterations: 20 },
          mangle: { toplevel: true },
          codegen: { removeWhitespace: true, legalComments: 'none' }
        }
      }
    }
  }
});
