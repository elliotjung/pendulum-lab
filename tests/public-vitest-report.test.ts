import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public Vitest evidence', () => {
  it('retains the review catalogue without exposing runner or developer paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pendulum-vitest-public-'));
    const input = join(directory, 'raw.json');
    const output = join(directory, 'public.json');
    try {
      await writeFile(
        input,
        JSON.stringify({
          startTime: Date.parse('2026-08-25T00:00:00.000Z'),
          success: true,
          numTotalTestSuites: 2,
          numPassedTestSuites: 2,
          numFailedTestSuites: 0,
          numPendingTestSuites: 0,
          numTotalTests: 2,
          numPassedTests: 2,
          numFailedTests: 0,
          numPendingTests: 0,
          testResults: [
            {
              name: 'C:\\Users\\developer\\pendulum_lab_modular\\tests\\alpha.test.ts',
              status: 'passed',
              assertionResults: [
                {
                  ancestorTitles: ['alpha at /home/runner/private/fixture.json'],
                  title: 'rejects C:/secret.txt',
                  status: 'passed'
                }
              ]
            },
            {
              name: '/home/runner/work/pendulum-lab/pendulum-lab/tests/beta.test.ts',
              status: 'passed',
              assertionResults: [{ ancestorTitles: ['beta'], title: 'passes', status: 'passed' }]
            }
          ]
        }),
        'utf8'
      );

      execFileSync(process.execPath, ['scripts/public-vitest-report.mjs', input, output], { stdio: 'pipe' });
      const text = await readFile(output, 'utf8');
      const report = JSON.parse(text) as {
        schemaVersion: string;
        testResults: Array<{
          name: string;
          assertionResults: Array<{ ancestorTitles: string[]; title: string }>;
        }>;
      };
      expect(report.schemaVersion).toBe('pendulum-public-vitest-report/v1');
      expect(report.testResults.map(({ name }) => name)).toEqual(['tests/alpha.test.ts', 'tests/beta.test.ts']);
      expect(text).not.toContain('C:\\Users');
      expect(text).not.toContain('/home/runner');
      expect(text).not.toContain('C:/secret.txt');
      expect(report.testResults[0]?.assertionResults[0]).toEqual({
        ancestorTitles: ['alpha at [absolute-path]'],
        title: 'rejects [absolute-path]',
        status: 'passed'
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
