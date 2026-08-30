import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function workflowFiles(directory = '.github/workflows'): Promise<string[]> {
  return (await readdir(directory)).filter((name) => /\.ya?ml$/u.test(name)).map((name) => join(directory, name));
}

export async function validateActionsRuntime(): Promise<string[]> {
  const problems: string[] = [];
  const [nodeVersion, composite, dependabot, ...workflows] = await Promise.all([
    readFile('.node-version', 'utf8'),
    readFile('.github/actions/setup-node-project/action.yml', 'utf8'),
    readFile('.github/dependabot.yml', 'utf8'),
    ...(await workflowFiles()).map((path) => readFile(path, 'utf8'))
  ]);
  const exactNode = nodeVersion.trim();
  if (!/^\d+\.\d+\.\d+$/u.test(exactNode)) problems.push('.node-version must be an exact semantic version');
  if (!composite.includes(`default: '${exactNode}'`)) {
    problems.push('composite setup action default must match .node-version exactly');
  }
  const sources = [composite, ...workflows];
  for (const source of sources) {
    for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
      const reference = match[1] ?? '';
      if (reference.startsWith('./')) continue;
      const at = reference.lastIndexOf('@');
      const revision = at >= 0 ? reference.slice(at + 1) : '';
      if (!/^[a-f0-9]{40}$/u.test(revision))
        problems.push(`third-party action is not pinned to a full SHA: ${reference}`);
    }
  }
  if (!/package-ecosystem:\s*github-actions[\s\S]*?interval:\s*weekly/u.test(dependabot)) {
    problems.push('GitHub Actions updates must be reviewed at least weekly');
  }
  const mainline = workflows.find((source) => source.includes('name: Mainline Full Validation')) ?? '';
  if (!mainline.includes('npm run build:standalone') || !mainline.includes('Run the native visual regression gate')) {
    problems.push('mainline must revalidate standalone determinism and native visual baselines after runtime changes');
  }
  return problems;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const problems = await validateActionsRuntime();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('Actions runtime contract passed: exact Node pin, full action SHAs, and weekly review policy.');
  }
}
