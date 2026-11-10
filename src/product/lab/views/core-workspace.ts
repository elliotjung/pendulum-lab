import { createDiagnostics } from './diagnostics';
import { toCanonicalPlanar } from '../../adapters/physics/planar';
import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultPlanarConfig,
  fromCanonicalPlanar,
  type PlanarConfig,
  type PlanarSystemId
} from '../../adapters/physics/planar';
import { createCoreModel, type CoreModel, type CoreStatus } from './core-model';
import { createCoreInspector } from './core-inspector';
import { createCoreAnalysis } from './core-analysis';
import { createCoreFiles } from './core-files';
import { createScene } from './core-plots';
import { loadCoreConfig } from './core-storage';
import { focusSource } from '../../experiments/transfer';
import { createCompatibilityTools } from '../compatibility-tools';
import { createRunHistory } from './run-history';
import { createPlaybackControls } from './playback-controls';
import { bindProductRuntime } from '../../app/browser-api-binding';
import { createWorkspaceRuntimeProvider, type ProductRuntimeTiming } from '../../app/browser-api-provider';
import { DEFAULT_PLAYBACK } from './playback-clock';
import { createNativeDisplay } from './native-display';
import { createNativeDesignPanel } from '../experiments/native-design-panel';
import { prepareLegacyLinkContext, createLegacyLinkContextPanel } from './legacy-link-context';
import { createStructureDiagnosticsPanel } from './structure-diagnostics-panel';
import { createPhaseSpace3D } from './native-phase-space';
import { createPhaseDensity } from './phase-density';
import { createRuntimeAccelerationPanel } from './runtime-acceleration-panel';
import type { ProductSetupV1 } from '../../persistence/product-setup';
import { createNativeSetupPanel } from './native-setup-panel';

const sessions = new WeakMap<Document, Map<string, CoreModel>>();
const labels: Record<CoreStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};

