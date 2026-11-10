import { element } from '../app/dom';
import { createButton } from '../design-system/primitives';
import { MAX_PRODUCT_SETUP_FILE_BYTES, parseProductSetup, type ProductSetupV1 } from './product-setup';
import { createProductSetupRoute } from './share-route';

/** A file is only previewed. Opening its validated setup is a separate action
 * and neither step writes a storage key or starts a solver. */
export function createSetupFileControl(document: Document, canUse: () => boolean) {
  const root = element(document, 'section', 'ds-section');
  root.append(element(document, 'h3', '', '전체 설정 JSON 미리보기'));
  const label = element(document, 'label', 'ds-field__label', '전체 설정 JSON 파일');
  label.htmlFor = 'product-setup-file';
  const file = element(document, 'input', 'ds-field__control');
  Object.assign(file, { id: label.htmlFor, type: 'file', accept: '.json,application/json' });
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const preview = element(document, 'pre', 'core-result-json');
  preview.tabIndex = 0;
  preview.setAttribute('role', 'region');
  preview.setAttribute('aria-label', '전체 설정 JSON 미리보기');
  let generation = 0,
    disposed = false,
    current: ProductSetupV1 | undefined;
  function invalidate() {
    generation++;
    current = undefined;
    preview.textContent = '';
    open.disabled = true;
  }
  const open = createButton(document, {
    label: '확인한 전체 설정을 새 실험으로 열기',
    disabled: true,
    onClick() {
      if (!current || !canUse()) {
        status.textContent = '현재 실행과 분석을 멈춘 뒤 파일을 다시 확인하세요.';
        return;
      }
      const route = createProductSetupRoute(current);
      if (!route.ok) {
        status.textContent = route.issues.map((i) => i.message).join(' ');
        return;
      }
      document.defaultView!.location.hash = route.value;
    }
  });
  const cancel = createButton(document, {
    label: '전체 설정 미리보기 취소',
    variant: 'secondary',
    onClick() {
      invalidate();
      file.value = '';
      status.textContent = '미리보기를 취소했습니다. 원본 파일과 현재 조건은 그대로입니다.';
    }
  });
  file.addEventListener('change', () => {
    invalidate();
    const selected = file.files?.[0],
      pending = generation;
    if (!selected) return;
    void (async () => {
      try {
        if (selected.size > MAX_PRODUCT_SETUP_FILE_BYTES)
          throw new Error('전체 설정 파일은256KiB 이하여야 합니다. 원본을 보존하세요.');
        const bytes = await selected.arrayBuffer();
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new Error('UTF-8 텍스트 파일을 선택하세요. 원본과 현재 조건은 보존했습니다.');
        }
        if (disposed || pending !== generation) return;
        const parsed = parseProductSetup(text);
        if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join(' '));
        current = parsed.value;
        preview.textContent = JSON.stringify(current, null, 2);
        open.disabled = false;
        status.textContent =
          '파일의 SI 조건과 전체 전달 설정을 확인하세요. 원본 파일과 브라우저 저장소는 변경하지 않았습니다.';
      } catch (cause) {
        if (!disposed && pending === generation)
          status.textContent = cause instanceof Error ? cause.message : 'UTF-8 설정 파일을 읽지 못했습니다.';
      }
    })();
  });
  root.append(label, file, status, preview, open, cancel);
  return {
    element: root,
    dispose() {
      disposed = true;
      invalidate();
    }
  };
}
