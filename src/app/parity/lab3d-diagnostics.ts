/**
 * 3D-lab research diagnostics: the double-string validity probe + worker
 * studyPoint job, and the spherical-chain analyses — worker λ/RQA/FTLE, the
 * full Lyapunov spectrum with the Hamiltonian self-consistency gate, the
 * Noether conserved-quantity scan, and the energy-shell drift monitor.
 */
import { ChaosClient } from '../../runtime/ChaosClient';
import { doubleStringTautFraction } from '../../physics/doubleString';
import { rk4Step } from '../../physics/integrators';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz
} from '../../physics/sphericalChain';
import { detectSphericalChainConservedQuantities } from '../../physics/conservedQuantities';
import { clampNumber } from './storage-sync';
import { $, numberFrom, setText } from './shared';
import { logResearchRun } from './research-workbench';
import { attachBadge } from '../resultBadges';
import { lab3d } from './lab3d-render-loop';
import { doubleStringSpec, lab3dDoubleStringInitialState, lab3dDoubleStringParams } from './lab3d-double-string-ui';
import { chainSpec, lab3dChainInitialState, lab3dChainParams } from './lab3d-spherical-chain-ui';

let doubleStringClient: ChaosClient | null = null;

/**
 * Research diagnostics for the double string: first the hybrid taut-fraction
 * validity probe, then (when the smooth chart is meaningful) the same worker
 * studyPoint job the Research tab uses, on the taut-branch vector field.
 */
