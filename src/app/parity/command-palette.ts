import { commandRegistry, type Command } from '../../runtime/CommandRegistry';
import { installAdoptedStyle } from '../../ui/adoptedStyles';
import { currentNavLocale } from '../navGuide';
import { activateModalSurface, deactivateModalSurface, trapModalFocus } from '../modalSurface';
import { $, append, button, clear, html, toast } from './shared';

interface PaletteCopy {
  title: string;
  subtitle: string;
  dialogLabel: string;
  close: string;
  inputLabel: string;
  placeholder: string;
  clear: string;
  listLabel: string;
  empty: string;
  results: (count: number) => string;
  hint: string;
  failed: string;
}

const PALETTE_TYPING_TARGET = 'input, textarea, select, [role="textbox"], [role="combobox"]';
const PALETTE_STYLE_ID = 'command-palette-hardening';

function commandPaletteHardeningCss(): string {
  return `
#rgv8Cmd{box-sizing:border-box;inset:auto;left:var(--ui-viewport-offset-left,0);top:var(--ui-viewport-offset-top,0);width:var(--ui-viewport-width,100vw);height:var(--ui-viewport-height,100dvh);place-items:start center;overflow:hidden;overscroll-behavior:contain;padding:max(clamp(20px,7vh,72px),env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
.rgv8-cmd-panel{width:min(760px,100%);max-height:min(calc(var(--ui-viewport-height,100dvh) - clamp(40px,14vh,144px)),620px);min-height:0;overflow:hidden;scrollbar-gutter:stable}
.rgv8-cmd-search{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;gap:6px;min-width:0}
#rgv8Cmd .rgv8-cmd-search input{min-width:0;height:48px;padding-inline:13px;font-size:14px}
.rgv8-cmd-clear{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border-radius:10px;font-size:18px;line-height:1;touch-action:manipulation}
.rgv8-cmd-clear[hidden]{display:none!important}
.rgv8-cmd-list{scrollbar-gutter:stable;scroll-padding-block:8px}
.rgv8-cmd-row{min-height:50px;content-visibility:auto;contain-intrinsic-size:50px}
.rgv8-cmd-copy strong,.rgv8-cmd-copy em{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.rgv8-cmd-copy strong{-webkit-line-clamp:2;line-clamp:2}
.rgv8-cmd-copy em{-webkit-line-clamp:2;line-clamp:2}
.rgv8-cmd-row small{overflow-wrap:anywhere}
.rgv8-cmd-empty{min-height:96px;display:grid;place-items:center}
@media(max-width:560px){
  #rgv8Cmd{place-items:start center;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}
  .rgv8-cmd-panel{width:100%;max-height:min(calc(var(--ui-viewport-height,100dvh) - 16px),calc(100dvh - 16px));padding:12px;border-radius:12px}
  #rgv8Cmd .rgv8-cmd-search input{font-size:16px}
  .rgv8-cmd-title small{max-width:min(240px,calc(100vw - 120px));overflow-wrap:anywhere}
  .rgv8-cmd-row{grid-template-columns:minmax(0,1fr);gap:5px;padding:10px;min-height:60px}
  .rgv8-cmd-row small{max-width:100%;white-space:normal}
}
@media(max-height:480px){
  #rgv8Cmd{padding-block:6px}
  .rgv8-cmd-panel{max-height:min(calc(var(--ui-viewport-height,100dvh) - 12px),calc(100dvh - 12px));gap:6px;padding:10px}
  .rgv8-cmd-title small,.rgv8-cmd-hint{display:none}
}
@media(prefers-reduced-motion:reduce){.rgv8-cmd-row{scroll-behavior:auto;transition:none}.rgv8-cmd-panel{animation:none}}
@media(forced-colors:active){
  #rgv8Cmd,.rgv8-cmd-panel,.rgv8-cmd-row,.rgv8-cmd-empty{forced-color-adjust:auto;background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}
  .rgv8-cmd-row.is-active{outline:3px solid Highlight;outline-offset:-4px}
}
`;
}

function isPaletteTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editableRoot = target.closest<HTMLElement>('[contenteditable]');
  if (editableRoot?.isContentEditable) return true;
  return Boolean(target.closest(PALETTE_TYPING_TARGET));
}

function hasOpenNativeDialog(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

const PALETTE_COPY: Record<'en' | 'ko', PaletteCopy> = {
  en: {
    title: 'Search',
    subtitle: 'Run commands, switch workspaces, export evidence',
    dialogLabel: 'Command palette',
    close: 'Close',
    inputLabel: 'Search command palette',
    placeholder: 'Search commands…',
    clear: 'Clear search',
    listLabel: 'Matching commands',
    empty: 'No matching commands',
    results: (count) => `${count} ${count === 1 ? 'command' : 'commands'}`,
    hint: '↑↓ selects · Enter runs · Esc closes',
    failed: 'The command could not be completed.'
  },
  ko: {
    title: '명령 검색',
    subtitle: '명령 실행 · 작업 공간 이동 · 연구 자료 내보내기',
    dialogLabel: '명령 검색창',
    close: '닫기',
    inputLabel: '명령 검색',
    placeholder: '명령을 검색하세요…',
    clear: '검색어 지우기',
    listLabel: '검색된 명령',
    empty: '일치하는 명령이 없습니다',
    results: (count) => `명령 ${count}개`,
    hint: '↑↓ 선택 · Enter 실행 · Esc 닫기',
    failed: '명령을 완료하지 못했습니다.'
  }
};

const COMMAND_SEARCH_ALIASES_KO: Record<string, string> = {
  simulation: '시뮬레이션 실행 시작 정지 일시정지 초기화 재설정',
  validation: '검증 검사 정확도 보고서',
  export: '내보내기 다운로드 저장 자료 증거',
  manifest: '매니페스트 재현성 목록',
  research: '연구 실험 매개변수 논문 그림 노트북 묶음',
  parity: '기능 무결성 아키텍처 감사 플로케 정준 품질',
  worker: '워커 성능 시험',
  index: '타입스크립트 제출 보고서'
};

const COMMAND_COPY_KO: Record<string, { label: string; description: string }> = {
  'simulation.toggle': { label: '시뮬레이션 시작·정지', description: '현재 시뮬레이션을 시작하거나 일시정지합니다.' },
  'simulation.reset': { label: '시뮬레이션 초기화', description: '진자 상태와 시간을 시작점으로 되돌립니다.' },
  'validation.run': { label: '검증 실행', description: '현재 정확도 검증 모음을 실행합니다.' },
  'export.manifest': { label: '매니페스트 내보내기', description: '현재 재현성 매니페스트를 저장합니다.' },
  'index.exportSubmissionManifest': {
    label: '제출 매니페스트 내보내기',
    description: '보안·제약 메타데이터가 포함된 제출 자료를 저장합니다.'
  },
  'index.validationReport': { label: 'TypeScript 검증 실행', description: '모듈식 검증 결과를 생성하고 저장합니다.' },
  'index.workerSmoke': { label: '워커 스모크 테스트', description: '모듈 워커와 메인 스레드 대체 경로를 시험합니다.' },
  'parity.openArchitecture': { label: '아키텍처 진단 열기', description: '앱 모듈 구조와 연결 상태를 엽니다.' },
  'parity.openResearch': { label: '연구 작업공간 열기', description: '재현 가능한 연구 작업공간으로 이동합니다.' },
  'parity.runCanonicalQa': { label: '정준 QA 실행', description: '정준 잔차와 에너지 드리프트를 검사합니다.' },
  'parity.runAudit': { label: 'A+ 감사 실행', description: '과학 기능과 증거 체인을 종합 감사합니다.' },
  'parity.runFloquetProbe': { label: 'Floquet 검사 실행', description: '주기 구동 진자의 궤도 안정성을 검사합니다.' },
  'parity.featureIntegrity': { label: '기능 무결성 보기', description: '복원된 기능의 매니페스트 대조 결과를 엽니다.' },
  'parity.exportManifest': { label: '기능 매니페스트 내보내기', description: '모듈식 기능 매니페스트를 저장합니다.' },
  'research.saveExperiment': {
    label: '연구 실험 저장',
    description: '현재 실행 상태를 재현 가능한 실험으로 저장합니다.'
  },
  'research.generateParameterStudy': {
    label: '매개변수 연구 생성',
    description: '현재 상태에서 재현 가능한 연구 계획을 만듭니다.'
  },
  'research.runStudyBatch': { label: '연구 배치 실행', description: '모든 연구 지점을 카오스 워커에서 계산합니다.' },
  'research.rebuildComparison': {
    label: '비교 행렬 다시 만들기',
    description: '저장된 실험과 실행 기록을 다시 비교합니다.'
  },
  'research.exportPaperPack': {
    label: '논문 자료 묶음 내보내기',
    description: '방법·실행 기록·연구 계획·비교표를 저장합니다.'
  },
  'research.exportFigures': {
    label: '그림 묶음 내보내기',
    description: '분석 캔버스를 캡션과 매니페스트가 있는 갤러리로 저장합니다.'
  },
  'research.exportCanvasSvg': {
    label: 'SVG 그림 묶음 내보내기',
    description: '분석 캔버스를 출처가 표시된 SVG ZIP으로 저장합니다.'
  },
  'research.exportFigureManifest': {
    label: '그림 매니페스트 내보내기',
    description: '그림 해시·크기·실행 맥락을 저장합니다.'
  },
  'research.exportLatex': {
    label: 'LaTeX 방법론 내보내기',
    description: '비교표와 연구 요약이 포함된 방법론 부록을 저장합니다.'
  },
  'research.exportNotebook': {
    label: '연구 노트북 내보내기',
    description: '자료 로더가 포함된 Jupyter 노트북을 저장합니다.'
  },
  'research.exportBundle': {
    label: '연구 번들 내보내기',
    description: '방법·노트북·데이터·그림을 휴대용 JSON으로 저장합니다.'
  }
};

let commandPaletteKeyboardInstalled = false;
let commandPaletteReturnFocus: HTMLElement | null = null;
let commandPaletteActiveIndex = 0;
let paletteRenderTimer = 0;

function paletteCopy(): PaletteCopy {
  return PALETTE_COPY[currentNavLocale()];
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

function commandSearchText(command: Command): string {
  const aliases = Object.entries(COMMAND_SEARCH_ALIASES_KO)
    .filter(([prefix]) => command.id.toLocaleLowerCase().includes(prefix))
    .map(([, words]) => words)
    .join(' ');
  const translated = COMMAND_COPY_KO[command.id];
  return normalizeSearch(
    `${command.id} ${command.label} ${command.description} ${translated?.label ?? ''} ${translated?.description ?? ''} ${command.keyboard ?? ''} ${aliases}`
  );
}

function commandCopy(command: Command): { label: string; description: string } {
  return currentNavLocale() === 'ko' ? (COMMAND_COPY_KO[command.id] ?? command) : command;
}

function commandScore(command: Command, query: string): number {
  if (!query) return 0;
  const id = normalizeSearch(command.id);
  const label = normalizeSearch(command.label);
  const haystack = commandSearchText(command);
  const terms = query.split(' ');
  if (!terms.every((term) => haystack.includes(term))) return Number.POSITIVE_INFINITY;
  let score = terms.reduce((total, term) => total + Math.max(0, haystack.indexOf(term)), 0);
  if (id === query) score -= 200;
  else if (id.startsWith(query)) score -= 120;
  if (label === query) score -= 180;
  else if (label.startsWith(query)) score -= 90;
  return score;
}

function matchingCommands(query: string): Command[] {
  const normalized = normalizeSearch(query.slice(0, 80));
  return commandRegistry
    .list()
    .map((command) => ({ command, score: commandScore(command, normalized) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        commandCopy(a.command).label.localeCompare(commandCopy(b.command).label, currentNavLocale())
    )
    .slice(0, 50)
    .map(({ command }) => command);
}

function scheduleCommandRender(query: string): void {
  window.clearTimeout(paletteRenderTimer);
  $('rgv8CmdList')?.setAttribute('aria-busy', 'true');
  paletteRenderTimer = window.setTimeout(() => renderCommandList(query), 50);
}

function flushScheduledCommandRender(input: HTMLInputElement): void {
  if ($('rgv8CmdList')?.getAttribute('aria-busy') !== 'true') return;
  window.clearTimeout(paletteRenderTimer);
  renderCommandList(input.value);
}

function modernRows(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('#rgv8CmdList [data-command-id]'));
}

function updateActiveSelection(index: number, scroll = false, wrap = true): void {
  const rows = modernRows();
  const input = $('rgv8CmdInput');
  if (!rows.length) {
    commandPaletteActiveIndex = 0;
    input?.removeAttribute('aria-activedescendant');
    return;
  }
  commandPaletteActiveIndex = wrap
    ? ((index % rows.length) + rows.length) % rows.length
    : Math.max(0, Math.min(index, rows.length - 1));
  rows.forEach((row, rowIndex) => {
    const active = rowIndex === commandPaletteActiveIndex;
    row.classList.toggle('is-active', active);
    row.setAttribute('aria-selected', String(active));
    if (active) input?.setAttribute('aria-activedescendant', row.id);
  });
  if (scroll) rows[commandPaletteActiveIndex]?.scrollIntoView({ block: 'nearest' });
}

function executeCommand(id: string): void {
  const returnFocus = commandPaletteReturnFocus?.closest('.rail-section')
    ? document.querySelector<HTMLElement>('.rail-palette-launcher')
    : commandPaletteReturnFocus;
  hideCommandPalette(false);
  void commandRegistry
    .run(id)
    .then(() => {
      // Commands that navigate or open a surface own focus themselves. Export
      // and toggle commands often do not, so return to the launcher instead of
      // leaving keyboard users on <body>.
      if (returnFocus?.isConnected && (document.activeElement === document.body || document.activeElement === null))
        queueMicrotask(() => returnFocus.focus());
    })
    .catch((error: unknown) => {
      console.error(`Command failed: ${id}`, error);
      toast(paletteCopy().failed, 3200);
      if (returnFocus?.isConnected) queueMicrotask(() => returnFocus.focus());
    });
}

function localizeCommandPalette(): void {
  const copy = paletteCopy();
  const palette = $('rgv8Cmd');
  palette?.setAttribute('aria-label', copy.dialogLabel);
  const title = $('rgv8CmdTitle');
  const subtitle = $('rgv8CmdSubtitle');
  const close = $('rgv8CmdClose');
  const input = $('rgv8CmdInput');
  const clearButton = $('rgv8CmdClear');
  const list = $('rgv8CmdList');
  const hint = $('rgv8CmdHint');
  if (title) title.textContent = copy.title;
  if (subtitle) subtitle.textContent = copy.subtitle;
  if (close) {
    close.textContent = copy.close;
    close.setAttribute('aria-label', copy.close);
  }
  if (input instanceof HTMLInputElement) {
    input.setAttribute('aria-label', copy.inputLabel);
    input.placeholder = copy.placeholder;
  }
  clearButton?.setAttribute('aria-label', copy.clear);
  clearButton?.setAttribute('title', copy.clear);
  list?.setAttribute('aria-label', copy.listLabel);
  if (hint) hint.textContent = copy.hint;
}

function trapPaletteFocus(event: KeyboardEvent): void {
  const palette = $('rgv8Cmd');
  if (!palette || palette.hasAttribute('hidden')) return;
  trapModalFocus(event, palette);
}

export function installCommandPalettes(): void {
  installAdoptedStyle(PALETTE_STYLE_ID, commandPaletteHardeningCss());
  if (!$('rgv8Cmd')) {
    const box = html('div', { id: 'rgv8Cmd', className: 'rgv8-cmd-shell', role: 'dialog' });
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('hidden', '');
    const panel = html('div', { className: 'rgv8-cmd-panel' });
    const header = html('div', { className: 'rgv8-cmd-head' });
    const title = html('div', { className: 'rgv8-cmd-title' });
    append(title, html('span', { id: 'rgv8CmdTitle' }), html('small', { id: 'rgv8CmdSubtitle' }));
    const close = button('rgv8CmdClose', '', () => hideCommandPalette(), 'rgv8-cmd-close');
    const input = html('input', { id: 'rgv8CmdInput' });
    input.maxLength = 80;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'rgv8CmdList');
    input.setAttribute('aria-describedby', 'rgv8CmdStatus rgv8CmdHint');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'go');
    input.setAttribute('inputmode', 'search');
    const search = html('div', { className: 'rgv8-cmd-search' });
    const clearButton = button(
      'rgv8CmdClear',
      '×',
      () => {
        input.value = '';
        clearButton.setAttribute('hidden', '');
        commandPaletteActiveIndex = 0;
        renderCommandList('');
        input.focus();
      },
      'rgv8-cmd-clear'
    );
    clearButton.setAttribute('hidden', '');
    const status = html('div', { id: 'rgv8CmdStatus', className: 'rgv8-cmd-status', role: 'status' });
    status.setAttribute('aria-live', 'polite');
    const list = html('div', { id: 'rgv8CmdList', className: 'rgv8-cmd-list', role: 'listbox' });
    const hint = html('div', { id: 'rgv8CmdHint', className: 'rgv8-cmd-hint' });
    input.addEventListener('input', (event) => {
      commandPaletteActiveIndex = 0;
      clearButton.toggleAttribute('hidden', input.value.length === 0);
      if (event instanceof InputEvent && event.isComposing) return;
      scheduleCommandRender(input.value);
    });
    input.addEventListener('compositionend', () => {
      commandPaletteActiveIndex = 0;
      scheduleCommandRender(input.value);
    });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hideCommandPalette();
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter'].includes(event.key)) {
        flushScheduledCommandRender(input);
      }
      const rows = modernRows();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        updateActiveSelection(commandPaletteActiveIndex + (event.key === 'ArrowDown' ? 1 : -1), true);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        updateActiveSelection(event.key === 'Home' ? 0 : rows.length - 1, true, false);
      } else if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        updateActiveSelection(commandPaletteActiveIndex + (event.key === 'PageDown' ? 8 : -8), true, false);
      } else if (event.key === 'Enter') {
        const active = rows[commandPaletteActiveIndex];
        if (!active) return;
        event.preventDefault();
        active.click();
      }
    });
    box.addEventListener('keydown', trapPaletteFocus);
    box.addEventListener('click', (event) => {
      if (event.target === box) hideCommandPalette();
    });
    append(search, input, clearButton);
    append(header, title, close);
    append(panel, header, search, status, list, hint);
    box.append(panel);
    document.body.append(box);
  }
  if (!$('cmdPalette')) {
    const legacy = html('div', { id: 'cmdPalette', className: 'v10-sr' });
    legacy.setAttribute('hidden', '');
    legacy.setAttribute('aria-hidden', 'true');
    legacy.inert = true;
    const legacyInput = html('input', { id: 'cmdInput' });
    legacyInput.tabIndex = -1;
    legacy.append(legacyInput);
    document.body.append(legacy);
  }
  if (!commandPaletteKeyboardInstalled) {
    commandPaletteKeyboardInstalled = true;
    // Claim Ctrl/Cmd+K during capture so shell/button handlers cannot consume
    // the global shortcut before the palette sees it. Typing controls remain
    // protected, except for the palette's own combobox where the key toggles it.
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.isComposing) return;
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
        if (isPaletteTypingTarget(event.target) && event.target !== $('rgv8CmdInput')) return;
        const open = !$('rgv8Cmd')?.hasAttribute('hidden');
        if (!open && hasOpenNativeDialog()) return;
        event.preventDefault();
        if (open) hideCommandPalette();
        else showCommandPalette();
      },
      { capture: true }
    );
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape' && !$('rgv8Cmd')?.hasAttribute('hidden')) {
        hideCommandPalette();
      }
    });
  }
}

