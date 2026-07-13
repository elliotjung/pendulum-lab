import { installAdoptedStyle } from '../ui/adoptedStyles';
import { currentNavLocale } from './navGuide';

export interface ShortcutDefinition {
  keys: string;
  en: string;
  ko: string;
}

export const APP_SHORTCUTS: readonly ShortcutDefinition[] = [
  { keys: 'Space', en: 'Pause or resume the simulation', ko: '시뮬레이션 일시정지 또는 재개' },
  { keys: 'R', en: 'Reset with the current setup', ko: '현재 설정으로 다시 시작' },
  { keys: 'C', en: 'Clear the trajectory trail', ko: '궤적 흔적 지우기' },
  { keys: 'P', en: 'Clear the Poincaré section', ko: '푸앵카레 단면 지우기' },
  { keys: '1–9, 0', en: 'Open a primary workspace', ko: '주요 작업 공간 열기' },
  { keys: '\\', en: 'Show or hide the control panel', ko: '제어 패널 표시 또는 숨기기' },
  { keys: 'Ctrl/⌘ K', en: 'Open the command palette', ko: '명령 팔레트 열기' },
  { keys: '?', en: 'Open this shortcut guide', ko: '이 단축키 안내 열기' },
  { keys: 'Esc', en: 'Close the active dialog or menu', ko: '열린 대화상자 또는 메뉴 닫기' }
];

const STYLE_ID = 'shortcut-help-style';
const DIALOG_ID = 'shortcutHelpDialog';
let returnFocus: HTMLElement | null = null;

function css(): string {
  return `
#${DIALOG_ID}{width:min(560px,calc(100vw - 28px));max-height:min(680px,calc(100vh - 28px));padding:0;border:1px solid var(--border-strong);border-radius:16px;color:var(--fg);background:var(--panel-solid);box-shadow:var(--shadow-lg)}
#${DIALOG_ID}::backdrop{background:rgba(2,4,10,.76);backdrop-filter:blur(5px)}
.shortcut-help-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:20px 20px 14px;border-bottom:1px solid var(--divider)}
.shortcut-help-head h2{font:750 18px/1.25 var(--font-display);color:var(--fg-bright)}
.shortcut-help-head p{margin-top:5px;color:var(--muted);font-size:11.5px;line-height:1.5}
.shortcut-help-close{min-width:34px;min-height:34px;padding:0;border-radius:8px}
.shortcut-help-list{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:0;padding:8px 20px 18px}
.shortcut-help-list dt,.shortcut-help-list dd{padding:10px 4px;border-bottom:1px solid var(--divider)}
.shortcut-help-list dt{padding-right:20px}.shortcut-help-list dd{color:var(--text);line-height:1.45}
.shortcut-help-list kbd{display:inline-block;min-width:36px;padding:4px 7px;border:1px solid var(--border-strong);border-radius:6px;background:var(--panel-elevated);color:var(--fg-bright);font:650 11px/1 var(--font-mono);text-align:center;box-shadow:inset 0 -1px rgba(0,0,0,.25)}
@media(max-width:480px){.shortcut-help-list{grid-template-columns:1fr;padding-inline:16px}.shortcut-help-list dt{padding-bottom:3px;border-bottom:0}.shortcut-help-list dd{padding-top:3px}.shortcut-help-head{padding-inline:16px}}
`;
}

function inputTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.isContentEditable || element?.closest('input,select,textarea,[contenteditable="true"]'));
}

function buildDialog(): HTMLDialogElement {
  const korean = currentNavLocale() === 'ko';
  const dialog = document.createElement('dialog');
  dialog.id = DIALOG_ID;
  dialog.dataset.locale = currentNavLocale();
  dialog.dataset.testid = 'shortcut-help-dialog';
  dialog.setAttribute('aria-labelledby', 'shortcutHelpTitle');
  const head = document.createElement('div');
  head.className = 'shortcut-help-head';
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.id = 'shortcutHelpTitle';
  title.textContent = korean ? '키보드 단축키' : 'Keyboard shortcuts';
  const intro = document.createElement('p');
  intro.textContent = korean
    ? '입력 칸 밖에서 누르면 바로 실행됩니다.'
    : 'Use these keys anywhere outside a text or numeric input.';
  copy.append(title, intro);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'shortcut-help-close';
  close.dataset.testid = 'shortcut-help-close';
  close.setAttribute('aria-label', korean ? '단축키 안내 닫기' : 'Close shortcut guide');
  close.textContent = '×';
  close.addEventListener('click', () => dialog.close());
  head.append(copy, close);
  const list = document.createElement('dl');
  list.className = 'shortcut-help-list';
  for (const shortcut of APP_SHORTCUTS) {
    const term = document.createElement('dt');
    const key = document.createElement('kbd');
    key.textContent = shortcut.keys;
    term.append(key);
    const description = document.createElement('dd');
    description.textContent = korean ? shortcut.ko : shortcut.en;
    list.append(term, description);
  }
  dialog.append(head, list);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener('close', () => {
    returnFocus?.focus();
    returnFocus = null;
  });
  document.body.append(dialog);
  return dialog;
}

export function installShortcutHelp(): void {
  if (typeof document === 'undefined') return;
  installAdoptedStyle(STYLE_ID, css());
  document.addEventListener('keydown', (event) => {
    if (event.key !== '?' || inputTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    let dialog = document.getElementById(DIALOG_ID) as HTMLDialogElement | null;
    if (dialog && !dialog.open && dialog.dataset.locale !== currentNavLocale()) {
      dialog.remove();
      dialog = null;
    }
    dialog ??= buildDialog();
    if (!dialog.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    dialog.querySelector<HTMLButtonElement>('.shortcut-help-close')?.focus();
  });
}
