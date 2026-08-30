import { installAdoptedStyle } from '../ui/adoptedStyles';

const STYLE_ID = 'education-cards-style';

interface FirstExperimentSpec {
  id: string;
  preset: string;
  title: { en: string; ko: string };
  question: { en: string; ko: string };
  observe: { en: string; ko: string };
}

export const FIRST_EXPERIMENTS: readonly FirstExperimentSpec[] = [
  {
    id: 'period',
    preset: 'periodic',
    title: { en: 'Measure a period', ko: '주기 측정하기' },
    question: { en: 'When does the motion repeat?', ko: '운동은 언제 다시 반복될까요?' },
    observe: { en: 'Watch the phase loop close.', ko: '위상 궤적이 닫히는지 관찰하세요.' }
  },
  {
    id: 'energy',
    preset: 'symmetric',
    title: { en: 'Check energy', ko: '에너지 확인하기' },
    question: { en: 'Does total energy stay constant?', ko: '전체 에너지는 일정하게 유지될까요?' },
    observe: { en: 'Compare E with ΔE/E₀.', ko: 'E와 ΔE/E₀를 함께 비교하세요.' }
  },
  {
    id: 'chaos',
    preset: 'chaotic',
    title: { en: 'Find sensitivity', ko: '민감도 찾아보기' },
    question: { en: 'Can a tiny change reshape the path?', ko: '아주 작은 변화가 궤적을 바꿀까요?' },
    observe: { en: 'Replay, perturb θ₁, then compare.', ko: '재생 후 θ₁을 조금 바꾸어 비교하세요.' }
  }
];

export interface EducationCardSpec {
  tab: string;
  title: { en: string; ko: string };
  question: { en: string; ko: string };
  method: { en: string; ko: string };
  measurement: { en: string; ko: string };
  interpretation: { en: string; ko: string };
  caveat: { en: string; ko: string };
  evidenceHref: string;
  preset: string;
  action: { en: string; ko: string };
}

