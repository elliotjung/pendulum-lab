/**
 * 3D lab: rope / double-string / spherical / spherical-chain simulations and tab UI.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { IntegratorId, PendulumParameters, RunMode, RuntimeSnapshot, SystemType } from '../../types/domain';
import { commandRegistry } from '../../runtime/CommandRegistry';
import { StateStore, stateStore } from '../../state/StateStore';
import { createSubmissionManifest, downloadBytes, downloadJson } from '../../export/manifest';
import { runAllValidationChecks, type ValidationCaseResult } from '../../validation/validationSuite';
import { integratorRegistry } from '../../physics/integrators';
import { canonicalStepThetaOmega } from '../../physics/canonical';
import { energyDouble } from '../../physics/energy';
import { energyChain, rhsChain } from '../../physics/nPendulum';
import { drivenPeriodicOrbit } from '../../chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../chaos/continuation';
import { chaosWorkerTransportFactory, JobCancelledError, JobClient } from '../../runtime/JobClient';
import { ChaosClient } from '../../runtime/ChaosClient';
import type { StudyPointResponse } from '../../workers/chaosProtocol';
import { buildRhs, type SystemSpec } from '../../physics/systemSpec';
import { classifyFixedPoint } from '../../chaos/fixedPointClassify';
import { detectBifurcations } from '../../chaos/bifurcationDetect';
import { detectNeimarkSacker } from '../../chaos/neimarkSacker';
import { recurrenceNetworkMetrics } from '../../chaos/recurrenceNetwork';
import { extractFtleRidges } from '../../chaos/ftleRidge';
import { shadowingHorizon } from '../../chaos/shadowing';
import { melnikovVerdict } from '../../chaos/melnikov';
import { csvCell, dataUrlByteEstimate, hashText } from '../../research/researchExportUtils';
import { generateStudyValues, type ParameterStudyStrategy } from '../../research/researchSampling';
import { buildZip, checksumEntries, dataUrlToBytes, textToBytes, type ZipEntryInput } from '../../research/zipBundle';
import { collectEnvironment, ProvenanceBuilder, type ProvenanceGraph } from '../../research/provenance';
import { migrateFromLocalStorageV2, ResearchDb, validateResearchDbArchive, type ResearchDbArchive } from '../../research/researchDb';
import { buildNotebookV2 } from '../../research/notebookBuilder';
import {
  figureFingerprint,
  figureSourceCsv,
  renderStudyFigureSvg,
  scaleCanvasToPngDataUrl,
  studyFigureFromSavedStudy,
  type FigureTheme
} from '../../research/figurePipeline';
import {
  diffObjects,
  filterExperiments,
  forkExperimentData,
  qualityBadges,
  timelineGroups,
  validateDoi,
  type QualityBadge
} from '../../research/libraryUx';
import { evaluatePerformanceBudget } from '../../render/progressive';
import { RopePendulum } from '../../physics/rope';
import { DoubleStringPendulum } from '../../physics/doubleString';
import { SphericalPendulum } from '../../physics/spherical';
import { SphericalChain, type SphericalChainParams } from '../../physics/sphericalChain';
import { bindOrbitControls, drawPolyline3D, drawSphereWireframe, OrbitCamera } from '../../viz/orbit3d';
import { ensembleGrid, runDoublePendulumEnsemble } from '../../runtime/gpuEnsemble';
import {
  adaptiveRefinement,
  boundaryRefinement,
  budgetAllows,
  generateDesign,
  uncertaintyResampling,
  type DesignBudget,
  type DesignPoint,
  type EvaluatedPoint,
  type MultiStrategy,
  type StudyVariable
} from '../../research/experimentDesign';
import { createRailTabButton, EXTRA_RAIL_TABS } from '../railNavigation';
import { clampNumber } from './storage-sync';
import { append, button, html, numberFrom, setText, toast } from './shared';
import { logResearchRun, researchActions, researchCard, researchFormRow, researchInput, researchSelect } from './research-workbench';
import { $ } from './shared';


export const lab3d = {
  rope: null as RopePendulum | null,
  ropeRunning: false,
  ropeStyle: 'rope' as 'rope' | 'rod',
  ropeTrail: [] as { x: number; y: number }[],
  doubleString: null as DoubleStringPendulum | null,
  doubleStringRunning: false,
  doubleStringTrail1: [] as { x: number; y: number }[],
  doubleStringTrail2: [] as { x: number; y: number }[],
  sphere: null as SphericalPendulum | null,
  sphereRunning: false,
  sphereStyle: 'rod' as 'rope' | 'rod',
  sphereTrail: [] as { x: number; y: number; z: number }[],
  spherePoincare: [] as { phi: number; theta: number }[],
  lastThetaDotSign: 0,
  camera: new OrbitCamera(),
  chain: null as SphericalChain | null,
  chainRunning: false,
  /** One trail per bob (the chain supports N links, not just two). */
  chainTrails: [] as Array<Array<{ x: number; y: number; z: number }>>,
  chainCamera: new OrbitCamera(),
  rafId: 0,
  lastFrame: 0
};

