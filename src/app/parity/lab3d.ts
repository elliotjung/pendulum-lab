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
  chainTrail1: [] as { x: number; y: number; z: number }[],
  chainTrail2: [] as { x: number; y: number; z: number }[],
  chainCamera: new OrbitCamera(),
  rafId: 0,
  lastFrame: 0
};

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

export function lab3dChainParams(): SphericalChainParams {
  return {
    masses: [1, clampNumber(numberFrom('d3M2', 0.8), 0.8, 0.1, 5)],
    lengths: [
      clampNumber(numberFrom('d3L1', 1), 1, 0.2, 3),
      clampNumber(numberFrom('d3L2', 0.8), 0.8, 0.2, 3)
    ],
    g: clampNumber(numberFrom('d3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('d3Damping', 0), 0, 0, 5)
  };
}

export function resetChainSim(): void {
  const theta1 = clampNumber(numberFrom('d3Theta1', 1.6), 1.6, -3.05, 3.05);
  const theta2 = clampNumber(numberFrom('d3Theta2', 2.2), 2.2, -3.05, 3.05);
  const phiDot1 = clampNumber(numberFrom('d3PhiDot1', 1.2), 1.2, -10, 10);
  const phiDot2 = clampNumber(numberFrom('d3PhiDot2', -0.8), -0.8, -10, 10);
  // State layout: [θ₁, φ₁, θ₂, φ₂, θ̇₁, φ̇₁, θ̇₂, φ̇₂].
  lab3d.chain = new SphericalChain(lab3dChainParams(), [theta1, 0, theta2, 0, 0, phiDot1, 0, phiDot2], 0.001);
  lab3d.chainTrail1 = [];
  lab3d.chainTrail2 = [];
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
    const [inner, outer] = lab3d.chain.positions();
    if (inner && outer) {
      lab3d.chainTrail1.push(inner);
      if (lab3d.chainTrail1.length > 500) lab3d.chainTrail1.shift();
      lab3d.chainTrail2.push(outer);
      if (lab3d.chainTrail2.length > 1500) lab3d.chainTrail2.shift();
    }
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
  const reach = (lab3d.chain.params.lengths[0] ?? 1) + (lab3d.chain.params.lengths[1] ?? 1);
  const scale = (Math.min(canvas.width, canvas.height) * 0.4) / reach;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Outer-reach envelope sphere (radius l₁ + l₂).
  drawSphereWireframe(ctx, lab3d.chainCamera, reach, scale);
  drawPolyline3D(ctx, lab3d.chainCamera, lab3d.chainTrail1, scale, { r: 244, g: 162, b: 97 });
  drawPolyline3D(ctx, lab3d.chainCamera, lab3d.chainTrail2, scale, { r: 76, g: 201, b: 240 });
  const [inner, outer] = lab3d.chain.positions();
  if (!inner || !outer) return;
  const pivot = lab3d.chainCamera.project({ x: 0, y: 0, z: 0 }, canvas.width, canvas.height, scale);
  const bob1 = lab3d.chainCamera.project(inner, canvas.width, canvas.height, scale);
  const bob2 = lab3d.chainCamera.project(outer, canvas.width, canvas.height, scale);
  ctx.strokeStyle = '#cdd7ee';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(pivot.screenX, pivot.screenY);
  ctx.lineTo(bob1.screenX, bob1.screenY);
  ctx.lineTo(bob2.screenX, bob2.screenY);
  ctx.stroke();
  ctx.fillStyle = '#8fa3c2';
  ctx.beginPath();
  ctx.arc(pivot.screenX, pivot.screenY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(bob1.screenX, bob1.screenY, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#4cc9f0';
  ctx.beginPath();
  ctx.arc(bob2.screenX, bob2.screenY, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#8fa3c2';
  ctx.font = '10px system-ui';
  ctx.fillText('drag to orbit, wheel to zoom', 8, canvas.height - 8);
}

export function renderChainReadout(): void {
  if (!lab3d.chain) return;
  const diag = lab3d.chain.diagnostics();
  const state = lab3d.chain.current();
  setText('d3Readout', [
    `θ₁=${(state[0] ?? 0).toFixed(3)}, φ₁=${(state[1] ?? 0).toFixed(3)}, θ₂=${(state[2] ?? 0).toFixed(3)}, φ₂=${(state[3] ?? 0).toFixed(3)}`,
    `E=${diag.energy.toFixed(5)} J (drift ${diag.energyDrift.toExponential(2)})`,
    `Lz=${diag.lz.toFixed(5)} (drift ${diag.lzDrift.toExponential(2)})`,
    `method=${diag.method}, dt=${diag.dt}`,
    diag.caveat
  ].join(' | '));
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

  const chainCard = researchCard('Spherical Double Pendulum (3D Chaos, 4 DOF)', 'lab3dChainCard');
  chainCard.classList.add('research-wide');
  const chainCanvas = html('canvas', { id: 'd3Canvas' }) as HTMLCanvasElement;
  chainCanvas.width = 460;
  chainCanvas.height = 360;
  chainCanvas.style.width = '100%';
  chainCanvas.style.maxWidth = '480px';
  chainCanvas.style.touchAction = 'none';
  bindOrbitControls(chainCanvas, lab3d.chainCamera, () => renderChainSim());
  append(
    chainCard,
    researchFormRow('θ₁₀ (rad)', researchInput('d3Theta1', 'number', '1.6', 'inner polar angle')),
    researchFormRow('φ̇₁₀', researchInput('d3PhiDot1', 'number', '1.2', 'rad/s (inner azimuthal)')),
    researchFormRow('θ₂₀ (rad)', researchInput('d3Theta2', 'number', '2.2', 'outer polar angle')),
    researchFormRow('φ̇₂₀', researchInput('d3PhiDot2', 'number', '-0.8', 'rad/s (outer azimuthal)')),
    researchFormRow('m₂ (m₁=1)', researchInput('d3M2', 'number', '0.8', 'kg')),
    researchFormRow('l₁', researchInput('d3L1', 'number', '1', 'm')),
    researchFormRow('l₂', researchInput('d3L2', 'number', '0.8', 'm')),
    researchFormRow('Gravity', researchInput('d3Gravity', 'number', '9.81', 'm/s²')),
    researchFormRow('Damping', researchInput('d3Damping', 'number', '0', '1/s')),
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
    chainCanvas,
    html('div', { id: 'd3Readout', className: 'research-summary', text: 'Reset to initialise. Full 3D double pendulum (ball joints, 4 DOF): equations derived in manipulator form and cross-checked against an independent SymPy derivation; E and Lz are conserved when undamped.' })
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
