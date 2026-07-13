/**
 * Analysis-superpack panel runners extracted from research-workbench.ts.
 * Each panel is an independent async probe; results are written into the
 * `#rwSuperpackResults` DOM node via `superpackSection`.
 *
 * Imports `logResearchRun` and `studySpecFromSnapshot` from
 * `./research-workbench` — the circular ESM reference is safe because both
 * are only accessed inside function bodies, never at module initialisation.
 */
import { ChaosClient } from '../../runtime/ChaosClient';
import type { SystemSpec } from '../../physics/systemSpec';
import { buildRhs } from '../../physics/systemSpec';
import { classifyFixedPoint } from '../../chaos/fixedPointClassify';
import { detectBifurcations } from '../../chaos/bifurcationDetect';
import { detectNeimarkSacker } from '../../chaos/neimarkSacker';
import { recurrenceNetworkMetrics } from '../../chaos/recurrenceNetwork';
import { extractFtleRidges } from '../../chaos/ftleRidge';
import { shadowingHorizon } from '../../chaos/shadowing';
import { melnikovCriticalAmplitude, melnikovVerdict } from '../../chaos/melnikov';
import { maximalLyapunov } from '../../chaos/lyapunov';
import { sobolIndices } from '../../research/sobolSensitivity';
import { hashText } from '../../research/researchExportUtils';
import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../chaos/continuation';
import { $, append, clear, currentParameters, currentSnapshot, html, numberFrom } from './shared';
import { orbitBaseFromControls } from './runtime-diagnostics';
import { logResearchRun, studySpecFromSnapshot } from './research-workbench';

// --- Analysis superpack ------------------------------------------------------

export let superpackChaosClient: ChaosClient | null = null;

export function superpackClient(): ChaosClient {
  if (!superpackChaosClient) superpackChaosClient = new ChaosClient();
  return superpackChaosClient;
}

export function doubleSpecFromCurrent(): Extract<SystemSpec, { kind: 'double' }> {
  const p = currentParameters();
  return { kind: 'double', m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g };
}

/** Replace (or append) one titled analysis section inside the superpack results. */
export function superpackSection(key: string, title: string, lines: string[]): void {
  const target = $('rwSuperpackResults');
  if (!target) return;
  if (target.dataset.cleared !== '1') {
    target.textContent = '';
    target.dataset.cleared = '1';
  }
  let section = target.querySelector<HTMLElement>(`[data-superpack="${key}"]`);
  if (!section) {
    section = html('div', { className: 'research-summary' });
    section.dataset.superpack = key;
    target.append(section);
  }
  clear(section);
  append(section, html('strong', { text: title }));
  for (const line of lines) append(section, html('div', { text: line }));
}

export async function runWadaConvergencePanel(): Promise<void> {
  superpackSection('wada', 'Wada Resolution Convergence', [
    'Computing flip basins at 3 resolutions on the chaos worker…'
  ]);
  try {
    const response = await superpackClient().wadaConvergence(doubleSpecFromCurrent(), {
      resolutions: [30, 45, 60],
      maxTime: 12,
      dt: 0.015
    });
    const result = response.result;
    superpackSection('wada', `Wada Resolution Convergence — ${result.verdict.toUpperCase()}`, [
      `Wada fraction by resolution: ${result.resolutions.map((n, i) => `${n}px=${(result.wadaFractions[i] ?? 0).toFixed(3)}`).join(', ')}`,
      `Adjacent deltas: ${result.adjacentDeltas.map((d) => d.toFixed(3)).join(', ')} (max ${result.maxAdjacentDelta.toFixed(3)}, tolerance ${result.convergenceTolerance})`,
      `Basin colours: ${result.numColors.join(', ')}; candidacy threshold ${result.threshold}, radius ${result.radius} cells`,
      `Method: ${result.method}`,
      `dt=${result.dt}, maxTime=${result.maxTime}s; ${result.transientHandling}`,
      `Caveat: ${result.caveat}`,
      `Reproducibility hash: ${result.reproducibilityHash}; grid hashes: ${result.gridHashes.join(', ')}`
    ]);
    logResearchRun(
      'probe',
      'Wada convergence',
      `${result.verdict}; fractions ${result.wadaFractions.map((f) => f.toFixed(2)).join('/')}`
    );
  } catch (error) {
    superpackSection('wada', 'Wada Resolution Convergence — FAILED', [
      String(error instanceof Error ? error.message : error)
    ]);
  }
}

