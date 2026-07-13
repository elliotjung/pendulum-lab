/**
 * onboardingTour — a four-step spotlight tour for first-time visitors.
 *
 * After the workspace chooser is dismissed on a real first visit, a dimmed
 * spotlight walks the visitor through the canvas, the presets, the rail menu,
 * and the mode selector. Runs once (persisted flag), never under automation
 * (navigator.webdriver), and is skippable at every step (button or Escape) —
 * the same gating philosophy as the hud-fx ambience layer.
 *
 * Step copy follows the guide locale (see navGuide/uiLocale); the pure data
 * below is unit-tested in tests/onboarding-tour.test.ts.
 */

import { installAdoptedStyle } from '../ui/adoptedStyles';
import { currentNavLocale } from './navGuide';

export const TOUR_STORAGE_KEY = 'pendulum-lab/ui/tour-done';

export interface TourStep {
  /** CSS selector of the element the spotlight rings. */
  target: string;
  kind?: 'tour' | 'mission';
  en: { title: string; body: string };
  ko: { title: string; body: string };
}

export const ONBOARDING_PD_MISSION = Object.freeze({
  id: 'measure-period-doubling-onset',
  literatureValue: 1.0663,
  tolerance: 0.01,
  tab: 'bifurc'
});

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: '#main',
    en: {
      title: 'The live pendulum',
      body: 'This canvas runs the real simulation. Watch the arms swing, and scroll down for energy and chaos plots.'
    },
    ko: {
      title: '실시간 진자',
      body: '이 캔버스가 실제 시뮬레이션입니다. 팔이 흔들리는 걸 보고, 아래로 내리면 에너지·카오스 그래프가 있어요.'
    }
  },
  {
    target: '.presets',
    en: {
      title: 'One-click starts',
      body: 'Presets set up interesting motions instantly — try Butterfly for chaos or Periodic for calm rhythm.'
    },
    ko: {
      title: '원클릭 시작',
      body: '프리셋은 흥미로운 운동을 바로 세팅해 줍니다 — 카오스는 Butterfly, 규칙적 리듬은 Periodic을 눌러 보세요.'
    }
  },
  {
    target: '.rail-menu',
    en: {
      title: 'Everything lives here',
      body: 'Each menu opens a workspace: explore, analyze, validate, export. Every entry explains itself in one line.'
    },
    ko: {
      title: '모든 기능은 여기에',
      body: '각 메뉴가 작업 공간을 엽니다: 탐색·분석·검증·내보내기. 모든 항목에 한 줄 설명이 붙어 있어요.'
    }
  },
  {
    target: '[data-workflow-tab="lyap"]',
    kind: 'mission',
    en: {
      title: 'Mission: find A_PD',
      body: 'Open Analyze → Bifurcation, sweep drive amplitude, and measure the first period doubling. Can you recover the literature value A_PD ≈ 1.0663 within ±0.01?'
    },
    ko: {
      title: '미션: A_PD 찾기',
      body: '분석 → 분기에서 구동 진폭을 훑고 첫 주기배가 지점을 측정하세요. 문헌값 A_PD ≈ 1.0663을 ±0.01 안에서 재현할 수 있을까요?'
    }
  },
  {
    target: '.audience-select',
    en: {
      title: 'Grow at your pace',
      body: 'Switch between Beginner, Student, and Research any time — the interface shows exactly as much as you want.'
    },
    ko: {
      title: '수준에 맞게 전환',
      body: '초보·학생·연구 모드를 언제든 바꿀 수 있습니다 — 인터페이스가 딱 원하는 만큼만 보여 줘요.'
    }
  }
];

const STYLE_ID = 'onboarding-tour-style';
const ROOT_ID = 'onboardingTour';

function tourCss(): string {
  return `
#${ROOT_ID}{position:fixed;inset:0;z-index:11500;pointer-events:none}
.tour-ring{position:fixed;border-radius:14px;pointer-events:none;border:1.5px solid rgba(30,227,255,.9);box-shadow:0 0 0 9999px rgba(3,5,12,.62),0 0 34px -4px rgba(30,227,255,.8),inset 0 0 18px -6px rgba(30,227,255,.55);transition:top .34s cubic-bezier(.2,.7,.2,1),left .34s cubic-bezier(.2,.7,.2,1),width .34s cubic-bezier(.2,.7,.2,1),height .34s cubic-bezier(.2,.7,.2,1)}
.tour-card{position:fixed;max-width:300px;pointer-events:auto;padding:15px 16px;border-radius:12px;border:1px solid transparent;background:linear-gradient(172deg,rgba(10,15,30,.98),rgba(6,9,19,.99)) padding-box,linear-gradient(165deg,rgba(30,227,255,.65),rgba(255,255,255,.09) 30%,rgba(157,120,255,.55)) border-box;box-shadow:0 18px 50px -18px rgba(0,0,0,.85),0 0 44px -14px rgba(30,227,255,.6);transition:top .34s cubic-bezier(.2,.7,.2,1),left .34s cubic-bezier(.2,.7,.2,1)}
.tour-step-tag{font:800 8.5px/1 var(--font-mono,monospace);letter-spacing:2.4px;text-transform:uppercase;color:var(--cyan,#1ee3ff);margin-bottom:7px}
.tour-title{font:800 14px/1.25 var(--font-display,sans-serif);color:var(--fg-bright,#eef4ff);margin-bottom:6px;letter-spacing:.3px}
.tour-body{font-size:11.5px;line-height:1.55;color:var(--text,#c7d1e6)}
.tour-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.tour-dots{display:flex;gap:5px}
.tour-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.16)}
.tour-dots i.on{background:var(--cyan,#1ee3ff);box-shadow:0 0 8px rgba(30,227,255,.8)}
.tour-actions{display:flex;gap:7px}
.tour-actions button{font-size:10.5px;padding:6px 11px;border-radius:7px}
@media(prefers-reduced-motion:reduce){.tour-ring,.tour-card{transition:none}}
@media(max-width:640px){.tour-card{max-width:min(300px,calc(100vw - 24px))}}
`;
}

