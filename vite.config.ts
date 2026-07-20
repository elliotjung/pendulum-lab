import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * In dev, the live module shell lives in `app.html` (it loads `src/main.ts`
 * with HMR). The physical root `index.html` is the self-contained, double-click
 * portable build produced by `npm run build:standalone`. This middleware makes
 * the dev server serve the live `app.html` at `/` (and `/index.html`) so the
 * dev experience and Playwright E2E (which navigate to `/`) always exercise the
 * current source rather than the prebuilt portable file.
 */
function serveAppShellAtRoot(): Plugin {
  return {
    name: 'serve-app-shell-at-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        const path = url.split('?')[0];
        if (path === '/' || path === '/index.html') {
          req.url = '/app.html' + url.slice(path.length);
        }
        next();
      });
    }
  };
}

/** Stamp the public service-worker template with the exact emitted bundle. */
function stampServiceWorkerRevision(): Plugin {
  let revision = 'development';
  return {
    name: 'stamp-service-worker-revision',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      for (const file of Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))) {
        hash.update(file.fileName);
        hash.update(file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : file.source);
      }
      revision = hash.digest('hex').slice(0, 16);
    },
    async writeBundle(options) {
      const outputDirectory = resolve(process.cwd(), options.dir ?? 'dist');
      const template = await readFile(resolve(process.cwd(), 'public/sw.js'), 'utf8');
      await writeFile(resolve(outputDirectory, 'sw.js'), template.replaceAll('__BUILD_REVISION__', revision), 'utf8');
    }
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [serveAppShellAtRoot(), stampServiceWorkerRevision()],
  // Relative asset URLs so the production build works when served from any path
  // (e.g. a GitHub Pages project site under /repo/, or a plain static server),
  // not only from the web root.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "worker-src 'self'",
        "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  },
  build: {
    sourcemap: false,
    modulePreload: { polyfill: true },
    target: 'es2022',
    rollupOptions: {
      input: {
        app: 'app.html',
        reviewer: 'reviewer.html'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Code-split the independent subsystems out of the single application
        // bundle. Runtime app orchestration stays with the entry, while the
        // heavyweight analysis tabs and parity/research UI sit behind dynamic
        // imports. The standalone single-file build (vite.config.standalone.ts)
        // inlines everything and is unaffected.
        manualChunks(id: string) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/src/')) return undefined;
          if (path.includes('/src/app/parity/') || path.endsWith('/src/app/FeatureParityLayer.ts'))
            return 'research-ui';
          // One chunk per analysis tab so the lazy per-tab mount in
          // bootstrap.ts defers each tab's bytes until activation.
          const tab =
            /\/src\/app\/(LyapunovTab|ValidationTab|SweepTab|CompareTab|BifurcationTab|Phase3DTab|DensityTab|ExpansionLabTab|ResearchMatrixTab|GoldenCenterTab|ZeroOneTab|ClvTab|BasinTab|RqaTab|FtleTab|ResearchPlusTab)\.ts$/.exec(
              path
            );
          if (tab) return `tab-${tab[1]!.toLowerCase()}`;
          if (/\/src\/app\/(?:TabController|resultBadges|DomBinder)\.ts$/.test(path)) return 'app-tabs';
          if (path.includes('/src/physics/')) return 'physics';
          if (path.includes('/src/chaos/')) return 'chaos';
          if (path.includes('/src/research/')) return 'research';
          return undefined;
        }
      }
    }
  }
});
