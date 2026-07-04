/**
 * Audience modes gate the visible UI complexity without disabling the engine.
 *
 * Beginner keeps the lab focused on motion: presets, the main canvas, playback,
 * and the safest physical controls. Student adds analysis and validation.
 * Research exposes the full governance, export, and diagnostic surface.
 */

import { installAdoptedStyle } from '../ui/adoptedStyles';

export type AudienceMode = 'beginner' | 'student' | 'research';

export const AUDIENCE_MODES: Record<AudienceMode, { label: string; description: string; summary: string; icon: IconName }> = {
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

/** Rail sections (data-rail-section values) visible in each mode. */
export function visibleRailSections(mode: AudienceMode): readonly string[] {
  switch (mode) {
    case 'beginner':
      return ['sim'];
    case 'student':
      return ['sim', 'analysis', 'check'];
    case 'research':
      return ['sim', 'analysis', 'chaos', 'check', 'govern'];
    default: {
      const exhaustive: never = mode;
      throw new Error(`unknown audience mode: ${String(exhaustive)}`);
    }
  }
}

export function normalizeAudienceMode(value: unknown): AudienceMode {
  return value === 'beginner' || value === 'student' || value === 'research' ? value : 'research';
}

const STORAGE_KEY = 'pendulum-lab/ui/audience-mode';
const STYLE_ID = 'audience-mode-style';
const CHOOSER_ID = 'audienceModeChooser';
const SVG_NS = 'http://www.w3.org/2000/svg';

type IconName =
  | 'spark' | 'chart' | 'lab' | 'explore' | 'analyze' | 'chaos' | 'validate' | 'export'
  | 'play' | 'compare' | 'spectrum' | 'grid' | 'branch' | 'cube' | 'density'
  | 'binary' | 'vectors' | 'basin' | 'recurrence' | 'field' | 'manifest' | 'shield'
  | 'command' | 'report' | 'orbit';

/** Tabs whose panels a non-research mode must not leave active (fallback to lab). */
const RESEARCH_ONLY_TABS = ['matrix', 'zeroone', 'clv', 'basin', 'rqa', 'ftle', 'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs'];
const STUDENT_HIDDEN_TABS = RESEARCH_ONLY_TABS;
const BEGINNER_HIDDEN_TABS = [...RESEARCH_ONLY_TABS, 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'expansion', 'validate', 'golden', 'compare'];

const LAB_STUDENT_ROW_IDS = ['seed', 'th3', 'iw1', 'iw2', 'iw3', 'm3', 'l3', 'gamma'];
const LAB_STUDENT_DETAIL_ANCHORS = ['trailMode', 'method', 'ensN', 'dlTrajBtn', 'stats'];
const LAB_RESEARCH_DETAIL_ANCHORS = ['audioOn'];

const BEGINNER_HIDDEN_SURFACES = [
  '#stableIntuitivePanel',
  '#v10StatusCard',
  '#rgv7ControlCard',
  '#rgv8GovCard',
  '#rgv7ValidationCard',
  '#rgv8Honesty',
  '#rgv8Commercial',
  '#rgv8ValidateNote',
  '#canonicalDiag',
  '#riAnalysisControls',
  '#riScientificStatusPanel',
  '#sfv9Panel',
  '#plxModeCard'
];

const STUDENT_HIDDEN_SURFACES = [
  '#rgv7ControlCard',
  '#rgv8GovCard',
  '#rgv8Honesty',
  '#rgv8Commercial',
  '#canonicalDiag',
  '#sfv9Panel',
  '#plxModeCard'
];

const SECTION_PRESENTATION: Record<string, { label: string; icon: IconName; hint: string }> = {
  sim: { label: 'Explore', icon: 'explore', hint: 'Run the pendulum, try presets, and compare the core motion.' },
  analysis: { label: 'Analyze', icon: 'analyze', hint: 'Read energy, spectra, maps, and phase-space behavior.' },
  chaos: { label: 'Chaos', icon: 'chaos', hint: 'Use advanced chaos diagnostics for research-mode studies.' },
  check: { label: 'Validate', icon: 'validate', hint: 'Check accuracy, validation status, and numerical health.' },
  govern: { label: 'Export', icon: 'export', hint: 'Save figures, manifests, reports, notebooks, and research bundles.' }
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

function selectorsForModeHiddenSections(mode: AudienceMode): string {
  const visible = new Set(visibleRailSections(mode));
  return ['sim', 'analysis', 'chaos', 'check', 'govern']
    .filter((section) => !visible.has(section))
    .map((section) => `body.audience-${mode} .rail-section[data-rail-section="${section}"]`)
    .join(',');
}

function prefixBody(selectors: readonly string[], mode: AudienceMode): string {
  return selectors.map((selector) => `body.audience-${mode} ${selector}`).join(',');
}

function modeCss(): string {
  const beginnerHidden = selectorsForModeHiddenSections('beginner');
  const studentHidden = selectorsForModeHiddenSections('student');
  const beginnerSurfaces = prefixBody(BEGINNER_HIDDEN_SURFACES, 'beginner');
  const studentSurfaces = prefixBody(STUDENT_HIDDEN_SURFACES, 'student');

  return `
${beginnerHidden}{display:none!important}
${studentHidden}{display:none!important}
body.audience-beginner .dev-hub,
body.audience-beginner #ueFloatingDiag,
body.audience-beginner .diag-row,
body.audience-beginner header .badge,
body.audience-beginner header #qualBadge,
body.audience-beginner header #fpsBadge,
body.audience-beginner .rb-badge,
body.audience-beginner .trust-inspector-backdrop,
body.audience-beginner #savePreset,
body.audience-beginner #tab-lab .scrub-row,
body.audience-beginner #tab-lab .plots-row,
body.audience-beginner [data-audience-min="student"],
body.audience-beginner [data-audience-min="research"],
body.audience-student [data-audience-min="research"]{display:none!important}
${beginnerSurfaces}{display:none!important}
${studentSurfaces}{display:none!important}
body.audience-beginner #tab-lab .layout{grid-template-columns:minmax(0,1fr) minmax(220px,280px)}
body.audience-beginner #tab-lab .controls{max-height:none}
body.audience-beginner #tab-lab .main-wrap{min-height:clamp(320px,58vh,680px)}
body.audience-beginner #tab-lab #main{height:100%;min-height:clamp(300px,55vh,640px)}
body.audience-beginner #tab-lab .ctrl-sticky{border-radius:var(--radius-lg) var(--radius-lg) 0 0}
body.audience-beginner #tab-lab .controls .acc[open]>.acc-body{padding-bottom:12px}
body.audience-beginner .presets{position:sticky;top:0;z-index:50}
body.audience-research .rb-badge{box-shadow:0 0 0 1px rgba(255,255,255,.025),0 6px 18px rgba(0,0,0,.14)}
body.audience-research #tab-research .research-card:first-child{border-color:rgba(240,196,25,.42)}
.rail-menu-icon,.tab-icon{color:var(--cyan)}
.rail-icon-svg{width:20px;height:20px;display:block;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.rail-menu-icon .rail-icon-svg{width:19px;height:19px}
.tab-icon .rail-icon-svg{width:18px;height:18px}
.rail-submenu-hint{grid-column:1/-1;margin:0 0 4px;padding:7px 8px;border:1px solid var(--divider);border-radius:8px;background:rgba(255,255,255,.028);color:var(--text);font-size:10.5px;line-height:1.4}
.audience-select{margin-top:auto;padding:6px;display:flex;flex-direction:column;gap:4px}
.audience-select label{font:700 8px/1 var(--font-mono,monospace);letter-spacing:1px;color:var(--subtle,#6b7894);text-transform:uppercase;text-align:center}
.audience-select select{width:100%;font-size:10px}
.audience-chooser{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:24px;background:linear-gradient(rgba(30,227,255,.04) 1px,transparent 1px) 0 0/100% 44px,linear-gradient(90deg,rgba(30,227,255,.04) 1px,transparent 1px) 0 0/44px 100%,radial-gradient(130% 130% at 50% 0%,rgba(10,16,30,.87),rgba(3,5,12,.965));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:audienceChooserIn .26s ease both}
.audience-chooser[hidden]{display:none!important}
@keyframes audienceChooserIn{from{opacity:0}to{opacity:1}}
.audience-chooser-card{position:relative;width:min(840px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;border:1px solid transparent;border-radius:16px;background:linear-gradient(172deg,rgba(10,15,30,.97),rgba(6,9,19,.98)) padding-box,linear-gradient(165deg,rgba(30,227,255,.6),rgba(255,255,255,.08) 30%,rgba(157,120,255,.5) 65%,rgba(255,122,44,.4)) border-box;box-shadow:var(--shadow-lg),0 0 110px -34px rgba(30,227,255,.7),inset 0 1px 0 rgba(255,255,255,.09);padding:24px;animation:audienceCardIn .34s cubic-bezier(.2,.7,.2,1) both}
.audience-chooser-card::before,.audience-chooser-card::after{content:"";position:absolute;top:-1px;width:18px;height:18px;border:1.5px solid var(--cyan);pointer-events:none;filter:drop-shadow(0 0 5px rgba(30,227,255,.7))}
.audience-chooser-card::before{left:-1px;border-right:0;border-bottom:0;border-top-left-radius:14px}
.audience-chooser-card::after{right:-1px;border-left:0;border-bottom:0;border-top-right-radius:14px}
@keyframes audienceCardIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.audience-chooser,.audience-chooser-card{animation:none}}
.audience-chooser-eyebrow{font:800 9.5px/1 var(--font-mono,monospace);letter-spacing:3.2px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px;text-shadow:0 0 14px rgba(30,227,255,.5)}
.audience-chooser-eyebrow::before{content:"◢ ";font-size:8px;opacity:.8}
.audience-chooser-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
.audience-chooser-title{font:800 20px/1.2 var(--font-display);color:var(--fg-bright);letter-spacing:.6px;text-transform:uppercase;background:linear-gradient(94deg,#f2fbff 0%,#9ceaff 55%,#cdbcff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.audience-chooser-copy{margin-top:6px;color:var(--text);font-size:12px;line-height:1.6;max-width:560px}
.audience-chooser-close{width:32px;height:32px;border-radius:8px;padding:0;font-size:16px;color:var(--text)}
.audience-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.audience-choice{display:grid;grid-template-columns:36px minmax(0,1fr);gap:11px;align-items:start;text-align:left;padding:14px 13px;border-radius:12px;background:linear-gradient(168deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid var(--glass-stroke);color:var(--text);min-height:118px;transition:border-color .2s var(--ease,ease),background .2s var(--ease,ease),box-shadow .25s var(--ease,ease),transform .18s var(--ease-spring,ease)}
.audience-choice:hover,.audience-choice:focus-visible{border-color:rgba(30,227,255,.55);background:linear-gradient(168deg,rgba(30,227,255,.1),rgba(157,120,255,.05));color:var(--fg-bright);transform:translateY(-3px) scale(1.015);box-shadow:0 14px 34px -14px rgba(0,0,0,.7),0 0 34px -10px rgba(30,227,255,.6)}
.audience-choice:active{transform:translateY(-1px) scale(.99)}
.audience-choice-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:var(--cyan);background:linear-gradient(180deg,rgba(30,227,255,.14),rgba(30,227,255,.04));border:1px solid rgba(30,227,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);transition:box-shadow .25s var(--ease,ease),transform .2s var(--ease-spring,ease)}
.audience-choice:hover .audience-choice-icon,.audience-choice:focus-visible .audience-choice-icon{box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 18px -4px rgba(30,227,255,.85);transform:scale(1.08)}
.audience-choice-icon .rail-icon-svg{width:22px;height:22px}
.audience-choice strong{display:block;color:var(--fg-bright);font-size:13px;margin-bottom:4px;letter-spacing:.8px;text-transform:uppercase}
.audience-choice span{display:block;color:var(--text);font-size:11px;line-height:1.5}
.audience-choice small{display:block;margin-top:8px;color:var(--muted);font:10px/1.4 var(--font-mono)}
@media(prefers-reduced-motion:reduce){.audience-choice,.audience-choice-icon{transition:none}.audience-choice:hover,.audience-choice:focus-visible{transform:none}.audience-choice:hover .audience-choice-icon,.audience-choice:focus-visible .audience-choice-icon{transform:none}}
@media(max-width:1100px){
  body.audience-beginner #tab-lab .layout{grid-template-columns:1fr}
}
@media(max-width:560px){
  body.audience-beginner #tab-lab .main-wrap{min-height:54vh}
  body.audience-beginner #tab-lab #main{min-height:52vh}
  body.audience-beginner .presets{top:0}
  .audience-chooser{padding:12px}
  .audience-chooser-card{padding:16px}
  .audience-chooser-head{gap:8px}
  .audience-choice-grid{grid-template-columns:1fr}
  .audience-choice{min-height:auto}
}
`;
}

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
      line(5, 18, 5, 21); line(3.5, 19.5, 6.5, 19.5); line(19, 4, 19, 7); line(17.5, 5.5, 20.5, 5.5);
      break;
    case 'chart':
    case 'analyze':
      line(4, 19, 20, 19); line(6, 16, 6, 11); line(11, 16, 11, 7); line(16, 16, 16, 9); add('path', { d: 'M5 10l4 3 4-6 5 4' });
      break;
    case 'lab':
      add('path', { d: 'M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 17l-5-9V3' }); add('path', { d: 'M8 15h8' });
      break;
    case 'explore':
      add('circle', { cx: '12', cy: '12', r: '8' }); add('path', { d: 'M10 14l2-6 2 6-2 2-2-2z' });
      break;
    case 'chaos':
      add('path', { d: 'M6 12c0-4 6-5 8-2 2 3-2 7-5 4-2-2 0-5 3-5 4 0 7 4 5 8' });
      break;
    case 'validate':
      add('circle', { cx: '12', cy: '12', r: '8' }); add('path', { d: 'M8 12.5l2.5 2.5L16 9' });
      break;
    case 'export':
      add('path', { d: 'M12 4v10M8 10l4 4 4-4M5 18h14' });
      break;
    case 'play':
      add('circle', { cx: '12', cy: '12', r: '8' }); add('path', { d: 'M10 8l6 4-6 4V8z' });
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
      for (const [cx, cy, r] of [[7, 8, 1.3], [13, 6, 1], [17, 11, 1.5], [9, 15, 1.2], [15, 17, 1]]) add('circle', { cx: String(cx), cy: String(cy), r: String(r) });
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
      add('path', { d: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z' }); add('path', { d: 'M9 12l2 2 4-5' });
      break;
    case 'command':
      add('path', { d: 'M8 8h8M8 12h5M8 16h8' }); add('circle', { cx: '5', cy: '8', r: '1' }); add('circle', { cx: '5', cy: '12', r: '1' }); add('circle', { cx: '5', cy: '16', r: '1' });
      break;
    case 'orbit':
      add('circle', { cx: '12', cy: '12', r: '2' }); add('path', { d: 'M4 12c3-7 13-7 16 0-3 7-13 7-16 0zM12 4c7 3 7 13 0 16-7-3-7-13 0-16z' });
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

function decorateNavigation(): void {
  for (const [sectionName, config] of Object.entries(SECTION_PRESENTATION)) {
    const section = document.querySelector<HTMLElement>(`.rail-section[data-rail-section="${sectionName}"]`);
    if (!section) continue;
    const button = section.querySelector<HTMLElement>('.rail-menu-button');
    const submenu = section.querySelector<HTMLElement>('.rail-submenu');
    setIcon(button?.querySelector('.rail-menu-icon') ?? null, config.icon);
    setLabel(button?.querySelector('.rail-menu-label') ?? null, config.label);
    button?.setAttribute('aria-label', `${config.label}: ${config.hint}`);
    button?.setAttribute('title', config.hint);
    if (submenu && !submenu.querySelector('.rail-submenu-hint')) {
      const hint = document.createElement('div');
      hint.className = 'rail-submenu-hint';
      hint.textContent = config.hint;
      submenu.prepend(hint);
    }
  }

  document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
    const tabName = tab.dataset.tab;
    const icon = tabName ? TAB_ICONS[tabName] : undefined;
    if (icon) setIcon(tab.querySelector('.tab-icon'), icon);
  });
  document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((button) => {
    const action = button.dataset.railAction;
    const icon = action ? ACTION_ICONS[action] : undefined;
    if (icon) setIcon(button.querySelector('.tab-icon'), icon);
  });
}

function storedAudienceMode(): AudienceMode | null {
  try {
    const value = window.localStorage?.getItem(STORAGE_KEY);
    return value === null ? null : normalizeAudienceMode(value);
  } catch {
    return null;
  }
}

function hideAudienceChooser(): void {
  document.getElementById(CHOOSER_ID)?.setAttribute('hidden', '');
}

function showAudienceChooser(): void {
  if (document.getElementById(CHOOSER_ID)) {
    document.getElementById(CHOOSER_ID)?.removeAttribute('hidden');
    return;
  }
  // Full-screen first-run selection screen: a dimmed backdrop with a centered
  // card so choosing a workspace is the first thing a new visitor does. The
  // overlay element carries the chooser id; the visible panel is the card.
  const overlay = document.createElement('div');
  overlay.id = CHOOSER_ID;
  overlay.className = 'audience-chooser';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Choose your Pendulum Lab mode');

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
  title.textContent = 'Choose your workspace';
  const copy = document.createElement('div');
  copy.className = 'audience-chooser-copy';
  copy.textContent = 'Pick the level that matches what you want to do now. You can change this anytime from the Mode selector in the sidebar.';
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
  let firstChoice: HTMLButtonElement | null = null;
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
    strong.textContent = meta.label;
    const summary = document.createElement('span');
    summary.textContent = meta.summary;
    const detail = document.createElement('small');
    detail.textContent = meta.description;
    body.append(strong, summary, detail);
    button.append(icon, body);
    button.addEventListener('click', () => {
      applyAudienceMode(mode);
      hideAudienceChooser();
    });
    grid.append(button);
    firstChoice ??= button;
  }

  // Escape keeps the current (default) mode, like the close button.
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      hideAudienceChooser();
    }
  });

  card.append(head, grid);
  overlay.append(card);
  document.body.append(overlay);
  // Move keyboard focus into the screen so it is reachable without a pointer.
  firstChoice?.focus();
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
  return storedAudienceMode() ?? 'research';
}

export function applyAudienceMode(mode: AudienceMode, persist = true): void {
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
  }
  // If the active tab is no longer reachable in this mode, fall back to Lab.
  const hidden = mode === 'beginner' ? BEGINNER_HIDDEN_TABS : mode === 'student' ? STUDENT_HIDDEN_TABS : [];
  const active = document.querySelector<HTMLElement>('.tabpanel.active');
  const activeName = active?.id?.replace(/^tab-/, '') ?? '';
  if (hidden.includes(activeName)) {
    document.querySelector<HTMLElement>('.tab[data-tab="lab"]')?.click();
  }
  const select = document.getElementById('audienceMode');
  if (select instanceof HTMLSelectElement && select.value !== mode) select.value = mode;
}

/** Install the mode select in the rail and restore the persisted mode. */
export function installAudienceMode(): void {
  if (typeof document === 'undefined' || document.getElementById('audienceMode')) return;
  const rail = document.querySelector('.rail');
  if (!rail) return;
  installAdoptedStyle(STYLE_ID, modeCss());
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
  const stored = storedAudienceMode();
  applyAudienceMode(stored ?? 'research', Boolean(stored));
  if (!stored) showAudienceChooser();
}
