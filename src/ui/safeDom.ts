export function replaceChildrenText(node: Element, lines: readonly string[]): void {
  node.replaceChildren(
    ...lines.map((line) => {
      const div = document.createElement('div');
      div.textContent = line;
      return div;
    })
  );
}

export function button(label: string, onClick: () => void, className?: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  element.addEventListener('click', onClick);
  return element;
}