export function createCoreWorkspace(
  document: Document,
  system: SystemDefinition,
  experiment?: ExperimentStateV1,
  setup?: ProductSetupV1
) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace core-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 고전 진자'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial: PlanarConfig = defaultPlanarConfig(system.id as PlanarSystemId);
  let storageWarning = '';
  if (experiment) {
    const parsed = fromCanonicalPlanar(experiment);
    if (!parsed.ok) {
      const alert = element(
        document,
        'p',
        'ds-field__error',
        `이 공유 설정을 실행할 수 없습니다. ${parsed.issues.map((item) => item.message).join(' ')} 원본 링크를 보존하세요.`
      );
      alert.setAttribute('role', 'alert');
      view.append(alert, link(document, '기본 설정으로 시작', `#/lab/${system.id.slice(7)}`));
      return { element: view, dispose() {} };
    }
    initial = parsed.value;
  } else {
    try {
      initial = loadCoreConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      storageWarning = `저장된 설정을 읽지 못해 기본 설정을 표시합니다. 기존 저장 내용은 그대로 보존했습니다. ${cause instanceof Error ? cause.message : ''}`;
    }
  }
  let session = sessions.get(document);
  if (!session) {
    session = new Map();
    sessions.set(document, session);
  }
  const key = experiment ? `${system.id}:${JSON.stringify(setup ?? experiment)}` : system.id;
  let cached = session.get(key);
  if (!cached) {
    cached = createCoreModel(initial);
    session.set(key, cached);
  }
  const model = cached;
  const priorAngleUnit = document.documentElement.dataset.productAngleUnit;
  const legacyContext = prepareLegacyLinkContext(document, setup ? undefined : experiment);
  if (setup) document.documentElement.dataset.productAngleUnit = setup.controls.angleUnit;
  const sourceUnit = experiment ? focusSource(experiment) : null;
  if (sourceUnit) {
    const source = element(document, 'aside', 'learn-notice');
    source.append(
      element(
        document,
        'p',
        '',
        `출처 단원 ${sourceUnit.unitId} · 콘텐츠 버전 ${sourceUnit.version}. 전용 실험의 초기조건·단위·분석 설정을 적용했습니다.`
      ),
      element(
        document,
        'p',
        '',
        '이곳에서 바꾼 조건은 실험실에 유지됩니다. 단원으로 돌아가면 보내기 전 전용 실험을 복원합니다.'
      ),
      link(document, '단원으로 돌아가기', sourceUnit.href, 'ds-button ds-button--secondary')
    );
    view.append(source);
  }
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      '기존 물리 엔진으로 계산합니다. θ는 아래 수직선 기준 절대각입니다. 저장한 설정은 초기조건에서 재실행하며, 화면을 이동하면 계산을 멈춥니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (storageWarning) view.append(element(document, 'p', 'lab-preview-note', storageWarning));
  if (legacyContext.warning) view.append(element(document, 'p', 'lab-preview-note', legacyContext.warning));
  if (experiment)
    view.append(
      element(
        document,
        'p',
        'lab-preview-note',
        '공유된 실험 설정을 적용했습니다. 현재 초기조건에서 실행할 수 있습니다.'
      )
    );
  const run = createSection(document, { id: 'lab-run-bar', title: '실행 제어' });
  const status = element(document, 'p', 'lab-run-status');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = element(document, 'div', 'lab-run-actions');
  const start = createButton(document, {
    label: '실행',
    onClick() {
      model.run();
    }
  });
  const pause = createButton(document, {
    label: '일시정지',
    variant: 'secondary',
    onClick() {
      model.pause();
    }
  });
  const step = createButton(document, {
    label: '한 단계',
    variant: 'secondary',
    onClick() {
      model.step();
    }
  });
  const reset = createButton(document, {
    label: '처음으로',
    variant: 'secondary',
    onClick() {
      dock.invalidate();
      compatibility.invalidate();
      model.reset();
    }
  });
  const cancel = createButton(document, {
    label: '실행 취소',
    variant: 'secondary',
    onClick() {
      model.cancel();
    }
  });
  actions.append(start, pause, step, reset, cancel);
  const speedLabel = element(document, 'label', 'ds-field__label', '재생 속도');
  speedLabel.htmlFor = 'core-speed';
  const speed = element(document, 'select', 'ds-field__control');
  speed.id = 'core-speed';
  for (const value of [0.25, 1, 4]) {
    const option = element(document, 'option', '', `${value}×`);
    option.value = String(value);
    speed.append(option);
  }
  speed.value = String(model.state.speed);
  speed.addEventListener('change', () => model.setSpeed(Number(speed.value)));
  const time = element(document, 'output', 'core-time');
  time.id = 'lab-time';
  time.setAttribute('aria-label', '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'lab-run-progress', label: '실행 진행', max: 100, value: 0 });
  const playback = createPlaybackControls(document, model);
  if (legacyContext.settings) model.setPlayback({ ...model.state.playback!, ...legacyContext.settings.playback });
  if (setup) model.setPlayback(setup.controls.playback);
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  run.body.append(status, error, actions, speedLabel, speed, time, progress.element, playback.element);
  view.append(run.element);
  const workspace = createSection(document, {
    id: 'core-preview',
    title: '작업 공간',
    description: '현재 자세와 수치 상태를 함께 확인하세요.'
  });
  const scene = createScene(document);
  const compatibility = createCompatibilityTools(document, () => toCanonicalPlanar(model.state.config));
  const values = element(document, 'dl', 'product-detail-list');
  const energy = element(document, 'dd', ''),
    angularVelocity = element(document, 'dd', ''),
    drift = element(document, 'dd', '');
  values.append(
    element(document, 'dt', '', '각속도 (rad/s)'),
    angularVelocity,
    element(document, 'dt', '', '운동 / 위치 / 총 에너지 (J)'),
    energy,
    element(document, 'dt', '', '초기 총에너지 대비 변화 (J)'),
    drift
  );
  workspace.body.append(scene.element, values, compatibility.element);
  const dock = createCoreAnalysis(document, model);
  const inspector = createCoreInspector(document, model, () => {
    dock.invalidate();
    compatibility.invalidate();
  });
  function restore(config: PlanarConfig, timing?: ProductRuntimeTiming) {
    if (dock.busy) throw new Error('진행 중인 분석을 먼저 취소하세요. 현재 실험은 변경하지 않았습니다.');
    compatibility.invalidate();
    dock.invalidate();
    model.configure(config, timing ? { ...(model.state.playback ?? DEFAULT_PLAYBACK), ...timing } : undefined);
    inspector.sync();
    dock.sync();
  }
  const files = createCoreFiles(
    document,
    model,
    restore,
    () => model.state.valid && model.state.status !== 'running' && dock.valid && !dock.busy,
    () => nativeSetup.shareRoute()
  );
  const history = createRunHistory(document, {
    config: () => model.state.config,
    samples: () => model.state.samples,
    pause: () => model.pause(),
    restart: restore
  });
  const nativeDisplay = createNativeDisplay(document, model, setup?.controls.render ?? legacyContext.settings?.display);
  const nativeSetup = createNativeSetupPanel(document, {
    experiment: () => toCanonicalPlanar(model.state.config),
    canUse: () => model.state.valid && model.state.status !== 'running' && !dock.busy,
    playback: () => model.state.playback ?? DEFAULT_PLAYBACK,
    render: () => nativeDisplay.settings(),
    angleUnit: () => (document.documentElement.dataset.productAngleUnit === 'deg' ? 'deg' : 'rad'),
    initial: setup?.controls ?? legacyContext.settings
  });
  const angleChange = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.id.endsWith('-display-unit')) return;
    const unit = target.value === 'deg' ? 'deg' : 'rad';
    document.documentElement.dataset.productAngleUnit = unit;
    inspector.setDisplayUnit(unit);
  };
  inspector.element.addEventListener('change', angleChange);
  const phaseSpace = createPhaseSpace3D(document, {
    samples: () => model.state.samples,
    sample: () => model.state.sample,
    experiment: () => toCanonicalPlanar(model.state.config)
  });
  const phaseDensity = createPhaseDensity(document, {
    samples: () => model.state.samples,
    sample: () => model.state.sample,
    experiment: () => toCanonicalPlanar(model.state.config)
  });
  const legacyPanel = experiment ? createLegacyLinkContextPanel(document, legacyContext, experiment) : undefined;
  workspace.body.append(history.element, nativeDisplay.element);
  workspace.body.append(nativeSetup.element);
  workspace.body.append(phaseSpace.element);
  workspace.body.append(phaseDensity.element);
  if (legacyPanel) workspace.body.append(legacyPanel.element);
  const coreDiagnostics = createDiagnostics(document, {
    experiment: () => toCanonicalPlanar(model.state.config),
    samples: () => model.state.samples,
    canRun: () => model.state.valid && model.state.status !== 'running' && !dock.busy,
    saveDiagnostic(entry) {
      const analyses = model.state.config.analyses ?? [];
      const index = analyses.findIndex((item) => item.id === entry.id);
      model.setAnalyses(index < 0 ? [...analyses, entry] : analyses.map((item, i) => (i === index ? entry : item)));
    }
  });
  dock.element.append(coreDiagnostics.element);
  const structure = createStructureDiagnosticsPanel(document, {
    experiment: () => toCanonicalPlanar(model.state.config),
    canRun: () => model.state.valid && model.state.status !== 'running' && !dock.busy
  });
  dock.element.append(structure.element);
  const acceleration = createRuntimeAccelerationPanel(document, {
    experiment: () => toCanonicalPlanar(model.state.config),
    canRun: () => model.state.valid && model.state.status !== 'running' && !dock.busy
  });
  dock.element.append(acceleration.element);
  files.tray.append(coreDiagnostics.experiments);
  const nativeDesign = createNativeDesignPanel(document, {
    experiment: () => toCanonicalPlanar(model.state.config),
    canRun: () => model.state.valid && model.state.status !== 'running' && !dock.busy
  });
  nativeDesign.element.id = 'native-experiment-design';
  files.tray.append(nativeDesign.element);
  const tabs = createTabs(document, {
    id: 'lab-panels',
    label: '실험실 패널',
    items: [
      { id: 'workspace', label: '작업 공간', content: workspace.element },
      { id: 'inspector', label: '조건', content: inspector.element },
      { id: 'analysis', label: '분석', content: dock.element },
      { id: 'tray', label: '보관함', content: files.tray },
      { id: 'export', label: '내보내기', content: files.exports }
    ]
  });
  view.append(tabs.element);
  function update() {
    const state = model.state;
    const currentSpeed = String(state.speed);
    if (![...speed.options].some((option) => option.value === currentSpeed)) {
      for (const option of speed.querySelectorAll('[data-custom-speed]')) option.remove();
      const option = element(document, 'option', '', `${currentSpeed}×`);
      option.value = currentSpeed;
      option.dataset.customSpeed = 'true';
      speed.append(option);
    }
    speed.value = currentSpeed;
    view.dataset.labStatus = state.status;
    const text = state.valid ? labels[state.status] : '입력한 조건을 수정하세요.';
    if (status.textContent !== text) status.textContent = text;
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid || dock.busy;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || dock.busy;
    reset.disabled = dock.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status);
    time.value = `t = ${state.sample.time.toFixed(4)} s`;
    time.dataset.time = String(state.sample.time);
    const fraction = Math.max(
      0,
      Math.min(100, ((state.sample.time - (state.config.startTime ?? 0)) / state.config.duration) * 100)
    );
    progress.setValue(fraction, `${state.samples.length}개 기록 표본 · ${fraction.toFixed(1)}%`);
    scene.update(state.sample, state.config);
    compatibility.updateAudio({
      running: state.status === 'running',
      omega1: state.sample.state[2],
      omega2: state.sample.state[3]
    });
    angularVelocity.textContent = `ω₁ ${state.sample.state[2]!.toFixed(5)} · ω₂ ${state.sample.state[3]!.toFixed(5)}`;
    energy.textContent = `${state.sample.energy.KE.toFixed(6)} / ${state.sample.energy.PE.toFixed(6)} / ${state.sample.energy.total.toFixed(6)}`;
    drift.textContent = `${(state.sample.energy.total - state.samples[0]!.energy.total).toExponential(4)}${state.config.gamma > 0 ? ' (감쇠에 의한 소산 포함)' : ''}`;
    inspector.update();
    dock.update();
    files.update();
    coreDiagnostics.update();
    history.update();
    playback.update();
    nativeDisplay.update();
    nativeSetup.update();
    phaseSpace.update();
    phaseDensity.update();
  }
  const unsubscribe = model.subscribe(update);
  const unbindRuntime = bindProductRuntime(
    document,
    createWorkspaceRuntimeProvider({
      model,
      readTiming: () => ({
        ...(model.state.playback ?? DEFAULT_PLAYBACK),
        stepsPerFrame: model.state.effectiveStepsPerFrame ?? (model.state.playback ?? DEFAULT_PLAYBACK).stepsPerFrame
      }),
      restore,
      reset() {
        if (dock.busy) throw new Error('진행 중인 분석을 먼저 취소하세요.');
        dock.invalidate();
        compatibility.invalidate();
        model.reset();
      }
    })
  );
  const unsubscribeDock = dock.subscribe(update);
  dock.sync();
  update();
  return {
    element: view,
    dispose() {
      unsubscribe();
      unbindRuntime();
      unsubscribeDock();
      model.cancel();
      dock.dispose();
      coreDiagnostics.dispose();
      nativeDesign.dispose();
      structure.dispose();
      acceleration.dispose();
      compatibility.dispose();
      history.dispose();
      nativeDisplay.dispose();
      nativeSetup.dispose();
      inspector.element.removeEventListener('change', angleChange);
      phaseSpace.dispose();
      phaseDensity.dispose();
      legacyPanel?.dispose();
      legacyContext.dispose();
      if (priorAngleUnit === undefined) delete document.documentElement.dataset.productAngleUnit;
      else document.documentElement.dataset.productAngleUnit = priorAngleUnit;
      files.dispose();
      tabs.dispose();
    }
  };
}
