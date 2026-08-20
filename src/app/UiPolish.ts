/**
 * Functional input polish shared by every visual theme.
 *
 * Range progress is exposed as `--sp`, visual viewport dimensions keep modal
 * geometry honest on mobile, and input modality follows actual interaction.
 * No decorative DOM is created here.
 */

import { createAudienceIcon } from './audienceNavigation';

function syncRange(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min || '0');
  const max = Number.parseFloat(input.max || '100');
  const value = Number.parseFloat(input.value || '0');
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(value)) return;

  const progress = `${Math.min(100, Math.max(0, ((value - min) / span) * 100)).toFixed(2)}%`;
  if (input.style.getPropertyValue('--sp') !== progress) input.style.setProperty('--sp', progress);
}

function syncAllRanges(): void {
  document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(syncRange);
}

const CONTROL_ICON_BY_LABEL: ReadonlyArray<readonly [RegExp, Parameters<typeof createAudienceIcon>[0]]> = [
  [/system|initial|시스템|초기/i, 'lab'],
  [/3d/i, 'cube'],
  [/density|밀도/i, 'density'],
  [/bifurcation|분기/i, 'branch'],
  [/basin|흡인역/i, 'basin'],
  [/recurrence|rqa|embedding|재귀|임베딩/i, 'recurrence'],
  [/spectrum|fft|스펙트럼/i, 'spectrum'],
  [/sweep|grid|스윕|격자/i, 'grid'],
  [/orbit|floquet|neimark|궤도/i, 'orbit'],
  [/test|valid|diagnostic|health|검증|진단/i, 'validate'],
  [/inverse|vector|역문제|벡터/i, 'vectors'],
  [/field|audio|sound|장|소리/i, 'field'],
  [/ensemble|compare|앙상블|비교/i, 'compare'],
  [/export|record|내보내기|기록/i, 'export'],
  [/physical|parameter|물리|매개/i, 'orbit'],
  [/visual|plot|시각/i, 'spectrum'],
  [/keyboard|shortcut|키보드|단축키/i, 'command'],
  [/about|정보/i, 'report'],
  [/numerical|method|computation|result|수치|방법|결과/i, 'chart']
];

const CONTROL_ICON_BY_GLYPH: Readonly<Record<string, Parameters<typeof createAudienceIcon>[0]>> = {
  '⚛': 'lab',
  '⚖': 'orbit',
  '🎨': 'spectrum',
  '∫': 'chart',
  '👥': 'compare',
  '♪': 'field',
  '⬇': 'export',
  '📊': 'chart',
  '⌨': 'command',
  λ: 'spectrum',
  '▦': 'grid',
  '∿': 'branch',
  '⤳': 'orbit',
  '◯': 'orbit',
  '◉': 'cube',
  '▓': 'density',
  '✓': 'validate',
  '◐': 'validate',
  '⇌': 'compare',
  '❋': 'basin',
  '▨': 'recurrence',
  '⩜': 'field',
  '⊶': 'vectors',
  '∑': 'chart',
  G: 'shield',
  '⚙': 'preferences'
};

function syncControlIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.acc-icon').forEach((icon) => {
    if (icon.dataset.polishedIcon === 'true') return;
    const label = icon.closest('summary')?.querySelector<HTMLElement>('.acc-label')?.textContent ?? '';
    const match = CONTROL_ICON_BY_LABEL.find(([pattern]) => pattern.test(label));
    const glyph = icon.textContent?.trim() ?? '';
    const iconName = match?.[1] ?? CONTROL_ICON_BY_GLYPH[glyph] ?? 'chart';
    icon.replaceChildren(createAudienceIcon(iconName));
    icon.dataset.polishedIcon = 'true';
    icon.setAttribute('aria-hidden', 'true');
  });
}

let resyncQueued = false;
function queueResync(): void {
  if (resyncQueued) return;
  resyncQueued = true;
  requestAnimationFrame(() => {
    resyncQueued = false;
    syncAllRanges();
  });
}

function syncVisualViewport(): void {
  const viewport = window.visualViewport;
  const height = Math.max(1, viewport?.height ?? window.innerHeight);
  const width = Math.max(1, viewport?.width ?? window.innerWidth);
  const root = document.documentElement;
  root.style.setProperty('--ui-viewport-height', `${height.toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-width', `${width.toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-offset-left', `${(viewport?.offsetLeft ?? 0).toFixed(2)}px`);
  root.style.setProperty('--ui-viewport-offset-top', `${(viewport?.offsetTop ?? 0).toFixed(2)}px`);
}

let installed = false;

export function installUiPolish(): void {
  if (installed) return;
  installed = true;
  syncAllRanges();
  syncControlIcons();
  syncVisualViewport();

  window.addEventListener('resize', syncVisualViewport, { passive: true });
  window.addEventListener('orientationchange', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow'))
        document.documentElement.dataset.inputModality = 'keyboard';
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      document.documentElement.dataset.inputModality = event.pointerType === 'touch' ? 'touch' : 'pointer';
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );

  // Presets and restored sessions update range values programmatically.
  document.addEventListener('click', queueResync, true);

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') syncRange(target);
    },
    true
  );

  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof HTMLElement) syncControlIcons(node);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
