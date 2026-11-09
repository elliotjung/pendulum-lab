import { element } from '../app/dom';
import { createButton } from '../design-system/primitives';
import type { LegacyWorkspaceRecord } from './legacy-workspace-contracts';
import type { JsonValue } from './safe-data';

/** Bounded, text-only tree/table reader. Every nested source value stays accessible without mounting a giant JSON string. */
export function createLegacyWorkspaceRecordView(document: Document, record: LegacyWorkspaceRecord) {
  const root = element(document, 'section', 'ds-section');
  root.setAttribute('aria-label', '기존 typed record 내용');
  root.append(
    element(document, 'h3', '', record.title),
    element(document, 'p', 'lab-muted', `${record.kind} · ${record.sourcePath} · ${record.status}`)
  );
  for (const issue of record.issues) root.append(element(document, 'p', 'lab-preview-note', issue));
  const browser = element(document, 'div', 'legacy-record-browser');
  const stack: { value: JsonValue; path: string; page: number }[] = [
    { value: record.payload, path: '$.payload', page: 0 }
  ];
  const current = () => stack.at(-1)!;
  function draw() {
    browser.replaceChildren();
    const state = current(),
      value = state.value;
    const path = element(document, 'p', 'project-artifact-id', state.path);
    path.setAttribute('role', 'status');
    browser.append(path);
    if (stack.length > 1)
      browser.append(
        createButton(document, {
          label: '상위 필드로',
          variant: 'secondary',
          onClick() {
            stack.pop();
            draw();
          }
        })
      );
    if (value === null || typeof value !== 'object') {
      browser.append(element(document, 'pre', 'lab-data-output', JSON.stringify(value)));
      return;
    }
    const entries = Object.entries(value),
      start = state.page * 50;
    browser.append(
      element(
        document,
        'p',
        'lab-muted',
        `전체${entries.length}항목 · ${start + 1}–${Math.min(entries.length, start + 50)} 표시. 원본의 이름·숫자·단위를 변경하지 않습니다.`
      )
    );
    const table = element(document, 'table', 'product-table'),
      head = element(document, 'tr', '');
    for (const title of ['원본 필드', '값 / 형식']) head.append(element(document, 'th', '', title));
    table.append(head);
    for (const [key, item] of entries.slice(start, start + 50)) {
      const row = element(document, 'tr', ''),
        name = element(document, 'th', '', key),
        cell = element(document, 'td', '');
      name.scope = 'row';
      if (item !== null && typeof item === 'object')
        cell.append(
          createButton(document, {
            label: `${Array.isArray(item) ? '배열' : '객체'} ${Object.keys(item).length}항목 열기`,
            variant: 'secondary',
            onClick() {
              stack.push({ value: item, path: `${state.path}.${key}`, page: 0 });
              draw();
            }
          })
        );
      else cell.append(element(document, 'span', '', typeof item === 'string' ? item : JSON.stringify(item)));
      row.append(name, cell);
      table.append(row);
    }
    browser.append(table);
    if (start > 0)
      browser.append(
        createButton(document, {
          label: '이전50항목',
          variant: 'secondary',
          onClick() {
            current().page--;
            draw();
          }
        })
      );
    if (start + 50 < entries.length)
      browser.append(
        createButton(document, {
          label: '다음50항목',
          variant: 'secondary',
          onClick() {
            current().page++;
            draw();
          }
        })
      );
  }
  draw();
  root.append(browser);
  return root;
}
