import { element, link, pageHeading } from '../../app/dom';
import { createButton, createSection, createProgress } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultChainConfig,
  fromCanonicalChain,
  type ChainConfig,
  type ChainSystemId
} from '../../adapters/physics/chain';
import { createChainModel, type ChainStatus } from './chain-model';
import { createChainInspector } from './chain-inspector';
import { createChainScene, chainTrajectoryPlot } from './chain-plots';
import { createChainFiles } from './chain-files';
import { loadChainConfig } from './chain-storage';

const labels: Record<ChainStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
// Restart settings are retained within this document; workers/results are released on route disposal.
const sessions = new WeakMap<Document, Map<string, ChainConfig>>();
export function createChainWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace chain-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 다중 진자'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultChainConfig(system.id as ChainSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalChain(experiment);
    if (!parsed.ok) {
      const alert = element(
        document,
        'p',
        'ds-field__error',
        `공유 설정을 실행할 수 없습니다. ${parsed.issues.map((i) => i.message).join(' ')} 원본 링크를 보존하세요.`
      );
      alert.setAttribute('role', 'alert');
      view.append(alert, link(document, '기본 설정으로 시작', `#/lab/${system.id.slice(7)}`));
      return { element: view, dispose() {} };
    }
    initial = parsed.value;
  } else
    try {
      initial = loadChainConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      warning = `저장된 설정을 읽지 못해 기본 설정을 표시합니다. 원본은 보존되며 이 저장 키를 덮어쓰지 않습니다. ${cause instanceof Error ? cause.message : ''}`;
    }
  let session = sessions.get(document);
  if (!session) {
    session = new Map();
    sessions.set(document, session);
  }
  const key = experiment ? `${system.id}:${JSON.stringify(experiment)}` : system.id;
  initial = session.get(key) ?? initial;
  const model = createChainModel(initial);
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      '기존 물리 엔진으로 계산합니다. θ는 아래 수직선 기준 절대각이며, 모든 링크의 운동·위치에너지를 합산합니다. 화면 이동 시 계산을 종료하고 설정만 보존합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(element(document, 'p', 'lab-preview-note', '공유한 초기조건·적분기·분석 설정을 복원했습니다.'));
  const run = createSection(document, { id: 'chain-run', title: '실행 제어' });
  const status = element(document, 'p', 'lab-run-status');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = element(document, 'div', 'lab-run-actions');
  const start = createButton(document, { label: '실행', onClick: () => model.run() });
  const pause = createButton(document, { label: '일시정지', variant: 'secondary', onClick: () => model.pause() });
  const step = createButton(document, { label: '한 단계', variant: 'secondary', onClick: () => model.step() });
  const reset = createButton(document, { label: '처음으로', variant: 'secondary', onClick: () => model.reset() });
  const cancel = createButton(document, { label: '실행 취소', variant: 'secondary', onClick: () => model.cancel() });
  actions.append(start, pause, step, reset, cancel);
  const speedLabel = element(document, 'label', 'ds-field__label', '재생 속도');
  speedLabel.htmlFor = 'chain-speed';
  const speed = element(document, 'select', 'ds-field__control');
  speed.id = 'chain-speed';
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
  const progress = createProgress(document, { id: 'chain-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'chain-sampling';
  run.body.append(status, error, actions, speedLabel, speed, time, progress.element, sampling);
  view.append(run.element);
  const workspace = createSection(document, {
    id: 'chain-preview',
    title: '작업 공간',
    description: '전체 사슬의 형상과 각 링크의 상태를 확인하세요.'
  });
  const scene = createChainScene(document),
    energy = element(document, 'p', 'chain-energy');
  const details = element(document, 'details', 'lab-details');
  details.append(element(document, 'summary', '', '모든 링크 수치 상태'));
  const table = element(document, 'table', 'chain-state-table');
  table.append(element(document, 'caption', '', '각도·각속도는 고정점부터의 링크 순서입니다.'));
  const head = element(document, 'thead', ''),
    header = element(document, 'tr', '');
  for (const title of ['링크', 'θ (rad)', 'ω (rad/s)']) {
    const cell = element(document, 'th', '', title);
    cell.scope = 'col';
    header.append(cell);
  }
  head.append(header);
  const body = element(document, 'tbody', '');
  table.append(head, body);
  details.append(table);
  workspace.body.append(scene.element, energy, details);
  const analysis = createSection(document, {
    id: 'chain-analysis',
    title: '분석',
    description:
      '선택한 링크의 시간 변화와 위상공간, 전체 에너지를 표시합니다. 다른 링크는 선택 메뉴에서 읽을 수 있습니다.'
  });
  analysis.element.classList.add('chain-analysis');
  const selectedLabel = element(document, 'label', 'ds-field__label', '그래프로 볼 링크');
  selectedLabel.htmlFor = 'chain-plot-link';
  const selected = element(document, 'select', 'ds-field__control');
  selected.id = 'chain-plot-link';
  const kindLabel = element(document, 'label', 'ds-field__label', '그래프 종류');
  kindLabel.htmlFor = 'chain-plot-kind';
  const kind = element(document, 'select', 'ds-field__control');
  kind.id = 'chain-plot-kind';
  for (const [id, label] of [
    ['state-time', '상태 / 시간'],
    ['phase', '위상공간'],
    ['energy', '에너지']
  ] as const) {
    const option = element(document, 'option', '', label);
    option.value = id;
    kind.append(option);
  }
  const plot = element(document, 'div', ''),
    description = element(document, 'p', 'chain-plot-description');
  analysis.body.append(selectedLabel, selected, kindLabel, kind, description, plot);
  let selectedIndex = 0,
    lastStep = -1,
    lastKind = '',
    lastIndex = -1,
    lastN = 0;
  function updatePlot() {
    const state = model.state;
    const n = state.config.parameters.masses.length;
    if (selected.options.length !== n) {
      selectedIndex = Math.min(selectedIndex, n - 1);
      selected.replaceChildren(
        ...Array.from({ length: n }, (_, i) => {
          const o = element(document, 'option', '', `링크 ${i + 1}`);
          o.value = String(i);
          return o;
        })
      );
      selected.value = String(selectedIndex);
    }
    if (lastStep === state.sample.step && lastKind === kind.value && lastIndex === selectedIndex && lastN === n) return;
    lastStep = state.sample.step;
    lastKind = kind.value;
    lastIndex = selectedIndex;
    lastN = n;
    plot.replaceChildren(
      chainTrajectoryPlot(document, state.samples, kind.value as 'state-time' | 'energy' | 'phase', selectedIndex)
    );
    const numeric = state.samples.map((s) => (kind.value === 'energy' ? s.energy.total : s.state[selectedIndex]!));
    let min = Infinity,
      max = -Infinity;
    for (const value of numeric) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    description.textContent =
      kind.value === 'energy'
        ? `가로축 시간 t (s), 세로축 에너지 E (J). 파랑 실선은 총에너지, 갈색 파선은 운동에너지입니다. 총에너지 ${min.toPrecision(5)}–${max.toPrecision(5)} J.`
        : `링크 ${selectedIndex + 1}: ${kind.value === 'phase' ? '가로축 θ (rad), 세로축 ω (rad/s).' : '가로축 시간 t (s), 세로축 θ (rad).'} 기록 각도 ${min.toPrecision(5)}–${max.toPrecision(5)} rad. 모든 링크의 수치는 CSV에서 읽을 수 있습니다.`;
    const extent = (values: readonly number[]) =>
      `${Math.min(...values).toPrecision(5)}–${Math.max(...values).toPrecision(5)}`;
    description.textContent +=
      kind.value === 'phase'
        ? ` 기록 각속도 ${extent(state.samples.map((s) => s.state[n + selectedIndex]!))} rad/s.`
        : ` 기록 시간 ${state.samples[0]!.time.toPrecision(5)}–${state.sample.time.toPrecision(5)} s.`;
    if (kind.value === 'energy')
      description.textContent += ` 운동에너지 ${extent(state.samples.map((s) => s.energy.KE))} J.`;
  }
  selected.addEventListener('change', () => {
    selectedIndex = Number(selected.value);
    updatePlot();
  });
  kind.addEventListener('change', updatePlot);
  const inspector = createChainInspector(document, model, () => {
    lastStep = -1;
    updatePlot();
  });
  const files = createChainFiles(
    document,
    model,
    (c) => {
      model.configure(c);
      inspector.sync();
      lastStep = -1;
      updatePlot();
    },
    () => model.state.valid && model.state.status !== 'running' && !model.state.busy
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
    const s = model.state,
      n = s.config.parameters.masses.length;
    view.dataset.labStatus = s.status;
    view.dataset.busy = String(s.busy);
    const text = s.valid
      ? `${labels[s.status]}${s.busy && s.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '입력한 조건을 수정하세요.';
    if (status.textContent !== text) status.textContent = text;
    error.hidden = !s.error;
    error.textContent = s.error;
    start.textContent = s.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = s.status === 'running' || !s.valid;
    pause.disabled = s.status !== 'running';
    step.disabled = s.status === 'running' || s.status === 'completed' || !s.valid || s.busy;
    cancel.disabled = !['running', 'paused'].includes(s.status) && !s.busy;
    time.value = `t = ${s.sample.time.toFixed(4)} s`;
    time.dataset.time = String(s.sample.time);
    progress.setValue(s.progress * 100, `${(s.progress * 100).toFixed(1)}% · ${s.samples.length}개 표본`);
    sampling.textContent = `worker 실행 · ${n} 자유도 · 기록 간격 ${s.sampleStride}단계 (${(s.sampleStride * s.config.step).toPrecision(4)} s) · 최대 ${s.maxSamples}개 표본. CSV는 기록 표본과 마지막 수신 상태를 포함합니다.`;
    scene.update(s.sample, s.config);
    energy.textContent = `운동 ${s.sample.energy.KE.toFixed(6)} J · 위치 ${s.sample.energy.PE.toFixed(6)} J · 총 ${s.sample.energy.total.toFixed(6)} J · 초기 대비 ${(s.sample.energy.total - s.samples[0]!.energy.total).toPrecision(5)} J`;
    if (body.children.length !== n)
      body.replaceChildren(
        ...Array.from({ length: n }, (_, i) => {
          const row = element(document, 'tr', '');
          const h = element(document, 'th', '', String(i + 1));
          h.scope = 'row';
          row.append(h, element(document, 'td', ''), element(document, 'td', ''));
          return row;
        })
      );
    for (let i = 0; i < n; i++) {
      body.children[i]!.children[1]!.textContent = s.sample.state[i]!.toPrecision(6);
      body.children[i]!.children[2]!.textContent = s.sample.state[n + i]!.toPrecision(6);
    }
    inspector.update();
    files.update();
    if (tabs.selectedId === 'analysis') updatePlot();
  }
  const unsubscribe = model.subscribe(update);
  update();
  updatePlot();
  return {
    element: view,
    dispose() {
      session!.set(key, model.state.config);
      while (session!.size > 8) session!.delete(session!.keys().next().value!);
      unsubscribe();
      model.dispose();
      files.dispose();
      tabs.dispose();
    }
  };
}
