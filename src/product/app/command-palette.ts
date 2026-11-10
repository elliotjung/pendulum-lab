import { element } from './dom';
import { createButton, createInput } from '../design-system/primitives';
import { createDialog } from '../design-system/dialog';
import { commandAnalysisTarget, productCommands, searchProductCommands, type ProductCommand } from './command-index';

export function createProductCommandPalette(document: Document, root: HTMLElement) {
  const body = element(document, 'div', '');
  const query = createInput(document, {
    id: 'product-command-query',
    label: '시스템·분석·단원·현재 행동 검색',
    type: 'search',
    onInput: render
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const results = element(document, 'ul', '');
  results.setAttribute('aria-label', '명령 검색 결과');
  body.append(query.element, notice, results);
  const dialog = createDialog(document, {
    id: 'product-command-dialog',
    title: '명령 검색 · Command search',
    content: body
  });
  let disposed = false;
  let observer: MutationObserver | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const catalogCommands = productCommands();
  const actions = new Map<string, HTMLElement>();
  let commands: ProductCommand[] = [];
  const button = createButton(document, {
    label: '명령 검색 (Ctrl/⌘ K)',
    variant: 'secondary',
    onClick: () => open(button)
  });
  function clearPending() {
    observer?.disconnect();
    observer = undefined;
    clearTimeout(timeout);
    timeout = undefined;
  }
  function activateAnalysis(id: string) {
    clearPending();
    const target = commandAnalysisTarget(id);
    const apply = () => {
      const tab = document.getElementById(`lab-panels-tab-${target.tab ?? 'analysis'}`) as HTMLButtonElement | null;
      if (!tab) return;
      if (tab.getAttribute('aria-selected') !== 'true') tab.click();
      const section = document.getElementById(target.container) as HTMLDetailsElement | null;
      if (!section) return;
      if (section.tagName === 'DETAILS' && !section.open) section.open = true;
      if (!target.select) {
        const heading = section.querySelector<HTMLElement>('summary,h2,h3,h4') ?? section;
        if (heading.tagName !== 'SUMMARY') heading.tabIndex = -1;
        heading.focus();
        heading.scrollIntoView?.({ block: 'nearest' });
        clearPending();
        return;
      }
      const select = document.getElementById(target.select) as HTMLSelectElement | null;
      if (!select || ![...select.options].some((option) => option.value === target.kind)) return;
      select.value = target.kind;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.focus();
      clearPending();
    };
    observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    timeout = setTimeout(clearPending, 15000);
    apply();
  }
  function choose(command: ProductCommand) {
    dialog.close('chosen');
    const action = actions.get(command.id);
    if (action?.isConnected) {
      action.click();
      return;
    }
    const window = document.defaultView!;
    if (command.analysisId) {
      // Keep the selected native system when it already has a diagnostics dock.
      if (commandAnalysisTarget(command.analysisId).forceRoute || !document.getElementById('lab-panels-tab-analysis'))
        window.location.hash = command.route;
      activateAnalysis(command.analysisId);
    } else window.location.hash = command.route;
  }
  function render() {
    const found = searchProductCommands(commands, query.input.value);
    notice.textContent = `${found.length}개 결과 · 계산은 도구에서 별도로 시작합니다.`;
    results.replaceChildren();
    for (const command of found.slice(0, 60)) {
      const row = element(document, 'li', '');
      row.append(
        createButton(document, { label: command.label, variant: 'secondary', onClick: () => choose(command) })
      );
      results.append(row);
    }
  }
  function open(trigger: HTMLElement = button) {
    if (disposed) return;
    actions.clear();
    commands = [...catalogCommands];
    let index = 0;
    for (const node of root.querySelectorAll<HTMLElement>('button,a[href]')) {
      if (
        node === button ||
        dialog.element.contains(node) ||
        node.matches(':disabled') ||
        !node.getClientRects().length
      )
        continue;
      const label = node.getAttribute('aria-label') ?? node.textContent?.trim();
      if (!label) continue;
      const id = `action:${index++}`;
      actions.set(id, node);
      commands.push({ id, label: `현재 행동 · ${label}`, keywords: `action current ${label}`, route: '' });
    }
    query.input.value = '';
    render();
    dialog.open(trigger);
    query.input.focus();
  }
  const keydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
      event.preventDefault();
      const active = document.activeElement;
      open(active && 'focus' in active ? (active as HTMLElement) : button);
    }
  };
  document.addEventListener('keydown', keydown);
  const host = element(document, 'div', 'product-command-host');
  host.append(button, dialog.element);
  return {
    element: host,
    dispose() {
      disposed = true;
      clearPending();
      document.removeEventListener('keydown', keydown);
      dialog.dispose();
    }
  };
}