export async function analyzeDoubleStringDiagnostics(): Promise<void> {
  const params = lab3dDoubleStringParams();
  const [theta1, theta2, omega1, omega2] = lab3dDoubleStringInitialState();
  setText('ds3Analysis', 'Probing string validity (hybrid taut-fraction)…');
  const validity = doubleStringTautFraction(params, theta1, theta2, omega1, omega2, 30);
  const validityLine = `taut ${(validity.tautFraction * 100).toFixed(1)}% of 30 s, ${validity.slackEvents} slack / ${validity.captureEvents} capture events, E lost ${validity.energyLost.toFixed(4)} J`;
  if (validity.tautFraction < 0.99) {
    setText(
      'ds3Analysis',
      `${validityLine} | ${validity.caveat} | Smooth-chart λ/RQA/FTLE skipped: the hybrid events dominate, so a single-chart estimate would be misleading.`
    );
    attachBadge('ds3Analysis', 'caveat', validity.caveat, {
      title: 'Double-String Validity Trust',
      source: '3D Lab -> doubleStringTautFraction',
      parameters: {
        horizon: 30,
        tautFraction: validity.tautFraction,
        slackEvents: validity.slackEvents,
        captureEvents: validity.captureEvents
      },
      uncertainty: 'Hybrid taut/slack event probe, not a smooth single-chart chaos estimate.',
      externalValidation: 'Double-string taut and energy behavior are pinned by double-string tests.',
      reproduce: 'npm test -- tests/double-string.test.ts',
      caveat: validity.caveat,
      artifact: '3D Lab diagnostics readout'
    });
    logResearchRun('probe', 'Double-string validity probe', validityLine);
    return;
  }
  setText('ds3Analysis', `${validityLine} | computing taut-branch λ/RQA/FTLE…`);
  if (!doubleStringClient) doubleStringClient = new ChaosClient();
  try {
    const result = await doubleStringClient.studyPoint(doubleStringSpec(), [theta1, theta2, omega1, omega2], {
      lyapunov: { steps: 8000 },
      rqa: { samples: 360 },
      ftleHorizon: 5
    });
    if (!result.ok) throw new Error('analysis failed');
    setText(
      'ds3Analysis',
      [
        validityLine,
        `λ_max=${result.lambdaMax.toFixed(4)} ± ${result.lambdaBlockStdError.toFixed(4)} /s`,
        `RQA DET=${result.rqaDeterminism.toFixed(3)}, DIV=${result.rqaDivergence.toFixed(4)}`,
        `FTLE(T=${result.ftleHorizon}s)=${result.ftle.toFixed(3)}`,
        'valid on the taut branch (strings stayed taut over the probe horizon)'
      ].join(' | ')
    );
    attachBadge(
      'ds3Analysis',
      'finite-time-estimate',
      'Taut-branch diagnostics; validity confirmed by the hybrid taut-fraction probe.',
      {
        title: 'Double-String Taut-Branch Trust',
        source: '3D Lab -> ChaosClient.studyPoint on doubleStringSpec',
        parameters: { lyapunovSteps: 8000, rqaSamples: 360, ftleHorizon: 5, tautFraction: validity.tautFraction },
        uncertainty: `lambda block SE ${result.lambdaBlockStdError.toPrecision(4)}; RQA/FTLE are finite-window diagnostics.`,
        externalValidation: 'Same studyPoint handler is used by Research batch tests and worker protocol diagnostics.',
        reproduce: 'npm test -- tests/double-string.test.ts tests/chaos-protocol-diagnostics.test.ts',
        caveat: 'Valid only while the string remains on the taut branch over the probe horizon.',
        artifact: '3D Lab diagnostics readout'
      }
    );
    logResearchRun(
      'probe',
      'Double-string taut-branch diagnostics',
      `λ=${result.lambdaMax.toFixed(4)}±${result.lambdaBlockStdError.toFixed(4)}, DET=${result.rqaDeterminism.toFixed(3)}, ${validityLine}`
    );
  } catch (error) {
    setText('ds3Analysis', `Double-string analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let chainAnalysisClient: ChaosClient | null = null;

function chainClient(): ChaosClient {
  if (!chainAnalysisClient) chainAnalysisClient = new ChaosClient();
  return chainAnalysisClient;
}

function chainState0(): number[] {
  return lab3d.chain ? Array.from(lab3d.chain.current()) : lab3dChainInitialState();
}

/**
 * Run the full research diagnostics (λ_max + block std error, RQA determinism /
 * divergence, FTLE) for the current chain configuration on the chaos worker —
 * the same `studyPoint` job the Research tab's batch runner uses.
 */
export async function analyzeChainDiagnostics(): Promise<void> {
  const spec = chainSpec();
  const state0 = chainState0();
  setText(
    'd3Analysis',
    `Computing λ/RQA/FTLE for the N=${spec.masses.length} spherical chain ${chainClient().usesWorker() ? '(worker)' : '(main thread)'}…`
  );
  try {
    // The 3D chain needs a finer step than the planar default: dt 0.01 RK4 is
    // unstable over the RQA sampling horizon for energetic chain states.
    const result = await chainClient().studyPoint(spec, state0, {
      lyapunov: { steps: 6000, dt: 0.002 },
      rqa: { samples: 240, dt: 0.002 },
      ftleHorizon: 3,
      ftleDt: 0.002
    });
    if (!result.ok) throw new Error('analysis failed');
    const verdict =
      result.lambdaMax > 0.05 ? 'chaotic (finite-time estimate)' : 'regular/weakly chaotic (finite-time estimate)';
    setText(
      'd3Analysis',
      [
        `λ_max=${result.lambdaMax.toFixed(4)} ± ${result.lambdaBlockStdError.toFixed(4)} /s`,
        `RQA DET=${result.rqaDeterminism.toFixed(3)}, DIV=${result.rqaDivergence.toFixed(4)}`,
        `FTLE(T=${result.ftleHorizon}s)=${result.ftle.toFixed(3)}`,
        verdict,
        'method: studyPoint worker job (dt=0.002, RK4 fiducial; same pipeline as the Research batch runner)'
      ].join(' | ')
    );
    attachBadge(
      'd3Analysis',
      'finite-time-estimate',
      'Worker studyPoint job: finite-time Lyapunov/RQA/FTLE with block uncertainties.',
      {
        title: '3D Chain StudyPoint Trust',
        source: '3D Lab -> ChaosClient.studyPoint',
        parameters: { chainLinks: spec.masses.length, lyapunovSteps: 6000, dt: 0.002, rqaSamples: 240, ftleHorizon: 3 },
        uncertainty: `lambda block SE ${result.lambdaBlockStdError.toPrecision(4)}; RQA/FTLE are finite-window estimates.`,
        externalValidation: 'Spherical-chain dynamics and studyPoint protocol are pinned by unit and worker tests.',
        reproduce: 'npm test -- tests/spherical-chain.test.ts tests/chaos-protocol-diagnostics.test.ts',
        caveat: 'Finite-time chaos verdict; refine dt/steps for energetic near-pole trajectories.',
        artifact: '3D Lab diagnostics readout'
      }
    );
    logResearchRun(
      'probe',
      `3D chain diagnostics (N=${spec.masses.length})`,
      `λ=${result.lambdaMax.toFixed(4)}±${result.lambdaBlockStdError.toFixed(4)}, DET=${result.rqaDeterminism.toFixed(3)}, FTLE=${result.ftle.toFixed(3)}`
    );
  } catch (error) {
    setText('d3Analysis', `Chain analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Full Lyapunov spectrum of the chain (all 4N exponents) with the Hamiltonian
 * self-consistency gate: Σλ ≈ 0 and symplectic pairing for γ = 0, plus the
 * Kaplan–Yorke dimension. Same spec-generic worker job as the Lyapunov tab.
 */
export async function analyzeChainSpectrum(): Promise<void> {
  const spec = chainSpec();
  const state0 = chainState0();
  const dim = state0.length;
  setText(
    'd3Analysis',
    `Computing the full ${dim}-exponent Lyapunov spectrum (N=${spec.masses.length} chain, dt=0.002) ${chainClient().usesWorker() ? '(worker)' : '(main thread)'}…`
  );
  try {
    const result = await chainClient().lyapunovSpectrum(spec, state0, dim, { dt: 0.002, steps: 6000 });
    const lines = result.spectrum.map(
      (lambda, i) => `λ${i + 1}=${lambda.toFixed(4)}±${(result.blockStdError[i] ?? 0).toFixed(4)}`
    );
    const consistency = result.consistency;
    const consistencyLine =
      spec.damping === 0
        ? `consistency: Σλ=${consistency.sum.toFixed(4)} (|Σλ|≤${consistency.tolerances.sumTolerance}), pairing err ${consistency.pairingError.toFixed(4)}, ${consistency.zeroExponentCount} zero exponents → ${consistency.symplectic ? 'PASSES the Hamiltonian gate' : 'FAILS the Hamiltonian gate (suspect dt/steps)'}`
        : `Σλ=${result.sum.toFixed(4)} < 0 expected (dissipative, γ=${spec.damping})`;
    setText(
      'd3Analysis',
      [
        lines.join(' '),
        `Σλ=${result.sum.toFixed(4)}, KY dim=${result.kaplanYorkeDimension.toFixed(3)}`,
        consistencyLine,
        'method: spec-generic worker lyapunovSpectrum job (Benettin/Gram–Schmidt, dt=0.002, 6000 steps, block SE)'
      ].join(' | ')
    );
    const healthy = spec.damping > 0 || consistency.symplectic;
    attachBadge(
      'd3Analysis',
      healthy ? 'validated' : 'caveat',
      healthy
        ? 'Full spectrum with uncertainty and a passed self-consistency gate (Σλ, symplectic pairing).'
        : 'Self-consistency gate failed — treat the spectrum as unconverged and refine dt/steps.',
      {
        title: '3D Chain Spectrum Trust',
        source: '3D Lab -> ChaosClient.lyapunovSpectrum',
        parameters: { chainLinks: spec.masses.length, dimensions: dim, dt: 0.002, steps: 6000, damping: spec.damping },
        uncertainty: 'Block standard errors per exponent plus Hamiltonian self-consistency gate when damping is zero.',
        externalValidation: `sum=${result.sum.toPrecision(4)}, symplectic=${consistency.symplectic}, pairingError=${consistency.pairingError.toPrecision(4)}.`,
        reproduce: 'npm test -- tests/spherical-chain.test.ts tests/spectrum-consistency.test.ts',
        caveat: healthy
          ? 'Passed current self-consistency gate.'
          : 'Refine dt/steps before using this spectrum as evidence.',
        artifact: '3D Lab diagnostics readout'
      }
    );
    logResearchRun(
      'probe',
      `3D chain full spectrum (N=${spec.masses.length})`,
      `[${result.spectrum.map((value) => value.toFixed(3)).join(', ')}], Σλ=${result.sum.toFixed(4)}, KY=${result.kaplanYorkeDimension.toFixed(3)}`
    );
  } catch (error) {
    setText('d3Analysis', `Spectrum analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Noether conserved-quantity scan: tests rotational symmetries of the
 * Hamiltonian (vertical + two horizontal axes) against momentum drift along
 * an integrated trajectory, and cross-checks that the two verdicts agree.
 */
export function analyzeChainConserved(): void {
  setText('d3Analysis', 'Scanning Noether symmetries (Hamiltonian invariance + momentum drift)…');
  window.setTimeout(() => {
    try {
      const params = lab3dChainParams();
      const report = detectSphericalChainConservedQuantities(params, chainState0(), { horizon: 6 });
      const lines = report.candidates.map(
        (candidate) =>
          `${candidate.name}: ${candidate.conserved ? 'CONSERVED' : 'not conserved'} (symmetry ${candidate.symmetric ? 'yes' : 'no'}, drift ${candidate.drift.toExponential(1)}${candidate.noetherConsistent ? '' : ' — NOETHER MISMATCH'})`
      );
      const allConsistent = report.candidates.every((candidate) => candidate.noetherConsistent);
      setText(
        'd3Analysis',
        [
          `Conserved: ${report.conserved.length > 0 ? report.conserved.join(', ') : 'none'}`,
          ...lines,
          `method: ${report.method} (horizon ${report.horizon}s, dt=${report.dt})`,
          `caveat: ${report.caveat}`
        ].join(' | ')
      );
      attachBadge(
        'd3Analysis',
        allConsistent ? 'validated' : 'caveat',
        allConsistent
          ? 'Symmetry and drift verdicts agree for every candidate — the numerical Noether cross-check passes.'
          : 'A symmetry/drift disagreement indicates an unconverged trajectory or a derivation problem — inspect before trusting.',
        {
          title: 'Noether Scan Trust',
          source: '3D Lab -> detectSphericalChainConservedQuantities',
          parameters: {
            chainLinks: params.masses.length,
            horizon: report.horizon,
            dt: report.dt,
            candidates: report.candidates.length
          },
          uncertainty: 'Momentum drift is measured along a finite integrated trajectory.',
          externalValidation: 'Symmetry and drift verdicts must agree for each candidate.',
          reproduce: 'npm test -- tests/conserved-quantities.test.ts tests/spherical-chain.test.ts',
          caveat: report.caveat,
          artifact: '3D Lab diagnostics readout'
        }
      );
      logResearchRun(
        'probe',
        `Noether scan (N=${params.masses.length})`,
        `conserved: ${report.conserved.join(', ') || 'none'}; consistent: ${allConsistent}`
      );
    } catch (error) {
      setText(
        'd3Analysis',
        `Conserved-quantity scan failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, 30);
}

/**
 * Energy-shell monitor: integrates a fresh trajectory from the card's state
 * and plots the relative E(t) and L_vert(t) deviations — the visible proof
 * that the conservative flow stays on its invariant shell (or, with damping,
 * how fast it spirals off it).
 */
export function runChainEnergyShell(): void {
  setText('d3ShellInfo', 'Integrating the shell-drift trajectory…');
  window.setTimeout(() => {
    try {
      const params = lab3dChainParams();
      const n = params.masses.length;
      const state = new Float64Array(chainState0());
      const next = new Float64Array(state.length);
      const workspace = createSphericalChainWorkspace(n);
      const rhs = (s: Float64Array, out: Float64Array): void => {
        rhsSphericalChain(s, params, out, workspace);
      };
      const dt = 0.002;
      const horizon = clampNumber(numberFrom('d3ExportT', 20), 20, 1, 120);
      const steps = Math.round(horizon / dt);
      const sampleEvery = Math.max(1, Math.round(steps / 400));
      const e0 = sphericalChainEnergy(state, params).total;
      const l0 = sphericalChainLz(state, params);
      const times: number[] = [0];
      const eDev: number[] = [0];
      const lDev: number[] = [0];
      // Scales: energy against |E0| (≥1), momentum against its own magnitude
      // or 1 — so a near-zero L0 doesn't inflate the relative deviation.
      const eScale = Math.max(Math.abs(e0), 1);
      const lScale = Math.max(Math.abs(l0), 1);
      for (let step = 1; step <= steps; step += 1) {
        rk4Step(state, dt, rhs, next);
        state.set(next);
        if (step % sampleEvery === 0 || step === steps) {
          times.push(step * dt);
          eDev.push((sphericalChainEnergy(state, params).total - e0) / eScale);
          lDev.push((sphericalChainLz(state, params) - l0) / lScale);
        }
      }
      const maxE = eDev.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0);
      const maxL = lDev.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0);
      drawShellTraces(times, eDev, lDev, horizon);
      const conservative = params.damping === 0;
      setText(
        'd3ShellInfo',
        [
          `relative |ΔE| ≤ ${maxE.toExponential(2)}, |ΔL_vert| ≤ ${maxL.toExponential(2)} over ${horizon}s (RK4 dt=${dt})`,
          conservative
            ? 'γ=0: the trajectory must stay on the E and L_vert shells — residual drift is integrator truncation, shrinking 16× per dt halving (4th order)'
            : `γ=${params.damping}: dissipative — E decays off the shell by design; L_vert decays with it`
        ].join(' | ')
      );
      const tight = maxE < 1e-5 && maxL < 1e-5;
      attachBadge(
        'd3ShellInfo',
        conservative ? (tight ? 'validated' : 'finite-time-estimate') : 'caveat',
        conservative
          ? tight
            ? 'Shell confinement at integrator precision over the full horizon.'
            : 'Shell drift above 1e-5 — energetic orbit or too-long horizon; halve dt to confirm 4th-order shrinkage.'
          : 'Dissipative run: shell contraction is physics, not error.',
        {
          title: '3D Chain Shell Drift Trust',
          source: '3D Lab -> sphericalChainEnergy / sphericalChainLz monitor',
          parameters: { chainLinks: n, horizon, dt, damping: params.damping },
          uncertainty: `max relative energy drift ${maxE.toExponential(3)}, max relative Lz drift ${maxL.toExponential(3)}.`,
          externalValidation: 'Energy/Lz conservation and dt-halving behavior are pinned by spherical-chain tests.',
          reproduce: 'npm test -- tests/spherical-chain.test.ts tests/chain-validation-hardening.test.ts',
          caveat: conservative
            ? 'Conservative shell drift is numerical truncation and should shrink under dt halving.'
            : 'Dissipative runs leave the shell by design.',
          artifact: '3D Lab shell-drift canvas'
        }
      );
      logResearchRun(
        'probe',
        `Energy-shell monitor (N=${n})`,
        `|ΔE|≤${maxE.toExponential(2)}, |ΔL|≤${maxL.toExponential(2)} over ${horizon}s`
      );
    } catch (error) {
      setText('d3ShellInfo', `Energy-shell monitor failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 30);
}

/** Two-trace drift plot (E solid cyan, L_vert solid amber) with a zero line. */
function drawShellTraces(times: number[], eDev: number[], lDev: number[], horizon: number): void {
  const canvas = $('d3ShellCanvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, width, height);
  const maxAbs = Math.max(1e-16, ...eDev.map((value) => Math.abs(value)), ...lDev.map((value) => Math.abs(value)));
  const xFor = (t: number): number => (t / Math.max(horizon, 1e-9)) * (width - 60) + 8;
  const yFor = (value: number): number => height / 2 - (value / maxAbs) * (height / 2 - 14);
  // Zero line.
  ctx.strokeStyle = 'rgba(141,163,194,0.4)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(8, height / 2);
  ctx.lineTo(width - 52, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const trace = (values: number[], color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = xFor(times[index] ?? 0);
      const y = yFor(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  trace(eDev, '#4cc9f0');
  trace(lDev, '#f4a261');
  ctx.fillStyle = '#4cc9f0';
  ctx.font = '10px system-ui';
  ctx.fillText('ΔE/E₀', width - 48, 18);
  ctx.fillStyle = '#f4a261';
  ctx.fillText('ΔL/L₀', width - 48, 32);
  ctx.fillStyle = '#8fa3c2';
  ctx.fillText(`±${maxAbs.toExponential(1)}`, width - 48, height - 8);
}
