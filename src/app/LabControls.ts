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
  setAngles(angles: number[], resume: boolean): void;
  beginDrag(): boolean;
  endDrag(resume: boolean): void;
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
  const input = dom.el<HTMLInputElement>(id);
  const raw = input ? Number.parseFloat(input.value) : fallback;
  const value = inBounds(raw, bounds) ? raw : Math.min(bounds.max, Math.max(bounds.min, fallback));
  if (raw !== value) {
    dom.setValue(id, value);
    reportControlValidation(id, validationMessage(id, bounds, value));
  } else reportControlValidation(id, null);
  return value;
}

export function readLabStepsPerFrame(): number {
  const value = boundedControl('spf', 6, LAB_CONTROL_BOUNDS.stepsPerFrame);
  const integer = Math.round(value);
  if (integer !== value) {
    dom.setValue('spf', integer);
    reportControlValidation('spf', integerMessage(integer));
  }
  return integer;
}

export function readLabConfig(): LabConfig {
  const rawSystem = dom.str('sysType', 'double');
  const system: SystemType = rawSystem === 'triple' ? 'triple' : 'double';
  if (rawSystem !== system) {
    dom.setValue('sysType', system);
    reportControlValidation('sysType', choiceMessage('system', system));
  } else reportControlValidation('sysType', null);
  const rawMethod = dom.str('method', 'rk4');
  const canonicalMethod = rawMethod === 'verlet' ? 'leapfrog' : rawMethod;
  const method = labIntegratorIds.has(canonicalMethod) ? (canonicalMethod as IntegratorId) : 'rk4';
  if (rawMethod !== method) {
    dom.setValue('method', method);
    reportControlValidation('method', choiceMessage('integrator', method));
  } else reportControlValidation('method', null);
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
  private listeners: AbortController | null = null;
  private dragListeners: AbortController | null = null;
  private dragBindings: DragBindings | null = null;
  private dragWasRunning = false;
  private pendingMove: { offsetX: number; offsetY: number } | null = null;
  private dragRafId: number | null = null;

  wire(actions: LabControlBindings): void {
    if (this.wired) return;
    this.wired = true;
    this.listeners = new AbortController();
    const listenerOptions = { signal: this.listeners.signal };

    for (const id of REBUILD_CONTROL_IDS)
      dom.el(id)?.addEventListener('change', () => actions.reset(), listenerOptions);
    document.addEventListener(
      LAB_CONTROLS_COMMITTED_EVENT,
      (event) => {
        const detail = (event as CustomEvent<LabControlCommitDetail>).detail;
        if (detail?.source === 'saved-run-import' && detail.snapshot) actions.restoreSnapshot(detail.snapshot);
        else actions.reset();
      },
      listenerOptions
    );
    dom.el('qualityMode')?.addEventListener(
      'change',
      () => {
        actions.applyQualityMode();
        actions.trimEnsembleToQuality();
      },
      listenerOptions
    );

    dom.el('resetBtn')?.addEventListener('click', () => actions.reset(), listenerOptions);
    dom.el('clearTrailBtn')?.addEventListener('click', () => actions.clearTrail(), listenerOptions);
    dom.el('clearPoincBtn')?.addEventListener('click', () => actions.clearPoincare(), listenerOptions);
    dom.el('pauseBtn')?.addEventListener('click', () => actions.toggleRunning(), listenerOptions);

    this.wireExport(actions);
    this.wireScrubber(actions);
    this.wireDrag(actions.drag);
    this.wireAudio(actions);
    this.installIntegratorGuidance();
  }

  rebindMainCanvasDrag(): void {
    if (this.dragBindings) this.wireDrag(this.dragBindings);
  }

  dispose(): void {
    this.listeners?.abort();
    this.listeners = null;
    this.dragListeners?.abort();
    this.dragListeners = null;
    if (this.dragRafId !== null) cancelAnimationFrame(this.dragRafId);
    this.dragRafId = null;
    this.pendingMove = null;
    this.dragTarget = null;
    this.dragBindings = null;
    this.wired = false;
  }

  private wireAudio(actions: LabControlBindings): void {
    const options = this.listeners ? { signal: this.listeners.signal } : undefined;
    actions.setAudioVolume(dom.num('audioVol', 0.08));
    dom
      .takeOver('audioOn')
      ?.addEventListener('change', (e) => actions.setAudioEnabled((e.target as HTMLInputElement).checked), options);
    dom
      .takeOver('audioVol')
      ?.addEventListener(
        'input',
        (e) => actions.setAudioVolume(Number.parseFloat((e.target as HTMLInputElement).value)),
        options
      );
  }

  private wireExport(actions: LabControlBindings): void {
    const options = this.listeners ? { signal: this.listeners.signal } : undefined;
    dom.el('dlTrajBtn')?.addEventListener('click', () => actions.exportTrajectory(), options);
    dom.el('dlPoincBtn')?.addEventListener('click', () => actions.exportPoincare(), options);
    dom.el('dlJsonBtn')?.addEventListener('click', () => actions.exportJson(), options);
    dom.el('dlPNGBtn')?.addEventListener('click', () => actions.exportPng(), options);
  }

  private wireScrubber(actions: LabControlBindings): void {
    const options = this.listeners ? { signal: this.listeners.signal } : undefined;
    const scrubber = dom.el<HTMLInputElement>('scrubber');
    const scrubVal = dom.el('scrubVal');
    if (scrubber) {
      scrubber.addEventListener(
        'input',
        () => {
          const max = Math.max(0, actions.scrubLength() - 1);
          const value = Math.min(max, Math.round(Number(scrubber.value)));
          const nextIndex = value >= max ? -1 : value;
          actions.setScrubIndex(nextIndex);
          if (scrubVal) scrubVal.textContent = actions.scrubLabel(value);
        },
        options
      );
    }
    dom.el('rewindBtn')?.addEventListener('click', () => actions.rewindScrub(), options);
  }

  private wireDrag(actions: DragBindings): void {
    this.dragBindings = actions;
    this.dragListeners?.abort();
    this.dragListeners = new AbortController();
    const listenerOptions = { signal: this.dragListeners.signal };
    const canvas = dom.el<HTMLCanvasElement>('main');
    if (!canvas) return;

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        const p = toCanvas(event, canvas, actions.rendererSize());
        if (!p) return;
        const bobs = actions.bobPixels();
        for (let i = 0; i < bobs.length; i += 1) {
          if (Math.hypot(p.x - bobs[i]!.x, p.y - bobs[i]!.y) < 20) {
            this.dragTarget = i;
            this.dragWasRunning = actions.beginDrag();
            canvas.setPointerCapture(event.pointerId);
            break;
          }
        }
      },
      listenerOptions
    );

    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (this.dragTarget === null) return;
        this.pendingMove = { offsetX: event.offsetX, offsetY: event.offsetY };
        if (this.dragRafId === null) {
          this.dragRafId = requestAnimationFrame(() => {
            this.dragRafId = null;
            this.applyPendingDrag(actions, canvas);
          });
        }
      },
      listenerOptions
    );

    const release = (event: PointerEvent): void => {
      if (this.dragTarget === null) return;
      if (this.dragRafId !== null) cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
      this.applyPendingDrag(actions, canvas);
      this.dragTarget = null;
      actions.endDrag(this.dragWasRunning);
      this.dragWasRunning = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* capture may already be released */
      }
    };
    canvas.addEventListener('pointerup', release, listenerOptions);
    canvas.addEventListener('pointercancel', release, listenerOptions);
  }

  private applyPendingDrag(actions: DragBindings, canvas: HTMLCanvasElement): void {
    if (this.dragTarget === null || !this.pendingMove) return;
    const p = toCanvas(this.pendingMove, canvas, actions.rendererSize());
    this.pendingMove = null;
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
    actions.setAngles(angles, false);
  }

  private installIntegratorGuidance(): void {
    const options = this.listeners ? { signal: this.listeners.signal } : undefined;
    const method = dom.el<HTMLSelectElement>('method');
    const update = (): void => updateIntegratorGuidance(method);
    method?.setAttribute('aria-describedby', 'methodGuidance');
    method?.addEventListener('change', update, options);
    document.addEventListener('pendulum:ui-locale-changed', update, options);
    document.addEventListener('pendulum:audience-mode-changed', update, options);
    update();
  }
}

