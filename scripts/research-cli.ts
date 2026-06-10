/**
 * Headless research CLI. Runs the same pure chaos jobs the app's worker runs
 * (`runChaosJob`) plus the periodic-orbit/continuation library — no browser, no
 * DOM — and prints JSON (or writes it with --out). Examples:
 *
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
 *
 * Shared options: --m1 --m2 --l1 --l2 --g (double-pendulum parameters),
 * --state th1,th2,w1,w2 — defaults match the app's Lab defaults.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runChaosJob, type ChaosRequest } from '../src/workers/chaosProtocol';
import {
  doublePendulumFlipBasin,
  wadaCandidate,
  drivenPeriodicOrbit,
  continueDrivenPeriodicOrbit,
  switchPeriodDoubling,
  melnikovVerdict,
  melnikovCriticalAmplitude
} from '../src/chaos';
import type { SystemSpec } from '../src/physics/systemSpec';

interface CliArgs {
  command: string;
  flags: Map<string, string>;
}

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

function flagNum(flags: Map<string, string>, key: string, fallback: number): number {
  const raw = flags.get(key);
  const value = raw === undefined ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function flagState(flags: Map<string, string>, fallback: number[]): number[] {
  const raw = flags.get('state');
  if (!raw) return fallback;
  const parts = raw.split(',').map((part) => Number.parseFloat(part.trim()));
  return parts.every(Number.isFinite) ? parts : fallback;
}

function doubleSpec(flags: Map<string, string>): Extract<SystemSpec, { kind: 'double' }> {
  return {
    kind: 'double',
    m1: flagNum(flags, 'm1', 1),
    m2: flagNum(flags, 'm2', 1),
    l1: flagNum(flags, 'l1', 1.2),
    l2: flagNum(flags, 'l2', 1),
    g: flagNum(flags, 'g', 9.81)
  };
}

function job(flags: Map<string, string>, request: ChaosRequest): unknown {
  const response = runChaosJob(request);
  if (!response.ok) throw new Error(response.error);
  // Drop bulky raster payloads unless --full is passed (they dwarf the metrics).
  if (!flags.has('full')) {
    const slim = { ...response } as Record<string, unknown>;
    for (const key of ['labels', 'values', 'plot', 'pPath', 'qPath', 'kValues', 'convergence']) {
      if (Array.isArray(slim[key])) slim[key] = `[${(slim[key] as unknown[]).length} values — rerun with --full]`;
    }
    return slim;
  }
  return response;
}

function run(args: CliArgs): unknown {
  const { command, flags } = args;
  const spec = doubleSpec(flags);
  const state0 = flagState(flags, [2, 2.5, 0, 0]);
  switch (command) {
    case 'lyapunov':
      return job(flags, {
        id: 'cli', kind: 'lyapunov', spec, state0,
        settings: { dt: flagNum(flags, 'dt', 0.01), steps: flagNum(flags, 'steps', 20000) }
      });
    case 'spectrum':
      return job(flags, {
        id: 'cli', kind: 'lyapunovSpectrum', spec, state0,
        settings: { dt: flagNum(flags, 'dt', 0.01), steps: flagNum(flags, 'steps', 20000) }
      });
    case 'zeroone':
      return job(flags, { id: 'cli', kind: 'zeroOne', spec, state0 });
    case 'rqa':
      return job(flags, { id: 'cli', kind: 'rqa', spec, state0 });
    case 'ftle':
      return job(flags, {
        id: 'cli', kind: 'ftle', spec,
        settings: { n: flagNum(flags, 'n', 32), totalTime: flagNum(flags, 'horizon', 5) }
      });
    case 'basin':
      return job(flags, { id: 'cli', kind: 'basin', spec, settings: { n: flagNum(flags, 'n', 100) } });
    case 'studypoint':
      return job(flags, {
        id: 'cli', kind: 'studyPoint', spec, state0,
        settings: { ftleHorizon: flagNum(flags, 'horizon', 5) }
      });
    case 'wada': {
      // Standalone Wada refinement: report the fraction at several radii so
      // resolution-dependence is visible (candidacy needs it stable near 1).
      const n = flagNum(flags, 'n', 120);
      const grid = doublePendulumFlipBasin(
        { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g },
        { n, maxTime: flagNum(flags, 'maxTime', 12) }
      );
      const radii = [1, 2, 3, 5];
      return {
        n,
        results: radii.map((radius) => {
          const r = wadaCandidate(grid, radius);
          return { radius, wadaFraction: r.wadaFraction, boundaryCells: r.boundaryCells, numColors: r.numColors, wadaCandidate: r.wadaCandidate };
        })
      };
    }
    case 'orbit': {
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 0.3),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const result = drivenPeriodicOrbit(base, [flagNum(flags, 'th0', 0), flagNum(flags, 'w0', 0)], {
        dt: flagNum(flags, 'dt', 0.005),
        tolerance: 1e-10
      });
      return { base, ...result };
    }
    case 'switch': {
      // Period-doubling branch switch. Defaults target the classic cascade:
      // γ=0.5, ω=2/3, A=1.07 (just past A_PD ≈ 1.066), oscillating branch.
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 1.07),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const p1 = drivenPeriodicOrbit(base, [flagNum(flags, 'th0', -0.29), flagNum(flags, 'w0', 1.97)], {
        dt: flagNum(flags, 'dt', 0.005),
        tolerance: 1e-10
      });
      if (!p1.converged) throw new Error('period-1 Newton did not converge — adjust --th0/--w0');
      const sw = switchPeriodDoubling(base, p1.orbit, { dt: flagNum(flags, 'dt', 0.005), tolerance: 1e-10 });
      return {
        base,
        period1: { orbit: p1.orbit, multipliers: p1.multipliers, stable: p1.stable },
        switched: sw.switched,
        criticalMultiplier: sw.criticalMultiplier,
        separation: sw.separation,
        period2: {
          orbit: sw.doubled.orbit,
          cycle: sw.doubled.cycle,
          multipliers: sw.doubled.multipliers,
          stable: sw.doubled.stable,
          residual: sw.doubled.residual
        }
      };
    }
    case 'melnikov': {
      // Analytic homoclinic-chaos threshold for the damped driven pendulum:
      // verdict at the given parameters plus the A_c(ω) curve for context.
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'amplitude', 1.15),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      const wFrom = flagNum(flags, 'wfrom', 0.2);
      const wTo = flagNum(flags, 'wto', 2);
      const wSteps = Math.max(2, Math.round(flagNum(flags, 'wsteps', 19)));
      const curve = Array.from({ length: wSteps }, (_, i) => {
        const driveFrequency = wFrom + ((wTo - wFrom) * i) / (wSteps - 1);
        return { driveFrequency, criticalAmplitude: melnikovCriticalAmplitude({ ...base, driveFrequency }) };
      });
      return { base, verdict: melnikovVerdict(base), criticalCurve: curve };
    }
    case 'continue': {
      const base = {
        g: flagNum(flags, 'g', 1),
        length: flagNum(flags, 'l', 1),
        damping: flagNum(flags, 'damping', 0.5),
        driveAmplitude: flagNum(flags, 'from', 0.2),
        driveFrequency: flagNum(flags, 'frequency', 2 / 3)
      };
      return continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: flagNum(flags, 'from', 0.2),
        end: flagNum(flags, 'to', 1.2),
        step: flagNum(flags, 'step', 0.02)
      });
    }
    default:
      return {
        usage: 'npx tsx scripts/research-cli.ts <command> [--flags]',
        commands: ['lyapunov', 'spectrum', 'zeroone', 'rqa', 'ftle', 'basin', 'wada', 'studypoint', 'orbit', 'continue', 'switch', 'melnikov'],
        sharedFlags: ['--m1 --m2 --l1 --l2 --g', '--state th1,th2,w1,w2', '--out file.json', '--full (keep raster arrays)'],
        examples: [
          'npx tsx scripts/research-cli.ts lyapunov --state 2,2.5,0,0',
          'npx tsx scripts/research-cli.ts wada --n 150',
          'npx tsx scripts/research-cli.ts orbit --amplitude 0.3 --damping 0.5'
        ]
      };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const result = run(args);
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
