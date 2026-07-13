/**
 * Double-string pendulum card: parameter/IC readers, presets, the taut-branch
 * SystemSpec bridge, simulation lifecycle, canvas rendering, and readout. The
 * hybrid tension-gated physics lives in `physics/doubleString.ts`; analyses
 * and exports live in `lab3d-diagnostics.ts` / `lab3d-exports.ts` and are
 * wired in through {@link DoubleStringCardHandlers}.
 */
import { DoubleStringPendulum } from '../../physics/doubleString';
import type { SystemSpec } from '../../physics/systemSpec';
import { clampNumber } from './storage-sync';
import { $, append, button, html, numberFrom, setText } from './shared';
import {
  researchActions,
  researchCard,
  researchFormRow,
  researchInput,
  researchSelect
} from './research-ui-components';
import { DOUBLE_STRING_PRESETS } from './lab3d-utils';
import { lab3d, lab3dEnsureLoop, registerLab3dFrameHook } from './lab3d-render-loop';

export function lab3dDoubleStringParams(): {
  m1: number;
  m2: number;
  l1: number;
  l2: number;
  g: number;
  damping: number;
} {
  return {
    m1: clampNumber(numberFrom('ds3M1', 1), 1, 0.1, 5),
    m2: clampNumber(numberFrom('ds3M2', 0.8), 0.8, 0.1, 5),
    l1: clampNumber(numberFrom('ds3L1', 1), 1, 0.2, 3),
    l2: clampNumber(numberFrom('ds3L2', 0.8), 0.8, 0.2, 3),
    g: clampNumber(numberFrom('ds3Gravity', 9.81), 9.81, 0.5, 30),
    damping: clampNumber(numberFrom('ds3Damping', 0), 0, 0, 5)
  };
}

/** Initial conditions (θ₁, θ₂, ω₁, ω₂) from the card controls. */
export function lab3dDoubleStringInitialState(): [number, number, number, number] {
  return [
    clampNumber(numberFrom('ds3Theta1', 0.7), 0.7, -3.1, 3.1),
    clampNumber(numberFrom('ds3Theta2', 0.4), 0.4, -3.1, 3.1),
    clampNumber(numberFrom('ds3Omega1', 0.2), 0.2, -20, 20),
    clampNumber(numberFrom('ds3Omega2', -0.1), -0.1, -20, 20)
  ];
}

export function resetDoubleStringSim(): void {
  const [theta1, theta2, omega1, omega2] = lab3dDoubleStringInitialState();
  lab3d.doubleString = new DoubleStringPendulum(lab3dDoubleStringParams(), theta1, theta2, omega1, omega2);
  lab3d.doubleStringTrail1 = [];
  lab3d.doubleStringTrail2 = [];
  renderDoubleStringSim();
  renderDoubleStringReadout();
}

export function applyDoubleStringPreset(key: string): void {
  const preset = DOUBLE_STRING_PRESETS[key];
  if (!preset) return;
  const set = (id: string, value: number): void => {
    const el = $(id);
    if (el instanceof HTMLInputElement) el.value = String(value);
  };
  set('ds3Theta1', preset.theta1);
  set('ds3Theta2', preset.theta2);
  set('ds3Omega1', preset.omega1);
  set('ds3Omega2', preset.omega2);
  lab3d.doubleStringRunning = false;
  resetDoubleStringSim();
}

/** Declarative spec of the current double-string setup (taut-branch analyses). */
export function doubleStringSpec(): Extract<SystemSpec, { kind: 'double-string' }> {
  const params = lab3dDoubleStringParams();
  return {
    kind: 'double-string',
    m1: params.m1,
    m2: params.m2,
    l1: params.l1,
    l2: params.l2,
    g: params.g,
    damping: params.damping
  };
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
  const cy = canvas.height * 0.3;
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
  setText(
    'ds3Readout',
    [
      `phase=${snapshot.phase.toUpperCase()}`,
      `T1=${snapshot.tension1.toFixed(3)} N, T2=${snapshot.tension2.toFixed(3)} N`,
      `theta=(${snapshot.theta1.toFixed(3)}, ${snapshot.theta2.toFixed(3)}), omega=(${snapshot.omega1.toFixed(3)}, ${snapshot.omega2.toFixed(3)})`,
      `E=${snapshot.energy.toFixed(4)} J`,
      `constraint err=(${snapshot.constraintError1.toExponential(2)}, ${snapshot.constraintError2.toExponential(2)})`,
      `events=${lab3d.doubleString.events.length} (${captures} captures)`,
      snapshot.caveat
    ].join(' | ')
  );
  const warningNode = $('ds3Warning');
  if (warningNode) {
    const warning =
      snapshot.phase === 'taut'
        ? ''
        : 'A string segment is slack; this is a hybrid finite-time event state, not a rigid rod run.';
    warningNode.textContent = warning;
    warningNode.style.color = warning ? '#f4a261' : '';
  }
}

