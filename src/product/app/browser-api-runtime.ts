import { publishPublicApi } from '../../runtime/globalApi';
import { CommandRegistry } from '../../runtime/CommandRegistry';
import { eventBus } from '../../runtime/EventBus';
import { APP_VERSION } from '../../runtime/version';
import { physicsAdapter } from '../../physics';
import { StateStore, stateHash } from '../../state/StateStore';
import type { RuntimeSnapshot } from '../../types/domain';
import { inspectSafeData } from '../persistence/safe-data';
import { createSubmissionManifest, downloadJson } from '../../export/manifest';
import { runAllValidationChecks } from '../../validation/validationSuite';
import { WorkerBridge } from '../../runtime/WorkerBridge';
import physicsWorkerUrl from '../../workers/physics.worker.ts?worker&url';
import { requireProductRuntime } from './browser-api-binding';
import { rememberProductPublicNamespace, removeProductPublicNamespace } from './browser-api-publication';

export function createProductRuntimeApi(document: Document) {
  const commands = new CommandRegistry();
  const bridge = new WorkerBridge(new URL(physicsWorkerUrl, import.meta.url));
  const snapshot = () => structuredClone(requireProductRuntime(document).snapshot());
  const state = Object.freeze({
    snapshot,
    syncFromLegacy(app?: unknown) {
      if (app !== undefined)
        throw new Error('외부 legacy App 객체는 직접 적용하지 않습니다. 저장 파일의 검증 미리보기를 사용하세요.');
      return snapshot();
    },
    applyPatch(input: Partial<RuntimeSnapshot>, app?: unknown): RuntimeSnapshot {
      if (app !== undefined) throw new Error('외부 App 변경은 지원하지 않습니다. 현재 실험실 API를 사용하세요.');
      const safe = inspectSafeData(input);
      if (!safe.ok || !safe.value || typeof safe.value !== 'object' || Array.isArray(safe.value))
        throw new Error('상태 patch는 안전한 데이터 객체여야 합니다.');
      const provider = requireProductRuntime(document);
      const before = provider.snapshot();
      const candidate = { ...before, ...safe.value, hash: before.hash };
      const checked = StateStore.validate(candidate);
      if (!checked.ok || !checked.value) throw new Error(`상태 patch 검증 실패: ${checked.problems.join('; ')}`);
      const next = { ...checked.value, hash: stateHash(checked.value.state) };
      const applied = provider.applySnapshot(structuredClone(next));
      eventBus.emit('state:changed', { reason: 'patch' });
      return structuredClone(applied);
    }
  });
  function register(id: string, label: string, run: () => void | Promise<void>) {
    commands.register({ id, label, description: label, run });
  }
  register('simulation.toggle', 'Toggle active simulation', () => {
    requireProductRuntime(document).toggle();
    eventBus.emit('simulation:toggle', { source: 'command' });
  });
  register('simulation.reset', 'Reset active simulation', () => {
    requireProductRuntime(document).reset();
    eventBus.emit('simulation:reset', { source: 'command' });
  });
  const exportManifest = () => {
    const manifest = createSubmissionManifest(snapshot());
    downloadJson('pendulum_submission_manifest_v10_ts.json', manifest);
    eventBus.emit('export:manifest', { source: 'command' });
  };
  register('export.manifest', 'Export current submission manifest', exportManifest);
  register('index.exportSubmissionManifest', 'Export current submission manifest', exportManifest);
  const validation = () => {
    const report = runAllValidationChecks();
    downloadJson('pendulum_validation_report_v10_ts.json', report);
    eventBus.emit('validation:run', { profile: 'standard' });
  };
  register('validation.run', 'Run native validation checks', validation);
  register('index.validationReport', 'Run native validation checks', validation);
  register('index.workerSmoke', 'Run native module worker smoke check', async () => {
    await bridge.step({ state: [1, 0], dt: 0.001, steps: 10, method: 'rk4' });
  });
  return {
    api: Object.freeze({
      version: APP_VERSION,
      compatibilityAdapter: 'product-browser-api/v1',
      commands,
      events: eventBus,
      state,
      physics: physicsAdapter
    }),
    dispose() {
      bridge.terminate();
    }
  };
}

/** Explicit opt-in publication. Unknown user-owned globals are preserved, never overwritten. */
export function publishProductRuntimeApi(document: Document) {
  const view = document.defaultView;
  if (!view || typeof window === 'undefined' || window !== view)
    throw new Error('현재 브라우저 문서에서 API를 활성화하세요.');
  for (const name of ['PendulumLab', 'PendulumLabIndex'])
    if (name in view) throw new Error(`${name} 이름이 이미 사용 중입니다. 기존 namespace를 덮어쓰지 않았습니다.`);
  const runtime = createProductRuntimeApi(document);
  publishPublicApi({ ...runtime.api }, { PendulumLabIndex: runtime.api });
  const published = (view as Window & { PendulumLab?: unknown }).PendulumLab;
  rememberProductPublicNamespace(document, published as object);
  return {
    api: runtime.api,
    dispose() {
      runtime.dispose();
      removeProductPublicNamespace(document);
      if ((view as Window & { PendulumLabIndex?: unknown }).PendulumLabIndex === runtime.api)
        Reflect.deleteProperty(view, 'PendulumLabIndex');
    }
  };
}
