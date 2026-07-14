import type { IntegratorId, RuntimeSnapshot, SystemType } from '../types/domain';
import type { Point2D } from '../viz/poincare';
import type { LabConfig } from './LabSimulation';
import { pageDom as dom } from './DomBinder';
import { LAB_CONTROLS_COMMITTED_EVENT, type LabControlCommitDetail } from './controlCommit';
import { LAB_CONTROL_BOUNDS, LAB_INTEGRATOR_IDS, inBounds } from '../validation/sessionConstraints';

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
  restoreSnapshot(snapshot: RuntimeSnapshot): void;
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

const labIntegratorIds = new Set<string>(LAB_INTEGRATOR_IDS);

function boundedControl(id: string, fallback: number, bounds: { min: number; max: number }): number {
  const raw = dom.num(id, fallback);
  const value = inBounds(raw, bounds) ? raw : Math.min(bounds.max, Math.max(bounds.min, fallback));
  if (raw !== value) dom.setValue(id, value);
  return value;
}

export function readLabStepsPerFrame(): number {
  const value = boundedControl('spf', 6, LAB_CONTROL_BOUNDS.stepsPerFrame);
  const integer = Math.round(value);
  if (integer !== value) dom.setValue('spf', integer);
  return integer;
}

export function readLabConfig(): LabConfig {
  const rawSystem = dom.str('sysType', 'double');
  const system: SystemType = rawSystem === 'triple' ? 'triple' : 'double';
  if (rawSystem !== system) dom.setValue('sysType', system);
  const rawMethod = dom.str('method', 'rk4');
  const canonicalMethod = rawMethod === 'verlet' ? 'leapfrog' : rawMethod;
  const method = labIntegratorIds.has(canonicalMethod) ? (canonicalMethod as IntegratorId) : 'rk4';
  if (rawMethod !== method) dom.setValue('method', method);
  const parameters = {
    m1: boundedControl('m1', 1, LAB_CONTROL_BOUNDS.mass),
    m2: boundedControl('m2', 1, LAB_CONTROL_BOUNDS.mass),
    m3: boundedControl('m3', 1, LAB_CONTROL_BOUNDS.mass),
    l1: boundedControl('l1', 1.2, LAB_CONTROL_BOUNDS.length),
    l2: boundedControl('l2', 1.0, LAB_CONTROL_BOUNDS.length),
    l3: boundedControl('l3', 0.8, LAB_CONTROL_BOUNDS.length),
    g: boundedControl('g', 9.81, LAB_CONTROL_BOUNDS.gravity)
  };
  const initialState =
    system === 'triple'
      ? [
          boundedControl('th1', 2, LAB_CONTROL_BOUNDS.angle),
          boundedControl('th2', 2.5, LAB_CONTROL_BOUNDS.angle),
          boundedControl('th3', 1, LAB_CONTROL_BOUNDS.angle),
          boundedControl('iw1', 0, LAB_CONTROL_BOUNDS.angularVelocity),
          boundedControl('iw2', 0, LAB_CONTROL_BOUNDS.angularVelocity),
          boundedControl('iw3', 0, LAB_CONTROL_BOUNDS.angularVelocity)
        ]
      : [
          boundedControl('th1', 2, LAB_CONTROL_BOUNDS.angle),
          boundedControl('th2', 2.5, LAB_CONTROL_BOUNDS.angle),
          boundedControl('iw1', 0, LAB_CONTROL_BOUNDS.angularVelocity),
          boundedControl('iw2', 0, LAB_CONTROL_BOUNDS.angularVelocity)
        ];
  const toleranceExponent = boundedControl('tol', -6, {
    min: Math.log10(LAB_CONTROL_BOUNDS.tolerance.min),
    max: Math.log10(LAB_CONTROL_BOUNDS.tolerance.max)
  });
  return {
    system,
    parameters,
    gamma: boundedControl('gamma', 0, LAB_CONTROL_BOUNDS.damping),
    method,
    dt: boundedControl('dt', 0.003, LAB_CONTROL_BOUNDS.dt),
    tolerance: 10 ** toleranceExponent,
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
    document.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, (event) => {
      const detail = (event as CustomEvent<LabControlCommitDetail>).detail;
      if (detail?.source === 'saved-run-import' && detail.snapshot) actions.restoreSnapshot(detail.snapshot);
      else actions.reset();
    });
    dom.el('qualityMode')?.addEventListener('change', () => {
      actions.applyQualityMode();
      actions.trimEnsembleToQuality();
    });

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
