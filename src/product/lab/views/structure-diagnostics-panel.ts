import { element } from '../../app/dom';
import { createButton, createInput, createSection } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import {
  createStructureDiagnosticClient,
  type StructureDiagnosticWorkerFactory
} from '../../adapters/physics/structure-diagnostics-client';
import {
  STRUCTURE_ENERGY_DEFAULTS,
  STRUCTURE_CANONICAL_DEFAULTS,
  serializeStructureArtifact,
  type StructureDiagnosticResult,
  type StructureEnergyResult
} from '../../adapters/physics/structure-diagnostics';
import type { StructureDiagnosticKind } from '../../adapters/physics/structure-diagnostics-worker-protocol';

export function createStructureDiagnosticsPanel(
  document: Document,
  options: {
    experiment(): ContractResult<ExperimentStateV1>;
    canRun(): boolean;
    workerFactory?: StructureDiagnosticWorkerFactory;
  }
) {
  const section = createSection(document, {
    id: 'structure-diagnostics',
    title: '보존계 구조 · native 에너지·정준 진단',
    headingLevel: 3
  });
  section.body.append(
    element(
      document,
      'p',
      'lab-muted',
      '현재 적용된 초기 조건에서 독립 계산합니다. γ=0인 이중·복합·삼중·평면 사슬의 energyDriftProfile을 실행하며, 미수렴 native 단계를 거부합니다. 정준 RHS·한 단계와 별도의 고정 RK4 좌표 비교는 점질량 이중진자에만 적용합니다.'
    )
  );
  const form = element(document, 'div', 'lab-inspector-grid'),
    fieldSpecs = [
      { key: 'dt', label: '진단 간격 Δt (s)', value: STRUCTURE_ENERGY_DEFAULTS.dt, min: 1e-6, max: 0.05 },
      {
        key: 'totalTime',
        label: '독립 관찰 시간 (s)',
        value: STRUCTURE_ENERGY_DEFAULTS.totalTime,
        min: 1e-6,
        max: 100
      },
      { key: 'samples', label: '에너지 표본 수', value: STRUCTURE_ENERGY_DEFAULTS.samples, min: 3, max: 100 },
      { key: 'tolerance', label: '진단 잔차 허용오차', value: STRUCTURE_ENERGY_DEFAULTS.tolerance, min: 1e-15, max: 1 },
      {
        key: 'maxIterations',
        label: '정준 midpoint 최대 반복',
        value: STRUCTURE_CANONICAL_DEFAULTS.maxIterations,
        min: 1,
        max: 100
      }
    ] as const,
    controls = fieldSpecs.map((field) => {
      const control = createInput(document, {
        id: `structure-${field.key}`,
        label: field.label,
        type: 'number',
        value: String(field.value),
        help:
          field.key === 'totalTime'
            ? '시간/Δt는 에너지 표본 수로 나누어지는 정수여야 합니다. 정준 좌표 비교는 최대10초입니다.'
            : `${field.min}–${field.max}`
      });
      control.input.min = String(field.min);
      control.input.max = String(field.max);
      control.input.step = field.key === 'samples' || field.key === 'maxIterations' ? '1' : 'any';
      form.append(control.element);
      return { ...control, key: field.key };
    });
  const status = element(document, 'p', 'lab-muted', '설정을 확인한 뒤 독립 진단을 실행하세요.'),
    error = element(document, 'p', 'ds-field__error'),
    plot = element(document, 'div', 'core-plot-frame'),
    energyOutput = element(document, 'pre', 'lab-data-output core-result-json'),
    canonicalOutput = element(document, 'pre', 'lab-data-output core-result-json');
  status.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  for (const [output, label] of [
    [energyOutput, 'native 에너지 드리프트 결과'],
    [canonicalOutput, 'native 정준 함수·좌표 비교 결과']
  ] as const) {
    output.tabIndex = 0;
    output.setAttribute('role', 'region');
    output.setAttribute('aria-label', label);
  }
  let disposed = false,
    client: ReturnType<typeof createStructureDiagnosticClient> | undefined;
  const last: Partial<Record<StructureDiagnosticKind, StructureDiagnosticResult>> = {},
    timers = new Set<ReturnType<typeof setTimeout>>(),
    urls = new Set<string>();
  function busy(value: boolean) {
    controls.forEach((control) => (control.input.disabled = value));
    energyButton.disabled = value;
    canonicalButton.disabled = value;
    cancel.disabled = !value;
  }
  function calculate(kind: StructureDiagnosticKind) {
    if (client || disposed) return;
    if (!options.canRun()) {
      error.hidden = false;
      error.textContent = '현재 run을 일시정지한 뒤 구조 진단을 실행하세요.';
      return;
    }
    const experiment = options.experiment();
    if (!experiment.ok) {
      error.hidden = false;
      error.textContent = experiment.issues.map((entry) => entry.message).join(' ');
      return;
    }
    const values = Object.fromEntries(
        controls.map((control) => [control.key, control.input.value.trim() ? Number(control.input.value) : NaN])
      ),
      settings =
        kind === 'energy'
          ? { dt: values.dt, totalTime: values.totalTime, samples: values.samples, tolerance: values.tolerance }
          : {
              dt: values.dt,
              horizon: values.totalTime,
              tolerance: values.tolerance,
              maxIterations: values.maxIterations,
              comparisonPolicy: 'reference'
            };
    error.hidden = true;
    busy(true);
    status.textContent = `${kind === 'energy' ? '에너지 프로필' : '정준 함수·좌표 비교'} native worker 계산 중`;
    client = createStructureDiagnosticClient(
      kind,
      experiment.value,
      settings,
      (event) => {
        if (disposed) return;
        client = undefined;
        busy(false);
        if (event.type === 'error') {
          error.hidden = false;
          error.textContent = `${event.message} 마지막 완료 결과를 유지합니다.`;
          status.textContent = '구조 진단 오류 · 원래 run을 보존했습니다.';
          return;
        }
        last[kind] = event.result;
        status.textContent = `${kind === 'energy' ? '에너지 프로필' : '정준 함수·좌표 비교'} 계산 완료 · 독립 native 진단`;
        if (event.result.schema === 'pendulum-structure-energy/v1') {
          const result = event.result;
          energyOutput.textContent = [
            `energyDriftProfile · ${result.profile.method} · ${result.acceptance.acceptedSteps}/${result.acceptance.steps} native 단계 수락`,
            `max |drift| ${result.profile.maxAbsDrift.toPrecision(9)} · slope ${result.profile.secularSlope.toPrecision(9)} · R² ${result.profile.trendR2.toPrecision(9)}`,
            result.profile.method_note,
            '독립 경과 시간 (s) | native drift',
            ...result.profile.times.map(
              (time, index) => `${time.toPrecision(9)} | ${result.profile.drift[index]!.toPrecision(12)}`
            ),
            ...result.warnings
          ].join('\n');
          plot.replaceChildren(energyPlot(document, result));
          energyDownload.disabled = false;
        } else {
          const result = event.result,
            compared = result.coordinateComparison.result;
          canonicalOutput.textContent = [
            `canonicalRhs(q,p): [${result.rhs.value.join(', ')}]`,
            `implicitMidpointCanonical(q,p): [${result.midpoint.state.join(', ')}] · residual ${result.midpoint.stats.residual} · ${result.midpoint.stats.iterations}회 · converged ${result.midpoint.stats.converged}`,
            `canonicalStepThetaOmega(θ,ω): [${result.thetaOmegaStep.state.join(', ')}] · residual ${result.thetaOmegaStep.stats.residual} · ${result.thetaOmegaStep.stats.iterations}회 · converged ${result.thetaOmegaStep.stats.converged}`,
            `별도 compareDoublePendulumFormulations: ${compared.policy} · ${compared.comparisonPolicy} · ${compared.steps}단계 · ${compared.simulatedTime}s`,
            `normalized mismatch ${compared.maxNormalizedMismatch} · native tolerance ${compared.comparisonTolerance} · verdict ${compared.verdict}`,
            ...result.warnings
          ].join('\n');
          canonicalDownload.disabled = false;
        }
      },
      options.workerFactory
    );
  }
  const energyButton = createButton(document, {
      label: '에너지 드리프트 프로필 계산',
      variant: 'secondary',
      onClick: () => calculate('energy')
    }),
    canonicalButton = createButton(document, {
      label: '정준 RHS·한 단계·좌표 비교',
      variant: 'secondary',
      onClick: () => calculate('canonical')
    }),
    cancel = createButton(document, {
      label: '구조 진단 취소',
      variant: 'secondary',
      disabled: true,
      onClick() {
        client?.dispose();
        client = undefined;
        busy(false);
        status.textContent = '구조 진단 취소됨 · 마지막 완료 결과를 유지합니다.';
      }
    });
  function download(kind: StructureDiagnosticKind) {
    const result = last[kind];
    if (!result) return;
    const url = URL.createObjectURL(new Blob([serializeStructureArtifact(result)], { type: 'application/json' }));
    urls.add(url);
    const anchor = element(document, 'a', '');
    anchor.href = url;
    anchor.download = `pendulum-structure-${kind}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
      timers.delete(timer);
    }, 1000);
    timers.add(timer);
  }
  const energyDownload = createButton(document, {
      label: '에너지 프로필 JSON 다운로드',
      variant: 'secondary',
      disabled: true,
      onClick: () => download('energy')
    }),
    canonicalDownload = createButton(document, {
      label: '정준 비교 JSON 다운로드',
      variant: 'secondary',
      disabled: true,
      onClick: () => download('canonical')
    }),
    actions = element(document, 'div', 'lab-inline-actions');
  actions.append(energyButton, canonicalButton, cancel, energyDownload, canonicalDownload);
  section.body.append(form, actions, status, error, plot, energyOutput, canonicalOutput);
  return {
    element: section.element,
    dispose() {
      disposed = true;
      client?.dispose();
      client = undefined;
      timers.forEach(clearTimeout);
      timers.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    }
  };
}
function energyPlot(document: Document, result: StructureEnergyResult): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 420 210');
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'native energyDriftProfile의 독립 경과 시간별 에너지 drift. 정확한 값과 한계는 아래 수치 결과에 표시합니다.'
  );
  const max = Math.max(1e-16, result.profile.maxAbsDrift),
    path = document.createElementNS(ns, 'polyline');
  path.setAttribute(
    'points',
    result.profile.times
      .map(
        (time, index) =>
          `${45 + (350 * time) / result.settings.totalTime},${100 - (70 * result.profile.drift[index]!) / max}`
      )
      .join(' ')
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  svg.append(path);
  for (const [x, y, value] of [
    [45, 196, '독립 경과 시간 (s)'],
    [300, 196, String(result.settings.totalTime)],
    [10, 18, `|drift|≤${max.toPrecision(4)}`]
  ] as const) {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('fill', 'currentColor');
    text.textContent = value;
    svg.append(text);
  }
  return svg;
}
