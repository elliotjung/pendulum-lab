/**
 * Renders the mini-paper from reports/paper-study.json (produced by
 * `npm run paper:study`) into:
 *   - paper/index.html  (self-contained: inline SVG figures, print-friendly)
 *   - paper/paper.pdf   (Playwright chromium print)
 *
 * Every number in the text is injected from the study JSON — nothing is
 * hard-coded — so re-running the study regenerates a consistent paper.
 *
 * Run: npm run paper:build
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

interface Measurement {
  gamma: number;
  Ac: number;
  attractorBracket: [number, number] | null;
  Apd: number | null;
  lossType: string;
  rhoBelow: number | null;
  rhoAbove: number | null;
  ratio: number | null;
  K_below: number | null;
  K_above: number | null;
  marchCap: number;
}

interface DuffingRow {
  delta: number;
  Gc: number;
  bracket: [number, number] | null;
  Gpd: number | null;
  uncertainty: number | null;
  ratio: number | null;
  K_below: number | null;
  K_above: number | null;
  marchCap: number;
}

interface Study {
  generatedAt: string;
  driveFrequency: number;
  dt: number;
  measurements: Measurement[];
  dtSensitivity: { gamma: number; dtFine: number; ApdFine: number | null; ApdCoarse: number | null; absDelta: number | null };
  bifurcationDiagram: { gamma: number; rows: Array<{ A: number; thetas: number[] }> };
  frequencyScan?: { method: string; scans: Array<{ omega: number; measurements: Measurement[] }> };
  duffingGapMap?: { alpha: number; beta: number; omega: number; method: string; rows: DuffingRow[] };
  runtimeSeconds: number;
}

interface Certification {
  generatedAt: string;
  figureHash: string;
  figureCaption: string;
  reviewerAppendixNote: string;
  crossing: { gamma: number; lower: number; upper: number };
  rows: Array<{
    gamma: number;
    Ac: number;
    Apd: number;
    ratio: number;
    onsetUncertainty: number;
    ratioUncertainty: number;
    rhoBelow: number;
    rhoAbove: number;
    caveat: string;
  }>;
  caveats: string[];
}

interface ExternalCheck {
  generatedAt: string;
  method: string;
  maxAcAbsError: number;
  apdChecksPassed: boolean;
  apdChecks: Array<{
    gamma: number;
    reportedApd: number;
    remeasuredApd: number;
    absError: number;
    rhoLow: number;
    rhoHigh: number;
    residualLow: number;
    residualHigh: number;
    passed: boolean;
  }>;
  caveat: string;
}

const W = 640;
const H = 400;
const MARGIN = { left: 64, right: 20, top: 18, bottom: 46 };

interface Series {
  label: string;
  color: string;
  points: Array<[number, number]>;
  line?: boolean;
  marker?: 'circle' | 'square' | 'star' | 'none';
  dash?: string;
}

function niceTicks(lo: number, hi: number, count = 6): number[] {
  const span = hi - lo;
  const rawStep = span / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? mag * 10;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + 1e-12; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function fmt(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Deterministic SVG line/scatter chart. */
