/**
 * Reusable DOM factory helpers for the Research Workbench UI.
 * Extracted from research-workbench.ts so that 3D-lab modules can import
 * just these utilities without pulling in the full workbench.
 */
import { html, append } from './shared';

export function researchCard(title: string, id: string): HTMLElement {
  const section = html('section', { id, className: 'research-card' });
  section.append(html('div', { className: 'research-title', text: title }));
  return section;
}

export function researchInput(id: string, type: string, value: string, placeholder: string): HTMLInputElement {
  const input = html('input', { id });
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  if (type === 'number') input.step = 'any';
  return input;
}

export function researchTextArea(id: string, placeholder: string): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.placeholder = placeholder;
  return textarea;
}

export function researchSelect(id: string, options: Array<[string, string]>): HTMLSelectElement {
  const select = html('select', { id });
  for (const [value, label] of options) select.append(html('option', { value, text: label }));
  return select;
}

export function researchFormRow(label: string, child: HTMLElement): HTMLDivElement {
  const rowNode = html('div', { className: 'research-form-row' });
  append(rowNode, html('label', { text: label }), child);
  return rowNode;
}

export function researchActions(...children: HTMLElement[]): HTMLDivElement {
  const rowNode = html('div', { className: 'research-actions' });
  children.forEach((child) => rowNode.append(child));
  return rowNode;
}