export async function runRecurrenceNetworkPanel(): Promise<void> {
  superpackSection('network', 'Recurrence Network', ['Sampling observable and building the recurrence network…']);
  try {
    const snapshot = currentSnapshot();
    const { spec, state0 } = studySpecFromSnapshot(snapshot);
    const rqa = await superpackClient().rqa(spec, state0, { samples: 240 });
    const metrics = recurrenceNetworkMetrics(rqa.plot, rqa.plotSize);
    superpackSection('network', 'Recurrence Network (Donner et al. 2010)', [
      `Nodes ${metrics.nodes}, edges ${metrics.edges}, density ${metrics.density.toFixed(4)}`,
      `Degree: mean ${metrics.meanDegree.toFixed(2)}, max ${metrics.maxDegree}, std ${metrics.degreeStd.toFixed(2)}`,
      `Clustering ${metrics.clusteringCoefficient.toFixed(4)}, transitivity ${metrics.transitivity.toFixed(4)}`,
      `Average path length ${metrics.averagePathLength.toFixed(3)} over largest component (${metrics.largestComponent} nodes)`,
      `Method: recurrence matrix (epsilon=${rqa.epsilon.toFixed(4)}, embedding from RQA settings) as adjacency; dt=0.01 sampler, 2000-step transient discarded`,
      `Uncertainty: DET block-SE ${rqa.determinismStdError.toFixed(4)} over ${rqa.uncertaintyBlocks} blocks (network measures share the same sampling variability)`,
      `Caveat: ${metrics.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ hash: snapshot.hash, samples: 240, epsilon: rqa.epsilon }))}`
    ]);
    logResearchRun(
      'probe',
      'Recurrence network',
      `density ${metrics.density.toFixed(3)}, transitivity ${metrics.transitivity.toFixed(3)}`
    );
  } catch (error) {
    superpackSection('network', 'Recurrence Network — FAILED', [
      String(error instanceof Error ? error.message : error)
    ]);
  }
}

export async function runFtleRidgePanel(): Promise<void> {
  superpackSection('ridges', 'FTLE Ridge Extraction', ['Computing the FTLE field on the chaos worker…']);
  try {
    const field = await superpackClient().ftle(doubleSpecFromCurrent(), { n: 48 });
    const ridges = extractFtleRidges(field.values, field.width, field.height, { percentile: 0.85 });
    const canvas = $('rwSuperpackCanvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const cellW = canvas.width / field.width;
        const cellH = canvas.height / field.height;
        const span = field.max - field.min || 1;
        for (let y = 0; y < field.height; y += 1) {
          for (let x = 0; x < field.width; x += 1) {
            const value = field.values[y * field.width + x] ?? field.min;
            const shade = Math.round(((value - field.min) / span) * 255);
            ctx.fillStyle = ridges.mask[y * field.width + x]
              ? '#ff3355'
              : `rgb(${shade},${shade},${Math.min(255, shade + 40)})`;
            ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
          }
        }
      }
    }
    superpackSection('ridges', 'FTLE Ridge Extraction (LCS proxy)', [
      `Ridge cells: ${ridges.ridgeCells} (${(ridges.ridgeFraction * 100).toFixed(1)}% of ${field.width}x${field.height}), threshold λ>=${ridges.threshold.toFixed(4)} (p${Math.round(ridges.percentile * 100)})`,
      `Field range [${field.min.toFixed(4)}, ${field.max.toFixed(4)}]`,
      'Method: percentile + transverse local-maximum ridge condition on the (θ1, θ2) forward-FTLE section; canvas shows ridges in red',
      `Caveat: ${ridges.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ n: field.width, p: ridges.percentile, spec: doubleSpecFromCurrent() }))}`
    ]);
    logResearchRun(
      'probe',
      'FTLE ridges',
      `${ridges.ridgeCells} ridge cells (${(ridges.ridgeFraction * 100).toFixed(1)}%)`
    );
  } catch (error) {
    superpackSection('ridges', 'FTLE Ridge Extraction — FAILED', [
      String(error instanceof Error ? error.message : error)
    ]);
  }
}

