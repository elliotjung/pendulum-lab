import { element, link, pageHeading } from '../../app/dom';
import { createButton, createProgress, createSection } from '../../design-system/primitives';
import { createTabs } from '../../design-system/tabs';
import type { SystemDefinition } from '../../contracts/catalog';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import {
  defaultFieldConfig,
  fromCanonicalField,
  fieldIsDiagnostic,
  fieldWarnings,
  type FieldConfig,
  type FieldSystemId
} from '../../adapters/physics/field';
import { createFieldModel, type FieldStatus } from './field-model';
import { createFieldInspector } from './field-inspector';
import { createFieldFiles } from './field-files';
import { createFieldDiagnostics } from './field-diagnostics';
import { loadFieldConfig } from './field-storage';
import { fieldTrajectoryPlot, fieldPlotDescription, exportFieldFigure, type FieldPlotKind } from './field-plots';

const labels: Record<FieldStatus, string> = {
  ready: '실행 준비 완료',
  running: '실행 중',
  paused: '일시정지',
  completed: '실행 완료',
  cancelled: '실행 취소됨',
  error: '실행 오류'
};
const sessions = new WeakMap<Document, Map<string, { config: FieldConfig; tray: FieldConfig[] }>>();
export function createFieldWorkspace(document: Document, system: SystemDefinition, experiment?: ExperimentStateV1) {
  const view = element(document, 'div', 'product-page product-lab-page lab-workspace field-workspace');
  view.append(
    link(document, '시스템 라이브러리', '#/lab'),
    element(document, 'p', 'product-eyebrow', 'LAB · 확률·격자·장'),
    pageHeading(document, system.name.ko),
    element(
      document,
      'p',
      'product-lead',
      system.id === 'system:langevin'
        ? '정규화 단일 진자에 가산 Itô 속도 잡음을 넣어 seed 기반 앙상블을 계산합니다.'
        : system.description.ko
    )
  );
  let initial = defaultFieldConfig(system.id as FieldSystemId),
    warning = '';
  if (experiment) {
    const parsed = fromCanonicalField(experiment);
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
      initial = loadFieldConfig(document.defaultView!.localStorage, initial.systemId) ?? initial;
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
    model = createFieldModel(initial),
    diagnostic = fieldIsDiagnostic(initial.systemId),
    stochastic = initial.systemId === 'system:langevin';
  view.append(
    element(
      document,
      'p',
      'lab-muted',
      '주 실행의 시간·공간·상태·에너지는 정규화 값입니다. 독립 진단 패널은 각 표시 단위를 따릅니다. 화면을 떠나면 계산을 종료합니다. 저장한 초기 설정은 유지합니다.'
    ),
    link(document, '기존 앱 열기', './app.html')
  );
  if (warning) view.append(element(document, 'p', 'lab-preview-note', warning));
  if (experiment)
    view.append(
      element(document, 'p', 'lab-preview-note', '공유한 격자·경계·초기조건·seed·앙상블·실행 조건을 복원했습니다.')
    );
  function selector(key: string, title: string, entries: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    control.id = `field-${key}`;
    label.htmlFor = control.id;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    return { label, control };
  }
  const run = createSection(document, { id: 'field-run', title: diagnostic ? '정적 진단' : '실행 제어' }),
    status = element(document, 'p', 'lab-run-status'),
    error = element(document, 'p', 'ds-field__error');
  status.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const start = createButton(document, { label: diagnostic ? '진단 계산' : '실행', onClick: () => model.run() }),
    pause = createButton(document, { label: '일시정지', variant: 'secondary', onClick: () => model.pause() }),
    step = createButton(document, { label: '한 단계', variant: 'secondary', onClick: () => model.step() }),
    reset = createButton(document, { label: '처음으로', variant: 'secondary', onClick: () => model.reset() }),
    cancel = createButton(document, { label: '실행 취소', variant: 'secondary', onClick: () => model.cancel() });
  const actions = element(document, 'div', 'lab-run-actions');
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
  time.setAttribute('aria-label', '현재 정규화 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'field-progress', label: '실행 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'field-sampling';
  run.body.append(status, error, actions, speed.label, speed.control, time, progress.element, sampling);
  view.append(run.element);
  if (diagnostic) {
    pause.hidden = true;
    step.hidden = true;
    speed.label.hidden = true;
    speed.control.hidden = true;
    progress.element.hidden = true;
    time.hidden = true;
  }
  const workspace = createSection(document, {
    id: 'field-preview',
    title: '작업 공간',
    description: diagnostic
      ? 'native 정적 진단의 프로필과 수렴 상태입니다. 시간 애니메이션은 수행하지 않습니다.'
      : '전체 평균·공간 프로필과 개별 경로를 같은 기록 표본에서 확인합니다.'
  });
  const display = selector('display-mode', '상태 표시', [
      ['aggregate', '전체 요약'],
      ['individual', '개별 상태']
    ]),
    member = selector('member-select', stochastic ? '선택할 member' : '선택할 격자점', []);
  const summary = element(document, 'p', 'field-signals'),
    individual = element(document, 'p', 'field-state-card'),
    warnings = element(document, 'p', 'lab-preview-note'),
    lineage = element(document, 'p', 'lab-muted'),
    sceneCaption = element(document, 'p', 'field-plot-caption lab-muted'),
    scene = element(document, 'div', 'field-scene');
  sceneCaption.id = 'field-scene-caption';
  scene.setAttribute('aria-describedby', sceneCaption.id);
  summary.id = 'field-summary';
  warnings.id = 'field-warnings';
  lineage.id = 'field-provenance';
  workspace.body.append(
    display.label,
    display.control,
    member.label,
    member.control,
    summary,
    individual,
    scene,
    sceneCaption,
    lineage,
    warnings
  );
  display.control.addEventListener('change', update);
  member.control.addEventListener('change', () => {
    update();
    updatePlot(true);
  });
  const analysis = createSection(document, {
    id: 'field-analysis',
    title: '분석',
    description:
      '주 실행 그래프의 축은 정규화 값입니다. 독립 이원자 진단은 SI 단위를 따릅니다. 기록 간격·해상도·모델 범위를 확인하세요.'
  });
  const choices: readonly (readonly [string, string])[] = stochastic
    ? [
        ['ensemble', '앙상블 평균과 산포'],
        ['state', '개별 궤적'],
        ['profile', '현재 평균 프로필']
      ]
    : diagnostic
      ? initial.systemId === 'system:lattice-fk-limit'
        ? [
            ['modes', '조화 분산 모드'],
            ['profile', '모드 프로필']
          ]
        : [['profile', '정적 kink 프로필']]
      : [
          ['heatmap', '공간·시간 heatmap'],
          ['profile', '현재 공간 프로필'],
          ['state', '개별 격자점 / 시간'],
          ...(initial.systemId === 'system:fput' ? ([['modes', '조화 모드 에너지']] as const) : [])
        ];
  const kind = selector('plot-kind', '그래프 종류', choices),
    description = element(document, 'p', 'lab-muted'),
    plot = element(document, 'div', 'core-plot-frame'),
    caption = element(document, 'p', 'field-plot-caption lab-muted');
  caption.id = 'field-plot-caption';
  analysis.body.append(
    kind.label,
    kind.control,
    description,
    plot,
    caption,
    createFieldDiagnostics(document, initial.systemId)
  );
  kind.control.addEventListener('change', () => updatePlot(true));
  let lastPlotSignature = '',
    nodeCount = 0,
    lastPlotAt = 0;
  function updatePlot(force = false) {
    const state = model.state,
      selected = Number(member.control.value) || 0,
      signature = `${state.revision}:${state.sample.step}:${kind.control.value}:${selected}`;
    if (!force && (signature === lastPlotSignature || (state.status === 'running' && Date.now() - lastPlotAt < 100)))
      return;
    lastPlotSignature = signature;
    lastPlotAt = Date.now();
    description.textContent = fieldPlotDescription(state.config, kind.control.value as FieldPlotKind);
    plot.replaceChildren(
      fieldTrajectoryPlot(document, state.config, state.samples, kind.control.value as FieldPlotKind, selected)
    );
    caption.textContent = `${description.textContent} 기록 ${state.samples.length}시각 · τ=${state.samples[0]!.time}–${state.sample.time} · N=${state.config.grid.points} · ${state.config.grid.boundary}.`;
    scene.replaceChildren(
      fieldTrajectoryPlot(document, state.config, state.samples, stochastic ? 'ensemble' : 'profile', selected)
    );
    sceneCaption.textContent = fieldPlotDescription(state.config, stochastic ? 'ensemble' : 'profile');
    scene.querySelector('svg')?.setAttribute('aria-describedby', sceneCaption.id);
    plot.querySelector('svg')?.setAttribute('aria-describedby', caption.id);
  }
  const inspector = createFieldInspector(document, model, () => updatePlot(true)),
    files = createFieldFiles(
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
        exportFieldFigure(
          document,
          model.state.config,
          model.state.samples,
          kind.control.value as FieldPlotKind,
          Number(member.control.value) || 0
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
      sample = state.sample,
      selected = Number(member.control.value) || 0;
    view.dataset.labStatus = state.status;
    view.dataset.busy = String(state.busy);
    status.textContent = state.valid
      ? diagnostic
        ? `정적 진단 · ${labels[state.status]}`
        : labels[state.status]
      : '편집한 조건을 적용하거나 편집을 취소하세요.';
    error.hidden = !state.error;
    error.textContent = state.error;
    start.textContent = diagnostic ? '진단 계산' : state.status === 'paused' ? '실행 계속' : '실행';
    start.disabled = state.status === 'running' || !state.valid;
    pause.disabled = state.status !== 'running';
    step.disabled = state.status === 'running' || state.status === 'completed' || !state.valid || state.busy;
    reset.disabled = state.busy;
    cancel.disabled = !['running', 'paused'].includes(state.status) && !state.busy;
    time.value = `τ = ${sample.time.toFixed(4)} (정규화)`;
    time.dataset.time = String(sample.time);
    progress.setValue(state.progress * 100, `${(state.progress * 100).toFixed(1)}% · ${state.samples.length}개 기록`);
    sampling.textContent = diagnostic
      ? '정적 native 계산입니다. 시간 표본 1개는 공간/모드 프로필이며 궤적이 아닙니다.'
      : `기록 간격 ${state.sampleStride}단계 · 최대 ${state.maxSamples}개 시각 · ${state.config.grid.points}격자점 · ${state.config.ensemble.members}member. 모든 적분 단계를 메모리에 보관하지 않습니다.`;
    const count = stochastic ? state.config.ensemble.members : state.config.grid.points;
    if (count !== nodeCount) {
      nodeCount = count;
      member.control.replaceChildren(
        ...Array.from({ length: count }, (_, i) => {
          const option = element(document, 'option', '', stochastic ? `member-${i + 1}` : `격자점 ${i + 1}`);
          option.value = String(i);
          return option;
        })
      );
    }
    summary.hidden = display.control.value !== 'aggregate';
    individual.hidden = display.control.value !== 'individual';
    summary.textContent = stochastic
      ? `θ 평균 ${sample.profile[0]!.toPrecision(6)} · 표본 분산 ${sample.variance[0]!.toPrecision(6)} · ${sample.ensemble.members}member · 평균 역학 에너지 ${sample.energy.toPrecision(6)} (정규화)`
      : initial.systemId === 'system:lattice-fk-limit'
        ? `조화 고리의 ${sample.profile.length}개 모드 · 값은 ω² (정규화) · 시간 진화·역학 에너지는 해당하지 않습니다.`
        : `에너지 ${sample.energy.toPrecision(6)} (정규화) ${['system:sine-gordon', 'system:frenkel-kontorova'].includes(initial.systemId) ? ` · charge ${sample.charge.toPrecision(6)}` : ''}${initial.systemId === 'system:frenkel-kontorova' ? ` · 기울기 norm ${sample.gradNorm.toPrecision(6)} · ${sample.iterations}회 · ${sample.converged ? '허용치 내 수렴' : '미수렴'}` : ''}`;
    const index = Math.min(selected, count - 1),
      value = stochastic ? sample.memberStates[index] : [sample.profile[index]];
    individual.textContent = stochastic
      ? `member-${index + 1} · seed ${sample.ensemble.seeds[index]} · θ=${value?.[0]} · ω=${value?.[1]} (정규화)`
      : `격자/모드 ${index + 1} · 값=${value?.[0]} (정규화)`;
    lineage.textContent = `seed=${state.config.seed.value} · ${sample.ensemble.generator}@${sample.ensemble.generatorVersion} · ${sample.ensemble.members}member. 전체 member ID와 seed는 실행 계보 JSON에 보존합니다.`;
    warnings.textContent = [...fieldWarnings(state.config), ...sample.warnings].join(' ');
    inspector.update();
    files.update();
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
      files.dispose();
      session!.delete(key);
      session!.set(key, { config: model.state.config, tray });
      while (session!.size > 8) session!.delete(session!.keys().next().value!);
    }
  };
}
