import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultNetworkConfig,
  fromCanonicalNetwork,
  networkWarnings,
  type NetworkConfig,
  type NetworkSystemId
} from '../../adapters/physics/network';
import { createNetworkModel, type NetworkStatus } from './network-model';
import { createNetworkInspector } from './network-inspector';
import { createNetworkFiles } from './network-files';
import { loadNetworkConfig, networkIsNormalized } from './network-storage';
import { createNetworkBasinModel, networkBasinCsv } from './network-basin';
import {
  networkTrajectoryPlot,
  networkPlotDescription,
  exportNetworkFigure,
  type NetworkPlotKind
} from './network-plots';

const labels: Record<NetworkStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: NetworkConfig; tray: NetworkConfig[] }>>();
export function createNetworkWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace network-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 자기와 네트워크'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultNetworkConfig(system.id as NetworkSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalNetwork(experiment);
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
      initial = loadNetworkConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      warning = `저장된 설정을 읽지 못해 기본 설정을 표시합니다. 원본 저장 키를 보존합니다. ${cause instanceof Error ? cause.message : ''}`;
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
    model = createNetworkModel(initial),
    id = initial.systemId,
    magnetic = networkIsNormalized(id);
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      magnetic
        ? '자기 모델의 위치·속도·시간·에너지는 모두 정규화 값입니다. SI 단위로 해석하지 마세요.'
        : '위상은 rad, 시간은 s입니다. Huygens는 위상 축약 모델이며 진폭·지지대 반동·탈진기 접촉을 포함하지 않습니다.'
    ),
    element(document, 'p', 'lab-muted', '화면을 떠나면 계산을 종료합니다. 저장하거나 보관한 초기조건은 유지합니다.'),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(element(document, 'p', 'lab-preview-note', '공유한 그래프·초기조건·seed·실행 조건을 복원했습니다.'));
  function selector(key: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    control.id = `network-${key}`;
    label.htmlFor = control.id;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    return { label, control };
  }
  const run = createSection(document, { id: 'network-run', title: '실행 제어' }),
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
        model.reset();
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
  time.setAttribute('aria-label', magnetic ? '현재 정규화 시간' : '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'network-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'network-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, time, progress.element, sampling);
  view.append(run.element);

  const workspace = createSection(document, {
    id: 'network-preview',
    title: '작업 공간',
    description: '같은 상태에서 그래프 구조와 전역·국소 정합, 선택한 개별 노드를 확인합니다.'
  });
  const display = selector('display-mode', '상태 표시', [
      ['aggregate', '전체 요약'],
      ['individual', '개별 상태']
    ]),
    nodeSelect = selector('node-select', '선택할 노드', []);
  const scene = element(document, 'div', 'network-scene'),
    summary = element(document, 'p', 'network-signals'),
    individual = element(document, 'div', 'network-state-grid'),
    warnings = element(document, 'p', 'lab-preview-note');
  summary.id = 'network-summary';
  individual.id = 'network-state-rows';
  warnings.id = 'network-warnings';
  workspace.body.append(
    display.label,
    display.control,
    nodeSelect.label,
    nodeSelect.control,
    scene,
    summary,
    individual,
    warnings
  );
  display.control.addEventListener('change', () => update());
  nodeSelect.control.addEventListener('change', () => {
    update();
    updatePlot(true);
  });
  const NS = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 640 320');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    magnetic
      ? '고정 자석의 위치와 움직이는 자기 진자. 자석 ID는 원의 제목에서 확인할 수 있습니다. 위치는 정규화 값입니다.'
      : '노드와 간선 구조. 색은 국소 정합 크기를 보조 표시하며 개별 수치는 상태 표시에서 확인할 수 있습니다.'
  );
  scene.append(
    svg,
    element(
      document,
      'p',
      'lab-muted',
      '노드 배치는 도식입니다. 선은 간선, 원은 노드이며 단위와 실제 값은 개별 상태에서 확인하세요.'
    )
  );
  function updateScene() {
    const state = model.state,
      graph = state.config.graph,
      n = graph.nodes.length;
    const title = document.createElementNS(NS, 'title');
    title.textContent = `${system.name.ko} · ${n}개 노드와 ${graph.edges.length}개 간선`;
    svg.replaceChildren(title);
    const points = graph.nodes.map((node, i) => {
      if (magnetic) {
        const extent = Math.max(1, ...graph.nodes.flatMap((entry) => [Math.abs(entry.x), Math.abs(entry.y)]));
        return { x: 320 + (node.x * 110) / extent, y: 160 - (node.y * 110) / extent };
      }
      const ringIndex = graph.ringOrder ? graph.ringOrder.indexOf(node.id) : i;
      return {
        x: 320 + 125 * Math.cos((2 * Math.PI * ringIndex) / n),
        y: 160 + 125 * Math.sin((2 * Math.PI * ringIndex) / n)
      };
    });
    // Display edges are capped independently of the full simulated graph and JSON exports.
    for (const edge of graph.edges.slice(0, 512)) {
      const a = points[graph.nodes.findIndex((node) => node.id === edge.source)]!,
        b = points[graph.nodes.findIndex((node) => node.id === edge.target)]!,
        line = document.createElementNS(NS, 'line');
      Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#94a3b8', 'stroke-width': 1 }).forEach(
        ([key, value]) => line.setAttribute(key, String(value))
      );
      svg.append(line);
    }
    points.forEach((point, i) => {
      const circle = document.createElementNS(NS, 'circle'),
        coherence = state.sample.localCoherence[i] ?? 0;
      Object.entries({
        cx: point.x,
        cy: point.y,
        r: n > 32 ? 4 : 8,
        fill: coherence > 0.7 ? '#075985' : '#9a3412',
        stroke: i === Number(nodeSelect.control.value) ? '#111827' : '#fff',
        'stroke-width': 2
      }).forEach(([key, value]) => circle.setAttribute(key, String(value)));
      const title = document.createElementNS(NS, 'title');
      title.textContent = magnetic
        ? `${graph.nodes[i]!.id}: 고정 자석, 정규화 위치 (${graph.nodes[i]!.x}, ${graph.nodes[i]!.y})`
        : `${graph.nodes[i]!.id}: 국소 정합 ${coherence.toFixed(4)}`;
      circle.append(title);
      svg.append(circle);
    });
    if (magnetic) {
      const point = state.sample.positions[0];
      if (point) {
        const bob = document.createElementNS(NS, 'circle'),
          extent = Math.max(1, ...graph.nodes.flatMap((entry) => [Math.abs(entry.x), Math.abs(entry.y)]));
        bob.setAttribute('cx', String(320 + (point.x * 110) / extent));
        bob.setAttribute('cy', String(160 - (point.y * 110) / extent));
        bob.setAttribute('r', '6');
        bob.setAttribute('fill', '#111827');
        svg.append(bob);
      }
    }
  }

  const analysis = createSection(document, {
    id: 'network-analysis',
    title: '분석',
    description: '기록 표본과 선택한 노드를 사용합니다. 수치 진단만으로 장시간 동기화나 chimera 상태를 확정하지 마세요.'
  });
  const kinds: readonly (readonly [string, string])[] = magnetic
    ? [
        ['state', '위치 / 시간'],
        ['phase', '평면 궤적'],
        ['basin', '인력권 seed 격자']
      ]
    : [
        ['order', '전역 order parameter'],
        ['local', '국소 coherence'],
        ['state', '개별 위상 / 시간'],
        ['phase', '개별 위상 원']
      ];
  const kind = selector('plot-kind', '그래프 종류', kinds),
    description = element(document, 'p', 'lab-muted'),
    plot = element(document, 'div', 'network-plot');
  analysis.body.append(kind.label, kind.control, description, plot);
  let lastPlotKey = '',
    nodeIds = '';
  const basin = createNetworkBasinModel(() => {
    update();
    updatePlot(true);
  });
  function updatePlot(force = false) {
    const state = model.state,
      k = kind.control.value as NetworkPlotKind,
      index = Number(nodeSelect.control.value) || 0,
      next = `${state.revision}:${state.sample.step}:${k}:${index}`;
    if (!force && next === lastPlotKey) return;
    lastPlotKey = next;
    const figure = networkTrajectoryPlot(document, state.config, state.samples, k, index, basin.state.snapshot),
      caption = element(document, 'p', 'lab-muted network-plot-caption', figure.getAttribute('aria-label') ?? '');
    plot.replaceChildren(figure, caption);
    description.textContent = networkPlotDescription(state.config, k);
  }
  kind.control.addEventListener('change', () => updatePlot(true));
  const basinPanel = createSection(document, {
      id: 'network-basin',
      title: '자기 인력권 seed 격자',
      description:
        '기존 semi-implicit Euler 도구로 각 초기 위치를 정착까지 계산합니다. 격자 실행은 궤적 실행과 별도이며 새 조건을 적용하면 취소됩니다.'
    }),
    basinStatus = element(document, 'p', 'lab-muted'),
    basinError = element(document, 'p', 'ds-field__error');
  basinStatus.setAttribute('role', 'status');
  basinError.setAttribute('role', 'alert');
  basinError.hidden = true;
  const basinProgress = createProgress(document, {
    id: 'network-basin-progress',
    label: '인력권 격자 진행',
    value: 0,
    max: 100
  });
  basinProgress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const basinRun = createButton(document, {
      label: '인력권 격자 실행',
      onClick() {
        if (!model.state.valid) return;
        model.cancel();
        basin.run(model.state.config);
      }
    }),
    basinCancel = createButton(document, {
      label: '격자 실행 취소',
      variant: 'secondary',
      onClick: () => basin.cancel()
    });
  basinRun.id = 'network-basin-run';
  basinCancel.id = 'network-basin-cancel';
  const basinCsv = createButton(document, {
    label: '격자 CSV 다운로드',
    variant: 'secondary',
    onClick() {
      if (basin.state.snapshot) downloadBasin();
    }
  });
  const basinActions = element(document, 'div', 'lab-inline-actions');
  basinActions.append(basinRun, basinCancel, basinCsv);
  basinPanel.body.append(
    basinActions,
    basinStatus,
    basinError,
    basinProgress.element,
    element(
      document,
      'p',
      'lab-muted',
      '회색 셀은 미계산 또는 미해결입니다. CSV converged=0의 최근 자석은 확정 인력권이 아닙니다. 셀당 최대 단계·속도 허용오차를 바꾸어 수렴을 확인하세요.'
    )
  );
  if (magnetic) analysis.body.append(basinPanel.element);
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  function downloadBasin() {
    try {
      const url = URL.createObjectURL(
        new Blob([networkBasinCsv(model.state.config, basin.state.snapshot!)], { type: 'text/csv;charset=utf-8' })
      );
      urls.add(url);
      const a = element(document, 'a', '');
      a.href = url;
      a.download = 'pendulum-magnetic-basin.csv';
      document.body.append(a);
      a.click();
      a.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    } catch (cause) {
      basinError.hidden = false;
      basinError.textContent = cause instanceof Error ? cause.message : '다운로드를 시작하지 못했습니다.';
    }
  }
  function updateBasin() {
    const state = basin.state,
      snapshot = state.snapshot;
    view.dataset.basinStatus = state.status;
    basinStatus.textContent = `${{ ready: '격자 준비 완료', running: '격자 실행 중', completed: '격자 실행 완료', cancelled: '격자 실행 취소됨', error: '격자 실행 오류' }[state.status]} · ${snapshot?.completed ?? 0}/${snapshot?.total ?? model.state.config.basin?.size! ** 2}셀 · 정착 ${snapshot?.cells.filter((cell) => cell.converged).length ?? 0}셀`;
    basinProgress.setValue(snapshot ? (snapshot.completed / snapshot.total) * 100 : 0);
    basinError.hidden = !state.error;
    if (state.error) basinError.textContent = state.error;
    basinRun.disabled =
      state.status === 'running' || !model.state.valid || model.state.status === 'running' || model.state.busy;
    basinCancel.disabled = state.status !== 'running';
    basinCsv.disabled = !snapshot?.cells.length;
  }
  const inspector = createNetworkInspector(document, model, () => {
      basin.reset();
      updatePlot(true);
    }),
    files = createNetworkFiles(
      document,
      model,
      (config) => {
        basin.reset();
        model.configure(config);
        inspector.sync();
        updatePlot(true);
      },
      () =>
        model.state.valid && model.state.status !== 'running' && !model.state.busy && basin.state.status !== 'running',
      tray,
      () =>
        exportNetworkFigure(
          document,
          model.state.config,
          model.state.samples,
          kind.control.value as NetworkPlotKind,
          Number(nodeSelect.control.value) || 0,
          basin.state.snapshot
        ),
      () => basin.state.status !== 'running'
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
      sample = state.sample,
      graph = state.config.graph;
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    status.textContent = state.valid
      ? `${labels[state.status]}${state.busy && state.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid || basin.state.status === 'running';
    pause.disabled = state.status !== 'running';
    step.disabled =
      state.status === 'running' ||
      state.status === 'completed' ||
      !state.valid ||
      state.busy ||
      basin.state.status === 'running';
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = magnetic ? `τ = ${sample.time.toFixed(4)} (정규화)` : `t = ${sample.time.toFixed(4)} s`;
    time.dataset.time = String(sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 표본`);
    sampling.textContent = `기록 간격 ${state.sampleStride}단계 · 최대 ${state.maxSamples}개 표본 · ${graph.nodes.length}개 노드, ${graph.edges.length}개 간선. 그래프 선은 최대 512개만 그리며 계산·JSON은 전체를 보존합니다.`;
    const nextIds = graph.nodes.map((node) => node.id).join('|');
    if (nextIds !== nodeIds) {
      nodeIds = nextIds;
      nodeSelect.control.replaceChildren(
        ...graph.nodes.map((node, i) => {
          const option = element(document, 'option', '', node.id);
          option.value = String(i);
          return option;
        })
      );
    }
    if (!state.valid && basin.state.status === 'running') basin.cancel();
    const index = Number(nodeSelect.control.value) || 0,
      node = graph.nodes[index]!;
    summary.hidden = display.control.value !== 'aggregate';
    individual.hidden = display.control.value !== 'individual';
    summary.textContent = magnetic
      ? `정규화 에너지 ${sample.energy.toPrecision(6)} · 최근 자석 ${sample.classification} (정착 판정 아님)`
      : `전역 order r = ${sample.order.toFixed(6)} · 평균 local coherence = ${sample.meanLocalOrder.toFixed(6)} · 위상차 ${sample.phaseDifference.toFixed(6)} rad · ${sample.classification}${id === 'system:pendulum-network' ? ` · 에너지 ${sample.energy.toPrecision(6)} J` : ''}`;
    individual.replaceChildren();
    const card = element(document, 'article', 'network-state-card');
    card.id = 'network-selected-state';
    card.dataset.nodeId = magnetic ? 'bob' : node.id;
    card.append(
      element(document, 'h3', '', magnetic ? '자기 진자 상태' : node.id),
      element(
        document,
        'p',
        '',
        magnetic
          ? `[x, y, vx, vy] = ${sample.state.map((value) => value.toPrecision(6)).join(' / ')} (정규화)`
          : `θ = ${sample.state[index]!.toPrecision(6)} rad${id === 'system:pendulum-network' ? ` · ω = ${sample.state[index + graph.nodes.length]!.toPrecision(6)} rad/s` : ''} · local coherence = ${(sample.localCoherence[index] ?? 0).toFixed(6)}`
      )
    );
    individual.append(card);
    warnings.textContent = [...networkWarnings(state.config), ...sample.warnings]
      .filter((value, i, values) => values.indexOf(value) === i)
      .join(' ');
    updateScene();
    inspector.update();
    files.update();
    updateBasin();
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
      basin.dispose();
      inspector.dispose();
      files.dispose();
      tabs.dispose();
      timers.forEach((timer) => clearTimeout(timer));
      urls.forEach((url) => URL.revokeObjectURL(url));
    }
  };
}
