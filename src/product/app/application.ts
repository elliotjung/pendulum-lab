import { createErrorView } from './errors';
import { createRouter } from './router';
import { createShell } from './shell';
import type { ProductSpace, RouteModule } from './types';

const loaders: Record<ProductSpace, () => Promise<RouteModule>> = {
  learn: () => import('./views/learn'),
  lab: () => import('./views/lab')
};

const mounts = new WeakMap<HTMLElement, { dispose(): void }>();

export function mountApplication(root: HTMLElement, window: Window) {
  mounts.get(root)?.dispose();
  const document = root.ownerDocument;
  const shell = createShell(root, document);
  const { outlet } = shell;
  const router = createRouter({
    document,
    port: {
      readHash: () => window.location.hash,
      replaceHash: (hash) => window.history.replaceState(window.history.state, '', hash),
      subscribe: (listener) => {
        window.addEventListener('hashchange', listener);
        return () => window.removeEventListener('hashchange', listener);
      }
    },
    load: (space, route) =>
      route.kind === 'lab-system' && ['system:double', 'system:compound-double'].includes(route.systemId)
        ? import('./views/core-lab')
        : route.kind === 'lab-system' && ['system:triple', 'system:chain'].includes(route.systemId)
          ? import('./views/chain-lab')
          : loaders[space](),
    presentation: {
      loading(space) {
        shell.setSpace(space);
        outlet.dataset.productState = 'loading';
        outlet.setAttribute('aria-busy', 'true');
        const status = document.createElement('p');
        status.className = 'product-message';
        status.setAttribute('role', 'status');
        status.textContent = `${space === 'learn' ? '배우기' : '실험실'} 화면을 불러오는 중입니다.`;
        const cancel = document.createElement('button');
        cancel.className = 'product-action product-action-secondary';
        cancel.type = 'button';
        cancel.textContent = '불러오기 취소';
        cancel.addEventListener('click', () => router.cancel());
        outlet.replaceChildren(status, cancel);
      },
      cancelled(space) {
        shell.setSpace(space);
        outlet.dataset.productState = 'cancelled';
        outlet.removeAttribute('aria-busy');
        const section = document.createElement('section');
        section.className = 'product-message';
        const heading = document.createElement('h1');
        heading.className = 'product-title';
        heading.tabIndex = -1;
        heading.textContent = '화면 불러오기를 취소했습니다';
        const message = document.createElement('p');
        message.setAttribute('role', 'status');
        message.textContent = '위에서 다른 공간을 선택하거나 같은 주소를 다시 열 수 있습니다.';
        const retry = document.createElement('button');
        retry.className = 'product-action product-action-primary';
        retry.type = 'button';
        retry.textContent = '다시 시도';
        retry.addEventListener('click', () => window.location.reload());
        section.append(heading, message, retry);
        outlet.replaceChildren(section);
        document.title = '불러오기 취소 | Pendulum Lab';
        heading.focus();
      },
      ready(view, space) {
        shell.setSpace(space);
        outlet.dataset.productState = 'ready';
        outlet.removeAttribute('aria-busy');
        outlet.replaceChildren(view.element);
        document.title = `${view.title} | Pendulum Lab`;
        outlet.querySelector('h1')?.focus();
      },
      error(kind, space) {
        shell.setSpace(space);
        outlet.dataset.productState = kind;
        outlet.removeAttribute('aria-busy');
        const view = createErrorView(document, kind, () => window.location.reload());
        outlet.replaceChildren(view.element);
        document.title = `${view.title} | Pendulum Lab`;
        outlet.querySelector('h1')?.focus();
      }
    }
  });
  const onError = () => router.fail();
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);
  root.dataset.bootstrapState = 'ready';
  const mounted = {
    dispose() {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
      router.dispose();
      shell.dispose();
      mounts.delete(root);
    }
  };
  mounts.set(root, mounted);
  void router.start();
  return mounted;
}
