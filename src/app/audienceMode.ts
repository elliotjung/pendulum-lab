/**
 * Audience modes gate the visible UI complexity without disabling the engine.
 *
 * Beginner keeps the lab focused on motion: presets, the main canvas, playback,
 * and the safest physical controls. Student adds analysis and validation.
 * Research exposes the full governance, export, and diagnostic surface.
 */

import { installAdoptedStyle } from '../ui/adoptedStyles';
import {
  NAV_ACTION_LABEL_KO,
  NAV_TAB_LABEL_KO,
  actionGuideText,
  currentNavLocale,
  navTipText,
  tabGuideText
} from './navGuide';
import { AUDIENCE_MODE_CHANGED_EVENT, normalizeAudienceMode, type AudienceMode } from './audienceModePolicy';
import { audienceModeCss } from './audienceModeStyles';

export {
  AUDIENCE_MODE_CHANGED_EVENT,
  normalizeAudienceMode,
  visibleRailSections,
  type AudienceMode
} from './audienceModePolicy';

export const AUDIENCE_MODES: Record<
  AudienceMode,
  { label: string; description: string; summary: string; icon: IconName }
> = {
  beginner: {
    label: 'Beginner',
    description: 'Simulator-first view with presets and core physical controls only.',
    summary: 'Explore motion without paper, audit, or advanced numeric surfaces.',
    icon: 'spark'
  },
  student: {
    label: 'Student',
    description: 'Adds analysis plots, validation, exports, and method controls.',
    summary: 'Study plots, compare behavior, and check numerical accuracy.',
    icon: 'chart'
  },
  research: {
    label: 'Research',
    description: 'Full diagnostics, Trust Inspector evidence, reviewer kit, governance, and audit tools.',
    summary: 'Run diagnostics with provenance, caveats, artifacts, and reviewer commands visible.',
    icon: 'lab'
  }
};

const AUDIENCE_MODES_KO: Record<AudienceMode, { label: string; description: string; summary: string }> = {
  beginner: {
    label: '초보',
    description: '프리셋과 핵심 물리 조절기에 집중한 시뮬레이터 화면입니다.',
    summary: '논문·감사·고급 수치 도구 없이 진자의 움직임부터 탐색합니다.'
  },
  student: {
    label: '학생',
    description: '분석 그래프, 검증, 내보내기, 수치해석 방법 조절기를 추가합니다.',
    summary: '그래프를 읽고 거동을 비교하며 수치 정확도를 확인합니다.'
  },
  research: {
    label: '연구',
    description: '전체 진단, Trust Inspector 근거, 리뷰어 키트, 거버넌스, 감사 도구를 엽니다.',
    summary: '출처·주의점·산출물·재현 명령을 보며 연구 진단을 실행합니다.'
  }
};

const STORAGE_KEY = 'pendulum-lab/ui/audience-mode';
const STYLE_ID = 'audience-mode-style';
const CHOOSER_ID = 'audienceModeChooser';
const SVG_NS = 'http://www.w3.org/2000/svg';
let audienceChooserReturnFocus: HTMLElement | null = null;
let activeAudienceMode: AudienceMode | null = null;

type IconName =
  | 'spark'
  | 'chart'
  | 'lab'
  | 'explore'
  | 'analyze'
  | 'chaos'
  | 'validate'
  | 'export'
  | 'play'
  | 'compare'
  | 'spectrum'
  | 'grid'
  | 'branch'
  | 'cube'
  | 'density'
  | 'binary'
  | 'vectors'
  | 'basin'
  | 'recurrence'
  | 'field'
  | 'manifest'
  | 'shield'
  | 'command'
  | 'report'
  | 'orbit';

