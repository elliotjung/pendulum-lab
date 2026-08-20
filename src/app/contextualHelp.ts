const TOOLTIP_ID = 'contextTooltip';

type HelpCopy = Readonly<{ en: string; ko: string }>;

const HELP_BY_ID: Readonly<Record<string, HelpCopy>> = {
  main: {
    en: 'Live pendulum view. Drag a bob to change its angle; Reset commits the new initial state.',
    ko: '실시간 진자 화면입니다. 추를 끌어 각도를 바꾸고, 초기화를 눌러 새 초기 상태를 적용합니다.'
  },
  energy: {
    en: 'Relative energy drift ΔE/E₀. A nearly flat trace means the numerical method is conserving energy well.',
    ko: '상대 에너지 오차 ΔE/E₀입니다. 그래프가 거의 평평할수록 수치해석 방법이 에너지를 잘 보존합니다.'
  },
  lyap: {
    en: 'Finite-time Lyapunov estimate. Sustained positive values indicate sensitive, chaotic motion.',
    ko: '유한 시간 랴푸노프 지수 추정값입니다. 양수가 지속되면 초기조건에 민감한 카오스 운동을 뜻합니다.'
  },
  phase: {
    en: 'Phase portrait of angle versus angular velocity. Closed curves suggest regular motion; diffuse paths suggest chaos.',
    ko: '각도와 각속도의 위상 궤적입니다. 닫힌 곡선은 규칙 운동, 넓게 퍼진 경로는 카오스를 시사합니다.'
  },
  poincare: {
    en: 'Poincaré section sampled at a repeated crossing. Islands indicate structure; a scattered cloud indicates chaos.',
    ko: '반복 교차 지점에서 표본화한 푸앵카레 단면입니다. 섬 구조는 질서, 흩어진 점구름은 카오스를 시사합니다.'
  },
  fft: {
    en: 'Frequency spectrum of the motion. Sharp peaks indicate dominant periods; a broad spectrum is typical of chaos.',
    ko: '운동의 주파수 스펙트럼입니다. 날카로운 봉우리는 지배 주기, 넓은 스펙트럼은 카오스의 전형적 특징입니다.'
  },
  qualBadge: {
    en: 'Current render-quality tier. Auto-quality may lower visual cost while preserving the simulation state.',
    ko: '현재 렌더링 품질 단계입니다. 자동 품질은 시뮬레이션 상태를 유지한 채 시각 연산량을 낮출 수 있습니다.'
  },
  fpsBadge: {
    en: 'Rendered frames per second. This measures visual refresh, not the integrator timestep.',
    ko: '초당 렌더링 프레임 수입니다. 적분 시간 간격이 아니라 화면 갱신 속도를 나타냅니다.'
  },
  timeMode: {
    en: 'Deterministic replay advances a fixed number of steps. Real-time mode follows elapsed wall-clock time.',
    ko: '결정론적 재생은 고정된 단계 수만큼 진행하고, 실시간 모드는 실제 경과 시간을 따릅니다.'
  },
  sysType: {
    en: 'Choose a double or triple pendulum. The triple model adds a third coupled arm and state pair.',
    ko: '이중 또는 삼중 진자를 선택합니다. 삼중 모델에는 세 번째 결합 팔과 상태 쌍이 추가됩니다.'
  },
  method: {
    en: 'Numerical integrator used to advance the equations of motion. Accuracy and long-run energy behavior differ by method.',
    ko: '운동방정식을 진행하는 수치 적분기입니다. 방법에 따라 정확도와 장시간 에너지 거동이 달라집니다.'
  },
  dt: {
    en: 'Integration timestep in seconds. Smaller values usually improve accuracy at higher compute cost.',
    ko: '초 단위 적분 시간 간격입니다. 값이 작을수록 대체로 정확하지만 계산량이 늘어납니다.'
  },
  tol: {
    en: 'Error tolerance used by adaptive or implicit methods. Smaller tolerances request stricter numerical accuracy.',
    ko: '적응형 또는 암시적 방법의 오차 허용치입니다. 작을수록 더 엄격한 수치 정확도를 요구합니다.'
  },
  driftStat: {
    en: 'Absolute energy drift relative to the initial energy. Values closer to zero indicate better conservation.',
    ko: '초기 에너지에 대한 절대 에너지 오차입니다. 0에 가까울수록 보존 성능이 좋습니다.'
  },
  lyapStat: {
    en: 'Largest Lyapunov estimate from nearby trajectories. A stable positive value is evidence of chaos.',
    ko: '인접 궤적에서 구한 최대 랴푸노프 지수입니다. 안정적인 양수 값은 카오스의 근거입니다.'
  },
  verdict: {
    en: 'A concise interpretation assembled from the live numerical and chaos diagnostics.',
    ko: '실시간 수치 및 카오스 진단을 종합한 간단한 해석입니다.'
  },
  dPhys: {
    en: 'Time spent advancing the physical model during the latest diagnostic sample.',
    ko: '최근 진단 표본에서 물리 모델 계산에 사용한 시간입니다.'
  },
  dRender: {
    en: 'Time spent drawing the current simulation frame.',
    ko: '현재 시뮬레이션 프레임을 그리는 데 사용한 시간입니다.'
  },
  dWorker: {
    en: 'Time attributed to background worker computation.',
    ko: '백그라운드 워커 계산에 사용된 시간입니다.'
  },
  dHash: {
    en: 'Compact state fingerprint used to compare and reproduce an exact simulation state.',
    ko: '정확한 시뮬레이션 상태를 비교하고 재현하는 압축 상태 지문입니다.'
  },
  dTimeDebt: {
    en: 'Real time that the simulation still needs to catch up after a slow frame.',
    ko: '느린 프레임 뒤 시뮬레이션이 따라잡아야 할 실제 시간입니다.'
  },
  dDroppedTime: {
    en: 'Elapsed time intentionally skipped after exceeding the safe catch-up budget.',
    ko: '안전한 따라잡기 한도를 넘은 뒤 의도적으로 건너뛴 경과 시간입니다.'
  }
};