export async function runBifurcationDetectPanel(): Promise<void> {
  superpackSection('bifurcations', 'Automated Bifurcation Detection', [
    'Sweeping the driven pendulum bifurcation diagram…'
  ]);
  try {
    const base = orbitBaseFromControls();
    const from = Math.max(0.6, base.driveAmplitude);
    const to = Math.max(from + 0.4, numberFrom('rwOrbitSweepTo', 1.2) + 0.3);
    const amplitudes = Array.from({ length: 25 }, (_, i) => from + ((to - from) * i) / 24);
    const response = await superpackClient().bifurcation(
      {
        kind: 'driven',
        g: base.g,
        length: base.length,
        damping: base.damping,
        driveAmplitude: from,
        driveFrequency: base.driveFrequency
      },
      amplitudes,
      [0.3, 0, 0],
      { dt: 0.01, maxTime: 240, transientCrossings: 30, maxPointsPerParam: 60 }
    );
    const detection = detectBifurcations(response.columns, { tolerance: 1e-3, chaosCountThreshold: 24 });
    const eventLines = detection.events
      .slice(0, 8)
      .map(
        (event) =>
          `${event.type} in A∈(${event.previousParam.toFixed(3)}, ${event.param.toFixed(3)}]: ${event.fromCount} -> ${event.toCount} branches`
      );
    superpackSection('bifurcations', `Automated Bifurcation Detection — ${detection.events.length} event(s)`, [
      ...(eventLines.length > 0 ? eventLines : ['No attractor-count changes detected in the swept range.']),
      `Chaotic columns: ${detection.chaoticColumns}/${detection.params.length}`,
      `Method: ${detection.method}; stroboscopic section, dt=0.01, 30 transient crossings discarded, maxTime 240`,
      `Caveat: ${detection.caveat}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ from, to, base }))}`
    ]);
    logResearchRun(
      'probe',
      'Bifurcation detection',
      `${detection.events.length} events, ${detection.chaoticColumns} chaotic columns`
    );
  } catch (error) {
    superpackSection('bifurcations', 'Automated Bifurcation Detection — FAILED', [
      String(error instanceof Error ? error.message : error)
    ]);
  }
}

/** Newton fixed point on the stroboscopic map + Floquet classification + NS scan along the branch. */
export function runFixedPointPanel(): void {
  superpackSection('fixedpoint', 'Poincaré Fixed Point', ['Running Newton on the stroboscopic map…']);
  window.setTimeout(() => {
    try {
      const base = orbitBaseFromControls();
      const orbit = drivenPeriodicOrbit(base, [0, 0], { dt: 0.005, tolerance: 1e-10 });
      const classification = classifyFixedPoint(orbit.multipliers);
      const to = numberFrom('rwOrbitSweepTo', 1.2);
      const branch = continueDrivenPeriodicOrbit(base, {
        parameter: 'driveAmplitude',
        start: base.driveAmplitude,
        end: to,
        step: Math.max(1e-3, Math.abs(to - base.driveAmplitude) / 40) * Math.sign(to - base.driveAmplitude || 1)
      });
      const nsScan = detectNeimarkSacker(
        branch.branch.map((point) => ({ param: point.parameter, multipliers: point.multipliers }))
      );
      superpackSection('fixedpoint', `Poincaré Fixed Point — ${classification.classification.toUpperCase()}`, [
        orbit.converged
          ? `Fixed point (θ, ω) = (${orbit.orbit[0].toFixed(6)}, ${orbit.orbit[1].toFixed(6)}), residual ${orbit.residual.toExponential(2)} in ${orbit.iterations} Newton steps`
          : `Newton did not converge (residual ${orbit.residual.toExponential(2)})`,
        `Classification: ${classification.classification} (${classification.stable ? 'stable' : 'not asymptotically stable'}); ${classification.detail}`,
        classification.rotationNumber !== null
          ? `Rotation number ${classification.rotationNumber.toFixed(4)}`
          : 'Non-rotational (real multipliers)',
        nsScan.points.length > 0
          ? `Neimark–Sacker: ${nsScan.points.map((point) => `A≈${point.paramCritical.toFixed(4)} (rot ${point.rotationNumber.toFixed(3)}${point.strongResonance ? ', STRONG RESONANCE' : ''}, ${point.direction})`).join('; ')}`
          : `Neimark–Sacker: no complex-pair unit-circle crossing along A∈[${base.driveAmplitude}, ${to}]`,
        `Method: Newton on the period-map (dt=0.005, tol 1e-10); Floquet multipliers from the monodromy matrix; NS scan: ${nsScan.method}`,
        `Caveat: ${nsScan.caveat}`,
        `Reproducibility hash: ${hashText(JSON.stringify({ base, to }))}`
      ]);
      logResearchRun(
        'probe',
        'Fixed point classification',
        `${classification.classification}; NS points: ${nsScan.points.length}`
      );
    } catch (error) {
      superpackSection('fixedpoint', 'Poincaré Fixed Point — FAILED', [
        String(error instanceof Error ? error.message : error)
      ]);
    }
  }, 30);
}

