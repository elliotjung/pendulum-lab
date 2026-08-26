import { installAdoptedStyle } from '../ui/adoptedStyles';
import { compareDoublePendulumFormulations } from '../validation/formulationEquivalence';
import { TabController } from './TabController';
import {
  THEORY_OVERVIEW,
  THEORY_SECTIONS,
  normalizeTheoryLocale,
  theoryText,
  type TheoryLocale,
  type TheorySection,
  type TheorySectionId
} from './theoryContent';
import { THEORY_LINKS, type TheoryLink } from './theoryLinks';
import { geometryFigureElement } from './theoryGeometryFigure';
import { openTrustDrawer } from './trustDrawer';

export const THEORY_CONTENT_HOST_ID = 'theoryContent';
const THEORY_STYLE_ID = 'theory-tab-style';

function styles(): string {
  return `
.theory-workspace{max-width:1040px;margin:0 auto;padding:clamp(14px,2vw,26px);color:var(--workbench-text-secondary,#a8b0c2)}
.theory-hero{display:grid;gap:9px;padding:clamp(18px,3vw,30px);border:1px solid var(--workbench-border,rgba(205,214,245,.1));border-radius:16px;background:linear-gradient(145deg,var(--workbench-panel,#10141f),var(--workbench-raised,#0b0e17));box-shadow:0 22px 50px rgba(0,0,0,.16)}
.theory-eyebrow,.theory-step{font:650 10px/1.3 var(--font-mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--workbench-live,#72d6e5)}
.theory-title{margin:0;color:var(--workbench-text,#f1f3f8);font:700 clamp(24px,4vw,42px)/1.05 var(--font-sans,system-ui)}
.theory-lead,.theory-scope{max-width:76ch;margin:0;line-height:1.6}.theory-lead{font-size:14px;color:var(--workbench-text-secondary,#a8b0c2)}.theory-scope{font-size:11px;color:var(--workbench-text-muted,#737e92)}
.theory-model-compare{display:grid;gap:12px;margin:16px 0;padding:16px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.16));border-radius:14px;background:var(--workbench-panel,#10141f)}.theory-model-head{display:grid;gap:5px}.theory-model-title{margin:0;color:var(--workbench-text,#f1f3f8);font:650 16px/1.35 var(--font-sans,system-ui)}.theory-model-copy{max-width:82ch;margin:0;color:var(--workbench-text-muted,#737e92);font-size:11px;line-height:1.55}.theory-model-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.theory-model-card{display:grid;gap:9px;align-content:start;padding:13px;border:1px solid var(--workbench-border,rgba(205,214,245,.1));border-radius:10px;background:var(--workbench-raised,#0b0e17)}.theory-model-card h4{margin:0;color:var(--workbench-text,#f1f3f8);font:650 13px/1.35 var(--font-sans,system-ui)}.theory-model-card p{margin:0;color:var(--workbench-text-secondary,#a8b0c2);font-size:11px;line-height:1.55}.theory-model-facts{display:grid;gap:5px;margin:0;padding-left:18px;color:var(--workbench-text-muted,#737e92);font-size:10px;line-height:1.5}.theory-model-select{justify-self:start;min-height:38px;padding:7px 11px;border:1px solid color-mix(in srgb,var(--workbench-live,#72d6e5) 48%,transparent);border-radius:8px;background:color-mix(in srgb,var(--workbench-live,#72d6e5) 10%,var(--workbench-raised,#0b0e17));color:var(--workbench-text,#f1f3f8);font-weight:650}
.theory-compare{display:grid;gap:14px;margin:16px 0;padding:16px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.16));border-radius:14px;background:var(--workbench-panel,#10141f)}.theory-compare-head{display:grid;gap:5px}.theory-compare-title{margin:0;color:var(--workbench-text,#f1f3f8);font:650 16px/1.35 var(--font-sans,system-ui)}.theory-compare-copy,.theory-compare-note{max-width:82ch;margin:0;font-size:11px;line-height:1.55;color:var(--workbench-text-muted,#737e92)}
.theory-compare-controls{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.theory-compare-field{display:grid;gap:5px;min-width:130px;font:600 10px/1.3 var(--font-mono,monospace);color:var(--workbench-text-muted,#737e92)}.theory-compare-field input,.theory-compare-field select{width:100%;min-height:38px;padding:7px 9px;border:1px solid var(--workbench-border,rgba(205,214,245,.12));border-radius:8px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text,#f1f3f8);font:12px/1.3 var(--font-mono,monospace)}.theory-compare-run{min-height:38px;padding:7px 13px;border:1px solid color-mix(in srgb,var(--workbench-live,#72d6e5) 48%,transparent);border-radius:8px;background:color-mix(in srgb,var(--workbench-live,#72d6e5) 12%,var(--workbench-raised,#0b0e17));color:var(--workbench-text,#f1f3f8);font-weight:650}.theory-compare-run:disabled{opacity:.58;cursor:wait}
.theory-compare-status{margin:0;padding:9px 11px;border-radius:8px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text-secondary,#a8b0c2);font:600 11px/1.45 var(--font-mono,monospace)}.theory-compare-status[data-verdict="agreement"]{color:var(--workbench-success,#70db9b)}.theory-compare-status[data-verdict="review"]{color:var(--workbench-warning,#f6c96a)}.theory-compare-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}.theory-compare-metric{display:grid;gap:4px;padding:10px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-raised,#0b0e17)}.theory-compare-metric dt{font-size:9px;line-height:1.35;color:var(--workbench-text-muted,#737e92)}.theory-compare-metric dd{margin:0;color:var(--workbench-text,#f1f3f8);font:600 11px/1.4 var(--font-mono,monospace)}
.theory-compare-states{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.theory-state-card{display:grid;gap:7px;padding:11px;border:1px solid var(--workbench-border,rgba(205,214,245,.1));border-radius:9px;background:var(--workbench-raised,#0b0e17)}.theory-state-card h4{margin:0;color:var(--workbench-text,#f1f3f8);font:650 11px/1.35 var(--font-sans,system-ui)}.theory-state-card p{margin:0;color:var(--workbench-text-muted,#737e92);font-size:9px;line-height:1.45}.theory-state-card code{white-space:pre-wrap;color:var(--workbench-live,#72d6e5);font:11px/1.55 var(--font-mono,monospace)}
.theory-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 10px}.theory-toolbar-label{font:650 11px/1.3 var(--font-mono,monospace);color:var(--workbench-text-muted,#737e92)}
.theory-toggle-all{min-height:38px;padding:7px 11px;border:1px solid var(--workbench-border,rgba(205,214,245,.1));border-radius:8px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text,#f1f3f8)}
.theory-outline{margin:0 0 16px;padding:12px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:12px;background:var(--workbench-panel,#10141f)}
.theory-outline-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none}.theory-outline a{display:flex;gap:7px;align-items:baseline;padding:7px 8px;border-radius:7px;color:var(--workbench-text-secondary,#a8b0c2);text-decoration:none}.theory-outline a:hover,.theory-outline a:focus-visible{background:var(--workbench-selected,#242a3d);color:var(--workbench-text,#f1f3f8)}
.theory-outline-index{color:var(--workbench-live,#72d6e5);font:600 9px/1.2 var(--font-mono,monospace)}
.theory-sections{display:grid;gap:10px}.theory-section{scroll-margin-top:84px;border:1px solid var(--workbench-border,rgba(205,214,245,.09));border-radius:12px;background:var(--workbench-panel,#10141f);overflow:clip}.theory-section[open]{border-color:var(--workbench-border-strong,rgba(205,214,245,.16));box-shadow:0 14px 34px rgba(0,0,0,.11)}
.theory-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:15px 16px;cursor:pointer;list-style:none}.theory-summary::-webkit-details-marker{display:none}.theory-summary::after{content:'+';font:500 18px/1 var(--font-mono,monospace);color:var(--workbench-text-muted,#737e92)}.theory-section[open]>.theory-summary::after{content:'−'}
.theory-summary-copy{display:grid;gap:3px}.theory-section-title{color:var(--workbench-text,#f1f3f8);font:650 15px/1.35 var(--font-sans,system-ui)}.theory-section-summary{font-size:11px;line-height:1.45;color:var(--workbench-text-muted,#737e92)}
.theory-section-body{display:grid;gap:13px;padding:0 16px 18px 54px;border-top:1px solid var(--workbench-border,rgba(205,214,245,.07))}.theory-paragraphs{display:grid;gap:9px;margin-top:15px}.theory-paragraphs p{max-width:82ch;margin:0;line-height:1.65}
.theory-geometry-figure{display:grid;gap:8px;margin:0;padding:12px;border:1px solid var(--workbench-border,rgba(205,214,245,.1));border-radius:10px;background:var(--workbench-raised,#0b0e17)}.theory-geometry-figure svg{display:block;width:100%;height:auto;max-height:300px;color:var(--workbench-text-secondary,#a8b0c2)}.theory-geometry-figure figcaption{color:var(--workbench-text-muted,#737e92);font-size:10px;line-height:1.5}.theory-geometry-axis{stroke:currentColor;stroke-dasharray:5 6;opacity:.45}.theory-geometry-link{stroke:var(--workbench-info,#7ca8f6);stroke-width:7;stroke-linecap:round}.theory-geometry-bob{fill:var(--workbench-live,#72d6e5);stroke:var(--workbench-panel,#10141f);stroke-width:4}.theory-geometry-label{fill:currentColor;font:600 16px var(--font-mono,monospace)}.theory-geometry-angle{fill:none;stroke:var(--workbench-warning,#f6c96a);stroke-width:3}
.theory-equations{display:grid;gap:9px}.theory-equation{margin:0;padding:12px 13px;border-left:2px solid var(--workbench-info,#7ca8f6);border-radius:8px;background:var(--workbench-raised,#0b0e17)}.theory-equation figcaption{margin-bottom:8px;color:var(--workbench-text,#f1f3f8);font:650 11px/1.35 var(--font-sans,system-ui)}.theory-equation pre{max-width:100%;margin:0;overflow:auto;padding:10px;border-radius:6px;background:rgba(0,0,0,.2)}.theory-equation code{white-space:pre;font:12px/1.65 var(--font-mono,monospace);color:var(--workbench-live,#72d6e5)}.theory-equation p{margin:8px 0 0;font-size:11px;line-height:1.55;color:var(--workbench-text-muted,#737e92)}
.theory-caveat{margin:0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--workbench-warning,#f6c96a) 32%,transparent);border-radius:8px;background:color-mix(in srgb,var(--workbench-warning,#f6c96a) 7%,transparent);font-size:11px;line-height:1.55;color:var(--workbench-text-secondary,#a8b0c2)}.theory-caveat strong{color:var(--workbench-warning,#f6c96a)}
.theory-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}.theory-link{display:grid;gap:3px;height:100%;padding:10px 11px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text,#f1f3f8);text-decoration:none}.theory-link:hover,.theory-link:focus-visible{border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d)}.theory-link-label{font-size:11px;font-weight:650}.theory-link-description{font-size:10px;line-height:1.45;color:var(--workbench-text-muted,#737e92)}
@media(max-width:760px){.theory-outline-list{grid-template-columns:repeat(2,minmax(0,1fr))}.theory-links{grid-template-columns:1fr}.theory-section-body{padding-left:16px}.theory-model-grid{grid-template-columns:1fr}.theory-compare-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.theory-compare-states{grid-template-columns:1fr}}
@media(max-width:480px){.theory-workspace{padding:10px}.theory-outline-list{grid-template-columns:1fr}.theory-summary{grid-template-columns:auto minmax(0,1fr);padding:13px 12px}.theory-summary::after{display:none}.theory-toolbar{align-items:flex-start;flex-direction:column}.theory-toggle-all{width:100%}}
@media(prefers-reduced-motion:reduce){.theory-section,.theory-link,.theory-outline a{scroll-behavior:auto;transition:none}}
@media(forced-colors:active){.theory-hero,.theory-model-compare,.theory-model-card,.theory-outline,.theory-section,.theory-equation,.theory-caveat,.theory-link,.theory-geometry-figure,.theory-state-card{forced-color-adjust:auto;border-color:CanvasText;background:Canvas;color:CanvasText;box-shadow:none}}
`;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function setText(element: HTMLElement, text: string): void {
  element.textContent = text;
}

function stateCardElement(document: Document, title: string, description: string, valueId: string): HTMLElement {
  const card = createElement(document, 'section', 'theory-state-card');
  const heading = createElement(document, 'h4');
  setText(heading, title);
  const copy = createElement(document, 'p');
  setText(copy, description);
  const value = createElement(document, 'code');
  value.id = valueId;
  setText(value, '—');
  card.append(heading, copy, value);
  return card;
}

function formattedState(labels: readonly string[], values: ArrayLike<number>): string {
  return labels.map((label, index) => `${label} ${Number(values[index] ?? 0).toExponential(4)}`).join('  ·  ');
}

function metricElement(document: Document, label: string, valueId: string): HTMLDivElement {
  const metric = createElement(document, 'div', 'theory-compare-metric');
  const term = createElement(document, 'dt');
  const value = createElement(document, 'dd');
  value.id = valueId;
  setText(term, label);
  setText(value, '—');
  metric.append(term, value);
  return metric;
}

function activateWorkspace(tab: 'lab' | 'validate'): boolean {
  const shell = (window as Window & { __modernShell?: { switchTo(tab: string): void } }).__modernShell;
  if (shell) {
    shell.switchTo(tab);
    return true;
  }
  const button = document.querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`);
  if (!button) return false;
  button.click();
  return true;
}

function linkElement(document: Document, link: TheoryLink, locale: TheoryLocale): HTMLAnchorElement {
  const anchor = createElement(document, 'a', 'theory-link');
  anchor.href = link.href;
  const label = createElement(document, 'span', 'theory-link-label');
  setText(label, theoryText(link.label, locale));
  const description = createElement(document, 'span', 'theory-link-description');
  setText(description, theoryText(link.description, locale));
  anchor.append(label, description);

  if (link.kind === 'workspace') {
    anchor.addEventListener('click', (event) => {
      if (!activateWorkspace(link.tab)) return;
      event.preventDefault();
    });
  } else if (link.kind === 'trust') {
    anchor.addEventListener('click', (event) => {
      if (!document.getElementById('trustDrawer')) return;
      event.preventDefault();
      openTrustDrawer(link.section);
    });
  } else {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  return anchor;
}

function equationElement(document: Document, section: TheorySection, locale: TheoryLocale): HTMLElement | null {
  if (!section.equations.length) return null;
  const equations = createElement(document, 'div', 'theory-equations');
  for (const equation of section.equations) {
    const figure = createElement(document, 'figure', 'theory-equation');
    figure.dataset.theoryEquation = equation.id;
    const caption = createElement(document, 'figcaption');
    setText(caption, theoryText(equation.label, locale));
    const pre = createElement(document, 'pre');
    const code = createElement(document, 'code');
    setText(code, equation.expression);
    pre.append(code);
    const explanation = createElement(document, 'p');
    setText(explanation, theoryText(equation.explanation, locale));
    figure.append(caption, pre, explanation);
    equations.append(figure);
  }
  return equations;
}

function sectionElement(
  document: Document,
  section: TheorySection,
  locale: TheoryLocale,
  initiallyOpen: boolean,
  onToggle: (id: TheorySectionId, open: boolean) => void
): HTMLDetailsElement {
  const details = createElement(document, 'details', 'theory-section');
  details.id = `theory-${section.id}`;
  details.dataset.theorySection = section.id;
  details.open = initiallyOpen;

  const summary = createElement(document, 'summary', 'theory-summary');
  const step = createElement(document, 'span', 'theory-step');
  setText(step, String(section.step).padStart(2, '0'));
  step.setAttribute('aria-hidden', 'true');
  const copy = createElement(document, 'span', 'theory-summary-copy');
  const title = createElement(document, 'span', 'theory-section-title');
  setText(title, theoryText(section.title, locale));
  const description = createElement(document, 'span', 'theory-section-summary');
  setText(description, theoryText(section.summary, locale));
  copy.append(title, description);
  summary.append(step, copy);

  const body = createElement(document, 'div', 'theory-section-body');
  const paragraphs = createElement(document, 'div', 'theory-paragraphs');
  for (const value of section.paragraphs) {
    const paragraph = createElement(document, 'p');
    setText(paragraph, theoryText(value, locale));
    paragraphs.append(paragraph);
  }
  body.append(paragraphs);

  if (section.id === 'geometry') body.append(geometryFigureElement(document, locale));

  const equations = equationElement(document, section, locale);
  if (equations) body.append(equations);

  if (section.caveat) {
    const caveat = createElement(document, 'aside', 'theory-caveat');
    const label = createElement(document, 'strong');
    setText(label, locale === 'ko' ? '해석 주의: ' : 'Interpretation note: ');
    caveat.append(label, document.createTextNode(theoryText(section.caveat, locale)));
    body.append(caveat);
  }

  if (section.links.length) {
    const links = createElement(document, 'ul', 'theory-links');
    for (const id of section.links) {
      const item = createElement(document, 'li');
      item.append(linkElement(document, THEORY_LINKS[id], locale));
      links.append(item);
    }
    body.append(links);
  }

  details.append(summary, body);
  details.addEventListener('toggle', () => onToggle(section.id, details.open));
  return details;
}

export class TheoryTab extends TabController {
  private readonly openSections = new Set<TheorySectionId>(['assumptions']);
  private host: HTMLElement | null = null;

  private locale(): TheoryLocale {
    return normalizeTheoryLocale(this.host?.ownerDocument.documentElement.lang);
  }

  private revealLinkedSection(document: Document): void {
    const prefix = '#theory-';
    const hash = document.defaultView?.location.hash ?? '';
    if (!hash.startsWith(prefix)) return;
    const id = hash.slice(prefix.length) as TheorySectionId;
    if (!THEORY_SECTIONS.some((section) => section.id === id)) return;
    const target = this.host?.querySelector<HTMLDetailsElement>(hash);
    if (!target) return;
    target.open = true;
    this.openSections.add(id);
    document.defaultView?.requestAnimationFrame(() => {
      const reducedMotion = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
    });
  }

  private modelComparisonElement(document: Document, locale: TheoryLocale): HTMLElement {
    const section = createElement(document, 'section', 'theory-model-compare');
    section.setAttribute('aria-labelledby', 'theoryModelCompareTitle');
    const head = createElement(document, 'div', 'theory-model-head');
    const title = createElement(document, 'h3', 'theory-model-title');
    title.id = 'theoryModelCompareTitle';
    setText(title, locale === 'ko' ? '질점 대 균일 막대' : 'Point masses vs uniform rods');
    const copy = createElement(document, 'p', 'theory-model-copy');
    setText(
      copy,
      locale === 'ko'
        ? 'm₁, m₂가 무엇을 뜻하는지에 따라 관성행렬과 에너지가 달라집니다. 같은 초기 각도라도 두 모델의 궤적을 같은 물리계로 해석하면 안 됩니다.'
        : 'The inertia matrix and energy change with what m₁ and m₂ represent. Even from identical angles, these trajectories must not be interpreted as the same physical system.'
    );
    head.append(title, copy);

    const grid = createElement(document, 'div', 'theory-model-grid');
    const modelCard = (
      system: 'double' | 'compound-double',
      heading: string,
      description: string,
      facts: readonly string[],
      buttonLabel: string
    ): HTMLElement => {
      const card = createElement(document, 'article', 'theory-model-card');
      card.dataset.theoryModel = system;
      const cardTitle = createElement(document, 'h4');
      setText(cardTitle, heading);
      const paragraph = createElement(document, 'p');
      setText(paragraph, description);
      const list = createElement(document, 'ul', 'theory-model-facts');
      for (const fact of facts) {
        const item = createElement(document, 'li');
        setText(item, fact);
        list.append(item);
      }
      const button = createElement(document, 'button', 'theory-model-select');
      button.type = 'button';
      button.dataset.selectSystem = system;
      setText(button, buttonLabel);
      button.addEventListener('click', () => {
        const select = document.getElementById('sysType');
        if (select instanceof HTMLSelectElement && select.value !== system) {
          select.value = system;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        activateWorkspace('lab');
      });
      card.append(cardTitle, paragraph, list, button);
      return card;
    };
    grid.append(
      modelCard(
        'double',
        locale === 'ko' ? '질점 이중진자' : 'Point-mass double',
        locale === 'ko'
          ? 'm₁과 m₂는 질량 없는 링크 끝에 집중된 질점입니다.'
          : 'm₁ and m₂ are concentrated at the ends of massless links.',
        locale === 'ko'
          ? ['기본 Lab 모델', '질량행렬: 끝점 질량의 병진 관성', '정준 q–p 형식 비교 지원']
          : [
              'Default Lab model',
              'Mass matrix: endpoint translational inertia',
              'Supports the canonical q–p formulation comparison'
            ],
        locale === 'ko' ? 'Lab에서 질점 모델 사용' : 'Use point masses in Lab'
      ),
      modelCard(
        'compound-double',
        locale === 'ko' ? '균일 막대 복합 이중진자' : 'Uniform-rod compound double',
        locale === 'ko'
          ? 'm₁과 m₂는 각 링크 전체에 균일하게 분포한 막대의 총질량입니다.'
          : 'm₁ and m₂ are the total masses distributed uniformly along each full rod.',
        locale === 'ko'
          ? [
              '질량중심 병진 + I_cm = ML²/12',
              '독립 직교좌표 가상일 기준식으로 검증',
              '질점 모델의 정준 비교는 적용되지 않음'
            ]
          : [
              'COM translation + I_cm = ML²/12',
              'Checked against an independent Cartesian virtual-work reference',
              'Point-mass canonical comparison does not apply'
            ],
        locale === 'ko' ? 'Lab에서 균일 막대 사용' : 'Use uniform rods in Lab'
      )
    );
    section.append(head, grid);
    return section;
  }

  private comparisonElement(document: Document, locale: TheoryLocale): HTMLElement {
    const card = createElement(document, 'section', 'theory-compare');
    card.setAttribute('aria-labelledby', 'theoryCompareTitle');
    const head = createElement(document, 'div', 'theory-compare-head');
    const title = createElement(document, 'h3', 'theory-compare-title');
    title.id = 'theoryCompareTitle';
    setText(title, locale === 'ko' ? '두 형식, 같은 물리 모델' : 'Two formulations, one physical model');
    const copy = createElement(document, 'p', 'theory-compare-copy');
    setText(
      copy,
      locale === 'ko'
        ? '현재 Lab 매개변수와 초기조건을 사용해 θ–ω 오일러-라그랑주 경로와 q–p 해밀토니안 경로를 같은 고정 RK4 정책으로 짧게 비교합니다.'
        : 'Using the current Lab parameters and initial state, compare the θ–ω Euler-Lagrange path with the q–p Hamiltonian path under one fixed RK4 policy.'
    );
    head.append(title, copy);

    const controls = createElement(document, 'div', 'theory-compare-controls');
    const dtLabel = createElement(document, 'label', 'theory-compare-field');
    const dtText = createElement(document, 'span');
    setText(dtText, locale === 'ko' ? '공유 시간 간격 dt (s)' : 'Shared time step dt (s)');
    const dtInput = createElement(document, 'input');
    dtInput.id = 'theoryCompareDt';
    dtInput.type = 'number';
    dtInput.min = '0.0001';
    dtInput.max = '0.02';
    dtInput.step = '0.0001';
    dtInput.value = String(Math.min(0.001, Math.max(0.0001, this.dom.num('dt', 0.001))));
    dtLabel.append(dtText, dtInput);
    const horizonLabel = createElement(document, 'label', 'theory-compare-field');
    const horizonText = createElement(document, 'span');
    setText(horizonText, locale === 'ko' ? '짧은 비교 구간 (s)' : 'Short horizon (s)');
    const horizonInput = createElement(document, 'input');
    horizonInput.id = 'theoryCompareHorizon';
    horizonInput.type = 'number';
    horizonInput.min = '0.1';
    horizonInput.max = '10';
    horizonInput.step = '0.1';
    horizonInput.value = '1';
    horizonLabel.append(horizonText, horizonInput);
    const policyLabel = createElement(document, 'label', 'theory-compare-field');
    const policyText = createElement(document, 'span');
    setText(policyText, locale === 'ko' ? '비교 판정 정책' : 'Comparison verdict policy');
    const policySelect = createElement(document, 'select');
    policySelect.id = 'theoryCompareVerdictPolicy';
    const interactiveOption = createElement(document, 'option');
    interactiveOption.value = 'interactive';
    setText(interactiveOption, locale === 'ko' ? 'Interactive (상한 5e-5)' : 'Interactive (ceiling 5e-5)');
    const referenceOption = createElement(document, 'option');
    referenceOption.value = 'reference';
    setText(referenceOption, locale === 'ko' ? 'Reference (상한 1e-7)' : 'Reference (ceiling 1e-7)');
    policySelect.append(interactiveOption, referenceOption);
    policyLabel.append(policyText, policySelect);
    const run = createElement(document, 'button', 'theory-compare-run');
    run.type = 'button';
    run.id = 'theoryCompareRun';
    setText(run, locale === 'ko' ? '형식 비교 실행' : 'Run formulation comparison');
    controls.append(dtLabel, horizonLabel, policyLabel, run);

    const status = createElement(document, 'p', 'theory-compare-status');
    status.id = 'theoryCompareStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    setText(
      status,
      locale === 'ko' ? '현재 Lab 상태로 실행할 준비가 되었습니다.' : 'Ready to run from the current Lab state.'
    );
    const metrics = createElement(document, 'dl', 'theory-compare-metrics');
    metrics.append(
      metricElement(document, 'max Δθ₁ / Δθ₂', 'theoryCompareAngles'),
      metricElement(
        document,
        locale === 'ko' ? '최대 질점 위치 차이' : 'max bob-position gap',
        'theoryComparePosition'
      ),
      metricElement(document, 'max |ΔE|', 'theoryCompareEnergy'),
      metricElement(
        document,
        locale === 'ko' ? 'EL 최대 상대 역학에너지 변화' : 'EL max relative mechanical-energy change',
        'theoryCompareElDrift'
      ),
      metricElement(
        document,
        locale === 'ko' ? 'H 최대 상대 역학에너지 변화' : 'H max relative mechanical-energy change',
        'theoryCompareHDrift'
      ),
      metricElement(document, locale === 'ko' ? '정책 / 스텝 수' : 'policy / steps', 'theoryComparePolicy')
    );
    const states = createElement(document, 'div', 'theory-compare-states');
    states.append(
      stateCardElement(
        document,
        locale === 'ko' ? '오일러-라그랑주 최종 상태' : 'Euler-Lagrange final state',
        locale === 'ko' ? '고유 상태 표현 x = [θ₁, θ₂, ω₁, ω₂]' : 'Native state representation x = [θ1, θ2, ω1, ω2]',
        'theoryCompareElState'
      ),
      stateCardElement(
        document,
        locale === 'ko' ? '해밀토니안 최종 상태' : 'Hamiltonian final state',
        locale === 'ko'
          ? '고유 정준 표현 z = [q₁, q₂, p₁, p₂]'
          : 'Native canonical representation z = [q1, q2, p1, p2]',
        'theoryCompareHState'
      )
    );
    const note = createElement(document, 'p', 'theory-compare-note');
    setText(
      note,
      locale === 'ko'
        ? '차이의 출처를 분리해 읽으세요. 표현은 θ–ω와 q–p로 다르지만 적분기는 같은 고정 RK4이고, 판정 허용치는 선택 정책과 dt 스케일 중 더 엄격한 값입니다. 이는 짧은 구간 일관성 점검이지 독립 검증이 아닙니다. γ>0이면 에너지 변화에 물리적 감쇠 손실이 포함됩니다.'
        : 'Read the sources of difference separately: the representations are θ–ω and q–p, the integrator is the same fixed RK4, and the verdict uses the stricter of the selected policy ceiling and the dt-scaled tolerance. This is a short-horizon consistency check, not independent validation. With γ>0, energy change includes physical dissipation.'
    );

    run.addEventListener('click', () => {
      run.disabled = true;
      status.removeAttribute('data-verdict');
      setText(status, locale === 'ko' ? '같은 RK4 정책으로 계산 중…' : 'Computing under one RK4 policy…');
      document.defaultView?.requestAnimationFrame(() => {
        try {
          if (this.dom.str('sysType', 'double') !== 'double') {
            throw new RangeError(
              locale === 'ko'
                ? '이 비교는 질점 이중진자 전용입니다. Lab에서 Double — point masses를 선택하세요.'
                : 'This comparison is for the point-mass double. Select Double — point masses in the Lab.'
            );
          }
          const result = compareDoublePendulumFormulations({
            parameters: {
              m1: this.dom.num('m1', 1),
              m2: this.dom.num('m2', 1),
              l1: this.dom.num('l1', 1.2),
              l2: this.dom.num('l2', 1),
              g: this.dom.num('g', 9.81)
            },
            initialState: [
              this.dom.num('th1', 2),
              this.dom.num('th2', 2.5),
              this.dom.num('iw1', 0),
              this.dom.num('iw2', 0)
            ],
            gamma: this.dom.num('gamma', 0),
            dt: Number(dtInput.value),
            horizon: Number(horizonInput.value),
            comparisonPolicy: policySelect.value === 'reference' ? 'reference' : 'interactive'
          });
          status.dataset.verdict = result.verdict;
          setText(
            status,
            result.verdict === 'agreement'
              ? locale === 'ko'
                ? 'AGREEMENT — 설정된 짧은 구간 허용범위 안에서 일치했습니다.'
                : 'AGREEMENT — matched within the short-horizon tolerance.'
              : locale === 'ko'
                ? 'REVIEW — 시간 간격을 줄이고 검증 근거를 함께 확인하세요.'
                : 'REVIEW — reduce the time step and inspect the validation evidence.'
          );
          this.dom.setText(
            'theoryCompareAngles',
            `${result.maxAngleDifference[0].toExponential(3)} / ${result.maxAngleDifference[1].toExponential(3)} rad`
          );
          this.dom.setText('theoryComparePosition', `${result.maxPositionDifference.toExponential(3)} m`);
          this.dom.setText('theoryCompareEnergy', `${result.maxEnergyDifference.toExponential(3)} J`);
          this.dom.setText('theoryCompareElDrift', result.maxRelativeEnergyChange[0].toExponential(3));
          this.dom.setText('theoryCompareHDrift', result.maxRelativeEnergyChange[1].toExponential(3));
          this.dom.setText(
            'theoryComparePolicy',
            `${result.policy} · ${result.comparisonPolicy}≤${result.policyToleranceCeiling.toExponential(1)} / ${result.steps.toLocaleString()} · tol ${result.comparisonTolerance.toExponential(2)}`
          );
          this.dom.setText('theoryCompareElState', formattedState(['θ₁', 'θ₂', 'ω₁', 'ω₂'], result.finalThetaOmega));
          this.dom.setText(
            'theoryCompareHState',
            `${formattedState(['q₁', 'q₂', 'p₁', 'p₂'], result.finalCanonical)}\n${locale === 'ko' ? 'θ–ω 환산' : 'converted θ–ω'}: ${formattedState(['θ₁', 'θ₂', 'ω₁', 'ω₂'], result.finalCanonicalAsThetaOmega)}`
          );
        } catch (error) {
          status.dataset.verdict = 'review';
          setText(
            status,
            `${locale === 'ko' ? '입력 오류' : 'Input error'}: ${error instanceof Error ? error.message : String(error)}`
          );
        } finally {
          run.disabled = false;
        }
      });
    });

    card.append(head, controls, status, metrics, states, note);
    return card;
  }

  private render(): void {
    const host = this.host;
    if (!host) return;
    const document = host.ownerDocument;
    const locale = this.locale();
    host.replaceChildren();
    host.classList.add('theory-workspace');
    host.setAttribute('aria-labelledby', 'theoryTitle');

    const hero = createElement(document, 'header', 'theory-hero');
    const eyebrow = createElement(document, 'span', 'theory-eyebrow');
    setText(eyebrow, theoryText(THEORY_OVERVIEW.eyebrow, locale));
    const title = createElement(document, 'h2', 'theory-title');
    title.id = 'theoryTitle';
    setText(title, theoryText(THEORY_OVERVIEW.title, locale));
    const lead = createElement(document, 'p', 'theory-lead');
    setText(lead, theoryText(THEORY_OVERVIEW.summary, locale));
    const scope = createElement(document, 'p', 'theory-scope');
    setText(scope, theoryText(THEORY_OVERVIEW.scope, locale));
    hero.append(eyebrow, title, lead, scope);

    const toolbar = createElement(document, 'div', 'theory-toolbar');
    const toolbarLabel = createElement(document, 'span', 'theory-toolbar-label');
    setText(toolbarLabel, locale === 'ko' ? '9단계 이론 경로' : 'Nine-step theory path');
    const toggleAll = createElement(document, 'button', 'theory-toggle-all');
    toggleAll.type = 'button';
    toolbar.append(toolbarLabel, toggleAll);

    const outline = createElement(document, 'nav', 'theory-outline');
    outline.setAttribute('aria-label', locale === 'ko' ? '이론 섹션' : 'Theory sections');
    const outlineList = createElement(document, 'ol', 'theory-outline-list');
    for (const section of THEORY_SECTIONS) {
      const item = createElement(document, 'li');
      const anchor = createElement(document, 'a');
      anchor.href = `#theory-${section.id}`;
      const index = createElement(document, 'span', 'theory-outline-index');
      setText(index, String(section.step).padStart(2, '0'));
      const label = createElement(document, 'span');
      setText(label, theoryText(section.title, locale));
      anchor.append(index, label);
      anchor.addEventListener('click', (event) => {
        const target = host.querySelector<HTMLDetailsElement>(`#theory-${section.id}`);
        if (!target) return;
        event.preventDefault();
        target.open = true;
        const reducedMotion = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
      });
      item.append(anchor);
      outlineList.append(item);
    }
    outline.append(outlineList);

    const sections = createElement(document, 'div', 'theory-sections');
    const updateToggleAll = (): void => {
      const expanded = THEORY_SECTIONS.every((section) => this.openSections.has(section.id));
      setText(
        toggleAll,
        expanded ? (locale === 'ko' ? '모두 접기' : 'Collapse all') : locale === 'ko' ? '모두 펼치기' : 'Expand all'
      );
      toggleAll.setAttribute('aria-expanded', String(expanded));
    };
    const onToggle = (id: TheorySectionId, open: boolean): void => {
      if (open) this.openSections.add(id);
      else this.openSections.delete(id);
      updateToggleAll();
    };
    for (const section of THEORY_SECTIONS) {
      sections.append(sectionElement(document, section, locale, this.openSections.has(section.id), onToggle));
    }
    toggleAll.addEventListener('click', () => {
      const expand = !THEORY_SECTIONS.every((section) => this.openSections.has(section.id));
      sections.querySelectorAll<HTMLDetailsElement>('.theory-section').forEach((details) => {
        details.open = expand;
      });
    });
    updateToggleAll();

    host.append(
      hero,
      this.modelComparisonElement(document, locale),
      this.comparisonElement(document, locale),
      toolbar,
      outline,
      sections
    );
    this.revealLinkedSection(document);
  }

  protected bind(): void {
    this.host = this.dom.el(THEORY_CONTENT_HOST_ID);
    if (!this.host) return;
    installAdoptedStyle(THEORY_STYLE_ID, styles());
    this.render();
    this.host.ownerDocument.addEventListener('pendulum:ui-locale-changed', () => this.render());
  }
}
