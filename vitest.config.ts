import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Heavy numerical suites (continuation, SDE ensembles) can exceed the 5s
    // default under full-suite CPU contention; they are still bounded here.
    testTimeout: 30_000,
    coverage: {
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'reports/coverage',
      // Only the source tree; keeping the v8 provider off generated bundles
      // (root worker file, dist) whose source maps crash its remapping pass.
      // Vitest 4 always includes untested files matching `include`, so every
      // source file now appears in the map (0% when untested).
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/demo/**'],
      // Ratchet thresholds (CI gate via `npm run test:coverage`): set just
      // below the measured baseline so coverage can only go up. Raise them
      // deliberately when coverage improves.
      thresholds: {
        // Measured baseline (2026-07, vitest 4 ast-v8-to-istanbul remap —
        // branch counting differs from the vitest 1.x numbers): physics 55.8%
        // branches (defensive ?? fallbacks dominate), chaos 65.6%, research
        // branches remeasured at 67.7%.
        'src/physics/**': { statements: 85, branches: 55, functions: 85 },
        'src/chaos/**': { statements: 80, branches: 65, functions: 80 },
        'src/research/**': { statements: 75, branches: 67, functions: 75 }
      }
    }
  }
});
