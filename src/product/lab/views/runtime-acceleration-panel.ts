import { element } from '../../app/dom';
import { createButton, createInput, createSection } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import {
  createRuntimeAccelerationClient,
  type RuntimeAccelerationWorkerFactory
} from '../../adapters/physics/runtime-acceleration-client';
import {
  RUNTIME_ENSEMBLE_DEFAULTS,
  RUNTIME_TAPE_DEFAULTS,
  RUNTIME_TAPE_MAX_SCALARS,
  serializeRuntimeAcceleration,
  type RuntimeAccelerationResult
} from '../../adapters/physics/runtime-acceleration';

export function createRuntimeAccelerationPanel(
  document: Document,
  options: {
    experiment(): ContractResult<ExperimentStateV1>;
    canRun(): boolean;
    workerFactory?: RuntimeAccelerationWorkerFactory;
  }
) {
  const section = createSection(document, {
    id: 'runtime-acceleration',
    title: '선택 실행 · native GPU·Wasm·CPU 비교',
    headingLevel: 3
  });
  section.body.append(
    element(
      document,
      'p',
      'lab-muted',
      `현재 초기 조건의 독립 작업을 실행합니다. 점질량 이중진자는 native RK4 ensemble, 삼중·평면 사슬은 native N-chain Jacobian tape(SIMD 후보)를 CPU f64와 비교합니다. 완전한 tape는 backend당 최대${RUNTIME_TAPE_MAX_SCALARS} scalar이며 초과 조합은 계산 전에 거부합니다. API 사용 가능 여부와 실제 backend를 구분하며 원래 run은 변경하지 않습니다.`
    )
  );
  const shared = element(document, 'div', 'lab-inspector-grid'),
    doubleFields = element(document, 'div', 'lab-inspector-grid'),
    chainFields = element(document, 'div', 'lab-inspector-grid'),
    specs = [
      {
        key: 'dt',
        label: '독립 간격 Δt (s)',
        value: RUNTIME_ENSEMBLE_DEFAULTS.dt,
        min: 1e-6,
        max: 0.02,
        group: shared
      },
      {
        key: 'steps',
        label: 'ensemble RK4 단계 수',
        value: RUNTIME_ENSEMBLE_DEFAULTS.steps,
        min: 1,
        max: 1000,
        group: doubleFields
      },
      {
        key: 'gridSize',
        label: '각도 격자 한 변 (총 N²개)',
        value: RUNTIME_ENSEMBLE_DEFAULTS.gridSize,
        min: 2,
        max: 8,
        group: doubleFields
      },
      {
        key: 'angleRadius',
        label: '초기 각도 격자 반경 (rad)',
        value: RUNTIME_ENSEMBLE_DEFAULTS.angleRadius,
        min: 0,
        max: 0.1,
        group: doubleFields
      },
      {
        key: 'renormEvery',
        label: 'tape 구간당 native 단계',
        value: RUNTIME_TAPE_DEFAULTS.renormEvery,
        min: 1,
        max: 8,
        group: chainFields
      },
      {
        key: 'forwardTransient',
        label: 'tape forward transient',
        value: RUNTIME_TAPE_DEFAULTS.forwardTransient,
        min: 0,
        max: 32,
        group: chainFields
      },
      { key: 'window', label: 'tape window', value: RUNTIME_TAPE_DEFAULTS.window, min: 1, max: 32, group: chainFields }
    ] as const,
    controls = specs.map((spec) => {
      const control = createInput(document, {
        id: `runtime-${spec.key}`,
        label: spec.label,
        type: 'number',
        value: String(spec.value),
        help: `${spec.min}–${spec.max}`
      });
      control.input.min = String(spec.min);
      control.input.max = String(spec.max);
      control.input.step = spec.key === 'dt' || spec.key === 'angleRadius' ? 'any' : '1';
      spec.group.append(control.element);
      return { ...control, key: spec.key };
    }),
    cpuLabel = element(document, 'label', 'ds-field__label'),
    cpu = element(document, 'input', '');
  cpu.type = 'checkbox';
  cpu.id = 'runtime-force-cpu';
  cpuLabel.append(cpu, document.createTextNode(' CPU f64만 사용 (비교·복구)'));
  const status = element(document, 'p', 'lab-muted', '명시적으로 실행한 뒤 실제 backend·오차·한계를 확인하세요.'),
    error = element(document, 'p', 'ds-field__error'),
    output = element(document, 'pre', 'lab-data-output core-result-json');
  status.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  output.setAttribute('role', 'region');
  output.setAttribute('aria-label', '실제 native backend 비교 결과');
  output.tabIndex = 0;
  let client: ReturnType<typeof createRuntimeAccelerationClient> | undefined,
    last: RuntimeAccelerationResult | undefined,
    disposed = false;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  function groups() {
    const source = options.experiment(),
      chain = source.ok && (source.value.systemId === 'system:chain' || source.value.systemId === 'system:triple');
    doubleFields.hidden = chain;
    chainFields.hidden = !chain;
    return { source, chain };
  }
  groups();
  function busy(value: boolean) {
    controls.forEach((control) => {
      control.input.disabled = value;
    });
    cpu.disabled = value;
    calculate.disabled = value;
    cancel.disabled = !value;
  }
  const calculate = createButton(document, {
      label: 'native backend 실행·CPU 비교',
      variant: 'secondary',
      onClick() {
        if (disposed || client) return;
        if (!options.canRun()) {
          error.hidden = false;
          error.textContent = '현재 run을 일시정지한 뒤 backend 비교를 실행하세요.';
          return;
        }
        const { source, chain } = groups();
        if (!source.ok) {
          error.hidden = false;
          error.textContent = source.issues.map((entry) => entry.message).join(' ');
          return;
        }
        const values = Object.fromEntries(
            controls.map((control) => [control.key, control.input.value.trim() ? Number(control.input.value) : NaN])
          ),
          settings = chain
            ? {
                kind: 'chain-jacobian-tape',
                dt: values.dt,
                renormEvery: values.renormEvery,
                forwardTransient: values.forwardTransient,
                window: values.window,
                forceCpu: cpu.checked
              }
            : {
                kind: 'double-ensemble',
                dt: values.dt,
                steps: values.steps,
                gridSize: values.gridSize,
                angleRadius: values.angleRadius,
                forceCpu: cpu.checked
              };
        error.hidden = true;
        busy(true);
        status.textContent = 'native backend worker 실행 중 · 같은 작업의 CPU f64 oracle 계산';
        client = createRuntimeAccelerationClient(
          source.value,
          settings,
          (event) => {
            if (disposed) return;
            client = undefined;
            busy(false);
            if (event.type === 'error') {
              error.hidden = false;
              error.textContent = `${event.message} 마지막 완료 결과를 유지합니다.`;
              status.textContent = 'backend 비교 오류 · 원래 run 보존';
              return;
            }
            last = event.result;
            download.disabled = false;
            const result = event.result,
              capabilities = result.capabilities;
            status.textContent = 'native backend 비교 완료 · 실제 반환 backend를 확인하세요.';
            const lines = [
              `WebGPU API ${capabilities.webgpuApi} · adapter ${capabilities.webgpuAdapter}`,
              `Wasm ensemble kernel ${capabilities.wasmEnsembleKernel} · SIMD feature ${capabilities.wasmSimdSupported} · N-chain kernel ${capabilities.wasmNChainKernel}`
            ];
            if (result.kind === 'double-ensemble')
              lines.push(
                `독립 native RK4 · ${result.gpu.n}개 초기 조건 · ${result.settings.steps}단계 × ${result.settings.dt}s`,
                `CPU oracle: ${result.cpuOracle.backend} · ${result.cpuOracle.elapsedMs.toPrecision(6)}ms`,
                `GPU 요청 실제 backend: ${result.gpu.backend} · ${result.gpu.elapsedMs.toPrecision(6)}ms · max |state−CPU| ${result.gpuStateDifference.maxAbsolute}`,
                `native 통계 허용오차 비교: ${result.gpuStatisticsComparison.passed ? '충족' : '재검토'}${result.gpu.backend === 'cpu' ? ' (CPU fallback 결과이며 GPU 검증이 아닙니다)' : ' (통계 전용)'} · mean ${result.gpuStatisticsComparison.maxMeanAbsDiff} · covariance ${result.gpuStatisticsComparison.maxCovarianceAbsDiff}`,
                `Wasm 요청 실제 backend: ${result.wasm.backend} · ${result.wasm.elapsedMs.toPrecision(6)}ms · max |state−CPU| ${result.wasmStateDifference.maxAbsolute} (측정값)`,
                `GPU reduction: ${result.gpuReduction ? `실제 실행 · native 통계 비교 ${result.gpuReduction.comparison.passed ? '충족' : '재검토'}` : '실행 안 됨 · CPU 전용 또는 GPU 경로 불가'}`,
                result.gpu.caveat,
                result.wasm.caveat
              );
            else
              lines.push(
                `buildNChainJacobianTapeWasm 실제 backend: ${result.backend} · ABI ${result.abiVersion ?? '없음'} · promoted:${result.promoted}`,
                `후보 ${result.elapsedMs.toPrecision(6)}ms · CPU oracle ${result.cpuElapsedMs.toPrecision(6)}ms`,
                `${result.tape.length}개 tape 값 · max |tape−CPU| ${result.tapeDifference.maxAbsolute} (측정값)`,
                result.caveat
              );
            output.textContent = [...lines, ...result.warnings].join('\n');
          },
          options.workerFactory
        );
      }
    }),
    cancel = createButton(document, {
      label: 'backend 비교 취소',
      variant: 'secondary',
      disabled: true,
      onClick() {
        client?.dispose();
        client = undefined;
        busy(false);
        status.textContent = 'backend 비교 취소됨 · 마지막 완료 결과를 유지합니다.';
      }
    }),
    download = createButton(document, {
      label: 'backend 비교 JSON 다운로드',
      variant: 'secondary',
      disabled: true,
      onClick() {
        if (!last) return;
        const url = URL.createObjectURL(new Blob([serializeRuntimeAcceleration(last)], { type: 'application/json' }));
        urls.add(url);
        const anchor = element(document, 'a', '');
        anchor.href = url;
        anchor.download = 'pendulum-runtime-acceleration.json';
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
    }),
    actions = element(document, 'div', 'lab-inline-actions');
  actions.append(calculate, cancel, download);
  section.body.append(shared, doubleFields, chainFields, cpuLabel, actions, status, error, output);
  return {
    element: section.element,
    dispose() {
      disposed = true;
      client?.dispose();
      client = undefined;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}
