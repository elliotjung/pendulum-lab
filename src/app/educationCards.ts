import { installAdoptedStyle } from '../ui/adoptedStyles';

const STYLE_ID = 'education-cards-style';

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
.education-card{margin:0 0 12px;padding:12px 14px;border:1px solid var(--divider);border-left:2px solid var(--cyan);border-radius:8px;background:linear-gradient(90deg,rgba(30,227,255,.07),rgba(255,255,255,.02));display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
.education-card strong{display:block;color:var(--fg-bright);font-size:13px;margin-bottom:3px}
.education-card span{display:block;color:var(--text);font-size:12px;line-height:1.45}
.education-card button{white-space:nowrap}
@media(max-width:560px){.education-card{grid-template-columns:1fr}.education-card button{justify-self:start}}
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

export function installEducationCards(): void {
  if (typeof document === 'undefined') return;
  installAdoptedStyle(STYLE_ID, css());
  for (const spec of EDUCATION_CARDS) {
    const panel = document.getElementById(`tab-${spec.tab}`);
    if (!panel || panel.querySelector(`[data-education-card="${spec.tab}"]`)) continue;
    panel.prepend(createCard(spec));
  }
}
