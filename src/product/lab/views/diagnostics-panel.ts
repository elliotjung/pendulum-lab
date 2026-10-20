import { element } from '../../app/dom';
import { createButton, createInput, createProgress, type InputControl } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { DiagnosticsOptions } from './diagnostics';
import {
  CORE_DIAGNOSTIC_KINDS,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_NAMES,
  type CoreDiagnosticKind,
  type CoreDiagnosticRequest,
  type CoreDiagnosticSettings,
  type CoreDiagnosticResult,
  type DiagnosticSeries
} from '../../adapters/analysis/core/contracts';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import {
  defaultCoreSettings,
  coreDiagnosticRejection,
  validateCoreSettings
} from '../../adapters/analysis/core/settings';
import { createCoreDiagnosticJob } from '../../adapters/analysis/core/client';
import {
  createCoreDiagnosticArtifact,
  exportCoreDiagnosticArtifact,
  importCoreDiagnosticArtifact
} from '../../adapters/analysis/core/artifact';
import { createPlot } from './core-plots';

const labels: Record<string, string> = {
  coordinate: '관측 좌표 번호 (0부터)',
  phaseCoordinate: '위상 세로축 좌표 번호 (0부터)',
  transient: '제외할 과도 구간',
  duration: '분석 관찰 기간',
  window: 'FFT 창 함수',
  terms: 'NAFF 성분 수',
  refineIterations: '주파수 정밀화 반복 수',
  sectionValue: '단면 좌표값',
  direction: '단면 교차 방향',
  transientCrossings: '제외할 초기 교차 수',
  maxPoints: '최대 단면 교차 수',
  renormEvery: '접선 재규격화 간격 (step)',
  seed: '재현 seed',
  count: '지수 개수 (0 = 전체 상태 차원)',
  sampleEvery: '결과 기록 간격 (step)',
  stride: '0–1 검사 표본 stride',
  cSamples: '0–1 검사 주파수 수',
  ncutFraction: '0–1 최대 지연 비율',
  threshold: '수치 궤도 거리 허용치',
  referenceRatio: '참조 적분 세분화 비율'
};

