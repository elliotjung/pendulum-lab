import { element } from '../app/dom';
import { createButton, createInput, type ButtonOptions } from '../design-system/primitives';
import { readResearchProjectSession, saveResearchProjectSession } from '../lab/projects/session';
import { buildResearchPackage } from '../provenance/package';
import { createExperimentRoute } from './share-route';
import { LegacyWorkspaceStore } from './legacy-workspace-store';
import { createLegacyWorkspaceRecordView } from './legacy-workspace-view';
import { createLegacyRunListPanel } from '../lab/experiments/legacy-run-list-panel';
import {
  previewLegacyWorkspace,
  confirmLegacyWorkspace,
  exportLegacyWorkspaceSource,
  exportLegacyWorkspaceAsset,
  exportLegacyWorkspaceRecord,
  type LegacyWorkspacePreview
} from './legacy-workspace';

export interface LegacyWorkspacePanelOptions {
  readonly store?: Pick<LegacyWorkspaceStore, 'save' | 'load' | 'list' | 'close'>;
  readonly readFile?: (file: File) => Promise<ArrayBuffer>;
}
/** Opt-in file inspection/adoption. A separate product DB keeps every part durable; legacy stores are never enumerated. */
export function createLegacyWorkspacePanel(document: Document, options: LegacyWorkspacePanelOptions = {}) {
  const root = element(document, 'details', 'ds-section');
  root.id = 'legacy-workspace-import';
  root.append(element(document, 'summary', 'ds-section__heading', '기존 작업공간·연구 DB 가져오기'));
  const body = element(document, 'div', 'ds-section__body');
  root.append(body);
  body.append(
    element(
      document,
      'p',
      '',
      '기존 JSON 내보내기 파일을 확인한 뒤 새 프로젝트로 채택하세요. 원본 저장소와 현재 프로젝트는 미리보기 동안 변경하지 않습니다. 가져온 전체 원본과 모든 project part는 별도 product 보관함에 저장합니다.'
    )
  );
  const fileLabel = element(document, 'label', 'ds-field__label', '작업공간 또는 연구 DB JSON 파일');
  const file = element(document, 'input', 'ds-field__control');
  file.id = 'legacy-workspace-file';
  file.type = 'file';
  file.accept = '.json,application/json';
  fileLabel.htmlFor = file.id;
  const kindLabel = element(document, 'label', 'ds-field__label', '기존 파일 종류');
  kindLabel.htmlFor = 'legacy-workspace-kind';
  const kind = element(document, 'select', 'ds-field__control');
  kind.id = kindLabel.htmlFor;
  for (const [value, title] of [
    ['workspace', '전체 작업공간 · 최대8MiB'],
    ['research-db', '연구 DB archive · 최대64MiB']
  ]) {
    const option = element(document, 'option', '', title);
    option.value = value!;
    kind.append(option);
  }
  const duration = createInput(document, {
    id: 'legacy-workspace-duration',
    label: 'snapshot에서 새로 관찰할 시간(s)',
    type: 'number',
    value: '5',
    help: '이전 궤적을 만들어내지 않습니다. 실제 snapshot과 적분기를 새 run으로 다시 관찰할 기간입니다.'
  });
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const choices = element(document, 'div', 'legacy-workspace-choices'),
    recordView = element(document, 'div', 'legacy-workspace-record-view');
  const partLabel = element(document, 'label', 'ds-field__label', '프로젝트 part 선택'),
    parts = element(document, 'select', 'ds-field__control');
  parts.id = 'legacy-workspace-parts';
  partLabel.htmlFor = parts.id;
  const recordLabel = element(document, 'label', 'ds-field__label', '해당 part의 typed record 선택'),
    records = element(document, 'select', 'ds-field__control');
  records.id = 'legacy-workspace-records';
  recordLabel.htmlFor = records.id;
  choices.append(partLabel, parts, recordLabel, records);
  choices.hidden = true;
  const saved = element(document, 'select', 'ds-field__control');
  saved.id = 'legacy-workspace-saved';
  saved.setAttribute('aria-label', '명시적으로 채택한 archive 목록');
  const store = options.store ?? new LegacyWorkspaceStore();
  const downloads = new Set<string>(),
    imageUrls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  let generation = 0,
    disposed = false,
    preview: LegacyWorkspacePreview | undefined,
    adopted = false,
    controller = new AbortController();
  let runListPanel: ReturnType<typeof createLegacyRunListPanel> | undefined;
  const window = document.defaultView!;
  const revokeImages = () => {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls.clear();
  };
  function fail(cause: unknown) {
    error.hidden = false;
    error.textContent =
      cause instanceof Error ? cause.message : '가져오지 못했습니다. 원본과 현재 프로젝트를 보존했습니다.';
  }
  function asyncButton(buttonOptions: Omit<ButtonOptions, 'onClick'> & { onClick(): Promise<void> }) {
    return createButton(document, {
      ...buttonOptions,
      onClick() {
        void buttonOptions.onClick().catch((cause: unknown) => {
          if (!disposed) fail(cause);
        });
      }
    });
  }
  function download(bytes: Uint8Array, filename: string, mime: string) {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    downloads.add(url);
    const anchor = element(document, 'a', '');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      downloads.delete(url);
      timers.delete(timer);
    }, 1000);
    timers.add(timer);
  }
  function invalidate() {
    runListPanel?.dispose();
    runListPanel = undefined;
    controller.abort();
    controller = new AbortController();
    generation++;
    preview = undefined;
    adopted = false;
    choices.hidden = true;
    records.replaceChildren();
    parts.replaceChildren();
    recordView.replaceChildren();
    revokeImages();
    inspect.disabled = false;
    adopt.disabled = backup.disabled = packageButton.disabled = true;
    file.disabled = kind.disabled = duration.input.disabled = false;
    error.hidden = true;
    status.textContent = '원본을 선택하고 미리보기를 실행하세요. 기존 자료는 변경하지 않았습니다.';
  }
  function currentBundle() {
    return preview?.parts.find((part) => part.project.id === parts.value);
  }
  function adoptPart() {
    const bundle = currentBundle();
    if (!bundle) throw new Error('알 수 없는 project part입니다.');
    const previous = readResearchProjectSession(document);
    saveResearchProjectSession(document, { bundle, previous: previous.bundle, pending: undefined });
  }
  function renderRecord() {
    runListPanel?.dispose();
    runListPanel = undefined;
    revokeImages();
    recordView.replaceChildren();
    const current = preview,
      record = current?.records.find((item) => item.id === records.value);
    if (!current || !record) return;
    recordView.append(createLegacyWorkspaceRecordView(document, record));
    const actions = element(document, 'div', 'lab-inline-actions');
    actions.append(
      createButton(document, {
        label: 'typed record JSON 다운로드',
        variant: 'secondary',
        onClick() {
          try {
            download(exportLegacyWorkspaceRecord(current, record.id), `${record.id}.json`, 'application/json');
          } catch (cause) {
            fail(cause);
          }
        }
      })
    );
    if (record.asset) {
      const asset = record.asset;
      actions.append(
        createButton(document, {
          label: asset.mediaType.startsWith('image/') ? '원본 이미지 다운로드' : '원본 ZIP 다운로드',
          variant: 'secondary',
          onClick() {
            try {
              download(exportLegacyWorkspaceAsset(current, record.id), asset.filename, asset.mediaType);
            } catch (cause) {
              fail(cause);
            }
          }
        })
      );
      if (asset.mediaType.startsWith('image/')) {
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(exportLegacyWorkspaceAsset(current, record.id))], { type: asset.mediaType })
        );
        imageUrls.add(url);
        const image = element(document, 'img', 'legacy-workspace-image');
        image.src = url;
        image.alt = record.title;
        image.style.maxWidth = '100%';
        image.loading = 'lazy';
        recordView.append(image);
      }
    }
    if (record.canonical)
      actions.append(
        createButton(document, {
          label: '이 snapshot을 실험실에서 다시 관찰',
          variant: 'secondary',
          disabled: !adopted,
          onClick() {
            try {
              const route = createExperimentRoute(record.canonical);
              if (!route.ok) throw new Error('주소 크기/계약을 확인하세요. typed JSON과 원본을 내려받을 수 있습니다.');
              window.location.hash = route.value;
            } catch (cause) {
              fail(cause);
            }
          }
        })
      );
    const runnableRecords =
      record.kind === 'plan'
        ? current.records.filter((item) => item.parentId === record.id && item.kind === 'point' && item.canonical)
        : record.canonical
          ? [record]
          : [];
    if (runnableRecords.length)
      actions.append(
        createButton(document, {
          label: record.kind === 'plan' ? '이 계획의 원본 조건 실행 목록 준비' : '이 snapshot 실행 목록 준비',
          variant: 'secondary',
          disabled: !adopted,
          onClick() {
            try {
              runListPanel?.dispose();
              runListPanel?.element.remove();
              runListPanel = createLegacyRunListPanel(
                document,
                runnableRecords.map((item) => ({
                  sourceId: item.sourceId ?? item.id,
                  experiment: item.canonical!
                }))
              );
              recordView.append(runListPanel.element);
              runListPanel.element.open = true;
            } catch (cause) {
              fail(cause);
            }
          }
        })
      );
    for (const id of record.links) {
      const target = current.records.find((item) => item.id === id);
      if (!target) continue;
      actions.append(
        createButton(document, {
          label: `연결 기록 ${id} 열기`,
          variant: 'secondary',
          onClick() {
            const mapping = current.mappings.find((item) => item.recordId === id)!;
            parts.value = mapping.partId;
            renderPart(id);
          }
        })
      );
    }
    recordView.append(actions);
  }
  function renderPart(recordId?: string) {
    const current = preview;
    records.replaceChildren();
    if (!current) return;
    const allowed = new Set(
      current.mappings.filter((mapping) => mapping.partId === parts.value).map((mapping) => mapping.recordId)
    );
    for (const item of current.records)
      if (allowed.has(item.id)) {
        const option = element(document, 'option', '', `${item.kind} · ${item.title}`);
        option.value = item.id;
        records.append(option);
      }
    if (recordId && allowed.has(recordId)) records.value = recordId;
    if (adopted) adoptPart();
    renderRecord();
  }
  function showPreview(value: LegacyWorkspacePreview) {
    preview = value;
    adopted = false;
    choices.hidden = false;
    parts.replaceChildren();
    for (const part of value.parts) {
      const option = element(document, 'option', '', `${part.project.title} · run${part.project.runs.length}`);
      option.value = part.project.id;
      parts.append(option);
    }
    renderPart();
    adopt.disabled = backup.disabled = packageButton.disabled = false;
    status.textContent = `미리보기: ${value.records.length}record · ${value.parts.length}part · canonical${value.records.filter((item) => item.canonical).length} · 미해결${value.records.filter((item) => item.status === 'unresolved').length}. 원본 SHA-256 ${value.sourceSha256}. 아직 채택하지 않았습니다.`;
    for (const warning of value.warnings) recordView.prepend(element(document, 'p', 'lab-preview-note', warning));
  }
  const inspect = asyncButton({
    label: '작업공간 미리보기',
    async onClick() {
      invalidate();
      const token = generation,
        selected = file.files?.[0],
        signal = controller.signal;
      if (!selected) return fail(new Error('기존 JSON 파일을 선택하세요.'));
      const limit = kind.value === 'workspace' ? 8 * 1024 * 1024 : 64 * 1024 * 1024;
      if (selected.size > limit || /\.(zip|gz|7z)$/i.test(selected.name))
        return fail(new Error('파일 종류·크기 제한을 확인하세요. 압축 파일을 이 경로에서 풀지 않습니다.'));
      inspect.disabled = true;
      status.textContent = '원본을 변경하지 않고 기록·checksum·project part를 검증하는 중입니다.';
      try {
        const bytes = new Uint8Array(await (options.readFile ? options.readFile(selected) : selected.arrayBuffer()));
        if (disposed || generation !== token) return;
        const result = await previewLegacyWorkspace(
          bytes,
          {
            kind: kind.value as 'workspace' | 'research-db',
            sourceId: 'workspace-import',
            durationSeconds: duration.input.valueAsNumber
          },
          signal
        );
        if (disposed || generation !== token) return;
        if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(' '));
        showPreview(result.value);
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      } finally {
        if (!disposed && token === generation) inspect.disabled = false;
      }
    }
  });
  const backup = createButton(document, {
    label: '전체 원본 archive 백업',
    variant: 'secondary',
    disabled: true,
    onClick() {
      if (preview) download(exportLegacyWorkspaceSource(preview), 'legacy-source-original.json', 'application/json');
    }
  });
  const packageButton = asyncButton({
    label: '선택 project part ZIP 다운로드',
    variant: 'secondary',
    disabled: true,
    async onClick() {
      const token = generation,
        bundle = currentBundle();
      if (!bundle) return;
      try {
        const bytes = await buildResearchPackage(bundle);
        if (!disposed && token === generation) download(bytes, `${bundle.project.id}.zip`, 'application/zip');
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      }
    }
  });
  const adopt = asyncButton({
    label: '전체 자료 보관 후 선택 프로젝트 채택',
    disabled: true,
    async onClick() {
      const current = preview,
        token = generation,
        signal = controller.signal;
      if (!current) return;
      adopt.disabled = inspect.disabled = file.disabled = kind.disabled = duration.input.disabled = true;
      try {
        const confirmed = await confirmLegacyWorkspace(current, current.id);
        if (!confirmed.ok) throw new Error(confirmed.issues.map((issue) => issue.message).join(' '));
        if (disposed || token !== generation) return;
        await store.save(current, signal);
        if (disposed || token !== generation) return;
        adopted = true;
        adoptPart();
        renderRecord();
        status.textContent = `전체 원본과${current.parts.length}개part를 별도 product DB에 보관했습니다. 선택한 프로젝트를 채택했고 snapshot 다시 열기를 사용할 수 있습니다. 기존 저장소는 변경하지 않았습니다.`;
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      } finally {
        if (!disposed && token === generation) {
          file.disabled = kind.disabled = duration.input.disabled = inspect.disabled = false;
          adopt.disabled = false;
        }
      }
    }
  });
  const savedList = asyncButton({
    label: '채택한 자료 목록 읽기',
    variant: 'secondary',
    async onClick() {
      const token = generation;
      try {
        const list = await store.list();
        if (disposed || token !== generation) return;
        saved.replaceChildren();
        for (const item of list) {
          const option = element(
            document,
            'option',
            '',
            `${item.sourceKind} · ${item.records}record · ${item.importedAt}`
          );
          option.value = item.id;
          saved.append(option);
        }
        status.textContent = `별도 product 보관함${list.length}개. 원본 legacy DB는 읽지 않았습니다.`;
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      }
    }
  });
  const savedLoad = asyncButton({
    label: '선택 보관 자료 다시 미리보기',
    variant: 'secondary',
    async onClick() {
      invalidate();
      const token = generation;
      try {
        const value = await store.load(saved.value, controller.signal);
        if (!disposed && token === generation) showPreview(value);
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      }
    }
  });
  parts.addEventListener('change', () => {
    try {
      renderPart();
    } catch (cause) {
      fail(cause);
    }
  });
  records.addEventListener('change', renderRecord);
  file.addEventListener('change', invalidate);
  kind.addEventListener('change', invalidate);
  duration.input.addEventListener('input', invalidate);
  body.append(
    fileLabel,
    file,
    kindLabel,
    kind,
    duration.element,
    inspect,
    createButton(document, { label: '작업공간 미리보기 취소', variant: 'secondary', onClick: invalidate }),
    adopt,
    backup,
    packageButton,
    status,
    error,
    choices,
    recordView,
    savedList,
    saved,
    savedLoad
  );
  return {
    element: root,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      runListPanel?.dispose();
      generation++;
      revokeImages();
      for (const timer of timers) clearTimeout(timer);
      for (const url of downloads) URL.revokeObjectURL(url);
      downloads.clear();
      store.close();
    }
  };
}
