import { readFile } from 'node:fs/promises';
import { runCliBatch, validateCliBatchSpec } from '../../../src/research/cliBatchSpec';
import { runBifurcationCommand } from './bifurcation';
import { runControlCommand } from './control';
import { runEstimationCommand } from './estimation';
import { doubleSpec, flagState, type CliArgs, type CommandHandler } from './shared';
import { runTorusCommand } from './torus';
import { runWorkerCommand } from './worker';

export { type CliArgs } from './shared';

const HANDLERS: CommandHandler[] = [
  runWorkerCommand,
  runBifurcationCommand,
  runEstimationCommand,
  runTorusCommand,
  runControlCommand
];

export const RESEARCH_COMMANDS = [
  'lyapunov',
  'spectrum',
  'zeroone',
  'rqa',
  'ftle',
  'basin',
  'wada',
  'wadaconv',
  'codim2',
  'studypoint',
  'orbit',
  'continue',
  'switch',
  'pitchfork',
  'transcritical',
  'melnikov',
  'estimate',
  'sde',
  'nstorus',
  'nsbranch',
  'arnold',
  'toruslyap',
  'nsconv',
  'drift',
  'gali',
  'lqr',
  'chainlqr',
  'swingup',
  'ilqr',
  'batch'
];

export const RESEARCH_EXAMPLES = [
  'npx tsx scripts/research-cli.ts lyapunov --state 2,2.5,0,0',
  'npx tsx scripts/research-cli.ts wadaconv --resolutions 40,60,90 --maxTime 15',
  'npx tsx scripts/research-cli.ts codim2 --n 12 --afrom 0.2 --ato 1.6',
  'npx tsx scripts/research-cli.ts estimate --estimate g,l2 --g 9.81 --l2 1',
  'npx tsx scripts/research-cli.ts pitchfork --damping 0.5 --frequency 0.6667',
  'npx tsx scripts/research-cli.ts sde --sigma 0.5 --scheme milstein --realizations 400',
  'npx tsx scripts/research-cli.ts batch --spec study-spec.json --out results.json',
  'npx tsx scripts/research-cli.ts nsbranch --damping 0.5 --frequency 0.6667 --from 1.05 --to 1.12 --step 0.005 --amp 0.05'
];

export async function runResearchCommand(args: CliArgs): Promise<unknown> {
  if (args.command === 'batch') return runBatchCommand(args);
  const spec = doubleSpec(args.flags);
  const state0 = flagState(args.flags, [2, 2.5, 0, 0]);
  for (const handler of HANDLERS) {
    const result = handler(args, spec, state0);
    if (result !== undefined) return result;
  }
  return helpPayload();
}

async function runBatchCommand(args: CliArgs): Promise<unknown> {
  const specPath = args.flags.get('spec');
  if (!specPath) throw new Error('batch requires --spec <file.json>');
  const parsed = JSON.parse(await readFile(specPath, 'utf8')) as unknown;
  const validation = validateCliBatchSpec(parsed);
  if (!validation.ok || !validation.spec) throw new Error(`invalid batch spec: ${validation.problems.join('; ')}`);
  return runCliBatch(validation.spec);
}

function helpPayload(): unknown {
  return {
    usage: 'npx tsx scripts/research-cli.ts <command> [--flags]',
    commands: RESEARCH_COMMANDS,
    sharedFlags: ['--m1 --m2 --l1 --l2 --g', '--state th1,th2,w1,w2', '--out file.json', '--full (keep raster arrays)'],
    examples: RESEARCH_EXAMPLES
  };
}
