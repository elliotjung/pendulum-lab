import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import { PROJECT_LIMITS } from '../../provenance/contracts';
import { addResearchSession } from '../../provenance/project';
import { projectArea, projectGroup, projectSelect, projectText, requiredText, selectEntries } from './controls';
import { projectItemId, type ProjectEditorContext } from './context';

export function createProjectEditor(document: Document, context: ProjectEditorContext) {
  const root = element(document, 'div', 'project-editor');
  const sessions = projectGroup(document, root, '세션과 run');
  const sessionTitle = projectText(document, sessions.fields, 'session-title', '새 세션 이름', '추가 탐구');
  const addSession = createButton(document, {
    label: '세션 추가',
    variant: 'secondary',
    onClick() {
      try {
        const bundle = context.get();
        if (!bundle) throw new Error('먼저 연구 프로젝트를 만드세요.');
        const next = addResearchSession(bundle, { title: requiredText(sessionTitle, 160) });
        context.change(() => next.project, '새 세션을 추가했습니다. 기록할 세션을 선택하세요.');
        sessionSelect.value = next.project.sessions.at(-1)!.id;
      } catch (cause) {
        context.fail(cause);
      }
    }
  });
  sessions.fields.append(addSession);
  const sessionSelect = projectSelect(document, sessions.fields, 'session-select', '기록할 세션');
  const runLabel = projectText(document, sessions.fields, 'run-label', 'run 이름', '현재 실험 기록');
  const runSelect = projectSelect(document, sessions.fields, 'run-select', 'artifact를 첨부할 run');

  const notebook = projectGroup(document, root, '노트북 narrative');
  const existing = projectSelect(document, notebook.fields, 'notebook-cell', '편집할 노트북 문단');
  const title = projectText(document, notebook.fields, 'notebook-title', '노트북 문단 제목', '관찰과 해석');
  const text = projectArea(document, notebook.fields, 'notebook-text', '노트북 본문');
  const refs = projectText(
    document,
    notebook.fields,
    'notebook-refs',
    '문단의 artifact ID · 쉼표로 구분',
    '',
    '아래 원본 artifact 목록에서 ID를 복사하세요. 빈 칸이면 출처 없는 일반 narrative로 저장합니다.'
  );
  const loadCell = () => {
    const cell = context.get()?.project.notebook.find((item) => item.id === existing.value);
    title.value = cell?.title ?? '관찰과 해석';
    text.value = cell?.text ?? '';
    refs.value = cell?.artifactIds.join(', ') ?? '';
  };
  existing.addEventListener('change', loadCell);
  const saveCell = createButton(document, {
    label: '노트북 문단 저장',
    variant: 'secondary',
    onClick() {
      try {
        const cell = {
          id: existing.value || projectItemId('narrative'),
          title: requiredText(title, 160),
          text: text.value,
          artifactIds: refs.value
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        };
        context.change((project) => {
          const found = project.notebook.some((item) => item.id === cell.id);
          if (!found && project.notebook.length >= PROJECT_LIMITS.notebook)
            throw new Error('노트북은 최대 128문단입니다.');
          return {
            ...project,
            notebook: found
              ? project.notebook.map((item) => (item.id === cell.id ? cell : item))
              : [...project.notebook, cell]
          };
        }, '노트북 문단과 artifact 참조를 저장했습니다.');
        existing.value = cell.id;
      } catch (cause) {
        context.fail(cause);
      }
    }
  });
  const newCell = createButton(document, {
    label: '새 노트북 문단 편집',
    variant: 'secondary',
    onClick() {
      existing.value = '';
      loadCell();
      title.focus();
    }
  });
  notebook.fields.append(saveCell, newCell);
  const narrativeList = element(document, 'div', 'project-notebook-list');
  narrativeList.id = 'project-notebook-list';
  notebook.element.append(narrativeList);

  const citations = projectGroup(document, root, '참고문헌과 출처');
  const citationText = projectArea(document, citations.fields, 'citation-text', '참고문헌 서지 정보');
  const citationUrl = projectText(
    document,
    citations.fields,
    'citation-url',
    '참고문헌 URL · 선택',
    '',
    'http 또는 https URL만 저장합니다.'
  );
  const addCitation = createButton(document, {
    label: '참고문헌 추가',
    variant: 'secondary',
    onClick() {
      try {
        const entry = {
          id: projectItemId('citation'),
          text: requiredText(citationText, 4000),
          url: citationUrl.value.trim()
        };
        context.change(
          (project) => ({ ...project, citations: [...project.citations, entry] }),
          '참고문헌을 추가했습니다. 출처 대조나 사람의 검토 완료를 뜻하지 않습니다.'
        );
        citationText.value = '';
        citationUrl.value = '';
      } catch (cause) {
        context.fail(cause);
      }
    }
  });
  citations.fields.append(addCitation);
  const citationList = element(document, 'ul', 'project-citation-list');
  citationList.id = 'project-citation-list';
  citations.element.append(citationList);

  function update() {
    const project = context.get()?.project;
    selectEntries(
      document,
      sessionSelect,
      project?.sessions.map((session) => [session.id, session.title] as const) ?? [],
      '먼저 프로젝트를 만드세요'
    );
    selectEntries(
      document,
      runSelect,
      project?.runs.map((run) => [run.id, `${run.label} · ${run.id}`] as const) ?? [],
      '보존된 run이 없습니다'
    );
    selectEntries(
      document,
      existing,
      [['', '새 문단'], ...(project?.notebook.map((cell) => [cell.id, cell.title] as const) ?? [])],
      '새 문단'
    );
    narrativeList.replaceChildren();
    if (!project?.notebook.length)
      narrativeList.append(
        element(document, 'p', 'lab-empty', '노트북 문단이 없습니다. 연구 질문과 관찰을 기록하세요.')
      );
    for (const cell of project?.notebook ?? []) {
      const article = element(document, 'article', 'project-entry');
      article.append(
        element(document, 'h4', '', cell.title),
        element(document, 'p', 'project-narrative', cell.text),
        element(document, 'p', 'lab-muted', `출처 artifact: ${cell.artifactIds.join(', ') || '없음'}`)
      );
      narrativeList.append(article);
    }
    citationList.replaceChildren();
    for (const citation of project?.citations ?? [])
      citationList.append(element(document, 'li', '', `${citation.text}${citation.url ? ` · ${citation.url}` : ''}`));
  }
  return {
    element: root,
    sessionSelect,
    runSelect,
    runLabel,
    update,
    reset() {
      existing.value = '';
      loadCell();
    }
  };
}
