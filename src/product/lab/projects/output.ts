import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ResearchProjectBundle } from '../../provenance/contracts';
import type { ProjectEditorContext } from './context';

export function renderProjectRunList(document: Document, list: HTMLElement, bundle: ResearchProjectBundle | undefined) {
  list.replaceChildren();
  if (!bundle?.project.runs.length)
    list.append(element(document, 'p', 'lab-empty', '보존된 run이 없습니다. 실행을 멈춘 뒤 현재 기록을 보존하세요.'));
  for (const run of bundle?.project.runs ?? []) {
    const article = element(document, 'article', 'project-entry');
    article.dataset.runId = run.id;
    article.append(
      element(document, 'h4', '', run.label),
      element(
        document,
        'p',
        'lab-muted',
        `${run.id} · 세션 ${bundle!.project.sessions.find((session) => session.id === run.sessionId)?.title ?? run.sessionId} · ${run.status} · ${run.createdAt}`
      ),
      element(
        document,
        'p',
        '',
        `${run.experiment?.systemId ?? '외부/legacy 입력'} · artifact ${run.artifactIds.length}개. ${run.note}`
      )
    );
    list.append(article);
  }
}

export function renderProjectArtifactList(document: Document, list: HTMLElement, context: ProjectEditorContext) {
  list.replaceChildren();
  const bundle = context.get();
  if (!bundle?.project.artifacts.length)
    list.append(
      element(document, 'p', 'lab-empty', '아직 원본 artifact가 없습니다. run을 보존하거나 결과 JSON을 첨부하세요.')
    );
  for (const artifact of bundle?.project.artifacts ?? []) {
    const article = element(document, 'article', 'project-entry');
    article.dataset.artifactId = artifact.id;
    article.append(
      element(document, 'h4', '', artifact.filename),
      element(document, 'p', 'project-artifact-id', artifact.id),
      element(
        document,
        'p',
        'lab-muted',
        `run ${artifact.runId} · ${artifact.kind} · ${artifact.schema} · ${artifact.status} · ${artifact.bytes} bytes`
      ),
      element(document, 'p', 'project-checksum', `SHA-256 ${artifact.sha256}`)
    );
    if (artifact.note) article.append(element(document, 'p', 'lab-preview-note', artifact.note));
    if (artifact.parentIds.length)
      article.append(element(document, 'p', 'lab-muted', `부모 artifact: ${artifact.parentIds.join(', ')}`));
    if (artifact.nativeInputRunId)
      article.append(
        element(
          document,
          'p',
          'lab-muted',
          `결과 파일이 선언한 native input run: ${artifact.nativeInputRunId}. 프로젝트 run ID와 별도로 보존합니다.`
        )
      );
    const file = bundle!.files.find((entry) => entry.path === artifact.path);
    if (artifact.status === 'present' && file) {
      const button = createButton(document, {
        label: '원본 다운로드',
        variant: 'secondary',
        onClick() {
          context.download(file.data, artifact.filename, 'application/octet-stream');
        }
      });
      button.setAttribute('aria-label', `${artifact.filename} 원본 다운로드`);
      article.append(button);
    } else
      article.append(
        element(
          document,
          'p',
          'lab-preview-note',
          `누락 artifact: ${artifact.note || '파일이 없습니다.'} 재현 가능한 전체 결과로 간주하지 마세요.`
        )
      );
    list.append(article);
  }
}

export function renderProjectPreview(document: Document, list: HTMLElement, bundle: ResearchProjectBundle | undefined) {
  list.replaceChildren();
  if (!bundle) return;
  const project = bundle.project;
  list.append(
    element(document, 'h3', '', `가져오기 미리보기 · ${project.title}`),
    element(document, 'p', '', project.description),
    element(
      document,
      'p',
      'lab-muted',
      `세션 ${project.sessions.length} · run ${project.runs.length} · artifact ${project.artifacts.length} · 노트북 ${project.notebook.length} · 그림 ${project.figures.length} · 누락 ${project.artifacts.filter((artifact) => artifact.status === 'missing').length}`
    ),
    element(
      document,
      'p',
      'lab-muted',
      '원본 파일별 SHA-256과 계층 참조를 검증했습니다. 현재 프로젝트는 채택 전까지 유지합니다. 무결성 검사는 출처 진위나 과학적 정확성을 인증하지 않습니다. 외부 HTML·SVG를 실행하지 않습니다.'
    )
  );
  for (const warning of project.warnings) list.append(element(document, 'p', 'lab-preview-note', warning));
}
