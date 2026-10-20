import { createDiagnostics } from './diagnostics';
import { toCanonicalDiscrete } from '../../adapters/physics/discrete';
import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultDiscreteConfig,
  fromCanonicalDiscrete,
  discreteWarnings,
  type DiscreteConfig,
  type DiscreteSystemId
} from '../../adapters/physics/discrete';
import { createDiscreteModel, type DiscreteModel, type DiscreteStatus } from './discrete-model';
import { createDiscreteInspector } from './discrete-inspector';
import { createDiscreteFiles } from './discrete-files';
import { loadDiscreteConfig } from './discrete-storage';
import {
  discreteTrajectoryPlot,
  discretePlotDescription,
  exportDiscreteFigure,
  type DiscretePlotKind
} from './discrete-plots';

const labels: Record<DiscreteStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: DiscreteConfig; tray: DiscreteConfig[] }>>();
export function createDiscreteWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace discrete-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 이산 사상·양자'),
    pageHeading(document, system.name.ko),
    element(document, 'p', 'product-lead', system.description.ko)
  );
  let initial = defaultDiscreteConfig(system.id as DiscreteSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalDiscrete(experiment);
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
      initial = loadDiscreteConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
    } catch (cause) {
      warning = `저장한 설정을 읽지 못해 기본 설정을 표시합니다. 원본 저장 키를 보존합니다. ${cause instanceof Error ? cause.message : ''}`;
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
    map = initial.systemId === 'system:standard-map',
    spectral = initial.systemId === 'system:unitary-floquet',
    quantum = initial.systemId === 'system:quantum-kicked-rotor';
  let model: DiscreteModel;
  try {
    model = createDiscreteModel(initial);
  } catch (cause) {
    if (experiment) {
      const alert = element(
        document,
        'p',
        'ds-field__error',
        `공유한 연산자의 초기 평가에 실패했습니다. ${cause instanceof Error ? cause.message : ''} 원본 링크를 보존하세요.`
      );
      alert.setAttribute('role', 'alert');
      view.append(alert, link(document, '기본 설정으로 시작', `#/lab/${system.id.slice(7)}`));
      return { element: view, dispose() {} };
    }
    warning = `저장한 연산자의 초기 평가에 실패해 기본 설정을 표시합니다. ${cause instanceof Error ? cause.message : ''} 원본 저장 키를 보존합니다.`;
    model = createDiscreteModel(defaultDiscreteConfig(initial.systemId));
  }
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      map
        ? 'θ는 rad, p는 정규화 운동량입니다. 주 실행은 iteration 단위입니다. 화면을 떠나면 계산을 종료하고 초기 설정을 유지합니다.'
        : spectral
          ? '복소 주기 연산자를 한 번 평가합니다. 고유위상은 rad, 준에너지는 정규화 값입니다. raw 고유값·유니터리 결함을 표시합니다.'
          : '한 iteration은 한 킥 주기입니다. 운동량 격자 인덱스 m은 정수이고 p=ℏm입니다. 복소 상태와 확률 norm을 자동으로 재정규화하지 않습니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(
      element(document, 'p', 'lab-preview-note', '공유한 계수·초기 상태·복소 파동함수·행렬·반복 조건을 복원했습니다.')
    );
  function selector(key: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    control.id = `discrete-${key}`;
    label.htmlFor = control.id;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    return { label, control };
  }
  const run = createSection(document, { id: 'discrete-run', title: spectral ? '스펙트럼 평가' : '실행 제어' }),
    status = element(document, 'p', 'lab-run-status'),
    error = element(document, 'p', 'ds-field__error');
  status.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const start = createButton(document, { label: spectral ? '스펙트럼 계산' : '실행', onClick: () => model.run() }),
    pause = createButton(document, { label: '일시정지', variant: 'secondary', onClick: () => model.pause() }),
    step = createButton(document, { label: '한 단계', variant: 'secondary', onClick: () => model.step() }),
    reset = createButton(document, { label: '처음으로', variant: 'secondary', onClick: () => model.reset() }),
    cancel = createButton(document, { label: '실행 취소', variant: 'secondary', onClick: () => model.cancel() });
  const actions = element(document, 'div', 'lab-run-actions');
  actions.append(start, pause, step, reset, cancel);
  const speed = selector('speed', '반복 재생 속도', [
    ['0.25', '0.25×'],
    ['1', '1×'],
    ['4', '4×']
  ]);
  speed.control.value = '1';
  speed.control.addEventListener('change', () => model.setSpeed(Number(speed.control.value)));
  const iteration = element(document, 'output', 'core-time');
  iteration.id = 'discrete-iteration';
  iteration.setAttribute('aria-label', spectral ? '현재 평가 iteration' : '현재 iteration');
  iteration.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'discrete-progress', label: '반복 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'discrete-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, iteration, progress.element, sampling);
  view.append(run.element);
  if (spectral) {
    pause.hidden = true;
    step.hidden = true;
    speed.label.hidden = true;
    speed.control.hidden = true;
    progress.element.hidden = true;
  }
  const workspace = createSection(document, {
    id: 'discrete-preview',
    title: '작업 공간',
    description: map
      ? '기록한 사상 반복을 θ·p 위상 원통에서 봅니다.'
      : spectral
        ? '입력 복소 연산자의 raw 스펙트럼과 유니터리 진단입니다.'
        : '실제 복소 운동량 상태의 확률 분포와 norm을 봅니다.'
  });
  const summary = element(document, 'p', 'discrete-signals'),
    warnings = element(document, 'p', 'lab-preview-note'),
    diagnostics = element(document, 'p', 'discrete-signals'),
    scene = element(document, 'div', 'core-plot-frame'),
    sceneCaption = element(document, 'p', 'discrete-plot-caption lab-muted');
  summary.id = 'discrete-summary';
  warnings.id = 'discrete-warnings';
  diagnostics.id = 'discrete-diagnostics';
  sceneCaption.id = 'discrete-scene-caption';
  scene.setAttribute('aria-describedby', sceneCaption.id);
  workspace.body.append(summary, diagnostics, scene, sceneCaption, warnings);
  const analysis = createSection(document, {
    id: 'discrete-analysis',
    title: '분석',
    description: '호환 가능한 이산 진단만 표시합니다. 각 그래프의 축·위상 가지·유한 격자 한도를 확인하세요.'
  });
  const choices: readonly (readonly [string, string])[] = map
    ? [['phase', '위상 원통 θ·p']]
    : spectral
      ? [['spectrum', '고유위상과 준에너지']]
      : [
          ['probability', '운동량 확률 분포'],
          ['wavephase', '복소 파동함수 위상'],
          ['momentum', '⟨m²⟩ / iteration'],
          ['spectrum', '동일 격자 준에너지']
        ];
  const kind = selector('plot-kind', '그래프 종류', choices),
    description = element(document, 'p', 'lab-muted'),
    plot = element(document, 'div', 'core-plot-frame'),
    caption = element(document, 'p', 'discrete-plot-caption lab-muted'),
    spectrum = element(document, 'pre', 'lab-data-output');
  caption.id = 'discrete-plot-caption';
  spectrum.id = 'discrete-spectrum';
  spectrum.setAttribute('aria-label', 'raw 스펙트럼 수치');
  analysis.body.append(kind.label, kind.control, description, plot, caption, spectrum);
  let lastPlotSignature = '',
    lastPlotAt = 0;
  function updatePlot(force = false) {
    const state = model.state,
      signature = `${state.revision}:${state.sample.step}:${kind.control.value}`;
    if (!force && (signature === lastPlotSignature || (state.status === 'running' && Date.now() - lastPlotAt < 100)))
      return;
    lastPlotSignature = signature;
    lastPlotAt = Date.now();
    const selected = kind.control.value as DiscretePlotKind,
      primary = map ? 'phase' : spectral ? 'spectrum' : 'probability';
    description.textContent = discretePlotDescription(state.config, selected);
    plot.replaceChildren(discreteTrajectoryPlot(document, state.config, state.samples, selected));
    caption.textContent = `${description.textContent} 기록 ${state.samples.length}개 · iteration ${state.samples[0]!.iteration}–${state.sample.iteration} · N=${state.config.gridSize}.`;
    scene.replaceChildren(discreteTrajectoryPlot(document, state.config, state.samples, primary));
    sceneCaption.textContent = discretePlotDescription(state.config, primary);
    plot.querySelector('svg')?.setAttribute('aria-describedby', caption.id);
    scene.querySelector('svg')?.setAttribute('aria-describedby', sceneCaption.id);
    const raw = state.sample.spectrum;
    spectrum.hidden = !raw;
    spectrum.textContent = raw
      ? raw.phases
          .map(
            (phase, i) =>
              `모드 ${i}: λ=${raw.eigenvalues[i]!.re} + i(${raw.eigenvalues[i]!.im}) · φ=${phase} rad · ε=${raw.quasiEnergies[i]} (정규화)`
          )
          .join('\n')
      : '';
  }
  kind.control.addEventListener('change', () => updatePlot(true));
  const inspector = createDiscreteInspector(document, model, () => updatePlot(true)),
    files = createDiscreteFiles(
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
        exportDiscreteFigure(document, model.state.config, model.state.samples, kind.control.value as DiscretePlotKind)
    );
  const coreDiagnostics = createDiagnostics(document, {
    experiment: () => toCanonicalDiscrete(model.state.config),
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
    onChange() {
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
    status.textContent = state.valid
      ? `${spectral ? '스펙트럼 평가 · ' : ''}${labels[state.status]}`
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = spectral ? '스펙트럼 계산' : state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || state.busy;
    reset.disabled = state.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    iteration.value = spectral
      ? `평가 ${state.status === 'completed' ? '완료' : '준비'} · iteration ${sample.iteration}`
      : `iteration = ${sample.iteration} · 전진 ${sample.step}/${state.config.iterations}`;
    iteration.dataset.iteration = String(sample.iteration);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 기록`);
    sampling.textContent = spectral
      ? '행렬을 한 번 평가합니다. 궤적 시간·반복 전진은 해당하지 않습니다.'
      : `기록 간격 ${state.sampleStride}반복 · 최대 ${state.maxSamples}개 표본 · 한 worker 요청은 제한된 반복만 전진합니다. 화면을 떠나면 실행을 취소합니다.`;
    summary.dataset.norm = String(sample.norm);
    summary.dataset.normDrift = String(sample.normDrift);
    summary.textContent = map
      ? `iteration ${sample.iteration} · θ=${sample.theta.toPrecision(7)} rad (wrapped) · p=${sample.p.toPrecision(7)} (정규화, unwrapped)`
      : quantum
        ? `iteration ${sample.iteration} · norm Σ|ψ|²=${sample.norm.toPrecision(8)} · 1 기준 norm 편차=${sample.normDrift.toPrecision(5)} · ⟨m²⟩=${sample.meanSquareMomentum.toPrecision(7)} · ⟨p²⟩=ℏ²⟨m²⟩=${(state.config.parameters.hbar! ** 2 * sample.meanSquareMomentum).toPrecision(7)} (정규화)`
        : `복소 ${state.config.gridSize}×${state.config.gridSize} 연산자 · ${sample.spectrum?.phases.length ?? 0}개 모드 · 단위원 투영 없음`;
    diagnostics.textContent = sample.spectrum
      ? `raw 유니터리 결함 (unitarity defect)=${sample.spectrum.unitarityDefect.toPrecision(7)} · 최대 단위원 이탈=${sample.spectrum.maxUnitCircleDrift.toPrecision(7)} · 고유위상 φ (rad)와 준에너지 ε=−ℏφ/T · 주가지, 투영 false`
      : map
        ? '사상 반복은 한 번의 kick 후 drift입니다. 연속 시간 에너지 보존과 동일한 진단이 아닙니다.'
        : `초기 norm=${state.config.wavefunction ? state.config.wavefunction.re.reduce((sum, value, i) => sum + value ** 2 + state.config.wavefunction!.im[i]! ** 2, 0).toPrecision(8) : '—'}. 1 기준 norm 편차와 초기 norm 보존 오차는 다릅니다. 자동 재정규화 없음. N>8은 같은 격자 준에너지를 계산하지 않습니다.`;
    warnings.textContent = [...new Set([...discreteWarnings(state.config), ...sample.warnings])].join(' ');
    inspector.update();
    files.update();
    coreDiagnostics.update();
    updatePlot();
    updating = false;
  }
  const unsubscribe = model.subscribe(update);
  update();
  return {
    element: view,
    dispose() {
      unsubscribe();
      model.dispose();
      coreDiagnostics.dispose();
      files.dispose();
      session!.delete(key);
      session!.set(key, { config: model.state.config, tray });
      while (session!.size > 8) session!.delete(session!.keys().next().value!);
    }
  };
}
