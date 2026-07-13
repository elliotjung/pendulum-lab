import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this report through `npm run pack:report`.');
const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});
const report = JSON.parse(output) as unknown;
await writeFile('reports/npm-pack-dry-run.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('reports/npm-pack-dry-run.json updated from npm pack --dry-run');