export async function runCodimTwoPanel(): Promise<void> {
  superpackSection('codim2', 'Codim-2 Regime Map', [
    'Scanning the (drive amplitude, damping) plane on the chaos worker…'
  ]);
  try {
    const base = orbitBaseFromControls();
    const response = await superpackClient().codimTwo(
      {
        kind: 'driven',
        g: base.g,
        length: base.length,
        damping: base.damping,
        driveAmplitude: base.driveAmplitude,
        driveFrequency: base.driveFrequency
      },
      [0.3, 0, 0],
      [0.2, 1.6],
      [0.05, 0.7],
      { n: 11, steps: 2500, dt: 0.02 }
    );
    const result = response.result;
    // Melnikov first-order threshold A_c(γ) along the damping axis — drawn on
    // top of the λ-sign map so the analytic prediction and the measured chaos
    // boundary can be compared in one picture.
    const gammaLo = result.yValues[0] ?? 0;
    const gammaHi = result.yValues[result.yValues.length - 1] ?? 1;
    const melnikovCurve: Array<{ amplitude: number; gamma: number }> = [];
    for (let s = 0; s <= 60; s += 1) {
      const gamma = gammaLo + ((gammaHi - gammaLo) * s) / 60;
      const amplitude = melnikovCriticalAmplitude({ ...base, damping: gamma });
      if (Number.isFinite(amplitude)) melnikovCurve.push({ amplitude, gamma });
    }
    const canvas = $('rwSuperpackCanvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const n = result.xValues.length;
        const cellW = canvas.width / n;
        const cellH = canvas.height / n;
        for (const cell of result.cells) {
          const i = result.xValues.indexOf(cell.x);
          const j = result.yValues.indexOf(cell.y);
          ctx.fillStyle = cell.regime === 1 ? '#e63946' : cell.regime === -1 ? '#4361ee' : '#778da9';
          ctx.fillRect(i * cellW, canvas.height - (j + 1) * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
        // Overlay: cell i is centred on xValues[i], so the continuous curve
        // maps through the cell-centre lattice (same convention vertically).
        const xLo = result.xValues[0] ?? 0;
        const xHi = result.xValues[n - 1] ?? 1;
        const px = (amplitude: number): number =>
          ((amplitude - xLo) / Math.max(xHi - xLo, 1e-12)) * (n - 1) * cellW + cellW / 2;
        const py = (gamma: number): number =>
          canvas.height - (((gamma - gammaLo) / Math.max(gammaHi - gammaLo, 1e-12)) * (n - 1) * cellH + cellH / 2);
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let started = false;
        for (const point of melnikovCurve) {
          const x = px(point.amplitude);
          if (x < 0 || x > canvas.width) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(x, py(point.gamma));
            started = true;
          } else {
            ctx.lineTo(x, py(point.gamma));
          }
        }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px system-ui';
        ctx.fillText(
          'x: drive amplitude, y: damping — red chaotic, blue regular, dashed white: Melnikov A_c(γ)',
          6,
          12
        );
      }
    }
    const melnikovLo = melnikovCurve[0];
    const melnikovHi = melnikovCurve[melnikovCurve.length - 1];
    superpackSection('codim2', 'Codim-2 Regime Map (A × γ)', [
      `Chaotic fraction ${(result.chaoticFraction * 100).toFixed(1)}%; boundary cells ${result.boundaryCells} (the λ=0 contour)`,
      melnikovLo && melnikovHi
        ? `Overlay: first-order Melnikov threshold A_c(γ) (dashed) spans ${melnikovLo.amplitude.toFixed(3)} → ${melnikovHi.amplitude.toFixed(3)} over γ∈[${gammaLo.toFixed(2)}, ${gammaHi.toFixed(2)}]; the measured λ > 0 region should sit at or above it (homoclinic-tangle onset precedes sustained chaos)`
        : 'Overlay: Melnikov threshold not finite over this damping range',
      `Method: ${result.method}`,
      `Transients: ${result.transientHandling}`,
      `Caveat: ${result.caveat} Melnikov curve is perturbative (small δ, f) — treat it as a heuristic away from small damping/drive.`,
      `Reproducibility hash: ${result.reproducibilityHash}`
    ]);
    logResearchRun(
      'probe',
      'Codim-2 map',
      `${(result.chaoticFraction * 100).toFixed(1)}% chaotic, ${result.boundaryCells} boundary cells`
    );
  } catch (error) {
    superpackSection('codim2', 'Codim-2 Regime Map — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

/**
 * Variance-based global sensitivity of λ_max over the (drive amplitude,
 * damping) box of the driven pendulum: Sobol first-order vs total indices.
 * Complements the per-study local |Δλ/Δp| slope the batch runner reports —
 * Sobol indices are global over the box and resolve interactions.
 */
export async function runSobolPanel(): Promise<void> {
  const base = orbitBaseFromControls();
  const variables = [
    { name: 'drive amplitude A', min: 0.2, max: 1.6 },
    { name: 'damping γ', min: 0.05, max: 0.7 }
  ];
  const steps = 2500;
  const dt = 0.02;
  superpackSection('sobol', 'Sobol Sensitivity of λ_max', ['Sampling the (A, γ) box (Saltelli scheme)…']);
  try {
    const result = await sobolIndices(
      async (point) => {
        // Yield between model runs so the UI stays responsive on the main thread.
        await new Promise((resolve) => {
          window.setTimeout(resolve, 0);
        });
        const rhs = buildRhs({
          kind: 'driven',
          g: base.g,
          length: base.length,
          damping: point[1]!,
          driveAmplitude: point[0]!,
          driveFrequency: base.driveFrequency
        });
        return maximalLyapunov(new Float64Array([0.3, 0, 0]), rhs, { steps, dt }).lambdaMax;
      },
      variables,
      {
        samples: 16,
        onProgress: (done, total) => {
          if (done % 8 === 0 || done === total) {
            superpackSection('sobol', 'Sobol Sensitivity of λ_max', [
              `Evaluating λ_max ${done}/${total} (Saltelli radial design)…`
            ]);
          }
        }
      }
    );
    const fmt = (value: number): string => (Number.isFinite(value) ? value.toFixed(3) : 'n/a');
    superpackSection('sobol', 'Sobol Sensitivity of λ_max (A × γ)', [
      ...result.variables.map(
        (name, i) =>
          `${name}: S=${fmt(result.firstOrder[i]!)} (first-order), S_T=${fmt(result.total[i]!)} (total; S_T−S = interaction share)`
      ),
      `Output: λ_max over A∈[0.2, 1.6], γ∈[0.05, 0.7]; mean ${result.mean.toFixed(4)} /s, variance ${result.variance.toFixed(5)}`,
      `Method: ${result.method}; per point ${steps} Benettin steps at dt=${dt} (ω=${base.driveFrequency})`,
      `Caveat: ${result.caveat}${result.nonFiniteOutputs > 0 ? ` ${result.nonFiniteOutputs} non-finite λ evaluations excluded.` : ''}`,
      `Reproducibility hash: ${hashText(JSON.stringify({ variables, steps, dt, base, samples: result.samples }))}`
    ]);
    logResearchRun(
      'probe',
      'Sobol sensitivity',
      result.variables
        .map((name, i) => `${name}: S=${fmt(result.firstOrder[i]!)}, ST=${fmt(result.total[i]!)}`)
        .join('; ')
    );
  } catch (error) {
    superpackSection('sobol', 'Sobol Sensitivity — FAILED', [String(error instanceof Error ? error.message : error)]);
  }
}

export function runShadowingPanel(): void {
  superpackSection('shadowing', 'Shadowing Reliability', [
    'Comparing production integrator against the GBS reference…'
  ]);
  window.setTimeout(() => {
    try {
      const snapshot = currentSnapshot();
      const { spec, state0 } = studySpecFromSnapshot(snapshot);
      const rhs = buildRhs(spec);
      const T = 20;
      const result = shadowingHorizon(state0, rhs, {
        dt: Math.min(0.01, snapshot.dt || 0.01),
        T,
        threshold: 1e-2,
        method: snapshot.method,
        sampleEvery: 20
      });
      const horizon = Number.isFinite(result.horizon) ? result.horizon : T;
      const score = Math.max(0, Math.min(1, horizon / T));
      superpackSection('shadowing', `Shadowing Reliability — score ${(score * 100).toFixed(0)}%`, [
        Number.isFinite(result.horizon)
          ? `Shadowing horizon ${result.horizon.toFixed(2)}s of ${T}s (separation > ${result.threshold} after that)`
          : `Trajectory shadowed the reference for the full ${T}s window (final separation ${result.finalSeparation.toExponential(2)})`,
        `Method: ${result.settings.method} (dt=${result.settings.dt}) vs ${result.settings.referenceMethod} reference (dt=${result.settings.referenceDt}); max-norm threshold ${result.threshold}`,
        'Uncertainty: horizon resolution = sampleEvery × dt; chaotic horizons scale ~ln(threshold)/λ, so treat as order-of-magnitude',
        'Caveat: in-precision reference, not an exact-arithmetic shadow; the score certifies numerical trust over T, not long-time orbit identity',
        `Reproducibility hash: ${hashText(JSON.stringify({ hash: snapshot.hash, T, threshold: 1e-2, method: snapshot.method }))}`
      ]);
      logResearchRun('probe', 'Shadowing score', `${(score * 100).toFixed(0)}% over ${T}s`);
    } catch (error) {
      superpackSection('shadowing', 'Shadowing Reliability — FAILED', [
        String(error instanceof Error ? error.message : error)
      ]);
    }
  }, 30);
}

export function runMelnikovPanel(): void {
  try {
    const base = orbitBaseFromControls();
    const verdict = melnikovVerdict(base);
    const valid = verdict.delta < 0.5 && verdict.f < 1.5;
    superpackSection(
      'melnikov',
      `Melnikov Threshold — ${verdict.predictsHomoclinicTangle ? 'TANGLE PREDICTED' : 'below threshold'}`,
      [
        `Critical amplitude A_c = ${verdict.criticalAmplitude.toFixed(4)}; current A = ${base.driveAmplitude} (ratio ${verdict.amplitudeRatio.toFixed(3)})`,
        `Scaled parameters: δ=${verdict.delta.toFixed(4)}, f=${verdict.f.toFixed(4)}, Ω=${verdict.Omega.toFixed(4)} (ω0=${verdict.omega0.toFixed(4)})`,
        `Validity: perturbative Melnikov theory ${valid ? 'applicable (small δ, f)' : 'STRAINED — δ or f is not small; treat the threshold as heuristic only'}`,
        'Method: first-order Melnikov function along the undamped separatrix of the driven pendulum; simple zeros ⇒ transverse homoclinic intersection',
        'Caveat: predicts the onset of homoclinic chaos (transient tangles), not necessarily a strange attractor; valid for the single driven pendulum only',
        `Reproducibility hash: ${hashText(JSON.stringify(base))}`
      ]
    );
    logResearchRun(
      'probe',
      'Melnikov threshold',
      `A_c=${verdict.criticalAmplitude.toFixed(4)}, ratio ${verdict.amplitudeRatio.toFixed(2)}`
    );
  } catch (error) {
    superpackSection('melnikov', 'Melnikov Threshold — FAILED', [
      String(error instanceof Error ? error.message : error)
    ]);
  }
}
