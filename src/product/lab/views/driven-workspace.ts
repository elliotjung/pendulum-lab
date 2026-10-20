import { createDiagnostics } from './diagnostics';
import { toCanonicalDriven } from '../../adapters/physics/driven';
import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultDrivenConfig,
  drivenHasForcing,
  drivenSupportsController,
  fromCanonicalDriven,
  type DrivenConfig,
  type DrivenSystemId
} from '../../adapters/physics/driven';
import { createDrivenModel, type DrivenStatus } from './driven-model';
import { createDrivenInspector } from './driven-inspector';
import { createDrivenFiles } from './driven-files';
import { drivenInputUnit, drivenStateFields, loadDrivenConfig } from './driven-storage';
import { drivenTrajectoryPlot, exportDrivenFigure, type DrivenPlotKind } from './driven-plots';
import { createDrivenSweep } from './driven-sweep';
import { createPlot } from './core-plots';
import { parseQuantityInput } from '../../design-system/quantity';

const labels: Record<DrivenStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: DrivenConfig; tray: DrivenConfig[] }>>();

export function createDrivenWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace driven-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 구동과 제어'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultDrivenConfig(system.id as DrivenSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalDriven(experiment);
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
      initial = loadDrivenConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
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
    model = createDrivenModel(initial),
    sweep = createDrivenSweep(),
    id = initial.systemId;
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      '시간은 s, 길이는 m, 각도는 rad입니다. 역진자·cart-pole의 θ=0은 수직 위, 나머지 진자의 θ=0은 수직 아래입니다. 화면 이동 시 계산을 종료하고 초기조건만 보존합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(
      element(document, 'p', 'lab-preview-note', '공유한 플랜트·구동·제어·초기조건·실행 조건을 복원했습니다.')
    );
  function selector(key: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    control.id = `driven-${key}`;
    label.htmlFor = control.id;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    return { label, control };
  }
  const run = createSection(document, { id: 'driven-run', title: '실행 제어' }),
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
  time.setAttribute('aria-label', '현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'driven-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'driven-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, time, progress.element, sampling);
  view.append(run.element);

  const workspace = createSection(document, {
    id: 'driven-preview',
    title: '작업 공간',
    description: '실제 엔진의 위치와 상태를 표시합니다. 그림을 사용할 수 없어도 아래 수치로 실험을 확인할 수 있습니다.'
  });
  const scene = element(document, 'div', 'driven-scene'),
    energy = element(document, 'p', 'driven-energy'),
    signals = element(document, 'p', 'driven-signals'),
    controlValue = element(document, 'output', 'driven-control'),
    reference = element(document, 'p', 'driven-reference'),
    warnings = element(document, 'p', 'lab-preview-note'),
    states = element(document, 'div', 'driven-state-grid');
  energy.id = 'driven-energy';
  signals.id = 'driven-signals';
  controlValue.id = 'driven-control';
  controlValue.setAttribute('aria-label', '현재 제어 출력');
  controlValue.setAttribute('aria-live', 'off');
  reference.id = 'driven-reference';
  warnings.id = 'driven-warnings';
  states.id = 'driven-state-rows';
  warnings.setAttribute('role', 'status');
  workspace.body.append(
    scene,
    energy,
    signals,
    controlValue,
    reference,
    warnings,
    element(document, 'h3', '', '현재 상태'),
    states
  );
  if (id === 'system:cartpole')
    workspace.body.append(
      element(
        document,
        'p',
        'lab-muted',
        '그림의 카메라는 수레를 따라갑니다. 절대 수레 위치 x는 아래 현재 상태와 CSV에 표시합니다.'
      )
    );
  if (id === 'system:cartpole')
    workspace.body.append(
      element(
        document,
        'p',
        'lab-preview-note',
        'cart-pole 진단 에너지는 기존 엔진의 점질량 에너지 식입니다. 운동방정식의 균일 막대 관성과 일치하지 않아 무외력·무마찰에서도 보존 검사로 해석할 수 없습니다.'
      )
    );
  else if (id === 'system:coupled')
    workspace.body.append(
      element(
        document,
        'p',
        'lab-preview-note',
        '기존 결합 에너지 ½k(θ₁−θ₂)²에는 길이² 인자가 없어 길이≠1에서는 운동방정식과 일관된 보존량이 아닙니다. 표시 에너지는 진단으로만 사용하세요.'
      )
    );
  else
    workspace.body.append(
      element(
        document,
        'p',
        'lab-muted',
        '진단 에너지는 외력·제어·감쇠 때문에 일반적으로 보존되지 않습니다. 에너지 주입이나 소산을 별도 수치 오차로 해석하지 마세요.'
      )
    );
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 640 320');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${system.name.ko} 현재 형상`);
  const title = document.createElementNS(svgNs, 'title');
  title.textContent = `${system.name.ko} 현재 형상`;
  svg.append(title);
  const rods = id === 'system:coupled' || id === 'system:cartpole' ? 2 : 1;
  const lines = Array.from({ length: rods }, () => {
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('stroke', '#075985');
    line.setAttribute('stroke-width', '5');
    svg.append(line);
    return line;
  });
  const bobs = Array.from({ length: rods }, () => {
    const bob = document.createElementNS(svgNs, 'circle');
    bob.setAttribute('r', '10');
    bob.setAttribute('fill', '#9a3412');
    svg.append(bob);
    return bob;
  });
  scene.append(svg);
  function updateScene() {
    const s = model.state.sample,
      c = model.state.config,
      extent = Math.max(0.01, c.parameters.length! + (id === 'system:coupled' ? 0.75 : 0)),
      scale = 100 / extent;
    s.positions.forEach((p, i) => {
      const originX = id === 'system:coupled' ? 320 + (i === 0 ? -0.75 : 0.75) * scale : 320,
        originY = 160;
      const cartX = id === 'system:cartpole' ? s.state[0]! : 0;
      const x = 320 + (p.x - cartX) * scale,
        y = originY - p.y * scale;
      const line = lines[i]!,
        bob = bobs[i]!;
      line.setAttribute('x1', String(originX));
      line.setAttribute('y1', String(originY));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      bob.setAttribute('cx', String(x));
      bob.setAttribute('cy', String(y));
      if (id === 'system:cartpole' && i === 0) {
        bob.setAttribute('r', '14');
        bob.setAttribute('fill', '#166534');
        line.style.display = 'none';
      }
    });
  }

  const analysis = createSection(document, {
    id: 'driven-analysis',
    title: '분석',
    description: '현재 기록한 동일 표본에서 상태·위상공간·입력·오차·진단 에너지를 확인합니다.'
  });
  const kinds: [string, string][] = [
    ['state', '상태 / 시간'],
    ['phase', '위상공간'],
    ['energy', '진단 에너지']
  ];
  if (drivenHasForcing(id) || drivenSupportsController(id)) kinds.push(['input', '구동 / 제어 입력']);
  if (drivenSupportsController(id)) kinds.push(['error', '기준값 / 상태 / 오차']);
  const kind = selector('plot-kind', '그래프 종류', kinds),
    selected = selector(
      'plot-state',
      '그래프로 볼 상태',
      drivenStateFields(id).map(([, label], i) => [String(i), label])
    );
  const description = element(document, 'p', 'driven-plot-description'),
    plot = element(document, 'div', '');
  analysis.body.append(kind.label, kind.control, selected.label, selected.control, description, plot);
  let lastPlotKey = '';
  function updatePlot(force = false) {
    const state = model.state,
      k = kind.control.value as DrivenPlotKind,
      index = Number(selected.control.value),
      next = `${state.revision}:${state.sample.step}:${k}:${index}`;
    if (!force && next === lastPlotKey) return;
    lastPlotKey = next;
    selected.control.disabled = k !== 'state';
    plot.replaceChildren(drivenTrajectoryPlot(document, state.config, state.samples, k, index));
    description.textContent =
      k === 'phase'
        ? id === 'system:coupled'
          ? '가로축 θ₁−θ₂ (rad), 세로축 ω₁−ω₂ (rad/s). 결합 진자의 상대 위상공간입니다.'
          : '가로축 θ (rad), 세로축 ω (rad/s). 첫 진자의 각도 위상공간입니다.'
        : k === 'energy'
          ? '가로축 t (s), 세로축 진단 에너지 (J). 외력·감쇠·제어가 있거나 cart-pole인 경우 보존 오차가 아닙니다.'
          : k === 'error'
            ? `가로축 t (s), 세로축 ${id === 'system:cartpole' ? '수레 위치 (m)' : '각도 (rad)'}. 파란 기준값, 갈색 관측 상태, 녹색 기준−상태 오차입니다.`
            : k === 'input'
              ? `가로축 t (s), 세로축 입력 (${drivenInputUnit(id)}). 구동 신호와 제어기 출력은 별도 선입니다. 제어기 출력만 포화되며 cart-pole의 총 힘에는 일정 외력도 더해집니다.`
              : `가로축 t (s), 세로축 ${drivenStateFields(id)[index]![1]} (${drivenStateFields(id)[index]![2]}).`;
  }
  kind.control.addEventListener('change', () => updatePlot());
  selected.control.addEventListener('change', () => updatePlot());
  let sweepUpdate = () => {};
  if (drivenHasForcing(id)) {
    const sweepSection = createSection(document, {
      id: 'driven-sweep',
      title: '공명 주파수 스윕',
      description:
        '현재 조건에서 주파수만 바꾼 2–6회 독립 실행입니다. 각주파수 범위는 0–1000 rad/s이며 끝은 시작보다 커야 합니다. 기본값은 시작 0.25, 끝 2 rad/s, 6개 지점입니다. 각 실행은 최대 30 s이며 초기조건부터 시작합니다. 후반부 기록 각도의 (최대−최소)/2를 표시하며 정상상태나 공명 확정을 보장하지 않습니다. 제어가 켜져 있으면 폐루프 응답입니다.'
    });
    const inputs = element(document, 'div', 'driven-fields');
    function sweepInput(key: string, labelText: string, value: string) {
      const label = element(document, 'label', 'ds-field__label', labelText),
        input = element(document, 'input', 'ds-field__control');
      input.id = `driven-sweep-${key}`;
      label.htmlFor = input.id;
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = value;
      inputs.append(label, input);
      return input;
    }
    const low = sweepInput('start', '시작 각주파수 (rad/s)', '0.25'),
      high = sweepInput('end', '끝 각주파수 (rad/s)', '2'),
      count = sweepInput('count', '주파수 지점 수 (2–6)', '6');
    const sweepStatus = element(document, 'p', 'lab-muted');
    sweepStatus.id = 'driven-sweep-status';
    sweepStatus.setAttribute('role', 'status');
    const sweepError = element(document, 'p', 'ds-field__error');
    sweepError.id = 'driven-sweep-error';
    sweepError.setAttribute('role', 'alert');
    sweepError.hidden = true;
    const results = element(document, 'div', 'driven-sweep-results');
    results.id = 'driven-sweep-results';
    const sweepStart = createButton(document, {
      label: '실행 주파수 스윕',
      onClick() {
        sweepError.hidden = true;
        try {
          if (model.state.status === 'running' || model.state.busy || !model.state.valid)
            throw new Error('본 실행을 멈추고 유효한 조건을 적용하세요.');
          const startValue = parseQuantityInput(low.value, { unit: 'rad/s', min: 0, max: 1000 });
          const endValue = parseQuantityInput(high.value, { unit: 'rad/s', min: 0, max: 1000 });
          const countValue = parseQuantityInput(count.value, { unit: '1', min: 2, max: 6 });
          if (!startValue.ok || !endValue.ok || !countValue.ok)
            throw new Error('시작·끝 각주파수와 2–6개 지점 수에 유한한 숫자를 입력하세요. 빈 값은 사용할 수 없습니다.');
          sweep.run(model.state.config, startValue.quantity.value, endValue.quantity.value, countValue.quantity.value);
        } catch (cause) {
          sweepError.hidden = false;
          sweepError.textContent = cause instanceof Error ? cause.message : '스윕 조건을 확인하세요.';
        }
      }
    });
    const sweepCancel = createButton(document, {
      label: '스윕 취소',
      variant: 'secondary',
      onClick: () => sweep.cancel()
    });
    sweepSection.body.append(inputs, sweepStart, sweepCancel, sweepStatus, sweepError, results);
    analysis.body.append(sweepSection.element);
    sweepUpdate = () => {
      const s = sweep.state,
        running = s.status === 'running';
      sweepStart.disabled = running || model.state.status === 'running' || model.state.busy || !model.state.valid;
      sweepCancel.disabled = !running;
      low.disabled = high.disabled = count.disabled = running;
      const sweepText = `${{ ready: '스윕 준비 완료', running: '스윕 실행 중', completed: '스윕 완료', cancelled: '스윕 취소됨', error: '스윕 오류' }[s.status]} · ${(s.progress * 100).toFixed(0)}% · ${s.points.length}개 주파수 완료`;
      if (sweepStatus.textContent !== sweepText) sweepStatus.textContent = sweepText;
      if (s.error) {
        sweepError.hidden = false;
        if (sweepError.textContent !== s.error) sweepError.textContent = s.error;
      } else if (s.status === 'ready') {
        sweepError.hidden = true;
        sweepError.textContent = '';
      }
      results.replaceChildren();
      if (!s.points.length) results.append(element(document, 'p', 'lab-empty', '완료된 주파수 결과가 없습니다.'));
      else {
        results.append(
          createPlot(document, '유한 시간 각도 응답', 'Ω (rad/s)', '각도 반진폭 (rad)', [
            { label: '후반부 반진폭', color: '#075985', points: s.points.map((p) => [p.frequency, p.amplitude]) }
          ])
        );
        const list = element(document, 'ul', '');
        for (const point of s.points)
          list.append(
            element(
              document,
              'li',
              '',
              `Ω ${point.frequency.toPrecision(5)} rad/s · 각도 반진폭 ${point.amplitude.toPrecision(5)} rad · 후반부 ${point.samples}개 표본`
            )
          );
        results.append(list);
      }
      update();
    };
  }
  const inspector = createDrivenInspector(document, model, () => {
    sweep.reset();
    updatePlot(true);
  });
  const files = createDrivenFiles(
    document,
    model,
    (config) => {
      model.configure(config);
      sweep.reset();
      inspector.sync();
      updatePlot(true);
    },
    () =>
      model.state.valid && model.state.status !== 'running' && !model.state.busy && sweep.state.status !== 'running',
    tray,
    () =>
      exportDrivenFigure(
        document,
        model.state.config,
        model.state.samples,
        kind.control.value as DrivenPlotKind,
        Number(selected.control.value)
      ),
    () => sweep.state.status !== 'running'
  );
  const coreDiagnostics = createDiagnostics(document, {
    experiment: () => toCanonicalDriven(model.state.config),
    samples: () => model.state.samples,
    canRun: () => model.state.valid && model.state.status !== 'running' && !model.state.busy
  });
  analysis.body.append(coreDiagnostics.element);
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
  let updating = false;
  function update() {
    if (updating) return;
    updating = true;
    const state = model.state,
      sample = state.sample,
      sweeping = sweep.state.status === 'running';
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    view.dataset.sweepStatus = sweep.state.status;
    const statusText = state.valid
      ? `${labels[state.status]}${state.busy && state.status === 'paused' ? ' · 현재 계산 묶음을 마무리합니다.' : ''}`
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    if (status.textContent !== statusText) status.textContent = statusText;
    error.hidden = !state.error;
    if (error.textContent !== state.error) error.textContent = state.error;
    start.textContent = state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid || sweeping;
    pause.disabled = state.status !== 'running';
    step.disabled =
      state.status === 'running' || state.status === 'completed' || !state.valid || state.busy || sweeping;
    reset.disabled = sweeping;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = `t = ${sample.time.toFixed(4)} s`;
    time.dataset.time = String(sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 표본`);
    sampling.textContent = `기록 간격 ${state.sampleStride}단계 (${(state.sampleStride * state.config.step).toPrecision(4)} s) · 최대 ${state.maxSamples}개 표본. 마지막 수신 상태를 CSV에 포함합니다.`;
    energy.textContent = `진단 에너지 ${sample.energy.toPrecision(6)} J`;
    signals.hidden = !drivenHasForcing(id) && !drivenSupportsController(id);
    signals.textContent = [
      ...(drivenHasForcing(id) ? [`구동 입력 ${sample.forcing.toPrecision(6)} ${drivenInputUnit(id)}`] : []),
      ...(drivenSupportsController(id)
        ? [`제어 입력 ${sample.control.toPrecision(6)} ${id === 'system:cartpole' ? 'N' : 'rad/s²'}`]
        : [])
    ].join(' · ');
    if (id === 'system:cartpole')
      signals.textContent += ` · 일정 외력 ${state.config.parameters.force!.toPrecision(6)} N · 총 힘 ${(state.config.parameters.force! + sample.forcing + sample.control).toPrecision(6)} N`;
    controlValue.value = `제어 출력 ${sample.control.toPrecision(6)} ${id === 'system:cartpole' ? 'N' : 'rad/s²'}`;
    controlValue.dataset.control = String(sample.control);
    controlValue.hidden = !drivenSupportsController(id);
    reference.hidden = !drivenSupportsController(id);
    reference.textContent = `기준값 ${sample.reference.toPrecision(6)} · 관측 상태 ${(sample.reference - sample.error).toPrecision(6)} · 기준−상태 오차 ${sample.error.toPrecision(6)} ${id === 'system:cartpole' ? 'm' : 'rad'}`;
    const warningText = sample.warnings.join(' ');
    if (warnings.textContent !== warningText) warnings.textContent = warningText;
    warnings.hidden = !warningText;
    states.replaceChildren(
      ...drivenStateFields(id).map(([key, label, unit], i) => {
        const card = element(document, 'article', 'driven-state-card');
        card.append(
          element(document, 'h3', '', label),
          element(document, 'p', '', `${key} = ${sample.state[i]!.toPrecision(6)} ${unit}`)
        );
        return card;
      })
    );
    updateScene();
    inspector.update();
    if (sweeping)
      for (const input of inspector.element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        'input,select,button'
      ))
        input.disabled = true;
    files.update();
    coreDiagnostics.update();
    if (tabs.selectedId === 'analysis') updatePlot();
    updating = false;
  }
  const unsubscribe = model.subscribe(() => {
      update();
      sweepUpdate();
    }),
    unsubscribeSweep = sweep.subscribe(sweepUpdate);
  update();
  sweepUpdate();
  updatePlot(true);
  return {
    element: view,
    dispose() {
      session!.delete(key);
      session!.set(key, { config: model.state.config, tray });
      while (session!.size > 8) session!.delete(session!.keys().next().value!);
      unsubscribe();
      unsubscribeSweep();
      model.dispose();
      sweep.dispose();
      coreDiagnostics.dispose();
      files.dispose();
      tabs.dispose();
    }
  };
}
