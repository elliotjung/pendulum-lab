import { element } from '../../app/dom';
import { createInput } from '../../design-system/primitives';

export function projectText(document: Document, root: HTMLElement, id: string, label: string, value = '', help = '') {
  const control = createInput(document, { id: `project-${id}`, label, value, help });
  root.append(control.element);
  return control.input;
}

export function projectArea(document: Document, root: HTMLElement, id: string, title: string, value = '') {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', title);
  const input = element(document, 'textarea', 'ds-field__control');
  input.id = `project-${id}`;
  input.value = value;
  input.rows = 4;
  label.htmlFor = input.id;
  field.append(label, input);
  root.append(field);
  return input;
}

export function projectSelect(document: Document, root: HTMLElement, id: string, title: string) {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', title);
  const input = element(document, 'select', 'ds-field__control');
  input.id = `project-${id}`;
  label.htmlFor = input.id;
  field.append(label, input);
  root.append(field);
  return input;
}

export function selectEntries(
  document: Document,
  select: HTMLSelectElement,
  entries: readonly (readonly [string, string])[],
  empty: string
) {
  const current = select.value;
  select.replaceChildren();
  if (!entries.length) {
    const option = element(document, 'option', '', empty);
    option.value = '';
    select.append(option);
  }
  for (const [value, label] of entries) {
    const option = element(document, 'option', '', label);
    option.value = value;
    select.append(option);
  }
  if (entries.some(([value]) => value === current)) select.value = current;
}

export function projectGroup(document: Document, root: HTMLElement, title: string) {
  const fieldset = element(document, 'fieldset', 'project-group');
  fieldset.append(element(document, 'legend', '', title));
  const fields = element(document, 'div', 'project-grid');
  fieldset.append(fields);
  root.append(fieldset);
  return { element: fieldset, fields };
}

export function requiredText(input: HTMLInputElement | HTMLTextAreaElement, max = 200) {
  const value = input.value.trim();
  const invalid = !value || value.length > max;
  input.setAttribute('aria-invalid', String(invalid));
  if (invalid) {
    input.focus();
    throw new Error(`${input.labels?.[0]?.textContent ?? input.id}에 1~${max}자의 내용을 입력하세요.`);
  }
  return value;
}

export function projectFile(document: Document, root: HTMLElement, id: string, title: string, accept: string) {
  const field = element(document, 'div', 'ds-field');
  const label = element(document, 'label', 'ds-field__label', title);
  const file = element(document, 'input', 'ds-field__control');
  file.id = `project-${id}`;
  file.type = 'file';
  file.accept = accept;
  label.htmlFor = file.id;
  field.append(label, file);
  root.append(field);
  return file;
}