function reportControlValidation(id: string, message: string | null): void {
  const input = dom.el<HTMLInputElement | HTMLSelectElement>(id);
  if (!input || typeof document === 'undefined') return;
  const errorId = `${id}Validation`;
  const previous = document.getElementById(errorId);
  if (!message) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-errormessage');
    input.setCustomValidity?.('');
    previous?.remove();
    return;
  }
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-errormessage', errorId);
  input.setCustomValidity?.(message);
  const error = previous ?? document.createElement('span');
  error.id = errorId;
  error.className = 'control-validation';
  error.setAttribute('role', 'status');
  error.textContent = message;
  if (!previous) input.closest('.row')?.insertAdjacentElement('afterend', error);
}

function validationMessage(id: string, bounds: { min: number; max: number }, fallback: number): string {
  const korean = typeof document !== 'undefined' && document.documentElement.lang === 'ko';
  return korean
    ? `${id} 값은 ${bounds.min}에서 ${bounds.max} 사이여야 합니다. 안전한 값 ${fallback}(으)로 복원했습니다.`
    : `${id} must be between ${bounds.min} and ${bounds.max}. Restored the safe value ${fallback}.`;
}

function integerMessage(value: number): string {
  const korean = typeof document !== 'undefined' && document.documentElement.lang === 'ko';
  return korean
    ? `프레임당 스텝은 정수여야 합니다. ${value}(으)로 반올림했습니다.`
    : `Steps per frame must be an integer. Rounded to ${value}.`;
}

