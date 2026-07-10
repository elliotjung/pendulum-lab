import { MAX_JSON_BYTES } from '../validation/importSchema';

/** Browser-only preflight for file inputs; schema parsing remains headless. */
export function installJsonImportGuard(inputId = 'jsonFile'): void {
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener(
    'change',
    (event) => {
      const file = input.files?.[0];
      if (!file || file.size <= MAX_JSON_BYTES) return;
      event.stopImmediatePropagation();
      if (typeof window.toast === 'function') window.toast('Import rejected: JSON file is too large', 2400);
      input.value = '';
    },
    { capture: true }
  );
}