/** Advance the double-string simulation by one quantum (frame-loop hook). */
export function doubleStringFrameHook(elapsed: number): void {
  if (!lab3d.doubleStringRunning || !lab3d.doubleString) return;
  lab3d.doubleString.step(elapsed);
  const snapshot = lab3d.doubleString.snapshot();
  lab3d.doubleStringTrail1.push({ x: snapshot.x1, y: snapshot.y1 });
  if (lab3d.doubleStringTrail1.length > 700) lab3d.doubleStringTrail1.shift();
  lab3d.doubleStringTrail2.push({ x: snapshot.x2, y: snapshot.y2 });
  if (lab3d.doubleStringTrail2.length > 1200) lab3d.doubleStringTrail2.shift();
  renderDoubleStringSim();
  renderDoubleStringReadout();
}

export interface DoubleStringCardHandlers {
  analyze(): void;
  exportCsv(): void;
  exportSnapshot(): void;
}

export function buildDoubleStringCard(handlers: DoubleStringCardHandlers): HTMLElement {
  registerLab3dFrameHook(doubleStringFrameHook);
  const doubleStringCard = researchCard('Double String Pendulum (Hybrid Tension Gate)', 'lab3dDoubleStringCard');
  doubleStringCard.classList.add('research-wide');
  const doubleStringCanvas = html('canvas', { id: 'ds3Canvas' }) as HTMLCanvasElement;
  doubleStringCanvas.width = 460;
  doubleStringCanvas.height = 360;
  doubleStringCanvas.style.width = '100%';
  doubleStringCanvas.style.maxWidth = '480px';
  const dsPreset = researchSelect(
    'ds3Preset',
    Object.entries(DOUBLE_STRING_PRESETS).map(([key, preset]) => [key, preset.label])
  );
  dsPreset.addEventListener('change', () => applyDoubleStringPreset(dsPreset.value));
  append(
    doubleStringCard,
    researchFormRow('Preset', dsPreset),
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
      button(
        'ds3Run',
        'Run',
        () => {
          if (!lab3d.doubleString) resetDoubleStringSim();
          lab3d.doubleStringRunning = true;
          lab3dEnsureLoop();
        },
        'primary'
      ),
      button('ds3Pause', 'Pause', () => {
        lab3d.doubleStringRunning = false;
      }),
      button('ds3Reset', 'Reset', () => {
        lab3d.doubleStringRunning = false;
        resetDoubleStringSim();
      })
    ),
    researchActions(
      button('ds3Analyze', 'Analyze (validity + λ/RQA/FTLE)', () => handlers.analyze(), 'primary'),
      button('ds3ExportCsv', 'Export Trajectory CSV', () => handlers.exportCsv()),
      button('ds3ExportSnap', 'Export Snapshot (PNG+JSON)', () => handlers.exportSnapshot())
    ),
    researchFormRow('Export T', researchInput('ds3ExportT', 'number', '20', 's of trajectory for CSV export')),
    doubleStringCanvas,
    html('div', {
      id: 'ds3Analysis',
      className: 'research-summary',
      text: 'Analyze first runs the hybrid taut-fraction validity probe; when the strings stay taut it runs the worker λ/RQA/FTLE job on the (then-exact) taut-branch vector field.'
    }),
    html('div', { id: 'ds3Warning', className: 'research-summary', text: '' }),
    html('div', {
      id: 'ds3Readout',
      className: 'research-summary',
      text: 'Reset to initialise. Taut motion uses the double-pendulum equations with explicit string tension gates; slack links enter hybrid free-flight/capture mode.'
    })
  );
  return doubleStringCard;
}