/** Tabs whose panels a non-research mode must not leave active (fallback to lab). */
const RESEARCH_ONLY_TABS = [
  'matrix',
  'zeroone',
  'clv',
  'basin',
  'rqa',
  'ftle',
  'architecture',
  'research',
  'lab3d',
  'canonical',
  'aplus',
  'docs'
];
const STUDENT_HIDDEN_TABS = RESEARCH_ONLY_TABS;
const BEGINNER_HIDDEN_TABS = [
  ...RESEARCH_ONLY_TABS,
  'lyap',
  'sweep',
  'bifurc',
  'phase3d',
  'density',
  'expansion',
  'validate',
  'golden',
  'compare'
];

const LAB_STUDENT_ROW_IDS = ['seed', 'th3', 'iw1', 'iw2', 'iw3', 'm3', 'l3', 'gamma'];
const LAB_STUDENT_DETAIL_ANCHORS = ['trailMode', 'method', 'ensN', 'dlTrajBtn', 'stats'];
const LAB_RESEARCH_DETAIL_ANCHORS = ['audioOn'];

const SECTION_PRESENTATION: Record<
  string,
  { label: string; labelKo: string; icon: IconName; hint: string; hintKo: string }
> = {
  sim: {
    label: 'Explore',
    labelKo: '탐색',
    icon: 'explore',
    hint: 'Run the pendulum, try presets, and compare the core motion.',
    hintKo: '진자를 돌리고, 프리셋을 써 보고, 기본 운동을 비교하세요.'
  },
  analysis: {
    label: 'Analyze',
    labelKo: '분석',
    icon: 'analyze',
    hint: 'Read energy, spectra, maps, and phase-space behavior.',
    hintKo: '에너지·스펙트럼·지도·위상공간 거동을 읽어 보세요.'
  },
  chaos: {
    label: 'Chaos',
    labelKo: '카오스',
    icon: 'chaos',
    hint: 'Use advanced chaos diagnostics for research-mode studies.',
    hintKo: '연구 모드용 고급 카오스 진단 도구를 사용하세요.'
  },
  check: {
    label: 'Validate',
    labelKo: '검증',
    icon: 'validate',
    hint: 'Check accuracy, validation status, and numerical health.',
    hintKo: '정확도·검증 상태·수치적 건전성을 확인하세요.'
  },
  govern: {
    label: 'Export',
    labelKo: '내보내기',
    icon: 'export',
    hint: 'Save figures, manifests, reports, notebooks, and research bundles.',
    hintKo: '그림·매니페스트·리포트·노트북·연구 번들을 저장하세요.'
  }
};

const TAB_ICONS: Record<string, IconName> = {
  lab: 'play',
  compare: 'compare',
  lyap: 'spectrum',
  sweep: 'grid',
  bifurc: 'branch',
  phase3d: 'cube',
  density: 'density',
  expansion: 'grid',
  matrix: 'grid',
  validate: 'validate',
  golden: 'shield',
  zeroone: 'binary',
  clv: 'vectors',
  basin: 'basin',
  rqa: 'recurrence',
  ftle: 'field',
  architecture: 'shield',
  research: 'lab',
  lab3d: 'cube',
  canonical: 'orbit',
  aplus: 'validate',
  docs: 'report'
};

const ACTION_ICONS: Record<string, IconName> = {
  floquet: 'orbit',
  manifest: 'manifest',
  integrity: 'shield',
  palette: 'command',
  report: 'report'
};

function createIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('rail-icon-svg');
  const add = (tag: string, attrs: Record<string, string>): void => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  };
  const line = (x1: number, y1: number, x2: number, y2: number): void => add('path', { d: `M${x1} ${y1}L${x2} ${y2}` });
  switch (name) {
    case 'spark':
      add('path', { d: 'M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z' });
      line(5, 18, 5, 21);
      line(3.5, 19.5, 6.5, 19.5);
      line(19, 4, 19, 7);
      line(17.5, 5.5, 20.5, 5.5);
      break;
    case 'chart':
    case 'analyze':
      line(4, 19, 20, 19);
      line(6, 16, 6, 11);
      line(11, 16, 11, 7);
      line(16, 16, 16, 9);
      add('path', { d: 'M5 10l4 3 4-6 5 4' });
      break;
    case 'lab':
      add('path', { d: 'M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 17l-5-9V3' });
      add('path', { d: 'M8 15h8' });
      break;
    case 'explore':
      add('circle', { cx: '12', cy: '12', r: '8' });
      add('path', { d: 'M10 14l2-6 2 6-2 2-2-2z' });
      break;
    case 'chaos':
      add('path', { d: 'M6 12c0-4 6-5 8-2 2 3-2 7-5 4-2-2 0-5 3-5 4 0 7 4 5 8' });
      break;
    case 'validate':
      add('circle', { cx: '12', cy: '12', r: '8' });
      add('path', { d: 'M8 12.5l2.5 2.5L16 9' });
      break;
    case 'export':
      add('path', { d: 'M12 4v10M8 10l4 4 4-4M5 18h14' });
      break;
    case 'play':
      add('circle', { cx: '12', cy: '12', r: '8' });
      add('path', { d: 'M10 8l6 4-6 4V8z' });
      break;
    case 'compare':
      add('path', { d: 'M5 5h6v14H5zM13 5h6v14h-6z' });
      break;
    case 'spectrum':
      add('path', { d: 'M4 15c2-8 4-8 6 0s4 8 6 0 3-6 4-4' });
      break;
    case 'grid':
      for (const x of [6, 12, 18]) line(x, 5, x, 19);
      for (const y of [6, 12, 18]) line(5, y, 19, y);
      break;
    case 'branch':
      add('path', { d: 'M6 18V6m0 6h5c4 0 4-5 7-5M11 12c4 0 4 5 7 5' });
      break;
    case 'cube':
      add('path', { d: 'M12 3l7 4v10l-7 4-7-4V7l7-4zM5 7l7 4 7-4M12 11v10' });
      break;
    case 'density':
      for (const [cx, cy, r] of [
        [7, 8, 1.3],
        [13, 6, 1],
        [17, 11, 1.5],
        [9, 15, 1.2],
        [15, 17, 1]
      ])
        add('circle', { cx: String(cx), cy: String(cy), r: String(r) });
      break;
    case 'binary':
      add('path', { d: 'M7 7h2v10H7zM15 7a2 2 0 0 1 2 2v6a2 2 0 0 1-4 0V9a2 2 0 0 1 2-2z' });
      break;
    case 'vectors':
      add('path', { d: 'M5 18l6-12 3 7 5-4M11 6l1 4 3-2' });
      break;
    case 'basin':
      add('path', { d: 'M5 17c3-6 5-8 8-5s4 2 6-3M5 8c4 2 8 1 14 7' });
      break;
    case 'recurrence':
      add('path', { d: 'M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z' });
      break;
    case 'field':
      add('path', { d: 'M4 16c4-6 8-6 16-2M4 10c5-4 10-4 16 0M4 20c5-2 10-2 16 0' });
      break;
    case 'manifest':
    case 'report':
      add('path', { d: 'M7 3h7l3 3v15H7V3zM14 3v4h4M9 11h6M9 15h6M9 19h4' });
      break;
    case 'shield':
      add('path', { d: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z' });
      add('path', { d: 'M9 12l2 2 4-5' });
      break;
    case 'command':
      add('path', { d: 'M8 8h8M8 12h5M8 16h8' });
      add('circle', { cx: '5', cy: '8', r: '1' });
      add('circle', { cx: '5', cy: '12', r: '1' });
      add('circle', { cx: '5', cy: '16', r: '1' });
      break;
    case 'orbit':
      add('circle', { cx: '12', cy: '12', r: '2' });
      add('path', { d: 'M4 12c3-7 13-7 16 0-3 7-13 7-16 0zM12 4c7 3 7 13 0 16-7-3-7-13 0-16z' });
      break;
    default:
      add('circle', { cx: '12', cy: '12', r: '8' });
  }
  return svg;
}

function setIcon(container: Element | null, icon: IconName): void {
  if (!container) return;
  container.replaceChildren(createIcon(icon));
}

function setLabel(container: Element | null, text: string): void {
  if (container) container.textContent = text;
}

/**
 * Add the plain-language guide to a menu entry: a `.tab-desc` second line in
 * the submenu plus a "Full name — what it does" tooltip/accessible name.
 * Idempotent — decorateNavigation reruns on every mode change, so the original
 * full name is stashed in data-nav-name the first time through.
 */
function describeMenuEntry(button: HTMLElement, description: string | undefined): void {
  if (!description) return;
  const base = button.dataset.navName ?? (button.title || button.querySelector('.tab-label')?.textContent || '');
  button.dataset.navName = base;
  // The tooltip anchors the canonical full tool name in every locale — the
  // Korean short label already localizes the visible menu row, so only the
  // description switches language here. Pinned by the guided-ui and
  // audience-mode e2e suites ("Simulation Lab — 실시간 …").
  const tip = navTipText(base, description);
  button.title = tip;
  button.setAttribute('aria-label', tip);
  let desc = button.querySelector('.tab-desc');
  if (!desc) {
    desc = document.createElement('span');
    desc.className = 'tab-desc';
    desc.setAttribute('aria-hidden', 'true');
    button.append(desc);
  }
  // Always rewrite: decorateNavigation reruns when the locale changes.
  desc.textContent = description;
}

function decorateNavigation(): void {
  const korean = currentNavLocale() === 'ko';
  for (const [sectionName, config] of Object.entries(SECTION_PRESENTATION)) {
    const section = document.querySelector<HTMLElement>(`.rail-section[data-rail-section="${sectionName}"]`);
    if (!section) continue;
    const hintText = korean ? config.hintKo : config.hint;
    const button = section.querySelector<HTMLElement>('.rail-menu-button');
    const submenu = section.querySelector<HTMLElement>('.rail-submenu');
    setIcon(button?.querySelector('.rail-menu-icon') ?? null, config.icon);
    const sectionLabel = korean ? config.labelKo : config.label;
    setLabel(button?.querySelector('.rail-menu-label') ?? null, sectionLabel);
    button?.setAttribute('aria-label', `${sectionLabel}: ${hintText}`);
    button?.setAttribute('title', hintText);
    if (button) button.dataset.testid = `nav-section-${sectionName}`;
    if (submenu) {
      let hint = submenu.querySelector('.rail-submenu-hint');
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'rail-submenu-hint';
        submenu.prepend(hint);
      }
      hint.textContent = hintText;
    }
  }

  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    const tabName = tab.dataset.tab;
    const icon = tabName ? TAB_ICONS[tabName] : undefined;
    if (icon) setIcon(tab.querySelector('.tab-icon'), icon);
    const label = tab.querySelector<HTMLElement>('.tab-label');
    if (label) {
      label.dataset.navLabel ??= label.textContent ?? '';
      label.textContent =
        korean && tabName ? (NAV_TAB_LABEL_KO[tabName] ?? label.dataset.navLabel) : label.dataset.navLabel;
    }
    if (tabName) tab.dataset.testid = `nav-tab-${tabName}`;
    describeMenuEntry(tab, tabName ? tabGuideText(tabName) : undefined);
  });
  document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((button) => {
    const action = button.dataset.railAction;
    const icon = action ? ACTION_ICONS[action] : undefined;
    if (icon) setIcon(button.querySelector('.tab-icon'), icon);
    const label = button.querySelector<HTMLElement>('.tab-label');
    if (label) {
      label.dataset.navLabel ??= label.textContent ?? '';
      label.textContent =
        korean && action ? (NAV_ACTION_LABEL_KO[action] ?? label.dataset.navLabel) : label.dataset.navLabel;
    }
    if (action) {
      button.dataset.testid =
        action === 'palette' && button.classList.contains('rail-palette-launcher')
          ? 'nav-action-palette-launcher'
          : `nav-action-${action}`;
    }
    describeMenuEntry(button, action ? actionGuideText(action) : undefined);
  });
}

