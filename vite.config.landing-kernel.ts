import { defineConfig } from 'vite';

/**
 * Produces the exact browser ESM copied into pendulum-landing. The entry imports
 * the authoritative rhsDouble implementation, so the demo is a derived build
 * artifact rather than a separately maintained equation port.
 */
export default defineConfig({
  build: {
    outDir: 'reports/landing-kernel',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/integrations/landingDemoKernel.ts',
      name: 'PendulumLandingDemoKernel',
      formats: ['es'],
      fileName: () => 'pendulum-demo-kernel.js'
    },
    rollupOptions: {
      output: { exports: 'named' }
    }
  }
});
