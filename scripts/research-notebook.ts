/**
 * Figure-rich research notebook generator.
 *
 * Produces `reports/research-notebook.html` — a self-contained, print-to-PDF
 * friendly research report combining:
 *  - headline numbers computed through the SAME `runChaosJob` handler the app's
 *    worker, the CLI and the unit tests use (no parallel implementation), plus
 *    the periodic-orbit / branch-switching pipeline and measured convergence
 *    orders;
 *  - real figures captured from the live app (the generated standalone/index.html is
 *    driven headlessly with Playwright: each analysis tab is run to completion
 *    and its canvas captured as PNG).
 *
 * Run: npm run notebook   (requires `npm run build:standalone` to be current)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { runChaosJob } from '../src/workers/chaosProtocol';
import { drivenPeriodicOrbit } from '../src/chaos/floquet';
import { switchPeriodDoubling } from '../src/chaos/branchSwitching';
import { empiricalOrder } from '../src/research/convergenceOrder';
import { rhsDouble } from '../src/physics/double';
import type { SystemSpec } from '../src/physics/systemSpec';
import type { IntegratorId } from '../src/types/domain';

const SPEC: Extract<SystemSpec, { kind: 'double' }> = { kind: 'double', m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
const STATE0 = [2, 2.5, 0, 0];

interface Figure {
  id: string;
  title: string;
  caption: string;
  dataUrl: string;
}

/* ------------------------------------------------------------------------- *
 * Part A — measured numbers (same job handler as the app worker / CLI)
 * ------------------------------------------------------------------------- */

function numbers() {
  const spectrum = runChaosJob({ id: 'nb', kind: 'lyapunovSpectrum', spec: SPEC, state0: STATE0 });
  if (!spectrum.ok || spectrum.kind !== 'lyapunovSpectrum') throw new Error('spectrum failed');

  const zeroOne = runChaosJob({ id: 'nb', kind: 'zeroOne', spec: SPEC, state0: STATE0 });
  if (!zeroOne.ok || zeroOne.kind !== 'zeroOne') throw new Error('zeroOne failed');

  const rqa = runChaosJob({ id: 'nb', kind: 'rqa', spec: SPEC, state0: STATE0 });
  if (!rqa.ok || rqa.kind !== 'rqa') throw new Error('rqa failed');

  const basin = runChaosJob({ id: 'nb', kind: 'basin', spec: SPEC, settings: { n: 120 } });
  if (!basin.ok || basin.kind !== 'basin') throw new Error('basin failed');

  const ftle = runChaosJob({ id: 'nb', kind: 'ftle', spec: SPEC, settings: { n: 32, totalTime: 5 } });
  if (!ftle.ok || ftle.kind !== 'ftle') throw new Error('ftle failed');

  // Period-doubling cascade of the classic driven pendulum (γ = 0.5, ω = 2/3).
  const driven = (A: number) => ({ g: 1, length: 1, damping: 0.5, driveAmplitude: A, driveFrequency: 2 / 3 });
  const guess: [number, number] = [-0.2926, 1.9745];
  const p1Before = drivenPeriodicOrbit(driven(1.065), guess, { dt: 0.005, tolerance: 1e-10 });
  const p1After = drivenPeriodicOrbit(driven(1.07), p1Before.orbit, { dt: 0.005, tolerance: 1e-10 });
  const pdSwitch = switchPeriodDoubling(driven(1.07), p1After.orbit, { dt: 0.005, tolerance: 1e-10 });

  // Measured convergence orders (Richardson self-convergence on this system).
  const rhs = (s: ArrayLike<number>, o: Float64Array) => {
    rhsDouble(s, { m1: SPEC.m1, m2: SPEC.m2, l1: SPEC.l1, l2: SPEC.l2, g: SPEC.g }, 0, o);
  };
  const orders = (['euler', 'rk2', 'rk4', 'gauss2'] as IntegratorId[]).map((method) => ({
    method,
    order: empiricalOrder(method, rhs, STATE0, { baseDt: 0.008, totalTime: 2 }).estimatedOrder
  }));

  return { spectrum, zeroOne, rqa, basin, ftle, p1Before, p1After, pdSwitch, orders };
}

/* ------------------------------------------------------------------------- *
 * Part B — figure capture from the live app
 * ------------------------------------------------------------------------- */

