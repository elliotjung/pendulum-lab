import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

interface RiskArea {
  id?: unknown;
  sourcePaths?: unknown;
  testPaths?: unknown;
  requiredAssertions?: unknown;
  failureModes?: unknown;
}

interface RiskRegister {
  schemaVersion?: unknown;
  coverageTargets?: Record<string, unknown>;
  riskAreas?: unknown;
}

async function regularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

export async function validateQualityRiskRegister(path = 'documents/testing-risk-register.json'): Promise<string[]> {
  const register = JSON.parse(await readFile(path, 'utf8')) as RiskRegister;
  const problems: string[] = [];
  if (register.schemaVersion !== 'pendulum-testing-risk-register/v1') problems.push('unsupported risk-register schema');
  const targets = register.coverageTargets ?? {};
  for (const [metric, minimum] of Object.entries({ lines: 65, statements: 65, branches: 60, functions: 60 })) {
    if (typeof targets[metric] !== 'number' || targets[metric] < minimum) {
      problems.push(`${metric} target must be at least ${minimum}%`);
    }
  }
  const areas = Array.isArray(register.riskAreas) ? (register.riskAreas as RiskArea[]) : [];
  if (areas.length < 7) problems.push('all seven priority risk areas must be registered');
  const ids = new Set<string>();
  for (const area of areas) {
    const id = typeof area.id === 'string' ? area.id : '';
    if (!id || ids.has(id)) problems.push(`risk area id is missing or duplicated: ${id || '<missing>'}`);
    ids.add(id);
    const sources = strings(area.sourcePaths);
    const tests = strings(area.testPaths);
    const assertions = strings(area.requiredAssertions);
    const failureModes = strings(area.failureModes);
    if (sources.length === 0 || tests.length === 0) problems.push(`${id}: sourcePaths and testPaths are required`);
    if (assertions.length < 3 || failureModes.length < 3) {
      problems.push(`${id}: at least three failure injections and failure modes are required`);
    }
    for (const source of [...sources, ...tests]) {
      if (!(await regularFile(source))) problems.push(`${id}: missing registered file ${source}`);
    }
    const testSource = (await Promise.all(tests.map((test) => readFile(test, 'utf8').catch(() => '')))).join('\n');
    for (const assertion of assertions) {
      if (!testSource.includes(assertion)) problems.push(`${id}: registered assertion text is absent: ${assertion}`);
    }
  }
  return problems;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const problems = await validateQualityRiskRegister();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Quality risk register passed: seven priority areas retain source, failure-mode, and test evidence.');
  }
}
