import { defineConfig } from 'vitest/config';

/**
 * Mutation instrumentation is intentionally slower than the normal suite.
 * High-sample statistical anchors remain in the normal suite but are excluded
 * here: Stryker's probe on every hot-loop branch changes their cost by orders
 * of magnitude without adding useful mutant discrimination. Deterministic
 * stepper and ensemble contracts remain mutation-tested.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/stochastic-statistical-anchors.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000
  }
});
