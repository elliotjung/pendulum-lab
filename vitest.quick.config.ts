import { defineConfig } from 'vitest/config';
import { SLOW_TEST_FILES } from './vitest.tiers';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [...SLOW_TEST_FILES],
    testTimeout: 30_000
  }
});
