import { readFile, rename, writeFile } from 'node:fs/promises';

interface VitestJsonReport {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numFailedTestSuites?: number;
  testResults?: unknown[];
  success?: boolean;
}

interface EvidenceSummaryReport {
  tests?: {
    total?: number;
    passed?: number;
    failed?: number;
    files?: number;
    success?: boolean;
  };
}

interface Replacement {
  file: string;
  pattern: RegExp;
  replace: (metadata: ProjectMetadata) => string;
}

interface TestSummary {
  totalTests: number;
  passedTests: number;
  testFiles: number;
}

interface PackageJson {
  version?: unknown;
}

interface ProjectMetadata extends TestSummary {
  version: string;
}

async function readReport(path: string): Promise<TestSummary> {
  const report = JSON.parse(await readFile(path, 'utf8')) as VitestJsonReport;
  if (
    !Number.isInteger(report.numTotalTests) ||
    !Number.isInteger(report.numPassedTests) ||
    !Number.isInteger(report.numFailedTests) ||
    !Array.isArray(report.testResults) ||
    report.numTotalTests! <= 0 ||
    report.numPassedTests !== report.numTotalTests ||
    report.numFailedTests !== 0 ||
    (report.numPendingTests ?? 0) !== 0 ||
    (report.numFailedTestSuites ?? 0) !== 0 ||
    report.success !== true
  ) {
    throw new Error(`Vitest JSON report at ${path} is invalid, incomplete, or unsuccessful`);
  }
  return {
    totalTests: Number(report.numTotalTests),
    passedTests: Number(report.numPassedTests),
    testFiles: report.testResults.length
  };
}

async function readEvidenceSummary(path: string): Promise<TestSummary> {
  const report = JSON.parse(await readFile(path, 'utf8')) as EvidenceSummaryReport;
  const tests = report.tests;
  if (
    !tests ||
    !Number.isInteger(tests.total) ||
    !Number.isInteger(tests.passed) ||
    !Number.isInteger(tests.failed) ||
    !Number.isInteger(tests.files) ||
    tests.total! <= 0 ||
    tests.passed !== tests.total ||
    tests.failed !== 0 ||
    tests.success !== true
  ) {
    throw new Error(`Evidence summary at ${path} does not contain a successful complete test run`);
  }
  return {
    totalTests: Number(tests.total),
    passedTests: Number(tests.passed),
    testFiles: Number(tests.files)
  };
}

async function readPackageVersion(path: string): Promise<string> {
  const packageJson = JSON.parse(await readFile(path, 'utf8')) as PackageJson;
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error(`Invalid package version in ${path}`);
  }
  return packageJson.version;
}

async function replaceInFile({ file, pattern, replace }: Replacement, metadata: ProjectMetadata): Promise<void> {
  const original = await readFile(file, 'utf8');
  if (!pattern.test(original)) throw new Error(`No test-count marker matched in ${file}`);

  const updated = original.replace(pattern, replace(metadata));
  if (updated === original) return;

  const tempFile = `${file}.tmp-${process.pid}`;
  await writeFile(tempFile, updated);
  await rename(tempFile, file);
}

// `verify` writes the Vitest report immediately before syncing documentation.
// Prefer that current run so an older evidence snapshot cannot overwrite fresh
// test counts while a release-evidence commit is being prepared.
const summary = await readReport('reports/vitest-results.json').catch(() =>
  readEvidenceSummary('reports/evidence-summary.json')
);
const metadata: ProjectMetadata = {
  ...summary,
  version: await readPackageVersion('package.json')
};

const replacements: Replacement[] = [
  {
    file: 'src/runtime/version.ts',
    pattern: /export const APP_VERSION = '[^']+';/,
    replace: ({ version }) => `export const APP_VERSION = '${version}';`
  },
  {
    file: 'README.md',
    pattern:
      /\| `npm test`(?: \/ `test:quick` \/ `test:slow`)? \| Vitest unit suite \([^)]*\)(?: plus quick\/slow tiers for local and CI iteration)? \|/,
    replace: ({ totalTests, testFiles }) =>
      `| \`npm test\` / \`test:quick\` / \`test:slow\` | Vitest unit suite (${totalTests} tests across ${testFiles} files; synced from \`reports/vitest-results.json\`) plus quick/slow tiers for local and CI iteration |`
  },
  {
    file: 'README.md',
    pattern: /npm test\s+# [^\n]+/,
    replace: ({ totalTests }) => `npm test           # ${totalTests} unit tests`
  },
  {
    file: 'CHANGELOG.md',
    pattern: /(### [^\n]*\(additive; suite\s+\d+[^\d\n]+)\d+(\))/,
    replace: ({ totalTests }) => `$1${totalTests}$2`
  },
  {
    file: 'documents/engine-overview.md',
    pattern: /layer is unit-tested \([^)]*\) and the build, typecheck, and Playwright/,
    replace: ({ totalTests, testFiles }) =>
      `layer is unit-tested (${totalTests} tests across ${testFiles} files, synced from \`reports/vitest-results.json\`) and the build, typecheck, and Playwright`
  },
  {
    file: 'documents/tutorial-reproduce-paper.md',
    pattern: /npm test\s+# [^\n]+/,
    replace: ({ totalTests }) =>
      `npm test                      # ${totalTests} unit tests (physics, chaos, research tooling)`
  },
  {
    file: 'documents/portfolio-korean.md',
    pattern: /^  - .*Playwright E2E\(Chromium\/Firefox\/WebKit\/모바일\)$/m,
    replace: ({ totalTests }) => `  - 단위 테스트 ${totalTests}개, Playwright E2E(Chromium/Firefox/WebKit/모바일)`
  },
  {
    file: 'documents/api-overview.md',
    pattern: /\| Surface \| Status in [^|]+ \| Migration target \| Earliest removal \|/,
    replace: ({ version }) => `| Surface | Status in ${version} | Migration target | Earliest removal |`
  }
];

for (const replacement of replacements) {
  await replaceInFile(replacement, metadata);
}

console.log(
  `Synced project metadata: v${metadata.version}, ${metadata.passedTests}/${metadata.totalTests} tests across ${metadata.testFiles} files.`
);
