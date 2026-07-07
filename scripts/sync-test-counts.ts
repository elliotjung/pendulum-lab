import { readFile, rename, writeFile } from 'node:fs/promises';

interface VitestJsonReport {
  numTotalTests?: number;
  numPassedTests?: number;
  testResults?: unknown[];
}

interface EvidenceSummaryReport {
  tests?: {
    total?: number;
    passed?: number;
    files?: number;
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
  if (!Number.isInteger(report.numTotalTests) || !Number.isInteger(report.numPassedTests) || !Array.isArray(report.testResults)) {
    throw new Error(`Invalid Vitest JSON report at ${path}`);
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
  if (!tests || !Number.isInteger(tests.total) || !Number.isInteger(tests.passed) || !Number.isInteger(tests.files)) {
    throw new Error(`Invalid evidence summary at ${path}`);
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

const summary = await readEvidenceSummary('reports/evidence-summary.json').catch(() => readReport('reports/vitest-results.json'));
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
    pattern: /\| `npm test`(?: \/ `test:quick` \/ `test:slow`)? \| Vitest unit suite \([^)]*\)(?: plus quick\/slow tiers for local and CI iteration)? \|/,
    replace: ({ totalTests, testFiles }) => `| \`npm test\` / \`test:quick\` / \`test:slow\` | Vitest unit suite (${totalTests} tests across ${testFiles} files; synced from \`reports/vitest-results.json\`) plus quick/slow tiers for local and CI iteration |`
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
    file: 'docs/engine-overview.md',
    pattern: /layer is unit-tested \([^)]*\) and the build, typecheck, and Playwright/,
    replace: ({ totalTests, testFiles }) => `layer is unit-tested (${totalTests} tests across ${testFiles} files, synced from \`reports/vitest-results.json\`) and the build, typecheck, and Playwright`
  },
  {
    file: 'docs/tutorial-reproduce-paper.md',
    pattern: /npm test\s+# [^\n]+/,
    replace: ({ totalTests }) => `npm test                      # ${totalTests} unit tests (physics, chaos, research tooling)`
  },
  {
    file: 'docs/portfolio-korean.md',
    pattern: /^  - .*Playwright E2E\(Chromium\/Firefox\/WebKit\/모바일\)$/m,
    replace: ({ totalTests }) => `  - 단위 테스트 ${totalTests}개, Playwright E2E(Chromium/Firefox/WebKit/모바일)`
  },
  {
    file: 'docs/api-overview.md',
    pattern: /\| Surface \| Status in [^|]+ \| Migration target \| Earliest removal \|/,
    replace: ({ version }) => `| Surface | Status in ${version} | Migration target | Earliest removal |`
  }
];

for (const replacement of replacements) {
  await replaceInFile(replacement, metadata);
}

console.log(`Synced project metadata: v${metadata.version}, ${metadata.passedTests}/${metadata.totalTests} tests across ${metadata.testFiles} files.`);