/** Per-bob display colours for the N-chain (cycled when N exceeds the palette). */
const CHAIN_COLORS: Array<{ r: number; g: number; b: number; css: string }> = [
  { r: 244, g: 162, b: 97, css: '#f4a261' },
  { r: 76, g: 201, b: 240, css: '#4cc9f0' },
  { r: 56, g: 232, b: 140, css: '#38e88c' },
  { r: 240, g: 196, b: 25, css: '#f0c419' },
  { r: 230, g: 57, b: 70, css: '#e63946' }
];

export function lab3dRopeParams(): { l: number; g: number; damping: number } {
  return {
    l: clampNumber(numberFrom('r3Length', 1), 1, 0.2, 3),
    g: clampNumber(numberFrom('r3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('r3Damping', 0), 0, 0, 5)
  };
}

export function resetRopeSim(): void {
  const theta0 = clampNumber(numberFrom('r3Theta0', 2.5), 2.5, -3.1, 3.1);
  const omega0 = clampNumber(numberFrom('r3Omega0', 0), 0, -20, 20);
  lab3d.rope = new RopePendulum(lab3dRopeParams(), theta0, omega0);
  lab3d.ropeTrail = [];
  renderRopeSim();
  renderRopeReadout();
}

export function lab3dDoubleStringParams(): { m1: number; m2: number; l1: number; l2: number; g: number; damping: number } {
  return {
    m1: clampNumber(numberFrom('ds3M1', 1), 1, 0.1, 5),
    m2: clampNumber(numberFrom('ds3M2', 0.8), 0.8, 0.1, 5),
    l1: clampNumber(numberFrom('ds3L1', 1), 1, 0.2, 3),
    l2: clampNumber(numberFrom('ds3L2', 0.8), 0.8, 0.2, 3),
    g: clampNumber(numberFrom('ds3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('ds3Damping', 0), 0, 0, 5)
  };
}

export function resetDoubleStringSim(): void {
  const theta1 = clampNumber(numberFrom('ds3Theta1', 0.7), 0.7, -3.1, 3.1);
  const theta2 = clampNumber(numberFrom('ds3Theta2', 0.4), 0.4, -3.1, 3.1);
  const omega1 = clampNumber(numberFrom('ds3Omega1', 0.2), 0.2, -20, 20);
  const omega2 = clampNumber(numberFrom('ds3Omega2', -0.1), -0.1, -20, 20);
  lab3d.doubleString = new DoubleStringPendulum(lab3dDoubleStringParams(), theta1, theta2, omega1, omega2);
  lab3d.doubleStringTrail1 = [];
  lab3d.doubleStringTrail2 = [];
  renderDoubleStringSim();
  renderDoubleStringReadout();
}

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
  lab3d.lastThetaDotSign = Math.sign(thetaDot0) || 1;
  renderSphereSim();
  renderSphereReadout();
}

/** Parse a comma-separated number list, padded/clamped to exactly `n` entries. */
function numberList(id: string, n: number, fallback: number, min: number, max: number): number[] {
  const el = $(id);
  const raw = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  const parsed = raw
    .split(/[,\s]+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(clampNumber(parsed[i], parsed[i - 1] ?? fallback, min, max));
  return out;
}

export function lab3dChainN(): number {
  return Math.round(clampNumber(numberFrom('d3N', 2), 2, 1, 5));
}

export function lab3dChainMethod(): IntegratorId {
  const raw = $('d3Method');
  const value = raw instanceof HTMLSelectElement ? raw.value : 'rk4';
  return (['rk4', 'dopri5', 'gbs', 'gauss2', 'yoshida4'].includes(value) ? value : 'rk4') as IntegratorId;
}

export function lab3dChainParams(): SphericalChainParams {
  const n = lab3dChainN();
  return {
    masses: numberList('d3Masses', n, 1, 0.1, 5),
    lengths: numberList('d3Lengths', n, 0.8, 0.2, 3),
    g: clampNumber(numberFrom('d3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('d3Damping', 0), 0, 0, 5)
  };
}

/** Full initial state [θ_k, φ_k …, θ̇_k, φ̇_k …] from the per-link IC lists. */
export function lab3dChainInitialState(): number[] {
  const n = lab3dChainN();
  const thetas = numberList('d3Thetas', n, 1.6, -3.05, 3.05);
  const phis = numberList('d3Phis', n, 0, -Math.PI, Math.PI);
  const thetaDots = numberList('d3ThetaDots', n, 0, -10, 10);
  const phiDots = numberList('d3PhiDots', n, 0, -10, 10);
  const state: number[] = [];
  for (let k = 0; k < n; k += 1) state.push(thetas[k]!, phis[k]!);
  for (let k = 0; k < n; k += 1) state.push(thetaDots[k]!, phiDots[k]!);
  return state;
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

export function lab3dFrame(timestamp: number): void {
  const dtWall = lab3d.lastFrame > 0 ? Math.min(0.05, (timestamp - lab3d.lastFrame) / 1000) : 0.016;
  lab3d.lastFrame = timestamp;
  if (lab3d.ropeRunning && lab3d.rope) {
    lab3d.rope.step(dtWall);
    const { x, y } = lab3d.rope.position();
    lab3d.ropeTrail.push({ x, y });
    if (lab3d.ropeTrail.length > 600) lab3d.ropeTrail.shift();
    renderRopeSim();
    renderRopeReadout();
  }
  if (lab3d.doubleStringRunning && lab3d.doubleString) {
    lab3d.doubleString.step(dtWall);
    const snapshot = lab3d.doubleString.snapshot();
    lab3d.doubleStringTrail1.push({ x: snapshot.x1, y: snapshot.y1 });
    if (lab3d.doubleStringTrail1.length > 700) lab3d.doubleStringTrail1.shift();
    lab3d.doubleStringTrail2.push({ x: snapshot.x2, y: snapshot.y2 });
    if (lab3d.doubleStringTrail2.length > 1200) lab3d.doubleStringTrail2.shift();
    renderDoubleStringSim();
    renderDoubleStringReadout();
  }
  if (lab3d.sphereRunning && lab3d.sphere) {
    lab3d.sphere.step(dtWall);
    const position = lab3d.sphere.position();
    lab3d.sphereTrail.push(position);
    if (lab3d.sphereTrail.length > 1200) lab3d.sphereTrail.shift();
    // Poincaré section at θ̇ = 0 (turning points of the polar angle).
    const [theta, phi, thetaDot] = lab3d.sphere.current();
    const sign = Math.sign(thetaDot) || lab3d.lastThetaDotSign;
    if (sign !== lab3d.lastThetaDotSign && lab3d.lastThetaDotSign !== 0) {
      lab3d.spherePoincare.push({ phi: ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), theta });
      if (lab3d.spherePoincare.length > 800) lab3d.spherePoincare.shift();
    }
    lab3d.lastThetaDotSign = sign;
    renderSphereSim();
    renderSphereReadout();
  }
  if (lab3d.chainRunning && lab3d.chain) {
    lab3d.chain.step(dtWall);
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
  if (lab3d.ropeRunning || lab3d.doubleStringRunning || lab3d.sphereRunning || lab3d.chainRunning) {
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  } else {
    lab3d.rafId = 0;
    lab3d.lastFrame = 0;
  }
}

export function lab3dEnsureLoop(): void {
  if (lab3d.rafId === 0 && (lab3d.ropeRunning || lab3d.doubleStringRunning || lab3d.sphereRunning || lab3d.chainRunning)) {
    lab3d.lastFrame = 0;
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  }
}

export function renderRopeSim(): void {
  const canvas = $('r3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.rope) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { l } = lab3d.rope.params;
  const scale = (Math.min(canvas.width, canvas.height) * 0.42) / l;
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.32;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Constraint circle.
  ctx.strokeStyle = 'rgba(110,130,170,0.3)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, l * scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  // Trail.
  ctx.strokeStyle = 'rgba(76,201,240,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  lab3d.ropeTrail.forEach((point, index) => {
    const px = cx + point.x * scale;
    const py = cy - point.y * scale;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  const snapshot = lab3d.rope.snapshot();
  const bx = cx + snapshot.x * scale;
  const by = cy - snapshot.y * scale;
  // String/rod: rod is a straight line always; rope is straight when taut and
  // slack-curved (sagging quadratic) when the constraint is inactive.
  ctx.lineWidth = lab3d.ropeStyle === 'rod' ? 3 : 1.6;
  ctx.strokeStyle = snapshot.phase === 'slack' ? '#f4a261' : '#cdd7ee';
  ctx.beginPath();
  if (snapshot.phase === 'slack' && lab3d.ropeStyle === 'rope') {
    const r = Math.hypot(snapshot.x, snapshot.y);
    const sagDepth = Math.max(0, (l - r)) * 0.6 * scale;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo((cx + bx) / 2, Math.max(cy, by) + sagDepth, bx, by);
  } else {
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  // Pivot + bob.
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = snapshot.phase === 'slack' ? '#f4a261' : '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bx, by, 9, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderRopeReadout(): void {
  if (!lab3d.rope) return;
  const snapshot = lab3d.rope.snapshot();
  const warning = lab3d.rope.warning();
  const captures = lab3d.rope.events.filter((event) => event.type === 'capture').length;
  setText('r3Readout', [
    `phase=${snapshot.phase.toUpperCase()} (${lab3d.ropeStyle} rendering)`,
    `tension T/m=${snapshot.tension.toFixed(3)} N/kg`,
    `θ=${snapshot.theta.toFixed(3)} rad, ω=${snapshot.omega.toFixed(3)} rad/s`,
    `E/m=${snapshot.energy.toFixed(4)} J/kg, constraint err=${snapshot.constraintError.toExponential(2)}`,
    `events: ${lab3d.rope.events.length} (${captures} captures)`,
    `method: RK4 hybrid taut/slack, substep<=2ms, capture removes radial velocity (inelastic)`
  ].join(' | '));
  const warningNode = $('r3Warning');
  if (warningNode) {
    warningNode.textContent = warning ?? '';
    warningNode.style.color = warning ? '#f4a261' : '';
  }
}

export function renderDoubleStringSim(): void {
  const canvas = $('ds3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.doubleString) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const snapshot = lab3d.doubleString.snapshot();
  const reach = lab3d.doubleString.params.l1 + lab3d.doubleString.params.l2;
  const scale = (Math.min(canvas.width, canvas.height) * 0.42) / reach;
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.30;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(110,130,170,0.28)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, lab3d.doubleString.params.l1 * scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, reach * scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);

  const drawTrail = (trail: Array<{ x: number; y: number }>, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    trail.forEach((point, index) => {
      const px = cx + point.x * scale;
      const py = cy - point.y * scale;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  drawTrail(lab3d.doubleStringTrail1, 'rgba(244,162,97,0.38)');
  drawTrail(lab3d.doubleStringTrail2, 'rgba(76,201,240,0.48)');

  const x1 = cx + snapshot.x1 * scale;
  const y1 = cy - snapshot.y1 * scale;
  const x2 = cx + snapshot.x2 * scale;
  const y2 = cy - snapshot.y2 * scale;
  ctx.lineWidth = 2;
  ctx.strokeStyle = snapshot.phase === 'full-slack' ? '#e63946' : '#cdd7ee';
  if (snapshot.phase === 'full-slack') ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = snapshot.phase === 'outer-slack' ? '#f4a261' : '#cdd7ee';
  if (snapshot.phase === 'outer-slack') ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(x1, y1, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = snapshot.phase === 'outer-slack' || snapshot.phase === 'full-slack' ? '#e9c46a' : '#4cc9f0';
  ctx.beginPath();
  ctx.arc(x2, y2, 8, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderDoubleStringReadout(): void {
  if (!lab3d.doubleString) return;
  const snapshot = lab3d.doubleString.snapshot();
  const captures = lab3d.doubleString.events.filter((event) => event.type === 'capture').length;
  setText('ds3Readout', [
    `phase=${snapshot.phase.toUpperCase()}`,
    `T1=${snapshot.tension1.toFixed(3)} N, T2=${snapshot.tension2.toFixed(3)} N`,
    `theta=(${snapshot.theta1.toFixed(3)}, ${snapshot.theta2.toFixed(3)}), omega=(${snapshot.omega1.toFixed(3)}, ${snapshot.omega2.toFixed(3)})`,
    `E=${snapshot.energy.toFixed(4)} J`,
    `constraint err=(${snapshot.constraintError1.toExponential(2)}, ${snapshot.constraintError2.toExponential(2)})`,
    `events=${lab3d.doubleString.events.length} (${captures} captures)`,
    snapshot.caveat
  ].join(' | '));
  const warningNode = $('ds3Warning');
  if (warningNode) {
    const warning = snapshot.phase === 'taut' ? '' : 'A string segment is slack; this is a hybrid finite-time event state, not a rigid rod run.';
    warningNode.textContent = warning;
    warningNode.style.color = warning ? '#f4a261' : '';
  }
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
  projected
    .map((bob, index) => ({ bob, index }))
    .sort((a, b) => a.bob.depth - b.bob.depth)
    .forEach(({ bob, index }) => {
      ctx.fillStyle = CHAIN_COLORS[index % CHAIN_COLORS.length]!.css;
      ctx.beginPath();
      ctx.arc(bob.screenX, bob.screenY, index === projected.length - 1 ? 8 : 7, 0, 2 * Math.PI);
      ctx.fill();
    });
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
  setText('d3Readout', [
    `N=${n} | ${angles}`,
    `E=${diag.energy.toFixed(5)} J (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
}

/** Declarative spec of the current chain — the bridge into the research stack. */
export function chainSpec(): Extract<SystemSpec, { kind: 'spherical-chain' }> {
  const params = lab3dChainParams();
  return {
    kind: 'spherical-chain',
    masses: [...params.masses],
    lengths: [...params.lengths],
    g: params.g,
    damping: params.damping
  };
}

let chainAnalysisClient: ChaosClient | null = null;

/**
 * Run the full research diagnostics (λ_max + block std error, RQA determinism /
 * divergence, FTLE) for the current chain configuration on the chaos worker —
 * the same `studyPoint` job the Research tab's batch runner uses.
 */
export async function analyzeChainDiagnostics(): Promise<void> {
  const spec = chainSpec();
  const state0 = lab3d.chain ? Array.from(lab3d.chain.current()) : lab3dChainInitialState();
  if (!chainAnalysisClient) chainAnalysisClient = new ChaosClient();
  setText('d3Analysis', `Computing λ/RQA/FTLE for the N=${spec.masses.length} spherical chain ${chainAnalysisClient.usesWorker() ? '(worker)' : '(main thread)'}…`);
  try {
    // The 3D chain needs a finer step than the planar default: dt 0.01 RK4 is
    // unstable over the RQA sampling horizon for energetic chain states.
    const result = await chainAnalysisClient.studyPoint(spec, state0, {
      lyapunov: { steps: 6000, dt: 0.002 },
      rqa: { samples: 240, dt: 0.002 },
      ftleHorizon: 3,
      ftleDt: 0.002
    });
    if (!result.ok) throw new Error('analysis failed');
    const verdict = result.lambdaMax > 0.05 ? 'chaotic (finite-time estimate)' : 'regular/weakly chaotic (finite-time estimate)';
    setText('d3Analysis', [
      `λ_max=${result.lambdaMax.toFixed(4)} ± ${result.lambdaBlockStdError.toFixed(4)} /s`,
      `RQA DET=${result.rqaDeterminism.toFixed(3)}, DIV=${result.rqaDivergence.toFixed(4)}`,
      `FTLE(T=${result.ftleHorizon}s)=${result.ftle.toFixed(3)}`,
      verdict,
      'method: studyPoint worker job (dt=0.002, RK4 fiducial; same pipeline as the Research batch runner)'
    ].join(' | '));
    logResearchRun('probe', `3D chain diagnostics (N=${spec.masses.length})`, `λ=${result.lambdaMax.toFixed(4)}±${result.lambdaBlockStdError.toFixed(4)}, DET=${result.rqaDeterminism.toFixed(3)}, FTLE=${result.ftle.toFixed(3)}`);
  } catch (error) {
    setText('d3Analysis', `Chain analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Record a finite trajectory of the current chain and download it as CSV. */
export function exportChainTrajectoryCsv(): void {
  const params = lab3dChainParams();
  const n = params.masses.length;
  const dt = clampNumber(numberFrom('d3Dt', 0.001), 0.001, 0.0001, 0.01);
  const horizon = clampNumber(numberFrom('d3ExportT', 20), 20, 1, 120);
  const sampleEvery = Math.max(1, Math.round(0.01 / dt));
  const sim = new SphericalChain(params, lab3d.chain ? lab3d.chain.current() : lab3dChainInitialState(), {
    dt,
    method: lab3dChainMethod()
  });
  const header = ['time', ...Array.from({ length: n }, (_, k) => [`theta${k + 1}`, `phi${k + 1}`, `thetaDot${k + 1}`, `phiDot${k + 1}`]).flat(), 'energy', 'lz'];
  const rows: string[] = [header.join(',')];
  const steps = Math.round(horizon / (dt * sampleEvery));
  for (let i = 0; i < steps; i += 1) {
    sim.step(dt * sampleEvery);
    const state = sim.current();
    const diag = sim.diagnostics();
    const cols: number[] = [diag.time];
    for (let k = 0; k < n; k += 1) {
      cols.push(state[2 * k] ?? 0, state[2 * k + 1] ?? 0, state[2 * n + 2 * k] ?? 0, state[2 * n + 2 * k + 1] ?? 0);
    }
    cols.push(diag.energy, diag.lz);
    rows.push(cols.map((value) => value.toPrecision(10)).join(','));
  }
  const csv = rows.join('\n');
  downloadBytes(`pendulum_spherical_chain_n${n}_trajectory.csv`, textToBytes(csv), 'text/csv');
  logResearchRun('export', `3D chain trajectory CSV (N=${n})`, `${steps} samples over ${horizon}s, dt=${dt}, method=${lab3dChainMethod()}`, `pendulum_spherical_chain_n${n}_trajectory.csv`);
  toast('Chain trajectory CSV exported');
}

/** Paper-ready chain snapshot: scene PNG + diagnostics JSON with repro hash. */
export function exportChainSnapshot(): void {
  const canvas = $('d3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.chain) {
    toast('Run the spherical chain first');
    return;
  }
  downloadBytes('pendulum_spherical_chain_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const diag = lab3d.chain.diagnostics();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: `spherical-chain-n${lab3d.chain.params.masses.length}`,
    spec: chainSpec(),
    state: Array.from(lab3d.chain.current()),
    diagnostics: diag,
    camera: lab3d.chainCamera.state(),
    reproducibilityHash: hashText(JSON.stringify({ spec: chainSpec(), state: Array.from(lab3d.chain.current()), dt: diag.dt, method: diag.method }))
  };
  downloadJson('pendulum_spherical_chain_diagnostics.json', payload);
  logResearchRun('export', `3D chain snapshot (N=${lab3d.chain.params.masses.length})`, `E drift ${diag.energyDrift.toExponential(2)}, Lz drift ${diag.lzDrift.toExponential(2)}, method=${diag.method}`, 'pendulum_spherical_chain_snapshot.png');
  toast('Chain snapshot exported (PNG + JSON)');
}

/** Export a paper-ready 3D diagnostic snapshot: PNG of the scene + JSON diagnostics. */
export function exportSphereSnapshot(): void {
  const canvas = $('s3Canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !lab3d.sphere) {
    toast('Run the spherical pendulum first');
    return;
  }
  downloadBytes('pendulum_3d_snapshot.png', dataUrlToBytes(canvas.toDataURL('image/png')), 'image/png');
  const diag = lab3d.sphere.diagnostics();
  const payload = {
    schemaVersion: 'pendulum-3d-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    system: 'spherical-pendulum',
    params: lab3d.sphere.params,
    state: lab3d.sphere.current(),
    diagnostics: diag,
    camera: lab3d.camera.state(),
    poincarePoints: lab3d.spherePoincare.length,
    reproducibilityHash: hashText(JSON.stringify({ params: lab3d.sphere.params, state: lab3d.sphere.current(), dt: diag.dt }))
  };
  downloadJson('pendulum_3d_diagnostics.json', payload);
  logResearchRun('export', '3D diagnostic snapshot', `spherical pendulum, E drift ${diag.energyDrift.toExponential(2)}, Lz drift ${diag.lzDrift.toExponential(2)}`, 'pendulum_3d_snapshot.png');
  toast('3D snapshot exported (PNG + JSON)');
}

export function installLab3dTab(): void {
  const panel = $('tab-lab3d');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1180px';
  const wrap = html('div', { className: 'research-workbench' });

  const ropeCard = researchCard('Rope / String Pendulum', 'lab3dRopeCard');
  ropeCard.classList.add('research-wide');
  const ropeCanvas = html('canvas', { id: 'r3Canvas' }) as HTMLCanvasElement;
  ropeCanvas.width = 460;
  ropeCanvas.height = 360;
  ropeCanvas.style.width = '100%';
  ropeCanvas.style.maxWidth = '480px';
  const ropeStyleSelect = researchSelect('r3Style', [['rope', 'rope / string (taut + slack)'], ['rod', 'rigid wire / rod rendering']]);
  ropeStyleSelect.addEventListener('change', () => {
    lab3d.ropeStyle = ropeStyleSelect.value === 'rod' ? 'rod' : 'rope';
    renderRopeSim();
    renderRopeReadout();
  });
  append(
    ropeCard,
    researchFormRow('Suspension', ropeStyleSelect),
    researchFormRow('θ₀ (rad)', researchInput('r3Theta0', 'number', '2.5', '')),
    researchFormRow('ω₀ (rad/s)', researchInput('r3Omega0', 'number', '0', '')),
    researchFormRow('Length', researchInput('r3Length', 'number', '1', 'm')),
    researchFormRow('Gravity', researchInput('r3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('r3Damping', 'number', '0', '1/s')),
    researchActions(
      button('r3Run', 'Run', () => {
        if (!lab3d.rope) resetRopeSim();
        lab3d.ropeRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('r3Pause', 'Pause', () => {
        lab3d.ropeRunning = false;
      }),
      button('r3Reset', 'Reset', () => {
        lab3d.ropeRunning = false;
        resetRopeSim();
      })
    ),
    ropeCanvas,
    html('div', { id: 'r3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 'r3Readout', className: 'research-summary', text: 'Reset to initialise the rope pendulum. The string goes SLACK when tension would be negative; capture at |r|=l is inelastic.' })
  );

  const doubleStringCard = researchCard('Double String Pendulum (Hybrid Tension Gate)', 'lab3dDoubleStringCard');
  doubleStringCard.classList.add('research-wide');
  const doubleStringCanvas = html('canvas', { id: 'ds3Canvas' }) as HTMLCanvasElement;
  doubleStringCanvas.width = 460;
  doubleStringCanvas.height = 360;
  doubleStringCanvas.style.width = '100%';
  doubleStringCanvas.style.maxWidth = '480px';
  append(
    doubleStringCard,
    researchFormRow('theta1_0', researchInput('ds3Theta1', 'number', '0.7', 'rad')),
    researchFormRow('theta2_0', researchInput('ds3Theta2', 'number', '0.4', 'rad')),
    researchFormRow('omega1_0', researchInput('ds3Omega1', 'number', '0.2', 'rad/s')),
    researchFormRow('omega2_0', researchInput('ds3Omega2', 'number', '-0.1', 'rad/s')),
    researchFormRow('m1', researchInput('ds3M1', 'number', '1', 'kg')),
    researchFormRow('m2', researchInput('ds3M2', 'number', '0.8', 'kg')),
    researchFormRow('l1', researchInput('ds3L1', 'number', '1', 'm')),
    researchFormRow('l2', researchInput('ds3L2', 'number', '0.8', 'm')),
    researchFormRow('Gravity', researchInput('ds3Gravity', 'number', '9.81', 'm/s^2')),
    researchFormRow('Damping', researchInput('ds3Damping', 'number', '0', '1/s')),
    researchActions(
      button('ds3Run', 'Run', () => {
        if (!lab3d.doubleString) resetDoubleStringSim();
        lab3d.doubleStringRunning = true;
        lab3dEnsureLoop();
      }, 'primary'),
      button('ds3Pause', 'Pause', () => {
        lab3d.doubleStringRunning = false;
      }),
      button('ds3Reset', 'Reset', () => {
        lab3d.doubleStringRunning = false;
        resetDoubleStringSim();
      })
    ),
    doubleStringCanvas,
    html('div', { id: 'ds3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 'ds3Readout', className: 'research-summary', text: 'Reset to initialise. Taut motion uses the double-pendulum equations with explicit string tension gates; slack links enter hybrid free-flight/capture mode.' })
  );

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
      button('s3Export', 'Export 3D Snapshot', () => exportSphereSnapshot())
    ),
    sphereCanvas,
    poincareCanvas,
    html('div', { id: 's3Warning', className: 'research-summary', text: '' }),
    html('div', { id: 's3Readout', className: 'research-summary', text: 'Reset to initialise. The spherical pendulum integrates θ̈ = sinθcosθ·φ̇² − (g/l)sinθ and conserves E and Lz when undamped — real 3D dynamics, not a camera trick.' })
  );

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
      button('d3Analyze', 'Analyze λ/RQA/FTLE', () => {
        void analyzeChainDiagnostics();
      }, 'primary'),
      button('d3ExportCsv', 'Export Trajectory CSV', () => exportChainTrajectoryCsv()),
      button('d3ExportSnap', 'Export Snapshot (PNG+JSON)', () => exportChainSnapshot())
    ),
    chainCanvas,
    html('div', { id: 'd3Analysis', className: 'research-summary', text: 'Analyze runs the same worker studyPoint job as the Research batch runner (Lyapunov + RQA + FTLE with uncertainties) on the current chain.' }),
    html('div', { id: 'd3Readout', className: 'research-summary', text: 'Reset to initialise. Spherical N-chain (ball joints, 2N DOF): manipulator-form equations cross-checked against an independent SymPy derivation; E and Lz are conserved when undamped.' })
  );

  append(wrap, ropeCard, doubleStringCard, sphereCard, chainCard);
  left.append(wrap);
  append(layout, left);
  panel.append(layout);
  resetRopeSim();
  resetDoubleStringSim();
  resetSphereSim();
  resetChainSim();
}