export function renderCommandList(query: string): void {
  window.clearTimeout(paletteRenderTimer);
  const commands = matchingCommands(query);
  const copy = paletteCopy();
  const list = $('rgv8CmdList');
  clear(list);
  list?.removeAttribute('aria-busy');
  if (!commands.length) {
    const empty = html('div', { className: 'rgv8-cmd-empty', text: copy.empty, role: 'status' });
    list?.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    commands.forEach((command, index) => {
      const localized = commandCopy(command);
      const item = html('button', { className: 'rgv8-cmd-row', type: 'button', role: 'option' });
      item.id = `rgv8CmdOption-${index}`;
      item.dataset.commandId = command.id;
      item.tabIndex = -1;
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('aria-label', `${localized.label}. ${localized.description}`);
      const itemCopy = html('span', { className: 'rgv8-cmd-copy' });
      append(itemCopy, html('strong', { text: localized.label }), html('em', { text: localized.description }));
      append(item, itemCopy, html('small', { text: command.keyboard ?? command.id }));
      item.addEventListener('pointermove', () => updateActiveSelection(index));
      item.addEventListener('click', () => executeCommand(command.id));
      fragment.append(item);
    });
    list?.append(fragment);
  }
  const status = $('rgv8CmdStatus');
  if (status) status.textContent = copy.results(commands.length);
  updateActiveSelection(commandPaletteActiveIndex);
}

