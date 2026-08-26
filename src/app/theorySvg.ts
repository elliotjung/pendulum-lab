const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function theorySvgElement<K extends keyof SVGElementTagNameMap>(
  document: Document,
  tag: K
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, tag);
}

export function setTheorySvgAttributes(element: Element, values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) element.setAttribute(name, value);
}