export const EDUCATION_CARDS: readonly EducationCardSpec[] = [
  {
    tab: 'lyap',
    title: { en: 'Nearby-trajectory separation', ko: '가까운 궤적의 분리' },
    question: { en: 'How fast do nearby trajectories separate?', ko: '가까운 궤적은 얼마나 빨리 멀어질까요?' },
    method: {
      en: 'Advance and renormalize one tangent direction.',
      ko: '접선 방향 하나를 진화시키고 정규화합니다.'
    },
    measurement: { en: 'Largest finite-time Lyapunov exponent λ₁ (s⁻¹).', ko: '최대 유한시간 랴푸노프 지수 λ₁ (s⁻¹).' },
    interpretation: {
      en: 'Positive λ₁ means small errors e-fold in 1/λ₁.',
      ko: '양의 λ₁은 작은 오차의 e배 시간 1/λ₁을 뜻합니다.'
    },
    caveat: {
      en: 'Horizon, dt, transient, and renormalization bound the result.',
      ko: '시간 구간, dt, 과도구간, 정규화가 결과 범위를 정합니다.'
    },
    evidenceHref: '?tab=theory#theory-chaos-lyapunov',
    preset: 'chaotic',
    action: { en: 'Run chaotic preset', ko: '혼돈 프리셋 실행' }
  },
  {
    tab: 'compare',
    title: { en: 'Integrator comparison', ko: '적분기 비교' },
    question: { en: 'How much does the numerical method change the answer?', ko: '수치 방법이 답을 얼마나 바꿀까요?' },
    method: {
      en: 'Run one start with several integrators.',
      ko: '한 초기 상태를 여러 적분기로 실행합니다.'
    },
    measurement: {
      en: 'State mismatch and energy drift over one horizon.',
      ko: '한 시간 구간의 상태 불일치와 에너지 오차.'
    },
    interpretation: {
      en: 'dt-refinement agreement outweighs one attractive curve.',
      ko: 'dt 정제 일치는 보기 좋은 곡선 하나보다 강한 근거입니다.'
    },
    caveat: {
      en: 'Chaotic paths need not match pointwise at long horizons.',
      ko: '혼돈 궤적은 장시간에 점별로 일치할 필요가 없습니다.'
    },
    evidenceHref: '?tab=validate#runConvergence',
    preset: 'symmetric',
    action: { en: 'Start one comparison', ko: '비교 시작' }
  },
  {
    tab: 'sweep',
    title: { en: 'Chaos map', ko: '혼돈 지도' },
    question: {
      en: 'Where in parameter space does sensitive motion appear?',
      ko: '매개변수 공간의 어디에서 민감한 운동이 나타날까요?'
    },
    method: {
      en: 'Repeat one finite-time diagnostic on a parameter grid.',
      ko: '매개변수 격자에서 유한시간 진단을 반복합니다.'
    },
    measurement: { en: 'One λ₁ estimate for each sampled cell.', ko: '표본 셀마다 하나의 λ₁ 추정값.' },
    interpretation: {
      en: 'Trust regions that persist across nearby cells.',
      ko: '인접 셀에서도 이어지는 영역을 신뢰하세요.'
    },
    caveat: {
      en: 'Resolution and horizon can shift apparent boundaries.',
      ko: '해상도와 시간 구간이 겉보기 경계를 바꿀 수 있습니다.'
    },
    evidenceHref: '?tab=validate#runConvergence',
    preset: 'butterfly',
    action: { en: 'Seed from butterfly', ko: '버터플라이로 시작' }
  },
  {
    tab: 'bifurc',
    title: { en: 'Bifurcation diagram', ko: '분기 다이어그램' },
    question: {
      en: 'What changes when a control parameter is varied?',
      ko: '제어 매개변수를 바꾸면 무엇이 달라질까요?'
    },
    method: {
      en: 'Sweep a control, discard transients, sample a section.',
      ko: '제어값을 스윕하고 과도구간을 버린 뒤 단면을 표본화합니다.'
    },
    measurement: {
      en: 'Long-time branches against the control value.',
      ko: '제어값에 따른 장시간 분기.'
    },
    interpretation: {
      en: 'A branch split marks a change worth refining.',
      ko: '분기 갈라짐은 정제할 가치가 있는 변화를 뜻합니다.'
    },
    caveat: {
      en: 'Discard, phase, and resolution affect visible branches.',
      ko: '과도구간, 표본 위상, 해상도가 보이는 분기에 영향을 줍니다.'
    },
    evidenceHref: '?tab=theory#theory-bifurcation',
    preset: 'periodic',
    action: { en: 'Start periodic baseline', ko: '주기 기준 실행' }
  },
  {
    tab: 'zeroone',
    title: { en: '0–1 test', ko: '0–1 검정' },
    question: {
      en: 'Does one observed signal behave regularly or chaotically?',
      ko: '관측 신호 하나가 규칙적일까요, 혼돈적일까요?'
    },
    method: {
      en: 'Transform one series and measure displacement growth.',
      ko: '시계열 하나를 변환해 변위 증가를 측정합니다.'
    },
    measurement: { en: 'K near 0 (regular) or 1 (chaotic).', ko: '0에 가까운 K(규칙) 또는 1에 가까운 K(혼돈).' },
    interpretation: {
      en: 'Use K beside trajectory and Lyapunov evidence.',
      ko: 'K를 궤적 및 랴푸노프 근거와 함께 사용합니다.'
    },
    caveat: {
      en: 'Short, noisy, resonant, or oversampled data can mislead.',
      ko: '짧거나 잡음·공명·과표본화된 자료는 오도할 수 있습니다.'
    },
    evidenceHref: '?tab=theory#theory-chaos-lyapunov',
    preset: 'chaotic',
    action: { en: 'Compare K on chaos', ko: '혼돈에서 K 비교' }
  },
  {
    tab: 'rqa',
    title: { en: 'Recurrence structure', ko: '재귀 구조' },
    question: {
      en: 'When does the system return near an earlier state?',
      ko: '계는 언제 이전 상태 근처로 돌아올까요?'
    },
    method: {
      en: 'Embed a signal and compare state-space distances.',
      ko: '신호를 임베딩하고 상태공간 거리를 비교합니다.'
    },
    measurement: { en: 'Recurrence rate and diagonal statistics.', ko: '재귀율과 대각선 통계.' },
    interpretation: {
      en: 'Long diagonals suggest repeatable evolution, not a verdict.',
      ko: '긴 대각선은 반복 진화를 시사하지만 결론은 아닙니다.'
    },
    caveat: {
      en: 'Embedding, threshold, and sampling define the measure.',
      ko: '임베딩, 임계값, 표본화가 측정을 정의합니다.'
    },
    evidenceHref: '?tab=theory#theory-recurrence',
    preset: 'symmetric',
    action: { en: 'Try symmetric orbit', ko: '대칭 궤도 실행' }
  },
  {
    tab: 'ftle',
    title: { en: 'Finite-time transport', ko: '유한시간 수송' },
    question: {
      en: 'Which nearby starts separate most over this horizon?',
      ko: '이 시간 구간에서 어떤 가까운 시작이 가장 빨리 분리될까요?'
    },
    method: {
      en: 'Evolve grid deformation and extract maximum stretch.',
      ko: '격자 변형을 진화시키고 최대 늘어남을 추출합니다.'
    },
    measurement: { en: 'Finite-time exponent field with ridges.', ko: '능선을 포함한 유한시간 지수 장.' },
    interpretation: {
      en: 'Persistent ridges suggest finite-horizon barriers.',
      ko: '지속적인 능선은 유한시간 장벽을 시사합니다.'
    },
    caveat: {
      en: 'Horizon, grid, differencing, and direction affect ridges.',
      ko: '시간 구간, 격자, 차분, 적분 방향이 능선에 영향을 줍니다.'
    },
    evidenceHref: '?tab=validate#runConvergence',
    preset: 'chaotic',
    action: { en: 'Run ridge preset', ko: '능선 프리셋 실행' }
  }
];

