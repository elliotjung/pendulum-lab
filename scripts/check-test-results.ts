/**
 * Guard against the silent-failure trap of `vitest --reporter=json`: the JSON
 * reporter prints almost nothing to stdout, so a failed run can look "clean"
 * in a log tail while verify actually halted. This step re-reads the report
 * and fails loudly unless every test passed, printing the counts either way.
 * Wired into `npm run verify` between test:json and docs:sync.
 */
import { readFileSync } from 'node:fs';

interface VitestSummary {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numFailedTestSuites?: number;
}

const REPORT = 'reports/vitest-results.json';

let summary: VitestSummary;
try {
  summary = JSON.parse(readFileSync(REPORT, 'utf8')) as VitestSummary;
} catch (error) {
  console.error(`test-results check FAILED: cannot read ${REPORT}: ${String(error)}`);
  process.exit(1);
}

const total = summary.numTotalTests ?? 0;
const passed = summary.numPassedTests ?? 0;
const failed = summary.numFailedTests ?? 0;
const failedSuites = summary.numFailedTestSuites ?? 0;

if (total === 0 || failed > 0 || failedSuites > 0 || passed !== total) {
  console.error(
    `test-results check FAILED: passed ${passed}/${total}, failedTests ${failed}, failedSuites ${failedSuites} (${REPORT})`
  );
  process.exit(1);
}

console.log(`test-results check ok: ${passed}/${total} passed, 0 failed suites`);