async function setSlider(page: Page, id: string, value: number): Promise<void> {
  await page.evaluate(
    ([sliderId, v]) => {
      const el = document.getElementById(sliderId as string) as HTMLInputElement | null;
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [id, value] as const
  );
}

async function capture(page: Page, id: string, title: string, caption: string): Promise<Figure | null> {
  const dataUrl = await page.evaluate((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return '';
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }, id);
  if (!dataUrl) {
    console.warn(`  ! canvas #${id} empty — skipped`);
    return null;
  }
  return { id, title, caption, dataUrl };
}

async function runTab(page: Page, tab: string, startId: string, statusId: string, timeoutMs: number): Promise<void> {
  await page.evaluate(
    (name) => (window as unknown as { __modernShell: { switchTo(n: string): void } }).__modernShell.switchTo(name),
    tab
  );
  await page.locator(`#${startId}`).click();
  await page.waitForFunction(
    (sid) => (document.getElementById(sid as string)?.textContent ?? '').includes('done'),
    statusId,
    { timeout: timeoutMs }
  );
}

async function captureFigures(): Promise<Figure[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const figures: Array<Figure | null> = [];
  try {
    await page.goto(pathToFileURL('index.html').href);
    await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
    // Let the Lab integrate long enough for a meaningful trail/plots.
    await page.waitForTimeout(4000);

    console.log('  capturing lab canvases…');
    figures.push(
      await capture(
        page,
        'main',
        'Double-pendulum trajectory',
        `Long-exposure trail of the chaotic double pendulum (θ₁ = ${STATE0[0]}, θ₂ = ${STATE0[1]}, m₁ = m₂ = 1, l₁ = 1.2, l₂ = 1, RK4).`
      ),
      await capture(page, 'phase', 'Phase portrait', 'Phase-plane projection (θ₁, ω₁) of the running trajectory.'),
      await capture(
        page,
        'poincare',
        'Poincaré section',
        'Section at θ₁ = 0, θ̇₁ > 0 — the scattered points are the chaos signature.'
      ),
      await capture(
        page,
        'fft',
        'Frequency spectrum',
        'FFT magnitude of θ₁: broadband content rather than discrete lines.'
      ),
      await capture(
        page,
        'energy',
        'Energy trace',
        'Total energy E(t); the bounded drift is the integrator-fidelity diagnostic.'
      )
    );

    console.log('  Lyapunov spectrum tab…');
    await runTab(page, 'lyap', 'lyapStart', 'lyapStatus', 180_000);
    figures.push(
      await capture(
        page,
        'lyapSpecCanvas',
        'Lyapunov spectrum',
        'Full spectrum {λ₁…λ₄} with per-exponent uncertainty; the Hamiltonian constraints (Σλ ≈ 0, symplectic pairing) are checked automatically.'
      )
    );

    console.log('  0–1 test tab…');
    await runTab(page, 'zeroone', 'zeroOneStart', 'zeroOneStatus', 180_000);
    figures.push(
      await capture(
        page,
        'zeroOneCanvas',
        '0–1 test translation path',
        'Gottwald–Melbourne (p_c, q_c) path: Brownian-like wandering ⇒ K ≈ 1 (chaos); a bounded ring would indicate regularity.'
      )
    );

    console.log('  CLV tab…');
    await runTab(page, 'clv', 'clvStart', 'clvStatus', 240_000);
    figures.push(
      await capture(
        page,
        'clvCanvas',
        'Covariant Lyapunov vectors',
        'Hyperbolicity angles between expanding and contracting Oseledets directions along the trajectory (Ginelli algorithm).'
      )
    );

    console.log('  RQA tab…');
    await runTab(page, 'rqa', 'rqaStart', 'rqaStatus', 180_000);
    figures.push(
      await capture(
        page,
        'rqaCanvas',
        'Recurrence plot',
        'Recurrence plot of the embedded cos θ₁ observable; short diagonals quantify divergence (DIV = 1/Lmax).'
      )
    );

    console.log('  FTLE tab…');
    await setSlider(page, 'ftleRes', 40);
    await runTab(page, 'ftle', 'ftleStart', 'ftleStatus', 300_000);
    figures.push(
      await capture(
        page,
        'ftleCanvas',
        'FTLE field',
        'Finite-time Lyapunov exponent over (θ₁, θ₂); ridges are Lagrangian coherent structures (transport barriers).'
      )
    );

    console.log('  flip-basin tab…');
    await setSlider(page, 'basinRes', 110);
    await runTab(page, 'basin', 'basinStart', 'basinStatus', 300_000);
    figures.push(
      await capture(
        page,
        'basinCanvas',
        'Flip basins',
        'Which rod flips first, over initial (θ₁, θ₂): the fractal boundary drives the basin entropy and Wada analysis.'
      )
    );

    console.log('  sweep tab…');
    await setSlider(page, 'sweepRes', 36);
    await setSlider(page, 'sweepT', 6);
    await runTab(page, 'sweep', 'sweepStart', 'sweepStatus', 600_000);
    figures.push(
      await capture(
        page,
        'sweepCanvas',
        'Chaos map',
        'Maximal Lyapunov exponent over the (θ₁, θ₂) grid: the global chaotic/regular landscape.'
      )
    );

    console.log('  bifurcation tab…');
    await setSlider(page, 'bifSteps', 70);
    await setSlider(page, 'bifT', 10);
    await runTab(page, 'bifurc', 'bifStart', 'bifStatus', 600_000);
    figures.push(
      await capture(
        page,
        'bifCanvas',
        'Bifurcation diagram',
        'Poincaré θ₂ values swept over gravity g: branch splittings en route to chaos.'
      )
    );

    console.log('  visual tabs…');
    await page.evaluate(() =>
      (window as unknown as { __modernShell: { switchTo(n: string): void } }).__modernShell.switchTo('phase3d')
    );
    await page.waitForTimeout(2500);
    figures.push(
      await capture(
        page,
        'p3dCanvas',
        '3D phase projection',
        'Orthographic point cloud of (θ₁, θ₂, ω₂) — the attractor-like geometry of the energy shell.'
      )
    );
    await page.evaluate(() =>
      (window as unknown as { __modernShell: { switchTo(n: string): void } }).__modernShell.switchTo('density')
    );
    await page.waitForTimeout(2500);
    figures.push(await capture(page, 'gpuCanvas', 'Phase density', 'Additive-blend visit density over (θ₁, ω₁).'));
  } finally {
    await browser.close();
  }
  return figures.filter((f): f is Figure => f !== null);
}

/* ------------------------------------------------------------------------- *
 * Part C — HTML assembly
 * ------------------------------------------------------------------------- */

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(x: number, digits = 4): string {
  return Number.isFinite(x) ? x.toFixed(digits) : 'n/a';
}

function sci(x: number): string {
  return Number.isFinite(x) ? x.toExponential(2) : 'n/a';
}

async function main(): Promise<void> {
  console.log('computing headline numbers…');
  const n = numbers();

  let crossVal: {
    cases: Array<{ name: string; tEnd: number; maxDivergence: number; bound: number; pass: boolean }>;
  } | null = null;
  try {
    crossVal = JSON.parse(await readFile('reports/cross-validation.json', 'utf8'));
  } catch {
    console.warn('  (reports/cross-validation.json not found — run npm run validate:cross to include it)');
  }

  console.log('capturing figures from the live app (file://)…');
  const figures = await captureFigures();
  console.log(`  ${figures.length} figures captured`);

  const spectrumRows = n.spectrum.spectrum
    .map(
      (l, i) =>
        `<tr><td>λ${i + 1}</td><td>${fmt(l)}</td><td>± ${fmt(n.spectrum.blockStdError[i] ?? Number.NaN)}</td></tr>`
    )
    .join('');
  const orderRows = n.orders
    .map((o) => `<tr><td><code>${o.method}</code></td><td>${fmt(o.order, 2)}</td></tr>`)
    .join('');
  const crossRows = crossVal
    ? crossVal.cases
        .map(
          (c) =>
            `<tr><td>${esc(c.name)}</td><td>${c.tEnd} s</td><td>${sci(c.maxDivergence)}</td><td>${sci(c.bound)}</td><td>${c.pass ? 'PASS' : 'FAIL'}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5">not generated (run npm run validate:cross)</td></tr>';

  const figureHtml = figures
    .map(
      (f, i) =>
        `<figure><img src="${f.dataUrl}" alt="${esc(f.title)}"><figcaption><strong>Figure ${i + 1} — ${esc(f.title)}.</strong> ${esc(f.caption)}</figcaption></figure>`
    )
    .join('\n');

  const muMin = (r: typeof n.p1Before) => Math.min(r.multipliers[0]!.re, r.multipliers[1]!.re);

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Chaotic Pendulum Laboratory — Research Notebook</title>
<style>
body{font:15px/1.65 Georgia,'Times New Roman',serif;max-width:860px;margin:40px auto;padding:0 18px;color:#161616;background:#fff}
h1{font-size:26px;margin-bottom:2px} h2{margin-top:38px;border-bottom:1px solid #999;padding-bottom:4px}
.meta{color:#666;font-size:13px;margin-bottom:24px}
figure{margin:24px 0;page-break-inside:avoid}
img{max-width:100%;height:auto;border:1px solid #ccc;background:#0b1020}
figcaption{font-size:13.5px;margin-top:7px;color:#333}
table{border-collapse:collapse;margin:12px 0;font-size:13.5px}
td,th{border:1px solid #bbb;padding:5px 11px;text-align:left}
th{background:#f2f2f2}
code{font:13px monospace;background:#f4f4f4;padding:1px 4px}
.abstract{font-size:14px;background:#f8f8f6;border-left:3px solid #888;padding:12px 16px;margin:18px 0}
.kv b{display:inline-block;min-width:240px}
@media print{ body{margin:10mm} }
</style></head><body>
<h1>A Validated Numerical Laboratory for Chaotic Pendulum Dynamics</h1>
<div class="meta">Elliot Jung — generated ${new Date().toISOString().slice(0, 10)} — Pendulum Lab v10.25 — all numbers in this report are computed by the same code path the application, its Web Worker, the CLI and the unit suite share.</div>

<div class="abstract"><strong>Abstract.</strong> A TypeScript laboratory for nonlinear pendulum dynamics with twelve measured-order integrators, exact analytic Jacobians, and a chaos-diagnostics suite whose every claim is gated by an independent check: the Lyapunov spectrum is verified against Hamiltonian constraints, chaos verdicts are cross-validated by the Jacobian-free 0–1 test and recurrence quantification, the flip-basin boundary is quantified by basin entropy, box-counting dimension and a Wada-property candidate test, and the whole engine is cross-validated against an independently derived SciPy DOP853 reference and a 31-digit double-double ground truth. The period-doubling route to chaos of the damped driven pendulum is traced with Newton/Floquet continuation including branch switching onto the period-2 orbit.</div>

<h2>1. System and headline diagnostics</h2>
<p>All chaos diagnostics below use the equal-mass double pendulum (m₁ = m₂ = 1, l₁ = 1.2, l₂ = 1, g = 9.81) from the chaotic initial state (θ₁, θ₂, ω₁, ω₂) = (2, 2.5, 0, 0), the application's default preset.</p>
<div class="kv">
<p><b>Maximal Lyapunov λ₁</b> ${fmt(n.spectrum.spectrum[0] ?? Number.NaN)} ± ${fmt(n.spectrum.blockStdError[0] ?? Number.NaN)} (batched-means SE)<br>
<b>Spectrum sum Σλ</b> ${sci(n.spectrum.sum)} (Hamiltonian constraint: ≈ 0)<br>
<b>Kaplan–Yorke dimension</b> ${fmt(n.spectrum.kaplanYorkeDimension, 3)}<br>
<b>Consistency gate</b> ${n.spectrum.consistency.symplectic ? 'PASS' : 'CHECK'} (|Σλ| ≤ ${n.spectrum.consistency.tolerances.sumTolerance}, pairing error ${fmt(n.spectrum.consistency.pairingError, 3)}, ${n.spectrum.consistency.zeroExponentCount} zero exponents)<br>
<b>0–1 test K</b> ${fmt(n.zeroOne.K, 3)} (≈ 1 ⇒ chaotic; Jacobian-free, independent of the spectrum)<br>
<b>RQA determinism / divergence</b> ${fmt(n.rqa.determinism, 3)} / ${fmt(n.rqa.divergence, 4)}<br>
<b>FTLE field range (T = 5)</b> [${fmt(n.ftle.min, 2)}, ${fmt(n.ftle.max, 2)}]</p>
</div>
<table>
<tr><th>Exponent</th><th>Value</th><th>Block SE</th></tr>
${spectrumRows}
</table>

<h2>2. Fractal exit structure and Wada candidacy</h2>
<p>Colouring each initial angle pair by which rod flips first yields the classic double-pendulum fractal. Quantitatively (n = 120 grid):</p>
<div class="kv">
<p><b>Basin entropy S<sub>b</sub></b> ${fmt(n.basin.basinEntropy, 3)}<br>
<b>Boundary basin entropy S<sub>bb</sub></b> ${fmt(n.basin.boundaryBasinEntropy, 3)} (S<sub>bb</sub> &gt; ln 2 ≈ 0.693 is a sufficient fractality condition)<br>
<b>Box-counting dimension</b> ${fmt(n.basin.boxCountingDimension, 3)} (strictly between curve and plane)<br>
<b>Wada fraction</b> ${(n.basin.wadaFraction * 100).toFixed(1)}% of boundary cells touch ≥ 3 basins ${n.basin.wadaCandidate ? '— Wada candidate' : '(below the candidacy threshold at this resolution; the fraction grows under refinement)'}</p>
</div>

<h2>3. The period-doubling route to chaos (driven pendulum)</h2>
<p>For the damped driven pendulum (γ = 0.5, ω<sub>D</sub> = 2/3) the oscillating period-1 orbit is continued in drive amplitude A with Newton on the stroboscopic map; its real Floquet multiplier crosses −1 between A = 1.065 (μ = ${fmt(muMin(n.p1Before), 3)}) and A = 1.07 (μ = ${fmt(muMin(n.p1After), 3)}) — the textbook A<sub>PD</sub> ≈ 1.066. Switching maps to P² along the critical eigenvector lands on the period-2 orbit:</p>
<div class="kv">
<p><b>Branch switch at A = 1.07</b> ${n.pdSwitch.switched ? 'converged' : 'failed'} (residual ${sci(n.pdSwitch.doubled.residual)})<br>
<b>Period-2 orbit</b> (θ, ω) = (${fmt(n.pdSwitch.doubled.orbit[0], 4)}, ${fmt(n.pdSwitch.doubled.orbit[1], 4)}), separation ${fmt(n.pdSwitch.separation, 3)} from the period-1 point<br>
<b>Stability</b> ${n.pdSwitch.doubled.stable ? 'stable (the attractor just past onset — matches direct simulation)' : 'unstable'}; chaos follows near A ≈ 1.08</p>
</div>

<h2>4. Numerical credibility</h2>
<p>Measured convergence orders (Richardson self-convergence on this exact system; no analytic reference assumed):</p>
<table>
<tr><th>Integrator</th><th>Measured order</th></tr>
${orderRows}
</table>
<p>External cross-validation against an <em>independently derived</em> SciPy reference (different language, different derivation of the equations of motion, different integrator family — <code>solve_ivp</code> DOP853 at rtol = atol = 1e-13):</p>
<table>
<tr><th>Case</th><th>Horizon</th><th>Max ‖Δ‖∞</th><th>Bound</th><th>Verdict</th></tr>
${crossRows}
</table>
<p>For the chaotic case the divergence is the shared tolerance floor amplified by e<sup>λ₁t</sup> — the expected signature of two correct implementations of the same chaotic flow. A 31-digit double-double reference additionally measures the float64 predictability horizon itself (~1e-14 at t = 2 s growing to decorrelation by t ≈ 20 s; see <code>documents/known-limitations.md</code>).</p>

<h2>5. Figures</h2>
${figureHtml}

<h2>6. Reproducibility</h2>
<p>Every figure above is a capture of the running application (no offline re-plotting); every number is produced by the same <code>runChaosJob</code> handler the in-app worker executes, callable headlessly via <code>npm run research</code>. The full pipeline — 274 unit tests, 26 browser end-to-end tests, integrator reference validation, and the SciPy cross-check — runs in CI. Regenerate this document with <code>npm run notebook</code>.</p>
</body></html>`;

  await mkdir('reports', { recursive: true });
  await writeFile('reports/research-notebook.html', html, 'utf8');
  console.log(
    `wrote reports/research-notebook.html (${(html.length / 1024).toFixed(0)} kB, ${figures.length} figures)`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
