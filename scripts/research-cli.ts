/**
 * Headless research CLI. Runs pure chaos jobs, continuation routines, control
 * reports, batch specs, and stochastic/estimation demos without a browser.
 *
 * Examples:
 *   npx tsx scripts/research-cli.ts lyapunov --state 2,2.5,0,0
 *   npx tsx scripts/research-cli.ts spectrum --state 2,2.5,0,0 --steps 30000
 *   npx tsx scripts/research-cli.ts studypoint --state 2.5,2.5,0,0
 *   npx tsx scripts/research-cli.ts basin --n 100 --out reports/basin.json
 *   npx tsx scripts/research-cli.ts wada --n 150
 *   npx tsx scripts/research-cli.ts ftle --n 48 --horizon 5
 *   npx tsx scripts/research-cli.ts rqa --state 2.5,2.5,0,0
 *   npx tsx scripts/research-cli.ts zeroone --state 2.1,2.9,0,0
 *   npx tsx scripts/research-cli.ts orbit --amplitude 0.3 --frequency 0.6667 --damping 0.5
 *   npx tsx scripts/research-cli.ts continue --from 0.2 --to 1.2 --step 0.02
 *   npx tsx scripts/research-cli.ts pitchfork --damping 0.5 --frequency 0.6667
 *   npx tsx scripts/research-cli.ts estimate --estimate g,l2 --g 9.81 --l2 1 --guess 8,0.8
 *   npx tsx scripts/research-cli.ts sde --sigma 0.5 --scheme milstein --realizations 400
 *
 * Shared options: --m1 --m2 --l1 --l2 --g, --state th1,th2,w1,w2,
 * --out file.json, and --full to keep bulky arrays in the JSON payload.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runResearchCommand, type CliArgs } from './research/commands';

function parseArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] ?? '';
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, 'true');
    }
  }
  return { command, flags };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const result = await runResearchCommand(args);
  const payload = {
    schemaVersion: 'pendulum-research-cli/v1',
    command: args.command,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    result
  };
  const out = args.flags.get('out');
  const text = JSON.stringify(payload, null, 2);
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text, 'utf8');
    console.log(`wrote ${out} (${args.command}, ${payload.elapsedMs} ms)`);
  } else {
    console.log(text);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
