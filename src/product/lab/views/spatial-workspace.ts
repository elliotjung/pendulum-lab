import { element, link, pageHeading } from '../../app/dom';
import { createButton, createSection, createProgress } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultSpatialConfig,
  fromCanonicalSpatial,
  spatialIsEmbedded,
  type SpatialConfig,
  type SpatialSystemId
} from '../../adapters/physics/spatial';
import { createSpatialModel, type SpatialStatus } from './spatial-model';
import { createSpatialInspector } from './spatial-inspector';
import { createSpatialRenderer } from './spatial-renderer';
import {
  spatialTrajectoryPlot,
  exportSpatialFigure,
  type SpatialPlotKind,
  type SpatialProjection,
  type SpatialResidual
} from './spatial-plots';
import { createSpatialFiles } from './spatial-files';
import { loadSpatialConfig } from './spatial-storage';

const labels: Record<SpatialStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: SpatialConfig; tray: SpatialConfig[] }>>();

export function createSpatialWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace spatial-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 공간 진자'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultSpatialConfig(system.id as SpatialSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalSpatial(experiment);
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
      initial = loadSpatialConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
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
  const tray = retained?.tray ?? [],
    model = createSpatialModel(initial);
  const embedded = spatialIsEmbedded(initial.systemId);
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      '오른손 xyz 좌표계: y는 위쪽, 중력은 −y입니다. 카메라 회전은 관찰 방향만 바꿉니다. 화면 이동 시 계산을 종료하고 초기조건만 보존합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(element(document, 'p', 'lab-preview-note', '공유한 초기조건·적분기·실행 조건을 복원했습니다.'));

  const run = createSection(document, { id: 'spatial-run', title: '실행 제어' });
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
  function selector(id: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    for (const [value, text] of entries) {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    }
    return { label, control };
  }
  const speed = selector('spatial-speed', '재생 속도', [
    ['0.25', '0.25×'],
    ['1', '1×'],
    ['4', '4×']
  ]);
  speed.control.value = '1';
  speed.control.addEventListener('change', () => model.setSpeed(Number(speed.control.value)));
  const time = element(document, 'output', 'core-time');
  time.id = 'lab-time';
  time.setAttribute('aria-label', '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'spatial-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'spatial-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, time, progress.element, sampling);
  view.append(run.element);

  const workspace = createSection(document, {
    id: 'spatial-preview',
    title: '작업 공간',
    description: '공간 운동과 수치 상태를 함께 확인하세요. 각운동량은 고정점을 기준으로 계산합니다.'
  });
  const sceneHost = element(document, 'div', 'spatial-scene');
  const scene = createSpatialRenderer(sceneHost);
  const energy = element(document, 'p', 'spatial-energy');
  energy.id = 'spatial-energy';
  const momentum = element(document, 'p', 'spatial-momentum');
  momentum.id = 'spatial-momentum';
  const warnings = element(document, 'p', 'lab-preview-note');
  warnings.id = 'spatial-warnings';
  warnings.setAttribute('role', 'status');
  const states = element(document, 'div', 'spatial-state-grid');
  states.id = 'spatial-state-rows';
  workspace.body.append(
    sceneHost,
    energy,
    momentum,
    warnings,
    element(document, 'h3', '', '좌표와 구속 잔차'),
    element(
      document,
      'p',
      'lab-muted',
      '그림 사용 여부와 관계없이 각 링크의 위치·속도와 잔차를 아래에 표시합니다. |sinθ|가 0에 가까우면 방위각은 불안정하거나 정의되지 않습니다.'
    ),
    states
  );

  const analysis = createSection(document, {
    id: 'spatial-analysis',
    title: '분석',
    description: '동일한 기록 표본에서 각운동량, 구속 잔차, 에너지, 평면 투영 궤적을 확인합니다.'
  });
  const kind = selector('spatial-plot-kind', '그래프 종류', [
    ['momentum', '각운동량'],
    ['residual', '구속 잔차'],
    ['energy', '에너지'],
    ['trajectory', 'Cartesian 궤적']
  ]);
  const selected = selector('spatial-plot-link', '그래프로 볼 링크', []);
  const projection = selector('spatial-projection', '궤적 투영 평면', [
    ['xz', 'xz · 수평면'],
    ['xy', 'xy'],
    ['yz', 'yz']
  ]);
  const residual = selector('spatial-residual', '잔차 종류', [
    ['length', '길이 · m'],
    ['unit', '단위벡터 · 1'],
    ['tangent', '접선 · s⁻¹']
  ]);
  const plot = element(document, 'div', ''),
    description = element(document, 'p', 'spatial-plot-description');
  const diagnostic = element(document, 'div', 'spatial-diagnostics');
  diagnostic.id = 'spatial-diagnostics';
  analysis.body.append(
    kind.label,
    kind.control,
    selected.label,
    selected.control,
    projection.label,
    projection.control,
    residual.label,
    residual.control,
    description,
    plot,
    diagnostic,
    element(
      document,
      'p',
      'lab-muted',
      '중력 때문에 전체 각운동량 벡터는 보존되지 않습니다. 무감쇠에서는 수직 성분 Ly와 에너지를 확인하세요. 감쇠가 있으면 물리적 소산도 포함됩니다. 잔차는 절댓값이며 서로 다른 단위를 같은 축에 섞지 않습니다.'
    )
  );
  let lastPlotKey = '';
  function updatePlot(force = false) {
    const state = model.state,
      count = state.sample.positions.length;
    if (selected.control.options.length !== count) {
      const previous = Number(selected.control.value) || 0;
      selected.control.replaceChildren(
        ...Array.from({ length: count }, (_, index) => {
          const option = element(document, 'option', '', `링크 ${index + 1}`);
          option.value = String(index);
          return option;
        })
      );
      selected.control.value = String(Math.min(previous, count - 1));
    }
    const index = Number(selected.control.value),
      plotKind = kind.control.value as SpatialPlotKind;
    const plane = projection.control.value as SpatialProjection,
      residualKind = residual.control.value as SpatialResidual;
    const plotKey = `${state.revision}:${state.sample.step}:${plotKind}:${index}:${plane}:${residualKind}`;
    if (!force && plotKey === lastPlotKey) return;
    lastPlotKey = plotKey;
    selected.control.disabled = plotKind === 'energy' || plotKind === 'momentum';
    projection.label.hidden = projection.control.hidden = plotKind !== 'trajectory';
    residual.label.hidden = residual.control.hidden = plotKind !== 'residual';
    plot.replaceChildren(spatialTrajectoryPlot(document, state.samples, plotKind, index, plane, residualKind));
    const sample = state.sample,
      first = state.samples[0]!,
      fmt = (n: number) => n.toPrecision(6);
    description.textContent =
      plotKind === 'trajectory'
        ? `질점 ${index + 1}: 가로축 ${plane[0]} (m), 세로축 ${plane[1]} (m)의 투영입니다. 세 좌표 전체는 작업 공간과 궤적 CSV에서 확인하세요.`
        : plotKind === 'momentum'
          ? '가로축 t (s), 세로축 각운동량 (kg·m²/s). 파란 실선 Ly는 수직 성분, 갈색 파선 Lx와 녹색 파선 Lz는 수평 성분입니다.'
          : plotKind === 'energy'
            ? '가로축 t (s), 세로축 에너지 (J). 총에너지는 파란 실선, 운동·위치에너지는 갈색·녹색 파선입니다. 위치에너지 기준은 고정점 높이입니다.'
            : `링크 ${index + 1}: 가로축 t (s), 세로축 ${residualKind === 'length' ? '||rᵢ−rᵢ₋₁|−ℓᵢ| (m)' : residualKind === 'unit' ? '||u|−1| (무차원)' : '|u·w| (s⁻¹)'}입니다.`;
    diagnostic.replaceChildren(
      element(
        document,
        'p',
        '',
        `현재 총에너지 ${fmt(sample.energy.total)} J · 초기 대비 변화 ${fmt(sample.energy.total - first.energy.total)} J`
      ),
      element(
        document,
        'p',
        '',
        `수직 각운동량 Ly ${fmt(sample.verticalMomentum)} kg·m²/s · 초기 대비 변화 ${fmt(sample.verticalMomentum - first.verticalMomentum)} kg·m²/s`
      ),
      element(
        document,
        'p',
        '',
        `링크 ${index + 1} 잔차: 길이 ${fmt(sample.constraintErrors[index]!)} m · 단위벡터 ${fmt(sample.unitConstraintErrors[index]!)} · 접선 ${fmt(sample.tangentConstraintErrors[index]!)} s⁻¹`
      )
    );
  }
  for (const control of [kind.control, selected.control, projection.control, residual.control])
    control.addEventListener('change', () => updatePlot());
  const inspector = createSpatialInspector(document, model, () => updatePlot(true));
  const files = createSpatialFiles(
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
      exportSpatialFigure(
        document,
        model.state.config,
        model.state.samples,
        kind.control.value as SpatialPlotKind,
        Number(selected.control.value),
        projection.control.value as SpatialProjection,
        residual.control.value as SpatialResidual
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
    const state = model.state,
      sample = state.sample;
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    const statusText = state.valid
      ? `${labels[state.status]}${state.busy && state.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    if (status.textContent !== statusText) status.textContent = statusText;
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || state.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = `t = ${sample.time.toFixed(4)} s`;
    time.dataset.time = String(sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 표본`);
    sampling.textContent = `기록 간격 ${state.sampleStride}단계 (${(state.sampleStride * state.config.step).toPrecision(4)} s) · 최대 ${state.maxSamples}개 표본. 마지막 수신 상태를 CSV에 포함합니다.`;
    scene.update({
      positions: sample.positions,
      velocities: sample.velocities,
      angularMomentum: sample.angularMomentum,
      extent: state.config.parameters.lengths.reduce((sum, value) => sum + value, 0),
      time: sample.time,
      label: system.name.ko
    });
    const fmt = (n: number) => n.toPrecision(6);
    energy.textContent = `운동 ${fmt(sample.energy.KE)} J · 위치 ${fmt(sample.energy.PE)} J · 총 ${fmt(sample.energy.total)} J`;
    momentum.textContent = `각운동량 (Lx, Ly, Lz) = (${fmt(sample.angularMomentum.x)}, ${fmt(sample.angularMomentum.y)}, ${fmt(sample.angularMomentum.z)}) kg·m²/s · Ly가 수직 성분입니다.`;
    const warningText = sample.warnings.join(' ');
    if (warnings.textContent !== warningText) warnings.textContent = warningText;
    warnings.hidden = !warningText;
    const count = sample.positions.length,
      stride = embedded ? 3 : 2;
    if (states.children.length !== count)
      states.replaceChildren(
        ...Array.from({ length: count }, (_, i) => {
          const card = element(document, 'article', 'spatial-state-card');
          card.append(element(document, 'h3', '', `링크 ${i + 1}`));
          for (let j = 0; j < 6; j++) card.append(element(document, 'p', ''));
          return card;
        })
      );
    for (let i = 0; i < count; i++) {
      const children = states.children[i]!.children,
        p = sample.positions[i]!,
        v = sample.velocities[i]!;
      children[1]!.textContent = `위치 (x, y, z) = (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) m`;
      children[2]!.textContent = `속도 (vx, vy, vz) = (${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}) m/s`;
      children[3]!.textContent = `${embedded ? 'u (1)' : '(θ, φ) (rad)'} = (${sample.state
        .slice(stride * i, stride * (i + 1))
        .map(fmt)
        .join(', ')})`;
      children[4]!.textContent = `${embedded ? 'w=du/dt (s⁻¹)' : '(θ̇, φ̇) (rad/s)'} = (${sample.state
        .slice(stride * (count + i), stride * (count + i + 1))
        .map(fmt)
        .join(', ')})`;
      children[5]!.textContent = `잔차: 길이 ${fmt(sample.constraintErrors[i]!)} m · 단위벡터 ${fmt(sample.unitConstraintErrors[i]!)} · 접선 ${fmt(sample.tangentConstraintErrors[i]!)} s⁻¹`;
      children[6]!.textContent = `극점 접근도 |sinθ| = ${fmt(sample.poleProximity[i]!)} (무차원)`;
    }
    inspector.update();
    files.update();
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
      scene.destroy();
    }
  };
}