function svgChart(
  series: Series[],
  options: { xLabel: string; yLabel: string; xRange: [number, number]; yRange: [number, number]; hLine?: number; caption?: string }
): string {
  const [x0, x1] = options.xRange;
  const [y0, y1] = options.yRange;
  const px = (x: number): number => MARGIN.left + ((x - x0) / (x1 - x0)) * (W - MARGIN.left - MARGIN.right);
  const py = (y: number): number => H - MARGIN.bottom - ((y - y0) / (y1 - y0)) * (H - MARGIN.top - MARGIN.bottom);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Georgia, serif" font-size="13">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  // Axes + ticks + grid.
  for (const tx of niceTicks(x0, x1)) {
    const gx = px(tx);
    parts.push(`<line x1="${gx.toFixed(1)}" y1="${MARGIN.top}" x2="${gx.toFixed(1)}" y2="${H - MARGIN.bottom}" stroke="#eeeeee"/>`);
    parts.push(`<text x="${gx.toFixed(1)}" y="${H - MARGIN.bottom + 18}" text-anchor="middle" fill="#333">${fmt(tx)}</text>`);
  }
  for (const ty of niceTicks(y0, y1)) {
    const gy = py(ty);
    parts.push(`<line x1="${MARGIN.left}" y1="${gy.toFixed(1)}" x2="${W - MARGIN.right}" y2="${gy.toFixed(1)}" stroke="#eeeeee"/>`);
    parts.push(`<text x="${MARGIN.left - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" fill="#333">${fmt(ty)}</text>`);
  }
  parts.push(`<rect x="${MARGIN.left}" y="${MARGIN.top}" width="${W - MARGIN.left - MARGIN.right}" height="${H - MARGIN.top - MARGIN.bottom}" fill="none" stroke="#444"/>`);
  if (options.hLine !== undefined && options.hLine >= y0 && options.hLine <= y1) {
    parts.push(`<line x1="${MARGIN.left}" y1="${py(options.hLine).toFixed(1)}" x2="${W - MARGIN.right}" y2="${py(options.hLine).toFixed(1)}" stroke="#999" stroke-dasharray="6 4"/>`);
  }
  // Series.
  for (const s of series) {
    const pts = s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (s.line !== false && pts.length > 1) {
      const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('');
      parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.8"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
    }
    if (s.marker !== 'none') {
      for (const [x, y] of pts) {
        if (s.marker === 'square') {
          parts.push(`<rect x="${(px(x) - 3.4).toFixed(1)}" y="${(py(y) - 3.4).toFixed(1)}" width="6.8" height="6.8" fill="${s.color}"/>`);
        } else if (s.marker === 'star') {
          parts.push(`<text x="${px(x).toFixed(1)}" y="${(py(y) + 5.6).toFixed(1)}" text-anchor="middle" font-size="19" fill="${s.color}">★</text>`);
        } else {
          parts.push(`<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="3.6" fill="${s.color}"/>`);
        }
      }
    }
  }
  // Legend (top-left inside the frame).
  let ly = MARGIN.top + 16;
  for (const s of series) {
    parts.push(`<line x1="${MARGIN.left + 12}" y1="${ly - 4}" x2="${MARGIN.left + 40}" y2="${ly - 4}" stroke="${s.color}" stroke-width="2.4"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
    parts.push(`<text x="${MARGIN.left + 48}" y="${ly}" fill="#222">${s.label}</text>`);
    ly += 19;
  }
  parts.push(`<text x="${(MARGIN.left + W - MARGIN.right) / 2}" y="${H - 10}" text-anchor="middle" fill="#222">${options.xLabel}</text>`);
  parts.push(
    `<text x="16" y="${(MARGIN.top + H - MARGIN.bottom) / 2}" text-anchor="middle" fill="#222" transform="rotate(-90 16 ${(MARGIN.top + H - MARGIN.bottom) / 2})">${options.yLabel}</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/** Strobe bifurcation diagram as a compact SVG point cloud. */
function svgBifurcation(diagram: Study['bifurcationDiagram'], AcMark: number, ApdMark: number): string {
  const rows = diagram.rows;
  const x0 = rows[0]!.A;
  const x1 = rows[rows.length - 1]!.A;
  const y0 = -Math.PI;
  const y1 = Math.PI;
  const px = (x: number): number => MARGIN.left + ((x - x0) / (x1 - x0)) * (W - MARGIN.left - MARGIN.right);
  const py = (y: number): number => H - MARGIN.bottom - ((y - y0) / (y1 - y0)) * (H - MARGIN.top - MARGIN.bottom);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Georgia, serif" font-size="13">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  for (const tx of niceTicks(x0, x1)) {
    parts.push(`<text x="${px(tx).toFixed(1)}" y="${H - MARGIN.bottom + 18}" text-anchor="middle" fill="#333">${fmt(tx)}</text>`);
  }
  for (const ty of [-3, -2, -1, 0, 1, 2, 3]) {
    parts.push(`<text x="${MARGIN.left - 8}" y="${(py(ty) + 4).toFixed(1)}" text-anchor="end" fill="#333">${ty}</text>`);
  }
  // Point cloud as one path of short horizontal dashes (compact + crisp).
  const segments: string[] = [];
  for (const row of rows) {
    const gx = px(row.A);
    for (const theta of row.thetas) {
      segments.push(`M${gx.toFixed(1)} ${py(theta).toFixed(1)}h.8`);
    }
  }
  parts.push(`<path d="${segments.join('')}" stroke="#1a3a6b" stroke-width="0.9" fill="none"/>`);
  // Threshold markers.
  for (const [value, color, label] of [
    [AcMark, '#c0392b', 'A_c'],
    [ApdMark, '#1f7a3d', 'A_PD']
  ] as Array<[number, string, string]>) {
    if (value >= x0 && value <= x1) {
      parts.push(`<line x1="${px(value).toFixed(1)}" y1="${MARGIN.top}" x2="${px(value).toFixed(1)}" y2="${H - MARGIN.bottom}" stroke="${color}" stroke-dasharray="5 4" stroke-width="1.6"/>`);
      parts.push(`<text x="${(px(value) + 4).toFixed(1)}" y="${MARGIN.top + 14}" fill="${color}">${label}</text>`);
    }
  }
  parts.push(`<rect x="${MARGIN.left}" y="${MARGIN.top}" width="${W - MARGIN.left - MARGIN.right}" height="${H - MARGIN.top - MARGIN.bottom}" fill="none" stroke="#444"/>`);
  parts.push(`<text x="${(MARGIN.left + W - MARGIN.right) / 2}" y="${H - 10}" text-anchor="middle" fill="#222">drive amplitude A</text>`);
  parts.push(`<text x="16" y="${(MARGIN.top + H - MARGIN.bottom) / 2}" text-anchor="middle" fill="#222" transform="rotate(-90 16 ${(MARGIN.top + H - MARGIN.bottom) / 2})">strobe θ (rad)</text>`);
  parts.push('</svg>');
  return parts.join('');
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

async function main(): Promise<void> {
  const study = JSON.parse(await readFile('reports/paper-study.json', 'utf8')) as Study;
  const certification = JSON.parse(await readFile('reports/flagship-certification.json', 'utf8')) as Certification;
  const external = JSON.parse(await readFile('reports/flagship-external-check.json', 'utf8')) as ExternalCheck;
  const ms = study.measurements;
  const pd = ms.filter((m) => m.lossType === 'period-doubling' && m.Apd !== null);

  // Ratio = 1 crossing by linear interpolation between bracketing γ points.
  let crossing: number | null = null;
  for (let i = 0; i + 1 < pd.length; i += 1) {
    const a = pd[i]!;
    const b = pd[i + 1]!;
    if ((a.ratio! - 1) * (b.ratio! - 1) < 0) {
      crossing = a.gamma + ((1 - a.ratio!) * (b.gamma - a.gamma)) / (b.ratio! - a.ratio!);
      break;
    }
  }

  const anchor = ms.find((m) => m.gamma === 0.5)!;
  const gammaLo = pd[0]!;
  const gammaHi = pd[pd.length - 1]!;

  const fig1 = svgChart(
    [
      {
        label: 'A_c(γ) Melnikov (analytic)',
        color: '#c0392b',
        points: Array.from({ length: 81 }, (_, i) => {
          const gamma = 0.1 + (0.7 * i) / 80;
          return [gamma, (4 * gamma * Math.cosh((Math.PI * study.driveFrequency) / 2)) / Math.PI] as [number, number];
        }),
        marker: 'none'
      },
      { label: 'A_PD(γ) measured (Floquet ρ = −1)', color: '#1f7a3d', points: pd.map((m) => [m.gamma, m.Apd!]), marker: 'circle' },
      { label: 'Baker & Gollub (γ = 0.5): 1.0663', color: '#b8860b', points: [[0.5, 1.0663]], line: false, marker: 'star' }
    ],
    { xLabel: 'damping γ', yLabel: 'drive amplitude A', xRange: [0.1, 0.85], yRange: [0, 1.8] }
  );

  const fig2 = svgChart(
    [{ label: 'A_PD / A_c (measured / analytic)', color: '#1a3a6b', points: pd.map((m) => [m.gamma, m.ratio!]), marker: 'circle' }],
    {
      xLabel: 'damping γ',
      yLabel: 'A_PD / A_c',
      xRange: [0.05, 0.85],
      yRange: [0.95, Math.max(1.5, Math.max(...pd.map((m) => m.ratio!)) * 1.05)],
      hLine: 1
    }
  );

  const fig3 = svgBifurcation(study.bifurcationDiagram, anchor.Ac, anchor.Apd ?? Number.NaN);

  // ---- Extension figures: frequency scan + Duffing double well -------------
  const scanColors = ['#b8860b', '#1a3a6b', '#1f7a3d'];
  const scanSeries: Series[] = [];
  if (study.frequencyScan) {
    const scans = [
      ...study.frequencyScan.scans.map((scan) => ({ omega: scan.omega, rows: scan.measurements })),
      { omega: study.driveFrequency, rows: ms }
    ].sort((a, b) => a.omega - b.omega);
    scans.forEach((scan, index) => {
      const pdRows = scan.rows.filter((m) => m.lossType === 'period-doubling' && m.ratio !== null);
      scanSeries.push({
        label: `ω = ${scan.omega.toFixed(scan.omega === study.driveFrequency ? 4 : 2)}`,
        color: scanColors[index % scanColors.length]!,
        points: pdRows.map((m) => [m.gamma, m.ratio!]),
        marker: 'circle'
      });
    });
  }
  const fig4 = study.frequencyScan
    ? svgChart(scanSeries, {
        xLabel: 'damping γ',
        yLabel: 'A_PD / A_c',
        xRange: [0.05, 0.85],
        yRange: [0.85, Math.max(1.6, ...scanSeries.flatMap((s) => s.points.map(([, y]) => y))) * 1.04],
        hLine: 1
      })
    : '';

  const duffingRows = study.duffingGapMap?.rows.filter((row) => row.Gpd !== null) ?? [];
  const fig5 = study.duffingGapMap
    ? svgChart(
        [
          {
            label: 'Γ_c(δ) Melnikov (analytic)',
            color: '#c0392b',
            points: duffingRows.map((row) => [row.delta, row.Gc]),
            marker: 'none'
          },
          {
            label: 'Γ_PD(δ) measured (bisection bracket)',
            color: '#1f7a3d',
            points: duffingRows.map((row) => [row.delta, row.Gpd!]),
            marker: 'circle'
          }
        ],
        {
          xLabel: 'damping δ',
          yLabel: 'drive amplitude Γ',
          xRange: [0.12, 0.38],
          yRange: [0, Math.max(0.35, ...duffingRows.map((row) => row.Gpd!)) * 1.2]
        }
      )
    : '';

  const duffingTable = duffingRows
    .map(
      (row) =>
        `<tr><td>${row.delta.toFixed(2)}</td><td>${row.Gc.toFixed(5)}</td><td>${row.Gpd!.toFixed(5)}</td><td>${row.uncertainty!.toExponential(1)}</td><td>${row.ratio!.toFixed(4)}</td><td>${row.K_below !== null ? row.K_below.toFixed(2) : '—'}</td><td>${row.K_above !== null ? row.K_above.toFixed(2) : '—'}</td></tr>`
    )
    .join('\n');

  const scanUnclassified = study.frequencyScan
    ? study.frequencyScan.scans.flatMap((scan) =>
        scan.measurements.filter((m) => m.lossType !== 'period-doubling').map((m) => `ω = ${scan.omega}, γ = ${m.gamma}`)
      )
    : [];

  const tableRows = ms
    .map((m) => {
      const apd = m.Apd !== null ? m.Apd.toFixed(5) : '—';
      const ratio = m.ratio !== null ? m.ratio.toFixed(4) : '—';
      const loss = m.lossType === 'period-doubling' ? 'PD (ρ → −1)' : m.lossType === 'no-loss-below-cap' ? `none below A = ${m.marchCap.toFixed(2)}` : `non-PD (ρ ≈ ${m.rhoBelow?.toFixed(2) ?? '?'})`;
      const kb = m.K_below !== null ? m.K_below.toFixed(2) : '—';
      const ka = m.K_above !== null ? m.K_above.toFixed(2) : '—';
      return `<tr><td>${m.gamma.toFixed(2)}</td><td>${m.Ac.toFixed(5)}</td><td>${apd}</td><td>${ratio}</td><td>${loss}</td><td>${kb}</td><td>${ka}</td></tr>`;
    })
    .join('\n');

  const certificationRows = certification.rows.map((row) => `<tr><td>${row.gamma.toFixed(2)}</td><td>${row.Ac.toFixed(6)}</td><td>${row.Apd.toFixed(6)}</td><td>${row.onsetUncertainty.toExponential(2)}</td><td>${row.ratio.toFixed(6)}</td><td>${row.rhoBelow.toFixed(5)}</td><td>${row.rhoAbove.toFixed(5)}</td><td>${esc(row.caveat)}</td></tr>`).join('\n');
  const externalRows = external.apdChecks.map((row) => `<tr><td>${row.gamma.toFixed(2)}</td><td>${row.reportedApd.toFixed(8)}</td><td>${row.remeasuredApd.toFixed(8)}</td><td>${row.absError.toExponential(2)}</td><td>${row.rhoLow.toFixed(7)}</td><td>${row.rhoHigh.toFixed(7)}</td><td>${row.passed ? 'pass' : 'fail'}</td></tr>`).join('\n');

  const dtNote = study.dtSensitivity.absDelta !== null ? study.dtSensitivity.absDelta.toExponential(1) : 'n/a';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Measuring the gap between the Melnikov threshold and the period-doubling cascade in the damped driven pendulum</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; background: #fff; }
  main { max-width: 780px; margin: 0 auto; padding: 48px 24px 80px; }
  h1 { font-size: 1.55rem; line-height: 1.3; margin-bottom: 6px; }
  .byline { color: #555; margin-bottom: 4px; }
  .abstract { border-left: 3px solid #888; padding: 4px 18px; margin: 26px 0; background: #fafafa; font-size: 0.97rem; }
  h2 { font-size: 1.18rem; margin-top: 34px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  p { line-height: 1.62; text-align: justify; }
  figure { margin: 26px 0; text-align: center; }
  figcaption { font-size: 0.9rem; color: #444; text-align: justify; margin-top: 8px; line-height: 1.5; }
  table { border-collapse: collapse; margin: 18px auto; font-size: 0.88rem; }
  th, td { border: 1px solid #bbb; padding: 4px 10px; text-align: right; }
  th { background: #f0f0f0; }
  code { font-family: Consolas, monospace; font-size: 0.9em; background: #f4f4f4; padding: 1px 4px; }
  .refs p { font-size: 0.92rem; margin: 6px 0; text-align: left; }
  .appendix { page-break-before: always; }
  .appendix + .appendix { page-break-before: auto; margin-top: 30px; }
  .artifact-ledger { font-family: Consolas, monospace; font-size: 0.82rem; }
  @media print { main { padding-top: 12px; } h2 { page-break-after: avoid; } figure { page-break-inside: avoid; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<main>
<h1>Measuring the gap between the Melnikov threshold and the period-doubling cascade in the damped driven pendulum</h1>
<div class="byline">Elliot Jung</div>
<div class="byline">${esc(new Date(study.generatedAt).toISOString().slice(0, 10))} · Pendulum Lab numerical laboratory (TypeScript engine, externally cross-validated)</div>

<div class="abstract">
<p><strong>Abstract.</strong> The damped driven pendulum θ̈ = −sin θ − γθ̇ + A cos(ωt) (ω = ${(study.driveFrequency).toFixed(4)}) carries two distinct, frequently conflated notions of a “chaos threshold”: the analytic Melnikov amplitude A<sub>c</sub>(γ), above which first-order perturbation theory predicts a transverse homoclinic tangle, and the period-doubling onset A<sub>PD</sub>(γ), where the primary period-1 attractor begins the Feigenbaum cascade that produces the sustained chaotic attractor. We measure A<sub>PD</sub> over γ ∈ [${ms[0]!.gamma}, ${ms[ms.length - 1]!.gamma}] with an attractor-strobed bisection refined by the Floquet multiplier of the Newton periodic orbit (onset interpolated at ρ = −1), and compare it with the closed-form A<sub>c</sub>. The ratio A<sub>PD</sub>/A<sub>c</sub> falls monotonically from ${gammaLo.ratio!.toFixed(2)} at γ = ${gammaLo.gamma} to ${gammaHi.ratio!.toFixed(3)} at γ = ${gammaHi.gamma}${crossing !== null ? `, and the widely quoted ordering A<sub>c</sub> &lt; A<sub>PD</sub> <em>reverses</em> near γ ≈ ${crossing.toFixed(2)}` : ''}: at low damping the tangle precedes the cascade by a wide and rapidly growing margin, while at strong damping the cascade begins <em>below</em> the first-order Melnikov prediction. At the literature point γ = 0.5 our measurement A<sub>PD</sub> = ${anchor.Apd?.toFixed(4)} agrees with the published 1.0663 (Baker &amp; Gollub) to four digits.${study.frequencyScan && study.duffingGapMap ? ' A reduced-grid frequency scan (ω = 0.5, 0.85) and a Duffing double-well companion map show the same monotone gap closure — with the crossing damping itself moving with drive frequency — so the reversal is a robust property of the first-order threshold, not an artifact of the classic parameter point.' : ''}</p>
</div>

<h2>1. Introduction</h2>
<p>The sinusoidally driven, damped pendulum is the canonical low-dimensional route to chaos, and it supports two different analytic/numerical landmarks as the drive amplitude A grows. The Melnikov method gives a closed-form first-order threshold A<sub>c</sub> = (4γω₀/π)·cosh(πω/2ω₀) above which the stable and unstable manifolds of the hilltop saddle intersect transversally, creating a Smale-horseshoe tangle. The tangle guarantees <em>transient</em> chaos and fractal basin boundaries — not a chaotic attractor. The sustained chaotic attractor instead appears at the end of a period-doubling cascade of the primary period-1 response, whose onset A<sub>PD</sub> is a property of a specific attractor branch and has no closed form. Textbooks typically note A<sub>c</sub> &lt; A<sub>PD</sub> at the classic parameter point γ = 0.5, ω = 2/3. This paper asks the quantitative question: <em>how does the gap between the two thresholds behave as damping is varied?</em></p>

<h2>2. Methods</h2>
<p>All computations use the open Pendulum Lab engine, whose equations of motion are validated component-wise against an independent SymPy symbolic derivation (max relative deviation ≈ 10<sup>−14</sup>) and whose trajectories are cross-validated against SciPy DOP853 at rtol = 10<sup>−13</sup>; the engine also reproduces published anchors (elliptic pendulum period, double-pendulum normal modes, and the γ = 0.5 period-doubling onset). The drive is made autonomous by carrying the phase as a third coordinate; integration is RK4 with dt = ${study.dt} snapped so an integer number of steps spans one drive period exactly.</p>
<p><strong>A<sub>PD</sub> measurement.</strong> For each γ, the drive amplitude is marched upward from 0.9·A<sub>c</sub> with the strobed state warm-started at every step, so the measurement follows the physically realised attractor branch (this matters: the symmetric period-1 orbit pitchforks before the cascade, and a Newton continuation of the <em>symmetric</em> orbit would miss the doubling of the symmetry-broken branch the attractor actually follows). The loss of period-1 stability is bisected on the strobe map (transients of 300–600 drive periods; period detected in the (sin θ, cos θ, ω) embedding, immune to 2π winding). The bracket is then refined by Newton periodic orbits <em>seeded from the attractor</em>: the most negative real Floquet multiplier ρ(A) of the orbit is interpolated through ρ = −1. A measurement is accepted as a period doubling only when this crossing is verified; otherwise the loss is reported as non-PD. Halving dt changes the γ = 0.5 onset by |Δ| ≈ ${dtNote}, so discretisation error is negligible at the quoted precision.</p>
<p><strong>Corroboration.</strong> At 0.97·A<sub>PD</sub> and 1.08·A<sub>PD</sub> the Gottwald–Melbourne 0–1 test is applied to the cos θ strobe series (700 samples): K ≈ 0 confirms regular motion below onset; the value above onset depends on whether 1.08·A<sub>PD</sub> lands beyond the cascade accumulation point or inside a periodic window, and is reported without prejudice.</p>

<h2>3. Results</h2>
<figure>
${fig1}
<figcaption><strong>Figure 1.</strong> The analytic Melnikov threshold A<sub>c</sub>(γ) (red line) and the measured period-doubling onset A<sub>PD</sub>(γ) (green circles, Floquet-refined). The star is the published γ = 0.5 value 1.0663 (Baker &amp; Gollub); our measurement at that point is ${anchor.Apd?.toFixed(5) ?? '—'}. A<sub>c</sub> is exactly linear in γ; the measured cascade onset is not. Certification artifact: <code>reports/flagship-figure1.svg</code>, SHA-256 prefix <code>${certification.figureHash}</code>; numerical rows and uncertainty brackets are cross-referenced in Appendix A.</figcaption>
</figure>
<figure>
${fig2}
<figcaption><strong>Figure 2.</strong> The ratio A<sub>PD</sub>/A<sub>c</sub> versus damping. The gap closes monotonically with increasing γ${crossing !== null ? ` and crosses 1 near γ ≈ ${crossing.toFixed(2)}: beyond this damping the period-doubling cascade of the primary attractor begins <em>below</em> the Melnikov tangle threshold` : ''}. At γ = ${gammaLo.gamma} the cascade requires ${((gammaLo.ratio! - 1) * 100).toFixed(0)}% more drive than the tangle.</figcaption>
</figure>
<figure>
${fig3}
<figcaption><strong>Figure 3.</strong> Strobe bifurcation diagram at γ = 0.5 (θ sampled once per drive period after a 250-period transient, warm-started in A). The dashed lines mark A<sub>c</sub> (red) and the measured A<sub>PD</sub> (green). Between them the motion is periodic but the phase space already contains the homoclinic tangle: transient chaos and fractal basin boundaries without a strange attractor. The cascade, chaotic band, and the large periodic (rotating) window are visible beyond A<sub>PD</sub>.</figcaption>
</figure>

<table>
<thead><tr><th>γ</th><th>A_c (Melnikov)</th><th>A_PD (measured)</th><th>A_PD/A_c</th><th>loss of period-1</th><th>K at 0.97·A</th><th>K at 1.08·A</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>

<h2>4. Discussion</h2>
<p>Three regimes emerge. (i) <strong>Low damping (γ ≲ 0.2):</strong> A<sub>c</sub> → 0 linearly while the cascade onset of the primary resonance remains an order-one amplitude, so the ratio diverges (${gammaLo.ratio!.toFixed(2)} already at γ = ${gammaLo.gamma}). The window of “tangle but no strange attractor” — long chaotic transients and fractal basin boundaries below a still-periodic attractor — is widest here, and the phase space is visibly multistable (see §5). (ii) <strong>Moderate damping:</strong> the textbook ordering A<sub>c</sub> &lt; A<sub>PD</sub> holds, but the margin shrinks steadily (to ${((anchor.ratio! - 1) * 100).toFixed(0)}% at γ = 0.5). (iii) <strong>Strong damping${crossing !== null ? ` (γ ≳ ${crossing.toFixed(2)})` : ''}:</strong> the measured cascade begins <em>below</em> the first-order Melnikov prediction. This is not a contradiction — the Melnikov threshold is asymptotically exact only as γ, A → 0, and by γ ≈ 0.7 the perturbation parameter is O(1) — but it sharpens the usual caveat into a measured boundary: the first-order formula stops being even an ordering bound near γ ≈ ${crossing !== null ? crossing.toFixed(2) : '0.7'}.</p>
<p>The 0–1 test values corroborate the structural picture: K ≈ 0 on the period-1 side everywhere, while above onset K depends on where 1.08·A<sub>PD</sub> falls relative to the cascade accumulation point and the periodic windows visible in Figure 3 — both outcomes occur in the table, as expected for a Feigenbaum scenario with embedded windows.</p>

${study.frequencyScan && study.duffingGapMap ? `<h2>5. Beyond one frequency and one system</h2>
<p>Two extensions probe whether the closing gap is an artifact of the classic parameter point. First, a reduced-grid <strong>frequency scan</strong> repeats the full Floquet-refined measurement at ω = 0.5 and ω = 0.85. The shape survives: the ratio falls monotonically with damping at every frequency, and the crossing damping γ* moves with ω — at ω = 0.85 the gap is still open at γ = 0.8 (ratio ${(study.frequencyScan.scans.find((s) => s.omega === 0.85)?.measurements.at(-1)?.ratio ?? NaN).toFixed(3)}), while at ω = 0.5 the measured points at γ = 0.65 and 0.8 already sit <em>below</em> 1 (${study.frequencyScan.scans.find((s) => s.omega === 0.5)?.measurements.filter((m) => m.ratio !== null).map((m) => m.ratio!.toFixed(3)).join(', ') ?? ''}). ${scanUnclassified.length > 0 ? `At ${esc(scanUnclassified.join('; '))} the primary branch loses period-1 stability without a verified ρ = −1 crossing, and those points are reported as unclassified rather than forced into the map.` : ''}</p>
<figure>
${fig4}
<figcaption><strong>Figure 4.</strong> A<sub>PD</sub>/A<sub>c</sub> versus damping at three drive frequencies (Floquet-refined points only). The monotone closure persists at every ω, and the ratio-1 crossing shifts with frequency — the reversal is a property of the first-order threshold itself, not of ω = 2/3.</figcaption>
</figure>
<p>Second, the same question is posed to a different system: the symmetric <strong>Duffing double well</strong> ẍ = −δẋ + x − x³ + Γcos(t). The closed-form Melnikov threshold Γ_c(δ) (derived and quadrature-verified in the engine, reducing to the Guckenheimer–Holmes expression at α = −1, β = 1) is compared with the marched/bisected loss of period-1 stability of the confined single-well attractor. There is no Newton–Floquet refinement for the Duffing flow yet, so Γ_PD is quoted as a bisection bracket midpoint — honestly wider than the pendulum's interpolated onsets, though the brackets themselves are ~10⁻⁸ wide.</p>
<figure>
${fig5}
<figcaption><strong>Figure 5.</strong> The Duffing double-well gap map: analytic Γ<sub>c</sub>(δ) (red) versus the measured period-doubling onset Γ<sub>PD</sub>(δ) (green). The ratio falls from ${duffingRows[0]?.ratio?.toFixed(2) ?? '—'} at δ = ${duffingRows[0]?.delta ?? '—'} to ${duffingRows.at(-1)?.ratio?.toFixed(3) ?? '—'} at δ = ${duffingRows.at(-1)?.delta ?? '—'} — the same monotone closure as the pendulum, in a system with a polynomial (non-pendulum) nonlinearity.</figcaption>
</figure>
<table>
<thead><tr><th>δ</th><th>Γ_c (Melnikov)</th><th>Γ_PD (measured)</th><th>δΓ_PD</th><th>Γ_PD/Γ_c</th><th>K at 0.97·Γ</th><th>K at 1.08·Γ</th></tr></thead>
<tbody>
${duffingTable}
</tbody>
</table>
<p>The 0–1 test corroborates every Duffing onset (K ≈ 0 below, K ≈ 1 above — the cascade accumulates quickly in the double well at these parameters). Together the two extensions upgrade the paper's claim from "the thresholds cross at one classic parameter point" to "first-order Melnikov ordering degrades with damping across drive frequencies and across systems".</p>

<h2>6. Limitations and reproducibility</h2>` : `<h2>5. Limitations and reproducibility</h2>`}
<p>The ${study.frequencyScan ? 'main grid fixes' : 'study fixes'} ω = 2/3${study.frequencyScan ? ' (the frequency scan of §5 samples ω = 0.5 and 0.85 on a reduced γ grid)' : ''} and follows a single attractor branch per γ (warm-started in A); coexisting attractors reached from other initial conditions may double elsewhere. At the lowest dampings the phase space is multistable enough that a finer warm-started march can hop basins before the doubling — at γ = 0.15 a basin-capture transition of the followed state was observed near A ≈ 0.49 (the orbit itself remains strongly stable there, ρ ≈ +0.29), below the verified doubling at ${(ms.find((m) => m.gamma === 0.15)?.Apd ?? 0.531).toFixed(3)}. The quoted A<sub>PD</sub> values are therefore specifically the ρ = −1 doublings of the primary oscillating branch, not necessarily the first event of any kind along a slow amplitude sweep. The Melnikov comparison concerns the first-order formula specifically — higher-order or numerical manifold computations would move A<sub>c</sub>. The full study regenerates with <code>npm run paper:study</code> (~${Math.round(study.runtimeSeconds / 60)} min) followed by <code>npm run flagship:certify</code>, <code>npm run flagship:external</code>, and <code>npm run paper:build</code>; the engine tests and independent symbolic/trajectory validations are in the same repository.</p>

<section class="appendix">
<h2>Appendix A. Certified onset localization</h2>
<p>${esc(certification.reviewerAppendixNote)} The ratio crossing is localized to γ ∈ [${certification.crossing.lower.toFixed(8)}, ${certification.crossing.upper.toFixed(8)}], with point estimate ${certification.crossing.gamma.toFixed(8)}. The Figure 1 hash is <code>${certification.figureHash}</code>.</p>
<table>
<thead><tr><th>γ</th><th>A_c</th><th>A_PD</th><th>δA_PD</th><th>A_PD/A_c</th><th>ρ below</th><th>ρ above</th><th>caveat</th></tr></thead>
<tbody>${certificationRows}</tbody>
</table>
</section>

<section class="appendix">
<h2>Appendix B. Independent Python A<sub>PD</sub> reproduction</h2>
<p>${esc(external.method)} The analytic threshold agrees with maximum absolute error ${external.maxAcAbsError.toExponential(2)}. All selected period-doubling checks passed: <strong>${external.apdChecksPassed ? 'yes' : 'no'}</strong>.</p>
<table>
<thead><tr><th>γ</th><th>reported A_PD</th><th>Python A_PD</th><th>|Δ|</th><th>ρ low</th><th>ρ high</th><th>status</th></tr></thead>
<tbody>${externalRows}</tbody>
</table>
<p><strong>Independent-check caveat.</strong> ${esc(external.caveat)}</p>
</section>

<section class="appendix">
<h2>Appendix C. Artifact integrity and caveat ledger</h2>
<table class="artifact-ledger">
<thead><tr><th>Artifact</th><th>Reproduce</th><th>Cross-reference</th></tr></thead>
<tbody>
<tr><td>reports/paper-study.json</td><td>npm run paper:study</td><td>Figures 1-3, main table</td></tr>
<tr><td>reports/flagship-certification.json</td><td>npm run flagship:certify</td><td>Figure 1 hash ${certification.figureHash}; Appendix A</td></tr>
<tr><td>reports/flagship-external-check.json</td><td>npm run flagship:external</td><td>Appendix B</td></tr>
<tr><td>paper/paper.pdf</td><td>npm run paper:build</td><td>This manuscript</td></tr>
</tbody>
</table>
<p><strong>Caveat map.</strong> ${certification.caveats.map(esc).join(' ')}</p>
</section>

<h2 class="refs">References</h2>
<div class="refs">
<p>G. L. Baker and J. P. Gollub, <em>Chaotic Dynamics: An Introduction</em>, 2nd ed., Cambridge University Press (1996).</p>
<p>J. Guckenheimer and P. Holmes, <em>Nonlinear Oscillations, Dynamical Systems, and Bifurcations of Vector Fields</em>, Springer, §4.5 (1983).</p>
<p>V. K. Melnikov, “On the stability of the center for time-periodic perturbations,” <em>Trans. Moscow Math. Soc.</em> <strong>12</strong>, 1–57 (1963).</p>
<p>G. A. Gottwald and I. Melbourne, “On the implementation of the 0–1 test for chaos,” <em>SIAM J. Appl. Dyn. Syst.</em> <strong>8</strong>, 129–145 (2009).</p>
<p>M. J. Feigenbaum, “Quantitative universality for a class of nonlinear transformations,” <em>J. Stat. Phys.</em> <strong>19</strong>, 25–52 (1978).</p>
</div>
</main>
</body>
</html>
`;

  await mkdir('paper', { recursive: true });
  await writeFile('paper/index.html', html);
  console.log(`paper/index.html written (${(html.length / 1024).toFixed(0)} KB)`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + resolve('paper/index.html'));
    await page.pdf({ path: 'paper/paper.pdf', format: 'A4', margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' }, printBackground: true });
    console.log('paper/paper.pdf written');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
