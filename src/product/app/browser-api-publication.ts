const owned = new WeakMap<Document, object>();

/** Track only the exact namespace this document explicitly published. */
export function rememberProductPublicNamespace(document: Document, value: object) {
  owned.set(document, value);
}
export function productPublicNamespace(document: Document): object {
  const value = owned.get(document);
  if (!value || (document.defaultView as (Window & { PendulumLab?: unknown }) | null)?.PendulumLab !== value)
    throw new Error('기본 스크립트 API를 먼저 활성화하세요. 다른 소유자의 PendulumLab을 변경하지 않았습니다.');
  return value;
}
export function replaceProductPublicNamespace(document: Document, next: object) {
  productPublicNamespace(document);
  Object.defineProperty(document.defaultView, 'PendulumLab', { configurable: true, value: next });
  owned.set(document, next);
}
export function removeProductPublicNamespace(document: Document) {
  const value = owned.get(document);
  if ((document.defaultView as (Window & { PendulumLab?: unknown }) | null)?.PendulumLab === value)
    Reflect.deleteProperty(document.defaultView!, 'PendulumLab');
  owned.delete(document);
}
