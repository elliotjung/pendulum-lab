import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('Docker build-context exclusions', () => {
  test('excludes generated output, VCS data, and common secret files', async () => {
    const text = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
    const rules = new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    for (const required of [
      '.git',
      'node_modules',
      'dist',
      'coverage',
      'test-results',
      'playwright-report',
      '.env',
      '.env.*',
      '.npmrc',
      '*.pem',
      '*.key',
      'credentials/',
      'secrets/'
    ]) {
      expect(rules.has(required), `missing .dockerignore rule: ${required}`).toBe(true);
    }

    expect(rules.has('!.env.example')).toBe(true);
  });
});
