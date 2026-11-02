import { element } from '../../app/dom';
import { createInput } from '../../design-system/primitives';

export function numberField(
  document: Document,
  root: HTMLElement,
  id: string,
  label: string,
  value: number,
  help = ''
) {
  const control = createInput(document, { id: `data-${id}`, label, value: String(value), type: 'number', help });
  control.input.step = 'any';
  root.append(control.element);
  return control.input;
}
export function textField(document: Document, root: HTMLElement, id: string, label: string, value = '', help = '') {
  const control = createInput(document, { id: `data-${id}`, label, value, help });
  root.append(control.element);
  return control.input;
}
export function selectField(
  document: Document,
  root: HTMLElement,
  id: string,
  title: string,
  entries: readonly (readonly [string, string])[]
) {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', title);
  const input = element(document, 'select', 'ds-field__control');
  input.id = `data-${id}`;
  label.htmlFor = input.id;
  for (const [value, text] of entries) {
    const option = element(document, 'option', '', text);
    option.value = value;
    input.append(option);
  }
  field.append(label, input);
  root.append(field);
  return input;
}
export function textareaField(document: Document, root: HTMLElement, id: string, title: string, value = '') {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', title);
  const input = element(document, 'textarea', 'ds-field__control');
  input.id = `data-${id}`;
  input.value = value;
  input.spellcheck = false;
  label.htmlFor = input.id;
  field.append(label, input);
  root.append(field);
  return input;
}
export function readNumber(input: HTMLInputElement) {
  const text = input.value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    throw new Error(`${input.labels?.[0]?.textContent ?? input.id}에 유한한 숫자를 입력하세요.`);
  }
  input.removeAttribute('aria-invalid');
  return Number(text);
}
export function dataTable(
  document: Document,
  title: string,
  columns: readonly string[],
  rows: readonly (readonly (number | string)[])[]
) {
  const wrap = element(document, 'div', 'data-model-table');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', title);
  const table = element(document, 'table', '');
  table.append(element(document, 'caption', '', title));
  const head = element(document, 'thead', '');
  const tr = element(document, 'tr', '');
  for (const name of columns) {
    const th = element(document, 'th', '', name);
    th.scope = 'col';
    tr.append(th);
  }
  head.append(tr);
  const body = element(document, 'tbody', '');
  for (const row of rows) {
    const line = element(document, 'tr', '');
    for (const value of row)
      line.append(element(document, 'td', '', typeof value === 'number' ? value.toPrecision(7) : value));
    body.append(line);
  }
  table.append(head, body);
  wrap.append(table);
  return wrap;
}
