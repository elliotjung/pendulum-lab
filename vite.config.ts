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

export default defineConfig({
  appType: 'mpa',
  plugins: [serveAppShellAtRoot()],
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
        "connect-src 'self' ws:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        app: 'app.html',
        indexRuntime: 'src/main.ts'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Code-split the independent subsystems out of the single application
        // bundle. Each is a self-contained layer (physics core, chaos
        // diagnostics, research tooling, and the analysis/governance UI), so
        // splitting on directory keeps related code together, lets the browser
        // parse them in parallel, and improves caching — the app no longer ships
        // as one >500 kB chunk. The parity/governance UI and the analysis tabs
        // are mutually dependent, so they stay in one `app-tabs` chunk to avoid a
        // circular chunk split. The standalone single-file build
        // (vite.config.standalone.ts) inlines everything and is unaffected.
        manualChunks(id: string) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/src/')) return undefined;
          if (path.includes('/src/physics/')) return 'physics';
          if (path.includes('/src/chaos/')) return 'chaos';
          if (path.includes('/src/research/')) return 'research';
          if (path.includes('/src/app/')) return 'app-tabs';
          return undefined;
        }
      }
    }
  }
});
