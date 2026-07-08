import { commandRegistry } from '../../runtime/CommandRegistry';
import { $, append, button, clear, html } from './shared';

let commandPaletteKeyboardInstalled = false;
let commandPaletteReturnFocus: HTMLElement | null = null;

export function installCommandPalettes(): void {
  if (!$('rgv7Palette')) {
    const palette = html('div', { id: 'rgv7Palette', className: 'rgv7-palette v10-sr', role: 'dialog', ariaLabel: 'Legacy command palette anchor' });
    const box = html('div', { className: 'rgv7-palette-box' });
    const input = html('input', { id: 'rgv7CmdInput', ariaLabel: 'Search commands' });
    const list = html('div', { id: 'rgv7CmdList', className: 'rgv7-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    append(box, input, list);
    palette.append(box);
    palette.addEventListener('click', (event) => {
      if (event.target === palette) palette.classList.remove('show');
    });
    document.body.append(palette);
  }
  if (!$('rgv8Cmd')) {
    const box = html('div', { id: 'rgv8Cmd', className: 'rgv8-cmd-shell', role: 'dialog', ariaLabel: 'Command palette' });
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('hidden', '');
    const panel = html('div', { className: 'rgv8-cmd-panel' });
    const header = html('div', { className: 'rgv8-cmd-head' });
    const title = html('div', { className: 'rgv8-cmd-title' });
    append(title, html('span', { text: 'Search' }), html('small', { text: 'Run commands, switch workspaces, export evidence' }));
    const close = button('rgv8CmdClose', 'Close', () => hideCommandPalette(), 'rgv8-cmd-close');
    const input = html('input', { id: 'rgv8CmdInput', ariaLabel: 'Search command palette' });
    input.setAttribute('placeholder', 'Search commands...');
    const list = html('div', { id: 'rgv8CmdList', className: 'rgv8-cmd-list' });
    input.addEventListener('input', () => renderCommandList(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hideCommandPalette();
        return;
      }
      if (event.key !== 'Enter') return;
      const first = list.querySelector<HTMLButtonElement>('[data-command-id]');
      if (!first) return;
      event.preventDefault();
      first.click();
    });
    box.addEventListener('click', (event) => {
      if (event.target === box) hideCommandPalette();
    });
    append(header, title, close);
    append(panel, header, input, list, html('div', { className: 'rgv8-cmd-hint', text: 'Enter runs the first result. Esc or outside click closes.' }));
    box.append(panel);
    document.body.append(box);
  }
  if (!$('cmdPalette')) {
    const legacy = html('div', { id: 'cmdPalette', className: 'v10-sr', role: 'dialog', ariaLabel: 'legacy command palette anchor' });
    legacy.append(html('input', { id: 'cmdInput', ariaLabel: 'legacy command input' }));
    document.body.append(legacy);
  }
  if (!commandPaletteKeyboardInstalled) {
    commandPaletteKeyboardInstalled = true;
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        showCommandPalette();
      }
      if (event.key === 'Escape') hideCommandPalette();
    });
  }
}

export function renderCommandList(query: string): void {
  const q = query.toLowerCase();
  const commands = commandRegistry.list().filter((cmd) => `${cmd.id} ${cmd.label} ${cmd.description}`.toLowerCase().includes(q));
  for (const id of ['rgv7CmdList', 'rgv8CmdList']) {
    const list = $(id);
    clear(list);
    if (!commands.length) {
      list?.append(html('div', { className: id === 'rgv7CmdList' ? 'rgv7-cmd-empty' : 'rgv8-cmd-empty', text: 'No matching commands' }));
      continue;
    }
    commands.forEach((cmd) => {
      const item = html('button', { className: id === 'rgv7CmdList' ? 'rgv7-cmd' : 'rgv8-cmd-row', type: 'button' });
      item.dataset.commandId = cmd.id;
      append(item, html('span', { text: cmd.label }), html('small', { text: cmd.id }));
      item.addEventListener('click', () => {
        hideCommandPalette(false);
        void commandRegistry.run(cmd.id);
      });
      list?.append(item);
    });
  }
}

export function showCommandPalette(): void {
  const active = document.activeElement;
  commandPaletteReturnFocus = active instanceof HTMLElement && !active.closest('#rgv8Cmd') ? active : null;
  document.querySelectorAll<HTMLElement>('.rail-section.open[data-rail-section]').forEach((section) => {
    section.classList.remove('open');
    section.querySelector<HTMLElement>('.rail-menu-button')?.setAttribute('aria-expanded', 'false');
  });
  renderCommandList('');
  $('rgv7Palette')?.classList.remove('show');
  const palette = $('rgv8Cmd');
  palette?.classList.add('show');
  palette?.removeAttribute('hidden');
  const input = $('rgv8CmdInput');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.focus();
    input.select();
  }
}

export function hideCommandPalette(restoreFocus = true): void {
  $('rgv7Palette')?.classList.remove('show');
  const palette = $('rgv8Cmd');
  palette?.classList.remove('show');
  palette?.setAttribute('hidden', '');
  if (restoreFocus && commandPaletteReturnFocus?.isConnected) commandPaletteReturnFocus.focus();
  else if (!restoreFocus && document.activeElement instanceof HTMLElement && document.activeElement.closest('#rgv8Cmd')) {
    document.activeElement.blur();
  }
  commandPaletteReturnFocus = null;
}