let activeAnchor: HTMLElement | null = null;
let keyboardNavigation = false;

function tooltip(): HTMLElement {
  let element = document.getElementById(TOOLTIP_ID);
  if (element) return element;
  element = document.createElement('div');
  element.id = TOOLTIP_ID;
  element.className = 'context-tooltip';
  element.setAttribute('role', 'tooltip');
  element.hidden = true;
  document.body.append(element);
  return element;
}

function helpText(anchor: HTMLElement): string {
  const key = anchor.dataset.helpKey;
  const copy = key ? HELP_BY_ID[key] : undefined;
  if (copy) return document.documentElement.lang.toLowerCase().startsWith('ko') ? copy.ko : copy.en;
  return anchor.dataset.help ?? anchor.dataset.tip ?? '';
}

function position(anchor: HTMLElement, popup: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const left = Math.min(
    Math.max(viewportLeft + 12, anchorRect.left + anchorRect.width / 2 - popupRect.width / 2),
    viewportRight - popupRect.width - 12
  );
  const below = anchorRect.bottom + 9;
  const top =
    below + popupRect.height <= viewportBottom - 10
      ? Math.max(viewportTop + 10, below)
      : Math.max(viewportTop + 10, anchorRect.top - popupRect.height - 9);
  popup.style.left = `${left.toFixed(1)}px`;
  popup.style.top = `${top.toFixed(1)}px`;
}

