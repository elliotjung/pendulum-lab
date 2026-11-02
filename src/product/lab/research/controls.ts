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
  const control = createInput(document, { id: `research-${id}`, label, value: String(value), type: 'number', help });
  control.input.step = 'any';
  root.append(control.element);
  return control.input;
}

export function textField(document: Document, root: HTMLElement, id: string, label: string, value = '') {
  const control = createInput(document, { id: `research-${id}`, label, value });
  root.append(control.element);
  return control.input;
}

export function selectField(
  document: Document,
  root: HTMLElement,
  id: string,
  labelText: string,
  entries: readonly (readonly [string, string])[]
) {
  const wrap = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', labelText);
  const select = element(document, 'select', 'ds-field__control');
  select.id = `research-${id}`;
  label.htmlFor = select.id;
  for (const [value, title] of entries) {
    const option = element(document, 'option', '', title);
    option.value = value;
    select.append(option);
  }
  wrap.append(label, select);
  root.append(wrap);
  return select;
}

export function readNumber(input: HTMLInputElement) {
  const value = input.value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    throw new Error(`${input.labels?.[0]?.textContent ?? input.id}에 유한한 숫자를 입력하세요.`);
  }
  input.removeAttribute('aria-invalid');
  return Number(value);
}

export function dataTable(
  document: Document,
  title: string,
  columns: readonly string[],
  rows: readonly (readonly (string | number)[])[]
) {
  const wrap = element(document, 'div', 'research-table');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', title);
  const table = element(document, 'table', '');
  table.append(element(document, 'caption', '', title));
  const head = element(document, 'thead', '');
  const header = element(document, 'tr', '');
  for (const name of columns) {
    const th = element(document, 'th', '', name);
    th.scope = 'col';
    header.append(th);
  }
  head.append(header);
  const body = element(document, 'tbody', '');
  for (const row of rows) {
    const tr = element(document, 'tr', '');
    for (const cell of row)
      tr.append(element(document, 'td', '', typeof cell === 'number' ? cell.toPrecision(7) : cell));
    body.append(tr);
  }
  table.append(head, body);
  wrap.append(table);
  return wrap;
}
