import { defineConfig } from 'vite';

/**
 * Library build: packages the headless research core (src/lib.ts) as an ES
 * module for reuse outside the app (Node scripts, other front-ends, papers'
 * analysis pipelines). Type declarations are emitted separately by
 * `tsc -p tsconfig.lib.json`; API docs by `npm run docs:api`.
 */
export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        'pendulum-lab-core': 'src/lib.ts',
        core: 'src/lib/core.ts',
        analysis: 'src/lib/analysis.ts',
        research: 'src/lib/research.ts',
        experimental: 'src/lib/experimental.ts',
        browser: 'src/lib/browser.ts',
        worker: 'src/lib/worker.ts',
        node: 'src/lib/node.ts'
      },
      name: 'PendulumLabCore',
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      output: { exports: 'named' }
    }
  }
});
