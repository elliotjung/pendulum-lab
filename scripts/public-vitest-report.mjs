import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const inputPath = process.argv[2] ?? 'reports/vitest-results.json';
const outputPath = process.argv[3] ?? 'reports/vitest-public-results.json';
const report = JSON.parse(await readFile(inputPath, 'utf8'));

const relativeTestPath = (value) => {
  const normalized = String(value ?? '').replaceAll('\\', '/');
  const marker = '/tests/';
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) return normalized.slice(index + 1);
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? 'unknown-test-file';
};

// Parameterized test titles can contain path fixtures even after the test-file
// name itself is normalized. Keep the useful test catalogue while ensuring a
// public report cannot preserve a developer, runner, or absolute fixture path.
const publicTestLabel = (value) =>
  String(value ?? '')
    .replace(/\b[A-Za-z]:[\\/][^\r\n"'<>]*/g, '[absolute-path]')
    .replace(/file:\/\/\/[^\s"'<>]+/gi, '[absolute-path]')
    .replace(/(?<![A-Za-z0-9.])\/(?:home|Users)\/[A-Za-z0-9._-]+\/[^\s"'<>]*/g, '[absolute-path]')
    .replace(
      /(?<![A-Za-z0-9.])\/(?:github\/workspace|workspace|private\/var\/folders|tmp)\/[^\s"'<>]*/g,
      '[absolute-path]'
    );

const publicReport = {
  schemaVersion: 'pendulum-public-vitest-report/v1',
  generatedAt:
    typeof report.startTime === 'number' && Number.isFinite(report.startTime)
      ? new Date(report.startTime).toISOString()
      : null,
  startTime: report.startTime,
  success: report.success === true,
  numTotalTestSuites: report.numTotalTestSuites,
  numPassedTestSuites: report.numPassedTestSuites,
  numFailedTestSuites: report.numFailedTestSuites,
  numPendingTestSuites: report.numPendingTestSuites,
  numTotalTests: report.numTotalTests,
  numPassedTests: report.numPassedTests,
  numFailedTests: report.numFailedTests,
  numPendingTests: report.numPendingTests,
  testResults: Array.isArray(report.testResults)
    ? report.testResults.map((result) => ({
        name: relativeTestPath(result?.name),
        status: result?.status ?? 'unknown',
        startTime: result?.startTime ?? null,
        endTime: result?.endTime ?? null,
        assertionResults: Array.isArray(result?.assertionResults)
          ? result.assertionResults.map((assertion) => ({
              ancestorTitles: Array.isArray(assertion?.ancestorTitles)
                ? assertion.ancestorTitles.map(publicTestLabel)
                : [],
              title: publicTestLabel(assertion?.title),
              status: assertion?.status ?? 'unknown'
            }))
          : []
      }))
    : []
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(publicReport, null, 2)}\n`, 'utf8');
console.log(
  `Public Vitest report written (${publicReport.numPassedTests ?? 0}/${publicReport.numTotalTests ?? 0}, ${publicReport.testResults.length} files).`
);
