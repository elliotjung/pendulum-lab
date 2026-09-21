import { element, link, pageHeading } from '../../app/dom';
import { createButton, createSection, createProgress } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultConstraintConfig,
  fromCanonicalConstraint,
  type ConstraintConfig,
  type ConstraintSystemId
} from '../../adapters/physics/constraint';
import { createConstraintModel, type ConstraintStatus } from './constraint-model';
import { createConstraintInspector } from './constraint-inspector';
import {
  createConstraintScene,
  constraintPhaseLabel,
  constraintTrajectoryPlot,
  exportConstraintFigure,
  type ConstraintPlotKind
} from './constraint-plots';
import { createConstraintFiles } from './constraint-files';
import { loadConstraintConfig } from './constraint-storage';

const labels: Record<ConstraintStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: ConstraintConfig; tray: ConstraintConfig[] }>>();

export function createConstraintWorkspace(
  document: Document,
  system: SystemDefinition,
  experiment?: ExperimentStateV1
) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace constraint-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 유연·구속 계'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultConstraintConfig(system.id as ConstraintSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalConstraint(experiment);
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
      initial = loadConstraintConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      warning = `저장된 설정을 읽지 못해 기본 설정을 표시합니다. 원본은 보존되며 이 저장 키를 덮어쓰지 않습니다. ${cause instanceof Error ? cause.message : ''}`;
    }
  let session = sessions.get(document);
  if (!session) {
    session = new Map();
    sessions.set(document, session);
  }
  const key = experiment ? `${system.id}:${JSON.stringify(experiment)}` : system.id;
  const retained = session.get(key);
  initial = retained?.config ?? initial;
  const tray = retained?.tray ?? [];
  const model = createConstraintModel(initial);
  const spring = initial.systemId === 'system:spring';
  const double = initial.systemId === 'system:double-string';
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      spring
        ? '탄성력은 인장을 양수, 압축을 음수로 표시합니다. 길이 r=0은 극좌표 특이점입니다. 화면 이동 시 계산을 종료하고 설정만 보존합니다.'
        : double
          ? '이중 줄의 느슨한 구간과 재포획은 기존 근사 모델을 사용합니다. 모드 전환과 위치 보정에서 총에너지가 증가할 수도 있으므로, 기록된 포획 손실을 전체 에너지 차이와 동일시하지 마세요. 길이와 힘은 m·N, 에너지는 J입니다. 화면 이동 시 계산을 종료하고 설정만 보존합니다.'
          : '줄은 당기는 힘만 지지합니다. 느슨한 구간에는 자유 비행하며 다시 팽팽해질 때 에너지를 잃습니다. 길이와 힘은 m·N, 에너지는 J입니다. 화면 이동 시 계산을 종료하고 설정만 보존합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(element(document, 'p', 'lab-preview-note', '공유한 초기조건·적분기·분석 설정을 복원했습니다.'));

  const run = createSection(document, { id: 'constraint-run', title: '실행 제어' });
  const status = element(document, 'p', 'lab-run-status');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = element(document, 'div', 'lab-run-actions');
  const start = createButton(document, { label: '실행', onClick: () => model.run() });
  const pause = createButton(document, { label: '일시정지', variant: 'secondary', onClick: () => model.pause() });
  const step = createButton(document, { label: '한 단계', variant: 'secondary', onClick: () => model.step() });
  const reset = createButton(document, {
    label: '처음으로',
    variant: 'secondary',
    onClick() {
      model.configure(model.state.config);
      inspector.sync();
    }
  });
  const cancel = createButton(document, { label: '실행 취소', variant: 'secondary', onClick: () => model.cancel() });
  actions.append(start, pause, step, reset, cancel);
  const speedLabel = element(document, 'label', 'ds-field__label', '재생 속도');
  speedLabel.htmlFor = 'constraint-speed';
  const speed = element(document, 'select', 'ds-field__control');
  speed.id = 'constraint-speed';
  for (const value of [0.25, 1, 4]) {
    const option = element(document, 'option', '', `${value}×`);
    option.value = String(value);
    speed.append(option);
  }
  speed.value = '1';
  speed.addEventListener('change', () => model.setSpeed(Number(speed.value)));
  const time = element(document, 'output', 'core-time');
  time.id = 'lab-time';
  time.setAttribute('aria-label', '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'constraint-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'constraint-sampling';
  run.body.append(status, error, actions, speedLabel, speed, time, progress.element, sampling);
  view.append(run.element);

  const workspace = createSection(document, {
    id: 'constraint-preview',
    title: '작업 공간',
    description: '길이와 힘, 구속 상태를 함께 확인하세요.'
  });
  const phase = element(document, 'p', 'constraint-phase');
  phase.id = 'constraint-phase';
  phase.setAttribute('role', 'status');
  const scene = createConstraintScene(document);
  const energy = element(document, 'p', 'constraint-energy');
  const warnings = element(document, 'p', 'lab-preview-note');
  warnings.id = 'constraint-warnings';
  warnings.setAttribute('role', 'status');
  const states = element(document, 'div', 'constraint-state-grid');
  states.id = 'constraint-link-states';
  workspace.body.append(phase, scene.element, energy, warnings, states);
  const events = createSection(document, {
    id: 'constraint-events',
    title: '사건 타임라인',
    description: spring
      ? '용수철은 연속 탄성 운동이며 줄의 이완·재포획 사건이 없습니다.'
      : '각 적분 단계에서 수집한 이완·포획 사건입니다. 시각과 잔차는 기존 엔진의 기록값이며 표본 간 선형 보간값이 아닙니다.'
  });
  const eventSummary = element(document, 'p', 'lab-muted');
  eventSummary.id = 'constraint-event-summary';
  const eventScroll = element(document, 'div', 'constraint-event-scroll');
  eventScroll.setAttribute('role', 'region');
  eventScroll.setAttribute('aria-label', '이완과 포획 사건 목록');
  eventScroll.tabIndex = 0;
  const table = element(document, 'table', 'constraint-event-table');
  table.append(
    element(
      document,
      'caption',
      '',
      '잔차는 이완 시 장력의 크기 (N), 포획 시 길이 오차 (m)입니다. 초기조건 판정 사건은 시작 시각에 표시합니다.'
    )
  );
  const thead = element(document, 'thead', ''),
    tr = element(document, 'tr', '');
  for (const title of ['순서', '시각 (s)', '사건', '줄', '손실 (J)', '잔차']) {
    const th = element(document, 'th', '', title);
    th.scope = 'col';
    tr.append(th);
  }
  thead.append(tr);
  const eventRows = element(document, 'tbody', '');
  eventRows.id = 'constraint-event-rows';
  table.append(thead, eventRows);
  eventScroll.append(table);
  let page = 0,
    lastEventKey = '';
  const pageSize = 20;
  const paging = element(document, 'div', 'lab-inline-actions');
  const previous = createButton(document, {
    label: '이전 사건',
    variant: 'secondary',
    onClick() {
      page--;
      updateEvents();
    }
  });
  const next = createButton(document, {
    label: '다음 사건',
    variant: 'secondary',
    onClick() {
      page++;
      updateEvents();
    }
  });
  const pageStatus = element(document, 'p', 'lab-muted');
  pageStatus.setAttribute('role', 'status');
  paging.append(previous, next, pageStatus);
  events.body.append(eventSummary, eventScroll, paging);
  workspace.body.append(events.element);
  function updateEvents() {
    const values = model.state.events;
    page = Math.max(0, Math.min(page, Math.ceil(values.length / pageSize) - 1));
    const key = `${model.state.revision}:${values.length}:${values.at(-1)?.time ?? ''}:${page}:${model.state.sample.captureLoss}`;
    if (lastEventKey === key) return;
    lastEventKey = key;
    eventSummary.textContent = values.length
      ? `${values.length}개 사건 · 누적 포획 손실 ${model.state.sample.captureLoss.toPrecision(6)} J. 같은 시각의 사건도 발생 순서를 유지합니다.`
      : '기록된 이완·포획 사건이 없습니다.';
    eventScroll.hidden = !values.length;
    paging.hidden = !values.length;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= values.length;
    pageStatus.textContent = `${page + 1} / ${Math.max(1, Math.ceil(values.length / pageSize))} 페이지`;
    eventRows.replaceChildren(
      ...values.slice(page * pageSize, (page + 1) * pageSize).map((event) => {
        const row = element(document, 'tr', '');
        row.dataset.eventType = event.type;
        row.dataset.link = event.link;
        row.dataset.time = String(event.time);
        const number = element(document, 'th', '', String(event.sequence));
        number.scope = 'row';
        row.append(
          number,
          ...[
            event.time.toPrecision(7),
            `${event.type === 'slack' ? '이완 · slack' : '재포획 · capture'}${event.source === 'initial-condition' ? ' (초기조건)' : ''}`,
            event.link === 'outer' ? '바깥' : event.link === 'both' ? '두 줄' : '안쪽',
            event.energyLoss.toPrecision(5),
            `${event.residual.toPrecision(4)} ${event.residualUnit}`
          ].map((value) => element(document, 'td', '', value))
        );
        return row;
      })
    );
  }

  const analysis = createSection(document, {
    id: 'constraint-analysis',
    title: '분석',
    description:
      '길이·힘·에너지와 Cartesian 궤적을 확인합니다. 표본을 잇는 선은 포획 순간의 불연속을 정확히 재현하지 않습니다. 사건 CSV를 함께 확인하세요.'
  });
  const kindLabel = element(document, 'label', 'ds-field__label', '그래프 종류');
  kindLabel.htmlFor = 'constraint-plot-kind';
  const kind = element(document, 'select', 'ds-field__control');
  kind.id = 'constraint-plot-kind';
  for (const [id, text] of [
    ['length', '길이 / 시간'],
    ['tension', spring ? '탄성력 / 시간' : '장력 / 시간'],
    ['energy', '에너지'],
    ['trajectory', 'Cartesian 궤적']
  ]) {
    const option = element(document, 'option', '', text);
    option.value = id!;
    kind.append(option);
  }
  const linkLabel = element(document, 'label', 'ds-field__label', '그래프로 볼 링크');
  linkLabel.htmlFor = 'constraint-plot-link';
  const selected = element(document, 'select', 'ds-field__control');
  selected.id = 'constraint-plot-link';
  for (let i = 0; i < model.state.sample.positions.length; i++) {
    const option = element(document, 'option', '', `링크 ${i + 1}`);
    option.value = String(i);
    selected.append(option);
  }
  const plot = element(document, 'div', ''),
    description = element(document, 'p', 'constraint-plot-description');
  analysis.body.append(kindLabel, kind, linkLabel, selected, description, plot);
  analysis.body.append(
    element(
      document,
      'p',
      'lab-muted',
      spring
        ? '탄성력 F=k(r−ℓ₀): 양수는 인장, 음수는 압축입니다.'
        : `느슨한 줄의 장력은 0입니다. 누적 포획 손실은 엔진이 사건에서 기록한 값이며 감쇠 손실은 포함하지 않습니다.${double ? ' 근사 모드 전환과 위치 보정으로 총에너지가 증가할 수도 있어, 누적 포획 손실로 전체 에너지 수지를 검증할 수 없습니다.' : ''} 줄의 이완을 포함하는 궤적에 매끄러운 강체 계의 카오스 분석을 적용하지 않습니다.`
    )
  );
  let lastPlotKey = '';
  function updatePlot(force = false) {
    const state = model.state,
      index = Number(selected.value),
      plotKind = kind.value as ConstraintPlotKind;
    const key = `${state.revision}:${state.sample.step}:${plotKind}:${index}`;
    if (!force && key === lastPlotKey) return;
    lastPlotKey = key;
    selected.disabled = plotKind === 'energy';
    plot.replaceChildren(constraintTrajectoryPlot(document, state.samples, plotKind, index));
    const values = state.samples.map((sample) =>
      plotKind === 'length'
        ? sample.lengths[index]!
        : plotKind === 'tension'
          ? sample.tensions[index]!
          : plotKind === 'energy'
            ? sample.energy.total
            : sample.positions[index]!.y
    );
    const range = `${Math.min(...values).toPrecision(5)}–${Math.max(...values).toPrecision(5)}`;
    description.textContent =
      plotKind === 'trajectory'
        ? `질점 ${index + 1}: 가로축 x (m), 세로축 y (m). 기록 y 범위 ${range} m. 좌표와 속도의 원자료는 궤적 CSV에 있습니다.`
        : `가로축 시간 t (s), 세로축 ${plotKind === 'length' ? '길이 r (m)' : plotKind === 'tension' ? '힘 F (N)' : '에너지 E (J)'}. 기록 범위 ${range} ${plotKind === 'length' ? 'm' : plotKind === 'tension' ? 'N' : 'J'}.`;
    if (plotKind === 'energy')
      description.textContent += ` 파란 실선은 총에너지, 갈색 파선은 누적 포획 손실입니다. 마지막 손실 ${state.sample.captureLoss.toPrecision(5)} J.`;
  }
  kind.addEventListener('change', () => updatePlot());
  selected.addEventListener('change', () => updatePlot());
  const inspector = createConstraintInspector(document, model, () => {
    lastPlotKey = '';
    lastEventKey = '';
    page = 0;
    updatePlot(true);
    updateEvents();
  });
  const files = createConstraintFiles(
    document,
    model,
    (config) => {
      model.configure(config);
      inspector.sync();
      lastEventKey = '';
      page = 0;
      updatePlot(true);
      updateEvents();
    },
    () => model.state.valid && model.state.status !== 'running' && !model.state.busy,
    tray,
    () =>
      exportConstraintFigure(
        document,
        model.state.config,
        model.state.samples,
        kind.value as ConstraintPlotKind,
        Number(selected.value)
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
    onChange: () => updatePlot()
  });
  view.append(tabs.element);
  function update() {
    const state = model.state;
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    const statusText = state.valid
      ? `${labels[state.status]}${state.busy && state.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '입력한 조건을 수정하세요.';
    if (status.textContent !== statusText) status.textContent = statusText;
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || state.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = `t = ${state.sample.time.toFixed(4)} s`;
    time.dataset.time = String(state.sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 표본`);
    sampling.textContent = `기록 간격 ${state.sampleStride}단계 (${(state.sampleStride * state.config.step).toPrecision(4)} s) · 최대 ${state.maxSamples}개 표본. 사건은 모든 적분 단계에서 수집합니다. CSV에 마지막 수신 상태를 포함합니다.`;
    const phaseText = constraintPhaseLabel(state.sample.phase);
    if (phase.textContent !== phaseText) phase.textContent = phaseText;
    phase.dataset.phase = state.sample.phase;
    scene.update(state.sample, state.config);
    energy.textContent = `운동 ${state.sample.energy.KE.toPrecision(6)} J · 위치 ${state.sample.energy.PE.toPrecision(6)} J · 총 ${state.sample.energy.total.toPrecision(6)} J · 누적 포획 손실 ${state.sample.captureLoss.toPrecision(6)} J`;
    const warningText = state.sample.warnings.join(' ');
    if (warnings.textContent !== warningText) warnings.textContent = warningText;
    warnings.hidden = !warningText;
    const count = state.sample.lengths.length;
    if (states.children.length !== count)
      states.replaceChildren(
        ...Array.from({ length: count }, (_, index) => {
          const card = element(document, 'article', 'constraint-state-card');
          card.append(
            element(document, 'h3', '', spring ? '용수철' : `줄 ${index + 1}`),
            element(document, 'p', ''),
            element(document, 'p', ''),
            element(document, 'p', ''),
            element(document, 'p', '')
          );
          return card;
        })
      );
    for (let index = 0; index < count; index++) {
      const children = states.children[index]!.children;
      children[1]!.textContent = `길이 ${state.sample.lengths[index]!.toPrecision(6)} m`;
      children[2]!.textContent = `${spring ? '탄성력 (인장 +)' : '장력'} ${state.sample.tensions[index]!.toPrecision(6)} N`;
      children[3]!.textContent = `구속 위반 ${state.sample.constraintErrors[index]!.toPrecision(4)} m`;
      children[4]!.textContent = spring
        ? `자연 길이와의 차이 ${state.sample.gaps[index]!.toPrecision(5)} m`
        : `최대 길이와의 거리 차이 ${state.sample.gaps[index]!.toPrecision(5)} m (느슨할 때의 단축은 위반 아님)`;
    }
    inspector.update();
    files.update();
    updateEvents();
    if (tabs.selectedId === 'analysis') updatePlot();
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
