import { fields } from '../../contracts/contract-checks';
import type { ContractIssue } from '../../contracts/validation';
import { canonicalJson, inspectSafeData, type JsonValue } from '../../persistence/safe-data';
import {
  validateStructureCanonicalSettings,
  validateStructureEnergySettings,
  type StructureDiagnosticResult
} from './structure-diagnostics';
import type {
  StructureDiagnosticEvent,
  StructureDiagnosticKind,
  StructureDiagnosticRequest
} from './structure-diagnostics-worker-protocol';

export interface StructureDiagnosticWorker {
  onmessage: ((event: MessageEvent<StructureDiagnosticEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: StructureDiagnosticRequest): void;
  terminate(): void;
}
export type StructureDiagnosticWorkerFactory = () => StructureDiagnosticWorker;
const defaultFactory: StructureDiagnosticWorkerFactory = () =>
  new Worker(new URL('./structure-diagnostics.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;
const exact = (a: unknown, b: unknown) => canonicalJson(a as JsonValue) === canonicalJson(b as JsonValue);
function resultMatches(
  result: StructureDiagnosticResult,
  kind: StructureDiagnosticKind,
  experiment: unknown,
  settings: unknown
): boolean {
  if (!result || !exact(result.experiment, experiment) || !exact(result.settings, settings)) return false;
  if (kind === 'energy') {
    if (result.schema !== 'pendulum-structure-energy/v1') return false;
    const profile = result.profile,
      steps = Math.round(result.settings.totalTime / result.settings.dt);
    return (
      result.algorithmVersion === 'energy-drift-profile-native-v1' &&
      result.source === 'energyDriftProfile' &&
      result.acceptance?.policy === 'raw-native-no-retry' &&
      result.acceptance.steps === steps &&
      result.acceptance.acceptedSteps === steps &&
      result.acceptance.rejectedSteps === 0 &&
      !!profile &&
      Array.isArray(profile.times) &&
      Array.isArray(profile.drift) &&
      profile.times.length === result.settings.samples &&
      profile.drift.length === result.settings.samples &&
      result.experiment.integrator.kind === 'selectable' &&
      profile.method === result.experiment.integrator.id.slice('integrator:'.length) &&
      profile.times.every(
        (time, index) => time === (index + 1) * (steps / result.settings.samples) * result.settings.dt
      ) &&
      typeof profile.secular === 'boolean' &&
      typeof profile.method_note === 'string' &&
      [profile.maxAbsDrift, profile.secularSlope, profile.secularComponent, profile.trendR2].every(Number.isFinite)
    );
  }
  if (result.schema !== 'pendulum-structure-canonical/v1') return false;
  const vector = (value: unknown) => Array.isArray(value) && value.length === 4 && value.every(Number.isFinite),
    solver = (value: typeof result.midpoint | typeof result.thetaOmegaStep) =>
      !!value &&
      vector(value.state) &&
      value.stats?.converged === true &&
      Number.isFinite(value.stats.residual) &&
      Number.isSafeInteger(value.stats.iterations);
  return (
    result.algorithmVersion === 'canonical-native-comparison-v1' &&
    vector(result.initialCanonical) &&
    result.rhs?.source === 'canonicalRhs' &&
    vector(result.rhs.value) &&
    result.midpoint?.source === 'implicitMidpointCanonical' &&
    solver(result.midpoint) &&
    result.thetaOmegaStep?.source === 'canonicalStepThetaOmega' &&
    solver(result.thetaOmegaStep) &&
    result.thetaOmegaStep.tolerance === 1e-10 &&
    result.thetaOmegaStep.maxIterations === 12 &&
    result.coordinateComparison?.source === 'compareDoublePendulumFormulations' &&
    result.coordinateComparison.result?.policy === 'shared-fixed-rk4' &&
    vector(result.coordinateComparison.result.finalThetaOmega) &&
    vector(result.coordinateComparison.result.finalCanonical) &&
    vector(result.coordinateComparison.result.finalCanonicalAsThetaOmega)
  );
}

/** Every success/error/timeout/dispose path closes its single native worker. */
export function createStructureDiagnosticClient(
  kind: StructureDiagnosticKind,
  experiment: unknown,
  input: unknown,
  onEvent: (event: StructureDiagnosticEvent) => void,
  factory: StructureDiagnosticWorkerFactory = defaultFactory
) {
  const safeExperiment = inspectSafeData(experiment),
    checked = kind === 'energy' ? validateStructureEnergySettings(input) : validateStructureCanonicalSettings(input),
    id = `structure-diagnostic-${++runSequence}`;
  let worker: StructureDiagnosticWorker | undefined,
    stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const fail = (message: string) => {
    if (stopped) return;
    dispose();
    onEvent({ type: 'error', id, message });
  };
  if (!safeExperiment.ok || !checked.ok) {
    const issues = !safeExperiment.ok ? safeExperiment.issues : !checked.ok ? checked.issues : [];
    queueMicrotask(() => fail(issues.map((entry) => entry.message).join(' ')));
    return { dispose };
  }
  const settings = checked.value;
  try {
    worker = factory();
    worker.onmessage = (event) => {
      if (stopped) return;
      const safe = inspectSafeData(event.data);
      if (!safe.ok) {
        fail('구조 진단 worker 데이터 형식을 확인할 수 없습니다.');
        return;
      }
      const value = safe.value,
        issues: ContractIssue[] = [];
      if (
        !fields(
          value,
          [
            'type',
            'id',
            ...(value && typeof value === 'object' && !Array.isArray(value) && value.type === 'error'
              ? ['message']
              : ['result'])
          ],
          [],
          '$',
          issues
        ) ||
        issues.length ||
        value.id !== id
      ) {
        fail('구조 진단 worker 응답의 실행 ID·형식이 유효하지 않습니다.');
        return;
      }
      if (value.type === 'error') {
        fail(typeof value.message === 'string' ? value.message : '구조 진단 worker 오류입니다.');
        return;
      }
      try {
        const result = value.result as unknown as StructureDiagnosticResult;
        if (
          value.type !== 'result' ||
          !resultMatches(result, kind, safeExperiment.value, settings) ||
          !Array.isArray(result.warnings) ||
          !result.warnings.every((warning) => typeof warning === 'string')
        )
          throw new Error('구조 진단 worker 결과의 출처·설정·수렴을 확인할 수 없습니다.');
        dispose();
        onEvent({ type: 'result', id, result });
      } catch {
        fail('구조 진단 worker 결과의 출처·설정·수렴을 확인할 수 없습니다.');
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('native 구조 진단 worker 실행에 실패했습니다.');
    };
    worker.onmessageerror = () => fail('native 구조 진단 메시지를 읽지 못했습니다.');
    timer = setTimeout(() => fail('구조 진단 worker 응답이 지연되었습니다. 관찰 시간을 줄이세요.'), 15000);
    worker.postMessage({ type: 'calculate', id, kind, experiment: safeExperiment.value, settings });
  } catch {
    queueMicrotask(() => fail('이 환경에서 구조 진단 worker를 시작하지 못했습니다.'));
  }
  return { dispose };
}
