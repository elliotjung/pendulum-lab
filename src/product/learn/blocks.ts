import { element, link } from '../app/dom';
import type { EquationBlock, FigureBlock, LearnText, LearnUnit } from './schema';

export function textNode<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
  text: LearnText
): HTMLElementTagNameMap[K] {
  const node = element(document, tag, className, text.ko);
  node.dataset.translationKey = text.key;
  return node;
}

function section(document: Document, title: string): HTMLElement {
  const node = element(document, 'section', 'learn-section');
  node.append(element(document, 'h2', '', title));
  return node;
}

function citations(document: Document, ids: readonly string[]): HTMLElement {
  const node = element(document, 'p', 'learn-citation-hint');
  node.textContent = `출처: ${ids.join(', ')} · 아래 참고 문헌에서 확인할 수 있습니다.`;
  return node;
}

export function renderEquation(document: Document, equation: EquationBlock): HTMLElement {
  const node = element(document, 'article', 'learn-equation');
  node.append(textNode(document, 'h3', '', equation.title));
  const formula = element(document, 'div', 'learn-formula');
  formula.setAttribute('role', 'math');
  formula.setAttribute('aria-label', equation.accessibleText.ko);
  const visual = element(document, 'span', '', equation.expression);
  visual.setAttribute('aria-hidden', 'true');
  formula.append(visual);
  node.append(formula, textNode(document, 'p', 'learn-equation-description', equation.accessibleText));
  const definitions = element(document, 'dl', 'learn-symbols');
  for (const symbol of equation.symbols) {
    const row = element(document, 'div', 'learn-symbol');
    row.append(element(document, 'dt', '', `${symbol.symbol} [${symbol.unit}]`));
    row.append(textNode(document, 'dd', '', symbol.meaning));
    definitions.append(row);
  }
  node.append(definitions, citations(document, equation.citationIds));
  return node;
}

/** Only bounded, validated drawing data enters the SVG; no markup or external assets. */
export function renderFigure(document: Document, figure: FigureBlock): HTMLElement {
  const node = element(document, 'figure', 'learn-figure');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 440 320');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', figure.alt.ko);
  const title = document.createElementNS(ns, 'title');
  title.textContent = figure.title.ko;
  svg.append(title);
  const position = (value: number, dimension: number) => String(50 + value * (dimension - 100));
  const nodes = new Map(figure.nodes.map((point) => [point.id, point]));
  for (const edge of figure.lines) {
    const from = nodes.get(edge.from)!;
    const to = nodes.get(edge.to)!;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', position(from.x, 440));
    line.setAttribute('y1', position(from.y, 320));
    line.setAttribute('x2', position(to.x, 440));
    line.setAttribute('y2', position(to.y, 320));
    svg.append(line);
  }
  for (const point of figure.nodes) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', position(point.x, 440));
    circle.setAttribute('cy', position(point.y, 320));
    circle.setAttribute('r', '7');
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', position(point.x, 440));
    label.setAttribute('y', String(Number(position(point.y, 320)) - 18));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = point.label.ko;
    svg.append(circle, label);
  }
  node.append(svg, textNode(document, 'figcaption', '', figure.caption));
  node.append(textNode(document, 'p', 'learn-figure-description', figure.alt), citations(document, figure.citationIds));
  return node;
}

export function renderUnitBlocks(document: Document, unit: LearnUnit): HTMLElement {
  const content = element(document, 'div', 'learn-reading');
  const objectives = section(document, '학습 목표');
  const list = element(document, 'ul', 'learn-objectives');
  for (const goal of unit.objectives) list.append(textNode(document, 'li', '', goal));
  objectives.append(list);
  content.append(objectives);
  const prerequisites = section(document, '필요할 때 펼치는 선수 개념');
  for (const prerequisite of unit.prerequisites) {
    const disclosure = element(document, 'details', 'learn-prerequisite');
    disclosure.append(
      textNode(document, 'summary', '', prerequisite.title),
      textNode(document, 'p', '', prerequisite.body)
    );
    for (const ref of prerequisite.recommendedUnits) {
      disclosure.append(link(document, `추천 단원 ${ref.unitId}`, `#/learn/${ref.courseId}/${ref.unitId}`));
    }
    prerequisites.append(disclosure);
  }
  content.append(prerequisites);
  const concepts = section(document, '질문과 모델의 가정');
  for (const concept of unit.concepts) {
    const block = element(document, 'article', 'learn-concept');
    block.append(
      textNode(document, 'h3', '', concept.title),
      textNode(document, 'p', '', concept.body),
      citations(document, concept.citationIds)
    );
    concepts.append(block);
  }
  content.append(concepts);
  const equations = section(document, '식을 읽고 기호 연결하기');
  for (const equation of unit.equations) equations.append(renderEquation(document, equation));
  content.append(equations);
  if (unit.figures.length) {
    const figures = section(document, '그림으로 확인하기');
    for (const figure of unit.figures) figures.append(renderFigure(document, figure));
    content.append(figures);
  }
  const glossary = section(document, '용어');
  const terms = element(document, 'dl', 'learn-glossary');
  for (const entry of unit.glossary) {
    const row = element(document, 'div', '');
    const term = textNode(document, 'dt', '', entry.term);
    const english = element(document, 'span', 'learn-english-term', entry.term.en);
    english.lang = 'en';
    term.append(english);
    row.append(term, textNode(document, 'dd', '', entry.definition));
    terms.append(row);
  }
  glossary.append(terms);
  content.append(glossary);
  return content;
}

export function renderReferences(document: Document, unit: LearnUnit): HTMLElement {
  const references = section(document, '참고 문헌과 검토 상태');
  const list = element(document, 'ol', 'learn-references');
  for (const reference of unit.references) {
    const item = element(document, 'li', '');
    const source = link(document, `${reference.id} · ${reference.title.ko}`, reference.url);
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    item.append(
      source,
      element(document, 'p', '', `${reference.authors} · ${reference.locator.ko} · 확인 ${reference.accessedOn}`)
    );
    list.append(item);
  }
  const review = element(document, 'p', 'learn-review-status');
  review.textContent = `콘텐츠 구조: ${unit.review.schemaVerified ? '자동 검사 완료' : '검사 전'} · 과학 예제: ${unit.review.automatedVerified ? '자동 검증 완료' : '전체 자동 검증 전'} · 출처: ${unit.review.sourceChecked ? '대조 완료' : '대조 전'} · 사람·전문가: ${unit.review.humanReviewed ? '검토 기록 있음' : '검토 전'}`;
  references.append(list, review, textNode(document, 'p', '', unit.review.note));
  return references;
}
