import { activateModalSurface, deactivateModalSurface, trapModalFocus } from '../modalSurface';
import { currentNavLocale } from '../navGuide';
import { $, append, button, html } from './shared';

let returnFocus: HTMLElement | null = null;

const STABLE_HELP_COPY = {
  en: {
    label: 'Stable control help',
    close: 'Close',
    title: 'Simulation Assistance',
    intro:
      'Stable Defaults keeps the current experiment readable without changing the scientific labels. Accuracy Mode tightens dt and tolerance. Performance Mode reduces rendering load first.',
    policyTitle: 'Research mode policy',
    policy:
      'Auto-stabilize only suggests changes when the mode is research or benchmark. It does not silently alter physics controls in those modes.'
  },
  ko: {
    label: '안정화 도움말',
    close: '닫기',
    title: '시뮬레이션 도움말',
    intro:
      '안정 기본값은 과학 라벨을 바꾸지 않고 현재 실험을 읽기 쉽게 유지합니다. 정확도 모드는 dt와 허용 오차를 줄이고, 성능 모드는 먼저 렌더링 부하를 줄입니다.',
    policyTitle: '연구 모드 정책',
    policy: '연구 또는 벤치마크 모드에서는 자동 안정화가 변경을 제안하기만 하며 물리 조절값을 조용히 바꾸지 않습니다.'
  }
} as const;

function localizeStableHelp(backdrop: HTMLElement): void {
  const copy = STABLE_HELP_COPY[currentNavLocale()];
  const box = backdrop.querySelector<HTMLElement>('.si-help');
  box?.setAttribute('aria-label', copy.label);
  const close = $('siCloseHelp');
  if (close) {
    close.textContent = copy.close;
    close.setAttribute('aria-label', copy.close);
  }
  const title = $('siHelpTitle');
  const intro = $('siHelpIntro');
  const policyTitle = $('siHelpPolicyTitle');
  const policy = $('siHelpPolicy');
  if (title) title.textContent = copy.title;
  if (intro) intro.textContent = copy.intro;
  if (policyTitle) policyTitle.textContent = copy.policyTitle;
  if (policy) policy.textContent = copy.policy;
}

function hideStableHelp(): void {
  const backdrop = $('siHelpBackdrop');
  if (!backdrop || !backdrop.classList.contains('show')) return;
  backdrop.classList.remove('show');
  deactivateModalSurface(backdrop);
  backdrop.setAttribute('aria-hidden', 'true');
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) queueMicrotask(() => target.focus());
}

export function installStableHelp(): void {
  if ($('siHelpBackdrop')) return;
  const backdrop = html('div', {
    id: 'siHelpBackdrop',
    className: 'si-help-backdrop',
    role: 'presentation'
  });
  backdrop.setAttribute('aria-hidden', 'true');
  const box = html('div', { className: 'si-help' });
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', STABLE_HELP_COPY.en.label);
  box.tabIndex = -1;
  append(
    box,
    button('siCloseHelp', 'Close', hideStableHelp, 'si-close'),
    html('h2', { id: 'siHelpTitle', text: STABLE_HELP_COPY.en.title }),
    html('p', { id: 'siHelpIntro', text: STABLE_HELP_COPY.en.intro }),
    html('h3', { id: 'siHelpPolicyTitle', text: STABLE_HELP_COPY.en.policyTitle }),
    html('p', { id: 'siHelpPolicy', text: STABLE_HELP_COPY.en.policy })
  );
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) hideStableHelp();
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hideStableHelp();
    } else if (event.key === 'Tab') {
      trapModalFocus(event, backdrop);
    }
  });
  backdrop.append(box);
  document.body.append(backdrop);
  localizeStableHelp(backdrop);
  document.addEventListener('pendulum:ui-locale-changed', () => localizeStableHelp(backdrop));
}

export function showStableHelp(): void {
  installStableHelp();
  const backdrop = $('siHelpBackdrop');
  if (!backdrop) return;
  localizeStableHelp(backdrop);
  const active = document.activeElement;
  returnFocus = active instanceof HTMLElement && !backdrop.contains(active) ? active : null;
  backdrop.classList.add('show');
  backdrop.removeAttribute('aria-hidden');
  activateModalSurface(backdrop);
  $('siCloseHelp')?.focus();
}
