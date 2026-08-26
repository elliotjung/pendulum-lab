import type { TheoryLocale } from './theoryContent';
import { setTheorySvgAttributes as setAttributes, theorySvgElement as svgElement } from './theorySvg';

export function geometryFigureElement(document: Document, locale: TheoryLocale): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'theory-geometry-figure';
  figure.dataset.theoryFigure = 'point-mass-geometry';
  const svg = svgElement(document, 'svg');
  setAttributes(svg, {
    viewBox: '0 0 520 280',
    role: 'img',
    'aria-labelledby': 'theoryGeometryTitle theoryGeometryDescription'
  });
  const title = svgElement(document, 'title');
  title.id = 'theoryGeometryTitle';
  title.textContent =
    locale === 'ko' ? '이중진자 좌표와 질점 위치' : 'Double-pendulum coordinates and point-mass positions';
  const description = svgElement(document, 'desc');
  description.id = 'theoryGeometryDescription';
  description.textContent =
    locale === 'ko'
      ? '고정축에서 아래쪽 수직선을 기준으로 θ1과 θ2를 측정하며, 길이 l1과 l2의 질량 없는 링크 끝에 m1과 m2가 있습니다.'
      : 'Theta one and theta two are measured from the downward vertical at the fixed pivot; point masses m1 and m2 sit at the ends of massless links l1 and l2.';
  const axis = svgElement(document, 'line');
  axis.classList.add('theory-geometry-axis');
  setAttributes(axis, { x1: '260', y1: '26', x2: '260', y2: '260' });
  const link1 = svgElement(document, 'line');
  link1.classList.add('theory-geometry-link');
  setAttributes(link1, { x1: '260', y1: '32', x2: '170', y2: '140' });
  const link2 = svgElement(document, 'line');
  link2.classList.add('theory-geometry-link');
  setAttributes(link2, { x1: '170', y1: '140', x2: '335', y2: '235' });
  const angle1 = svgElement(document, 'path');
  angle1.classList.add('theory-geometry-angle');
  setAttributes(angle1, { d: 'M260 88 A56 56 0 0 1 224 75' });
  const angle2 = svgElement(document, 'path');
  angle2.classList.add('theory-geometry-angle');
  setAttributes(angle2, { d: 'M170 198 A58 58 0 0 0 221 169' });
  const pivot = svgElement(document, 'circle');
  pivot.classList.add('theory-geometry-bob');
  setAttributes(pivot, { cx: '260', cy: '32', r: '8' });
  const bob1 = svgElement(document, 'circle');
  bob1.classList.add('theory-geometry-bob');
  setAttributes(bob1, { cx: '170', cy: '140', r: '15' });
  const bob2 = svgElement(document, 'circle');
  bob2.classList.add('theory-geometry-bob');
  setAttributes(bob2, { cx: '335', cy: '235', r: '17' });
  const labels: ReadonlyArray<readonly [string, string, string]> = [
    ['θ₁', '214', '78'],
    ['θ₂', '218', '184'],
    ['l₁', '196', '92'],
    ['l₂', '267', '185'],
    ['m₁', '132', '139'],
    ['m₂', '364', '242']
  ];
  const labelNodes = labels.map(([text, x, y]) => {
    const label = svgElement(document, 'text');
    label.classList.add('theory-geometry-label');
    setAttributes(label, { x, y });
    label.textContent = text;
    return label;
  });
  svg.append(title, description, axis, link1, link2, angle1, angle2, pivot, bob1, bob2, ...labelNodes);
  const caption = document.createElement('figcaption');
  caption.textContent =
    locale === 'ko'
      ? '좌표 계약: θ₁, θ₂는 각각 아래쪽 수직선에서 측정합니다. m₂의 위치는 첫 링크 끝에서 두 번째 링크를 더해 얻습니다.'
      : 'Coordinate contract: each angle is measured from downward vertical; the m2 position adds the second link to the end of the first.';
  figure.append(svg, caption);
  return figure;
}