function show(anchor: HTMLElement): void {
  if (anchor.matches('.custom-select-button[aria-expanded="true"]')) {
    hide();
    return;
  }
  const text = helpText(anchor);
  if (!text) return;
  if (activeAnchor && activeAnchor !== anchor) hide(activeAnchor);
  const popup = tooltip();
  activeAnchor = anchor;
  popup.textContent = text;
  popup.hidden = false;
  const descriptionIds = new Set((anchor.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  descriptionIds.add(TOOLTIP_ID);
  anchor.setAttribute('aria-describedby', Array.from(descriptionIds).join(' '));
  requestAnimationFrame(() => {
    if (activeAnchor === anchor && !popup.hidden) position(anchor, popup);
  });
}

function hide(anchor?: HTMLElement): void {
  if (anchor && activeAnchor !== anchor) return;
  const popup = document.getElementById(TOOLTIP_ID);
  if (activeAnchor) {
    const descriptionIds = (activeAnchor.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== TOOLTIP_ID);
    if (descriptionIds.length > 0) activeAnchor.setAttribute('aria-describedby', descriptionIds.join(' '));
    else activeAnchor.removeAttribute('aria-describedby');
  }
  activeAnchor = null;
  if (popup) popup.hidden = true;
}

function enhance(root: ParentNode = document): void {
  for (const id of Object.keys(HELP_BY_ID)) {
    const base = root instanceof HTMLElement && root.id === id ? root : root.querySelector<HTMLElement>(`#${id}`);
    if (!base) continue;
    const anchor = base.matches('.sval,.diag-val')
      ? (base.closest<HTMLElement>('.srow,.diag-row > span') ?? base)
      : base;
    anchor.dataset.helpKey ??= id;
  }
  root.querySelectorAll<HTMLElement>('[data-help],.has-tip[data-tip]').forEach((element) => {
    element.classList.add('context-help-anchor');
    if (element instanceof HTMLCanvasElement && element.tabIndex < 0) element.tabIndex = 0;
  });
  const selectHosts = [
    ...(root instanceof HTMLElement && root.matches('.custom-select-host') ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>('.custom-select-host'))
  ];
  selectHosts.forEach((host) => {
    const native = host.querySelector<HTMLSelectElement>('select');
    const button = host.querySelector<HTMLButtonElement>('.custom-select-button');
    const helpCopy = native ? HELP_BY_ID[native.id] : undefined;
    const text = native ? (native.dataset.help ?? native.title) : '';
    if (!button || (!helpCopy && !text)) return;
    if (helpCopy && native) button.dataset.helpKey = native.id;
    else button.dataset.help = text;
    button.classList.add('context-help-anchor');
  });
  if (root instanceof HTMLElement && (root.dataset.help || (root.classList.contains('has-tip') && root.dataset.tip))) {
    root.classList.add('context-help-anchor');
  }
}

function anchorFrom(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('.context-help-anchor') : null;
}

/** Install one collision-aware tooltip surface for controls, terminology, and graphs. */
export function installContextualHelp(): void {
  enhance();
  document.addEventListener(
    'pointerdown',
    () => {
      keyboardNavigation = false;
    },
    { capture: true }
  );
  document.addEventListener('pointerover', (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    show(anchor);
  });
  document.addEventListener('pointerout', (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    hide(anchor);
  });
  document.addEventListener('focusin', (event) => {
    const anchor = anchorFrom(event.target);
    if (anchor && keyboardNavigation) show(anchor);
  });
  document.addEventListener('focusout', (event) => {
    const anchor = anchorFrom(event.target);
    if (anchor) hide(anchor);
  });
  document.addEventListener('click', (event) => {
    const anchor = anchorFrom(event.target);
    if (anchor?.matches('.custom-select-button')) hide();
  });
  document.addEventListener('keydown', (event) => {
    if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      keyboardNavigation = true;
    }
    const anchor = anchorFrom(event.target);
    if (anchor?.matches('.custom-select-button')) hide();
    if (event.key === 'Escape' && activeAnchor) hide();
  });
  window.addEventListener('scroll', () => hide(), { capture: true, passive: true });
  window.addEventListener('resize', () => hide(), { passive: true });
  window.visualViewport?.addEventListener('scroll', () => hide(), { passive: true });
  window.visualViewport?.addEventListener('resize', () => hide(), { passive: true });
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) enhance(node);
  }).observe(document.body, { childList: true, subtree: true });
}
