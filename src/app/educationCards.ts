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
  title: string;
  body: string;
  preset: string;
  action: string;
}

export const EDUCATION_CARDS: readonly EducationCardSpec[] = [
  {
    tab: 'lyap',
    title: 'Lyapunov exponent',
    body: 'Positive values mean nearby starts separate exponentially; compare chaotic and periodic presets before quoting the number.',
    preset: 'chaotic',
    action: 'Run chaotic preset'
  },
  {
    tab: 'sweep',
    title: 'Chaos map',
    body: 'Each cell is a finite-time experiment. Look for regions, not isolated pixels, before calling a parameter range chaotic.',
    preset: 'butterfly',
    action: 'Seed from butterfly'
  },
  {
    tab: 'bifurc',
    title: 'Bifurcation diagram',
    body: 'A single branch splitting into two is the experiment signal; rerun near the split with tighter steps for evidence.',
    preset: 'periodic',
    action: 'Start periodic baseline'
  },
  {
    tab: 'zeroone',
    title: '0-1 test',
    body: 'K near zero behaves regular, K near one behaves chaotic; use it as a corroborating test beside Lyapunov evidence.',
    preset: 'chaotic',
    action: 'Compare K on chaos'
  },
  {
    tab: 'rqa',
    title: 'Recurrence plot',
    body: 'Long diagonals indicate repeated structure; scattered texture points to sensitive, low-repeat dynamics.',
    preset: 'symmetric',
    action: 'Try symmetric orbit'
  },
  {
    tab: 'ftle',
    title: 'FTLE field',
    body: 'Bright ridges are finite-horizon transport barriers; treat them as field evidence tied to the selected horizon.',
    preset: 'chaotic',
    action: 'Run ridge preset'
  }
];

function css(): string {
  return `
.education-card{margin:0 0 12px;padding:12px 14px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-left:2px solid var(--workbench-info,#7ca8f6);border-radius:8px;background:var(--workbench-panel,#10141f);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
.education-card strong{display:block;color:var(--fg-bright);font-size:13px;margin-bottom:3px}
.education-card span{display:block;color:var(--text);font-size:12px;line-height:1.45}
.education-card button{white-space:nowrap}
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
@media(max-width:760px){.first-experiments-grid{grid-template-columns:1fr}.first-experiments-head{align-items:start;flex-direction:column;gap:3px}}
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
  title.textContent = spec.title;
  const body = document.createElement('span');
  body.textContent = spec.body;
  copy.append(title, body);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = spec.action;
  button.setAttribute('aria-label', `${spec.action}: ${spec.title}`);
  button.addEventListener('click', () => runCard(spec));
  card.append(copy, button);
  return card;
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
  installFirstExperiments();
}
