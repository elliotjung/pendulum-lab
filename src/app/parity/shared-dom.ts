/** DOM construction and form access helpers shared by parity surfaces. */
import type { Tone } from './shared-types';

export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    id?: string;
    className?: string;
    text?: string;
    title?: string;
    role?: string;
    ariaLabel?: string;
    type?: string;
    value?: string;
  } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.role) node.setAttribute('role', options.role);
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.type && node instanceof HTMLButtonElement) node.type = options.type as HTMLButtonElement['type'];
  if (
    options.value !== undefined &&
    (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLOptionElement)
  ) {
    node.value = options.value;
  }
  return node;
}

export function append(parent: Node, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(child));
  }
}

export function clear(node: Element | null): void {
  if (node) node.replaceChildren();
}

export function setText(id: string, text: string): void {
  const node = $(id);
  if (node) node.textContent = text;
}

export function button(id: string, label: string, run: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const node = html('button', { id, text: label, type: 'button', className });
  node.addEventListener('click', () => {
    void run();
  });
  return node;
}

export function row(label: string, value: string, tone: Tone = ''): HTMLDivElement {
  const node = html('div', { className: 'srow' });
  const key = html('span', { className: 'skey', text: label });
  const val = html('span', { className: ('sval ' + tone).trim(), text: value });
  append(node, key, val);
  return node;
}

export function kvGrid(id: string, pairs: Array<[string, string, Tone?]>): HTMLDivElement {
  const grid = html('div', { id, className: 'stats' });
  pairs.forEach(([key, value, tone]) => grid.append(row(key, value, tone ?? '')));
  return grid;
}

export function card(title: string, body: Node, id?: string, className = 'rg-card'): HTMLElement {
  const section = id === undefined ? html('section', { className }) : html('section', { id, className });
  append(section, html('div', { className: 'rg-title', text: title }), body);
  return section;
}

export function detailsCard(title: string, body: Node, id?: string): HTMLDetailsElement {
  const details = id === undefined ? html('details', { className: 'acc' }) : html('details', { id, className: 'acc' });
  details.open = true;
  const summary = html('summary');
  append(
    summary,
    html('span', { className: 'acc-icon', text: '>' }),
    html('span', { className: 'acc-label', text: title }),
    html('span', { className: 'acc-arrow', text: '>' })
  );
  append(details, summary, html('div', { className: 'acc-body' }));
  details.querySelector('.acc-body')?.append(body);
  return details;
}

export function numberFrom(id: string, fallback: number): number {
  const element = $(id);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return fallback;
  const value = Number.parseFloat(element.value);
  return Number.isFinite(value) ? value : fallback;
}

export function selectValue(id: string, fallback: string): string {
  const element = $(id);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return fallback;
  return element.value || fallback;
}

export function setControl(id: string, value: string | number | boolean): void {
  const element = $(id);
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element instanceof HTMLSelectElement) {
    element.value = String(value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