function choiceMessage(label: string, fallback: string): string {
  const korean = typeof document !== 'undefined' && document.documentElement.lang === 'ko';
  return korean
    ? `지원하지 않는 ${label} 선택입니다. ${fallback}(으)로 복원했습니다.`
    : `That ${label} is not supported. Restored ${fallback}.`;
}

const INTEGRATOR_GUIDANCE: Record<string, { en: string; ko: string }> = {
  rk4: {
    en: 'Good default for short demonstrations. Halve dt and compare energy drift before trusting a long chaotic run.',
    ko: '짧은 시연에 좋은 기본값입니다. 긴 혼돈 궤적을 신뢰하기 전에 dt를 절반으로 줄여 에너지 오차를 비교하세요.'
  },
  dop853: {
    en: 'High-order fixed-step reference. Use it for short convergence comparisons; this control does not imply adaptive error control.',
    ko: '고차 고정 스텝 기준해입니다. 짧은 수렴 비교에 사용하세요. 이 선택은 적응형 오차 제어를 뜻하지 않습니다.'
  },
  hmidpoint: {
    en: 'Choose for long conservative runs. Confirm gamma is zero and inspect the solver residual as well as energy drift.',
    ko: '긴 보존계 실행에 적합합니다. γ가 0인지 확인하고 에너지 오차와 함께 풀이 잔차를 점검하세요.'
  },
  leapfrog: {
    en: 'Structure-aware angle/velocity approximation. Compare against RK4 at half dt before making a symplectic claim.',
    ko: '각도/각속도 구조를 고려한 근사입니다. 심플렉틱이라고 판단하기 전에 dt/2의 RK4와 비교하세요.'
  },
  yoshida4: {
    en: 'Higher-order structure-aware composition. Use only for undamped runs and validate with a dt-halving study.',
    ko: '고차 구조 보존 합성법입니다. 비감쇠 실행에만 사용하고 dt 절반 수렴 시험으로 검증하세요.'
  },
  bdf2: {
    en: 'L-stable choice for stiff or strongly damped motion. Energy loss is expected when damping is nonzero.',
    ko: '강직하거나 감쇠가 큰 운동을 위한 L-안정 방법입니다. 감쇠가 0이 아니면 에너지 감소는 정상입니다.'
  }
};

function updateIntegratorGuidance(method: HTMLSelectElement | null): void {
  const host = dom.el('methodGuidance');
  if (!host || !method) return;
  const korean = document.documentElement.lang === 'ko';
  const guidance = INTEGRATOR_GUIDANCE[method.value] ?? {
    en: 'Run a dt-halving comparison and inspect residual, drift, and limitations before treating this trajectory as evidence.',
    ko: '이 궤적을 근거로 사용하기 전에 dt 절반 비교를 실행하고 잔차, 오차와 한계를 점검하세요.'
  };
  host.textContent = korean ? guidance.ko : guidance.en;
}

function toCanvas(
  event: Pick<PointerEvent, 'offsetX' | 'offsetY'>,
  canvas: HTMLCanvasElement,
  size: Size2D | null
): Point2D | null {
  if (!size || canvas.offsetWidth <= 0 || canvas.offsetHeight <= 0) return null;
  return {
    x: event.offsetX * (size.width / canvas.offsetWidth),
    y: event.offsetY * (size.height / canvas.offsetHeight)
  };
}
