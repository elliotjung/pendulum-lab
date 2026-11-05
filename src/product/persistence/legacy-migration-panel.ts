import { element, link } from '../app/dom';
import { createButton, createInput } from '../design-system/primitives';
import { createExperimentRoute } from './share-route';
import { serializeExperiment } from './serialization';
import { DATA_LIMITS } from './safe-data';
import type { LegacyMigrationPreview } from './legacy-migration';

/** Opt-in import only. Never enumerates, reads or writes the user's stored sessions. */
export function createLegacyMigrationPanel(document: Document) {
  const details = element(document, 'details', 'ds-section');
  details.id = 'legacy-migration';
  const heading = element(document, 'summary', 'ds-section__heading', '기존 데이터 가져오기');
  const body = element(document, 'div', 'ds-section__body');
  details.append(heading, body);
  body.append(
    element(
      document,
      'p',
      '',
      '저장 파일이나 공유 링크를 먼저 확인하세요. 원본을 백업하고, 지원하는 설정만 새 실험실에서 열 수 있습니다. 기존 브라우저 저장과 파일은 덮어쓰지 않습니다.'
    ),
    element(
      document,
      'p',
      'lab-muted',
      '가져온 상태에서 새 관찰을 시작합니다. 이전 적분기의 내부 기록, 난수 흐름, 지연 이력을 이어 계산하는 기능은 아닙니다.'
    )
  );
  const label = element(document, 'label', 'ds-field__label', '기존 JSON 또는 공유 링크');
  label.htmlFor = 'legacy-migration-source';
  const source = element(document, 'textarea', 'ds-field__control');
  source.id = label.htmlFor;
  source.rows = 6;
  source.spellcheck = false;
  source.style.width = '100%';
  source.style.boxSizing = 'border-box';
  const fileLabel = element(document, 'label', 'ds-field__label', '기존 저장 파일 선택');
  const file = element(document, 'input', 'ds-field__control');
  file.id = 'legacy-migration-file';
  file.type = 'file';
  file.accept = '.json,.txt,application/json,text/plain';
  fileLabel.htmlFor = file.id;
  const duration = createInput(document, {
    id: 'legacy-migration-duration',
    label: '새 관찰 시간 (s)',
    type: 'number',
    value: '5',
    help: '기존 저장에는 관찰 종료 시간이 없으므로 새로 정합니다. 가져온 시각부터 이 기간 동안 관찰합니다.'
  });
  duration.input.min = '0.001';
  duration.input.step = 'any';
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-atomic', 'true');
  const result = element(document, 'div', 'lab-import-preview');
  result.setAttribute('aria-label', '가져오기 미리보기');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let preview: LegacyMigrationPreview | undefined;
  let migration: typeof import('./legacy-migration') | undefined;
  let fileSourceText: string | undefined;
  let generation = 0;
  let disposed = false;

  function invalidate() {
    generation++;
    preview = undefined;
    result.replaceChildren();
    backup.disabled = true;
    canonical.disabled = true;
    adopt.disabled = true;
    inspect.disabled = false;
    error.hidden = true;
    notice.textContent = '입력과 관찰 시간을 확인한 뒤 미리보기를 실행하세요.';
  }

  function showError(message: string) {
    error.textContent = message;
    error.hidden = false;
  }

  function download(text: string, filename: string, mediaType: string) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mediaType }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
      notice.textContent = '파일을 만들었습니다. 다운로드 목록에서 확인하세요.';
    } catch {
      showError('파일을 내려받지 못했습니다. 원본 입력을 복사해서 보관하거나 기존 앱에서 복구하세요.');
    }
  }

  const inspect = createButton(document, {
    label: '가져오기 미리보기',
    onClick() {
      void inspectSource();
    }
  });
  async function inspectSource() {
    invalidate();
    const pending = generation;
    inspect.disabled = true;
    notice.textContent = '원본을 변경하지 않고 설정을 확인하는 중입니다.';
    try {
      const loaded = await import('./legacy-migration');
      if (disposed || generation !== pending) return;
      migration = loaded;
      preview = migration.previewLegacyMigration(fileSourceText ?? source.value, {
        durationSeconds: duration.input.valueAsNumber
      });
      backup.disabled = false;
      const ready = preview.status === 'ready';
      canonical.disabled = !ready;
      adopt.disabled = !ready;
      const summary = element(document, 'ul', '');
      for (const message of preview.summary) summary.append(element(document, 'li', '', message));
      result.append(
        element(document, 'h2', '', ready ? '새 실험 설정을 확인했습니다' : '원본을 보존하고 복구가 필요합니다'),
        summary
      );
      if (preview.canonical) {
        const state = preview.canonical;
        const values = element(document, 'dl', 'product-detail-list');
        for (const [name, quantity] of Object.entries({ ...state.parameters, ...state.initialConditions })) {
          const value =
            quantity.kind === 'scalar'
              ? String(quantity.value)
              : quantity.kind === 'vector'
                ? quantity.values.join(', ')
                : `Re [${quantity.re.join(', ')}], Im [${quantity.im.join(', ')}]`;
          values.append(element(document, 'dt', '', name), element(document, 'dd', '', `${value} ${quantity.unit}`));
        }
        values.append(
          element(document, 'dt', '', '적분기'),
          element(
            document,
            'dd',
            '',
            state.integrator.kind === 'selectable'
              ? state.integrator.id.slice('integrator:'.length)
              : '시스템 내부 방식'
          )
        );
        if (state.runtime.domain === 'time')
          values.append(
            element(document, 'dt', '', '시간 간격 / 시작 시각 / 관찰 시간'),
            element(
              document,
              'dd',
              '',
              `${state.runtime.step.value} s / ${state.runtime.start.value} s / ${state.runtime.duration.value} s`
            )
          );
        values.append(
          element(document, 'dt', '', 'seed'),
          element(document, 'dd', '', state.seed ? state.seed.value : '원본 지정 없음')
        );
        result.append(values);
      }
      // Keep every source-provided string as text, including malformed HTML/URLs.
      for (const issue of preview.issues)
        result.append(element(document, 'p', 'ds-field__error', `${issue.path}: ${issue.message}`));
      for (const warning of preview.warnings) result.append(element(document, 'p', 'lab-muted', warning));
      notice.textContent = ready
        ? '미리보기만 생성했습니다. 원본 백업을 내려받고 설정을 확인한 뒤 새 실험실에서 여세요.'
        : '새 실험실에 적용하지 않았습니다. 원본 백업을 내려받아 기존 앱에서 열 수 있습니다.';
    } catch {
      if (!disposed && generation === pending)
        showError('미리보기를 불러오지 못했습니다. 원본 입력을 보관하고 다시 시도하거나 기존 앱에서 복구하세요.');
    } finally {
      if (!disposed && generation === pending) inspect.disabled = false;
    }
  }
  const backup = createButton(document, {
    label: '원본 백업 다운로드',
    variant: 'secondary',
    disabled: true,
    onClick() {
      if (!preview || !migration) return;
      const original = migration.exportLegacyMigrationBackup(preview);
      download(original.text, original.fileName, original.mediaType);
    }
  });
  const canonical = createButton(document, {
    label: '새 설정 JSON 다운로드',
    variant: 'secondary',
    disabled: true,
    onClick() {
      if (!preview || !migration) return;
      const confirmed = migration.confirmLegacyMigration(preview, preview.id);
      if (!confirmed.ok) return showError('설정을 다시 확인하려면 미리보기를 실행하세요. 원본은 보존됩니다.');
      const serialized = serializeExperiment(confirmed.value);
      if (!serialized.ok) return showError('새 설정을 저장하지 못했습니다. 원본 백업을 보관하세요.');
      download(serialized.value, 'pendulum-migrated-experiment.json', 'application/json');
    }
  });
  const adopt = createButton(document, {
    label: '확인하고 새 실험실에서 열기',
    disabled: true,
    onClick() {
      if (!preview || !migration) return;
      const confirmed = migration.confirmLegacyMigration(preview, preview.id);
      if (!confirmed.ok) return showError('설정 확인이 만료되었습니다. 미리보기를 다시 실행하세요.');
      const route = createExperimentRoute(confirmed.value);
      if (!route.ok) return showError('공유 주소로 만들 수 없습니다. 새 설정 JSON과 원본 백업을 내려받으세요.');
      document.defaultView!.location.hash = route.value;
    }
  });
  const cancel = createButton(document, {
    label: '미리보기 취소',
    variant: 'secondary',
    onClick: invalidate
  });
  source.addEventListener('input', () => {
    fileSourceText = undefined;
    invalidate();
  });
  duration.input.addEventListener('input', invalidate);
  file.addEventListener('change', async () => {
    invalidate();
    const selected = file.files?.[0];
    if (!selected) return;
    fileSourceText = undefined;
    source.value = '';
    const pending = generation;
    inspect.disabled = true;
    notice.textContent = '선택한 파일을 읽는 중입니다. 이전 입력은 적용하지 않습니다.';
    try {
      if (selected.size > DATA_LIMITS.bytes) throw new Error('size');
      const bytes = await selected.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (disposed || generation !== pending) return;
      // Textarea normalizes CRLF on assignment; backups retain the decoded file text.
      fileSourceText = text;
      source.value = text;
      notice.textContent = '파일을 읽었습니다. 미리보기 전에는 적용하지 않습니다.';
    } catch {
      if (!disposed && generation === pending)
        showError('파일은 크기 제한 안의 UTF-8 텍스트여야 합니다. 원본 파일은 기존 앱에서 열어 복구할 수 있습니다.');
    } finally {
      if (!disposed && generation === pending) inspect.disabled = false;
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(inspect, backup, canonical, adopt, cancel);
  body.append(
    label,
    source,
    fileLabel,
    file,
    duration.element,
    actions,
    notice,
    error,
    result,
    link(document, '기존 앱에서 원본 복구하기', './app.html')
  );
  return {
    element: details,
    dispose() {
      disposed = true;
      generation++;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
