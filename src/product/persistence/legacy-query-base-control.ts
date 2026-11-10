import { element } from '../app/dom';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { parseExperiment } from './serialization';
import { DATA_LIMITS } from './safe-data';

const systems = [
  ['system:double', '이중진자'],
  ['system:compound-double', '복합진자'],
  ['system:triple', '삼중진자']
] as const;
type BaseSystem = (typeof systems)[number][0];

/** The base is explicitly chosen and read-only. A completed upload never
 * authorizes preview, adoption, storage or engine execution on its own. */
export function createLegacyQueryBaseControl(
  document: Document,
  options: {
    onChange(): void;
    onBusyChange(busy: boolean): void;
    onError(message: string): void;
  }
) {
  const root = element(document, 'div', 'legacy-query-base');
  const label = element(document, 'label', 'ds-field__label');
  const checkbox = element(document, 'input', '');
  checkbox.type = 'checkbox';
  checkbox.id = 'legacy-query-base';
  const copy = document.createTextNode('');
  label.htmlFor = checkbox.id;
  label.append(checkbox, copy);
  const controls = element(document, 'div', 'lab-inspector-grid');
  const modeLabel = element(document, 'label', 'ds-field__label', 'query base의 원본');
  modeLabel.htmlFor = 'legacy-base-mode';
  const mode = element(document, 'select', 'ds-field__control');
  mode.id = modeLabel.htmlFor;
  for (const [value, title] of [
    ['default', '선택한 시스템의 새 실험실 기본 조건'],
    ['file', '보관한 canonical 설정 JSON 파일']
  ]) {
    const option = element(document, 'option', '', title);
    option.value = value!;
    mode.append(option);
  }
  const systemGroup = element(document, 'div', '');
  const systemLabel = element(document, 'label', 'ds-field__label', 'query base 시스템');
  systemLabel.htmlFor = 'legacy-base-system';
  const system = element(document, 'select', 'ds-field__control');
  system.id = systemLabel.htmlFor;
  for (const [value, title] of systems) {
    const option = element(document, 'option', '', title);
    option.value = value;
    system.append(option);
  }
  systemGroup.append(systemLabel, system);
  const fileGroup = element(document, 'div', '');
  const fileLabel = element(document, 'label', 'ds-field__label', 'query base canonical JSON 파일');
  fileLabel.htmlFor = 'legacy-base-file';
  const file = element(document, 'input', 'ds-field__control');
  file.id = fileLabel.htmlFor;
  file.type = 'file';
  file.accept = '.json,application/json';
  file.style.width = '100%';
  file.style.minWidth = '0';
  file.style.boxSizing = 'border-box';
  const status = element(
    document,
    'p',
    'lab-muted',
    'pendulum-experiment/v1 설정 파일을 선택하세요. 최대 256 KiB이며 읽기만 합니다.'
  );
  status.id = 'legacy-base-status';
  status.setAttribute('role', 'status');
  fileGroup.append(fileLabel, file, status);
  controls.append(
    modeLabel,
    mode,
    systemGroup,
    fileGroup,
    element(
      document,
      'p',
      'lab-muted',
      'URL에 없는 값은 선택한 base에서만 상속합니다. 최종 물성·초기조건·적분기·허용오차를 미리보기에서 확인한 뒤 직접 확정하세요.'
    )
  );
  root.append(label, controls);
  let snapshot: ExperimentStateV1 | undefined;
  let busy = false,
    disposed = false,
    generation = 0,
    selectingFile = false;
  function sync() {
    const enabled = checkbox.checked,
      uploaded = mode.value === 'file';
    controls.hidden = !enabled;
    mode.disabled = !enabled;
    systemGroup.hidden = uploaded;
    system.disabled = !enabled || uploaded;
    fileGroup.hidden = !uploaded;
    file.disabled = !enabled || !uploaded;
    copy.textContent =
      !uploaded && system.value === 'system:double'
        ? ' 불완전한 query에는 새 실험실 기본 이중진자를 base로 사용 (변환 값을 미리보기에서 확인)'
        : uploaded
          ? ' 불완전한 query에 확인한 canonical 파일을 base로 사용 (변환 값을 미리보기에서 확인)'
          : ` 불완전한 query에 선택한 ${systems.find(([id]) => id === system.value)?.[1] ?? '시스템'} 기본 조건을 base로 사용 (변환 값을 미리보기에서 확인)`;
  }
  function cancelPending() {
    generation++;
    if (busy) {
      busy = false;
      if (!selectingFile) file.value = '';
      snapshot = undefined;
      status.textContent = 'base 파일 읽기를 취소했습니다. 사용할 파일을 다시 선택하세요.';
    }
  }
  for (const control of [checkbox, mode, system])
    control.addEventListener('change', () => {
      options.onChange();
      sync();
    });
  file.addEventListener('change', () => void readFile());
  async function readFile() {
    if (disposed) return;
    // Invalidating an older read must not clear the newly selected replacement.
    selectingFile = true;
    try {
      options.onChange();
    } finally {
      selectingFile = false;
    }
    snapshot = undefined;
    const selected = file.files?.[0];
    if (!selected) {
      status.textContent = '사용할 canonical base 파일을 선택하세요.';
      return;
    }
    const pending = ++generation;
    busy = true;
    options.onBusyChange(true);
    status.textContent = 'canonical base 파일을 읽는 중입니다. 아직 적용하지 않았습니다.';
    try {
      if (selected.size > DATA_LIMITS.bytes)
        throw new Error('base 파일은 256 KiB 이하여야 합니다. 원본 파일을 보존하세요.');
      const bytes = await selected.arrayBuffer();
      if (disposed || pending !== generation) return;
      if (bytes.byteLength > DATA_LIMITS.bytes)
        throw new Error('base 파일은 256 KiB 이하여야 합니다. 원본 파일을 보존하세요.');
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new Error('base 파일은 올바른 UTF-8 JSON이어야 합니다. 원본을 보존하고 인코딩을 확인하세요.');
      }
      const parsed = parseExperiment(text);
      if (!parsed.ok)
        throw new Error(`canonical base JSON을 확인하세요. ${parsed.issues.map((item) => item.message).join(' ')}`);
      const module = await import('./legacy-migration');
      if (disposed || pending !== generation) return;
      const checked = module.validateLegacyMigrationBase(parsed.value);
      if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
      snapshot = checked.value;
      status.textContent = `${selected.name} · ${snapshot.systemId} · ${snapshot.integrator.kind === 'selectable' ? snapshot.integrator.id : '내부 적분기'}. 파일은 읽기만 했습니다. URL을 미리보기한 뒤 확정하세요.`;
    } catch (cause) {
      if (!disposed && pending === generation) {
        const message = cause instanceof Error ? cause.message : 'base 파일을 읽지 못했습니다. 원본을 보존하세요.';
        status.textContent = message;
        options.onError(message);
      }
    } finally {
      if (!disposed && pending === generation) {
        busy = false;
        options.onBusyChange(false);
      }
    }
  }
  sync();
  return {
    element: root,
    cancelPending,
    read(
      module: typeof import('./legacy-migration')
    ): { ok: true; value?: ExperimentStateV1 } | { ok: false; message: string } {
      if (!checkbox.checked) return { ok: true };
      if (mode.value === 'file')
        return snapshot && !busy
          ? { ok: true, value: structuredClone(snapshot) }
          : {
              ok: false,
              message:
                'canonical base 파일을 먼저 선택하고 읽기가 끝난 뒤 미리보기를 실행하세요. 원본은 변경하지 않았습니다.'
            };
      if (mode.value !== 'default' || !systems.some(([id]) => id === system.value))
        return { ok: false, message: '명시적인 query base 원본과 시스템을 선택하세요.' };
      return { ok: true, value: module.defaultLegacyMigrationBase(system.value as BaseSystem) };
    },
    dispose() {
      disposed = true;
      cancelPending();
    }
  };
}
