import { LabRenderer } from '../../../app/LabRenderer';
import { LabQualityBudget, type QualityMode } from '../../../app/LabQualityBudget';
import { labMainFrameStyle } from '../../../app/LabRenderPolicy';
import { LabRenderInterpolator } from '../../../app/renderInterpolation';
import { bobsFromStateInto } from '../../../app/pendulumGeometry';
import { configureCanvas2D, getCanvasDprCap, setCanvasDprCap } from '../../../app/canvasQuality';
import type { LabConfig } from '../../../app/LabSimulation';
import { createPlot } from './core-plots';
import type { NativeDisplayModel, NativeDisplayOptions } from './native-display';

interface DisplayElements {
  document: Document;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  phasePlot: HTMLElement;
  model: NativeDisplayModel;
  settings(): NativeDisplayOptions;
}

/** One presentation session over existing native samples; owns no scientific state. */
export function createNativeDisplayRenderer({
  document,
  root,
  canvas,
  status,
  phasePlot,
  model,
  settings
}: DisplayElements) {
  const window = document.defaultView!;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D를 사용할 수 없습니다.');
  const renderer = new LabRenderer(context, { width: 640, height: 400 });
  const interpolator = new LabRenderInterpolator();
  let budget = new LabQualityBudget(() => {});
  let active = false,
    disposed = false,
    generation = 0;
  let previousDpr = getCanvasDprCap();
  let previousClasses: string[] = [];
  let lastStep = -1,
    lastPhase = -1,
    configKey = '',
    frameCount = 0,
    sampleCount = 0;
  let lastAutoTimestamp: number | undefined,
    lastPhaseCost = 0;
  let observer: PerformanceObserver | undefined;
  let observationSequence = 0;
  let longTaskSupport: 'supported' | 'unsupported' = 'unsupported';
  let longTaskCount = 0,
    longTaskMs = 0,
    longestTaskMs = 0;
  const clearLongTasks = () => {
    longTaskCount = 0;
    longTaskMs = 0;
    longestTaskMs = 0;
  };
  const resetEffectiveBudget = () => {
    generation++;
    const state = model.state;
    if (state.playback && state.effectiveStepsPerFrame !== state.playback.stepsPerFrame)
      model.setEffectivePlaybackBudget(state.playback.stepsPerFrame);
  };
  function startObserver() {
    longTaskSupport = 'unsupported';
    const observerGeneration = ++observationSequence;
    const Observer = (window as Window & { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    if (Observer?.supportedEntryTypes?.includes('longtask')) {
      try {
        observer = new Observer((list) => {
          if (
            !active ||
            disposed ||
            observerGeneration !== observationSequence ||
            model.state.status !== 'running' ||
            !settings().autoQuality
          )
            return;
          for (const entry of list.getEntries()) {
            if (!Number.isFinite(entry.duration) || entry.duration < 0) continue;
            longTaskCount++;
            longTaskMs += entry.duration;
            longestTaskMs = Math.max(longestTaskMs, entry.duration);
          }
        });
        observer.observe({ type: 'longtask', buffered: false });
        longTaskSupport = 'supported';
      } catch {
        observer?.disconnect();
        observer = undefined;
      }
    }
    root.dataset.longtaskSupport = longTaskSupport;
  }
  function queueEffectiveBudget(next: number) {
    const state = model.state,
      expected = state.playback,
      effective = state.effectiveStepsPerFrame;
    if (!expected || next === effective) return;
    const current = generation;
    queueMicrotask(() => {
      const latest = model.state;
      if (
        disposed ||
        !active ||
        current !== generation ||
        latest.status !== 'running' ||
        !settings().autoQuality ||
        latest.playback !== expected ||
        latest.effectiveStepsPerFrame !== effective
      )
        return;
      model.setEffectivePlaybackBudget(Math.max(1, Math.min(expected.stepsPerFrame, next)));
    });
  }
  function resume() {
    if (active || disposed) return;
    active = true;
    generation++;
    previousDpr = getCanvasDprCap();
    previousClasses = [...document.body.classList].filter((name) => name.startsWith('quality-'));
    budget = new LabQualityBudget(() => {});
    budget.setMode(settings().qualityMode as QualityMode, 'silent');
    sampleCount = 0;
    lastAutoTimestamp = undefined;
    clearLongTasks();
    startObserver();
    root.dataset.displayState = 'ready';
  }
  function suspend() {
    if (!active) return;
    active = false;
    resetEffectiveBudget();
    observer?.disconnect();
    observer = undefined;
    observationSequence++;
    clearLongTasks();
    lastAutoTimestamp = undefined;
    setCanvasDprCap(previousDpr, 'product native display closed');
    document.body.classList.remove('quality-performance', 'quality-balanced', 'quality-cinematic');
    document.body.classList.add(...previousClasses);
    root.dataset.displayState = 'suspended';
  }
  function draw(timestamp: number, manual: boolean) {
    if (!active || disposed) return;
    const state = model.state,
      config = state.config,
      options = settings();
    if (config.systemId === 'system:chain') {
      status.textContent = '이 표시기는 기존 이중·복합·삼중 모델용입니다. N중 사슬의 기본 작업 공간을 사용하세요.';
      return;
    }
    const parameters =
      'masses' in config.parameters
        ? {
            m1: config.parameters.masses[0]!,
            m2: config.parameters.masses[1]!,
            m3: config.parameters.masses[2]!,
            l1: config.parameters.lengths[0]!,
            l2: config.parameters.lengths[1]!,
            l3: config.parameters.lengths[2]!,
            g: config.parameters.g
          }
        : config.parameters;
    const native: LabConfig = {
      system: config.systemId.slice(7) as LabConfig['system'],
      parameters,
      gamma: config.gamma,
      method: config.integratorId.slice(11) as LabConfig['method'],
      dt: config.step,
      initialState: config.initialState,
      ...(config.tolerance === undefined ? {} : { tolerance: config.tolerance })
    };
    const key = JSON.stringify(config);
    if (key !== configKey || state.sample.step < lastStep) {
      renderer.clear();
      interpolator.reset(state.sample.state);
      configKey = key;
      lastStep = -1;
      lastPhase = -1;
      sampleCount = 0;
      lastAutoTimestamp = undefined;
      clearLongTasks();
    }
    const fresh = state.sample.step !== lastStep;
    const previous = state.previousSample;
    const hasPredecessor =
      previous.step === state.sample.step - 1 && previous.state.length === state.sample.state.length;
    if (fresh) {
      interpolator.reset(hasPredecessor ? previous.state : state.sample.state);
      interpolator.capture(state.sample.state);
    }
    const exact = bobsFromStateInto(native, Float64Array.from(state.sample.state), []);
    const bobs = interpolator.bobs({
      exactBobs: exact,
      config: native,
      enabled: options.interpolate && state.status === 'running' && hasPredecessor,
      timingMode: state.playback?.timingMode ?? 'wall-clock',
      timingDebtSeconds: state.timingDiagnostics.timingDebtSeconds
    });
    const managed = configureCanvas2D(canvas);
    if (!managed) throw new Error('Canvas2D를 사용할 수 없습니다.');
    renderer.resize({ width: managed.width, height: managed.height });
    const style = labMainFrameStyle(native, budget, frameCount++);
    renderer.setWorldRadius(style.worldRadius);
    const renderStart = window.performance.now();
    renderer.draw(bobs, { ...style, preserveTrail: manual || !fresh });
    const renderMs = Math.max(0, window.performance.now() - renderStart);
    let sidePlotMs = 0;
    const phaseDue =
      lastPhase !== state.sample.step &&
      (state.status !== 'running' || frameCount % budget.sidePlotInterval(lastPhaseCost) === 0);
    if (phaseDue) {
      const phaseStart = window.performance.now();
      const n = state.sample.state.length / 2;
      const indices = options.phaseAxis === 'both' ? [0, 1] : [Number(options.phaseAxis) - 1];
      const reduced = state.samples.filter(
        (_entry, index) =>
          index % Math.max(1, Math.ceil(state.samples.length / 600)) === 0 || index === state.samples.length - 1
      );
      phasePlot.replaceChildren(
        createPlot(
          document,
          '표시용 위상공간',
          'θ (rad)',
          'ω (rad/s)',
          indices.map((index) => ({
            label: `링크 ${index + 1}`,
            color: index ? '#9a3412' : '#075985',
            points: reduced.map((entry) => [entry.state[index]!, entry.state[n + index]!] as const)
          }))
        )
      );
      sidePlotMs = Math.max(0, window.performance.now() - phaseStart);
      lastPhaseCost = sidePlotMs;
      lastPhase = state.sample.step;
    }
    if (!manual && options.autoQuality && state.status === 'running') {
      const elapsed = lastAutoTimestamp === undefined ? 0 : timestamp - lastAutoTimestamp;
      lastAutoTimestamp = timestamp;
      const effective = state.effectiveStepsPerFrame ?? state.playback?.stepsPerFrame ?? 6;
      const next = budget.maybeAutoAdjust({
        sampleCount: ++sampleCount,
        fps: elapsed > 0 ? 1000 / elapsed : 0,
        renderMs,
        physicsMs: state.physicsMs,
        sidePlotMs,
        longTaskCount,
        longTaskMs,
        longestTaskMs,
        stepsPerFrame: effective,
        requestedStepsPerFrame: state.playback?.stepsPerFrame ?? effective
      });
      queueEffectiveBudget(next);
      root.dataset.longtaskCount = String(longTaskCount);
      root.dataset.longtaskMs = String(longTaskMs);
      clearLongTasks();
    } else {
      lastAutoTimestamp = undefined;
      if (state.status !== 'running') clearLongTasks();
    }
    root.dataset.autoQualitySamples = String(sampleCount);
    root.dataset.renderFrames = String(frameCount);
    root.dataset.renderMs = String(renderMs);
    root.dataset.sidePlotMs = String(sidePlotMs);
    root.dataset.phaseSampled = String(phaseDue);
    root.dataset.physicsMs = String(state.physicsMs);
    root.dataset.previousStep = String(previous.step);
    root.dataset.currentStep = String(state.sample.step);
    root.dataset.interpolationAvailable = String(hasPredecessor);
    root.dataset.canvasDpr = String(managed.dpr);
    root.dataset.trailPoints = String(renderer.trailPointCount());
    root.dataset.effectiveTrailLength = String(style.trailLength);
    status.textContent = `${budget.mode} · 적용 궤적 ${style.trailLength}점 / 요청 ${options.trailLength}점 · 저장된 궤적 ${renderer.trailPointCount()}점 · ${renderer.activeTrailBackend()} · 물리 ${state.physicsMs.toPrecision(4)} ms · 렌더 ${renderMs.toPrecision(4)} ms · 위상공간 ${sidePlotMs.toPrecision(4)} ms${longTaskSupport === 'unsupported' ? ' · 긴 작업 측정 미지원' : ''}`;
    lastStep = state.sample.step;
  }
  return {
    resume,
    suspend,
    draw,
    resetEffectiveBudget,
    invalidatePhase() {
      lastPhase = -1;
    },
    setMode() {
      if (active) budget.setMode(settings().qualityMode as QualityMode, 'manual');
    },
    dispose() {
      if (disposed) return;
      suspend();
      disposed = true;
      generation++;
      renderer.dispose();
      root.dataset.displayState = 'disposed';
    }
  };
}