function storedAudienceMode(): AudienceMode | null {
  try {
    const value = window.localStorage?.getItem(STORAGE_KEY);
    if (value === null) return null;
    if (value === 'beginner' || value === 'student' || value === 'research') return value;
    window.localStorage?.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function urlAudienceMode(): AudienceMode | null {
  try {
    const params = new URL(window.location.href).searchParams;
    const value = params.get('audience') ?? params.get('mode');
    return value === 'beginner' || value === 'student' || value === 'research' ? value : null;
  } catch {
    return null;
  }
}

function hideAudienceChooser(): void {
  const chooser = document.getElementById(CHOOSER_ID);
  if (!chooser || chooser.hasAttribute('hidden')) return;
  chooser.setAttribute('hidden', '');
  document.body.classList.remove('audience-chooser-open');
  const returnFocus = audienceChooserReturnFocus;
  audienceChooserReturnFocus = null;
  if (returnFocus?.isConnected) queueMicrotask(() => returnFocus.focus());
}

/** Badge the choice matching the active mode so returning users see it. */
function markCurrentChoice(root: ParentNode = document): void {
  const current = currentAudienceMode();
  const currentLabel = currentNavLocale() === 'ko' ? '현재' : 'ACTIVE';
  root.querySelectorAll<HTMLElement>('[data-audience-choice]').forEach((button) => {
    const selected = button.dataset.audienceChoice === current;
    button.classList.toggle('audience-choice-current', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.dataset.currentLabel = selected ? currentLabel : '';
  });
}

function localizeAudienceChooser(overlay: HTMLElement): void {
  const korean = currentNavLocale() === 'ko';
  const title = overlay.querySelector<HTMLElement>('[data-audience-chooser-title]');
  const copy = overlay.querySelector<HTMLElement>('[data-audience-chooser-copy]');
  const close = overlay.querySelector<HTMLButtonElement>('.audience-chooser-close');
  if (title) title.textContent = korean ? '작업공간 선택' : 'Choose your workspace';
  if (copy) {
    copy.textContent = korean
      ? '지금 하려는 일에 맞는 수준을 선택하세요. 왼쪽 메뉴의 모드 선택기에서 언제든 바꿀 수 있습니다.'
      : 'Pick the level that matches what you want to do now. You can change this anytime from the Mode selector in the sidebar.';
  }
  overlay.removeAttribute('aria-label');
  close?.setAttribute('aria-label', korean ? '현재 모드를 유지하고 닫기' : 'Keep current mode and close');
  overlay.querySelectorAll<HTMLButtonElement>('[data-audience-choice]').forEach((button) => {
    const mode = normalizeAudienceMode(button.dataset.audienceChoice);
    const meta = korean ? AUDIENCE_MODES_KO[mode] : AUDIENCE_MODES[mode];
    button.setAttribute('aria-label', korean ? `${meta.label} 모드 사용` : `Use ${meta.label} mode`);
    const label = button.querySelector<HTMLElement>('[data-audience-choice-label]');
    const summary = button.querySelector<HTMLElement>('[data-audience-choice-summary]');
    const detail = button.querySelector<HTMLElement>('[data-audience-choice-detail]');
    if (label) label.textContent = meta.label;
    if (summary) summary.textContent = meta.summary;
    if (detail) detail.textContent = meta.description;
  });
}

function focusCurrentAudienceChoice(overlay: HTMLElement): void {
  const selector = `[data-audience-choice="${currentAudienceMode()}"]`;
  (
    overlay.querySelector<HTMLButtonElement>(selector) ?? overlay.querySelector<HTMLButtonElement>('.audience-choice')
  )?.focus();
}

function showAudienceChooser(): void {
  const existing = document.getElementById(CHOOSER_ID);
  if (existing) {
    const active = document.activeElement;
    audienceChooserReturnFocus = active instanceof HTMLElement && !existing.contains(active) ? active : null;
    existing.removeAttribute('hidden');
    document.body.classList.add('audience-chooser-open');
    localizeAudienceChooser(existing);
    markCurrentChoice(existing);
    focusCurrentAudienceChoice(existing);
    return;
  }
  // Full-screen selection screen shown on every launch: a dimmed backdrop with
  // a centered card so choosing a workspace is the first thing a visitor does.
  // The overlay element carries the chooser id; the visible panel is the card.
  const overlay = document.createElement('div');
  overlay.id = CHOOSER_ID;
  overlay.className = 'audience-chooser';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'audienceChooserTitle');
  overlay.setAttribute('aria-describedby', 'audienceChooserDescription');
  audienceChooserReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const card = document.createElement('section');
  card.className = 'audience-chooser-card';

  const head = document.createElement('div');
  head.className = 'audience-chooser-head';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'audience-chooser-eyebrow';
  eyebrow.textContent = 'Pendulum Lab';
  const title = document.createElement('div');
  title.className = 'audience-chooser-title';
  title.id = 'audienceChooserTitle';
  title.dataset.audienceChooserTitle = '';
  title.textContent = 'Choose your workspace';
  const copy = document.createElement('div');
  copy.className = 'audience-chooser-copy';
  copy.id = 'audienceChooserDescription';
  copy.dataset.audienceChooserCopy = '';
  copy.textContent =
    'Pick the level that matches what you want to do now. You can change this anytime from the Mode selector in the sidebar.';
  titleBlock.append(eyebrow, title, copy);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'audience-chooser-close';
  close.setAttribute('aria-label', 'Keep current mode and close');
  close.textContent = '×';
  close.addEventListener('click', hideAudienceChooser);
  head.append(titleBlock, close);

  const grid = document.createElement('div');
  grid.className = 'audience-choice-grid';
  for (const mode of ['beginner', 'student', 'research'] as const) {
    const meta = AUDIENCE_MODES[mode];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audience-choice';
    button.dataset.audienceChoice = mode;
    button.setAttribute('aria-label', `Use ${meta.label} mode`);
    const icon = document.createElement('span');
    icon.className = 'audience-choice-icon';
    icon.append(createIcon(meta.icon));
    const body = document.createElement('span');
    const strong = document.createElement('strong');
    strong.dataset.audienceChoiceLabel = '';
    strong.textContent = meta.label;
    const summary = document.createElement('span');
    summary.dataset.audienceChoiceSummary = '';
    summary.textContent = meta.summary;
    const detail = document.createElement('small');
    detail.dataset.audienceChoiceDetail = '';
    detail.textContent = meta.description;
    body.append(strong, summary, detail);
    button.append(icon, body);
    button.addEventListener('click', () => {
      applyAudienceMode(mode);
      hideAudienceChooser();
    });
    grid.append(button);
  }

  // Escape keeps the current mode; Tab stays inside the modal surface.
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hideAudienceChooser();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) hideAudienceChooser();
  });

  card.append(head, grid);
  overlay.append(card);
  document.body.append(overlay);
  document.body.classList.add('audience-chooser-open');
  localizeAudienceChooser(overlay);
  markCurrentChoice(overlay);
  // Focus the active choice, not the first card, so focus and selection agree.
  focusCurrentAudienceChoice(overlay);
}

