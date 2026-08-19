import { AUDIENCE_MODES, AUDIENCE_MODES_KO } from './audienceModeContent';
import { normalizeAudienceMode, type AudienceMode } from './audienceModePolicy';
import { createAudienceIcon } from './audienceNavigation';
import { trapModalFocus } from './modalSurface';
import { currentNavLocale } from './navGuide';

const CHOOSER_ID = 'audienceModeChooser';

export interface AudienceChooserHooks {
  currentMode(): AudienceMode;
  choose(mode: AudienceMode): void;
  enterWorkspace(): void;
  /** Policy-layer hooks keep modal isolation coordinated with other dialogs. */
  activateModal(overlay: HTMLElement): void;
  deactivateModal(overlay: HTMLElement): void;
}

export interface AudienceChooserController {
  open(): void;
  close(): void;
  refresh(): void;
}

/**
 * Full-screen audience/workspace chooser.  It owns focus, dialog semantics,
 * and Korean/English copy, while mode persistence stays with audienceMode.
 */
export function createAudienceChooser(hooks: AudienceChooserHooks): AudienceChooserController {
  let returnFocus: HTMLElement | null = null;

  const markCurrentChoice = (root: ParentNode): void => {
    const current = hooks.currentMode();
    const currentLabel = currentNavLocale() === 'ko' ? '현재' : 'ACTIVE';
    root.querySelectorAll<HTMLElement>('[data-audience-choice]').forEach((button) => {
      const selected = button.dataset.audienceChoice === current;
      button.classList.toggle('audience-choice-current', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.dataset.currentLabel = selected ? currentLabel : '';
    });
  };

  const localize = (overlay: HTMLElement): void => {
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
    overlay
      .querySelector<HTMLElement>('.audience-choice-grid')
      ?.setAttribute('aria-label', korean ? '사용자 모드 선택' : 'Workspace mode choices');
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
  };

  const focusCurrentChoice = (overlay: HTMLElement): void => {
    (
      overlay.querySelector<HTMLButtonElement>(`[data-audience-choice="${hooks.currentMode()}"]`) ??
      overlay.querySelector<HTMLButtonElement>('.audience-choice')
    )?.focus();
  };

  const close = (): void => {
    const chooser = document.getElementById(CHOOSER_ID);
    if (!chooser || chooser.hasAttribute('hidden')) return;
    chooser.setAttribute('hidden', '');
    chooser.setAttribute('aria-hidden', 'true');
    hooks.deactivateModal(chooser);
    document.body.classList.remove('audience-chooser-open');
    const focusTarget = returnFocus;
    returnFocus = null;
    const fallback = document.getElementById('railHome');
    if (focusTarget?.isConnected) queueMicrotask(() => focusTarget.focus());
    else if (fallback instanceof HTMLElement) queueMicrotask(() => fallback.focus());
  };

  const build = (): HTMLElement => {
    const overlay = document.createElement('div');
    overlay.id = CHOOSER_ID;
    overlay.className = 'audience-chooser';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'audienceChooserTitle');
    overlay.setAttribute('aria-describedby', 'audienceChooserDescription');

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
    const copy = document.createElement('div');
    copy.className = 'audience-chooser-copy';
    copy.id = 'audienceChooserDescription';
    copy.dataset.audienceChooserCopy = '';
    titleBlock.append(eyebrow, title, copy);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'audience-chooser-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', close);
    head.append(titleBlock, closeButton);

    const grid = document.createElement('div');
    grid.className = 'audience-choice-grid';
    grid.setAttribute('role', 'group');
    for (const mode of ['beginner', 'student', 'research'] as const) {
      const meta = AUDIENCE_MODES[mode];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'audience-choice';
      button.dataset.audienceChoice = mode;
      const icon = document.createElement('span');
      icon.className = 'audience-choice-icon';
      icon.append(createAudienceIcon(meta.icon));
      const body = document.createElement('span');
      const label = document.createElement('strong');
      label.dataset.audienceChoiceLabel = '';
      const summary = document.createElement('span');
      summary.dataset.audienceChoiceSummary = '';
      const detail = document.createElement('small');
      detail.dataset.audienceChoiceDetail = '';
      body.append(label, summary, detail);
      button.append(icon, body);
      button.addEventListener('click', () => {
        hooks.choose(mode);
        hooks.enterWorkspace();
      });
      grid.append(button);
    }

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        trapModalFocus(event, overlay);
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const choices = Array.from(overlay.querySelectorAll<HTMLButtonElement>('[data-audience-choice]'));
        const active = document.activeElement instanceof Element ? document.activeElement.closest('button') : null;
        const index = choices.indexOf(active as HTMLButtonElement);
        if (index < 0 || !choices.length) return;
        event.preventDefault();
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? choices.length - 1
              : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
                choices.length;
        choices[nextIndex]?.focus();
      }
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    card.append(head, grid);
    overlay.append(card);
    return overlay;
  };

  const open = (): void => {
    let overlay = document.getElementById(CHOOSER_ID);
    if (!overlay) {
      overlay = build();
      document.body.append(overlay);
    }
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && !overlay.contains(active) ? active : null;
    overlay.removeAttribute('hidden');
    overlay.removeAttribute('aria-hidden');
    document.body.classList.add('audience-chooser-open');
    hooks.activateModal(overlay);
    localize(overlay);
    markCurrentChoice(overlay);
    focusCurrentChoice(overlay);
  };

  return {
    open,
    close,
    refresh: (): void => {
      const overlay = document.getElementById(CHOOSER_ID);
      if (!overlay) return;
      localize(overlay);
      markCurrentChoice(overlay);
    }
  };
}
