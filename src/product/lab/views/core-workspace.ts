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

const sessions = new WeakMap<Document, Map<string, CoreModel>>();
const labels: Record<CoreStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};

export function createCoreWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
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
  const key = experiment ? `${system.id}:${JSON.stringify(experiment)}` : system.id;
  let cached = session.get(key);
  if (!cached) {
    cached = createCoreModel(initial);
    session.set(key, cached);
  }
  const model = cached;
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
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  run.body.append(status, error, actions, speedLabel, speed, time, progress.element);
  view.append(run.element);
  const workspace = createSection(document, {
    id: 'core-preview',
    title: '작업 공간',
    description: '현재 자세와 수치 상태를 함께 확인하세요.'
  });
  const scene = createScene(document);
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
  workspace.body.append(scene.element, values);
  const dock = createCoreAnalysis(document, model);
  const inspector = createCoreInspector(document, model, () => dock.invalidate());
  function restore(config: PlanarConfig) {
    dock.invalidate();
    model.configure(config);
    inspector.sync();
    dock.sync();
  }
  const files = createCoreFiles(
    document,
    model,
    restore,
    () => model.state.valid && model.state.status !== 'running' && dock.valid && !dock.busy
  );
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
    angularVelocity.textContent = `ω₁ ${state.sample.state[2]!.toFixed(5)} · ω₂ ${state.sample.state[3]!.toFixed(5)}`;
    energy.textContent = `${state.sample.energy.KE.toFixed(6)} / ${state.sample.energy.PE.toFixed(6)} / ${state.sample.energy.total.toFixed(6)}`;
    drift.textContent = `${(state.sample.energy.total - state.samples[0]!.energy.total).toExponential(4)}${state.config.gamma > 0 ? ' (감쇠에 의한 소산 포함)' : ''}`;
    inspector.update();
    dock.update();
    files.update();
  }
  const unsubscribe = model.subscribe(update);
  const unsubscribeDock = dock.subscribe(update);
  dock.sync();
  update();
  return {
    element: view,
    dispose() {
      unsubscribe();
      unsubscribeDock();
      model.cancel();
      dock.dispose();
      files.dispose();
      tabs.dispose();
    }
  };
}