/**
 * Wire the double-pendulum rail logo so clicking it — or pressing Enter/Space
 * while it is focused — reopens the workspace chooser, the app's home screen.
 * Bound at most once; safe to call repeatedly.
 */
function bindHomeLogo(): void {
  const logo = document.getElementById('railHome') ?? document.querySelector<HTMLElement>('.rail-logo');
  if (!logo || logo.dataset.homeBound === '1') return;
  logo.dataset.homeBound = '1';
  const open = (event: Event): void => {
    event.preventDefault();
    showAudienceChooser();
  };
  logo.addEventListener('click', open);
  logo.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') open(event);
  });
}

function markClosest(id: string, selector: string, level: AudienceMode): void {
  const element = document.getElementById(id);
  const target = element?.closest<HTMLElement>(selector);
  if (target) target.dataset.audienceMin = level;
}

function installAudienceAnnotations(): void {
  for (const id of LAB_STUDENT_ROW_IDS) markClosest(id, '.row', 'student');
  for (const id of LAB_STUDENT_DETAIL_ANCHORS) markClosest(id, 'details', 'student');
  for (const id of LAB_RESEARCH_DETAIL_ANCHORS) markClosest(id, 'details', 'research');
}

export function currentAudienceMode(): AudienceMode {
  return activeAudienceMode ?? urlAudienceMode() ?? storedAudienceMode() ?? 'research';
}

