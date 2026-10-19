import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultNonlinearConfig,
  fromCanonicalNonlinear,
  nonlinearStateFields,
  nonlinearWarnings,
  type NonlinearConfig,
  type NonlinearSystemId
} from '../../adapters/physics/nonlinear';
import { createNonlinearModel, type NonlinearStatus } from './nonlinear-model';
import { createNonlinearInspector } from './nonlinear-inspector';
import { createNonlinearFiles } from './nonlinear-files';
import { loadNonlinearConfig, nonlinearIsNormalized } from './nonlinear-storage';
import {
  nonlinearPlotKinds,
  nonlinearPlotDescription,
  nonlinearTrajectoryPlot,
  exportNonlinearFigure,
  type NonlinearPlotKind
} from './nonlinear-plots';

const labels: Record<NonlinearStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: NonlinearConfig; tray: NonlinearConfig[] }>>();

export function createNonlinearWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace nonlinear-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 비선형 발진과 지연'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultNonlinearConfig(system.id as NonlinearSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalNonlinear(experiment);
    if (!parsed.ok) {
      const alert = element(
        document,
        'p',
        'ds-field__error',
        `공유 설정을 실행할 수 없습니다. ${parsed.issues.map((issue) => issue.message).join(' ')} 원본 링크를 보존하세요.`
      );
      alert.setAttribute('role', 'alert');
      view.append(alert, link(document, '기본 설정으로 시작', `#/lab/${system.id.slice(7)}`));
      return { element: view, dispose() {} };
    }
    initial = parsed.value;
  } else
    try {
      initial = loadNonlinearConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      warning = `저장된 설정을 읽지 못해 기본 설정을 표시합니다. 원본은 보존되며 이 저장 키를 덮어쓰지 않습니다. ${cause instanceof Error ? cause.message : ''}`;
    }
  let session = sessions.get(document);
  if (!session) {
    session = new Map();
    sessions.set(document, session);
  }
  const key = experiment ? `${system.id}:${JSON.stringify(experiment)}` : system.id,
    retained = session.get(key);
  initial = retained?.config ?? initial;
  const tray = retained?.tray ?? [],
    model = createNonlinearModel(initial),
    id = initial.systemId,
    normalized = nonlinearIsNormalized(id);
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      normalized
        ? 'x・v・τ와 계수는 정규화 값입니다. τ를 실제 초, 진단량을 J로 해석하지 마세요. 구동 위상은 rad로 보존합니다.'
        : 'SI와 rad를 사용합니다. 각주파수는 rad/s입니다. 진단량은 표시한 단위를 따르며 보존량과 구별합니다.'
    ),
    element(
      document,
      'p',
      'lab-muted',
      '화면을 떠나면 계산을 종료합니다. 저장하거나 보관한 초기조건은 그대로 유지합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(element(document, 'p', 'lab-preview-note', '공유한 모델·초기조건·과거 이력·실행 조건을 복원했습니다.'));
  function selector(key: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    control.id = `nonlinear-${key}`;
    label.htmlFor = control.id;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    return { label, control };
  }
  const run = createSection(document, { id: 'nonlinear-run', title: '실행 제어' }),
    status = element(document, 'p', 'lab-run-status'),
    error = element(document, 'p', 'ds-field__error');
  status.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = element(document, 'div', 'lab-run-actions');
  const start = createButton(document, { label: '실행', onClick: () => model.run() }),
    pause = createButton(document, { label: '일시정지', variant: 'secondary', onClick: () => model.pause() }),
    step = createButton(document, { label: '한 단계', variant: 'secondary', onClick: () => model.step() }),
    reset = createButton(document, {
      label: '처음으로',
      variant: 'secondary',
      onClick() {
        model.configure(model.state.config);
        inspector.sync();
      }
    }),
    cancel = createButton(document, { label: '실행 취소', variant: 'secondary', onClick: () => model.cancel() });
  actions.append(start, pause, step, reset, cancel);
  const speed = selector('speed', '재생 속도', [
    ['0.25', '0.25×'],
    ['1', '1×'],
    ['4', '4×']
  ]);
  speed.control.value = '1';
  speed.control.addEventListener('change', () => model.setSpeed(Number(speed.control.value)));
  const time = element(document, 'output', 'core-time');
  time.id = 'lab-time';
  time.setAttribute('aria-label', normalized ? '현재 정규화 시간' : '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'nonlinear-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'nonlinear-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, time, progress.element, sampling);
  view.append(run.element);

  const workspace = createSection(document, {
    id: 'nonlinear-preview',
    title: '작업 공간',
    description: '기존 엔진의 상태와 모델별 진단을 같은 기록에서 확인합니다.'
  });
  const scene = element(document, 'div', 'nonlinear-scene'),
    energy = element(document, 'p', 'nonlinear-energy'),
    signals = element(document, 'p', 'nonlinear-signals'),
    warnings = element(document, 'p', 'lab-preview-note'),
    states = element(document, 'div', 'nonlinear-state-grid'),
    phenomenon = element(document, 'div', 'nonlinear-phenomenon'),
    diagnostics = element(document, 'p', 'nonlinear-diagnostics');
  energy.id = 'nonlinear-energy';
  signals.id = 'nonlinear-signals';
  warnings.id = 'nonlinear-warnings';
  states.id = 'nonlinear-state-rows';
  phenomenon.id = 'nonlinear-phenomenon';
  diagnostics.id = 'nonlinear-diagnostics';
  const nativeKind: NonlinearPlotKind =
    id === 'system:van-der-pol'
      ? 'phase'
      : id === 'system:pyragas'
        ? 'history'
        : id === 'system:friction'
          ? 'friction'
          : id === 'system:mathieu'
            ? 'stability'
            : 'potential';
  const nativeDescription = element(document, 'p', 'lab-muted', nonlinearPlotDescription(initial, nativeKind));
  const carry = createButton(document, {
    label: '현재 상태·이력으로 계속',
    variant: 'secondary',
    onClick() {
      const state = model.state;
      if (!state.restartConfig || state.status === 'running' || state.busy) return;
      model.configure(state.restartConfig);
      inspector.sync();
      updatePlot(true);
      carryNotice.textContent =
        '현재 상태와 전체 지연 꼬리를 새 초기조건으로 적용했습니다. 같은 관찰 길이로 계속 실행하거나 저장·공유·JSON 내보내기를 사용할 수 있습니다.';
    }
  });
  carry.id = 'nonlinear-continue-history';
  carry.hidden = id !== 'system:pyragas';
  const carryNotice = element(document, 'p', 'lab-muted');
  carryNotice.setAttribute('role', 'status');
  workspace.body.append(
    scene,
    energy,
    signals,
    diagnostics,
    warnings,
    element(document, 'h3', '', '현재 상태'),
    states,
    carry,
    carryNotice,
    element(document, 'h3', '', nonlinearPlotKinds(initial).find(([value]) => value === nativeKind)![1]),
    nativeDescription,
    phenomenon
  );
  const NS = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(NS, 'svg'),
    rod = document.createElementNS(NS, 'path'),
    bob = document.createElementNS(NS, 'circle'),
    pivot = document.createElementNS(NS, 'circle');
  svg.setAttribute('viewBox', '0 0 640 240');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${system.name.ko} 현재 위치 · 화면 크기에 맞춰 좌표 축척을 조절합니다`);
  const title = document.createElementNS(NS, 'title');
  title.textContent = `${system.name.ko} 현재 위치`;
  rod.setAttribute('fill', 'none');
  rod.setAttribute('stroke', '#075985');
  rod.setAttribute('stroke-width', '4');
  bob.setAttribute('r', '10');
  bob.setAttribute('fill', '#9a3412');
  pivot.setAttribute('r', '5');
  pivot.setAttribute('fill', '#166534');
  pivot.setAttribute('data-role', 'pivot');
  svg.append(title, rod, bob, pivot);
  scene.append(svg);
  const sceneDescription = element(
    document,
    'p',
    'lab-muted',
    '형상은 현재 위치를 보여 주며 축척은 화면 크기에 맞춥니다. 실제 수치는 현재 상태와 CSV에 표시합니다.'
  );
  scene.append(sceneDescription);
  function updateScene() {
    const state = model.state,
      sample = state.sample,
      point = sample.positions[0] ?? sample.phase,
      pendulum = id === 'system:kapitza' || id === 'system:pyragas',
      pivotY = id === 'system:kapitza' ? state.config.parameters.driveAmplitude! * Math.cos(sample.state[2]!) : 0,
      extent = Math.max(1, Math.abs(point.x), Math.abs(point.y), Math.abs(pivotY), state.config.parameters.length ?? 0),
      scale = 90 / extent,
      x = 320 + point.x * scale,
      y = pendulum ? 120 - point.y * scale : 120;
    rod.setAttribute(
      'd',
      pendulum ? `M320 ${120 - pivotY * scale} L${x} ${y}` : `M80 120 H560 M320 105 V135 L${x} ${y}`
    );
    bob.setAttribute('cx', String(x));
    bob.setAttribute('cy', String(y));
    pivot.setAttribute('cx', '320');
    pivot.setAttribute('cy', String(120 - pivotY * scale));
    pivot.style.display = pendulum ? '' : 'none';
  }

  const analysis = createSection(document, {
    id: 'nonlinear-analysis',
    title: '분석',
    description: '모델별 수치 가정과 단위를 확인한 뒤 기록 궤적을 비교하세요.'
  });
  const kind = selector('plot-kind', '그래프 종류', nonlinearPlotKinds(initial)),
    selected = selector(
      'plot-state',
      '그래프로 볼 상태',
      nonlinearStateFields(id).map((field, i) => [String(i), field.label])
    ),
    description = element(document, 'p', 'lab-muted'),
    plot = element(document, 'div', '');
  analysis.body.append(kind.label, kind.control, selected.label, selected.control, description, plot);
  let lastPlotKey = '',
    lastNativeKey = '';
  function replacePlot(host: HTMLElement, figure: SVGSVGElement) {
    const caption = element(document, 'p', 'lab-muted nonlinear-plot-caption', figure.getAttribute('aria-label') ?? '');
    host.replaceChildren(figure, caption);
  }
  function updatePlot(force = false) {
    const state = model.state,
      k = kind.control.value as NonlinearPlotKind,
      index = Number(selected.control.value),
      next = `${state.revision}:${state.sample.step}:${Boolean(state.sample.stability)}:${k}:${index}`;
    if (!force && next === lastPlotKey) return;
    lastPlotKey = next;
    selected.control.disabled = k !== 'state';
    replacePlot(plot, nonlinearTrajectoryPlot(document, state.config, state.samples, k, index));
    description.textContent = nonlinearPlotDescription(state.config, k);
  }
  kind.control.addEventListener('change', () => updatePlot());
  selected.control.addEventListener('change', () => updatePlot());
  const inspector = createNonlinearInspector(document, model, () => updatePlot(true));
  const files = createNonlinearFiles(
    document,
    model,
    (config) => {
      model.configure(config);
      inspector.sync();
      updatePlot(true);
    },
    () => model.state.valid && model.state.status !== 'running' && !model.state.busy,
    tray,
    () =>
      exportNonlinearFigure(
        document,
        model.state.config,
        model.state.samples,
        kind.control.value as NonlinearPlotKind,
        Number(selected.control.value)
      )
  );
  const tabs = createTabs(document, {
    id: 'lab-panels',
    label: '실험실 패널',
    items: [
      { id: 'workspace', label: '작업 공간', content: workspace.element },
      { id: 'inspector', label: '조건', content: inspector.element },
      { id: 'analysis', label: '분석', content: analysis.element },
      { id: 'tray', label: '보관함', content: files.tray },
      { id: 'export', label: '내보내기', content: files.exports }
    ],
    onChange: () => {
      updatePlot();
      update();
    }
  });
  view.append(tabs.element);
  let updating = false;
  function update() {
    if (updating) return;
    updating = true;
    const state = model.state,
      sample = state.sample;
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    const statusText = state.valid
      ? `${labels[state.status]}${state.busy && state.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    if (status.textContent !== statusText) status.textContent = statusText;
    error.hidden = !state.error;
    if (error.textContent !== state.error) error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || state.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = normalized ? `τ = ${sample.time.toFixed(4)} (정규화)` : `t = ${sample.time.toFixed(4)} s`;
    time.dataset.time = String(sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 표본`);
    sampling.textContent = `기록 간격 ${state.sampleStride}단계 (${(state.sampleStride * state.config.step).toPrecision(4)} ${normalized ? '정규화 시간' : 's'}) · 최대 ${state.maxSamples}개 표본. 마지막 수신 상태를 CSV에 포함합니다.`;
    energy.textContent = `${sample.energyLabel}: ${sample.energy.toPrecision(6)} ${sample.energyUnit === '1' ? '(정규화)' : sample.energyUnit}`;
    signals.textContent =
      id === 'system:pyragas'
        ? `구동 각가속도 ${sample.forcing.toPrecision(5)} rad/s² · 지연 피드백 ${sample.feedback.toPrecision(5)} rad/s² · 표시 이력 ${sample.history.length}점`
        : id === 'system:friction'
          ? `구동 힘 ${sample.forcing.toPrecision(5)} N · 마찰력 ${sample.frictionForce.toPrecision(5)} N · 모드 ${sample.mode}`
          : id === 'system:kapitza'
            ? `지지대 변위 ${sample.forcing.toPrecision(5)} m`
            : `${id === 'system:van-der-pol' ? '비선형 감쇠 가속도' : id === 'system:mathieu' ? '복원 계수 변조 ε cos τ' : '구동 가속도'} ${sample.forcing.toPrecision(5)} (정규화)`;
    diagnostics.textContent =
      id === 'system:friction'
        ? `운동량 잔차 ${sample.momentumResidual.toPrecision(5)} N · 마찰 원뿔 잔차 ${sample.coneResidual.toPrecision(5)} N`
        : id === 'system:mathieu'
          ? sample.stability
            ? `Floquet: ${sample.stability.stable ? '허용오차 안의 안정 분류' : '불안정 분류'} · |ρ|max ${sample.stability.spectralRadius.toPrecision(7)} · |det M−1| ${sample.stability.determinantDrift.toPrecision(5)}`
            : 'Floquet 진단은 첫 실행 또는 한 단계 요청 후 worker에서 계산합니다.'
          : '';
    diagnostics.hidden = !diagnostics.textContent;
    const warningText = [...nonlinearWarnings(state.config), ...sample.warnings]
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' ');
    if (warnings.textContent !== warningText) warnings.textContent = warningText;
    states.replaceChildren(
      ...nonlinearStateFields(id).map((field, i) => {
        const card = element(document, 'article', 'nonlinear-state-card');
        card.append(
          element(document, 'h3', '', field.label),
          element(document, 'p', '', `${field.key} = ${sample.state[i]!.toPrecision(6)} ${field.unit}`)
        );
        return card;
      })
    );
    carry.disabled =
      !state.restartConfig || state.status === 'running' || state.busy || sample.step === 0 || !state.valid;
    updateScene();
    inspector.update();
    files.update();
    const nativeKey = `${state.revision}:${sample.step}:${Boolean(sample.stability)}`;
    if (tabs.selectedId === 'workspace' && nativeKey !== lastNativeKey) {
      lastNativeKey = nativeKey;
      replacePlot(phenomenon, nonlinearTrajectoryPlot(document, state.config, state.samples, nativeKind));
    }
    if (tabs.selectedId === 'analysis') updatePlot();
    updating = false;
  }
  const unsubscribe = model.subscribe(update);
  update();
  updatePlot(true);
  return {
    element: view,
    dispose() {
      session!.delete(key);
      session!.set(key, { config: model.state.config, tray });
      while (session!.size > 8) session!.delete(session!.keys().next().value!);
      unsubscribe();
      model.dispose();
      files.dispose();
      tabs.dispose();
    }
  };
}
