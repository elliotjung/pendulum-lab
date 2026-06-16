/**
 * Spherical pendulum and spherical N-chain cards: parameter/IC readers, the
 * chain SystemSpec bridge, simulation lifecycle, 3D canvas rendering (orbit
 * camera, depth-sorted bobs, per-bob trails), Poincaré inset, and readouts
 * with chart-limit warnings. Analyses and exports are wired in through the
 * handler interfaces (they live in `lab3d-diagnostics.ts` / `lab3d-exports.ts`).
 */
import type { IntegratorId } from '../../types/domain';
import { SphericalPendulum } from '../../physics/spherical';
import { SphericalChain, type SphericalChainParams } from '../../physics/sphericalChain';
import type { SystemSpec } from '../../physics/systemSpec';
import { bindOrbitControls, depthSortIndices, drawPolyline3D, drawSphereWireframe } from '../../viz/orbit3d';
import { clampNumber } from './storage-sync';
import { $, append, button, html, numberFrom, setText } from './shared';
import { researchActions, researchCard, researchFormRow, researchInput, researchSelect } from './research-ui-components';
import { CHAIN_COLORS } from './lab3d-utils';
import {
  buildLab3dChainInitialState,
  buildLab3dChainParams,
  buildLab3dChainSpec,
  normalizeLab3dChainMethod,
  normalizeLab3dChainN,
  type Lab3dChainInput
} from './lab3d-chain-config';
import { lab3d, lab3dEnsureLoop, registerLab3dFrameHook } from './lab3d-render-loop';