/** Central authorization for every tab entry path (click, shortcut, URL, command). */
export function canAccessAudienceTab(mode: AudienceMode, tab: string): boolean {
  const hidden = mode === 'beginner' ? BEGINNER_HIDDEN_TABS : mode === 'student' ? STUDENT_HIDDEN_TABS : [];
  return !hidden.includes(tab);
}

/** Whether the URL or persistent preference explicitly selected an audience. */
export function hasExplicitAudienceMode(): boolean {
  return urlAudienceMode() !== null || storedAudienceMode() !== null;
}

export function applyAudienceMode(mode: AudienceMode, persist = true): void {
  activeAudienceMode = mode;
  installAudienceAnnotations();
  decorateNavigation();
  document.body.classList.remove('audience-beginner', 'audience-student', 'audience-research');
  document.body.classList.add(`audience-${mode}`);
  document.body.dataset.audienceMode = mode;
  if (persist) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, mode);
    } catch {
      /* persistence is best-effort */
    }
    hideAudienceChooser();
    document.dispatchEvent(new CustomEvent(AUDIENCE_MODE_CHANGED_EVENT, { detail: { mode } }));
  }
  // If the active tab is no longer reachable in this mode, fall back to Lab.
  const active = document.querySelector<HTMLElement>('.tabpanel.active');
  const activeName = active?.id?.replace(/^tab-/, '') ?? '';
  if (!canAccessAudienceTab(mode, activeName)) {
    document.querySelector<HTMLElement>('.tab[data-tab="lab"]')?.click();
  }
  document.querySelectorAll<HTMLElement>('[data-workflow-tab]').forEach((entry) => {
    const tab = entry.dataset.workflowTab;
    const accessible = !tab || canAccessAudienceTab(mode, tab);
    entry.hidden = !accessible;
    entry.toggleAttribute('inert', !accessible);
    entry.setAttribute('aria-hidden', String(!accessible));
  });
  const select = document.getElementById('audienceMode');
  if (select instanceof HTMLSelectElement && select.value !== mode) select.value = mode;
}

