import { readFile, writeFile } from 'node:fs/promises';

interface VitestJsonReport {
  numTotalTests?: number;
  numPassedTests?: number;
  testResults?: unknown[];
}

interface Replacement {
  file: string;
  pattern: RegExp;
  replace: (summary: TestSummary) => string;
}

interface TestSummary {
  totalTests: number;
  passedTests: number;
  testFiles: number;
}

async function readReport(path: string): Promise<TestSummary> {
  const report = JSON.parse(await readFile(path, 'utf8')) as VitestJsonReport;
  if (!Number.isInteger(report.numTotalTests) || !Number.isInteger(report.numPassedTests) || !Array.isArray(report.testResults)) {
    throw new Error(`Invalid Vitest JSON report at ${path}`);
  }
  const totalTests = Number(report.numTotalTests);
  const passedTests = Number(report.numPassedTests);
  const testFiles = report.testResults.length;
  return { totalTests, passedTests, testFiles };
}

async function replaceInFile({ file, pattern, replace }: Replacement, summary: TestSummary): Promise<void> {
  const original = await readFile(file, 'utf8');
  const updated = original.replace(pattern, replace(summary));
  if (updated === original) throw new Error(`No test-count marker matched in ${file}`);
  await writeFile(file, updated);
}

const summary = await readReport('reports/vitest-results.json');

await Promise.all([
  replaceInFile({
    file: 'README.md',
    pattern: /\| `npm test` \| Vitest unit suite \([^)]*\) \|/,
    replace: ({ totalTests, testFiles }) => `| \`npm test\` | Vitest unit suite (${totalTests} tests across ${testFiles} files; synced from \`reports/vitest-results.json\`) |`
  }, summary),
  replaceInFile({
    file: 'docs/engine-overview.md',
    pattern: /layer is unit-tested \([^)]*\) and the build, typecheck, and Playwright/,
    replace: ({ totalTests, testFiles }) => `layer is unit-tested (${totalTests} tests across ${testFiles} files, synced from \`reports/vitest-results.json\`) and the build, typecheck, and Playwright`
  }, summary)
]);

console.log(`Synced unit-test count: ${summary.passedTests}/${summary.totalTests} tests across ${summary.testFiles} files.`);
