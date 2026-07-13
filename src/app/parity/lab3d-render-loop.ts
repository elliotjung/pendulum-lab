/**
 * 3D-lab shared state and the single requestAnimationFrame loop.
 *
 * Each simulation card registers a frame hook; the loop resolves the timing
 * mode (wall-clock demo vs deterministic research quantum) once per frame and
 * fans the elapsed quantum out to every hook. The loop self-stops when no
 * simulation is running, so an idle 3D tab costs nothing.
 */
import type { RopePendulum } from '../../physics/rope';
import type { DoubleStringPendulum } from '../../physics/doubleString';
import type { SphericalPendulum } from '../../physics/spherical';
import type { SphericalChain } from '../../physics/sphericalChain';
import { OrbitCamera } from '../../viz/orbit3d';
import { clampNumber } from './storage-sync';
import { append, html } from './shared';
import { researchCard, researchFormRow, researchInput, researchSelect } from './research-ui-components';
import {
  normalizeLab3dResearchStep,
  normalizeLab3dTimingMode,
  resolveLab3dStepTiming,
  type Lab3dTimingMode
} from './lab3d-timing';

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
  /** Previous frame's (θ, φ, θ̇) for interpolated section crossings. */
  spherePrev: null as [number, number, number] | null,
  camera: new OrbitCamera(),
  chain: null as SphericalChain | null,
  chainRunning: false,
  /** One trail per bob (the chain supports N links, not just two). */
  chainTrails: [] as Array<Array<{ x: number; y: number; z: number }>>,
  chainCamera: new OrbitCamera(),
  timingMode: 'demo' as Lab3dTimingMode,
  researchStep: 1 / 60,
  rafId: 0,
  lastFrame: 0
};

export type Lab3dFrameHook = (elapsed: number) => void;

const frameHooks: Lab3dFrameHook[] = [];

/** Register a per-frame simulation advance; hooks run in registration order. */
export function registerLab3dFrameHook(hook: Lab3dFrameHook): void {
  frameHooks.push(hook);
}

export function lab3dAnyRunning(): boolean {
  return lab3d.ropeRunning || lab3d.doubleStringRunning || lab3d.sphereRunning || lab3d.chainRunning;
}

export function lab3dFrame(timestamp: number): void {
  const timing = resolveLab3dStepTiming({
    timestamp,
    lastFrame: lab3d.lastFrame,
    mode: lab3d.timingMode,
    researchStep: lab3d.researchStep,
    clampNumber
  });
  lab3d.lastFrame = timing.nextLastFrame;
  for (const hook of frameHooks) hook(timing.elapsed);
  if (lab3dAnyRunning()) {
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  } else {
    lab3d.rafId = 0;
    lab3d.lastFrame = 0;
  }
}

export function lab3dEnsureLoop(): void {
  if (lab3d.rafId === 0 && lab3dAnyRunning()) {
    lab3d.lastFrame = 0;
    lab3d.rafId = window.requestAnimationFrame(lab3dFrame);
  }
}

/** Demo (wall-clock) vs research (deterministic fixed quantum) timing card. */
export function buildLab3dTimingCard(): HTMLElement {
  const timingCard = researchCard('3D Lab Run Timing', 'lab3dTimingCard');
  timingCard.classList.add('research-wide');
  const timingModeSelect = researchSelect('lab3dTimingMode', [
    ['demo', 'Demo mode: wall-clock realtime'],
    ['research', 'Research mode: deterministic fixed quantum']
  ]);
  const timingStepInput = researchInput(
    'lab3dResearchStep',
    'number',
    '0.0166667',
    's per rendered frame in research mode'
  );
  const timingReadout = html('div', { id: 'lab3dTimingReadout', className: 'research-summary', text: '' });
  const syncTiming = (): void => {
    lab3d.timingMode = normalizeLab3dTimingMode(timingModeSelect.value);
    lab3d.researchStep = normalizeLab3dResearchStep(Number(timingStepInput.value), clampNumber);
    lab3d.lastFrame = 0;
    timingReadout.textContent =
      lab3d.timingMode === 'research'
        ? `Research mode active: every render tick advances exactly ${lab3d.researchStep.toFixed(6)} s, independent of browser frame pacing.`
        : 'Demo mode active: simulations follow wall-clock time with a 50 ms catch-up clamp.';
  };
  timingModeSelect.addEventListener('change', syncTiming);
  timingStepInput.addEventListener('change', syncTiming);
  timingStepInput.addEventListener('input', syncTiming);
  append(
    timingCard,
    researchFormRow('Run mode', timingModeSelect),
    researchFormRow('Research quantum', timingStepInput),
    timingReadout
  );
  syncTiming();
  return timingCard;
}