/** Install the mode select in the rail and restore the persisted mode. */
export function installAudienceMode(): void {
  if (typeof document === 'undefined' || document.getElementById('audienceMode')) return;
  const rail = document.querySelector('.rail');
  if (!rail) return;
  installAdoptedStyle(STYLE_ID, audienceModeCss());
  installAudienceAnnotations();
  decorateNavigation();
  const wrap = document.createElement('div');
  wrap.className = 'audience-select';
  const label = document.createElement('label');
  label.htmlFor = 'audienceMode';
  label.textContent = 'Mode';
  const select = document.createElement('select');
  select.id = 'audienceMode';
  select.setAttribute('aria-label', 'Audience mode');
  for (const [value, meta] of Object.entries(AUDIENCE_MODES)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    option.title = meta.description;
    select.append(option);
  }
  select.addEventListener('change', () => applyAudienceMode(normalizeAudienceMode(select.value)));
  wrap.append(label, select);
  rail.append(wrap);
  bindHomeLogo();
  const requested = urlAudienceMode();
  const stored = storedAudienceMode();
  applyAudienceMode(requested ?? stored ?? 'research', Boolean(requested ?? stored));
  // First visit asks for intent; returning visitors land directly in their
  // saved workspace and can reopen this chooser from the rail logo.
  if (!requested && !stored) showAudienceChooser();
}
