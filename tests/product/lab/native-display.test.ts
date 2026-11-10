import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  time: 0,
  draws: [] as { bobs: unknown; extras: unknown }[],
  controls: new Map<string, { value?: string; checked?: boolean }>(),
  disposals: 0
}));
vi.mock('../../../src/app/DomBinder', () => ({
  pageDom: {
    str: (id: string, fallback: string) => fixture.controls.get(id)?.value ?? fallback,
    num: (id: string, fallback: number) => Number(fixture.controls.get(id)?.value ?? fallback),
    bool: (id: string, fallback = false) => fixture.controls.get(id)?.checked ?? fallback,
    el: (id: string) => fixture.controls.get(id),
    setText() {}
  }
}));
vi.mock('../../../src/app/LabRenderer', () => ({
  LabRenderer: class {
    clear() {}
    resize() {}
    setWorldRadius() {}
    draw(bobs: unknown, extras: unknown) {
      fixture.time += 2;
      fixture.draws.push({ bobs: structuredClone(bobs), extras });
    }
    trailPointCount() {
      return 3;
    }
    activeTrailBackend() {
      return 'canvas2d';
    }
    dispose() {
      fixture.disposals++;
    }
  }
}));
vi.mock('../../../src/product/lab/views/core-plots', () => ({
  createPlot: () => {
    fixture.time += 3;
    return {};
  }
}));
import { createNativeDisplayRenderer } from '../../../src/product/lab/views/native-display-renderer';
import {
  createNativeDisplay,
  DEFAULT_NATIVE_DISPLAY,
  type NativeDisplayModel
} from '../../../src/product/lab/views/native-display';
import { createPlanarSimulation, defaultPlanarConfig } from '../../../src/product/adapters/physics/planar';
import { DEFAULT_PLAYBACK } from '../../../src/product/lab/views/playback-clock';
import { bobsFromStateInto } from '../../../src/app/pendulumGeometry';
import { canvasQualityDiagnostics, getCanvasDprCap, setCanvasDprCap } from '../../../src/app/canvasQuality';

