import { catalog } from '../../catalog';
import { createLibrary, rememberSystem } from '../../lab/library';
import { createWorkspace } from '../../lab/workspace';
import { createLegacyMigrationPanel } from '../../persistence/legacy-migration-panel';
import { element } from '../dom';
import { createButton } from '../../design-system/primitives';
import type { ResolvedRoute, RouteView } from '../types';

/** Metadata-only until the user opens this specific importer. Cancellation
 * prevents late UI/DB construction; ES module downloads themselves are cached
 * by the browser and do not have an AbortSignal API. */
function createWorkspaceImportEntry(document: Document) {
  const root = element(document, 'details', 'ds-section');
  root.id = 'legacy-workspace-import';
  root.append(element(document, 'summary', 'ds-section__heading', '기존 작업공간·연구 DB 가져오기'));
  const body = element(document, 'div', 'ds-section__body');
  const status = element(
    document,
    'p',
    'lab-muted',
    '이 항목을 펼치면 파일 가져오기 도구를 불러옵니다. 기존 저장소를 자동으로 읽거나 적용하지 않습니다.'
  );
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  let generation = 0,
    loading = false,
    disposed = false,
    importFailures = 0;
  let panel:
    ReturnType<typeof import('../../persistence/legacy-workspace-panel').createLegacyWorkspacePanel> | undefined;
  function cancelLoading() {
    generation++;
    loading = false;
    cancel.hidden = true;
    retry.hidden = false;
    error.hidden = true;
    status.textContent =
      '도구의 화면 적용을 취소했습니다. 요청이 끝나도 열거나 데이터를 읽지 않습니다. 다시 불러오기를 직접 선택할 수 있습니다.';
  }
  const cancel = createButton(document, {
    label: '작업공간 도구 불러오기 취소',
    variant: 'secondary',
    onClick: cancelLoading
  });
  const retry = createButton(document, {
    label: '작업공간 도구 다시 불러오기',
    variant: 'secondary',
    onClick() {
      void load();
    }
  });
  cancel.hidden = true;
  retry.hidden = true;
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(cancel, retry);
  body.append(status, error, actions);
  root.append(body);
  async function load() {
    if (disposed || loading || panel || importFailures >= 2) return;
    const pending = ++generation;
    loading = true;
    error.hidden = true;
    cancel.hidden = false;
    retry.hidden = true;
    status.textContent = '파일 가져오기 도구를 불러오는 중입니다. 저장소나 원본 파일은 아직 읽지 않았습니다.';
    try {
      // Chromium caches a rejected module URL. One distinct, statically
      // bundled retry URL reuses the same source without reloading the page
      // or discarding a user's sibling import textarea/file selection.
      const module =
        importFailures === 0
          ? await import('../../persistence/legacy-workspace-panel')
          : await import('../../persistence/legacy-workspace-panel?workspace-retry');
      if (disposed || pending !== generation || !root.open) return;
      const next = module.createLegacyWorkspacePanel(document);
      if (disposed || pending !== generation || !root.open) {
        next.dispose();
        return;
      }
      panel = next;
      (next.element as HTMLDetailsElement).open = true;
      root.replaceWith(next.element);
    } catch {
      if (!disposed && pending === generation) {
        importFailures++;
        error.textContent =
          '파일 가져오기 도구를 불러오지 못했습니다. 원본과 현재 입력은 그대로입니다. 연결을 확인하고 다시 시도하세요.';
        error.hidden = false;
        retry.hidden = importFailures >= 2;
        status.textContent =
          importFailures >= 2
            ? '두 번의 불러오기가 실패했습니다. 현재 입력은 유지됩니다. 원본을 보관하고 연결을 확인한 뒤 페이지를 새로고침하세요.'
            : '파일이나 기존 저장소에 접근하지 않았습니다.';
      }
    } finally {
      if (!disposed && pending === generation) {
        loading = false;
        cancel.hidden = true;
      }
    }
  }
  function toggle() {
    if (disposed || panel) return;
    if (root.open) void load();
    else if (loading) cancelLoading();
  }
  root.addEventListener('toggle', toggle);
  return {
    element: root,
    dispose() {
      disposed = true;
      generation++;
      loading = false;
      root.removeEventListener('toggle', toggle);
      panel?.dispose();
    }
  };
}

export function createView(context: ResolvedRoute, document: Document): RouteView {
  const { route, experiment } = context;
  if (route.kind === 'lab') {
    const element = createLibrary(document);
    const migration = createLegacyMigrationPanel(document);
    const workspaceMigration = createWorkspaceImportEntry(document);
    element.append(migration.element, workspaceMigration.element);
    return {
      element,
      title: '실험실',
      dispose() {
        migration.dispose();
        workspaceMigration.dispose();
      }
    };
  }
  if (route.kind !== 'lab-system') throw new Error('The laboratory view requires a Lab route.');
  const system = catalog.systems.find((definition) => definition.id === route.systemId);
  if (!system) throw new Error('The laboratory route requires a registered system.');
  rememberSystem(document, system.id);
  return { ...createWorkspace(document, system, experiment), title: `${system.name.ko} · 실험실` };
}