function css(): string {
  return `
.education-card{margin:0 0 12px;padding:12px 14px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-left:2px solid var(--workbench-info,#7ca8f6);border-radius:8px;background:var(--workbench-panel,#10141f);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}
.education-card strong{display:block;color:var(--fg-bright);font-size:13px;margin-bottom:3px}
.education-card span{display:block;color:var(--text);font-size:12px;line-height:1.45}
.education-card button{white-space:nowrap}
.education-question{margin:4px 0 9px;color:var(--workbench-text,#f1f3f8)!important;font-weight:600}
.education-path{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none}.education-path li{padding:7px;border-radius:6px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text-secondary,#a8b0c2);font-size:9.5px;line-height:1.4}.education-path b{display:block;margin-bottom:3px;color:var(--workbench-live,#72d6e5);font-size:8.5px;text-transform:uppercase;letter-spacing:.06em}.education-evidence{display:inline-block;margin-top:8px;color:var(--workbench-live,#72d6e5);font-size:9.5px}
.first-experiments{margin:0 0 12px;padding:12px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:12px;background:var(--workbench-panel,#10141f);box-shadow:0 16px 38px rgba(0,0,0,.14)}
.first-experiments-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:0 2px 10px}
.first-experiments-head strong{color:var(--workbench-text,#f1f3f8);font-size:12px;letter-spacing:.01em}
.first-experiments-head span{color:var(--workbench-text-muted,#737e92);font-size:10px}
.first-experiments-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.first-experiment{min-width:0;padding:11px 12px;text-align:left;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:9px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text-secondary,#a8b0c2);transition:transform 150ms cubic-bezier(.2,.8,.2,1),border-color 150ms cubic-bezier(.2,.8,.2,1),background 150ms cubic-bezier(.2,.8,.2,1)}
.first-experiment:hover,.first-experiment:focus-visible{transform:translateY(-1px);border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d)}
.first-experiment[aria-pressed="true"]{border-color:var(--workbench-live,#72d6e5);box-shadow:inset 2px 0 0 var(--workbench-live,#72d6e5)}
.first-experiment strong,.first-experiment span,.first-experiment small{display:block}
.first-experiment strong{margin-bottom:4px;color:var(--workbench-text,#f1f3f8);font-size:12px}
.first-experiment span{font-size:10.5px;line-height:1.4}
.first-experiment small{margin-top:7px;color:var(--workbench-text-muted,#737e92);font:9.5px/1.35 var(--font-mono,monospace)}
.first-experiment-status{min-height:1.3em;margin:9px 2px 0;color:var(--workbench-live,#72d6e5);font-size:10px}
body.audience-research .first-experiments{display:none}
@media(max-width:900px){.education-path{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.first-experiments-grid{grid-template-columns:1fr}.first-experiments-head{align-items:start;flex-direction:column;gap:3px}.education-path{grid-template-columns:1fr}}
@media(max-width:560px){.education-card{grid-template-columns:1fr}.education-card button{justify-self:start}.first-experiments{padding:10px}.first-experiment{min-height:64px}}
@media(prefers-reduced-motion:reduce){.first-experiment{transition:none}.first-experiment:hover{transform:none}}
`;
}