/** An immutable click-time snapshot separates diagnostics from the animation worker. */
export function createDiagnosticsPanel(document: Document, options: DiagnosticsOptions, container: HTMLDetailsElement) {
  container.dataset.coreDiagnosticStatus = 'empty';
  const body = element(document, 'div', 'core-diagnostics-body');
  container.append(body);
  const note = element(
    document,
    'p',
    'lab-muted',
    '현재 실험과 기록 표본을 별도 worker에서 분석합니다. 계산을 시작한 순간의 입력을 결과 파일에 보존합니다. 초기조건으로 다시 적분하는 도구와 기록 표본을 사용하는 도구를 구분하세요.'
  );
  const label = element(document, 'label', 'ds-field__label', '핵심 진단 도구');
  label.htmlFor = 'core-diagnostic-kind';
  const select = element(document, 'select', 'ds-field__control');
  select.id = 'core-diagnostic-kind';
  for (const kind of CORE_DIAGNOSTIC_KINDS) {
    const option = element(document, 'option', '', CORE_DIAGNOSTIC_NAMES[kind]);
    option.value = kind;
    select.append(option);
  }
  const source = element(document, 'p', 'lab-muted');
  source.id = 'core-diagnostic-source';
  const sourceWarnings = element(document, 'p', 'lab-preview-note');
  sourceWarnings.id = 'core-diagnostic-source-warnings';
  sourceWarnings.hidden = true;
  const fields = element(document, 'div', 'core-diagnostic-fields');
  const assumptions = element(document, 'details', 'lab-details');
  assumptions.append(
    element(document, 'summary', '', 'sampling·과도 구간·접선 모델·비용 안내'),
    element(
      document,
      'p',
      '',
      'FFT·NAFF는 유한하고 균일한 기록 간격을 요구합니다. Nyquist 주파수보다 빠른 변화와 유한 관찰 구간의 분해능을 확인하세요. 과도 구간은 관측 축의 시간 또는 반복 단위로 제외합니다. 샘플링 stride는 실제 기록 간격을 바꿉니다.'
    ),
    element(
      document,
      'p',
      '',
      'Poincaré·Lyapunov spectrum·SALI·FLI·shadowing은 검증된 매끄러운 연속 벡터장만 사용합니다. 이산 사상, 양자, 잡음, 지연, 충돌·포획·stick-slip에는 같은 접선 모델을 적용하지 않습니다. 접선 계산의 좌표 척도와 유한차분 Jacobian, 재규격화 간격에 대한 수렴을 확인하세요.'
    ),
    element(
      document,
      'p',
      '',
      '기록 투영·에너지는 표본 수에 비례하고 FFT는 O(N log N)입니다. NAFF·0–1은 성분·주파수·지연 수만큼 증가합니다. 전체 Lyapunov spectrum은 상태 및 접선 차원, shadowing은 세분한 참조 궤적 때문에 비쌉니다. 계산은 자원 상한을 적용하며 언제든 취소할 수 있습니다.'
    ),
    element(
      document,
      'p',
      '',
      '유한시간 지표, 양의 지수, 0–1 통계량 하나만으로 카오스를 확정하지 마세요. 잡음·짧은 기록·과표본화·적분 오차가 결과에 영향을 줍니다. 수치 shadowing 비교는 정확해에 대한 보증이 아닙니다.'
    )
  );
  const matrix = element(document, 'details', 'lab-details');
  matrix.id = 'core-diagnostic-compatibility';
  const matrixList = element(document, 'ul', 'core-diagnostic-compatibility-list');
  matrix.append(element(document, 'summary', '', '모든 핵심 도구의 호환성과 거부 이유'), matrixList);
  const rejection = element(document, 'p', 'lab-preview-note');
  rejection.id = 'core-diagnostic-rejection';
  rejection.setAttribute('role', 'status');
  const status = element(document, 'p', 'lab-muted', '기록을 실행한 뒤 관측 좌표와 분석 조건을 확인하세요.');
  status.id = 'core-diagnostic-status';
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'core-diagnostic-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = createProgress(document, { id: 'core-diagnostic-progress', label: '핵심 진단 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const actions = element(document, 'div', 'lab-inline-actions');
  const run = createButton(document, { label: '핵심 진단 계산', onClick: compute });
  const cancel = createButton(document, {
    label: '핵심 진단 취소',
    variant: 'secondary',
    onClick: () => job?.cancel()
  });
  const refresh = createButton(document, {
    label: '기록 새로 읽기',
    variant: 'secondary',
    onClick: () => refreshSource()
  });
  actions.append(run, cancel, refresh);
  const output = element(document, 'div', 'core-diagnostic-output');
  output.id = 'core-diagnostic-output';
  const files = element(document, 'div', 'core-diagnostic-files');
  const download = createButton(document, {
    label: '진단 artifact JSON 다운로드',
    variant: 'secondary',
    onClick: downloadArtifact
  });
  const importLabel = element(document, 'label', 'ds-field__label', '진단 artifact JSON 가져오기');
  importLabel.htmlFor = 'core-diagnostic-import';
  const input = element(document, 'input', 'ds-field__control');
  input.id = 'core-diagnostic-import';
  input.type = 'file';
  input.accept = '.json,application/json';
  files.append(
    download,
    importLabel,
    input,
    element(
      document,
      'p',
      'lab-muted',
      'artifact는 입력 run·알고리즘·설정·기록·결과를 가진 별도 파일입니다. 가져오면 저장된 결과를 다시 표시하며 현재 실험 조건이나 기존 앱 자료는 바꾸지 않습니다.'
    )
  );
  body.append(
    note,
    label,
    select,
    source,
    sourceWarnings,
    fields,
    assumptions,
    matrix,
    rejection,
    actions,
    progress.element,
    status,
    error,
    output,
    files
  );
  let kind: CoreDiagnosticKind = 'state-time';
  let settings: CoreDiagnosticSettings = defaultCoreSettings(kind);
  let snapshot: { experiment: ExperimentStateV1; series: DiagnosticSeries } | undefined;
  let sourceError = '';
  let cachedRejection: string | null = '기록을 새로 읽으세요.';
  let state = 'empty';
  let generation = 0;
  let disposed = false;
  let job: ReturnType<typeof createCoreDiagnosticJob> | undefined;
  let artifact: ReturnType<typeof createCoreDiagnosticArtifact> | undefined;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const numericControls = new Map<string, InputControl>();
  const isBusy = () => state === 'running';

  function readSource() {
    const canonical = options.experiment();
    if (!canonical.ok) throw new Error(canonical.issues.map((issue) => issue.message).join(' '));
    return { experiment: canonical.value, series: createDiagnosticSeries(canonical.value, options.samples()) };
  }
  function refreshSource() {
    try {
      snapshot = readSource();
      sourceError = '';
      const axisName =
        snapshot.series.axisUnit === 'normalized-time'
          ? '정규화 시간 τ'
          : snapshot.series.axisUnit === 'iteration'
            ? 'iteration (반복 번호)'
            : '시간 t (s)';
      source.textContent = `${snapshot.experiment.systemId} · 기록 ${snapshot.series.times.length}개 · 관측 축 ${axisName}. ${snapshot.series.labels.map((name, i) => `${i}: ${name} (${snapshot!.series.units[i]})`).join(' · ')}`;
      sourceWarnings.hidden = snapshot.series.times.length > 0 || snapshot.series.warnings.length === 0;
      sourceWarnings.textContent = snapshot.series.warnings.join(' ');
    } catch (cause) {
      snapshot = undefined;
      sourceError = cause instanceof Error ? cause.message : '입력 기록을 읽을 수 없습니다.';
      source.textContent = sourceError;
      sourceWarnings.hidden = true;
    }
    renderAvailability();
    updateFieldHelp();
    update(true);
  }
  function currentRejection(): string | null {
    try {
      validateCoreSettings(kind, settings);
      return snapshot
        ? coreDiagnosticRejection(kind, snapshot.experiment, snapshot.series, settings)
        : sourceError || '기록을 새로 읽으세요.';
    } catch (cause) {
      return cause instanceof Error ? cause.message : '분석 조건을 확인하세요.';
    }
  }
  function renderAvailability() {
    matrixList.replaceChildren(
      ...CORE_DIAGNOSTIC_KINDS.map((candidate) => {
        let reason = sourceError || '입력 기록이 없습니다.';
        if (snapshot) {
          try {
            reason =
              coreDiagnosticRejection(
                candidate,
                snapshot.experiment,
                snapshot.series,
                defaultCoreSettings(candidate, snapshot.experiment)
              ) ?? '';
          } catch (cause) {
            reason = cause instanceof Error ? cause.message : '지원 범위를 확인하세요.';
          }
        }
        const item = element(
          document,
          'li',
          '',
          `${CORE_DIAGNOSTIC_NAMES[candidate]}: ${reason || '현재 입력에서 사용 가능'}`
        );
        item.dataset.diagnosticKind = candidate;
        item.dataset.available = String(!reason);
        return item;
      })
    );
  }
  function invalidate() {
    artifact = undefined;
    output.replaceChildren();
    state = 'empty';
    container.dataset.coreDiagnosticStatus = state;
    error.hidden = true;
    progress.setValue(0);
  }
  function fieldHelp(key: string): string {
    const axis = snapshot?.series.axisUnit;
    const timeUnit = axis === 'iteration' ? 'iteration' : axis === 'normalized-time' ? '정규화 시간' : 's';
    const coordinate = Number(settings.coordinate ?? 0);
    const coordinateUnit = snapshot?.series.units[coordinate] ?? '선택 좌표의 단위';
    const step = snapshot?.experiment.runtime.domain === 'time' ? snapshot.experiment.runtime.step.value : undefined;
    const hints: Record<string, string> = {
      coordinate: '0–255의 정수이며 실제 기록 차원 이하여야 합니다. 위 관측 목록의 번호와 단위를 확인하세요.',
      phaseCoordinate: '0–255의 정수이며 실제 기록 차원 이하여야 합니다. 두 좌표의 단위와 척도를 각각 해석하세요.',
      transient: `범위 0–300 ${timeUnit}. 스펙트럼·0–1은 기록 앞부분을 제외하고, 접선 지표는 측정 전에 별도 적분합니다. 남은 표본 수와 전체 step 예산을 확인하세요.`,
      duration: `범위 ${step ?? '0보다 큰 값'}–300 ${timeUnit}. 기간과 과도 구간의 합은 최대 100,000 step이며 접선 차원별 추가 예산을 적용합니다. 실제 기간은 step의 정수 배로 올림됩니다.`,
      window: 'Hann 창 또는 창 없음. 평균을 제거한 실수 신호의 단측 진폭이며 창의 coherent gain을 보정합니다.',
      terms:
        '정수 1–16. 추출할 복소 주파수 성분 수이며 사용 표본 수 이하여야 합니다. 실수 신호는 ±주파수 쌍을 포함할 수 있습니다.',
      refineIterations:
        '정수 8–128. NAFF 주파수 탐색 정밀화 반복 수입니다. 늘리면 비용이 증가하며 유한 관측 분해능을 보장하지 않습니다.',
      sectionValue: `범위 −1,000,000–1,000,000 (${coordinateUnit}). 감싸지 않은 native 좌표와 이 값의 교차를 검출합니다.`,
      direction:
        '증가·감소·양방향 중 선택합니다. 좌표−단면값의 부호 변화 방향이며 단순히 저장 표본을 연결하는 단면이 아닙니다.',
      transientCrossings: '정수 0–4,096. 초기 교차를 이 수만큼 버린 뒤 결과를 보존합니다.',
      maxPoints: '정수 1–4,096. 보존할 단면 교차의 상한입니다. 상한 또는 관찰 기간에 도달하면 종료합니다.',
      renormEvery:
        '정수 1–10,000 step이며 측정 step 수 이하여야 합니다. QR 재규격화 간격을 바꾸어 지수의 수렴을 확인하세요.',
      seed: '정수 0–4,294,967,295. 이 진단의 교란·시험 주파수 생성 seed이며 원래 시스템의 잡음 seed와 별개입니다.',
      count:
        '정수 0–32이며 실제 접선 상태 차원 이하여야 합니다. 0은 전체 spectrum입니다. 구동 위상·보조 시간 좌표를 포함할 수 있으며 큰 차원은 비용이 급증합니다.',
      sampleEvery: '정수 1–10,000 step. 진단 결과의 기록 간격이며 내부 적분 시간 간격을 바꾸지 않습니다.',
      stride:
        '정수 1–1,000. 남은 기록에서 이 간격으로 관측을 선택합니다. 실제 검사 간격·Nyquist 한계가 변하며 자동 보간하지 않습니다.',
      cSamples: '정수 1–100. 0–1 검사에 사용하는 시험 주파수 수입니다. 주파수·표본·지연의 곱에 계산 예산을 적용합니다.',
      ncutFraction:
        '범위 0.01–0.5. 최대 지연은 사용 표본 수 × 비율의 내림값입니다. 최소 20표본과 2개 이상의 지연이 필요합니다.',
      threshold:
        '범위 10⁻¹²–10⁶. native 상태의 최대 좌표 차이(max norm) 허용치입니다. 단위가 다른 좌표의 척도 선택에 민감하며 엄밀한 오차 한계가 아닙니다.',
      referenceRatio:
        '정수 2–32. 참조 적분은 후보 step을 이 비율로 나누며 더 세분한 참조와도 비교합니다. 비율에 따라 비용이 증가합니다.'
    };
    const defaultValue = defaultCoreSettings(kind, snapshot?.experiment)[key];
    return `${hints[key] ?? '검증 가능한 유한 설정값을 입력하세요.'} 기본값 ${String(defaultValue)}.`;
  }
  function renderFields() {
    fields.replaceChildren();
    numericControls.clear();
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string') {
        const group = element(document, 'div', 'ds-field');
        const fieldLabel = element(document, 'label', 'ds-field__label', labels[key] ?? key);
        const control = element(document, 'select', 'ds-field__control');
        control.id = `core-diagnostic-${key}`;
        fieldLabel.htmlFor = control.id;
        const choices =
          key === 'direction'
            ? [
                ['rising', '증가 방향'],
                ['falling', '감소 방향'],
                ['both', '양방향']
              ]
            : [
                ['hann', 'Hann'],
                ['none', '없음']
              ];
        for (const [id, text] of choices) {
          const option = element(document, 'option', '', text);
          option.value = id!;
          control.append(option);
        }
        control.value = value;
        control.addEventListener('change', () => {
          invalidate();
          settings[key] = control.value;
          update(true);
        });
        const help = element(document, 'p', 'ds-field__help', fieldHelp(key));
        help.id = `${control.id}-help`;
        control.setAttribute('aria-describedby', help.id);
        group.append(fieldLabel, control, help);
        fields.append(group);
      } else {
        const control = createInput(document, {
          id: `core-diagnostic-${key}`,
          label: labels[key] ?? key,
          value: String(value),
          help: fieldHelp(key),
          required: true,
          onInput(text) {
            invalidate();
            const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
            settings[key] = number;
            updateFieldHelp();
            update(true);
          }
        });
        control.input.inputMode = 'decimal';
        numericControls.set(key, control);
        fields.append(control.element);
      }
    }
  }
  function updateFieldHelp() {
    for (const help of fields.querySelectorAll<HTMLElement>('.ds-field__help')) {
      const key = help.id.replace(/^core-diagnostic-/, '').replace(/-help$/, '');
      help.textContent = fieldHelp(key);
    }
  }
  function showResult(result: CoreDiagnosticResult, loaded = false) {
    output.replaceChildren(
      element(document, 'h3', '', `${CORE_DIAGNOSTIC_NAMES[result.kind]} 결과`),
      element(document, 'p', '', result.summary),
      element(document, 'p', 'lab-muted', `계산법: ${result.method}`)
    );
    if (artifact) {
      output.append(
        element(
          document,
          'p',
          'lab-muted',
          `${loaded ? '불러온 artifact' : '입력 snapshot'} · ${artifact.request.experiment.systemId} · ${artifact.algorithmVersion}. 전체 run·생성 시각·계보는 아래 수치와 설정에 보존합니다.`
        )
      );
    }
    if (result.columns.length >= 2 && result.rows.length) {
      const series = result.columns.slice(1, 2).map((column, index) => ({
        label: column,
        color: ['#075985', '#9a3412', '#166534'][index]!,
        points: result.rows.map((row) => [row[0]!, row[index + 1]!] as const)
      }));
      output.append(
        createPlot(
          document,
          CORE_DIAGNOSTIC_NAMES[result.kind],
          `${result.columns[0]} (${result.units[0] ?? '1'})`,
          `${result.columns[1]} (${result.units[1] ?? '1'})`,
          series,
          result.kind === 'poincare' || result.kind === 'phase'
        )
      );
    }
    for (const warning of result.warnings) output.append(element(document, 'p', 'lab-preview-note', warning));
    const details = element(document, 'details', 'lab-details');
    details.append(element(document, 'summary', '', '진단 결과·단위·설정·계보 수치 보기'));
    const tableWrap = element(document, 'div', 'core-diagnostic-table');
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute('role', 'region');
    tableWrap.setAttribute('aria-label', '진단 결과 수치 표');
    const table = element(document, 'table', '');
    table.append(
      element(
        document,
        'caption',
        '',
        `결과 ${result.rows.length}행 중 처음 ${Math.min(200, result.rows.length)}행. 전체 원자료는 artifact JSON에 있습니다.`
      )
    );
    const head = element(document, 'thead', ''),
      header = element(document, 'tr', '');
    result.columns.forEach((column, i) => {
      const th = element(document, 'th', '', `${column} (${result.units[i] ?? '1'})`);
      th.scope = 'col';
      header.append(th);
    });
    head.append(header);
    const rows = element(document, 'tbody', '');
    for (const row of result.rows.slice(0, 200)) {
      const tr = element(document, 'tr', '');
      tr.append(
        ...row.map((value) =>
          element(document, 'td', '', Number.isFinite(value) ? value.toPrecision(8) : String(value))
        )
      );
      rows.append(tr);
    }
    table.append(head, rows);
    tableWrap.append(table);
    details.append(
      tableWrap,
      element(
        document,
        'pre',
        'core-diagnostic-json',
        artifact ? exportCoreDiagnosticArtifact(artifact) : JSON.stringify(result, null, 2)
      )
    );
    output.append(details);
  }
  function compute() {
    if (isBusy() || !options.canRun()) return;
    refreshSource();
    const reason = currentRejection();
    if (reason || !snapshot) {
      status.textContent = reason || '입력을 확인하세요.';
      return;
    }
    invalidate();
    const id = `diagnostic-${++generation}`;
    const request: CoreDiagnosticRequest = {
      id,
      kind,
      experiment: structuredClone(snapshot.experiment),
      series: structuredClone(snapshot.series),
      settings: { ...settings }
    };
    state = 'running';
    container.dataset.coreDiagnosticStatus = state;
    status.textContent = '입력 snapshot을 별도 worker에서 계산합니다. 언제든 취소할 수 있습니다.';
    progress.setValue(null);
    update();
    job = createCoreDiagnosticJob(request, (event) => {
      if (disposed || event.id !== `diagnostic-${generation}`) return;
      if (event.type === 'progress') {
        progress.setValue(
          event.fraction === null ? null : event.fraction * 100,
          `실제 계산 작업 ${event.work}회 · ${event.phase === 'complete' ? '완료' : '계산 중'}`
        );
        return;
      }
      job = undefined;
      if (event.type === 'result') {
        try {
          const timestamp = Date.now();
          artifact = createCoreDiagnosticArtifact(request, event.result, {
            artifactId: `artifact-${timestamp}-${generation}`,
            inputRunId: `run-${request.experiment.systemId.slice(7)}-${timestamp}-${generation}`,
            createdAt: new Date(timestamp).toISOString()
          });
          showResult(event.result);
          state = 'completed';
          progress.setValue(100);
          status.textContent = '핵심 진단을 완료했습니다. 입력·설정·결과를 artifact 파일로 보존할 수 있습니다.';
        } catch (cause) {
          artifact = undefined;
          output.replaceChildren();
          state = 'error';
          progress.setValue(0);
          error.hidden = false;
          error.textContent = cause instanceof Error ? cause.message : '진단 결과를 검증하지 못했습니다.';
          status.textContent = '검증하지 못한 진단 결과를 보존하지 않았습니다. 조건을 확인하고 다시 계산하세요.';
        }
      } else if (event.type === 'cancelled') {
        state = 'cancelled';
        progress.setValue(0);
        status.textContent = '핵심 진단을 취소했습니다. 부분 결과를 확정하지 않았습니다.';
      } else {
        state = 'error';
        progress.setValue(0);
        error.hidden = false;
        error.textContent = event.message;
        status.textContent = '핵심 진단에 실패했습니다. 조건을 확인하고 다시 계산하세요.';
      }
      container.dataset.coreDiagnosticStatus = state;
      update();
    });
  }
  function downloadArtifact() {
    if (!artifact) return;
    try {
      const url = URL.createObjectURL(new Blob([exportCoreDiagnosticArtifact(artifact)], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-diagnostic-${artifact.result.kind}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    } catch (cause) {
      error.hidden = false;
      error.textContent = cause instanceof Error ? cause.message : '파일을 만들 수 없습니다.';
    }
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || isBusy()) return;
    const current = ++generation;
    try {
      if (file.size > CORE_DIAGNOSTIC_LIMITS.artifactBytes)
        throw new RangeError(
          `진단 artifact 파일은 ${CORE_DIAGNOSTIC_LIMITS.artifactBytes / 1024 / 1024} MiB 이하여야 합니다.`
        );
      const text = await file.text();
      if (disposed || current !== generation) return;
      const imported = importCoreDiagnosticArtifact(text);
      artifact = imported;
      showResult(imported.result, true);
      state = 'completed';
      container.dataset.coreDiagnosticStatus = state;
      error.hidden = true;
      progress.setValue(100);
      status.textContent = '저장된 진단 artifact 결과를 다시 표시했습니다. 현재 실험 조건은 보존했습니다.';
      update();
    } catch (cause) {
      if (disposed || current !== generation) return;
      error.hidden = false;
      error.textContent = `artifact 가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽을 수 없습니다.'} 현재 결과와 실험은 보존했습니다.`;
    } finally {
      input.value = '';
    }
  });
  select.addEventListener('change', () => {
    invalidate();
    kind = select.value as CoreDiagnosticKind;
    refreshSource();
    settings = defaultCoreSettings(kind, snapshot?.experiment);
    renderFields();
    update(true);
  });
  container.addEventListener('toggle', () => {
    if (container.open && !isBusy()) refreshSource();
  });
  function update(revalidate = false) {
    const busy = isBusy();
    if (revalidate) {
      cachedRejection = currentRejection();
      for (const [key, control] of numericControls) {
        const value = settings[key];
        control.setError(
          typeof value !== 'number' || !Number.isFinite(value)
            ? '유한한 수를 입력하세요.'
            : cachedRejection?.startsWith(`${key}:`)
              ? cachedRejection
              : ''
        );
      }
    }
    const reason = cachedRejection;
    rejection.hidden = !reason;
    rejection.textContent = reason ?? '';
    run.disabled = busy || !options.canRun() || Boolean(reason);
    cancel.disabled = !busy;
    refresh.disabled = busy || !options.canRun();
    select.disabled = busy;
    download.disabled = busy || !artifact;
    input.disabled = busy;
    for (const control of fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      control.disabled = busy;
  }
  renderFields();
  update();
  return {
    element: container,
    update,
    refresh: refreshSource,
    dispose() {
      disposed = true;
      generation++;
      job?.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
