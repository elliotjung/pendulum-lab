import type { IntegratorId, SystemType } from '../types/domain';
import type { Point2D } from '../viz/poincare';
import type { LabConfig } from './LabSimulation';
import { pageDom as dom } from './DomBinder';

interface Size2D {
  width: number;
  height: number;
}

interface DragBindings {
  rendererSize(): Size2D | null;
  bobPixels(): Point2D[];
  pivot(): Point2D | null;
  stateAngles(): number[];
  setAngles(angles: number[]): void;
}

export interface LabControlBindings {
  reset(): void;
  applyQualityMode(): void;
  trimEnsembleToQuality(): void;
  clearTrail(): void;
  clearPoincare(): void;
  toggleRunning(): void;
  exportTrajectory(): void;
  exportPoincare(): void;
  exportJson(): void;
  exportPng(): void;
  scrubLength(): number;
  setScrubIndex(index: number): void;
  scrubLabel(index: number): string;
  rewindScrub(): void;
  setAudioEnabled(enabled: boolean): void;
  setAudioVolume(volume: number): void;
  drag: DragBindings;
}

const REBUILD_CONTROL_IDS = [
  'sysType',
  'method',
  'dt',
  'gamma',
  'g',
  'm1',
  'm2',
  'm3',
  'l1',
  'l2',
  'l3',
  'spf',
  'tol',
  'phaseAxis',
  'ensN',
  'ensEps',
  'th1',
  'th2',
  'th3',
  'iw1',
  'iw2',
  'iw3',
  'seed'
] as const;

export function readLabConfig(): LabConfig {
  const system: SystemType = dom.str('sysType', 'double') === 'triple' ? 'triple' : 'double';
  const parameters = {
    m1: dom.num('m1', 1),
    m2: dom.num('m2', 1),
    m3: dom.num('m3', 1),
    l1: dom.num('l1', 1.2),
    l2: dom.num('l2', 1.0),
    l3: dom.num('l3', 0.8),
    g: dom.num('g', 9.81)
  };
  const initialState =
    system === 'triple'
      ? [
          dom.num('th1', 2),
          dom.num('th2', 2.5),
          dom.num('th3', 1),
          dom.num('iw1', 0),
          dom.num('iw2', 0),
          dom.num('iw3', 0)
        ]
      : [dom.num('th1', 2), dom.num('th2', 2.5), dom.num('iw1', 0), dom.num('iw2', 0)];
  return {
    system,
    parameters,
    gamma: dom.num('gamma', 0),
    method: dom.str('method', 'rk4') as IntegratorId,
    dt: dom.num('dt', 0.003),
    tolerance: 10 ** dom.num('tol', -6),
    initialState
  };
}

export class LabControls {
  private wired = false;
  private dragTarget: number | null = null;

  wire(actions: LabControlBindings): void {
    if (this.wired) return;
    this.wired = true;

    for (const id of REBUILD_CONTROL_IDS) dom.el(id)?.addEventListener('change', () => actions.reset());
    dom.el('qualityMode')?.addEventListener('change', () => {
      actions.applyQualityMode();
      actions.trimEnsembleToQuality();
    });

    dom
      .all('[data-preset]')
      .forEach((btn) => btn.addEventListener('click', () => setTimeout(() => actions.reset(), 0)));
    dom.el('resetBtn')?.addEventListener('click', () => actions.reset());
    dom.el('clearTrailBtn')?.addEventListener('click', () => actions.clearTrail());
    dom.el('clearPoincBtn')?.addEventListener('click', () => actions.clearPoincare());
    dom.el('pauseBtn')?.addEventListener('click', () => actions.toggleRunning());

    this.wireExport(actions);
    this.wireScrubber(actions);
    this.wireDrag(actions.drag);
    this.wireAudio(actions);
  }

  private wireAudio(actions: LabControlBindings): void {
    actions.setAudioVolume(dom.num('audioVol', 0.08));
    dom
      .takeOver('audioOn')
      ?.addEventListener('change', (e) => actions.setAudioEnabled((e.target as HTMLInputElement).checked));
    dom
      .takeOver('audioVol')
      ?.addEventListener('input', (e) =>
        actions.setAudioVolume(Number.parseFloat((e.target as HTMLInputElement).value))
      );
  }

  private wireExport(actions: LabControlBindings): void {
    dom.el('dlTrajBtn')?.addEventListener('click', () => actions.exportTrajectory());
    dom.el('dlPoincBtn')?.addEventListener('click', () => actions.exportPoincare());
    dom.el('dlJsonBtn')?.addEventListener('click', () => actions.exportJson());
    dom.el('dlPNGBtn')?.addEventListener('click', () => actions.exportPng());
  }

  private wireScrubber(actions: LabControlBindings): void {
    const scrubber = dom.el<HTMLInputElement>('scrubber');
    const scrubVal = dom.el('scrubVal');
    if (scrubber) {
      scrubber.addEventListener('input', () => {
        const max = Math.max(0, actions.scrubLength() - 1);
        const value = Math.min(max, Math.round(Number(scrubber.value)));
        const nextIndex = value >= max ? -1 : value;
        actions.setScrubIndex(nextIndex);
        if (scrubVal) scrubVal.textContent = actions.scrubLabel(value);
      });
    }
    dom.el('rewindBtn')?.addEventListener('click', () => actions.rewindScrub());
  }

  private wireDrag(actions: DragBindings): void {
    const canvas = dom.el<HTMLCanvasElement>('main');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (event) => {
      const p = toCanvas(event, canvas, actions.rendererSize());
      if (!p) return;
      const bobs = actions.bobPixels();
      for (let i = 0; i < bobs.length; i += 1) {
        if (Math.hypot(p.x - bobs[i]!.x, p.y - bobs[i]!.y) < 20) {
          this.dragTarget = i;
          canvas.setPointerCapture(event.pointerId);
          break;
        }
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (this.dragTarget === null) return;
      const p = toCanvas(event, canvas, actions.rendererSize());
      const pivot = actions.pivot();
      if (!p || !pivot) return;
      const angles = actions.stateAngles();
      if (this.dragTarget === 0) {
        angles[0] = Math.atan2(p.x - pivot.x, p.y - pivot.y);
      } else {
        const parent = actions.bobPixels()[this.dragTarget - 1];
        if (!parent) return;
        angles[this.dragTarget] = Math.atan2(p.x - parent.x, p.y - parent.y);
      }
      actions.setAngles(angles);
    });

    const release = (event: PointerEvent): void => {
      if (this.dragTarget === null) return;
      this.dragTarget = null;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* capture may already be released */
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }
}

function toCanvas(event: PointerEvent, canvas: HTMLCanvasElement, size: Size2D | null): Point2D | null {
  if (!size || canvas.offsetWidth <= 0 || canvas.offsetHeight <= 0) return null;
  return {
    x: event.offsetX * (size.width / canvas.offsetWidth),
    y: event.offsetY * (size.height / canvas.offsetHeight)
  };
}
