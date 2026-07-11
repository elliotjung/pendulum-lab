/**
 * navGuide — plain-language, one-line explanations for every workspace menu
 * entry, written for first-time visitors who do not know the field jargon.
 *
 * The rail submenus render these as a second description line under each
 * label (see `decorateNavigation` in audienceMode.ts), and the same text is
 * folded into each button's title/aria-label tooltip. Pure data + pure
 * helpers so the module is unit-testable in the node vitest environment.
 *
 * Style contract (pinned by tests/nav-guide.test.ts): every description is a
 * short clause, 16–60 characters, no trailing period, plain words first and
 * the technical term second (the label already carries the jargon).
 */

/** One-line description per workspace tab id (`data-tab`). */
export const NAV_TAB_GUIDE: Record<string, string> = {
  // Explore
  lab: 'Run the live simulation and adjust every control',
  compare: 'Race integrators side by side on one motion',
  // Analyze
  lyap: 'Measure how fast nearby trajectories separate',
  sweep: 'Map chaos strength across starting angles',
  bifurc: 'Watch behavior change as a parameter varies',
  phase3d: 'Explore the trajectory as a rotatable 3D shape',
  density: 'See which states the motion visits most often',
  // Chaos diagnostics
  zeroone: 'Get a yes/no chaos verdict from one signal',
  clv: 'Trace the directions chaos stretches and folds',
  basin: 'Color each start by which rod flips first',
  rqa: 'Quantify repeating patterns in the motion',
  ftle: 'Reveal hidden barriers that organize the flow',
  // Validate
  validate: 'Run the built-in accuracy and health checks',
  research: 'Fit parameters, build surrogates, add noise',
  // Governance / dynamically-registered tabs (see railNavigation.ts)
  architecture: 'Inspect how the app modules fit together',
  lab3d: 'Swing rope and spherical pendulums in 3D',
  canonical: 'Audit the Hamiltonian form of the dynamics',
  aplus: 'Review the scientific evidence and audit trail',
  docs: 'Read the method notes behind every tool',
  // Tabs reachable from other surfaces (kept for tooltip completeness)
  expansion: 'Try extended physics models and scenarios',
  matrix: 'Cross-check results from independent methods',
  golden: 'Compare runs against pinned reference data'
};

/** One-line description per rail action button (`data-rail-action`). */
export const NAV_ACTION_GUIDE: Record<string, string> = {
  floquet: 'Test orbit stability at the current drive',
  manifest: 'Download a signed manifest of this session',
  integrity: 'Verify features against the manifest',
  palette: 'Search every command by keyboard (Ctrl+K)',
  report: 'Export a full report of the current session'
};

/** Compose the tooltip text shown on hover and read by screen readers. */
export function navTipText(name: string, description: string): string {
  return name ? `${name} — ${description}` : description;
}

/* ---------------------------------------------------------------------------
 * Locales. English is the default (and what the automated suites pin);
 * Korean mirrors every key so first-time Korean visitors read the menus in
 * their own words. The switcher UI lives in src/app/uiLocale.ts.
 * ------------------------------------------------------------------------- */

export type NavLocale = 'en' | 'ko';

export const NAV_LOCALE_STORAGE_KEY = 'pendulum-lab/ui/nav-locale';

/** 한국어 탭 설명 — 초보 방문자용 (메뉴 두 줄 안에 맞게 짧게). */
export const NAV_TAB_GUIDE_KO: Record<string, string> = {
  lab: '실시간 시뮬레이션을 돌리고 모든 값을 조절',
  compare: '여러 적분기를 같은 조건에서 나란히 비교',
  lyap: '가까운 궤적이 벌어지는 속도를 측정',
  sweep: '시작 각도에 따른 카오스 세기를 지도로',
  bifurc: '매개변수 변화에 따른 거동 변화를 관찰',
  phase3d: '궤적을 3D로 돌려 보며 탐색',
  density: '운동이 자주 지나는 상태를 밀도로 표시',
  zeroone: '신호 하나로 카오스 여부를 판정',
  clv: '카오스가 늘리고 접는 방향을 추적',
  basin: '시작점별로 어느 막대가 먼저 뒤집히는지',
  rqa: '운동 속 반복 패턴을 정량화',
  ftle: '흐름을 가르는 숨은 경계를 드러내기',
  validate: '내장 정확도·상태 점검을 실행',
  research: '매개변수 적합·대리모델·노이즈 실험',
  architecture: '앱 모듈 구조를 들여다보기',
  lab3d: '3D 줄·구면 진자를 흔들어 보기',
  canonical: '해밀토니안 형식의 품질을 감사',
  aplus: '과학적 근거와 감사 기록을 검토',
  docs: '모든 도구의 방법론 노트를 읽기',
  expansion: '확장 물리 모델과 시나리오를 실험',
  matrix: '독립적인 방법끼리 결과를 교차 검증',
  golden: '고정 기준 데이터와 실행을 비교'
};

/** 한국어 액션 설명. */
export const NAV_ACTION_GUIDE_KO: Record<string, string> = {
  floquet: '현재 구동점에서 궤도 안정성을 검사',
  manifest: '이 세션의 서명된 매니페스트를 저장',
  integrity: '기능을 매니페스트와 대조 검증',
  palette: '모든 명령을 키보드로 검색 (Ctrl+K)',
  report: '현재 세션의 전체 리포트를 내보내기'
};

let currentLocale: NavLocale = 'en';

export function normalizeNavLocale(value: unknown): NavLocale {
  return value === 'ko' ? 'ko' : 'en';
}

/**
 * Resolve the locale to start with: an explicit `?lang=` URL parameter wins
 * (the landing page's Korean mode deep-links the app with `lang=ko`), then
 * the persisted choice, then English. `fromUrl` tells the caller to persist
 * the parameter so the choice sticks on the next visit.
 */
export function resolveInitialNavLocale(
  search: string,
  stored: string | null
): { locale: NavLocale; fromUrl: boolean } {
  const param = new URLSearchParams(search).get('lang');
  if (param === 'ko' || param === 'en') return { locale: param, fromUrl: true };
  return { locale: stored === null ? 'en' : normalizeNavLocale(stored), fromUrl: false };
}

export function currentNavLocale(): NavLocale {
  return currentLocale;
}

export function setNavLocale(locale: NavLocale): void {
  currentLocale = locale;
}

/** Tab description in the active locale (falls back to English). */
export function tabGuideText(id: string): string | undefined {
  return currentLocale === 'ko' ? NAV_TAB_GUIDE_KO[id] ?? NAV_TAB_GUIDE[id] : NAV_TAB_GUIDE[id];
}

/** Action description in the active locale (falls back to English). */
export function actionGuideText(id: string): string | undefined {
  return currentLocale === 'ko' ? NAV_ACTION_GUIDE_KO[id] ?? NAV_ACTION_GUIDE[id] : NAV_ACTION_GUIDE[id];
}
