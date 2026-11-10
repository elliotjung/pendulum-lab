import { element, link } from './dom';
import { createThemeControl } from '../design-system/theme';
import { createProductCommandPalette } from './command-palette';
import { createProductLocaleControl } from './locale';
import { createProductBrowserApiControl } from './browser-api';

export interface ProductShell {
  readonly outlet: HTMLElement;
  setSpace(space: 'learn' | 'lab' | null): void;
  dispose(): void;
}

/** The common shell never executes an engine or writes user storage. */
export function createShell(root: HTMLElement, document: Document): ProductShell {
  root.classList.add('product-app');
  const skip = link(document, '본문으로 건너뛰기', '#product-main', 'product-skip-link');
  const header = element(document, 'header', 'product-header');
  const identity = element(document, 'div', 'product-identity');
  const brand = link(document, 'Pendulum Lab', '#/learn', 'product-brand');
  identity.append(brand, element(document, 'span', 'product-preview-label', '새 공간 미리보기'));

  const navigation = element(document, 'nav', 'product-navigation');
  navigation.setAttribute('aria-label', '주요 공간');
  const learnLink = link(document, '배우기', '#/learn', 'product-space-link');
  const labLink = link(document, '실험실', '#/lab', 'product-space-link');
  navigation.append(learnLink, labLink);
  const theme = createThemeControl(document, 'product-theme');
  header.append(
    identity,
    navigation,
    theme.element,
    link(document, '기존 앱 열기', './app.html', 'product-legacy-link')
  );

  const outlet = element(document, 'main', 'product-main');
  outlet.id = 'product-main';
  outlet.tabIndex = -1;
  const footer = element(document, 'footer', 'product-footer');
  footer.append(element(document, 'p', '', 'Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.'));
  footer.append(link(document, '컴포넌트 갤러리', './next.html?gallery=components'));
  const commands = createProductCommandPalette(document, root);
  const locale = createProductLocaleControl(document, root);
  const browserApi = createProductBrowserApiControl(document);
  footer.append(commands.element, locale.element, browserApi.element);

  // Keep the route hash intact: the skip link moves focus within the current view.
  const skipToMain = (event: MouseEvent) => {
    event.preventDefault();
    outlet.focus();
    outlet.scrollIntoView?.({ block: 'start' });
  };
  skip.addEventListener('click', skipToMain);
  root.replaceChildren(skip, header, outlet, footer);

  return {
    outlet,
    setSpace(space) {
      for (const [name, node] of [
        ['learn', learnLink],
        ['lab', labLink]
      ] as const) {
        if (space === name) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
      }
    },
    dispose() {
      skip.removeEventListener('click', skipToMain);
      theme.dispose();
      commands.dispose();
      locale.dispose();
      browserApi.dispose();
      root.replaceChildren();
      root.classList.remove('product-app');
    }
  };
}
