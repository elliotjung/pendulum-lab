import { element, link } from '../app/dom';
import { createButton, createInput } from '../design-system/primitives';
import { learningPaths, loadCurriculumIndex, type CurriculumIndex } from './index-data';
import { findUnitSummary } from '../../../content/learn/curriculum';
import type { UnitRef } from './schema';
const href = (ref: UnitRef) => `#/learn/${ref.courseId}/${ref.unitId}`;
export function createLearningIndex(document: Document) {
  const root = element(document, 'section', 'learn-section learn-index');
  root.setAttribute('aria-label', '추천 경로와 학습 색인');
  root.append(element(document, 'h2', '', '질문에 맞는 추천 경로'));
  for (const path of learningPaths) {
    const article = element(document, 'article', 'learn-notice');
    article.append(element(document, 'h3', '', path.title), element(document, 'p', '', path.description));
    const list = element(document, 'ol', 'learn-navigation');
    for (const ref of path.units) {
      const item = element(document, 'li', '');
      item.append(
        link(
          document,
          `${ref.unitId} · ${findUnitSummary(ref.courseId, ref.unitId)?.title.ko ?? ref.unitId}`,
          href(ref)
        )
      );
      list.append(item);
    }
    article.append(list);
    root.append(article);
  }
  root.append(
    element(
      document,
      'p',
      '',
      '모든 단원은 독립적으로 열립니다. 추천 경로와 진도는 기능 사용을 제한하지 않습니다. 자동 검증·출처 대조와 사람 검토는 서로 다른 상태이며 사람 검토 완료를 뜻하지 않습니다.'
    )
  );
  const details = element(document, 'details', 'learn-prerequisite');
  details.append(element(document, 'summary', '', '용어·참고 문헌 색인 펼치기'));
  const content = element(document, 'div', '');
  details.append(content);
  root.append(details);
  let controller: AbortController | undefined,
    disposed = false,
    index: CurriculumIndex | undefined;
  const status = element(document, 'p', '');
  status.setAttribute('role', 'status');
  function render(value: CurriculumIndex) {
    const search = createInput(document, { id: 'learn-index-search', label: '색인 검색', value: '' });
    const input = search.input;
    input.type = 'search';
    const results = element(document, 'div', '');
    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      results.replaceChildren();
      const terms = value.terms.filter((t) =>
        `${t.term} ${t.english} ${t.definition} ${t.unit.unitId}`.toLocaleLowerCase().includes(query)
      );
      const citations = value.references.filter((r) =>
        `${r.title} ${r.authors} ${r.units.map((u) => u.unitId).join(' ')}`.toLocaleLowerCase().includes(query)
      );
      status.textContent = `용어 ${terms.length}개 · 참고 문헌 ${citations.length}개`;
      results.append(element(document, 'h3', '', '용어'));
      const list = element(document, 'dl', '');
      for (const term of terms) {
        const dt = element(document, 'dt', '');
        dt.append(link(document, `${term.term} (${term.english}) · ${term.unit.unitId}`, href(term.unit)));
        list.append(dt, element(document, 'dd', '', term.definition));
      }
      results.append(list, element(document, 'h3', '', '참고 문헌'));
      const references = element(document, 'ul', '');
      for (const citation of citations) {
        const item = element(document, 'li', '');
        item.append(
          link(document, citation.title, citation.url),
          element(document, 'span', '', ` · ${citation.authors} · 관련 단원: `)
        );
        for (const ref of citation.units) item.append(link(document, `${ref.unitId} `, href(ref)));
        references.append(item);
      }
      results.append(references);
      if (!terms.length && !citations.length)
        results.append(element(document, 'p', '', '일치하는 항목이 없습니다. 검색어를 바꿔 보세요.'));
    };
    input.addEventListener('input', filter);
    content.replaceChildren(search.element, status, results);
    filter();
  }
  async function load() {
    if (disposed) return;
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    status.textContent = '단원에서 용어와 참고 문헌을 불러오는 중입니다.';
    content.replaceChildren(
      status,
      createButton(document, {
        label: '색인 불러오기 취소',
        onClick: () => {
          current.abort();
          status.textContent = '색인 불러오기를 취소했습니다. 다시 펼치면 재시도합니다.';
        }
      })
    );
    try {
      const loaded = await loadCurriculumIndex(current.signal);
      if (disposed || current !== controller || !loaded) return;
      index = loaded;
      render(index);
    } catch {
      if (disposed || current !== controller) return;
      status.textContent =
        '색인을 불러오지 못했습니다. 연결을 확인한 뒤 페이지를 다시 읽어 주세요. 저장된 진도는 유지됩니다.';
      content.replaceChildren(
        status,
        createButton(document, { label: '페이지 다시 읽기', onClick: () => document.defaultView?.location.reload() })
      );
    }
  }
  details.addEventListener('toggle', () => {
    if (disposed) return;
    if (details.open && !index) void load();
    else if (!details.open) controller?.abort();
  });
  return {
    element: root,
    dispose() {
      disposed = true;
      controller?.abort();
    }
  };
}
