/**
 * One-command reproduction of the research results — `npm run reproduce`.
 *
 * Recomputes every headline result *deterministically* from the library (the
 * same code paths the tests, worker and CLI use — no browser), hashes each, and
 * writes a single manifest (`reports/reproduce/manifest.json`) plus a
 * human-readable `reports/reproduce/REPRODUCE.md` listing every result, its
 * value, a content hash, and the exact command that regenerates it. Exits
 * non-zero if any reproduction throws, so CI can gate on it.
 *
 * This is the computational backbone of the figure pipeline: the heavy
 * browser-rendered artifacts (`npm run paper:build`, `npm run notebook`) and the
 * external cross-checks (`validate:cross`, `validate:sympy`, `validate:ns`) are
 * listed at the end as the remaining one-liners, so the whole result set
 * regenerates from this file plus those commands.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { EmbeddedSphericalChain } from '../src/physics/sphericalEmbeddedChain';
import {
  continueNeimarkSackerTorus,
  scanModeLocking,
  sineCircleMap,
  torusLyapunovSpectrum,
  neimarkSackerSpectralConvergence,
  switchTranscriticalBranch,
  type PlanarMapSystem
} from '../src/chaos';
import { energyDriftProfile } from '../src/research/structurePreservation';
import { runLangevinEnsemble } from '../src/physics/stochastic';
import { rhsChain, energyChain, createChainWorkspace } from '../src/physics/nPendulum';
import { hashText } from '../src/research/researchExportUtils';
import type { Derivative, StateVector } from '../src/physics/types';

interface Reproduction {
  id: string;
  description: string;
  command: string;
  value: Record<string, unknown>;
}

const delayedLogistic: PlanarMapSystem = {
  map: (s, a, out) => {
    out[0] = a * s[0]! * (1 - s[1]!);
    out[1] = s[0]!;
  },
  center: (a) => {
    const x = (a - 1) / a;
    return [x, x];
  }
};

const reproductions: Array<() => Reproduction> = [
  () => {
    // Item 1: embedded chain conserves E and L_z through a near-pole passage.
    const params = { masses: [1.3, 0.7], lengths: [1.1, 0.9], g: 9.81, damping: 0 };
    const sim = EmbeddedSphericalChain.fromAngles(params, Float64Array.of(0.5, 0, 1.2, 0, 0, 0, 0, 0.03), 0.002);
    for (let i = 0; i < 4000; i += 1) sim.step(0.002);
    const d = sim.diagnostics();
    return {
      id: 'embedded-chain-pole-passage',
      description: 'Embedded spherical chain: relative E/Lz drift through a near-pole passage (pole-clamp-free).',
      command: '(library) EmbeddedSphericalChain — tests/spherical-embedded-chain.test.ts',
      value: { energyDrift: d.energyDrift, lzDrift: d.lzDrift, unitConstraintError: d.unitConstraintError }
    };
  },
  () => {
    // Item 2: NS invariant-circle rotation number → 1/6 at onset.
    const cont = continueNeimarkSackerTorus(delayedLogistic, {
      start: 2.05,
      end: 2.01,
      step: 0.01,
      initialAmplitude: 0.24,
      collocation: 31,
      tolerance: 1e-10,
      maxIterations: 40
    });
    const last = cont.points[cont.points.length - 1]!;
    return {
      id: 'ns-torus-rotation-number',
      description: 'Neimark-Sacker invariant circle: rotation number ρ at a = 2.01 (→ 1/6 at onset).',
      command: 'npm run research -- nstorus',
      value: {
        a: last.parameter,
        rotationNumber: last.rotationNumber,
        invarianceResidual: last.invarianceResidual,
        converged: last.converged
      }
    };
  },
  () => {
    // Item 5: the 1/2 Arnold tongue of the sine circle map (K = 1).
    const scan = scanModeLocking((omega) => sineCircleMap(omega, 1), {
      start: 0.4,
      end: 0.6,
      steps: 80,
      rationals: [[1, 2]],
      tolerance: 1e-5,
      rotationOptions: { iterations: 80000, transient: 2000 }
    });
    const half = scan.tongues.find((t) => t.p === 1 && t.q === 2)!;
    return {
      id: 'arnold-tongue-half',
      description: 'Sine circle map (K=1): the 1/2 Arnold tongue interval and width.',
      command: 'npm run research -- arnold --k 1',
      value: { start: half.start, end: half.end, width: half.end - half.start, monotone: scan.monotone }
    };
  },
  () => {
    // Item 6: Lyapunov spectrum on the torus — neutral largest exponent.
    const a = 2.02;
    const center = (a - 1) / a;
    const res = torusLyapunovSpectrum(delayedLogistic, a, [center + 0.12, center], {
      iterations: 40000,
      transient: 5000
    });
    return {
      id: 'torus-lyapunov',
      description: 'Lyapunov spectrum on the NS torus: neutral on-circle exponent, attracting transverse.',
      command: 'npm run research -- toruslyap --a 2.02',
      value: { largest: res.largest, transverse: res.transverseExponent, verdict: res.verdict }
    };
  },
  () => {
    // Item 8: NS spectral-convergence gate.
    const conv = neimarkSackerSpectralConvergence(delayedLogistic, 2.02, {
      initialAmplitude: 0.18,
      tolerance: 1e-12,
      maxIterations: 60,
      floor: 1e-8
    });
    return {
      id: 'ns-spectral-convergence',
      description: 'NS collocation truncation error vs M: geometric (spectral) decay.',
      command: 'npm run research -- nsconv --a 2.02',
      value: {
        spectral: conv.spectral,
        geometricRate: conv.geometricRate,
        dropFactor: conv.dropFactor,
        spectralR2: conv.spectralR2,
        algebraicR2: conv.algebraicR2
      }
    };
  },
  () => {
    // Item 3: structure preservation — rk4 secular vs gauss2 bounded.
    const params = { masses: [1, 1], lengths: [1, 1], g: 9.81 };
    const ws = createChainWorkspace(2);
    const rhs: Derivative = (s, o) => {
      rhsChain(s, params, 0, o, ws);
    };
    const energy = (s: StateVector): number => energyChain(s, params).total;
    const common = { rhs, energy, initialState: [0.9, 1.3, 0, 0], dt: 0.02, totalTime: 2000, samples: 8 } as const;
    const rk4 = energyDriftProfile({ ...common, method: 'rk4' });
    const gauss2 = energyDriftProfile({ ...common, method: 'gauss2' });
    return {
      id: 'structure-preservation',
      description: 'Long-run energy drift: rk4 secular vs the symmetric Gauss method bounded (~1000 periods).',
      command: 'npm run research -- drift',
      value: {
        rk4Secular: rk4.secular,
        rk4MaxDrift: rk4.maxAbsDrift,
        gauss2Secular: gauss2.secular,
        gauss2MaxDrift: gauss2.maxAbsDrift
      }
    };
  },
  () => {
    // Item 4: SDE ensemble — geometric Brownian motion moments.
    const mu = 0.3;
    const sigma = 0.4;
    const res = runLangevinEnsemble({
      drift: (s, out) => {
        out[0] = mu * s[0]!;
      },
      initialState: [1],
      diffusion: [0],
      scheme: 'milstein',
      multiplicative: {
        diffusion: (s, out) => {
          out[0] = sigma * s[0]!;
        },
        diffusionPrime: (_s, out) => {
          out[0] = sigma;
        }
      },
      dt: 1e-3,
      steps: 1000,
      realizations: 8000,
      seed: 2027
    });
    const last = res.times.length - 1;
    return {
      id: 'sde-gbm-moments',
      description: 'Langevin/Milstein ensemble: geometric Brownian motion mean & variance vs the closed form.',
      command: 'npm run research -- sde --scheme milstein',
      value: {
        mean: res.mean[last]![0],
        variance: res.variance[last]![0],
        expectedMean: Math.exp(mu),
        expectedVar: Math.exp(2 * mu) * (Math.exp(sigma * sigma) - 1)
      }
    };
  },
  () => {
    // Item 7: transcritical branch switch on the normal form.
    const res = switchTranscriticalBranch(
      {
        dimension: 1,
        residual: (state, parameter, out) => {
          out[0] = parameter * state[0]! - state[0]! * state[0]!;
        }
      },
      { state: [0], parameter: 0 },
      { parameterStep: 0.2, branchTangent: [1], referenceBranch: () => [0] }
    );
    return {
      id: 'transcritical-switch',
      description: 'Transcritical (+1) branch switch on r(x,λ)=λx−x²: lands on x=λ.',
      command: 'npm run research -- transcritical --step 0.2',
      value: { switched: res.switched, state: res.state, separation: res.separation, residual: res.residual }
    };
  }
];

function markdown(items: Array<Reproduction & { hash: string }>): string {
  const lines: string[] = [
    '# Reproduce — research result manifest',
    '',
    'Every result below is recomputed deterministically by `npm run reproduce` from the',
    'library (the same code paths as the tests/worker/CLI). Each carries a content hash so',
    'a re-run can be diffed bit-for-bit.',
    '',
    '| id | result | hash | command |',
    '|---|---|---|---|'
  ];
  for (const item of items) {
    const summary = Object.entries(item.value)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? (v as number).toPrecision(4) : String(v)}`)
      .join(', ');
    lines.push(`| ${item.id} | ${summary} | \`${item.hash.slice(0, 12)}\` | \`${item.command}\` |`);
  }
  lines.push(
    '',
    '## Remaining one-liners (browser / external)',
    '',
    '- `npm run paper:build` — the mini-paper (inline SVG figures + print PDF) from `paper:study`.',
    '- `npm run notebook` — the figure-rich research notebook (analysis tabs driven headlessly).',
    '- `npm run validate:cross` / `validate:sympy` / `validate:ns` — SciPy/SymPy external cross-checks.',
    '- `npm run reports` — the consolidated validation report.',
    ''
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const results: Array<Reproduction & { hash: string }> = [];
  let failures = 0;
  for (const reproduce of reproductions) {
    try {
      const r = reproduce();
      const hash = hashText(JSON.stringify(r.value));
      results.push({ ...r, hash });
      console.log(`ok   ${r.id} — ${hash.slice(0, 12)}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await mkdir('reports/reproduce', { recursive: true });
  await writeFile(
    'reports/reproduce/manifest.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
    'utf8'
  );
  await writeFile('reports/reproduce/REPRODUCE.md', markdown(results), 'utf8');
  console.log(`\nWrote reports/reproduce/manifest.json (${results.length} results).`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
