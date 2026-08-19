import {
  NAV_ACTION_LABEL_KO,
  NAV_TAB_LABEL_KO,
  actionGuideText,
  currentNavLocale,
  navTipText,
  tabGuideText
} from './navGuide';
import type { AudienceIconName } from './audienceModeContent';

const SVG_NS = 'http://www.w3.org/2000/svg';
type IconName = AudienceIconName;

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

/** Shared icon factory for rail affordances and the audience chooser. */
export function createAudienceIcon(name: IconName): SVGSVGElement {
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
      for (const [cx, cy, radius] of [
        [7, 8, 1.3],
        [13, 6, 1],
        [17, 11, 1.5],
        [9, 15, 1.2],
        [15, 17, 1]
      ])
        add('circle', { cx: String(cx), cy: String(cy), r: String(radius) });
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
  container?.replaceChildren(createAudienceIcon(icon));
}

function setLabel(container: Element | null, text: string): void {
  if (container) container.textContent = text;
}

function describeMenuEntry(button: HTMLElement, description: string | undefined): void {
  if (!description) return;
  const base = button.dataset.navName ?? (button.title || button.querySelector('.tab-label')?.textContent || '');
  button.dataset.navName = base;
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
  desc.textContent = description;
}

/** Reapply locale-aware task labels, descriptions, icons, and test hooks. */
export function decorateAudienceNavigation(): void {
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