function runCard(spec: EducationCardSpec): void {
  document.querySelector<HTMLElement>(`[data-preset="${spec.preset}"]`)?.click();
  document.querySelector<HTMLElement>(`.tab[data-tab="${spec.tab}"]`)?.click();
}

function createCard(spec: EducationCardSpec): HTMLElement {
  const card = document.createElement('section');
  card.className = 'education-card';
  card.dataset.educationCard = spec.tab;
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.dataset.copy = 'title';
  const question = document.createElement('span');
  question.className = 'education-question';
  question.dataset.copy = 'question';
  const path = document.createElement('ol');
  path.className = 'education-path';
  for (const key of ['method', 'measurement', 'interpretation', 'caveat'] as const) {
    const item = document.createElement('li');
    item.dataset.copy = key;
    const heading = document.createElement('b');
    heading.dataset.copyHeading = key;
    item.append(heading, document.createElement('span'));
    path.append(item);
  }
  const evidence = document.createElement('a');
  evidence.className = 'education-evidence';
  evidence.href = spec.evidenceHref;
  evidence.dataset.copy = 'evidence';
  copy.append(title, question, path, evidence);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.copy = 'action';
  button.addEventListener('click', () => runCard(spec));
  card.append(copy, button);
  localizeEducationCard(card, spec);
  return card;
}

function localizeEducationCard(card: HTMLElement, spec: EducationCardSpec): void {
  const locale = document.documentElement.lang === 'ko' ? 'ko' : 'en';
  const text = (selector: string, value: string) => {
    const element = card.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  };
  text('[data-copy="title"]', spec.title[locale]);
  text('[data-copy="question"]', spec.question[locale]);
  const headings =
    locale === 'ko'
      ? { method: '방법', measurement: '측정', interpretation: '해석', caveat: '신뢰 조건' }
      : { method: 'Method', measurement: 'Measurement', interpretation: 'Interpretation', caveat: 'Trust condition' };
  for (const key of ['method', 'measurement', 'interpretation', 'caveat'] as const) {
    text(`[data-copy-heading="${key}"]`, headings[key]);
    text(`[data-copy="${key}"] span`, spec[key][locale]);
  }
  text('[data-copy="evidence"]', locale === 'ko' ? '이론 · 가정 · 근거 열기' : 'Open theory · assumptions · evidence');
  text('[data-copy="action"]', spec.action[locale]);
  card.querySelector('button')?.setAttribute('aria-label', `${spec.action[locale]}: ${spec.title[locale]}`);
}