function tourDone(): boolean {
  try {
    return window.localStorage?.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return true; // no persistence → do not nag on every load
  }
}

function markTourDone(): void {
  try {
    window.localStorage?.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    /* best-effort */
  }
}

function automatedSession(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

interface TourDom {
  root: HTMLElement;
  ring: HTMLElement;
  card: HTMLElement;
  tag: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  dots: HTMLElement[];
  next: HTMLButtonElement;
}

function buildDom(onSkip: () => void, onNext: () => void): TourDom {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Quick tour');
  const tag = document.createElement('div');
  tag.className = 'tour-step-tag';
  const title = document.createElement('div');
  title.className = 'tour-title';
  const body = document.createElement('div');
  body.className = 'tour-body';
  const foot = document.createElement('div');
  foot.className = 'tour-foot';
  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'tour-dots';
  const dots = TOUR_STEPS.map(() => {
    const dot = document.createElement('i');
    dotsWrap.append(dot);
    return dot as HTMLElement;
  });
  const actions = document.createElement('div');
  actions.className = 'tour-actions';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = currentNavLocale() === 'ko' ? '건너뛰기' : 'Skip';
  skip.addEventListener('click', onSkip);
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary';
  next.addEventListener('click', onNext);
  actions.append(skip, next);
  foot.append(dotsWrap, actions);
  card.append(tag, title, body, foot);
  root.append(ring, card);
  document.body.append(root);
  return { root, ring, card, tag, title, body, dots, next };
}

function placeStep(dom: TourDom, index: number): boolean {
  const step = TOUR_STEPS[index];
  if (!step) return false;
  const target = document.querySelector<HTMLElement>(step.target);
  if (!target) return false;
  const box = target.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return false;
  const pad = 8;
  Object.assign(dom.ring.style, {
    top: `${box.top - pad}px`,
    left: `${box.left - pad}px`,
    width: `${box.width + pad * 2}px`,
    height: `${box.height + pad * 2}px`
  });
  const copy = currentNavLocale() === 'ko' ? step.ko : step.en;
  const locale = currentNavLocale();
  const tagName =
    step.kind === 'mission'
      ? locale === 'ko'
        ? '측정 미션'
        : 'Measurement mission'
      : locale === 'ko'
        ? '둘러보기'
        : 'Quick tour';
  dom.tag.textContent = `${tagName} ${index + 1}/${TOUR_STEPS.length}`;
  dom.title.textContent = copy.title;
  dom.body.textContent = copy.body;
  dom.next.textContent =
    index === TOUR_STEPS.length - 1
      ? locale === 'ko'
        ? '시작하기'
        : 'Start exploring'
      : locale === 'ko'
        ? '다음'
        : 'Next';
  dom.dots.forEach((dot, i) => dot.classList.toggle('on', i === index));
  // Card beside the ring: prefer the right side, fall back to below/above.
  // Measure the card's real rendered size (its height varies with the copy and
  // per-engine font metrics) so the whole card — button included — is always
  // clamped inside the viewport, even for the bottom-anchored final step.
  const cardRect = dom.card.getBoundingClientRect();
  const cardW = cardRect.width || 300;
  const cardH = cardRect.height || 180;
  const maxTop = window.innerHeight - cardH - 12;
  let left = box.right + 18;
  let top = Math.max(12, Math.min(box.top, maxTop));
  if (left + cardW > window.innerWidth - 12) {
    left = Math.max(12, Math.min(box.left, window.innerWidth - cardW - 12));
    top = Math.min(box.bottom + 18, maxTop);
    if (top < 12) top = 12;
  }
  Object.assign(dom.card.style, { top: `${top}px`, left: `${left}px` });
  return true;
}

function startTour(): void {
  let index = 0;
  let dom: TourDom | null = null;
  const finish = (): void => {
    markTourDone();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    dom?.root.remove();
    dom = null;
  };
  const advance = (): void => {
    index += 1;
    if (index >= TOUR_STEPS.length || !dom || !placeStep(dom, index)) finish();
    else dom.next.focus();
  };
  const onResize = (): void => {
    if (dom) placeStep(dom, index);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      finish();
    }
  };
  dom = buildDom(finish, advance);
  if (!placeStep(dom, index)) {
    // Nothing sensible to point at (unexpected layout) — bow out silently.
    dom.root.remove();
    markTourDone();
    return;
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKey, true);
  dom.next.focus();
}

/**
 * Install the tour: waits for the workspace chooser to be dismissed, then
 * spotlights the four core surfaces. One-shot per browser profile.
 */
export function installOnboardingTour(): void {
  if (typeof document === 'undefined' || automatedSession() || tourDone()) return;
  if (document.getElementById(ROOT_ID)) return;
  installAdoptedStyle(STYLE_ID, tourCss());
  const startedAt = Date.now();
  const poll = (): void => {
    if (tourDone()) return; // another tab finished it meanwhile
    const chooser = document.getElementById('audienceModeChooser');
    const chooserOpen = Boolean(chooser && !chooser.hidden);
    if (!chooserOpen && document.querySelector('#main')) {
      startTour();
      return;
    }
    if (Date.now() - startedAt < 120_000) window.setTimeout(poll, 400);
  };
  window.setTimeout(poll, 600);
}