function session(observe = true) {
  const classes = new Set(['app', 'quality-cinematic']);
  const classList = {
    [Symbol.iterator]: () => classes.values(),
    add: (...names: string[]) => names.forEach((name) => classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => classes.delete(name))
  };
  const observers: Observer[] = [];
  class Observer {
    static supportedEntryTypes = ['longtask'];
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(readonly callback: (list: { getEntries(): { duration: number }[] }) => void) {
      observers.push(this);
    }
    send(duration: number) {
      this.callback({ getEntries: () => [{ duration }] });
    }
  }
  const window = {
    performance: { now: () => fixture.time },
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    ...(observe ? { PerformanceObserver: Observer } : {})
  };
  const document = { defaultView: window, body: { classList } };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const root = { dataset: {} as Record<string, string> },
    status = { textContent: '' };
  const canvas = {
    width: 640,
    height: 400,
    getAttribute: (name: string) => (name === 'width' ? '640' : '400'),
    getBoundingClientRect: () => ({ width: 640, height: 400 }),
    getContext: () => ({ setTransform() {}, imageSmoothingEnabled: false })
  };
  const phasePlot = { replaceChildren: vi.fn() };
  const config = { ...defaultPlanarConfig(), sampleEvery: 100 };
  const native = createPlanarSimulation(config),
    initial = native.snapshot();
  for (let step = 1; step <= 19; step++) native.step();
  const previousSample = native.snapshot(),
    sample = native.step();
  const state = {
    config,
    previousSample,
    sample,
    samples: [initial, sample],
    status: 'running',
    playback: Object.freeze({ ...DEFAULT_PLAYBACK, stepsPerFrame: 60 }),
    effectiveStepsPerFrame: 60,
    physicsMs: 13,
    timingDiagnostics: { timingDebtSeconds: 0, droppedSimulationSeconds: 0 }
  };
  const setEffectivePlaybackBudget = vi.fn((value: number) => {
    state.effectiveStepsPerFrame = value;
    return true;
  });
  const model: NativeDisplayModel = {
    get state() {
      return state;
    },
    setEffectivePlaybackBudget
  };
  const settings = { ...DEFAULT_NATIVE_DISPLAY };
  const display = createNativeDisplayRenderer({
    document: document as unknown as Document,
    root: root as unknown as HTMLElement,
    canvas: canvas as unknown as HTMLCanvasElement,
    status: status as unknown as HTMLElement,
    phasePlot: phasePlot as unknown as HTMLElement,
    model,
    settings: () => settings
  });
  return {
    display,
    state,
    settings,
    root,
    status,
    classes,
    observers,
    setEffectivePlaybackBudget,
    config,
    phasePlot,
    document,
    window,
    model
  };
}
beforeEach(() => {
  fixture.time = 0;
  fixture.draws = [];
  fixture.controls.clear();
  fixture.disposals = 0;
  fixture.controls.set('autoQual', { checked: true });
  fixture.controls.set('trailLen', { value: '1200' });
  fixture.controls.set('qualityMode', { value: 'balanced' });
  setCanvasDprCap(1.25, 'prior product');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('S28 actual native display measurements and lifecycle', () => {
  it('coalesces update notifications into one RAF and keeps manual redraws out of auto-quality samples', async () => {
    const f = session(false);
    f.display.dispose();
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    Reflect.set(f.window, 'requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    Reflect.set(f.window, 'cancelAnimationFrame', (id: number) => frames.delete(id));
    Reflect.set(f.window, 'addEventListener', vi.fn());
    Reflect.set(f.window, 'removeEventListener', vi.fn());
    const nodes: Node[] = [];
    class Node {
      id = '';
      value = '';
      checked = false;
      open = false;
      style = {};
      dataset: Record<string, string> = {};
      handlers = new Map<string, (() => void)[]>();
      width = 640;
      height = 400;
      append() {}
      setAttribute() {}
      click() {}
      addEventListener(name: string, handler: () => void) {
        this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
      }
      fire(name: string) {
        this.handlers.get(name)?.forEach((handler) => handler());
      }
      getAttribute(name: string) {
        return name === 'width' ? '640' : '400';
      }
      getBoundingClientRect() {
        return { width: 640, height: 400 };
      }
      getContext() {
        return { setTransform() {}, imageSmoothingEnabled: false };
      }
      replaceChildren() {}
    }
    Reflect.set(f.document, 'createElement', () => {
      const node = new Node();
      nodes.push(node);
      return node;
    });
    Reflect.set(f.document, 'createTextNode', () => new Node());
    const ui = createNativeDisplay(f.document as unknown as Document, f.model);
    const root = ui.element as unknown as Node;
    root.open = true;
    root.fire('toggle');
    await vi.waitFor(() => expect(frames.size).toBe(1));
    for (let i = 0; i < 100; i++) ui.update();
    expect(frames.size).toBe(1);
    expect(root.dataset.renderFrames).toBeUndefined();
    const drawFrame = (timestamp: number) => {
      const [id, callback] = frames.entries().next().value!;
      frames.delete(id);
      callback(timestamp);
    };
    drawFrame(16);
    expect(root.dataset.renderFrames).toBe('1');
    expect(frames.size).toBe(1);
    expect(root.dataset.autoQualitySamples).toBe('0');
    for (let i = 0; i < 100; i++) ui.update();
    drawFrame(32);
    expect(root.dataset.renderFrames).toBe('2');
    expect(root.dataset.autoQualitySamples).toBe('1');
    const quality = nodes.find((node) => node.id === 'qualityMode')!;
    quality.value = 'cinematic';
    quality.fire('change');
    drawFrame(48);
    expect(root.dataset.renderFrames).toBe('3');
    expect(root.dataset.autoQualitySamples).toBe('1');
    root.open = false;
    root.fire('toggle');
    expect(frames.size).toBe(0);
    ui.update();
    expect(frames.size).toBe(0);
    expect(getCanvasDprCap()).toBe(1.25);
    root.open = true;
    root.fire('toggle');
    expect(frames.size).toBe(1);
    ui.dispose();
    expect(frames.size).toBe(0);
  });
  it('feeds actual physics/render/phase metrics to unchanged quality policy and defers only effective budget', async () => {
    const f = session();
    f.display.resume();
    const sourceState = structuredClone(f.state.sample.state);
    f.state.status = 'paused';
    f.display.draw(0, true);
    expect(f.root.dataset.renderMs).toBe('2');
    expect(f.root.dataset.sidePlotMs).toBe('3');
    expect(f.root.dataset.autoQualitySamples).toBe('0');
    f.state.status = 'running';
    for (let frame = 1; frame <= 64; frame++) f.display.draw(frame * 16, false);
    expect(f.setEffectivePlaybackBudget).not.toHaveBeenCalled();
    expect(f.root.dataset.physicsMs).toBe('13');
    expect(f.root.dataset.autoQualitySamples).toBe('64');
    await Promise.resolve();
    expect(f.setEffectivePlaybackBudget).toHaveBeenCalledExactlyOnceWith(49);
    expect(f.state.playback.stepsPerFrame).toBe(60);
    expect(f.state.timingDiagnostics).toEqual({ timingDebtSeconds: 0, droppedSimulationSeconds: 0 });
    expect(f.state.sample.state).toEqual(sourceState);
    expect(canvasQualityDiagnostics().at(-1)).toMatchObject({
      physicsMs: 13,
      renderMs: 2,
      stepsPerFrame: 49,
      fps: 62.5
    });
    f.display.dispose();
  });
  it('uses the exact immediate predecessor and refuses interpolation across sparse recorded intervals', () => {
    const f = session();
    f.display.resume();
    f.display.draw(0, true);
    const config = {
      system: 'double' as const,
      parameters: f.config.parameters,
      gamma: f.config.gamma,
      method: 'rk4' as const,
      dt: f.config.step,
      initialState: f.config.initialState
    };
    expect(fixture.draws.at(-1)?.bobs).toEqual(
      bobsFromStateInto(config, Float64Array.from(f.state.previousSample.state), [])
    );
    expect(f.root.dataset.previousStep).toBe('19');
    expect(f.root.dataset.currentStep).toBe('20');
    f.state.previousSample = f.state.samples[0]!;
    f.display.draw(16, true);
    expect(f.root.dataset.interpolationAvailable).toBe('false');
    expect(fixture.draws.at(-1)?.bobs).toEqual(bobsFromStateInto(config, Float64Array.from(f.state.sample.state), []));
    f.display.dispose();
  });
  it('manual redraws never advance auto-quality sampling or shed the physics budget', async () => {
    const f = session();
    f.display.resume();
    for (let frame = 0; frame < 100; frame++) f.display.draw(frame * 16, true);
    await Promise.resolve();
    expect(f.root.dataset.autoQualitySamples).toBe('0');
    expect(f.setEffectivePlaybackBudget).not.toHaveBeenCalled();
    f.display.dispose();
  });
  it('reports real long tasks, rejects stale observer delivery, and marks unsupported observation explicitly', () => {
    const f = session();
    f.display.resume();
    for (let frame = 1; frame < 20; frame++) f.display.draw(frame * 16, false);
    f.observers[0]!.send(55);
    f.display.draw(320, false);
    expect(canvasQualityDiagnostics().at(-1)).toMatchObject({
      longTaskCount: 1,
      longTaskMs: 55,
      renderMs: 2,
      physicsMs: 13
    });
    expect(f.root.dataset.longtaskSupport).toBe('supported');
    f.display.suspend();
    f.display.resume();
    f.observers[0]!.send(100);
    f.display.draw(336, false);
    expect(f.root.dataset.longtaskCount).toBe('0');
    f.display.dispose();
    const unsupported = session(false);
    unsupported.display.resume();
    unsupported.display.draw(0, true);
    expect(unsupported.root.dataset.longtaskSupport).toBe('unsupported');
    expect(unsupported.status.textContent).toContain('긴 작업 측정 미지원');
    unsupported.display.dispose();
  });
  it('close/dispose cancels deferred shedding, resets effective budget, and restores prior DPR and body classes', async () => {
    const f = session();
    f.display.resume();
    for (let frame = 1; frame <= 64; frame++) f.display.draw(frame * 16, false);
    f.display.suspend();
    await Promise.resolve();
    expect(f.setEffectivePlaybackBudget).not.toHaveBeenCalled();
    expect(getCanvasDprCap()).toBe(1.25);
    expect([...f.classes].sort()).toEqual(['app', 'quality-cinematic']);
    expect(f.observers[0]!.disconnect).toHaveBeenCalledOnce();
    f.state.effectiveStepsPerFrame = 20;
    f.display.resume();
    f.display.suspend();
    expect(f.setEffectivePlaybackBudget).toHaveBeenCalledExactlyOnceWith(60);
    f.display.dispose();
    f.display.dispose();
    expect(fixture.disposals).toBe(1);
    const draws = fixture.draws.length;
    f.display.draw(2000, false);
    expect(fixture.draws).toHaveLength(draws);
  });
});