function localizeFirstExperiments(root: HTMLElement): void {
  const locale = document.documentElement.lang === 'ko' ? 'ko' : 'en';
  const heading = root.querySelector<HTMLElement>('[data-first-heading]');
  const hint = root.querySelector<HTMLElement>('[data-first-hint]');
  if (heading) heading.textContent = locale === 'ko' ? '첫 10분 실험' : 'Your first 10 minutes';
  if (hint)
    hint.textContent = locale === 'ko' ? '질문 하나를 골라 바로 관찰해 보세요.' : 'Choose one question and observe.';
  for (const spec of FIRST_EXPERIMENTS) {
    const button = root.querySelector<HTMLButtonElement>(`[data-first-experiment="${spec.id}"]`);
    if (!button) continue;
    const title = button.querySelector('strong');
    const question = button.querySelector('span');
    const observe = button.querySelector('small');
    if (title) title.textContent = spec.title[locale];
    if (question) question.textContent = spec.question[locale];
    if (observe) observe.textContent = spec.observe[locale];
    button.setAttribute('aria-label', `${spec.title[locale]}: ${spec.question[locale]}`);
  }
}

function installFirstExperiments(): void {
  const presets = document.querySelector<HTMLElement>('.presets');
  if (!presets || document.querySelector('.first-experiments')) return;
  const root = document.createElement('section');
  root.className = 'first-experiments';
  root.setAttribute('aria-labelledby', 'firstExperimentsTitle');
  const head = document.createElement('div');
  head.className = 'first-experiments-head';
  const title = document.createElement('strong');
  title.id = 'firstExperimentsTitle';
  title.dataset.firstHeading = '';
  const hint = document.createElement('span');
  hint.dataset.firstHint = '';
  head.append(title, hint);
  const grid = document.createElement('div');
  grid.className = 'first-experiments-grid';
  const status = document.createElement('div');
  status.className = 'first-experiment-status';
  status.id = 'firstExperimentStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  for (const spec of FIRST_EXPERIMENTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'first-experiment';
    button.dataset.firstExperiment = spec.id;
    button.setAttribute('aria-pressed', 'false');
    button.append(document.createElement('strong'), document.createElement('span'), document.createElement('small'));
    button.addEventListener('click', () => {
      document
        .querySelectorAll<HTMLElement>('[data-first-experiment]')
        .forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      document.querySelector<HTMLElement>(`[data-preset="${spec.preset}"]`)?.click();
      document.querySelector<HTMLElement>('.tab[data-tab="lab"]')?.click();
      const locale = document.documentElement.lang === 'ko' ? 'ko' : 'en';
      status.textContent =
        locale === 'ko'
          ? `${spec.title.ko} 설정을 불러왔습니다. 실행을 관찰한 뒤 근거를 설명해 보세요.`
          : `${spec.title.en} is ready. Observe the run, then explain the evidence.`;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      document.getElementById('main')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
    grid.append(button);
  }
  root.append(head, grid, status);
  presets.after(root);
  localizeFirstExperiments(root);
  document.addEventListener('pendulum:ui-locale-changed', () => localizeFirstExperiments(root));
}

export function installEducationCards(): void {
  if (typeof document === 'undefined') return;
  installAdoptedStyle(STYLE_ID, css());
  for (const spec of EDUCATION_CARDS) {
    const panel = document.getElementById(`tab-${spec.tab}`);
    if (!panel || panel.querySelector(`[data-education-card="${spec.tab}"]`)) continue;
    panel.prepend(createCard(spec));
  }
  document.addEventListener('pendulum:ui-locale-changed', () => {
    for (const spec of EDUCATION_CARDS) {
      const card = document.querySelector<HTMLElement>(`[data-education-card="${spec.tab}"]`);
      if (card) localizeEducationCard(card, spec);
    }
  });
  installFirstExperiments();
}
