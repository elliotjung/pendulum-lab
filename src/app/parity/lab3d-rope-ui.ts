/**
 * Rope/string pendulum card: parameter readers, simulation lifecycle, canvas
 * rendering, and readout. The hybrid taut↔slack physics lives in
 * `physics/rope.ts`; this module is presentation + control only.
 */
import { RopePendulum } from '../../physics/rope';
import { clampNumber } from './storage-sync';
import { $, append, button, html, numberFrom, setText } from './shared';
import {
  researchActions,
  researchCard,
  researchFormRow,
  researchInput,
  researchSelect
} from './research-ui-components';
import { lab3d, lab3dEnsureLoop, registerLab3dFrameHook } from './lab3d-render-loop';

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
    const sagDepth = Math.max(0, l - r) * 0.6 * scale;
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
  setText(
    'r3Readout',
    [
      `phase=${snapshot.phase.toUpperCase()} (${lab3d.ropeStyle} rendering)`,
      `tension T/m=${snapshot.tension.toFixed(3)} N/kg`,
      `θ=${snapshot.theta.toFixed(3)} rad, ω=${snapshot.omega.toFixed(3)} rad/s`,
      `E/m=${snapshot.energy.toFixed(4)} J/kg, constraint err=${snapshot.constraintError.toExponential(2)}`,
      `events: ${lab3d.rope.events.length} (${captures} captures)`,
      `method: RK4 hybrid taut/slack, substep<=2ms, capture removes radial velocity (inelastic)`
    ].join(' | ')
  );
  const warningNode = $('r3Warning');
  if (warningNode) {
    warningNode.textContent = warning ?? '';
    warningNode.style.color = warning ? '#f4a261' : '';
  }
}

/** Advance the rope simulation by one timing quantum (frame-loop hook). */
export function ropeFrameHook(elapsed: number): void {
  if (!lab3d.ropeRunning || !lab3d.rope) return;
  lab3d.rope.step(elapsed);
  const { x, y } = lab3d.rope.position();
  lab3d.ropeTrail.push({ x, y });
  if (lab3d.ropeTrail.length > 600) lab3d.ropeTrail.shift();
  renderRopeSim();
  renderRopeReadout();
}

export function buildRopeCard(): HTMLElement {
  registerLab3dFrameHook(ropeFrameHook);
  const ropeCard = researchCard('Rope / String Pendulum', 'lab3dRopeCard');
  ropeCard.classList.add('research-wide');
  const ropeCanvas = html('canvas', { id: 'r3Canvas' }) as HTMLCanvasElement;
  ropeCanvas.width = 460;
  ropeCanvas.height = 360;
  ropeCanvas.style.width = '100%';
  ropeCanvas.style.maxWidth = '480px';
  const ropeStyleSelect = researchSelect('r3Style', [
    ['rope', 'rope / string (taut + slack)'],
    ['rod', 'rigid wire / rod rendering']
  ]);
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
      button(
        'r3Run',
        'Run',
        () => {
          if (!lab3d.rope) resetRopeSim();
          lab3d.ropeRunning = true;
          lab3dEnsureLoop();
        },
        'primary'
      ),
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
    html('div', {
      id: 'r3Readout',
      className: 'research-summary',
      text: 'Reset to initialise the rope pendulum. The string goes SLACK when tension would be negative; capture at |r|=l is inelastic.'
    })
  );
  return ropeCard;
}