export function resetSphereSim(): void {
  const theta0 = clampNumber(numberFrom('s3Theta0', 1.0), 1.0, 0.05, 3.05);
  const phiDot0 = clampNumber(numberFrom('s3PhiDot0', 1.5), 1.5, -10, 10);
  const thetaDot0 = clampNumber(numberFrom('s3ThetaDot0', 0.3), 0.3, -10, 10);
  const params = {
    l: clampNumber(numberFrom('s3Length', 1), 1, 0.2, 3),
    g: clampNumber(numberFrom('s3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('s3Damping', 0), 0, 0, 5)
  };
  lab3d.sphere = new SphericalPendulum(params, [theta0, 0, thetaDot0, phiDot0], 0.002);
  lab3d.sphereTrail = [];
  lab3d.spherePoincare = [];
  lab3d.spherePrev = null;
  lab3d.lastThetaDotSign = Math.sign(thetaDot0) || 1;
  renderSphereSim();
  renderSphereReadout();
}

/** Read raw text-ish control values; numeric normalization lives in lab3d-chain-config. */
function textInputValue(id: string): string {
  const el = $(id);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
}

function lab3dChainInput(): Lab3dChainInput {
  const method = $('d3Method');
  return {
    nValue: numberFrom('d3N', 2),
    methodValue: method instanceof HTMLSelectElement ? method.value : 'rk4',
    massesText: textInputValue('d3Masses'),
    lengthsText: textInputValue('d3Lengths'),
    thetaText: textInputValue('d3Thetas'),
    phiText: textInputValue('d3Phis'),
    thetaDotText: textInputValue('d3ThetaDots'),
    phiDotText: textInputValue('d3PhiDots'),
    gravityValue: numberFrom('d3Gravity', 9.81),
    dampingValue: numberFrom('d3Damping', 0),
    clampNumber
  };
}

export function lab3dChainN(): number {
  return normalizeLab3dChainN(numberFrom('d3N', 2), clampNumber);
}

export function lab3dChainMethod(): IntegratorId {
  const raw = $('d3Method');
  const value = raw instanceof HTMLSelectElement ? raw.value : 'rk4';
  return normalizeLab3dChainMethod(value);
}

export function lab3dChainParams(): SphericalChainParams {
  return buildLab3dChainParams(lab3dChainInput());
}

/** Full initial state [θ_k, φ_k …, θ̇_k, φ̇_k …] from the per-link IC lists. */
export function lab3dChainInitialState(): number[] {
  return buildLab3dChainInitialState(lab3dChainInput());
}

/** Declarative spec of the current chain — the bridge into the research stack. */
export function chainSpec(): Extract<SystemSpec, { kind: 'spherical-chain' }> {
  return buildLab3dChainSpec(lab3dChainParams());
}

export function resetChainSim(): void {
  const params = lab3dChainParams();
  const dt = clampNumber(numberFrom('d3Dt', 0.001), 0.001, 0.0001, 0.01);
  lab3d.chain = new SphericalChain(params, lab3dChainInitialState(), {
    dt,
    method: lab3dChainMethod(),
    tolerance: 10 ** clampNumber(numberFrom('d3Tol', -10), -10, -14, -4)
  });
  lab3d.chainTrails = params.masses.map(() => []);
  renderChainSim();
  renderChainReadout();
}

export function renderSphereSim(): void {
  const canvas = $('s3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.sphere) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { l } = lab3d.sphere.params;
  const scale = (Math.min(canvas.width, canvas.height) * 0.4) / l;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawSphereWireframe(ctx, lab3d.camera, l, scale);
  drawPolyline3D(ctx, lab3d.camera, lab3d.sphereTrail, scale, { r: 76, g: 201, b: 240 });
  // Rod/string + bob.
  const position = lab3d.sphere.position();
  const pivot = lab3d.camera.project({ x: 0, y: 0, z: 0 }, canvas.width, canvas.height, scale);
  const bob = lab3d.camera.project(position, canvas.width, canvas.height, scale);
  const diag = lab3d.sphere.diagnostics();
  const stringInvalid = lab3d.sphereStyle === 'rope' && diag.tension < 0;
  ctx.strokeStyle = stringInvalid ? '#e63946' : '#cdd7ee';
  ctx.lineWidth = lab3d.sphereStyle === 'rod' ? 2.6 : 1.4;
  if (stringInvalid) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pivot.screenX, pivot.screenY);
  ctx.lineTo(bob.screenX, bob.screenY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(pivot.screenX, pivot.screenY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = stringInvalid ? '#e63946' : '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bob.screenX, bob.screenY, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText('drag to orbit, wheel to zoom', 8, canvas.height - 8);
  // Poincaré inset: (φ mod 2π, θ) at θ̇ = 0 crossings.
  const inset = $('s3Poincare');
  if (inset instanceof HTMLCanvasElement) {
    const ictx = inset.getContext('2d');
    if (ictx) {
      ictx.fillStyle = '#0b1020';
      ictx.fillRect(0, 0, inset.width, inset.height);
      ictx.fillStyle = '#f4a261';
      for (const point of lab3d.spherePoincare) {
        const px = (point.phi / (2 * Math.PI)) * inset.width;
        const py = inset.height - (point.theta / Math.PI) * inset.height;
        ictx.fillRect(px, py, 2, 2);
      }
      ictx.fillStyle = '#8fa3c2';
      ictx.font = '9px system-ui';
      ictx.fillText('Poincaré: (φ, θ) at θ̇=0', 6, 12);
    }
  }
}

export function renderSphereReadout(): void {
  if (!lab3d.sphere) return;
  const diag = lab3d.sphere.diagnostics();
  const [theta, phi, thetaDot, phiDot] = lab3d.sphere.current();
  setText('s3Readout', [
    `θ=${theta.toFixed(3)}, φ=${phi.toFixed(3)}, θ̇=${thetaDot.toFixed(3)}, φ̇=${phiDot.toFixed(3)}`,
    `E/m=${diag.energy.toFixed(5)} (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz/m=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `T/m=${diag.tension.toFixed(3)} N/kg, constraint err=${diag.constraintEnergyError.toExponential(2)}`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
  const warningNode = $('s3Warning');
  if (warningNode) {
    const stringMode = lab3d.sphereStyle === 'rope';
    const message = stringMode && diag.tension < 0
      ? 'TENSION COLLAPSE: a string cannot push — this regime needs a rod (string constraint invalid).'
      : stringMode && diag.tension < 0.05 * lab3d.sphere.params.g
        ? 'Tension near zero — string constraint about to become invalid.'
        : '';
    warningNode.textContent = message;
    warningNode.style.color = message ? '#e63946' : '';
  }
}

export function renderChainSim(): void {
  const canvas = $('d3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.chain) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reach = lab3d.chain.params.lengths.reduce((sum, l) => sum + l, 0);
  const scale = (Math.min(canvas.width, canvas.height) * 0.4) / reach;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Outer-reach envelope sphere (radius Σ l_k).
  drawSphereWireframe(ctx, lab3d.chainCamera, reach, scale);
  lab3d.chainTrails.forEach((trail, index) => {
    const color = CHAIN_COLORS[index % CHAIN_COLORS.length]!;
    drawPolyline3D(ctx, lab3d.chainCamera, trail, scale, { r: color.r, g: color.g, b: color.b });
  });
  const positions = lab3d.chain.positions();
  if (positions.length === 0) return;
  const pivot = lab3d.chainCamera.project({ x: 0, y: 0, z: 0 }, canvas.width, canvas.height, scale);
  const projected = positions.map((p) => lab3d.chainCamera.project(p, canvas.width, canvas.height, scale));
  ctx.strokeStyle = '#cdd7ee';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(pivot.screenX, pivot.screenY);
  for (const bob of projected) ctx.lineTo(bob.screenX, bob.screenY);
  ctx.stroke();
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(pivot.screenX, pivot.screenY, 4, 0, 2 * Math.PI);
  ctx.fill();
  // Painter's order: draw far bobs first so near bobs overlap them correctly.
  for (const index of depthSortIndices(projected)) {
    const bob = projected[index]!;
    ctx.fillStyle = CHAIN_COLORS[index % CHAIN_COLORS.length]!.css;
    ctx.beginPath();
    ctx.arc(bob.screenX, bob.screenY, index === projected.length - 1 ? 8 : 7, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText('drag to orbit, wheel to zoom', 8, canvas.height - 8);
}

export function renderChainReadout(): void {
  if (!lab3d.chain) return;
  const diag = lab3d.chain.diagnostics();
  const state = lab3d.chain.current();
  const n = lab3d.chain.params.masses.length;
  const sub = (value: number): string => String(value).replace(/\d/g, (digit) => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]!);
  const angles = Array.from({ length: n }, (_, k) =>
    `θ${sub(k + 1)}=${(state[2 * k] ?? 0).toFixed(2)}, φ${sub(k + 1)}=${(state[2 * k + 1] ?? 0).toFixed(2)}`).join(' ');
  const residualText = diag.relativeResidual !== undefined ? `, relres=${diag.relativeResidual.toExponential(1)}` : '';
  setText('d3Readout', [
    `N=${n} | ${angles}`,
    `E=${diag.energy.toFixed(5)} J (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `mass-matrix cond~${diag.conditionEstimate.toExponential(2)}${residualText}`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
  // Coordinate-chart limit display: the (θ, φ) chart degenerates at the poles
  // (sinθ → 0). Warn while any link is close, and explain the Lz caveat.
  const warningNode = $('d3Warning');
  if (warningNode) {
    let minAbsSin = Infinity;
    let nearLink = 0;
    for (let k = 0; k < n; k += 1) {
      const absSin = Math.abs(Math.sin(state[2 * k] ?? 0));
      if (absSin < minAbsSin) {
        minAbsSin = absSin;
        nearLink = k + 1;
      }
    }
    const chartMessage = minAbsSin < 5e-3
      ? `CHART LIMIT: link ${nearLink} is near a pole (|sinθ| = ${minAbsSin.toExponential(1)}). The azimuth φ is ill-conditioned there; with Lz ≠ 0 the chart genuinely diverges (planar Lz = 0 passages are exact).`
      : minAbsSin < 5e-2
        ? `Link ${nearLink} approaching a pole (|sinθ| = ${minAbsSin.toFixed(3)}): azimuth chart accuracy degrades below |sinθ| ≈ 1e-6.`
        : '';
    const conditionMessage = diag.conditionEstimate > 1e10
      ? `MASS MATRIX WARNING: condition estimate ${diag.conditionEstimate.toExponential(2)}; reduce dt, avoid pole charts, or switch to a validated CPU reference before treating this as research-grade.`
      : diag.conditionEstimate > 1e7
        ? `Mass matrix is getting ill-conditioned (cond~${diag.conditionEstimate.toExponential(2)}); interpret finite-time estimates cautiously.`
        : '';
    const message = [chartMessage, conditionMessage].filter(Boolean).join(' | ');
    warningNode.textContent = message;
    warningNode.style.color = message ? (minAbsSin < 5e-3 || diag.conditionEstimate > 1e10 ? '#e63946' : '#f4a261') : '';
  }
}

/** Advance the spherical pendulum by one quantum (frame-loop hook). */
export function sphereFrameHook(elapsed: number): void {
  if (!lab3d.sphereRunning || !lab3d.sphere) return;
  lab3d.sphere.step(elapsed);
  const position = lab3d.sphere.position();
  lab3d.sphereTrail.push(position);
  if (lab3d.sphereTrail.length > 1200) lab3d.sphereTrail.shift();
  // Poincaré section at θ̇ = 0 (turning points of the polar angle), with the
  // crossing interpolated to the θ̇ zero instead of frame-sampled: the frame
  // bracket [prev, now] is solved linearly in θ̇ for (θ, φ) at the section.
  const [theta, phi, thetaDot] = lab3d.sphere.current();
  const previous = lab3d.spherePrev;
  if (previous && Math.sign(thetaDot ?? 0) !== Math.sign(previous[2]) && previous[2] !== 0) {
    const dPrev = previous[2];
    const frac = dPrev / (dPrev - (thetaDot ?? 0));
    const thetaCross = previous[0] + frac * ((theta ?? 0) - previous[0]);
    const phiCross = previous[1] + frac * ((phi ?? 0) - previous[1]);
    lab3d.spherePoincare.push({ phi: ((phiCross % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), theta: thetaCross });
    if (lab3d.spherePoincare.length > 800) lab3d.spherePoincare.shift();
  }
  lab3d.spherePrev = [theta ?? 0, phi ?? 0, thetaDot ?? 0];
  renderSphereSim();
  renderSphereReadout();
}

/** Advance the spherical chain by one quantum (frame-loop hook). */
export function chainFrameHook(elapsed: number): void {
  if (!lab3d.chainRunning || !lab3d.chain) return;
  lab3d.chain.step(elapsed);
  const positions = lab3d.chain.positions();
  positions.forEach((position, index) => {
    const trail = lab3d.chainTrails[index];
    if (!trail) return;
    trail.push(position);
    const cap = index === positions.length - 1 ? 1500 : 500;
    if (trail.length > cap) trail.shift();
  });
  renderChainSim();
  renderChainReadout();
}

export interface SphereCardHandlers {
  exportSnapshot(): void;
}

export function buildSphereCard(handlers: SphereCardHandlers): HTMLElement {
  registerLab3dFrameHook(sphereFrameHook);
  const sphereCard = researchCard('Spherical Pendulum (True 3D Dynamics)', 'lab3dSphereCard');
  sphereCard.classList.add('research-wide');
  const sphereCanvas = html('canvas', { id: 's3Canvas' }) as HTMLCanvasElement;
  sphereCanvas.width = 460;
  sphereCanvas.height = 360;
  sphereCanvas.style.width = '100%';
  sphereCanvas.style.maxWidth = '480px';
  sphereCanvas.style.touchAction = 'none';
  const poincareCanvas = html('canvas', { id: 's3Poincare' }) as HTMLCanvasElement;
  poincareCanvas.width = 220;
  poincareCanvas.height = 150;
  poincareCanvas.style.width = '100%';
  poincareCanvas.style.maxWidth = '240px';
  const sphereStyleSelect = researchSelect('s3Style', [['rod', 'rigid rod (full sphere)'], ['rope', 'string (T ≥ 0 required)']]);
  sphereStyleSelect.addEventListener('change', () => {
    lab3d.sphereStyle = sphereStyleSelect.value === 'rope' ? 'rope' : 'rod';
    renderSphereSim();
    renderSphereReadout();
  });
  bindOrbitControls(sphereCanvas, lab3d.camera, () => renderSphereSim());
  append(
    sphereCard,
    researchFormRow('Constraint', sphereStyleSelect),
    researchFormRow('θ₀ (rad)', researchInput('s3Theta0', 'number', '1.0', 'polar angle from down')),
    researchFormRow('θ̇₀', researchInput('s3ThetaDot0', 'number', '0.3', 'rad/s')),
    researchFormRow('φ̇₀', researchInput('s3PhiDot0', 'number', '1.5', 'rad/s (azimuthal)')),
    researchFormRow('Length', researchInput('s3Length', 'number', '1', 'm')),
    researchFormRow('Gravity', researchInput('s3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('s3Damping', 'number', '0', '1/s')),
    researchActions(
      button('s3Run', 'Run', () => {
        if (!lab3d.sphere) resetSphereSim();
        lab3d.sphereRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('s3Pause', 'Pause', () => {
        lab3d.sphereRunning = false;
      }),
      button('s3Reset', 'Reset', () => {
        lab3d.sphereRunning = false;
        resetSphereSim();
      }),
      button('s3Export', 'Export 3D Snapshot', () => handlers.exportSnapshot())
    ),
    sphereCanvas,
    poincareCanvas,
    html('div', { id: 's3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 's3Readout', className: 'research-summary', text: 'Reset to initialise. The spherical pendulum integrates θ̈ = sinθcosθ·φ̇² − (g/l)sinθ and conserves E and Lz when undamped — real 3D dynamics, not a camera trick.' })
  );
  return sphereCard;
}

export interface ChainCardHandlers {
  analyze(): void;
  analyzeSpectrum(): void;
  analyzeConserved(): void;
  analyzeEnergyShell(): void;
  exportCsv(): void;
  exportSnapshot(): void;
}

export function buildChainCard(handlers: ChainCardHandlers): HTMLElement {
  registerLab3dFrameHook(chainFrameHook);
  const chainCard = researchCard('Spherical N-Chain (3D Chaos, 2N DOF)', 'lab3dChainCard');
  chainCard.classList.add('research-wide');
  const chainCanvas = html('canvas', { id: 'd3Canvas' }) as HTMLCanvasElement;
  chainCanvas.width = 460;
  chainCanvas.height = 360;
  chainCanvas.style.width = '100%';
  chainCanvas.style.maxWidth = '480px';
  chainCanvas.style.touchAction = 'none';
  bindOrbitControls(chainCanvas, lab3d.chainCamera, () => renderChainSim());
  const chainN = researchSelect('d3N', [['1', 'N = 1 (spherical pendulum)'], ['2', 'N = 2 (spherical double)'], ['3', 'N = 3 (spherical triple)'], ['4', 'N = 4'], ['5', 'N = 5']]);
  chainN.value = '2';
  // Changing N re-seeds the per-link lists with sensible defaults of length N.
  chainN.addEventListener('change', () => {
    const n = lab3dChainN();
    const seed = (id: string, values: number[]): void => {
      const el = $(id);
      if (el instanceof HTMLInputElement) el.value = values.map((v) => String(v)).join(',');
    };
    seed('d3Masses', Array.from({ length: n }, (_, k) => (k === 0 ? 1 : 0.8)));
    seed('d3Lengths', Array.from({ length: n }, (_, k) => (k === 0 ? 1 : 0.8)));
    seed('d3Thetas', Array.from({ length: n }, (_, k) => Number((1.6 + 0.6 * k).toFixed(2))));
    seed('d3Phis', Array.from({ length: n }, () => 0));
    seed('d3ThetaDots', Array.from({ length: n }, () => 0));
    seed('d3PhiDots', Array.from({ length: n }, (_, k) => (k % 2 === 0 ? 1.2 : -0.8)));
    lab3d.chainRunning = false;
    resetChainSim();
  });
  const chainMethod = researchSelect('d3Method', [
    ['rk4', 'RK4 (fixed step, order 4)'],
    ['dopri5', 'Dormand–Prince 5(4) (adaptive)'],
    ['gbs', 'Gragg–Bulirsch–Stoer (adaptive)'],
    ['gauss2', 'Gauss–Legendre 2 (implicit, symplectic)'],
    ['yoshida4', 'Yoshida 4 (symplectic splitting)']
  ]);
  chainMethod.addEventListener('change', () => {
    lab3d.chainRunning = false;
    resetChainSim();
  });
  const shellCanvas = html('canvas', { id: 'd3ShellCanvas' }) as HTMLCanvasElement;
  shellCanvas.width = 460;
  shellCanvas.height = 140;
  shellCanvas.style.width = '100%';
  shellCanvas.style.maxWidth = '480px';
  append(
    chainCard,
    researchFormRow('Links N', chainN),
    researchFormRow('Integrator', chainMethod),
    researchFormRow('dt', researchInput('d3Dt', 'number', '0.001', 's (fixed step / adaptive base)')),
    researchFormRow('log₁₀ tol', researchInput('d3Tol', 'number', '-10', 'adaptive/implicit tolerance')),
    researchFormRow('θ list', researchInput('d3Thetas', 'text', '1.6,2.2', 'rad, comma separated per link')),
    researchFormRow('φ list', researchInput('d3Phis', 'text', '0,0', 'rad, comma separated per link')),
    researchFormRow('θ̇ list', researchInput('d3ThetaDots', 'text', '0,0', 'rad/s per link')),
    researchFormRow('φ̇ list', researchInput('d3PhiDots', 'text', '1.2,-0.8', 'rad/s per link')),
    researchFormRow('masses', researchInput('d3Masses', 'text', '1,0.8', 'kg per link')),
    researchFormRow('lengths', researchInput('d3Lengths', 'text', '1,0.8', 'm per link')),
    researchFormRow('Gravity', researchInput('d3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('d3Damping', 'number', '0', '1/s')),
    researchFormRow('Export T', researchInput('d3ExportT', 'number', '20', 's of trajectory for CSV export')),
    researchActions(
      button('d3Run', 'Run', () => {
        if (!lab3d.chain) resetChainSim();
        lab3d.chainRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('d3Pause', 'Pause', () => {
        lab3d.chainRunning = false;
      }),
      button('d3Reset', 'Reset', () => {
        lab3d.chainRunning = false;
        resetChainSim();
      })
    ),
    researchActions(
      button('d3Analyze', 'Analyze λ/RQA/FTLE', () => handlers.analyze(), 'primary'),
      button('d3Spectrum', 'Full Lyapunov Spectrum', () => handlers.analyzeSpectrum()),
      button('d3Conserved', 'Detect Conserved Quantities', () => handlers.analyzeConserved()),
      button('d3Shell', 'Energy-Shell Monitor', () => handlers.analyzeEnergyShell()),
      button('d3ExportCsv', 'Export Trajectory CSV', () => handlers.exportCsv()),
      button('d3ExportSnap', 'Export Snapshot (PNG+JSON)', () => handlers.exportSnapshot())
    ),
    chainCanvas,
    html('div', { id: 'd3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 'd3Analysis', className: 'research-summary', text: 'Analyze runs the same worker studyPoint job as the Research batch runner (Lyapunov + RQA + FTLE with uncertainties) on the current chain. Full Spectrum adds all 4N exponents with the Hamiltonian self-consistency gate; Detect Conserved Quantities runs the Noether symmetry/drift scan; Energy-Shell Monitor plots E and L drift along a fresh trajectory.' }),
    shellCanvas,
    html('div', { id: 'd3ShellInfo', className: 'research-summary', text: '' }),
    html('div', { id: 'd3Readout', className: 'research-summary', text: 'Reset to initialise. Spherical N-chain (ball joints, 2N DOF): manipulator-form equations cross-checked against an independent SymPy derivation; E and Lz are conserved when undamped.' })
  );
  return chainCard;
}
