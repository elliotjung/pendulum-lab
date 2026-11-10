import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evidencePath } from './parity-capture';

export function packagedBuildCommands(root: string, outDir: string, args: readonly string[] = []) {
  if (!/^(?:tmp\/.+|dist(?:-[^/]+)?(?:\/.*)?)$/.test(outDir))
    throw new Error('A generated tmp/... or dist directory is required.');
  const target = evidencePath(root, outDir);
  if (existsSync(target) && readdirSync(target).length)
    throw new Error('Refusing to overwrite a nonempty frozen build. Choose a new output directory.');
  if (args.some((arg) => /^--outDir(?:=|$)|^--root(?:=|$)/i.test(arg)))
    throw new Error('The captured output/root cannot be overridden.');
  return [
    [
      process.execPath,
      path.resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(root, 'scripts/redesign/validate-catalog.ts')
    ],
    [process.execPath, path.resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, ...args],
    [process.execPath, path.resolve(root, 'scripts/copy-legacy-assets.mjs'), '--out-dir', outDir],
    [
      process.execPath,
      path.resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(root, 'scripts/audit-public-artifacts.ts'),
      '--root',
      `${outDir}/reports`
    ]
  ];
}
export function runPackagedBuild(root: string, outDir: string, args: readonly string[] = []) {
  for (const command of packagedBuildCommands(root, outDir, args)) {
    const result = spawnSync(command[0]!, command.slice(1), {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: process.env
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] !== '--out-dir' || !args[1] || (args.length > 2 && args[2] !== '--'))
    throw new Error('Usage: parity-build.ts --out-dir tmp/NAME [-- Vite arguments]');
  process.exitCode = runPackagedBuild(process.cwd(), args[1], args.slice(3));
}
