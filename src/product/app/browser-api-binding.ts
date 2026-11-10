import type { RuntimeSnapshot } from '../../types/domain';

/** The active workspace owns validation/commit; an API never caches a detached solver state. */
export interface ProductRuntimeProvider {
  snapshot(): RuntimeSnapshot;
  applySnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot;
  toggle(): void;
  reset(): void;
}
const providers = new WeakMap<Document, ProductRuntimeProvider>();

export function bindProductRuntime(document: Document, provider: ProductRuntimeProvider): () => void {
  providers.set(document, provider);
  return () => {
    if (providers.get(document) === provider) providers.delete(document);
  };
}
export function requireProductRuntime(document: Document): ProductRuntimeProvider {
  const provider = providers.get(document);
  if (!provider)
    throw new Error('현재 지원하는 이중·복합·삼중 진자 실험실을 먼저 여세요. 다른 화면의 상태를 추측하지 않습니다.');
  return provider;
}
