import { readFile, writeFile } from 'node:fs/promises';

interface VitestJsonReport {
  numTotalTests?: number;
  numPassedTests?: number;
  testResults?: unknown[];
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
  const totalTests = Number(report.numTotalTests);
  const passedTests = Number(report.numPassedTests);
  const testFiles = report.testResults.length;
  return { totalTests, passedTests, testFiles };
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
  // Distinguish "marker missing" (an error) from "already up to date" (fine):
  // a no-op replacement used to throw and fail `npm run verify` spuriously.
  if (!pattern.test(original)) throw new Error(`No test-count marker matched in ${file}`);
  const updated = original.replace(pattern, replace(metadata));
  if (updated !== original) await writeFile(file, updated);
}

const summary = await readReport('reports/vitest-results.json');
const metadata: ProjectMetadata = {
  ...summary,
  version: await readPackageVersion('package.json')
};

await Promise.all([
  replaceInFile({
    file: 'src/runtime/version.ts',
    pattern: /export const APP_VERSION = '[^']+';/,
    replace: ({ version }) => `export const APP_VERSION = '${version}';`
  }, metadata),
  replaceInFile({
    file: 'README.md',
    pattern: /\| `npm test` \| Vitest unit suite \([^)]*\) \|/,
    replace: ({ totalTests, testFiles }) => `| \`npm test\` | Vitest unit suite (${totalTests} tests across ${testFiles} files; synced from \`reports/vitest-results.json\`) |`
  }, metadata),
  replaceInFile({
    file: 'README.md',
    pattern: /npm test\s+# [^\n]+/,
    replace: ({ totalTests }) => `npm test           # ${totalTests} unit tests`
  }, metadata),
  replaceInFile({
    file: 'docs/engine-overview.md',
    pattern: /layer is unit-tested \([^)]*\) and the build, typecheck, and Playwright/,
    replace: ({ totalTests, testFiles }) => `layer is unit-tested (${totalTests} tests across ${testFiles} files, synced from \`reports/vitest-results.json\`) and the build, typecheck, and Playwright`
  }, metadata),
  replaceInFile({
    file: 'docs/tutorial-reproduce-paper.md',
    pattern: /npm test\s+# [^\n]+/,
    replace: ({ totalTests }) => `npm test                      # ${totalTests} unit tests (physics, chaos, research tooling)`
  }, metadata),
  replaceInFile({
    file: 'docs/portfolio-korean.md',
    pattern: /단위 테스트 [0-9]+(?:\+)?개/,
    replace: ({ totalTests }) => `단위 테스트 ${totalTests}개`
  }, metadata),
  replaceInFile({
    file: 'docs/api-overview.md',
    pattern: /\| Surface \| Status in [^|]+ \| Migration target \| Earliest removal \|/,
    replace: ({ version }) => `| Surface | Status in ${version} | Migration target | Earliest removal |`
  }, metadata)
]);

console.log(`Synced project metadata: v${metadata.version}, ${metadata.passedTests}/${metadata.totalTests} tests across ${metadata.testFiles} files.`);
