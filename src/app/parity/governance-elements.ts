import { append, html } from './shared';

export function paragraph(text: string): HTMLParagraphElement {
  return html('p', { text });
}

export function bulletList(items: string[]): HTMLUListElement {
  const list = html('ul');
  for (const item of items) list.append(html('li', { text: item }));
  return list;
}

export function metric(id: string, label: string, value = '-'): HTMLDivElement {
  const node = html('div', { id, className: 'si-metric' });
  append(node, html('b', { text: label }), html('span', { text: value }));
  return node;
}

export function selectRow(id: string, label: string, values: string[]): HTMLDivElement {
  const node = html('div', { className: 'ri-row' });
  const select = html('select', { id });
  for (const value of values) select.append(html('option', { value, text: value }));
  append(node, html('label', { text: label }), select);
  return node;
}

export function figCard(title: string, detail: string): HTMLElement {
  const node = html('div', { className: 'fig-card' });
  append(node, html('b', { text: title }), html('br'), html('span', { text: detail }));
  return node;
}
