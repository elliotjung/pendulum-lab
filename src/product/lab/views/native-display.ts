import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { PlanarConfig } from '../../adapters/physics/planar';
import type { ChainConfig } from '../../adapters/physics/chain';
import type { PlaybackSettings } from './playback-clock';
import type { createNativeDisplayRenderer } from './native-display-renderer';

export interface NativeDisplayOptions {
  trailMode: string;
  trailLength: number;
  phaseAxis: string;
  qualityMode: string;
  glow: boolean;
  longExposure: boolean;
  interpolate: boolean;
  autoQuality: boolean;
}
export const DEFAULT_NATIVE_DISPLAY: NativeDisplayOptions = {
  trailMode: 'rainbow',
  trailLength: 1200,
  phaseAxis: 'both',
  qualityMode: 'balanced',
  glow: false,
  longExposure: false,
  interpolate: true,
  autoQuality: true
};
export interface NativeDisplayModel {
  readonly state: {
    config: PlanarConfig | ChainConfig;
    sample: { state: readonly number[]; step: number; time: number };
    previousSample: { state: readonly number[]; step: number; time: number };
    samples: readonly { state: readonly number[]; step: number; time: number }[];
    status: string;
    playback: PlaybackSettings | null;
    effectiveStepsPerFrame: number | null;
    physicsMs: number;
    timingDiagnostics: { timingDebtSeconds: number; droppedSimulationSeconds: number };
  };
  setEffectivePlaybackBudget(next: number): boolean;
}
/** Load unchanged native rendering only when explicitly opened. No second solver is created. */
export function createNativeDisplay(document: Document, model: NativeDisplayModel, initial = DEFAULT_NATIVE_DISPLAY) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'native-display';
  root.append(element(document, 'summary', '', '궤적 · 표시 품질 · 보간'));
  const fields = element(document, 'div', 'lab-inspector-grid');
  function select(id: string, label: string, choices: readonly string[], value: string) {
    const title = element(document, 'label', 'ds-field__label', label);
    title.htmlFor = id;
    const input = element(document, 'select', 'ds-field__control');
    input.id = id;
    for (const value of choices) {
      const option = element(document, 'option', '', value);
      option.value = value;
      input.append(option);
    }
    input.value = value;
    fields.append(title, input);
    return input;
  }
  const mode = select(
    'trailMode',
    '궤적 색',
    ['rainbow', 'heat', 'ice', 'plasma', 'white', 'green'],
    initial.trailMode
  );
  const quality = select('qualityMode', '표시 품질', ['performance', 'balanced', 'cinematic'], initial.qualityMode);
  const phase = select('phaseAxis', '위상공간 축', ['1', '2', 'both'], initial.phaseAxis);
  const lenLabel = element(document, 'label', 'ds-field__label', '궤적 길이');
  lenLabel.htmlFor = 'trailLen';
  const length = element(document, 'input', 'ds-field__control');
  Object.assign(length, {
    id: 'trailLen',
    type: 'number',
    min: '2',
    max: '50000',
    step: '1',
    value: String(initial.trailLength)
  });
  fields.append(lenLabel, length);
  function checkbox(id: string, label: string, value: boolean) {
    const title = element(document, 'label', 'ds-field__label');
    const input = element(document, 'input', '');
    input.type = 'checkbox';
    input.id = id;
    input.checked = value;
    title.htmlFor = id;
    title.append(input, document.createTextNode(` ${label}`));
    fields.append(title);
    return input;
  }
  const glow = checkbox('glowMode', '빛 번짐', initial.glow),
    long = checkbox('longExpose', '긴 노출', initial.longExposure),
    interpolate = checkbox('interpolateRender', '표시 프레임 보간', initial.interpolate),
    auto = checkbox('autoQual', '자동 품질 조절', initial.autoQuality);
  const canvas = element(document, 'canvas', '');
  canvas.width = 640;
  canvas.height = 400;
  canvas.style.width = '100%';
  canvas.style.maxWidth = '640px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '기존 renderer로 표시한 진자와 궤적');
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const phasePlot = element(document, 'div', 'core-plot-frame');
  root.append(fields, canvas, status, phasePlot);
  let disposed = false,
    pending = false,
    frame: number | undefined,
    manualPending = false,
    renderer: ReturnType<typeof createNativeDisplayRenderer> | undefined;
  function settings(): NativeDisplayOptions {
    return {
      trailMode: mode.value,
      trailLength: Number(length.value),
      phaseAxis: phase.value,
      qualityMode: quality.value,
      glow: glow.checked,
      longExposure: long.checked,
      interpolate: interpolate.checked,
      autoQuality: auto.checked
    };
  }
  const exportSettings = createButton(document, {
    label: '표시 설정 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      download(
        JSON.stringify({ schema: 'pendulum-display/v1', ...settings() }, null, 2),
        'pendulum-display.json',
        'application/json'
      );
    }
  });
  const exportImage = createButton(document, {
    label: '현재 궤적 PNG 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        const url = canvas.toDataURL('image/png');
        const link = element(document, 'a', '');
        link.href = url;
        link.download = 'pendulum-trail.png';
        link.click();
      } catch {
        status.textContent = '이미지를 만들지 못했습니다. 표시 설정은 JSON으로 보존할 수 있습니다.';
      }
    }
  });
  const urls = new Set<string>();
  function download(text: string, name: string, type: string) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      urls.add(url);
      const a = element(document, 'a', '');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
      }, 1000);
    } catch {
      status.textContent = '다운로드를 만들지 못했습니다. 현재 설정은 유지됩니다.';
    }
  }
  root.append(
    exportSettings,
    exportImage,
    element(
      document,
      'p',
      'lab-muted',
      '보간·품질은 표시만 바꿉니다. 궤적 길이는 기존 품질·화면 크기 예산으로 제한되며 실제 적용 길이를 아래에 표시합니다. 원래 수치 상태는 설정 JSON·궤적 CSV로 보존하세요.'
    )
  );
  async function load() {
    if (disposed || renderer || pending) return;
    pending = true;
    root.dataset.displayState = 'loading';
    try {
      const { createNativeDisplayRenderer } = await import('./native-display-renderer');
      if (disposed) return;
      renderer = createNativeDisplayRenderer({ document, root, canvas, status, phasePlot, model, settings });
      if (root.open) requestDraw(true);
    } catch (cause) {
      root.dataset.displayState = 'error';
      status.textContent = cause instanceof Error ? cause.message : '표시 도구를 불러오지 못했습니다.';
    } finally {
      pending = false;
    }
  }
  function cancelFrame() {
    if (frame !== undefined) document.defaultView!.cancelAnimationFrame(frame);
    frame = undefined;
    manualPending = false;
  }
  function requestDraw(manual = false) {
    if (disposed || !root.open) return;
    manualPending ||= manual;
    if (!renderer) {
      void load();
      return;
    }
    renderer.resume();
    if (frame !== undefined) return;
    frame = document.defaultView!.requestAnimationFrame((timestamp) => {
      frame = undefined;
      if (disposed || !root.open || !renderer) return;
      const manual = manualPending;
      manualPending = false;
      try {
        renderer.draw(timestamp, manual);
      } catch (cause) {
        renderer.suspend();
        root.dataset.displayState = 'error';
        status.textContent = cause instanceof Error ? cause.message : '표시 프레임을 그리지 못했습니다.';
        return;
      }
      if (model.state.status === 'running') requestDraw();
    });
  }
  function update() {
    requestDraw();
  }
  root.addEventListener('toggle', () => {
    if (root.open) requestDraw(true);
    else {
      cancelFrame();
      renderer?.suspend();
    }
  });
  for (const input of [mode, quality, length, glow, long, interpolate, auto, phase])
    input.addEventListener('change', () => {
      if (!Number.isInteger(Number(length.value)) || Number(length.value) < 2 || Number(length.value) > 50000) {
        status.textContent = '궤적 길이는 2–50000 정수여야 합니다.';
        return;
      }
      if (input === quality) renderer?.setMode();
      if (input === auto && !auto.checked) renderer?.resetEffectiveBudget();
      renderer?.invalidatePhase();
      requestDraw(true);
    });
  const resize = () => requestDraw(true);
  document.defaultView!.addEventListener('resize', resize);
  return {
    element: root,
    update,
    settings,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      renderer?.dispose();
      document.defaultView!.removeEventListener('resize', resize);
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