export function showCommandPalette(): void {
  const palette = $('rgv8Cmd');
  if (!palette || hasOpenNativeDialog()) return;
  const active = document.activeElement;
  if (palette.hasAttribute('hidden')) {
    commandPaletteReturnFocus = active instanceof HTMLElement && !active.closest('#rgv8Cmd') ? active : null;
  }
  document.querySelectorAll<HTMLElement>('.rail-section.open[data-rail-section]').forEach((section) => {
    section.classList.remove('open');
    section.querySelector<HTMLElement>('.rail-menu-button')?.setAttribute('aria-expanded', 'false');
  });
  localizeCommandPalette();
  commandPaletteActiveIndex = 0;
  renderCommandList('');
  palette.classList.add('show');
  palette.removeAttribute('hidden');
  palette.removeAttribute('aria-hidden');
  activateModalSurface(palette);
  document.body.classList.add('command-palette-open');
  const input = $('rgv8CmdInput');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.setAttribute('aria-expanded', 'true');
    $('rgv8CmdClear')?.setAttribute('hidden', '');
    input.focus();
    input.select();
  }
}

export function hideCommandPalette(restoreFocus = true): void {
  window.clearTimeout(paletteRenderTimer);
  const palette = $('rgv8Cmd');
  const wasOpen = Boolean(palette && !palette.hasAttribute('hidden'));
  palette?.classList.remove('show');
  palette?.setAttribute('hidden', '');
  palette?.setAttribute('aria-hidden', 'true');
  if (palette) deactivateModalSurface(palette);
  document.body.classList.remove('command-palette-open');
  const input = $('rgv8CmdInput');
  input?.removeAttribute('aria-activedescendant');
  input?.setAttribute('aria-expanded', 'false');
  $('rgv8CmdList')?.removeAttribute('aria-busy');
  const returnFocus = commandPaletteReturnFocus;
  commandPaletteReturnFocus = null;
  if (wasOpen && restoreFocus && returnFocus?.isConnected) queueMicrotask(() => returnFocus.focus());
  else if (
    wasOpen &&
    !restoreFocus &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement.closest('#rgv8Cmd')
  ) {
    document.activeElement.blur();
  }
}
